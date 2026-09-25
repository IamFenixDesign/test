package app.stockea.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DocumentScanner
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.stockea.android.data.STOCK_CATEGORIES
import app.stockea.android.data.StoreProduct
import app.stockea.android.data.StoreSearchResults
import app.stockea.android.data.extractEan13
import app.stockea.android.data.formWeightForUnit
import app.stockea.android.data.guessCategory
import app.stockea.android.data.listPriceOfProduct
import app.stockea.android.data.matchByEan
import app.stockea.android.data.money
import app.stockea.android.data.qtyUnitOfProduct
import coil.compose.AsyncImage
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
    val urlCoto: String = "",
    val urlCarrefour: String = "",
    val urlDia: String = "",
    val discountCoto: String = "",
    val discountCarrefour: String = "",
    val discountDia: String = "",
)

private val CotoColor = Color(0xFFFF4D66)
private val CarrefourColor = Color(0xFF7EB3FF)
private val DiaColor = Color(0xFF9ADF55)
private val CotoBg = Color(0x24E20025)
private val CarrefourBg = Color(0x29004E9F)
private val DiaBg = Color(0x297AC143)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewItemSheet(
    storeBusy: Boolean,
    storeError: String,
    storeResults: StoreSearchResults,
    storeTab: String,
    allowCustomPrice: Boolean,
    formError: String,
    onDismiss: () -> Unit,
    onLookupStores: (String) -> Unit,
    onClearStoreResults: () -> Unit,
    onStoreTab: (String) -> Unit,
    onEnableCustomPrice: () -> Unit,
    onCreate: (NewItemDraft) -> Boolean,
    isTaken: (String, String) -> Boolean = { _, _ -> false },
    onOpenScanner: () -> Unit,
    scannedEan: String?,
    onConsumeScannedEan: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current

    var name by remember { mutableStateOf("") }
    var storeQuery by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("Alimentos") }
    var quantity by remember { mutableStateOf("1") }
    var minStock by remember { mutableStateOf("5") }
    var qtyUnit by remember { mutableStateOf("unit") }
    var qtyUnitCoto by remember { mutableStateOf("") }
    var qtyUnitCarrefour by remember { mutableStateOf("") }
    var qtyUnitDia by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var barcode by remember { mutableStateOf("") }
    var priceSource by remember { mutableStateOf("") }
    var priceCoto by remember { mutableStateOf(0.0) }
    var priceCarrefour by remember { mutableStateOf(0.0) }
    var priceDia by remember { mutableStateOf(0.0) }
    var listPriceCoto by remember { mutableStateOf(0.0) }
    var listPriceCarrefour by remember { mutableStateOf(0.0) }
    var listPriceDia by remember { mutableStateOf(0.0) }
    var discountCoto by remember { mutableStateOf("") }
    var discountCarrefour by remember { mutableStateOf("") }
    var discountDia by remember { mutableStateOf("") }
    var image by remember { mutableStateOf("") }
    var imageCoto by remember { mutableStateOf("") }
    var imageCarrefour by remember { mutableStateOf("") }
    var imageDia by remember { mutableStateOf("") }
    var urlCoto by remember { mutableStateOf("") }
    var urlCarrefour by remember { mutableStateOf("") }
    var urlDia by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf("") }
    var customUnlocked by remember { mutableStateOf(false) }

    val priceEditable = customUnlocked || allowCustomPrice || priceSource == "custom"
    val hasPickedStore =
        priceCoto > 0 || priceCarrefour > 0 || priceDia > 0 || priceSource == "custom"

    fun parseNum(raw: String): Double =
        raw.trim().replace(',', '.').toDoubleOrNull() ?: 0.0

    fun convertQtyFields(fromUnit: String, toUnit: String) {
        val from = if (fromUnit == "kg") "kg" else "unit"
        val to = if (toUnit == "kg") "kg" else "unit"
        if (from == to) return
        quantity = formatFormNumber(formWeightForUnit(parseNum(quantity), from, to), to)
        minStock = formatFormNumber(formWeightForUnit(parseNum(minStock), from, to), to)
    }

    fun setQtyUnit(next: String) {
        val to = if (next == "kg") "kg" else "unit"
        convertQtyFields(qtyUnit, to)
        qtyUnit = to
    }

    fun applyStoreProduct(product: StoreProduct) {
        if (isTaken(product.ean, product.name)) {
            localError = "Ya está agregado"
            return
        }
        val coto =
            if (product.store == "coto") product else matchByEan(product, storeResults.coto)
        val carrefour =
            if (product.store == "carrefour") {
                product
            } else {
                matchByEan(product, storeResults.carrefour)
            }
        val dia =
            if (product.store == "dia") product else matchByEan(product, storeResults.dia)
        val nextUnit = qtyUnitOfProduct(product)
        convertQtyFields(qtyUnit, nextUnit)
        qtyUnit = if (nextUnit == "kg") "kg" else "unit"
        name = product.name
        barcode = product.ean.ifBlank { barcode }
        category = guessCategory(product)
        qtyUnitCoto = coto?.let { qtyUnitOfProduct(it) }.orEmpty().ifBlank { qtyUnitCoto }
        qtyUnitCarrefour =
            carrefour?.let { qtyUnitOfProduct(it) }.orEmpty().ifBlank { qtyUnitCarrefour }
        qtyUnitDia = dia?.let { qtyUnitOfProduct(it) }.orEmpty().ifBlank { qtyUnitDia }
        price = product.price.toString()
        priceSource = product.store
        priceCoto = coto?.price ?: priceCoto
        priceCarrefour = carrefour?.price ?: priceCarrefour
        priceDia = dia?.price ?: priceDia
        listPriceCoto = coto?.let { listPriceOfProduct(it) } ?: listPriceCoto
        listPriceCarrefour = carrefour?.let { listPriceOfProduct(it) } ?: listPriceCarrefour
        listPriceDia = dia?.let { listPriceOfProduct(it) } ?: listPriceDia
        urlCoto = coto?.url ?: urlCoto
        urlCarrefour = carrefour?.url ?: urlCarrefour
        urlDia = dia?.url ?: urlDia
        image = product.image.ifBlank { image }
        imageCoto = coto?.image ?: imageCoto
        imageCarrefour = carrefour?.image ?: imageCarrefour
        imageDia = dia?.image ?: imageDia
        discountCoto =
            coto?.let { if (it.hasDiscount) it.discountLabel.ifBlank { "Oferta" } else "" }
                ?: discountCoto
        discountCarrefour =
            carrefour?.let { if (it.hasDiscount) it.discountLabel.ifBlank { "Oferta" } else "" }
                ?: discountCarrefour
        discountDia =
            dia?.let { if (it.hasDiscount) it.discountLabel.ifBlank { "Oferta" } else "" }
                ?: discountDia
        storeQuery = ""
        customUnlocked = false
        localError = ""
        onClearStoreResults()
    }

    fun applyFormStorePrice(store: String) {
        val value = when (store) {
            "coto" -> priceCoto
            "carrefour" -> priceCarrefour
            "dia" -> priceDia
            else -> 0.0
        }
        if (value <= 0) return
        val storeUnit = when (store) {
            "coto" -> qtyUnitCoto
            "carrefour" -> qtyUnitCarrefour
            "dia" -> qtyUnitDia
            else -> ""
        }
        val nextUnit = if (storeUnit == "kg" || storeUnit == "unit") storeUnit else qtyUnit
        convertQtyFields(qtyUnit, nextUnit)
        qtyUnit = if (nextUnit == "kg") "kg" else "unit"
        price = value.toString()
        priceSource = store
        image = when (store) {
            "coto" -> imageCoto.ifBlank { image }
            "carrefour" -> imageCarrefour.ifBlank { image }
            else -> imageDia.ifBlank { image }
        }
        customUnlocked = false
        localError = ""
    }

    fun clearStoreProduct() {
        barcode = ""
        qtyUnitCoto = ""
        qtyUnitCarrefour = ""
        qtyUnitDia = ""
        price = ""
        priceSource = ""
        priceCoto = 0.0
        priceCarrefour = 0.0
        priceDia = 0.0
        listPriceCoto = 0.0
        listPriceCarrefour = 0.0
        listPriceDia = 0.0
        urlCoto = ""
        urlCarrefour = ""
        urlDia = ""
        image = ""
        imageCoto = ""
        imageCarrefour = ""
        imageDia = ""
        discountCoto = ""
        discountCarrefour = ""
        discountDia = ""
        storeQuery = name
        customUnlocked = false
        localError = ""
        onClearStoreResults()
    }

    fun runLookup(term: String = storeQuery) {
        val q = term.trim().ifBlank { barcode.trim().ifBlank { name.trim() } }
        focus.clearFocus()
        if (q.isBlank()) {
            localError = "Escribí un producto o EAN y tocá buscar."
            return
        }
        storeQuery = q
        localError = ""
        onLookupStores(q)
    }

    LaunchedEffect(scannedEan) {
        val ean = scannedEan?.takeIf { it.isNotBlank() } ?: return@LaunchedEffect
        barcode = ean
        storeQuery = ean
        customUnlocked = false
        onClearStoreResults()
        onLookupStores(ean)
        onConsumeScannedEan()
    }

    LaunchedEffect(allowCustomPrice) {
        if (allowCustomPrice) customUnlocked = true
    }

    LaunchedEffect(formError) {
        if (formError.isNotBlank()) localError = formError
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
                .fillMaxHeight(0.94f)
                .navigationBarsPadding(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Nuevo ítem",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        "Cargalo con el precio de Coto, Carrefour o Día.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                IconButton(onClick = {
                    scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() }
                }) {
                    Icon(Icons.Outlined.Close, contentDescription = "Cerrar")
                }
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nombre") },
                    placeholder = { Text("Nombre del producto") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                )

                Text("Buscar en Coto / Carrefour / Día", fontWeight = FontWeight.SemiBold)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = storeQuery,
                        onValueChange = { storeQuery = it },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        placeholder = { Text("Nombre o EAN · Enter") },
                        shape = RoundedCornerShape(16.dp),
                        keyboardOptions = KeyboardOptions(
                            imeAction = ImeAction.Search,
                        ),
                        keyboardActions = KeyboardActions(onSearch = { runLookup() }),
                    )
                    OutlinedButton(
                        onClick = onOpenScanner,
                        enabled = !storeBusy,
                        modifier = Modifier.size(56.dp),
                        shape = RoundedCornerShape(16.dp),
                        contentPadding = PaddingValues(0.dp),
                    ) {
                        Icon(
                            Icons.Outlined.DocumentScanner,
                            contentDescription = "Escanear código de barras",
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }

                OutlinedButton(
                    onClick = { runLookup() },
                    enabled = !storeBusy,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (storeBusy) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text("Buscando…")
                    } else {
                        Text("Buscar en supers")
                    }
                }

                if (hasPickedStore) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                ProductThumb(image)
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(
                                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        if (priceCoto > 0) {
                                            StorePill(
                                                label = "Coto ${money(priceCoto)}" +
                                                    if (discountCoto.isNotBlank()) " · $discountCoto" else "",
                                                selected = priceSource == "coto",
                                                color = CotoColor,
                                                bg = CotoBg,
                                                onClick = { applyFormStorePrice("coto") },
                                            )
                                        }
                                        if (priceCarrefour > 0) {
                                            StorePill(
                                                label = "Carrefour ${money(priceCarrefour)}" +
                                                    if (discountCarrefour.isNotBlank()) {
                                                        " · $discountCarrefour"
                                                    } else {
                                                        ""
                                                    },
                                                selected = priceSource == "carrefour",
                                                color = CarrefourColor,
                                                bg = CarrefourBg,
                                                onClick = { applyFormStorePrice("carrefour") },
                                            )
                                        }
                                        if (priceDia > 0) {
                                            StorePill(
                                                label = "Día ${money(priceDia)}" +
                                                    if (discountDia.isNotBlank()) " · $discountDia" else "",
                                                selected = priceSource == "dia",
                                                color = DiaColor,
                                                bg = DiaBg,
                                                onClick = { applyFormStorePrice("dia") },
                                            )
                                        }
                                        if (priceSource == "custom" && price.isNotBlank()) {
                                            StorePill(
                                                label = "Personalizado ${
                                                    money(parseNum(price))
                                                }",
                                                selected = true,
                                                color = MaterialTheme.colorScheme.primary,
                                                bg = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                                                onClick = {},
                                            )
                                        }
                                    }
                                }
                                TextButton(onClick = { clearStoreProduct() }) {
                                    Text("Quitar")
                                }
                            }
                        }
                    }
                }

                if (storeError.isNotBlank()) {
                    Text(
                        storeError,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    if (allowCustomPrice || customUnlocked) {
                        TextButton(onClick = {
                            customUnlocked = true
                            priceSource = "custom"
                            price = ""
                            onEnableCustomPrice()
                        }) {
                            Text("Precio personalizado")
                        }
                    }
                }

                if (!storeResults.isEmpty) {
                    StoreResultTabs(
                        results = storeResults,
                        selected = storeTab,
                        onSelect = onStoreTab,
                    )
                    val list = when (storeTab) {
                        "carrefour" -> storeResults.carrefour
                        "dia" -> storeResults.dia
                        else -> storeResults.coto
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        list.forEach { product ->
                            val taken = isTaken(product.ean, product.name)
                            StoreResultRow(
                                product = product,
                                taken = taken,
                                onPick = { applyStoreProduct(product) },
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = barcode,
                    onValueChange = { barcode = it.filter { ch -> ch.isDigit() || ch.isWhitespace() } },
                    label = { Text("Código de barras") },
                    placeholder = { Text("EAN") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Number,
                        imeAction = ImeAction.Search,
                    ),
                    keyboardActions = KeyboardActions(
                        onSearch = {
                            val ean = extractEan13(barcode).ifBlank { barcode.trim() }
                            if (ean.isNotBlank()) {
                                storeQuery = ean
                                runLookup(ean)
                            }
                        },
                    ),
                )

                Text("Categoría", fontWeight = FontWeight.SemiBold)
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    STOCK_CATEGORIES.forEach { entry ->
                        FilterChip(
                            selected = category == entry,
                            onClick = { category = entry },
                            label = { Text(entry) },
                        )
                    }
                }

                Text("Medida", fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = qtyUnit != "kg",
                        onClick = { setQtyUnit("unit") },
                        label = { Text("Por unidad") },
                    )
                    FilterChip(
                        selected = qtyUnit == "kg",
                        onClick = { setQtyUnit("kg") },
                        label = { Text("Por kilo") },
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OutlinedTextField(
                        value = quantity,
                        onValueChange = { quantity = it },
                        label = {
                            Text(if (qtyUnit == "kg") "Cantidad inicial (g)" else "Cantidad inicial")
                        },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(16.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        supportingText = if (qtyUnit == "kg") {
                            { Text("Desde 0,1 g (ej: 500 = 500 g).") }
                        } else {
                            null
                        },
                    )
                    OutlinedTextField(
                        value = minStock,
                        onValueChange = { minStock = it },
                        label = {
                            Text(if (qtyUnit == "kg") "Stock mínimo (g)" else "Stock mínimo")
                        },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(16.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        supportingText = if (qtyUnit == "kg") {
                            { Text("Desde 0,1 g (ej: 100 = 100 g).") }
                        } else {
                            null
                        },
                    )
                }

                OutlinedTextField(
                    value = if (priceEditable) {
                        price
                    } else if (price.isNotBlank()) {
                        formatMoneyDisplay(parseNum(price))
                    } else {
                        ""
                    },
                    onValueChange = {
                        if (!priceEditable) return@OutlinedTextField
                        price = it.filter { ch -> ch.isDigit() || ch == ',' || ch == '.' }
                        priceSource = "custom"
                        customUnlocked = true
                        localError = ""
                    },
                    label = { Text("Precio") },
                    prefix = { Text("$ ") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    readOnly = !priceEditable,
                    shape = RoundedCornerShape(16.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    supportingText = {
                        Text(
                            if (priceEditable) {
                                "Precio personalizado: el producto no está en Coto, Carrefour ni Día, o lo cargaste a mano"
                            } else {
                                "Se completa con Coto, Carrefour o Día; si no aparece, vas a poder poner uno personalizado"
                            },
                        )
                    },
                )

                val shownError = localError.ifBlank { formError }
                if (shownError.isNotBlank()) {
                    Text(shownError, color = MaterialTheme.colorScheme.error)
                }

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
                    val formTaken = isTaken(barcode, name)
                    Button(
                        onClick = {
                            localError = ""
                            if (formTaken) {
                                localError = "Ya está agregado"
                                return@Button
                            }
                            onCreate(
                                NewItemDraft(
                                    name = name.trim(),
                                    category = category.trim().ifBlank { "Alimentos" },
                                    quantity = parseNum(quantity),
                                    minStock = parseNum(minStock).takeIf { it > 0 }
                                        ?: if (qtyUnit == "kg") 500.0 else 5.0,
                                    qtyUnit = qtyUnit,
                                    price = parseNum(price),
                                    barcode = extractEan13(barcode).ifBlank { barcode.trim() },
                                    priceSource = priceSource,
                                    priceCoto = priceCoto,
                                    priceCarrefour = priceCarrefour,
                                    priceDia = priceDia,
                                    listPriceCoto = listPriceCoto,
                                    listPriceCarrefour = listPriceCarrefour,
                                    listPriceDia = listPriceDia,
                                    image = image,
                                    urlCoto = urlCoto,
                                    urlCarrefour = urlCarrefour,
                                    urlDia = urlDia,
                                    discountCoto = if (priceSource == "custom") "" else discountCoto,
                                    discountCarrefour =
                                        if (priceSource == "custom") "" else discountCarrefour,
                                    discountDia = if (priceSource == "custom") "" else discountDia,
                                ),
                            )
                        },
                        enabled = name.trim().isNotEmpty() && !formTaken,
                        modifier = Modifier
                            .weight(1.35f)
                            .height(50.dp),
                        shape = RoundedCornerShape(16.dp),
                    ) {
                        Text(if (formTaken) "Ya está agregado" else "Agregar al stock", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

private fun formatFormNumber(value: Double, unit: String): String {
    if (unit == "kg") {
        return if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()
    }
    return if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()
}

private fun formatMoneyDisplay(value: Double): String {
    if (value <= 0) return ""
    return "%,.2f".format(value).replace(',', 'X').replace('.', ',').replace('X', '.')
}

@Composable
private fun ProductThumb(url: String) {
    val shape = RoundedCornerShape(12.dp)
    if (url.isNotBlank()) {
        AsyncImage(
            model = url,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(48.dp)
                .clip(shape)
                .background(MaterialTheme.colorScheme.surface),
        )
    } else {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(shape)
                .background(MaterialTheme.colorScheme.surface),
        )
    }
}

@Composable
private fun StorePill(
    label: String,
    selected: Boolean,
    color: Color,
    bg: Color,
    onClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = bg,
        modifier = Modifier
            .then(
                if (selected) {
                    Modifier.border(1.5.dp, color, RoundedCornerShape(999.dp))
                } else {
                    Modifier
                },
            )
            .clickable(onClick = onClick),
    ) {
        Text(
            label,
            color = color,
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun StoreResultTabs(
    results: StoreSearchResults,
    selected: String,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (results.coto.isNotEmpty()) {
            StoreTabChip(
                label = "Coto",
                count = results.coto.size,
                active = selected == "coto",
                color = CotoColor,
                bg = CotoBg,
                onClick = { onSelect("coto") },
            )
        }
        if (results.carrefour.isNotEmpty()) {
            StoreTabChip(
                label = "Carrefour",
                count = results.carrefour.size,
                active = selected == "carrefour",
                color = CarrefourColor,
                bg = CarrefourBg,
                onClick = { onSelect("carrefour") },
            )
        }
        if (results.dia.isNotEmpty()) {
            StoreTabChip(
                label = "Día",
                count = results.dia.size,
                active = selected == "dia",
                color = DiaColor,
                bg = DiaBg,
                onClick = { onSelect("dia") },
            )
        }
    }
}

@Composable
private fun StoreTabChip(
    label: String,
    count: Int,
    active: Boolean,
    color: Color,
    bg: Color,
    onClick: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = if (active) bg else MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier
            .then(
                if (active) Modifier.border(1.dp, color, RoundedCornerShape(14.dp)) else Modifier,
            )
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                label,
                fontWeight = FontWeight.SemiBold,
                color = if (active) color else MaterialTheme.colorScheme.onSurface,
            )
            Text(
                count.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun StoreResultRow(
    product: StoreProduct,
    onPick: () -> Unit,
    taken: Boolean = false,
) {
    val accent = when (product.store) {
        "coto" -> CotoColor
        "carrefour" -> CarrefourColor
        "dia" -> DiaColor
        else -> MaterialTheme.colorScheme.primary
    }
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !taken, onClick = onPick)
            .border(1.dp, accent.copy(alpha = 0.35f), RoundedCornerShape(16.dp)),
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ProductThumb(product.image)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    product.name,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                val unit = if (qtyUnitOfProduct(product) == "kg") "/ kg" else "/ u."
                val meta = buildString {
                    if (product.ean.isNotBlank()) append("${product.ean} · ")
                    if (product.brand.isNotBlank()) append("${product.brand} · ")
                    append("${money(product.price)}$unit")
                    if (product.hasDiscount && product.discountLabel.isNotBlank()) {
                        append(" · ${product.discountLabel}")
                    }
                }
                Text(
                    meta,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    when {
                        taken -> "Ya está agregado"
                        product.hasDiscount -> "Con descuento web"
                        else -> "Sin descuento web"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = if (product.hasDiscount) accent else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
