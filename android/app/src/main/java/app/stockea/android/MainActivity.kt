package app.stockea.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Balance
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.stockea.android.ui.screens.BarcodeScannerScreen
import app.stockea.android.ui.screens.CartScreen
import app.stockea.android.ui.screens.CompareScreen
import app.stockea.android.ui.screens.LoginScreen
import app.stockea.android.ui.screens.NewItemSheet
import app.stockea.android.ui.screens.ProfileScreen
import app.stockea.android.ui.screens.StockScreen
import app.stockea.android.ui.theme.StockeaTheme

class MainActivity : ComponentActivity() {
    private val viewModel: StockeaViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val state by viewModel.state.collectAsState()
            StockeaTheme(darkTheme = state.darkTheme) {
                StockeaRoot(viewModel)
            }
        }
    }
}

@Composable
private fun StockeaRoot(vm: StockeaViewModel) {
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.info, state.error) {
        val msg = when {
            state.info.isNotBlank() -> state.info
            state.error.isNotBlank() && !state.error.startsWith("needs_verify:") -> state.error
            else -> null
        }
        if (msg != null) {
            snackbar.showSnackbar(msg)
            vm.clearMessages()
        }
    }

    when {
        state.booting -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        }

        state.user == null -> {
            LoginScreen(
                busy = state.busy,
                error = state.error,
                info = state.info,
                darkTheme = state.darkTheme,
                onToggleTheme = vm::toggleTheme,
                onLogin = vm::login,
                onRegister = vm::register,
                onVerify = vm::verify,
            )
        }

        else -> {
            val user = state.user
            val cartCount = state.cartItems().size

            Scaffold(
                snackbarHost = { SnackbarHost(snackbar) },
                bottomBar = {
                    NavigationBar {
                        NavigationBarItem(
                            selected = state.tab == MainTab.Stock && !state.showNewItem,
                            onClick = { vm.setTab(MainTab.Stock) },
                            icon = { Icon(Icons.Outlined.Inventory2, contentDescription = null) },
                            label = { Text("Stock") },
                        )
                        NavigationBarItem(
                            selected = state.tab == MainTab.Compare,
                            onClick = { vm.setTab(MainTab.Compare) },
                            icon = { Icon(Icons.Outlined.Balance, contentDescription = null) },
                            label = { Text("Comparar") },
                        )
                        NavigationBarItem(
                            selected = false,
                            onClick = vm::openNewItem,
                            icon = {
                                Box(
                                    modifier = Modifier
                                        .size(48.dp)
                                        .background(MaterialTheme.colorScheme.primary, CircleShape),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        Icons.Outlined.Add,
                                        contentDescription = "Nuevo ítem",
                                        tint = MaterialTheme.colorScheme.onPrimary,
                                    )
                                }
                            },
                            label = { Text("Nuevo") },
                        )
                        NavigationBarItem(
                            selected = state.tab == MainTab.Cart,
                            onClick = { vm.setTab(MainTab.Cart) },
                            icon = {
                                BadgedBox(badge = {
                                    if (cartCount > 0) {
                                        Badge { Text("$cartCount", fontWeight = FontWeight.Bold) }
                                    }
                                }) {
                                    Icon(Icons.Outlined.ShoppingCart, contentDescription = null)
                                }
                            },
                            label = { Text("Carrito") },
                        )
                        NavigationBarItem(
                            selected = state.tab == MainTab.Profile,
                            onClick = { vm.setTab(MainTab.Profile) },
                            icon = { Icon(Icons.Outlined.Person, contentDescription = null) },
                            label = { Text("Perfil") },
                        )
                    }
                },
            ) { padding ->
                when (state.tab) {
                    MainTab.Stock -> StockScreen(
                        items = state.items,
                        contentPadding = padding,
                        isInCart = { id -> state.isInCart(id) },
                        onBump = vm::bumpQty,
                        onToggleCart = vm::toggleCart,
                        onDelete = vm::deleteItem,
                    )
                    MainTab.Compare -> CompareScreen(
                        query = state.compareQuery,
                        results = state.compareResults,
                        busy = state.compareBusy,
                        contentPadding = padding,
                        onSearch = vm::searchCompare,
                        onAdd = vm::addFromCompare,
                    )
                    MainTab.Cart -> CartScreen(
                        items = state.cartItems(),
                        contentPadding = padding,
                        onMarkBought = vm::markCartBought,
                        onRemove = vm::toggleCart,
                    )
                    MainTab.Profile -> ProfileScreen(
                        user = user!!,
                        busy = state.busy,
                        info = state.info,
                        error = state.error,
                        darkTheme = state.darkTheme,
                        contentPadding = padding,
                        onSave = vm::saveProfile,
                        onToggleTheme = vm::toggleTheme,
                        onLogout = vm::logout,
                    )
                }

                if (state.showNewItem && !state.showScanner) {
                    NewItemSheet(
                        lookupBusy = state.newItemLookupBusy,
                        lookupHint = state.newItemLookupHint,
                        lookupMatch = state.newItemLookupMatch,
                        onDismiss = vm::closeNewItem,
                        onLookupBarcode = vm::lookupNewItemBarcode,
                        onClearLookup = vm::clearNewItemLookup,
                        onCreate = vm::createItem,
                        onOpenScanner = vm::openScanner,
                        scannedEan = state.scannedEan,
                        onConsumeScannedEan = vm::consumeScannedEan,
                    )
                }

                if (state.showScanner) {
                    BarcodeScannerScreen(
                        onDetect = vm::onScannedEan,
                        onCancel = vm::closeScanner,
                    )
                }
            }
        }
    }
}
