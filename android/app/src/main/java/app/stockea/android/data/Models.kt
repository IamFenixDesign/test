package app.stockea.android.data

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.round

data class User(
    val id: String,
    val email: String,
    val name: String,
    val firstName: String,
    val lastName: String,
    val picture: String = "",
    val provider: String = "email",
)

data class StockItem(
    val id: String,
    val name: String,
    val barcode: String = "",
    val category: String = "Alimentos",
    val quantity: Double = 0.0,
    val minStock: Double = 0.0,
    val qtyUnit: String = "unit",
    val price: Double = 0.0,
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
) {
    /** Stock bajo solo si está por debajo del mínimo (igual a la web). */
    val isLowStock: Boolean
        get() = quantity < minStock || quantity <= 0.0

    val neededToMin: Double
        get() = normalizeQty(max(0.0, minStock - quantity), qtyUnit)

    val shouldAutoCart: Boolean
        get() = neededToMin > 0.0
}

data class CompareRow(
    val id: String,
    val name: String,
    val barcode: String = "",
    val category: String = "",
    val priceCoto: Double = 0.0,
    val priceCarrefour: Double = 0.0,
    val priceDia: Double = 0.0,
    val listPriceCoto: Double = 0.0,
    val listPriceCarrefour: Double = 0.0,
    val listPriceDia: Double = 0.0,
    val discountCoto: String = "",
    val discountCarrefour: String = "",
    val discountDia: String = "",
    val qtyUnit: String = "unit",
    val image: String = "",
)

data class StoreProduct(
    val store: String,
    val name: String,
    val ean: String = "",
    val price: Double = 0.0,
    val listPrice: Double = 0.0,
    val qtyUnit: String = "unit",
    val image: String = "",
    val url: String = "",
    val brand: String = "",
    val department: String = "",
    val categories: List<String> = emptyList(),
    val hasDiscount: Boolean = false,
    val discountLabel: String = "",
) {
    /** Precio de góndola / lista (como en la web del súper). */
    val displayPrice: Double
        get() = if (listPrice > 0) listPrice else price

    val categoryHint: String
        get() = categories.firstOrNull().orEmpty().ifBlank { department }
}

data class StoreSearchResults(
    val coto: List<StoreProduct> = emptyList(),
    val carrefour: List<StoreProduct> = emptyList(),
    val dia: List<StoreProduct> = emptyList(),
    val errors: Map<String, String> = emptyMap(),
) {
    val isEmpty: Boolean
        get() = coto.isEmpty() && carrefour.isEmpty() && dia.isEmpty()

    fun preferTab(): String = when {
        coto.isNotEmpty() -> "coto"
        carrefour.isNotEmpty() -> "carrefour"
        dia.isNotEmpty() -> "dia"
        else -> "coto"
    }
}

val STOCK_CATEGORIES = listOf("Alimentos", "Bebidas", "Limpieza", "Papelería", "Insumos")

private val CATEGORY_HINTS = listOf(
    "Bebidas" to listOf("bebida", "gaseosa", "cerveza", "vino", "jugo", "soda", "aguas", "sin alcohol"),
    "Limpieza" to listOf("limpieza", "lavandina", "detergente", "limpiador", "suavizante", "dph"),
    "Papelería" to listOf("libreria", "papeler", "escritura", "boligrafo", "cuaderno", "resma"),
    "Insumos" to listOf("insumo", "descartable", "packaging"),
    "Alimentos" to listOf(
        "almacen", "lacteo", "fresco", "alimento", "carnicer", "panader", "fiambr", "verduler",
    ),
)

fun foldText(text: String?): String =
    (text ?: "")
        .lowercase()
        .replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ü", "u")
        .replace("ñ", "n")

fun guessCategory(product: StoreProduct): String {
    val parts = buildList {
        add(product.department)
        add(product.name)
        addAll(product.categories)
    }
        .filter { it.isNotBlank() }
        .flatMap { it.split('/') }
        .map { foldText(it.trim()) }
        .filter { it.isNotBlank() }
    val haystack = parts.joinToString(" | ")
    for ((category, keys) in CATEGORY_HINTS) {
        if (keys.any { key -> haystack.contains(key) }) return category
    }
    return "Alimentos"
}

