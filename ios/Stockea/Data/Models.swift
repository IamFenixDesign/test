import Foundation

struct User: Equatable {
    var id: String
    var email: String
    var name: String
    var firstName: String
    var lastName: String
    var picture: String
    var provider: String

    var displayName: String {
        let full = [firstName, lastName].filter { !$0.isEmpty }.joined(separator: " ")
        if !full.isEmpty { return full }
        if !name.isEmpty { return name }
        return email
    }
}

struct StockItem: Identifiable, Equatable {
    var id: String
    var name: String
    var barcode: String = ""
    var category: String = "Alimentos"
    var quantity: Double = 0
    var minStock: Double = 0
    var qtyUnit: String = "unit"
    var price: Double = 0
    var priceSource: String = ""
    var priceCoto: Double = 0
    var priceCarrefour: Double = 0
    var priceDia: Double = 0
    var listPriceCoto: Double = 0
    var listPriceCarrefour: Double = 0
    var listPriceDia: Double = 0
    var image: String = ""
    var urlCoto: String = ""
    var urlCarrefour: String = ""
    var urlDia: String = ""
    var discountCoto: String = ""
    var discountCarrefour: String = ""
    var discountDia: String = ""

    var isLowStock: Bool { quantity < minStock || quantity <= 0 }
    var neededToMin: Double { normalizeQty(max(0, minStock - quantity), qtyUnit) }
    var shouldAutoCart: Bool { neededToMin > 0 }
}

struct CompareRow: Identifiable, Equatable {
    var id: String
    var name: String
    var barcode: String = ""
    var category: String = ""
    var priceCoto: Double = 0
    var priceCarrefour: Double = 0
    var priceDia: Double = 0
    var listPriceCoto: Double = 0
    var listPriceCarrefour: Double = 0
    var listPriceDia: Double = 0
    var discountCoto: String = ""
    var discountCarrefour: String = ""
    var discountDia: String = ""
    var qtyUnit: String = "unit"
    var image: String = ""
}

struct StoreProduct: Identifiable, Equatable {
    var id: String { "\(store)|\(ean)|\(name)" }
    var store: String
    var name: String
    var ean: String = ""
    var price: Double = 0
    var listPrice: Double = 0
    var qtyUnit: String = "unit"
    var image: String = ""
    var url: String = ""
    var brand: String = ""
    var department: String = ""
    var categories: [String] = []
    var hasDiscount: Bool = false
    var discountLabel: String = ""

    var displayPrice: Double { listPrice > 0 ? listPrice : price }
    var categoryHint: String {
        categories.first(where: { !$0.isEmpty }) ?? (department.isEmpty ? "" : department)
    }
}

struct StoreSearchResults: Equatable {
    var coto: [StoreProduct] = []
    var carrefour: [StoreProduct] = []
    var dia: [StoreProduct] = []
    var errors: [String: String] = [:]

    var isEmpty: Bool { coto.isEmpty && carrefour.isEmpty && dia.isEmpty }

    func preferTab() -> String {
        if !coto.isEmpty { return "coto" }
        if !carrefour.isEmpty { return "carrefour" }
        if !dia.isEmpty { return "dia" }
        return "coto"
    }

    func list(_ store: String) -> [StoreProduct] {
        switch store {
        case "carrefour": return carrefour
        case "dia": return dia
        default: return coto
        }
    }
}

struct LoginResult {
    var user: User
    var linked = false
    var created = false
    var itemCount = 0
    var moved = 0
    var merged = false
}

struct APIError: LocalizedError {
    var message: String
    var errorDescription: String? { message }
}

let stockCategories = ["Alimentos", "Bebidas", "Limpieza", "Papelería", "Insumos"]

func money(_ value: Double) -> String {
    if value <= 0 { return "—" }
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "es_AR")
    formatter.numberStyle = .decimal
    formatter.minimumFractionDigits = 2
    formatter.maximumFractionDigits = 2
    let text = formatter.string(from: NSNumber(value: value)) ?? String(format: "%.2f", value)
    return "$ \(text)"
}

func qtyLabel(_ item: StockItem) -> String {
    if item.qtyUnit == "kg" {
        let grams = Int((item.quantity * 1000).rounded())
        if grams >= 1000 {
            var text = String(format: "%.2f", item.quantity)
            while text.hasSuffix("0") { text.removeLast() }
            if text.hasSuffix(".") { text.removeLast() }
            return "\(text) kg"
        }
        return "\(grams) g"
    }
    if item.quantity.rounded() == item.quantity {
        return String(Int(item.quantity))
    }
    return String(item.quantity)
}

