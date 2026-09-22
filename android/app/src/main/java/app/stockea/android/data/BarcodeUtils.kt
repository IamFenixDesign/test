package app.stockea.android.data

/** Extrae un EAN-13 (UPC-A de 12 → EAN con 0), igual que la web. */
fun extractEan13(query: String?): String {
    val raw = query.orEmpty()
    if (raw.isBlank()) return ""

    val compact = raw.replace("\\s".toRegex(), "")
    val runs = Regex("\\d{13}").findAll(compact).map { it.value }.toList()
    val digits = raw.filter { it.isDigit() }
    val candidates = mutableListOf<String>()
    candidates.addAll(runs)

    if (digits.length == 13) candidates.add(digits)
    if (digits.length == 12) candidates.add("0$digits")
    if (digits.length > 13) {
        for (i in 0..digits.length - 13) {
            candidates.add(digits.substring(i, i + 13))
        }
    }

    val unique = candidates.filter { it.length == 13 }.distinct()
    if (unique.isEmpty()) return ""

    val withChecksum = unique.firstOrNull { isValidEan13Checksum(it) }
    if (withChecksum != null) return withChecksum
    if (runs.isNotEmpty()) return runs.first()
    if (digits.length == 13) return digits
    if (digits.length == 12) return "0$digits"
    return unique.first()
}

fun isValidEan13Checksum(ean: String): Boolean {
    if (ean.length != 13 || ean.any { !it.isDigit() }) return false
    var sum = 0
    for (i in 0 until 12) {
        val n = ean[i] - '0'
        sum += if (i % 2 == 0) n else n * 3
    }
    val check = (10 - (sum % 10)) % 10
    return check == (ean[12] - '0')
}