fun listPriceOfProduct(product: StoreProduct): Double {
    if (product.listPrice > 0) return product.listPrice
    return if (product.price > 0) product.price else 0.0
}

/**
 * Precio a mostrar en Comparar: el de la ficha web (no el tachado/inflado).
 * Coto → lista/activo; Carrefour/Día → Price de VTEX.
 */
fun compareShelfPrice(product: StoreProduct): Double {
    if (product.store == "carrefour" || product.store == "dia") {
        if (product.price > 0) return product.price
    }
    return listPriceOfProduct(product)
}

fun qtyUnitOfProduct(product: StoreProduct): String =
    if (product.qtyUnit == "kg") "kg" else "unit"

fun matchByEan(product: StoreProduct, otherList: List<StoreProduct>): StoreProduct? {
    if (product.ean.isBlank()) return null
    return otherList.firstOrNull { it.ean.isNotBlank() && it.ean == product.ean }
}

private val COMPARE_FILLERS = setOf(
    "x", "kg", "kgs", "kilo", "kilogramo", "gr", "grs", "g", "gramo", "gramos",
    "ml", "cc", "cl", "lt", "l", "litro", "litros", "un", "u", "und", "unidad", "unidades",
    "pack", "paq", "paquete", "botella", "sachet", "tetra", "ttb", "caja", "bolsa", "malla",
    "porron", "lata", "frasco", "pote", "vaso", "brick", "brik",
    "huella", "natural", "classic", "clasica", "clasico", "comun", "seleccion",
    "largo", "larga", "vida", "uat", "ultra",
)

private val COMPARE_STRONG_VARIANTS = listOf(
    listOf("cherry", "cocktail"),
    listOf("perita"),
    listOf("kumato"),
    listOf("raf"),
    listOf("organico", "organica"),
    listOf("deshidrat", "deshidratado", "deshidratada"),
    listOf("relleno", "rellena"),
    listOf("especial"),
    listOf("racimo", "rama"),
    listOf("comercial"),
    listOf("light", "liviana", "descremada", "parcialmente"),
    listOf("enter", "entera", "entero"),
)

private val COMPARE_SYNONYMS = mapOf(
    "redondo" to "red",
    "red" to "red",
    "cavendish" to "banana",
)

private val COMPARE_WEAK_BRANDS = setOf(
    "dia", "carrefour", "coto", "classic", "clasica", "clasico",
    "huella", "huellanatural", "natural", "generico", "comun", "",
)

private val COMPARE_GENERIC_TOKENS = setOf(
    "leche", "agua", "aceite", "arroz", "azucar", "sal", "yogur", "yogurt", "jugo",
    "pan", "queso", "crema", "manteca", "huevo", "cerveza", "vino", "gaseosa",
    "fideo", "harina", "cafe", "te", "galletita", "entera", "enter", "descremada",
    "light", "polvo", "sabor",
)

private const val COMPARE_NAME_MATCH_MIN = 48.0

private fun canonCompareToken(token: String): String {
    var t = foldText(token).replace(Regex("[^a-z0-9]"), "")
    if (t.isEmpty()) return ""
    COMPARE_SYNONYMS[t]?.let { return it }
    if (t.endsWith("es") && t.length > 5) t = t.dropLast(2)
    else if (t.endsWith("s") && t.length > 4) t = t.dropLast(1)
    return t
}

private fun extractCompareSize(foldedName: String): String {
    val text = foldText(foldedName)
    val match = Regex("""\b(\d+[.,]?\d*)\s*(kg|kgs|g|gr|grs|grm|ml|cc|cl|l|lt|lts)\b""")
        .find(text)
        ?: Regex("""\b(\d+[.,]?\d*)(kg|kgs|g|gr|grs|grm|ml|cc|cl|l|lt|lts)\b""").find(text)
        ?: return ""
    val n = match.groupValues[1].replace(',', '.')
    var u = match.groupValues[2]
    if (u == "grs" || u == "gr" || u == "grm") u = "g"
    if (u == "kgs") u = "kg"
    if (u == "lts" || u == "lt") u = "l"
    if (u == "cc") u = "ml"
    return "$n$u"
}

