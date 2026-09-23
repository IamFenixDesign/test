import Foundation

private let compareFillers: Set<String> = [
    "x", "kg", "kgs", "kilo", "kilogramo", "gr", "grs", "g", "gramo", "gramos",
    "ml", "cc", "cl", "lt", "l", "litro", "litros", "un", "u", "und", "unidad", "unidades",
    "pack", "paq", "paquete", "botella", "sachet", "tetra", "ttb", "caja", "bolsa", "malla",
    "porron", "lata", "frasco", "pote", "vaso", "brick", "brik",
    "huella", "natural", "classic", "clasica", "clasico", "comun", "seleccion",
    "largo", "larga", "vida", "uat", "ultra",
]

private let compareStrongVariants: [[String]] = [
    ["cherry", "cocktail"], ["perita"], ["kumato"], ["raf"],
    ["organico", "organica"], ["deshidrat", "deshidratado", "deshidratada"],
    ["relleno", "rellena"], ["especial"], ["racimo", "rama"], ["comercial"],
    ["light", "liviana", "descremada", "parcialmente"],
    ["enter", "entera", "entero"],
]

private let compareSynonyms = ["redondo": "red", "red": "red", "cavendish": "banana"]

private let compareWeakBrands: Set<String> = [
    "dia", "carrefour", "coto", "classic", "clasica", "clasico",
    "huella", "huellanatural", "natural", "generico", "comun", "",
]

private let compareGenericTokens: Set<String> = [
    "leche", "agua", "aceite", "arroz", "azucar", "sal", "yogur", "yogurt", "jugo",
    "pan", "queso", "crema", "manteca", "huevo", "cerveza", "vino", "gaseosa",
    "fideo", "harina", "cafe", "te", "galletita", "entera", "enter", "descremada",
    "light", "polvo", "sabor",
]

private let compareNameMatchMin = 48.0

private func fold(_ text: String) -> String {
    text.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es"))
        .lowercased()
        .replacingOccurrences(of: "ñ", with: "n")
}

private func canonToken(_ token: String) -> String {
    var t = fold(token).replacingOccurrences(of: "[^a-z0-9]", with: "", options: .regularExpression)
    if t.isEmpty { return "" }
    if let mapped = compareSynonyms[t] { return mapped }
    if t.hasSuffix("es"), t.count > 5 { t.removeLast(2) }
    else if t.hasSuffix("s"), t.count > 4 { t.removeLast() }
    return t
}

private func extractSize(_ name: String) -> String {
    let text = fold(name)
    let pattern = #"\b(\d+[.,]?\d*)\s*(kg|kgs|g|gr|grs|grm|ml|cc|cl|l|lt|lts)\b"#
    guard let match = text.range(of: pattern, options: .regularExpression) else { return "" }
    let chunk = String(text[match])
    let parts = chunk.split(whereSeparator: { !$0.isNumber && $0 != "." && $0 != "," })
    guard let number = parts.first else { return "" }
    var unit = chunk.filter { $0.isLetter }
    if ["grs", "gr", "grm"].contains(unit) { unit = "g" }
    if unit == "kgs" { unit = "kg" }
    if unit == "lts" || unit == "lt" { unit = "l" }
    if unit == "cc" { unit = "ml" }
    return String(number).replacingOccurrences(of: ",", with: ".") + unit
}

private struct CompareIdentity {
    var unit: String
    var size: String
    var tokens: [String]
    var variants: Set<String>
    var brand: String
    var folded: String
}