func cartQtyLabel(_ item: StockItem) -> String {
    let need = item.neededToMin
    if item.qtyUnit == "kg" {
        let grams = Int((need * 1000).rounded())
        if grams >= 1000 { return "\(need) kg" }
        return "\(grams) g"
    }
    if need.rounded() == need { return "×\(Int(need))" }
    return "×\(need)"
}

func normalizeQty(_ value: Double, _ unit: String = "unit") -> Double {
    guard value.isFinite, value >= 0 else { return 0 }
    if unit == "kg" {
        return (value * 10_000).rounded() / 10_000
    }
    return value.rounded()
}

func kgFromGrams(_ grams: Double) -> Double {
    guard grams.isFinite, grams >= 0 else { return 0 }
    return (grams * 10).rounded() / 10_000
}

func plainNumber(_ value: Double) -> String {
    guard value > 0 else { return "" }
    if value.rounded() == value { return String(Int(value)) }
    return String(value)
}

func gramsFromKg(_ kg: Double) -> Double {
    guard kg.isFinite, kg >= 0 else { return 0 }
    return (kg * 10_000).rounded() / 10
}

func formWeightForUnit(_ value: Double, fromUnit: String, toUnit: String) -> Double {
    let from = fromUnit == "kg" ? "kg" : "unit"
    let to = toUnit == "kg" ? "kg" : "unit"
    if from == to {
        return to == "kg" ? value : normalizeQty(value, "unit")
    }
    if from == "kg" {
        return normalizeQty(kgFromGrams(value), "unit")
    }
    return gramsFromKg(normalizeQty(value, "kg"))
}

func tracksStorePrices(_ item: StockItem) -> Bool {
    if item.priceSource == "coto" || item.priceSource == "carrefour" || item.priceSource == "dia" {
        return true
    }
    if !item.barcode.isEmpty { return true }
    return item.priceCoto > 0 || item.priceCarrefour > 0 || item.priceDia > 0
}

func extractEan13(_ query: String?) -> String {
    let raw = query ?? ""
    if raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "" }
    let compact = raw.replacingOccurrences(of: "\\s", with: "", options: .regularExpression)
    let runs = compact.matches(of: /\d{13}/).map { String($0.output) }
    let digits = raw.filter(\.isNumber)
    var candidates: [String] = runs
    if digits.count == 13 { candidates.append(digits) }
    if digits.count == 12 { candidates.append("0" + digits) }
    if digits.count > 13 {
        let chars = Array(digits)
        for i in 0...(chars.count - 13) {
            candidates.append(String(chars[i..<(i + 13)]))
        }
    }
    var unique: [String] = []
    for candidate in candidates where candidate.count == 13 && !unique.contains(candidate) {
        unique.append(candidate)
    }
    if unique.isEmpty { return "" }
    if let valid = unique.first(where: isValidEan13Checksum) { return valid }
    if let first = runs.first { return first }
    if digits.count == 13 { return digits }
    if digits.count == 12 { return "0" + digits }
    return unique[0]
}

func isValidEan13Checksum(_ ean: String) -> Bool {
    guard ean.count == 13, ean.allSatisfy(\.isNumber) else { return false }
    let chars = Array(ean)
    var sum = 0
    for i in 0..<12 {
        let n = Int(String(chars[i])) ?? 0
        sum += i % 2 == 0 ? n : n * 3
    }
    let check = (10 - (sum % 10)) % 10
    return check == Int(String(chars[12]))
}

func listPriceOfProduct(_ product: StoreProduct) -> Double {
    if product.listPrice > 0 { return product.listPrice }
    return product.price > 0 ? product.price : 0
}

func compareShelfPrice(_ product: StoreProduct) -> Double {
    if product.store == "carrefour" || product.store == "dia", product.price > 0 {
        return product.price
    }
    return listPriceOfProduct(product)
}

func guessCategory(_ product: StoreProduct) -> String {
    let hints: [(String, [String])] = [
        ("Bebidas", ["bebida", "gaseosa", "cerveza", "vino", "jugo", "soda", "aguas"]),
        ("Limpieza", ["limpieza", "lavandina", "detergente", "limpiador", "suavizante"]),
        ("Papelería", ["libreria", "papeler", "escritura", "boligrafo", "cuaderno"]),
        ("Insumos", ["insumo", "descartable", "packaging"]),
    ]
    let haystack = ([product.department, product.name] + product.categories)
        .joined(separator: " ")
        .folding(options: .diacriticInsensitive, locale: Locale(identifier: "es"))
        .lowercased()
    for (category, keys) in hints where keys.contains(where: { haystack.contains($0) }) {
        return category
    }
    return "Alimentos"
}