private data class CompareIdentity(
    val unit: String,
    val size: String,
    val tokens: List<String>,
    val variants: Set<String>,
    val brand: String,
    val folded: String,
)

private fun compareProductIdentity(product: StoreProduct): CompareIdentity {
    val folded = foldText(product.name)
    val size = extractCompareSize(folded)
    val unit = if (product.qtyUnit == "kg") "kg" else "unit"
    val raw = folded.replace(Regex("[^a-z0-9]+"), " ").split(Regex("\\s+"))
        .map { canonCompareToken(it) }
        .filter { it.isNotEmpty() }
    val seen = mutableSetOf<String>()
    val tokens = mutableListOf<String>()
    for (t in raw) {
        if (t in COMPARE_FILLERS || t.all { it.isDigit() } || t in seen) continue
        seen.add(t)
        tokens.add(t)
    }
    val joined = tokens.joinToString(" ")
    val variants = mutableSetOf<String>()
    for (group in COMPARE_STRONG_VARIANTS) {
        if (group.any { it in tokens || joined.contains(it) }) variants.add(group.first())
    }
    val brand = canonCompareToken(product.brand)
    return CompareIdentity(unit, size, tokens, variants, brand, folded)
}

private fun variantsCompatible(a: CompareIdentity, b: CompareIdentity): Boolean {
    val onlyA = a.variants.filter { it !in b.variants }
    val onlyB = b.variants.filter { it !in a.variants }
    if (onlyA.isEmpty() && onlyB.isEmpty()) return true
    if (onlyA.isNotEmpty() && onlyB.isNotEmpty()) return false
    return (if (onlyA.isNotEmpty()) onlyA else onlyB).isEmpty()
}

fun scoreCompareMatch(seed: StoreProduct?, candidate: StoreProduct?): Double {
    if (seed == null || candidate == null) return 0.0
    val a = compareProductIdentity(seed)
    val b = compareProductIdentity(candidate)
    if (a.unit != b.unit) return 0.0
    if (a.size.isNotEmpty() || b.size.isNotEmpty()) {
        if (a.size.isEmpty() || b.size.isEmpty() || a.size != b.size) return 0.0
    }
    if (!variantsCompatible(a, b)) return 0.0

    val brandA = if (a.brand.isNotEmpty() && a.brand !in COMPARE_WEAK_BRANDS) a.brand else ""
    val brandB = if (b.brand.isNotEmpty() && b.brand !in COMPARE_WEAK_BRANDS) b.brand else ""
    if (a.unit == "unit") {
        if (brandA.isNotEmpty() && brandB.isNotEmpty() && brandA != brandB) return 0.0
        if (brandA.isNotEmpty() && brandB.isEmpty() && !b.folded.contains(brandA) && brandA !in b.tokens) return 0.0
        if (brandB.isNotEmpty() && brandA.isEmpty() && !a.folded.contains(brandB) && brandB !in a.tokens) return 0.0
    }

    if (a.tokens.isEmpty() || b.tokens.isEmpty()) return 0.0
    val setA = a.tokens.toSet()
    val setB = b.tokens.toSet()
    val inter = setA.intersect(setB).toList()
    if (inter.isEmpty()) return 0.0
    if (a.unit == "unit" && inter.size < 2 && !(brandA.isNotEmpty() && brandA == brandB)) return 0.0
    if (a.unit == "unit" && brandA.isEmpty() && brandB.isEmpty()) {
        val specific = inter.filter { it !in COMPARE_GENERIC_TOKENS }
        if (specific.isEmpty() || inter.size < 3) return 0.0
    }
    val headA = a.tokens.firstOrNull()
    val headB = b.tokens.firstOrNull()
    if (headA != null && headB != null && headA != headB && headA !in inter && headB !in inter) return 0.0

    val union = setA + setB
    var score = (inter.size.toDouble() / union.size) * 70.0
    if (a.size.isNotEmpty() && a.size == b.size) score += 18
    if (a.unit == "kg") score += 8
    if (brandA.isNotEmpty() && brandB.isNotEmpty() && brandA == brandB) score += 16
    if (inter.size >= 2) score += 10
    if (inter.size >= 3) score += 8
    if (a.folded.contains(inter[0]) && b.folded.contains(inter[0])) score += 4
    return score
}

