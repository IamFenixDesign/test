package app.stockea.android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddShoppingCart
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.SuggestionChipDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.stockea.android.data.CompareRow
import app.stockea.android.data.money

private val CotoColor = Color(0xFFE45A62)
private val CarrefourColor = Color(0xFF5B9DE8)
private val DiaColor = Color(0xFF7AC143)

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
    val canSearch = localQuery.trim().length >= 2

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 16.dp,
            end = 16.dp,
            top = contentPadding.calculateTopPadding() + 8.dp,
            bottom = contentPadding.calculateBottomPadding() + 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                "Comparar precios",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "Precios de ficha web · se actualizan cada segundo",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = localQuery,
                onValueChange = { localQuery = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Buscar en Coto, Carrefour y Día") },
                leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                ),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(
                    onSearch = { if (canSearch && !busy) onSearch(localQuery) },
                ),
            )
            Spacer(modifier = Modifier.height(10.dp))
            Button(
                onClick = { onSearch(localQuery) },
                enabled = !busy && canSearch,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(14.dp),
            ) {
                if (busy && results.isEmpty()) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                    Spacer(modifier = Modifier.size(10.dp))
                }
                Text(
                    if (busy && results.isEmpty()) "Buscando…" else "Buscar",
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        if (busy && results.isEmpty()) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
        }

        if (!busy && results.isEmpty() && query.isNotBlank()) {
            item {
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text(
                            "Sin resultados",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "Probá con otro nombre o un producto más específico.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        if (results.isNotEmpty() && busy) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                    Spacer(modifier = Modifier.size(8.dp))
                    Text(
                        "Actualizando…",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
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
    val prices = listOf(row.priceCoto, row.priceCarrefour, row.priceDia).filter { it > 0 }
    val best = prices.minOrNull() ?: 0.0
    val storeCount = prices.size

    Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    row.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                val meta = buildString {
                    if (storeCount > 0) append("$storeCount súper${if (storeCount == 1) "" else "s"}")
                    if (row.barcode.isNotBlank()) {
                        if (isNotEmpty()) append(" · ")
                        append(row.barcode)
                    }
                }
                if (meta.isNotBlank()) {
                    Text(
                        meta,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StorePriceCell(
                    modifier = Modifier.weight(1f),
                    label = "Coto",
                    labelColor = CotoColor,
                    price = row.priceCoto,
                    discount = row.discountCoto,
                    storeName = row.nameCoto,
                    primaryName = row.name,
                    isBest = row.priceCoto > 0 && row.priceCoto == best,
                )
                StorePriceCell(
                    modifier = Modifier.weight(1f),
                    label = "Carrefour",
                    labelColor = CarrefourColor,
                    price = row.priceCarrefour,
                    discount = row.discountCarrefour,
                    storeName = row.nameCarrefour,
                    primaryName = row.name,
                    isBest = row.priceCarrefour > 0 && row.priceCarrefour == best,
                )
                StorePriceCell(
                    modifier = Modifier.weight(1f),
                    label = "Día",
                    labelColor = DiaColor,
                    price = row.priceDia,
                    discount = row.discountDia,
                    storeName = row.nameDia,
                    primaryName = row.name,
                    isBest = row.priceDia > 0 && row.priceDia == best,
                )
            }

            FilledTonalButton(
                onClick = { onAdd(row) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            ) {
                Icon(
                    Icons.Outlined.AddShoppingCart,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(modifier = Modifier.size(8.dp))
                Text("Agregar al stock", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun StorePriceCell(
    modifier: Modifier = Modifier,
    label: String,
    labelColor: Color,
    price: Double,
    discount: String,
    storeName: String,
    primaryName: String,
    isBest: Boolean,
) {
    val scheme = MaterialTheme.colorScheme
    val container = when {
        price <= 0 -> scheme.surfaceVariant.copy(alpha = 0.45f)
        isBest -> scheme.primaryContainer.copy(alpha = 0.55f)
        else -> scheme.surfaceVariant.copy(alpha = 0.7f)
    }
    val border = when {
        isBest -> BorderStroke(1.5.dp, scheme.primary.copy(alpha = 0.55f))
        else -> null
    }

    Surface(
        modifier = modifier.heightIn(min = 96.dp),
        shape = RoundedCornerShape(14.dp),
        color = container,
        border = border,
        tonalElevation = if (isBest) 1.dp else 0.dp,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                label.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = labelColor,
                letterSpacing = MaterialTheme.typography.labelSmall.letterSpacing,
            )
            Text(
                if (price > 0) money(price) else "—",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = if (price > 0) scheme.onSurface else scheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (discount.isNotBlank() && price > 0) {
                SuggestionChip(
                    onClick = {},
                    enabled = false,
                    label = {
                        Text(
                            discount,
                            style = MaterialTheme.typography.labelSmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    colors = SuggestionChipDefaults.suggestionChipColors(
                        disabledContainerColor = scheme.tertiaryContainer.copy(alpha = 0.55f),
                        disabledLabelColor = scheme.onTertiaryContainer,
                    ),
                    border = null,
                    modifier = Modifier.height(24.dp),
                )
            }
            if (storeName.isNotBlank() && storeName != primaryName && price > 0) {
                Text(
                    storeName,
                    style = MaterialTheme.typography.labelSmall,
                    color = scheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
