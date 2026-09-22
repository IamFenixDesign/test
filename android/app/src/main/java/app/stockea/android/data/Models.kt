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

fun qtyUnitOfProduct(product: StoreProduct): String =
    if (product.qtyUnit == "kg") "kg" else "unit"

fun matchByEan(product: StoreProduct, otherList: List<StoreProduct>): StoreProduct? {
    if (product.ean.isBlank()) return null
    return otherList.firstOrNull { it.ean.isNotBlank() && it.ean == product.ean }
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

/** Une resultados de Coto / Carrefour / Día por EAN, igual que la web. */
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

    fun findByEan(list: List<StoreProduct>, store: String, ean: String): Int {
        if (ean.isBlank()) return -1
        list.forEachIndexed { index, product ->
            if (!used.getValue(store).contains(index) && product.ean.isNotBlank() && product.ean == ean) {
                return index
            }
        }
        return -1
    }

    val rows = mutableListOf<CompareRow>()

    fun pushSeed(store: String, index: Int, list: List<StoreProduct>) {
        if (used.getValue(store).contains(index)) return
        val seed = list[index]
        used.getValue(store).add(index)

        val cotoIdx = if (store == "coto") index else findByEan(coto, "coto", seed.ean)
        val carrefourIdx =
            if (store == "carrefour") index else findByEan(carrefour, "carrefour", seed.ean)
        val diaIdx = if (store == "dia") index else findByEan(dia, "dia", seed.ean)

        if (cotoIdx >= 0) used.getValue("coto").add(cotoIdx)
        if (carrefourIdx >= 0) used.getValue("carrefour").add(carrefourIdx)
        if (diaIdx >= 0) used.getValue("dia").add(diaIdx)

        val cotoProduct = cotoIdx.takeIf { it >= 0 }?.let { coto[it] }
        val carrefourProduct = carrefourIdx.takeIf { it >= 0 }?.let { carrefour[it] }
        val diaProduct = diaIdx.takeIf { it >= 0 }?.let { dia[it] }
        val primary = cotoProduct ?: carrefourProduct ?: diaProduct ?: return

        // Comparar: precio de lista (como en la web), no el de oferta.
        val cotoPrice = cotoProduct?.let { listPriceOfProduct(it) } ?: 0.0
        val carrefourPrice = carrefourProduct?.let { listPriceOfProduct(it) } ?: 0.0
        val diaPrice = diaProduct?.let { listPriceOfProduct(it) } ?: 0.0
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