fun findCompareMatchIndex(seed: StoreProduct, list: List<StoreProduct>, used: Set<Int>): Int {
    if (list.isEmpty()) return -1
    if (seed.ean.isNotBlank()) {
        list.forEachIndexed { index, product ->
            if (index !in used && product.ean.isNotBlank() && product.ean == seed.ean) return index
        }
    }
    var bestIdx = -1
    var bestScore = 0.0
    var bestClose = Double.NEGATIVE_INFINITY
    list.forEachIndexed { index, product ->
        if (index in used) return@forEachIndexed
        val score = scoreCompareMatch(seed, product)
        if (score < COMPARE_NAME_MATCH_MIN) return@forEachIndexed
        val seedId = compareProductIdentity(seed)
        val otherId = compareProductIdentity(product)
        val close =
            -kotlin.math.abs(seedId.tokens.size - otherId.tokens.size) * 10.0 -
                kotlin.math.abs(seedId.folded.length - otherId.folded.length)
        if (score > bestScore || (score == bestScore && close > bestClose)) {
            bestScore = score
            bestClose = close
            bestIdx = index
        }
    }
    return bestIdx
}

/** Pasa gramos del formulario a kilos guardados (precisión 0,1 g). */
fun kgFromGrams(grams: Double): Double {
    if (!grams.isFinite() || grams < 0) return 0.0
    return round(grams * 10.0) / 10000.0
}

/** Pasa kilos guardados a gramos para los inputs del form. */
fun gramsFromKg(kg: Double): Double {
    if (!kg.isFinite() || kg < 0) return 0.0
    return round(kg * 10000.0) / 10.0
}

/** En el form, por kilo cantidad/mínimo van en gramos; por unidad son enteros. */
fun formWeightForUnit(value: Double, fromUnit: String, toUnit: String): Double {
    val from = if (fromUnit == "kg") "kg" else "unit"
    val to = if (toUnit == "kg") "kg" else "unit"
    if (from == to) {
        return if (to == "kg") value else normalizeQty(value, "unit")
    }
    return if (from == "kg" && to == "unit") {
        normalizeQty(kgFromGrams(value), "unit")
    } else {
        gramsFromKg(normalizeQty(value, "kg"))
    }
}

fun normalizeQty(value: Double, unit: String = "unit"): Double {
    if (!value.isFinite() || value < 0) return 0.0
    return if (unit == "kg") {
        round(value * 10000.0) / 10000.0
    } else {
        round(value)
    }
}

fun JSONObject.optDoubleOrZero(key: String): Double {
    if (!has(key) || isNull(key)) return 0.0
    return optDouble(key, 0.0)
}

fun JSONObject.toUser(): User = User(
    id = optString("id"),
    email = optString("email"),
    name = optString("name"),
    firstName = optString("firstName"),
    lastName = optString("lastName"),
    picture = optString("picture"),
    provider = optString("provider", "email"),
)

