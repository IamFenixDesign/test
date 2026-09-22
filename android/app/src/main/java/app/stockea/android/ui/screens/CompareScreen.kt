package app.stockea.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.stockea.android.data.CompareRow
import app.stockea.android.data.money

@Composable
fun CompareScreen(
    query: String,
    results: List<CompareRow>,
    busy: Boolean,
    contentPadding: PaddingValues,
    onSearch: (String) -> Unit,
    onAdd: (CompareRow) -> Unit,
) {
    var localQuery by remember(query) { mutableStateOf(query) }

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
            Text("Comparar precios", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(10.dp))
            OutlinedTextField(
                value = localQuery,
                onValueChange = { localQuery = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Buscar en Coto, Carrefour y Día") },
                leadingIcon = { Icon(Icons.Outlined.Search, null) },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
            )
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = { onSearch(localQuery) },
                enabled = !busy && localQuery.trim().length >= 2,
                modifier = Modifier.fillMaxWidth().height(46.dp),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text(if (busy) "Buscando…" else "Buscar", fontWeight = FontWeight.Bold)
            }
        }

        if (busy) {
            item {
                Row(modifier = Modifier.fillMaxWidth().padding(24.dp), horizontalArrangement = Arrangement.Center) {
                    CircularProgressIndicator()
                }
            }
        }

        if (!busy && results.isEmpty() && query.isNotBlank()) {
            item {
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Text("Sin resultados", modifier = Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        items(results, key = { it.id + it.name }) { row ->
            CompareCard(row, onAdd)
        }
    }
}

@Composable
private fun CompareCard(row: CompareRow, onAdd: (CompareRow) -> Unit) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(row.name, fontWeight = FontWeight.SemiBold)
            if (row.barcode.isNotBlank()) {
                Text(row.barcode, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text("Coto ${money(row.priceCoto)}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Carrefour ${money(row.priceCarrefour)}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Día ${money(row.priceDia)}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Button(onClick = { onAdd(row) }, shape = RoundedCornerShape(12.dp)) {
                Text("Agregar al stock")
            }
        }
    }
}
