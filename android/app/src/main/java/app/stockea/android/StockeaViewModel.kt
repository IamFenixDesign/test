package app.stockea.android

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.stockea.android.data.AuthResult
import app.stockea.android.data.CompareRow
import app.stockea.android.data.StockItem
import app.stockea.android.data.StockeaApi
import app.stockea.android.data.StoreProduct
import app.stockea.android.data.StoreSearchResults
import app.stockea.android.data.User
import app.stockea.android.data.extractEan13
import app.stockea.android.data.kgFromGrams
import app.stockea.android.data.listPriceOfProduct
import app.stockea.android.data.normalizeQty
import app.stockea.android.data.qtyUnitOfProduct
import app.stockea.android.ui.screens.NewItemDraft
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withContext
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

enum class MainTab { Stock, Compare, Profile }

data class UiState(
    val booting: Boolean = true,
    val darkTheme: Boolean = true,
    val user: User? = null,
    val items: List<StockItem> = emptyList(),
    val cartRemoved: Set<String> = emptySet(),
    val tab: MainTab = MainTab.Stock,
    val busy: Boolean = false,
    val error: String = "",
    val info: String = "",
    val compareQuery: String = "",
    val compareResults: List<CompareRow> = emptyList(),
    val compareBusy: Boolean = false,
    val showNewItem: Boolean = false,
    val showCart: Boolean = false,
    val showScanner: Boolean = false,
    val scannedEan: String? = null,
    val storeLookupBusy: Boolean = false,
    val storeLookupError: String = "",
    val storeResults: StoreSearchResults = StoreSearchResults(),
    val storeTab: String = "coto",
    val allowCustomPrice: Boolean = false,
)

class StockeaViewModel(app: Application) : AndroidViewModel(app) {
    private val api = StockeaApi(app.applicationContext)
    private val prefs = app.getSharedPreferences("stockea_prefs", Context.MODE_PRIVATE)
    private val _state = MutableStateFlow(
        UiState(darkTheme = prefs.getBoolean("dark_theme", true)),
    )
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val priceRefreshAt = ConcurrentHashMap<String, Long>()
    private val priceRefreshMutex = Mutex()
    private var priceRefreshJob: Job? = null
    private var comparePollJob: Job? = null

    init {
        viewModelScope.launch { boot() }
    }

    private suspend fun boot() {
        val user = withContext(Dispatchers.IO) { runCatching { api.me() }.getOrNull() }
        if (user != null) {
            val items = withContext(Dispatchers.IO) {
                runCatching { api.fetchItems() }.getOrElse { emptyList() }
            }
            _state.update {
                it.copy(
                    booting = false,
                    user = user,
                    items = items,
                    cartRemoved = pruneCartRemoved(it.cartRemoved, items),
                )
            }
            startPriceRefreshLoop()
        } else {
            _state.update { it.copy(booting = false, user = null) }
        }
    }

    fun toggleTheme() {
        _state.update {
            val next = !it.darkTheme
            prefs.edit().putBoolean("dark_theme", next).apply()
            it.copy(darkTheme = next)
        }
    }

    fun setTab(tab: MainTab) {
        if (tab != MainTab.Compare) {
            comparePollJob?.cancel()
            comparePollJob = null
        }
        _state.update {
            it.copy(
                tab = tab,
                error = "",
                info = "",
                showNewItem = false,
                showCart = false,
                showScanner = false,
                scannedEan = null,
            ).clearedStoreLookup()
        }
        if (tab == MainTab.Stock) {
            refreshItems()
        }
        if (tab == MainTab.Compare) {
            val q = _state.value.compareQuery.trim()
            if (q.length >= 2) startComparePoll(q, showSpinner = false)
        }
    }

    private fun UiState.clearedStoreLookup() = copy(
        storeLookupBusy = false,
        storeLookupError = "",
        storeResults = StoreSearchResults(),
        storeTab = "coto",
        allowCustomPrice = false,
    )

    fun clearMessages() {
        _state.update { it.copy(error = "", info = "") }
    }

    fun openNewItem() {
        _state.update {
            it.copy(
                showNewItem = true,
                showCart = false,
                tab = MainTab.Stock,
                showScanner = false,
                scannedEan = null,
                error = "",
            ).clearedStoreLookup()
        }
    }