fun JSONObject.toStockItem(): StockItem = StockItem(
    id = optString("id"),
    name = optString("name"),
    barcode = optString("barcode"),
    category = optString("category", "Alimentos"),
    quantity = optDoubleOrZero("quantity"),
    minStock = optDoubleOrZero("minStock"),
    qtyUnit = optString("qtyUnit", "unit"),
    price = optDoubleOrZero("price"),
    priceSource = optString("priceSource"),
    priceCoto = optDoubleOrZero("priceCoto"),
    priceCarrefour = optDoubleOrZero("priceCarrefour"),
    priceDia = optDoubleOrZero("priceDia"),
    listPriceCoto = optDoubleOrZero("listPriceCoto"),
    listPriceCarrefour = optDoubleOrZero("listPriceCarrefour"),
    listPriceDia = optDoubleOrZero("listPriceDia"),
    image = optString("image"),
    urlCoto = optString("urlCoto"),
    urlCarrefour = optString("urlCarrefour"),
    urlDia = optString("urlDia"),
    discountCoto = optString("discountCoto"),
    discountCarrefour = optString("discountCarrefour"),
    discountDia = optString("discountDia"),
)

fun JSONObject.toStoreProduct(): StoreProduct {
    val categories = buildList {
        val arr = optJSONArray("categories")
        if (arr != null) {
            for (i in 0 until arr.length()) {
                val value = arr.optString(i).trim()
                if (value.isNotBlank()) add(value)
            }
        }
    }
    val department = optString("department")
    val list = optDoubleOrZero("listPrice")
    val price = optDoubleOrZero("price")
    val hasDiscount = when {
        has("hasDiscount") -> optBoolean("hasDiscount", false)
        list > 0 && price > 0 -> list > price * 1.005
        else -> false
    }
    val discountLabel = optString("discountLabel").ifBlank {
        if (hasDiscount && list > 0 && price > 0) {
            val pct = max(1, round((1 - price / list) * 100).toInt())
            "$pct% OFF"
        } else {
            ""
        }
    }
    return StoreProduct(
        store = optString("store"),
        name = optString("name"),
        ean = optString("ean").ifBlank { optString("barcode") },
        price = price,
        listPrice = list,
        qtyUnit = if (optString("qtyUnit", "unit") == "kg") "kg" else "unit",
        image = optString("image"),
        url = optString("url"),
        brand = optString("brand"),
        department = department,
        categories = categories,
        hasDiscount = hasDiscount,
        discountLabel = discountLabel,
    )
}

fun StockItem.toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("name", name)
    .put("barcode", barcode)
    .put("category", category)
    .put("quantity", quantity)
    .put("minStock", minStock)
    .put("qtyUnit", qtyUnit)
    .put("price", price)
    .put("priceSource", priceSource)
    .put("priceCoto", priceCoto)
    .put("priceCarrefour", priceCarrefour)
    .put("priceDia", priceDia)
    .put("listPriceCoto", listPriceCoto)
    .put("listPriceCarrefour", listPriceCarrefour)
    .put("listPriceDia", listPriceDia)
    .put("image", image)
    .put("urlCoto", urlCoto)
    .put("urlCarrefour", urlCarrefour)
    .put("urlDia", urlDia)
    .put("discountCoto", discountCoto)
    .put("discountCarrefour", discountCarrefour)
    .put("discountDia", discountDia)

fun JSONArray.toStockItems(): List<StockItem> = buildList {
    for (i in 0 until length()) add(getJSONObject(i).toStockItem())
}

fun JSONArray.toStoreProducts(): List<StoreProduct> = buildList {
    for (i in 0 until length()) add(getJSONObject(i).toStoreProduct())
}

