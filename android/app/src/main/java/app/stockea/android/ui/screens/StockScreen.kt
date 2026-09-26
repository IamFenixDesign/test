package app.stockea.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Badge
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.stockea.android.data.StockItem
import app.stockea.android.data.money
import app.stockea.android.data.qtyLabel

@Composable
fun StockScreen(
    items: List<StockItem>,
    cartCount: Int,
    contentPadding: PaddingValues,
    isInCart: (String) -> Boolean,
    onOpenCart: () -> Unit,
    onBump: (String, Double) -> Unit,
    onToggleCart: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val visible = remember(items, query) {
        val q = query.trim()
        if (q.isEmpty()) items
        else items.filter { item ->
            item.name.contains(q, ignoreCase = true) ||
                item.barcode.contains(q, ignoreCase = true)
        }
    }
    val grouped = remember(visible) {
        visible.groupBy { it.category.ifBlank { "Otros" } }.toSortedMap()
    }
    val alerts = items.count { it.isLowStock }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 16.dp,
            end = 16.dp,
            top = contentPadding.calculateTopPadding() + 8.dp,
            bottom = contentPadding.calculateBottomPadding() + 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Stockea",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                Box {
                    IconButton(onClick = onOpenCart) {
                        Icon(
                            Icons.Outlined.ShoppingCart,
                            contentDescription = "Abrir carrito",
                            tint = if (cartCount > 0) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurface
                            },
                        )
                    }
                    if (cartCount > 0) {
                        Badge(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .offset(x = (-2).dp, y = 6.dp),
                        ) {
                            Text("$cartCount", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(20.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Alertas", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        "$alerts",
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        "${items.count { it.quantity <= 0 }} sin stock",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (items.isNotEmpty()) {
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Buscar por nombre o EAN") },
                    leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                )
            }
        }

        if (items.isEmpty()) {
            item {
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        "Todavía no hay productos. Tocá + Nuevo o buscá en Comparar.",
                        modifier = Modifier.padding(20.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else if (visible.isEmpty()) {
            item {
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        "Ningún producto coincide con la búsqueda.",
                        modifier = Modifier.padding(20.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        grouped.forEach { (category, rows) ->
            item {
                Text(
                    category,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            items(rows, key = { it.id }) { item ->
                StockItemCard(
                    item = item,
                    inCart = isInCart(item.id),
                    onBump = onBump,
                    onToggleCart = onToggleCart,
                    onDelete = onDelete,
                )
            }
        }
    }
}

@Composable
private fun StockItemCard(
    item: StockItem,
    inCart: Boolean,
    onBump: (String, Double) -> Unit,
    onToggleCart: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    val step = if (item.qtyUnit == "kg") 0.1 else 1.0
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(item.name, fontWeight = FontWeight.SemiBold)
                    if (item.barcode.isNotBlank()) {
                        Text(
                            item.barcode,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
                if (item.isLowStock) {
                    AssistChip(onClick = {}, label = { Text("Stock bajo") })
                }
            }
            Text(money(item.price), fontWeight = FontWeight.Bold)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                IconButton(onClick = { onBump(item.id, -step) }) {
                    Icon(Icons.Outlined.Remove, null)
                }
                Text(
                    qtyLabel(item),
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 8.dp),
                )
                IconButton(onClick = { onBump(item.id, step) }) {
                    Icon(Icons.Outlined.Add, null)
                }
                Spacer(modifier = Modifier.weight(1f))
                IconButton(onClick = { onToggleCart(item.id) }) {
                    Icon(
                        Icons.Outlined.ShoppingCart,
                        contentDescription = "Carrito",
                        tint = if (inCart) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
                IconButton(onClick = { onDelete(item.id) }) {
                    Icon(
                        Icons.Outlined.Delete,
                        contentDescription = "Borrar",
                        tint = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}