    fun closeNewItem() {
        _state.update {
            it.copy(
                showNewItem = false,
                showScanner = false,
                scannedEan = null,
            ).clearedStoreLookup()
        }
    }

    fun openCart() {
        refreshItems()
        _state.update {
            it.copy(
                showCart = true,
                showNewItem = false,
                showScanner = false,
                tab = MainTab.Stock,
            )
        }
    }

    fun closeCart() {
        _state.update { it.copy(showCart = false) }
    }

    fun openScanner() {
        _state.update { it.copy(showScanner = true) }
    }

    fun closeScanner() {
        _state.update { it.copy(showScanner = false) }
    }

    fun onScannedEan(ean: String) {
        _state.update {
            it.copy(
                showScanner = false,
                scannedEan = ean,
                showNewItem = true,
                info = "EAN $ean cargado · buscando…",
            )
        }
    }

    fun consumeScannedEan() {
        _state.update { it.copy(scannedEan = null) }
    }

    fun clearStoreLookup() {
        _state.update { it.clearedStoreLookup() }
    }

    fun setStoreTab(tab: String) {
        _state.update { it.copy(storeTab = tab) }
    }

    fun enableCustomPrice() {
        _state.update { it.copy(allowCustomPrice = true, storeLookupError = "") }
    }

    fun lookupStores(query: String) {
        val q = query.trim()
        if (q.length < 2) {
            _state.update {
                it.copy(storeLookupError = "Escribí un producto o EAN y tocá buscar.")
            }
            return
        }
        viewModelScope.launch {
            _state.update {
                it.copy(
                    storeLookupBusy = true,
                    storeLookupError = "",
                    storeResults = StoreSearchResults(),
                    allowCustomPrice = false,
                )
            }
            try {
                val results = withContext(Dispatchers.IO) { api.searchSupersRaw(q, limit = 24) }
                _state.update {
                    if (results.isEmpty) {
                        it.copy(
                            storeLookupBusy = false,
                            storeResults = results,
                            storeTab = "coto",
                            allowCustomPrice = true,
                            storeLookupError =
                                "No está en Coto, Carrefour ni Día. Podés cargar un precio personalizado.",
                        )
                    } else {
                        it.copy(
                            storeLookupBusy = false,
                            storeResults = results,
                            storeTab = results.preferTab(),
                            allowCustomPrice = false,
                            storeLookupError = "",
                        )
                    }
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        storeLookupBusy = false,
                        storeResults = StoreSearchResults(),
                        allowCustomPrice = true,
                        storeLookupError = e.message
                            ?: "No se pudieron consultar Coto, Carrefour y Día. Podés cargar un precio personalizado.",
                    )
                }
            }
        }
    }

    fun createItem(draft: NewItemDraft): Boolean {
        val name = draft.name.trim()
        if (name.isBlank()) {
            _state.update { it.copy(error = "El nombre es obligatorio.") }
            return false
        }
        val unit = if (draft.qtyUnit == "kg") "kg" else "unit"
        if (unit == "kg" && draft.quantity > 0 && draft.quantity < 0.1) {
            _state.update { it.copy(error = "La cantidad por kilo debe ser 0,1 g o más.") }
            return false
        }
        if (unit == "kg" && draft.minStock > 0 && draft.minStock < 0.1) {
            _state.update { it.copy(error = "El stock mínimo por kilo debe ser 0,1 g o más.") }
            return false
        }
        val source = draft.priceSource
        val sourceOk =
            source == "coto" || source == "carrefour" || source == "dia" || source == "custom"
        if (!sourceOk || draft.price <= 0) {
            _state.update {
                it.copy(
                    error = if (_state.value.allowCustomPrice || source == "custom") {
                        "Ingresá un precio personalizado válido."
                    } else {
                        "Elegí un precio de Coto/Carrefour/Día o cargá uno personalizado si no está."
                    },
                )
            }
            return false
        }
        val quantity =
            if (unit == "kg") {
                normalizeQty(kgFromGrams(draft.quantity), "kg")
            } else {
                normalizeQty(draft.quantity.coerceAtLeast(0.0), "unit")
            }
        val minStock =
            if (unit == "kg") {
                normalizeQty(kgFromGrams(draft.minStock), "kg")
            } else {
                normalizeQty(draft.minStock.coerceAtLeast(0.0), "unit")
            }
        val custom = source == "custom"
        val item = StockItem(
            id = UUID.randomUUID().toString(),
            name = name,
            barcode = draft.barcode.trim(),
            category = draft.category.trim().ifBlank { "Alimentos" },
            quantity = quantity,
            minStock = minStock,
            qtyUnit = unit,
            price = draft.price.coerceAtLeast(0.0),
            priceSource = source,
            priceCoto = draft.priceCoto,
            priceCarrefour = draft.priceCarrefour,
            priceDia = draft.priceDia,
            listPriceCoto = draft.listPriceCoto,
            listPriceCarrefour = draft.listPriceCarrefour,
            listPriceDia = draft.listPriceDia,
            image = draft.image,
            urlCoto = draft.urlCoto,
            urlCarrefour = draft.urlCarrefour,
            urlDia = draft.urlDia,
            discountCoto = if (custom) "" else draft.discountCoto,
            discountCarrefour = if (custom) "" else draft.discountCarrefour,
            discountDia = if (custom) "" else draft.discountDia,
        )
        replaceItem(item, persist = true, prepend = true)
        priceRefreshAt[item.id] = System.currentTimeMillis()
        _state.update {
            it.copy(
                showNewItem = false,
                showScanner = false,
                scannedEan = null,
                info = "Producto agregado",
                tab = MainTab.Stock,
                error = "",
            ).clearedStoreLookup()
        }
        return true
    }

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = "", info = "") }
            try {
                when (val result = withContext(Dispatchers.IO) { api.login(email, password) }) {
                    is AuthResult.NeedsVerification -> {
                        _state.update {
                            it.copy(
                                busy = false,
                                info = "Confirmá tu correo: ${result.email}",
                                error = "needs_verify:${result.email}",
                            )
                        }
                    }
                    is AuthResult.Ok -> {
                        val items = withContext(Dispatchers.IO) { api.fetchItems() }
                        priceRefreshAt.clear()
                        _state.update {
                            it.copy(
                                busy = false,
                                user = result.user,
                                items = items,
                                cartRemoved = emptySet(),
                                tab = MainTab.Stock,
                            )
                        }
                        startPriceRefreshLoop()
                    }
                }
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, error = e.message ?: "Error al entrar") }
            }
        }
    }

    fun register(firstName: String, lastName: String, email: String, password: String) {
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = "", info = "") }
            try {
                val pending = withContext(Dispatchers.IO) {
                    api.register(firstName, lastName, email, password)
                }
                _state.update {
                    it.copy(
                        busy = false,
                        info = "Te enviamos un código a $pending",
                        error = "needs_verify:$pending",
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, error = e.message ?: "No se pudo registrar") }
            }
        }
    }

    fun verify(email: String, code: String) {
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = "", info = "") }
            try {
                val user = withContext(Dispatchers.IO) { api.verify(email, code) }
                val items = withContext(Dispatchers.IO) { api.fetchItems() }
                priceRefreshAt.clear()
                _state.update {
                    it.copy(
                        busy = false,
                        user = user,
                        items = items,
                        cartRemoved = emptySet(),
                        tab = MainTab.Stock,
                    )
                }
                startPriceRefreshLoop()
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, error = e.message ?: "Código inválido") }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            priceRefreshJob?.cancel()
            priceRefreshJob = null
            priceRefreshAt.clear()
            withContext(Dispatchers.IO) { api.logout() }
            _state.update {
                UiState(booting = false, darkTheme = it.darkTheme)
            }
        }
    }

    fun refreshItems() {
        viewModelScope.launch {
            try {
                val items = withContext(Dispatchers.IO) { api.fetchItems() }
                _state.update {
                    it.copy(
                        items = items,
                        cartRemoved = pruneCartRemoved(it.cartRemoved, items),
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message ?: "No se pudo cargar el stock") }
            }
        }
    }

    /** Al volver a primer plano: refrescar precios/descuentos al instante. */
    fun onAppResumed() {
        if (_state.value.user == null || _state.value.booting) return
        viewModelScope.launch { refreshStaleStorePrices() }
    }

    private fun startPriceRefreshLoop() {
        priceRefreshJob?.cancel()
        priceRefreshJob = viewModelScope.launch {
            delay(200)
            while (true) {
                if (_state.value.user != null) {
                    refreshStaleStorePrices()
                }
                delay(PRICE_REFRESH_TICK_MS)
            }
        }
    }

    private suspend fun refreshStaleStorePrices() {
        if (!priceRefreshMutex.tryLock()) return
        try {
            val now = System.currentTimeMillis()
            val stale = _state.value.items.filter { item ->
                tracksStorePrices(item) &&
                    now - (priceRefreshAt[item.id] ?: 0L) >= PRICE_REFRESH_MS
            }
            for (item in stale) {
                if (_state.value.user == null) return
                refreshStorePrices(item, silent = true)
                priceRefreshAt[item.id] = System.currentTimeMillis()
            }
        } finally {
            priceRefreshMutex.unlock()
        }
    }

    private suspend fun refreshStorePrices(item: StockItem, silent: Boolean = false) {
        if (_state.value.items.none { it.id == item.id }) return
        val code = extractEan13(item.barcode).ifBlank { item.barcode.trim() }
        try {
            val query = code.ifBlank { item.name }
            if (query.isBlank()) return
            val data = withContext(Dispatchers.IO) { api.searchSupersRaw(query, limit = 24) }
            fun pick(list: List<StoreProduct>): StoreProduct? =
                (if (code.isNotBlank()) list.firstOrNull { it.ean == code } else null)
                    ?: list.firstOrNull()

            val coto = pick(data.coto)
            val carrefour = pick(data.carrefour)
            val dia = pick(data.dia)
            if (coto == null && carrefour == null && dia == null) {
                if (!silent) {
                    _state.update {
                        it.copy(info = "No se encontraron precios en Coto, Carrefour ni Día")
                    }
                }
                return
            }
            val current = _state.value.items.find { it.id == item.id } ?: return
            val nextCoto = coto?.price ?: current.priceCoto
            val nextCarrefour = carrefour?.price ?: current.priceCarrefour
            val nextDia = dia?.price ?: current.priceDia
            val nextListCoto = coto?.let { listPriceOfProduct(it) } ?: current.listPriceCoto
            val nextListCarrefour =
                carrefour?.let { listPriceOfProduct(it) } ?: current.listPriceCarrefour
            val nextListDia = dia?.let { listPriceOfProduct(it) } ?: current.listPriceDia
            val source = current.priceSource
            val nextPrice = when {
                source == "coto" && nextCoto > 0 -> nextCoto
                source == "carrefour" && nextCarrefour > 0 -> nextCarrefour
                source == "dia" && nextDia > 0 -> nextDia
                else -> current.price
            }
            val sourceProduct = when (source) {
                "coto" -> coto
                "carrefour" -> carrefour
                "dia" -> dia
                else -> coto ?: carrefour ?: dia
            }
            val nextQtyUnit = sourceProduct?.let { qtyUnitOfProduct(it) } ?: current.qtyUnit
            val detected = coto?.ean ?: carrefour?.ean ?: dia?.ean ?: ""
            val nextImage = when (source) {
                "coto" -> coto?.image?.ifBlank { null } ?: current.image
                "carrefour" -> carrefour?.image?.ifBlank { null } ?: current.image
                "dia" -> dia?.image?.ifBlank { null } ?: current.image
                else ->
                    coto?.image?.ifBlank { null }
                        ?: carrefour?.image?.ifBlank { null }
                        ?: dia?.image?.ifBlank { null }
                        ?: current.image
            }
            val updated = current.copy(
                qtyUnit = nextQtyUnit,
                quantity = normalizeQty(current.quantity, nextQtyUnit),
                minStock = normalizeQty(current.minStock, nextQtyUnit),
                price = nextPrice,
                priceCoto = nextCoto,
                priceCarrefour = nextCarrefour,
                priceDia = nextDia,
                listPriceCoto = nextListCoto,
                listPriceCarrefour = nextListCarrefour,
                listPriceDia = nextListDia,
                urlCoto = coto?.url?.ifBlank { null } ?: current.urlCoto,
                urlCarrefour = carrefour?.url?.ifBlank { null } ?: current.urlCarrefour,
                urlDia = dia?.url?.ifBlank { null } ?: current.urlDia,
                barcode = current.barcode.ifBlank { detected },
                image = nextImage,
                discountCoto = when {
                    coto == null -> current.discountCoto
                    coto.hasDiscount -> coto.discountLabel.ifBlank { "Oferta" }
                    else -> ""
                },
                discountCarrefour = when {
                    carrefour == null -> current.discountCarrefour
                    carrefour.hasDiscount -> carrefour.discountLabel.ifBlank { "Oferta" }
                    else -> ""
                },
                discountDia = when {
                    dia == null -> current.discountDia
                    dia.hasDiscount -> dia.discountLabel.ifBlank { "Oferta" }
                    else -> ""
                },
            )
            replaceItem(updated, persist = true)
            priceRefreshAt[item.id] = System.currentTimeMillis()
            if (!silent) {
                _state.update { it.copy(info = "Precios de ${item.name} actualizados") }
            }
        } catch (_: Exception) {
            if (!silent) {
                _state.update { it.copy(info = "No se pudieron consultar los supermercados") }
            }
        }
    }

    fun bumpQty(id: String, delta: Double) {
        val current = _state.value.items.find { it.id == id } ?: return
        val nextQty = normalizeQty((current.quantity + delta).coerceAtLeast(0.0), current.qtyUnit)
        replaceItem(current.copy(quantity = nextQty), persist = true)
    }

    /** Igual que la web: el carrito es automático por stock bajo; esto solo excluye / restaura. */
    fun toggleCart(id: String) {
        val current = _state.value.items.find { it.id == id } ?: return
        if (!current.shouldAutoCart) {
            _state.update {
                it.copy(info = "Solo productos bajo el mínimo entran al carrito")
            }
            return
        }
        _state.update { state ->
            val next = state.cartRemoved.toMutableSet()
            if (id in next) next.remove(id) else next.add(id)
            state.copy(cartRemoved = next)
        }
    }

    fun deleteItem(id: String) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { api.deleteItem(id) }
                priceRefreshAt.remove(id)
                _state.update {
                    it.copy(
                        items = it.items.filterNot { item -> item.id == id },
                        cartRemoved = it.cartRemoved - id,
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message ?: "No se pudo borrar") }
            }
        }
    }

    fun addFromCompare(row: CompareRow) {
        val existing = _state.value.items.find {
            it.barcode.isNotBlank() && it.barcode == row.barcode
        }
        if (existing != null) {
            _state.update { it.copy(info = "Ya está en tu stock", tab = MainTab.Stock) }
            return
        }
        val cheaper = listOf(row.priceCoto, row.priceCarrefour, row.priceDia)
            .filter { it > 0 }
            .minOrNull() ?: 0.0
        val source = when (cheaper) {
            row.priceCoto -> "coto"
            row.priceCarrefour -> "carrefour"
            row.priceDia -> "dia"
            else -> ""
        }
        val unit = if (row.qtyUnit == "kg") "kg" else "unit"
        val item = StockItem(
            id = UUID.randomUUID().toString(),
            name = row.name,
            barcode = row.barcode,
            category = row.category.ifBlank { "Alimentos" },
            quantity = 0.0,
            minStock = if (unit == "kg") 0.5 else 1.0,
            qtyUnit = unit,
            price = cheaper,
            priceSource = source,
            priceCoto = row.priceCoto,
            priceCarrefour = row.priceCarrefour,
            priceDia = row.priceDia,
            listPriceCoto = row.listPriceCoto,
            listPriceCarrefour = row.listPriceCarrefour,
            listPriceDia = row.listPriceDia,
            image = row.image,
        )
        replaceItem(item, persist = true, prepend = true)
        _state.update {
            it.copy(
                info = "Agregado al stock (entra al carrito por stock bajo)",
                tab = MainTab.Stock,
                cartRemoved = it.cartRemoved - item.id,
            )
        }
        // Traer descuentos reales en cuanto se agrega desde comparar
        viewModelScope.launch { refreshStorePrices(item, silent = true) }
    }

    private fun replaceItem(item: StockItem, persist: Boolean, prepend: Boolean = false) {
        _state.update { state ->
            val without = state.items.filterNot { it.id == item.id }
            val next = if (prepend) {
                listOf(item) + without
            } else {
                val idx = state.items.indexOfFirst { it.id == item.id }
                if (idx < 0) without + item
                else state.items.toMutableList().also { it[idx] = item }
            }
            state.copy(
                items = next,
                cartRemoved = pruneCartRemoved(state.cartRemoved, next),
            )
        }
        if (persist) {
            viewModelScope.launch {
                runCatching { withContext(Dispatchers.IO) { api.upsertItem(item) } }
                    .onFailure { e ->
                        _state.update { it.copy(error = e.message ?: "No se pudo guardar") }
                        refreshItems()
                    }
            }
        }
    }

    fun searchCompare(query: String) {
        val q = query.trim()
        _state.update {
            it.copy(compareQuery = q, compareBusy = true, error = "", compareResults = emptyList())
        }
        comparePollJob?.cancel()
        comparePollJob = null
        if (q.length < 2) {
            _state.update { it.copy(compareBusy = false) }
            return
        }
        startComparePoll(q, showSpinner = true)
    }

    private fun startComparePoll(query: String, showSpinner: Boolean) {
        comparePollJob?.cancel()
        comparePollJob = viewModelScope.launch {
            var first = true
            while (true) {
                if (first && showSpinner) {
                    _state.update { it.copy(compareBusy = true, error = "") }
                }
                try {
                    val rows = withContext(Dispatchers.IO) { api.searchSupers(query) }
                    if (query != _state.value.compareQuery.trim()) return@launch
                    _state.update {
                        it.copy(
                            compareBusy = false,
                            compareResults = rows,
                            error = if (rows.isEmpty()) "No hay productos web para esa búsqueda." else "",
                        )
                    }
                } catch (e: Exception) {
                    if (query != _state.value.compareQuery.trim()) return@launch
                    _state.update {
                        it.copy(
                            compareBusy = false,
                            error = if (first) {
                                e.message ?: "No se pudieron consultar Coto, Carrefour y Día."
                            } else {
                                it.error
                            },
                        )
                    }
                }
                first = false
                delay(1000)
            }
        }
    }

    fun saveProfile(firstName: String, lastName: String, email: String) {
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = "", info = "") }
            try {
                val user = withContext(Dispatchers.IO) {
                    api.updateProfile(firstName, lastName, email)
                }
                _state.update { it.copy(busy = false, user = user, info = "Perfil guardado") }
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, error = e.message ?: "No se pudo guardar") }
            }
        }
    }

    fun markCartBought() {
        val removed = _state.value.cartRemoved
        val cart = _state.value.items.filter { it.shouldAutoCart && it.id !in removed }
        if (cart.isEmpty()) return
        cart.forEach { item ->
            val updated = item.copy(
                quantity = normalizeQty(item.quantity + item.neededToMin, item.qtyUnit),
            )
            replaceItem(updated, persist = true)
        }
        _state.update {
            it.copy(
                info = if (cart.size == 1) "Compra aplicada al stock" else "${cart.size} productos actualizados",
                tab = MainTab.Stock,
                showCart = false,
                cartRemoved = emptySet(),
            )
        }
    }

    companion object {
        /** Solo coalescer focus/resume duplicados; el refresh es inmediato al usar la app. */
        private const val PRICE_REFRESH_MS = 2_000L
        private const val PRICE_REFRESH_TICK_MS = 60_000L

        fun tracksStorePrices(item: StockItem): Boolean {
            val source = item.priceSource
            if (source == "coto" || source == "carrefour" || source == "dia") return true
            if (item.barcode.isNotBlank()) return true
            return item.priceCoto > 0 || item.priceCarrefour > 0 || item.priceDia > 0
        }

        fun pruneCartRemoved(removed: Set<String>, items: List<StockItem>): Set<String> {
            if (removed.isEmpty()) return emptySet()
            val byId = items.associateBy { it.id }
            return removed.filter { id ->
                val item = byId[id] ?: return@filter false
                item.shouldAutoCart
            }.toSet()
        }
    }
}

fun UiState.cartItems(): List<StockItem> =
    items.filter { it.shouldAutoCart && it.id !in cartRemoved }

fun UiState.isInCart(id: String): Boolean {
    val item = items.find { it.id == id } ?: return false
    return item.shouldAutoCart && id !in cartRemoved
}