/** Une resultados de Coto / Carrefour / Día por EAN o nombre equivalente. */
fun buildWebCompareRows(
    coto: List<StoreProduct>,
    carrefour: List<StoreProduct>,
    dia: List<StoreProduct>,
): List<CompareRow> {
    val used = mapOf(
        "coto" to mutableSetOf<Int>(),
        "carrefour" to mutableSetOf(),
        "dia" to mutableSetOf(),
    )

    fun findPartner(seed: StoreProduct, list: List<StoreProduct>, store: String): Int =
        findCompareMatchIndex(seed, list, used.getValue(store))

    val rows = mutableListOf<CompareRow>()

    fun pushSeed(store: String, index: Int, list: List<StoreProduct>) {
        if (used.getValue(store).contains(index)) return
        val seed = list[index]
        used.getValue(store).add(index)

        val cotoIdx = if (store == "coto") index else findPartner(seed, coto, "coto")
        val carrefourIdx =
            if (store == "carrefour") index else findPartner(seed, carrefour, "carrefour")
        val diaIdx = if (store == "dia") index else findPartner(seed, dia, "dia")

        if (cotoIdx >= 0) used.getValue("coto").add(cotoIdx)
        if (carrefourIdx >= 0) used.getValue("carrefour").add(carrefourIdx)
        if (diaIdx >= 0) used.getValue("dia").add(diaIdx)

        val cotoProduct = cotoIdx.takeIf { it >= 0 }?.let { coto[it] }
        val carrefourProduct = carrefourIdx.takeIf { it >= 0 }?.let { carrefour[it] }
        val diaProduct = diaIdx.takeIf { it >= 0 }?.let { dia[it] }
        val primary = cotoProduct ?: carrefourProduct ?: diaProduct ?: return

        // Comparar: precio de la ficha web (Coto lista; Carrefour/Día Price).
        val cotoPrice = cotoProduct?.let { compareShelfPrice(it) } ?: 0.0
        val carrefourPrice = carrefourProduct?.let { compareShelfPrice(it) } ?: 0.0
        val diaPrice = diaProduct?.let { compareShelfPrice(it) } ?: 0.0
        val ean = primary.ean
        val id = ean.ifBlank { "$store:$index:${primary.name}" }

        rows.add(
            CompareRow(
                id = id,
                name = primary.name,
                barcode = ean,
                category = primary.categoryHint.ifBlank { "Alimentos" },
                priceCoto = cotoPrice,
                priceCarrefour = carrefourPrice,
                priceDia = diaPrice,
                listPriceCoto = cotoProduct?.listPrice ?: 0.0,
                listPriceCarrefour = carrefourProduct?.listPrice ?: 0.0,
                listPriceDia = diaProduct?.listPrice ?: 0.0,
                discountCoto = if (cotoProduct?.hasDiscount == true) cotoProduct.discountLabel else "",
                discountCarrefour =
                    if (carrefourProduct?.hasDiscount == true) carrefourProduct.discountLabel else "",
                discountDia = if (diaProduct?.hasDiscount == true) diaProduct.discountLabel else "",
                qtyUnit = primary.qtyUnit.ifBlank { "unit" },
                image = primary.image,
            ),
        )
    }

    coto.indices.forEach { pushSeed("coto", it, coto) }
    carrefour.indices.forEach { pushSeed("carrefour", it, carrefour) }
    dia.indices.forEach { pushSeed("dia", it, dia) }

    return rows.sortedWith(
        compareByDescending<CompareRow> {
            listOf(it.priceCoto, it.priceCarrefour, it.priceDia).count { price -> price > 0 }
        }.thenByDescending { row ->
            val prices = listOf(row.priceCoto, row.priceCarrefour, row.priceDia).filter { it > 0 }
            if (prices.size >= 2) prices.maxOrNull()!! - prices.minOrNull()!! else 0.0
        }.thenBy { it.name.lowercase() },
    )
}

fun money(value: Double): String {
    if (value <= 0) return "—"
    val formatted = "%,.2f".format(value).replace(',', 'X').replace('.', ',').replace('X', '.')
    return "$ $formatted"
}

fun qtyLabel(item: StockItem): String {
    return if (item.qtyUnit == "kg") {
        val grams = (item.quantity * 1000).toInt()
        if (grams >= 1000) {
            "${"%.2f".format(item.quantity).trimEnd('0').trimEnd('.')} kg"
        } else {
            "$grams g"
        }
    } else {
        if (item.quantity % 1.0 == 0.0) item.quantity.toInt().toString() else item.quantity.toString()
    }
}

fun cartQtyLabel(item: StockItem): String {
    val need = item.neededToMin
    return if (item.qtyUnit == "kg") {
        val g = (need * 1000).toInt()
        if (g >= 1000) "$need kg" else "$g g"
    } else {
        "×${if (need % 1.0 == 0.0) need.toInt() else need}"
    }
}
