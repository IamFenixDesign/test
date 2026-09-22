package app.stockea.android.data

import org.json.JSONArray
import org.json.JSONObject

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
    val inCart: Boolean = false,
    val cartQty: Double = 0.0,
) {
    val isLowStock: Boolean
        get() = quantity <= minStock
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
    val qtyUnit: String = "unit",
)

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
    inCart = optBoolean("inCart", false),
    cartQty = optDoubleOrZero("cartQty"),
)

fun JSONObject.toCompareRow(): CompareRow = CompareRow(
    id = optString("id").ifBlank { optString("barcode").ifBlank { optString("name") } },
    name = optString("name"),
    barcode = optString("barcode"),
    category = optString("category"),
    priceCoto = optDoubleOrZero("priceCoto"),
    priceCarrefour = optDoubleOrZero("priceCarrefour"),
    priceDia = optDoubleOrZero("priceDia"),
    listPriceCoto = optDoubleOrZero("listPriceCoto"),
    listPriceCarrefour = optDoubleOrZero("listPriceCarrefour"),
    listPriceDia = optDoubleOrZero("listPriceDia"),
    qtyUnit = optString("qtyUnit", "unit"),
)

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
    .put("inCart", inCart)
    .put("cartQty", cartQty)

fun JSONArray.toStockItems(): List<StockItem> = buildList {
    for (i in 0 until length()) add(getJSONObject(i).toStockItem())
}

fun JSONArray.toCompareRows(): List<CompareRow> = buildList {
    for (i in 0 until length()) add(getJSONObject(i).toCompareRow())
}

fun money(value: Double): String {
    if (value <= 0) return "—"
    val formatted = "%,.2f".format(value).replace(',', 'X').replace('.', ',').replace('X', '.')
    return "$ $formatted"
}

fun qtyLabel(item: StockItem): String {
    return if (item.qtyUnit == "kg") {
        val grams = (item.quantity * 1000).toInt()
        if (grams >= 1000) "${"%.2f".format(item.quantity).trimEnd('0').trimEnd('.')} kg" else "$grams g"
    } else {
        if (item.quantity % 1.0 == 0.0) item.quantity.toInt().toString() else item.quantity.toString()
    }
}
