package app.stockea.android

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.stockea.android.data.ApiException
import app.stockea.android.data.AuthResult
import app.stockea.android.data.CompareRow
import app.stockea.android.data.StockItem
import app.stockea.android.data.StockeaApi
import app.stockea.android.data.User
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

enum class MainTab { Stock, Compare, Cart, Profile }

data class UiState(
    val booting: Boolean = true,
    val darkTheme: Boolean = true,
    val user: User? = null,
    val items: List<StockItem> = emptyList(),
    val tab: MainTab = MainTab.Stock,
    val busy: Boolean = false,
    val error: String = "",
    val info: String = "",
    val compareQuery: String = "",
    val compareResults: List<CompareRow> = emptyList(),
    val compareBusy: Boolean = false,
)

class StockeaViewModel(app: Application) : AndroidViewModel(app) {
    private val api = StockeaApi(app.applicationContext)
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        viewModelScope.launch { boot() }
    }

    private suspend fun boot() {
        val user = withContext(Dispatchers.IO) { runCatching { api.me() }.getOrNull() }
        if (user != null) {
            val items = withContext(Dispatchers.IO) { runCatching { api.fetchItems() }.getOrElse { emptyList() } }
            _state.update { it.copy(booting = false, user = user, items = items) }
        } else {
            _state.update { it.copy(booting = false, user = null) }
        }
    }

    fun toggleTheme() {
        _state.update { it.copy(darkTheme = !it.darkTheme) }
    }

    fun setTab(tab: MainTab) {
        _state.update { it.copy(tab = tab, error = "", info = "") }
    }

    fun clearMessages() {
        _state.update { it.copy(error = "", info = "") }
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
                        _state.update { it.copy(busy = false, user = result.user, items = items, tab = MainTab.Stock) }
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
                val pending = withContext(Dispatchers.IO) { api.register(firstName, lastName, email, password) }
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
                _state.update { it.copy(busy = false, user = user, items = items, tab = MainTab.Stock) }
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, error = e.message ?: "Código inválido") }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { api.logout() }
            _state.update { UiState(booting = false, darkTheme = it.darkTheme) }
        }
    }

    fun refreshItems() {
        viewModelScope.launch {
            try {
                val items = withContext(Dispatchers.IO) { api.fetchItems() }
                _state.update { it.copy(items = items) }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message ?: "No se pudo cargar el stock") }
            }
        }
    }

    fun bumpQty(id: String, delta: Double) {
        val current = _state.value.items.find { it.id == id } ?: return
        val nextQty = (current.quantity + delta).coerceAtLeast(0.0)
        val updated = current.copy(quantity = nextQty)
        replaceItem(updated, persist = true)
    }

    fun toggleCart(id: String) {
        val current = _state.value.items.find { it.id == id } ?: return
        val updated = if (current.inCart) {
            current.copy(inCart = false, cartQty = 0.0)
        } else {
            val need = (current.minStock - current.quantity).coerceAtLeast(1.0)
            current.copy(inCart = true, cartQty = need)
        }
        replaceItem(updated, persist = true)
    }

    fun deleteItem(id: String) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { api.deleteItem(id) }
                _state.update { it.copy(items = it.items.filterNot { item -> item.id == id }) }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message ?: "No se pudo borrar") }
            }
        }
    }

    fun addFromCompare(row: CompareRow) {
        val existing = _state.value.items.find { it.barcode.isNotBlank() && it.barcode == row.barcode }
        if (existing != null) {
            _state.update { it.copy(info = "Ya está en tu stock", tab = MainTab.Stock) }
            return
        }
        val cheaper = listOf(row.priceCoto, row.priceCarrefour, row.priceDia).filter { it > 0 }.minOrNull() ?: 0.0
        val source = when (cheaper) {
            row.priceCoto -> "coto"
            row.priceCarrefour -> "carrefour"
            row.priceDia -> "dia"
            else -> ""
        }
        val item = StockItem(
            id = UUID.randomUUID().toString(),
            name = row.name,
            barcode = row.barcode,
            category = row.category.ifBlank { "Alimentos" },
            quantity = 0.0,
            minStock = if (row.qtyUnit == "kg") 0.5 else 1.0,
            qtyUnit = row.qtyUnit,
            price = cheaper,
            priceSource = source,
            priceCoto = row.priceCoto,
            priceCarrefour = row.priceCarrefour,
            priceDia = row.priceDia,
            listPriceCoto = row.listPriceCoto,
            listPriceCarrefour = row.listPriceCarrefour,
            listPriceDia = row.listPriceDia,
            inCart = true,
            cartQty = if (row.qtyUnit == "kg") 0.5 else 1.0,
        )
        replaceItem(item, persist = true, prepend = true)
        _state.update { it.copy(info = "Agregado al stock y carrito", tab = MainTab.Stock) }
    }

    private fun replaceItem(item: StockItem, persist: Boolean, prepend: Boolean = false) {
        _state.update { state ->
            val without = state.items.filterNot { it.id == item.id }
            val next = if (prepend) listOf(item) + without else {
                val idx = state.items.indexOfFirst { it.id == item.id }
                if (idx < 0) without + item
                else state.items.toMutableList().also { it[idx] = item }
            }
            state.copy(items = next)
        }
        if (persist) {
            viewModelScope.launch {
                runCatching { withContext(Dispatchers.IO) { api.upsertItem(item) } }
                    .onFailure { e ->
                        _state.update { it.copy(error = e.message ?: "No se pudo guardar") }
                    }
            }
        }
    }

    fun searchCompare(query: String) {
        val q = query.trim()
        _state.update { it.copy(compareQuery = q, compareBusy = true, error = "", compareResults = emptyList()) }
        if (q.length < 2) {
            _state.update { it.copy(compareBusy = false) }
            return
        }
        viewModelScope.launch {
            try {
                val rows = withContext(Dispatchers.IO) { api.searchSupers(q) }
                _state.update { it.copy(compareBusy = false, compareResults = rows) }
            } catch (e: Exception) {
                _state.update { it.copy(compareBusy = false, error = e.message ?: "Sin resultados") }
            }
        }
    }

    fun saveProfile(firstName: String, lastName: String, email: String) {
        viewModelScope.launch {
            _state.update { it.copy(busy = true, error = "", info = "") }
            try {
                val user = withContext(Dispatchers.IO) { api.updateProfile(firstName, lastName, email) }
                _state.update { it.copy(busy = false, user = user, info = "Perfil guardado") }
            } catch (e: Exception) {
                _state.update { it.copy(busy = false, error = e.message ?: "No se pudo guardar") }
            }
        }
    }

    fun markCartBought() {
        val cart = _state.value.items.filter { it.inCart }
        cart.forEach { item ->
            val updated = item.copy(
                quantity = item.quantity + item.cartQty,
                inCart = false,
                cartQty = 0.0,
            )
            replaceItem(updated, persist = true)
        }
        _state.update { it.copy(info = "Marcados como comprados", tab = MainTab.Stock) }
    }
}
