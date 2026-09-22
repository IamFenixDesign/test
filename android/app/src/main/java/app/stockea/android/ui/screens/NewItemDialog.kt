package app.stockea.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

@Composable
fun NewItemDialog(
    onDismiss: () -> Unit,
    onCreate: (
        name: String,
        category: String,
        quantity: Double,
        minStock: Double,
        qtyUnit: String,
        price: Double,
        barcode: String,
    ) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("Alimentos") }
    var quantity by remember { mutableStateOf("0") }
    var minStock by remember { mutableStateOf("1") }
    var qtyUnit by remember { mutableStateOf("unit") }
    var price by remember { mutableStateOf("") }
    var barcode by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nuevo ítem", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(
                    name,
                    { name = it },
                    label = { Text("Nombre") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    category,
                    { category = it },
                    label = { Text("Categoría") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    barcode,
                    { barcode = it },
                    label = { Text("Código de barras (opcional)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Text("Unidad")
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
                OutlinedTextField(
                    quantity,
                    { quantity = it },
                    label = { Text(if (qtyUnit == "kg") "Cantidad (kg)" else "Cantidad") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(
                    minStock,
                    { minStock = it },
                    label = { Text(if (qtyUnit == "kg") "Mínimo (kg)" else "Mínimo") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(
                    price,
                    { price = it },
                    label = { Text("Precio (opcional)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onCreate(
                        name,
                        category,
                        quantity.replace(',', '.').toDoubleOrNull() ?: 0.0,
                        minStock.replace(',', '.').toDoubleOrNull() ?: if (qtyUnit == "kg") 0.5 else 1.0,
                        qtyUnit,
                        price.replace(',', '.').toDoubleOrNull() ?: 0.0,
                        barcode,
                    )
                },
                enabled = name.trim().isNotEmpty(),
                modifier = Modifier.height(44.dp),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Agregar", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar") }
        },
    )
}