private func identity(_ product: StoreProduct) -> CompareIdentity {
    let folded = fold(product.name)
    let raw = folded.replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
        .split(separator: " ")
        .map { canonToken(String($0)) }
        .filter { !$0.isEmpty }
    var seen = Set<String>()
    var tokens: [String] = []
    for token in raw where !compareFillers.contains(token) && !token.allSatisfy(\.isNumber) && seen.insert(token).inserted {
        tokens.append(token)
    }
    let joined = tokens.joined(separator: " ")
    var variants = Set<String>()
    for group in compareStrongVariants where group.contains(where: { tokens.contains($0) || joined.contains($0) }) {
        if let first = group.first { variants.insert(first) }
    }
    return CompareIdentity(
        unit: product.qtyUnit == "kg" ? "kg" : "unit",
        size: extractSize(folded),
        tokens: tokens,
        variants: variants,
        brand: canonToken(product.brand),
        folded: folded
    )
}

private func variantsCompatible(_ a: CompareIdentity, _ b: CompareIdentity) -> Bool {
    let onlyA = a.variants.subtracting(b.variants)
    let onlyB = b.variants.subtracting(a.variants)
    if onlyA.isEmpty && onlyB.isEmpty { return true }
    if !onlyA.isEmpty && !onlyB.isEmpty { return false }
    return true
}

func scoreCompareMatch(_ seed: StoreProduct?, _ candidate: StoreProduct?) -> Double {
    guard let seed, let candidate else { return 0 }
    let a = identity(seed)
    let b = identity(candidate)
    if a.unit != b.unit { return 0 }
    if !a.size.isEmpty || !b.size.isEmpty {
        if a.size.isEmpty || b.size.isEmpty || a.size != b.size { return 0 }
    }
    if !variantsCompatible(a, b) { return 0 }
    let brandA = (!a.brand.isEmpty && !compareWeakBrands.contains(a.brand)) ? a.brand : ""
    let brandB = (!b.brand.isEmpty && !compareWeakBrands.contains(b.brand)) ? b.brand : ""
    if a.unit == "unit" {
        if !brandA.isEmpty && !brandB.isEmpty && brandA != brandB { return 0 }
        if !brandA.isEmpty && brandB.isEmpty && !b.folded.contains(brandA) && !b.tokens.contains(brandA) { return 0 }
        if !brandB.isEmpty && brandA.isEmpty && !a.folded.contains(brandB) && !a.tokens.contains(brandB) { return 0 }
    }
    if a.tokens.isEmpty || b.tokens.isEmpty { return 0 }
    let setA = Set(a.tokens)
    let setB = Set(b.tokens)
    let inter = setA.intersection(setB)
    if inter.isEmpty { return 0 }
    if a.unit == "unit" && inter.count < 2 && !( !brandA.isEmpty && brandA == brandB) { return 0 }
    if a.unit == "unit" && brandA.isEmpty && brandB.isEmpty {
        let specific = inter.filter { !compareGenericTokens.contains($0) }
        if specific.isEmpty || inter.count < 3 { return 0 }
    }
    if let headA = a.tokens.first, let headB = b.tokens.first,
       headA != headB, !inter.contains(headA), !inter.contains(headB) {
        return 0
    }
    let union = setA.union(setB)
    var score = (Double(inter.count) / Double(union.count)) * 70
    if !a.size.isEmpty && a.size == b.size { score += 18 }
    if a.unit == "kg" { score += 8 }
    if !brandA.isEmpty && brandA == brandB { score += 16 }
    if inter.count >= 2 { score += 10 }
    if inter.count >= 3 { score += 8 }
    if let first = inter.first, a.folded.contains(first), b.folded.contains(first) { score += 4 }
    return score
}

func findCompareMatchIndex(_ seed: StoreProduct, _ list: [StoreProduct], used: Set<Int>) -> Int {
    if list.isEmpty { return -1 }
    if !seed.ean.isEmpty {
        for (index, product) in list.enumerated() where !used.contains(index) && product.ean == seed.ean && !product.ean.isEmpty {
            return index
        }
    }
    var best = -1
    var bestScore = 0.0
    for (index, product) in list.enumerated() where !used.contains(index) {
        let score = scoreCompareMatch(seed, product)
        if score >= compareNameMatchMin && score > bestScore {
            bestScore = score
            best = index
        }
    }
    return best
}

