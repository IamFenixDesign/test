package app.stockea.android.data

import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

const val STOCK_EXPORT_VERSION = 1
const val STOCK_EXPORT_APP = "stockea"

fun buildStockExportJson(items: List<StockItem>): String {
    val arr = JSONArray()
    items.forEach { arr.put(it.toJson()) }
    return JSONObject()
        .put("version", STOCK_EXPORT_VERSION)
        .put("app", STOCK_EXPORT_APP)
        .put("exportedAt", java.time.Instant.now().toString())
        .put("items", arr)
        .toString(2)
}

data class ParsedStockExport(val items: List<StockItem>)

fun parseStockExportJson(raw: String): ParsedStockExport {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) throw IllegalArgumentException("El archivo está vacío")

    val list: JSONArray = when {
        trimmed.startsWith("[") -> JSONArray(trimmed)
        else -> {
            val obj = JSONObject(trimmed)
            obj.optJSONArray("items")
                ?: throw IllegalArgumentException("No encontramos una lista de productos en el archivo")
        }
    }

    if (list.length() == 0) throw IllegalArgumentException("La lista está vacía")

    val items = buildList {
        for (i in 0 until list.length()) {
            val entry = list.optJSONObject(i) ?: continue
            val name = entry.optString("name").trim()
            if (name.isBlank()) continue
            if (entry.optString("id").isBlank()) {
                entry.put("id", UUID.randomUUID().toString())
            }
            add(entry.toStockItem())
        }
    }
    if (items.isEmpty()) throw IllegalArgumentException("No hay productos válidos para importar")
    return ParsedStockExport(items)
}

data class MergedStock(
    val items: List<StockItem>,
    val added: Int,
    val updated: Int,
)

fun mergeStockLists(current: List<StockItem>, incoming: List<StockItem>): MergedStock {
    val byId = LinkedHashMap<String, StockItem>()
    current.forEach { byId[it.id] = it }
    var added = 0
    var updated = 0
    incoming.forEach { item ->
        if (byId.containsKey(item.id)) updated += 1 else added += 1
        byId[item.id] = item
    }
    return MergedStock(items = byId.values.toList(), added = added, updated = updated)
}
