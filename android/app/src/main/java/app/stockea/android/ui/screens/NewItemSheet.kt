package app.stockea.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DocumentScanner
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.stockea.android.data.CompareRow
import app.stockea.android.data.extractEan13
import app.stockea.android.data.money
import kotlinx.coroutines.launch

data class NewItemDraft(
    val name: String,
    val category: String,
    val quantity: Double,
    val minStock: Double,
    val qtyUnit: String,
    val price: Double,
    val barcode: String,
    val priceSource: String = "",
    val priceCoto: Double = 0.0,
    val priceCarrefour: Double = 0.0,
    val priceDia: Double = 0.0,
    val listPriceCoto: Double = 0.0,
    val listPriceCarrefour: Double = 0.0,
    val listPriceDia: Double = 0.0,
    val image: String = "",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewItemSheet(
    lookupBusy: Boolean,
    lookupHint: String,
    lookupMatch: CompareRow?,
    onDismiss: () -> Unit,
    onLookupBarcode: (String) -> Unit,
    onClearLookup: () -> Unit,
    onCreate: (NewItemDraft) -> Unit,
    onOpenScanner: () -> Unit,
    scannedEan: String?,
    onConsumeScannedEan: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()

    var name by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("Alimentos") }
    var quantity by remember { mutableStateOf("0") }
    var minStock by remember { mutableStateOf("1") }
    var qtyUnit by remember { mutableStateOf("unit") }
    var price by remember { mutableStateOf("") }
    var barcode by remember { mutableStateOf("") }
    var priceSource by remember { mutableStateOf("") }
    var priceCoto by remember { mutableStateOf(0.0) }
    var priceCarrefour by remember { mutableStateOf(0.0) }
    var priceDia by remember { mutableStateOf(0.0) }
    var listPriceCoto by remember { mutableStateOf(0.0) }
    var listPriceCarrefour by remember { mutableStateOf(0.0) }
    var listPriceDia by remember { mutableStateOf(0.0) }
    var image by remember { mutableStateOf("") }

    fun applyMatch(row: CompareRow) {
        name = row.name
        if (row.category.isNotBlank()) category = row.category
        barcode = row.barcode.ifBlank { barcode }
        priceCoto = row.priceCoto
        priceCarrefour = row.priceCarrefour
        priceDia = row.priceDia
        listPriceCoto = row.listPriceCoto
        listPriceCarrefour = row.listPriceCarrefour
        listPriceDia = row.listPriceDia
        image = row.image
        qtyUnit = if (row.qtyUnit == "kg") "kg" else "unit"
        if (qtyUnit == "kg") minStock = "0.5" else minStock = "1"
        val cheaper = listOf(row.priceCoto, row.priceCarrefour, row.priceDia)
            .filter { it > 0 }
            .minOrNull() ?: 0.0
        price = if (cheaper > 0) cheaper.toString() else price
        priceSource = when (cheaper) {
            row.priceCoto -> if (row.priceCoto > 0) "coto" else ""
            row.priceCarrefour -> "carrefour"
            row.priceDia -> "dia"
            else -> ""
        }
    }

    LaunchedEffect(scannedEan) {
        val ean = scannedEan?.takeIf { it.isNotBlank() } ?: return@LaunchedEffect
        barcode = ean
        onLookupBarcode(ean)
        onConsumeScannedEan()
    }

    LaunchedEffect(lookupMatch) {
        val row = lookupMatch ?: return@LaunchedEffect
        applyMatch(row)
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        dragHandle = {
            Surface(
                modifier = Modifier.padding(vertical = 10.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.35f),
                shape = RoundedCornerShape(999.dp),
            ) {
                Spacer(modifier = Modifier.width(42.dp).height(4.dp))
            }
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.92f)
                .navigationBarsPadding(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Nuevo ítem",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = {
                    scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() }
                }) {
                    Icon(Icons.Outlined.Close, contentDescription = "Cerrar")
                }
            }

            Text(
                "Escaneá el EAN o cargalo a mano, como en la web.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Código de barras", fontWeight = FontWeight.SemiBold)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = barcode,
                        onValueChange = {
                            barcode = it.filter { ch -> ch.isDigit() || ch.isWhitespace() }
                            onClearLookup()
                        },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        placeholder = { Text("EAN · Enter o escanear") },
                        shape = RoundedCornerShape(16.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                    OutlinedButton(
                        onClick = onOpenScanner,
                        modifier = Modifier.size(56.dp),
                        shape = RoundedCornerShape(16.dp),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                    ) {
                        Icon(
                            Icons.Outlined.DocumentScanner,
                            contentDescription = "Escanear código de barras",
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = {
                            val ean = extractEan13(barcode).ifBlank { barcode.trim() }
                            if (ean.isNotBlank()) onLookupBarcode(ean)
                        },
                        enabled = !lookupBusy && barcode.trim().length >= 8,
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text("Buscar en supers")
                    }
                    if (lookupBusy) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .size(22.dp)
                                .align(Alignment.CenterVertically),
                            strokeWidth = 2.dp,
                        )
                    }
                }

                if (lookupHint.isNotBlank()) {
                    Text(
                        lookupHint,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }

                if (lookupMatch != null) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(lookupMatch.name, fontWeight = FontWeight.SemiBold)
                            Text(
                                "Coto ${money(lookupMatch.priceCoto)} · Carrefour ${money(lookupMatch.priceCarrefour)} · Día ${money(lookupMatch.priceDia)}",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall,
                            )
                            TextButton(onClick = { applyMatch(lookupMatch) }) {
                                Text("Usar este producto")
                            }
                        }
                    }
                }

                HorizontalDivider()

                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nombre") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                )
                OutlinedTextField(
                    value = category,
                    onValueChange = { category = it },
                    label = { Text("Categoría") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                )

                Text("Unidad", fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = qtyUnit == "unit",
                        onClick = {
                            qtyUnit = "unit"
                            if (minStock.toDoubleOrNull() == null) minStock = "1"
                        },
                        label = { Text("Unidades") },
                    )
                    FilterChip(
                        selected = qtyUnit == "kg",
                        onClick = {
                            qtyUnit = "kg"
                            minStock = "0.5"
                        },
                        label = { Text("Kilos") },
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OutlinedTextField(
                        value = quantity,
                        onValueChange = { quantity = it },
                        label = { Text(if (qtyUnit == "kg") "Cantidad (kg)" else "Cantidad") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(16.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    )
                    OutlinedTextField(
                        value = minStock,
                        onValueChange = { minStock = it },
                        label = { Text(if (qtyUnit == "kg") "Mínimo (kg)" else "Mínimo") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(16.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    )
                }

                OutlinedTextField(
                    value = price,
                    onValueChange = {
                        price = it
                        priceSource = if (it.isNotBlank()) "custom" else priceSource
                    },
                    label = { Text("Precio") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )

                Spacer(modifier = Modifier.height(8.dp))
            }

            Surface(
                tonalElevation = 2.dp,
                shadowElevation = 8.dp,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp),
                    ) {
                        Text("Cancelar")
                    }
                    Button(
                        onClick = {
                            onCreate(
                                NewItemDraft(
                                    name = name.trim(),
                                    category = category.trim().ifBlank { "Alimentos" },
                                    quantity = quantity.replace(',', '.').toDoubleOrNull() ?: 0.0,
                                    minStock = minStock.replace(',', '.').toDoubleOrNull()
                                        ?: if (qtyUnit == "kg") 0.5 else 1.0,
                                    qtyUnit = qtyUnit,
                                    price = price.replace(',', '.').toDoubleOrNull() ?: 0.0,
                                    barcode = extractEan13(barcode).ifBlank { barcode.trim() },
                                    priceSource = priceSource,
                                    priceCoto = priceCoto,
                                    priceCarrefour = priceCarrefour,
                                    priceDia = priceDia,
                                    listPriceCoto = listPriceCoto,
                                    listPriceCarrefour = listPriceCarrefour,
                                    listPriceDia = listPriceDia,
                                    image = image,
                                ),
                            )
                        },
                        enabled = name.trim().isNotEmpty(),
                        modifier = Modifier
                            .weight(1.35f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp),
                    ) {
                        Text("Agregar", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
