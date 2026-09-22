package app.stockea.android

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.stockea.android.data.AuthResult
import app.stockea.android.data.CompareRow
import app.stockea.android.data.StockItem
import app.stockea.android.data.StockeaApi
import app.stockea.android.data.User
import app.stockea.android.data.normalizeQty
import app.stockea.android.ui.screens.NewItemDraft
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

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
    val newItemLookupBusy: Boolean = false,
    val newItemLookupHint: String = "",
    val newItemLookupMatch: CompareRow? = null,
)

class StockeaViewModel(app: Application) : AndroidViewModel(app) {
    private val api = StockeaApi(app.applicationContext)
    private val prefs = app.getSharedPreferences("stockea_prefs", Context.MODE_PRIVATE)
    private val _state = MutableStateFlow(
        UiState(darkTheme = prefs.getBoolean("dark_theme", true)),
    )
    val state: StateFlow<UiState> = _state.asStateFlow()

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
        _state.update {
            it.copy(
                tab = tab,
                error = "",
                info = "",
                showNewItem = false,
                showCart = false,
                showScanner = false,
                scannedEan = null,
                newItemLookupBusy = false,
                newItemLookupHint = "",
                newItemLookupMatch = null,
            )
        }
        if (tab == MainTab.Stock) {
            refreshItems()
        }
    }

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
                newItemLookupBusy = false,
                newItemLookupHint = "",
                newItemLookupMatch = null,
            )
        }
    }

    fun closeNewItem() {
        _state.update {
            it.copy(
                showNewItem = false,
                showScanner = false,
                scannedEan = null,
                newItemLookupBusy = false,
                newItemLookupHint = "",
                newItemLookupMatch = null,
            )
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

    fun clearNewItemLookup() {
        _state.update {
            it.copy(newItemLookupMatch = null, newItemLookupHint = "", newItemLookupBusy = false)
        }
    }

    fun lookupNewItemBarcode(query: String) {
        val q = query.trim()
        if (q.length < 2) return
        viewModelScope.launch {
            _state.update {
                it.copy(newItemLookupBusy = true, newItemLookupHint = "", newItemLookupMatch = null)
            }
            try {
                val rows = withContext(Dispatchers.IO) { api.searchSupers(q, limit = 24) }
                val exact = rows.firstOrNull { it.barcode.isNotBlank() && it.barcode == q }
                val match = exact ?: rows.firstOrNull()
                _state.update {
                    it.copy(
                        newItemLookupBusy = false,
                        newItemLookupMatch = match,
                        newItemLookupHint = when {
                            match != null && exact != null -> "Producto encontrado en supers."
                            match != null -> "Resultado cercano · podés usarlo o editar."
                            else -> "No está en Coto, Carrefour ni Día. Cargá nombre y precio a mano."
                        },
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        newItemLookupBusy = false,
                        newItemLookupMatch = null,
                        newItemLookupHint = e.message
                            ?: "No se pudieron consultar los supers. Cargá a mano.",
                    )
                }
            }
        }
    }

    fun createItem(draft: NewItemDraft) {
        val unit = if (draft.qtyUnit == "kg") "kg" else "unit"
        val item = StockItem(
            id = UUID.randomUUID().toString(),
            name = draft.name.trim(),
            barcode = draft.barcode.trim(),
            category = draft.category.trim().ifBlank { "Alimentos" },
            quantity = normalizeQty(draft.quantity.coerceAtLeast(0.0), unit),
            minStock = normalizeQty(draft.minStock.coerceAtLeast(0.0), unit),
            qtyUnit = unit,
            price = draft.price.coerceAtLeast(0.0),
            priceSource = draft.priceSource,
            priceCoto = draft.priceCoto,
            priceCarrefour = draft.priceCarrefour,
            priceDia = draft.priceDia,
            listPriceCoto = draft.listPriceCoto,
            listPriceCarrefour = draft.listPriceCarrefour,
            listPriceDia = draft.listPriceDia,
            image = draft.image,
        )
        if (item.name.isBlank()) {
            _state.update { it.copy(error = "Poné un nombre") }
            return
        }
        replaceItem(item, persist = true, prepend = true)
        _state.update {
            it.copy(
                showNewItem = false,
                showScanner = false,
                scannedEan = null,
                newItemLookupBusy = false,
                newItemLookupHint = "",
                newItemLookupMatch = null,
                info = "Producto agregado",
                tab = MainTab.Stock,
            )
        }
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
                        _state.update {
                            it.copy(
                                busy = false,
                                user = result.user,
                                items = items,
                                cartRemoved = emptySet(),
                                tab = MainTab.Stock,
                            )
                        }
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
                _state.update {
                    it.copy(
                        busy = false,
                        user = user,
                        items = items,
                        cartRemoved = emptySet(),
                        tab = MainTab.Stock,
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, error = e.message ?: "Código inválido") }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
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
        if (q.length < 2) {
            _state.update { it.copy(compareBusy = false) }
            return
        }
        viewModelScope.launch {
            try {
                val rows = withContext(Dispatchers.IO) { api.searchSupers(q) }
                _state.update {
                    it.copy(
                        compareBusy = false,
                        compareResults = rows,
                        error = if (rows.isEmpty()) "No hay productos web para esa búsqueda." else "",
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        compareBusy = false,
                        error = e.message ?: "No se pudieron consultar Coto, Carrefour y Día.",
                    )
                }
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