func buildWebCompareRows(coto: [StoreProduct], carrefour: [StoreProduct], dia: [StoreProduct]) -> [CompareRow] {
    var used = ["coto": Set<Int>(), "carrefour": Set<Int>(), "dia": Set<Int>()]
    var rows: [CompareRow] = []

    func partner(_ seed: StoreProduct, _ list: [StoreProduct], _ store: String) -> Int {
        findCompareMatchIndex(seed, list, used: used[store] ?? [])
    }

    func push(store: String, index: Int, list: [StoreProduct]) {
        if used[store]?.contains(index) == true { return }
        let seed = list[index]
        used[store, default: []].insert(index)
        let cotoIdx = store == "coto" ? index : partner(seed, coto, "coto")
        let carrefourIdx = store == "carrefour" ? index : partner(seed, carrefour, "carrefour")
        let diaIdx = store == "dia" ? index : partner(seed, dia, "dia")
        if cotoIdx >= 0 { used["coto", default: []].insert(cotoIdx) }
        if carrefourIdx >= 0 { used["carrefour", default: []].insert(carrefourIdx) }
        if diaIdx >= 0 { used["dia", default: []].insert(diaIdx) }
        let cotoProduct = cotoIdx >= 0 ? coto[cotoIdx] : nil
        let carrefourProduct = carrefourIdx >= 0 ? carrefour[carrefourIdx] : nil
        let diaProduct = diaIdx >= 0 ? dia[diaIdx] : nil
        guard let primary = cotoProduct ?? carrefourProduct ?? diaProduct else { return }
        let ean = primary.ean
        rows.append(CompareRow(
            id: ean.isEmpty ? "\(store):\(index):\(primary.name)" : ean,
            name: primary.name,
            barcode: ean,
            category: primary.categoryHint.isEmpty ? guessCategory(primary) : primary.categoryHint,
            priceCoto: cotoProduct.map(compareShelfPrice) ?? 0,
            priceCarrefour: carrefourProduct.map(compareShelfPrice) ?? 0,
            priceDia: diaProduct.map(compareShelfPrice) ?? 0,
            listPriceCoto: cotoProduct?.listPrice ?? 0,
            listPriceCarrefour: carrefourProduct?.listPrice ?? 0,
            listPriceDia: diaProduct?.listPrice ?? 0,
            discountCoto: cotoProduct?.hasDiscount == true ? (cotoProduct?.discountLabel ?? "") : "",
            discountCarrefour: carrefourProduct?.hasDiscount == true ? (carrefourProduct?.discountLabel ?? "") : "",
            discountDia: diaProduct?.hasDiscount == true ? (diaProduct?.discountLabel ?? "") : "",
            qtyUnit: primary.qtyUnit == "kg" ? "kg" : "unit",
            image: primary.image
        ))
    }

    for index in coto.indices { push(store: "coto", index: index, list: coto) }
    for index in carrefour.indices { push(store: "carrefour", index: index, list: carrefour) }
    for index in dia.indices { push(store: "dia", index: index, list: dia) }

    return rows.sorted { a, b in
        let countA = [a.priceCoto, a.priceCarrefour, a.priceDia].filter { $0 > 0 }.count
        let countB = [b.priceCoto, b.priceCarrefour, b.priceDia].filter { $0 > 0 }.count
        if countA != countB { return countA > countB }
        func spread(_ row: CompareRow) -> Double {
            let prices = [row.priceCoto, row.priceCarrefour, row.priceDia].filter { $0 > 0 }
            guard prices.count >= 2, let maxP = prices.max(), let minP = prices.min() else { return 0 }
            return maxP - minP
        }
        let spreadA = spread(a)
        let spreadB = spread(b)
        if spreadA != spreadB { return spreadA > spreadB }
        return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
    }
}
