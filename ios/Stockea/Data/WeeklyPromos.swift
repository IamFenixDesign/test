import Foundation

struct WeekdayChip: Identifiable {
    var id: Int
    var short: String
    var label: String
}

struct PaymentPromo: Identifiable, Equatable {
    var id: String
    var store: String?
    var percent: Int
    var short: String
    var days: [Int]?
    var payment: String
    var excludeVisaNfc = false
    var excludeCarrefourBank = false
}

struct CartQuoteLine: Identifiable {
    var id: String
    var item: StockItem
    var need: Double
    var unitPrice: Double
    var lineTotal: Double
    var discount: Double
    var payable: Double
    var eligible: Bool
    var reason: String
}

struct CartQuote {
    var promo: PaymentPromo
    var eligible: [CartQuoteLine]
    var excluded: [CartQuoteLine]
    var payable: Double
    var discountTotal: Double
    var subtotal: Double

    var lines: [CartQuoteLine] { eligible + excluded }
}

let weekdays: [WeekdayChip] = [
    .init(id: 1, short: "Lun", label: "Lunes"),
    .init(id: 2, short: "Mar", label: "Martes"),
    .init(id: 3, short: "Mié", label: "Miércoles"),
    .init(id: 4, short: "Jue", label: "Jueves"),
    .init(id: 5, short: "Vie", label: "Viernes"),
    .init(id: 6, short: "Sáb", label: "Sábado"),
    .init(id: 0, short: "Dom", label: "Domingo"),
]

func todayWeekday() -> Int {
    Calendar.current.component(.weekday, from: Date()) - 1
}

func weekdayLabel(_ day: Int) -> String {
    weekdays.first { $0.id == day }?.label ?? ""
}

private let visaNfcExclusions = [
    "electro", "heladera", "lavarropa", "notebook", "televisor", "smart tv",
    "neumatic", "bicicleta", "patin", "rodado", "estacionamiento", "coto bar",
    "coto express", "catena", "rutini", "trumpeter", "chandon", "terrazas",
    "saint felicien", "alma negra",
]

private let carrefourBankExclusions = [
    "electro", "heladera", "lavarropa", "notebook", "televisor", "smart tv",
    "celular", "telefon", "carnicer", "vacuna", "pollo", "cerdo", "embutido",
]

let paymentPromos: [PaymentPromo] = [
    .init(id: "none", store: nil, percent: 0, short: "Lista", days: nil, payment: ""),
    .init(id: "coto-modo-ciudad-lun", store: "coto", percent: 25, short: "MODO Ciudad", days: [1], payment: "MODO QR · Visa/MC/Cabal Ciudad"),
    .init(id: "coto-anses", store: "coto", percent: 10, short: "ANSES Coto", days: [1, 2, 3, 4], payment: "Débito/crédito + DNI ANSES"),
    .init(id: "coto-modo-mar", store: "coto", percent: 20, short: "MODO Coto", days: [2], payment: "MODO QR · bancos adheridos"),
    .init(id: "coto-comunidad", store: "coto", percent: 15, short: "Comunidad", days: [3], payment: "Cualquier medio · DNI Comunidad"),
    .init(id: "coto-superapp-mie", store: "coto", percent: 25, short: "SuperApp", days: [3], payment: "SuperApp Coto"),
    .init(id: "visa-nfc-coto", store: "coto", percent: 30, short: "Visa NFC", days: [4], payment: "Visa Débito NFC", excludeVisaNfc: true),
    .init(id: "coto-icbc-deb-jue", store: "coto", percent: 20, short: "ICBC Coto", days: [4], payment: "Visa Débito ICBC"),
    .init(id: "mp-coto-vie", store: "coto", percent: 25, short: "MP Coto", days: [5], payment: "Mercado Pago QR"),
    .init(id: "mp-coto-finde", store: "coto", percent: 20, short: "MP Coto", days: [6, 0], payment: "Mercado Pago QR"),
    .init(id: "mp-carrefour-lun", store: "carrefour", percent: 15, short: "MP Carrefour", days: [1], payment: "Crédito vía Mercado Pago QR", excludeCarrefourBank: true),
    .init(id: "carrefour-banco-maxi-lunmar", store: "carrefour", percent: 15, short: "CF Banco Maxi", days: [1, 2], payment: "Tarjeta Carrefour Banco", excludeCarrefourBank: true),
    .init(id: "carrefour-anses", store: "carrefour", percent: 10, short: "ANSES CF", days: [1, 2, 3], payment: "Débito o Mi Carrefour", excludeCarrefourBank: true),
    .init(id: "carrefour-banco-mar", store: "carrefour", percent: 20, short: "CF Banco", days: [2], payment: "Tarjeta Carrefour Banco", excludeCarrefourBank: true),
    .init(id: "carrefour-cuenta-dni-mie", store: "carrefour", percent: 10, short: "Cuenta DNI", days: [3], payment: "Cuenta DNI"),
    .init(id: "mp-carrefour", store: "carrefour", percent: 15, short: "MP Carrefour", days: [4], payment: "Dinero en cuenta"),
    .init(id: "mp-carrefour-maxi-vie", store: "carrefour", percent: 10, short: "MP Maxi", days: [5], payment: "Dinero en cuenta", excludeCarrefourBank: true),
    .init(id: "carrefour-nacion-modo", store: "carrefour", percent: 5, short: "Nación MODO", days: [1, 2, 3, 4, 5], payment: "MODO · Nación", excludeCarrefourBank: true),
    .init(id: "dia-naranja-x-mar", store: "dia", percent: 30, short: "Naranja X", days: [2], payment: "Naranja X · Plan Épico"),
    .init(id: "mp-dia-mie", store: "dia", percent: 15, short: "MP Día", days: [3], payment: "Mercado Pago QR"),
    .init(id: "dia-galicia-viesab", store: "dia", percent: 20, short: "Galicia Día", days: [5, 6], payment: "Galicia · débito/crédito o QR"),
    .init(id: "dia-nacion-lunvie", store: "dia", percent: 5, short: "Nación Día", days: [1, 2, 3, 4, 5], payment: "Débito/crédito Nación o MODO"),
]

func promosForDay(_ day: Int) -> [PaymentPromo] {
    paymentPromos.filter { promo in
        promo.id == "none" || promo.days == nil || promo.days?.contains(day) == true
    }
}

func promosForDayGrouped(_ day: Int) -> [(String, [PaymentPromo])] {
    let list = promosForDay(day).filter { $0.id != "none" }
    let order = ["coto", "carrefour", "dia"]
    let titles = ["coto": "Coto", "carrefour": "Carrefour", "dia": "Día"]
    return order.compactMap { store in
        let rows = list.filter { $0.store == store }.sorted { $0.percent > $1.percent }
        guard !rows.isEmpty else { return nil }
        return (titles[store] ?? store, rows)
    }
}

func quoteCart(items: [StockItem], promoId: String) -> CartQuote {
    let promo = paymentPromos.first { $0.id == promoId } ?? paymentPromos[0]
    var eligible: [CartQuoteLine] = []
    var excluded: [CartQuoteLine] = []
    for item in items {
        let need = item.neededToMin
        guard need > 0 else { continue }
        if promo.store == nil || promo.percent <= 0 {
            let unit = item.price
            let total = unit * need
            eligible.append(CartQuoteLine(
                id: item.id, item: item, need: need, unitPrice: unit, lineTotal: total,
                discount: 0, payable: total, eligible: true, reason: ""
            ))
            continue
        }
        let unit = storeUnitPrice(item, promo.store ?? "")
        let total = unit * need
        let reason = exclusionReason(promo, item, unit)
        if !reason.isEmpty || unit <= 0 {
            let fallback = item.price
            let fallbackTotal = (unit > 0 ? unit : fallback) * need
            excluded.append(CartQuoteLine(
                id: item.id, item: item, need: need,
                unitPrice: unit > 0 ? unit : fallback,
                lineTotal: fallbackTotal, discount: 0, payable: fallbackTotal,
                eligible: false, reason: reason.isEmpty ? "Sin precio del súper" : reason
            ))
            continue
        }
        let discount = total * Double(promo.percent) / 100
        eligible.append(CartQuoteLine(
            id: item.id, item: item, need: need, unitPrice: unit, lineTotal: total,
            discount: discount, payable: max(0, total - discount), eligible: true, reason: ""
        ))
    }
    let discountTotal = eligible.reduce(0) { $0 + $1.discount }
    let payable = eligible.reduce(0) { $0 + $1.payable } + excluded.reduce(0) { $0 + $1.payable }
    let subtotal = eligible.reduce(0) { $0 + $1.lineTotal } + excluded.reduce(0) { $0 + $1.lineTotal }
    return CartQuote(
        promo: promo, eligible: eligible, excluded: excluded,
        payable: payable, discountTotal: discountTotal, subtotal: subtotal
    )
}

private func fold(_ text: String) -> String {
    text.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es"))
        .lowercased()
        .replacingOccurrences(of: "ñ", with: "n")
}

private func storeUnitPrice(_ item: StockItem, _ store: String) -> Double {
    switch store {
    case "coto":
        if item.listPriceCoto > 0 { return item.listPriceCoto }
        if item.priceCoto > 0 { return item.priceCoto }
        if item.priceSource == "coto" { return item.price }
    case "carrefour":
        if item.listPriceCarrefour > 0 { return item.listPriceCarrefour }
        if item.priceCarrefour > 0 { return item.priceCarrefour }
        if item.priceSource == "carrefour" { return item.price }
    case "dia":
        if item.listPriceDia > 0 { return item.listPriceDia }
        if item.priceDia > 0 { return item.priceDia }
        if item.priceSource == "dia" { return item.price }
    default:
        break
    }
    return 0
}

private func webDiscount(_ item: StockItem, _ store: String) -> String {
    let label: String
    switch store {
    case "coto": label = item.discountCoto
    case "carrefour": label = item.discountCarrefour
    case "dia": label = item.discountDia
    default: label = ""
    }
    let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return "" }
    let hay = fold(trimmed)
    if hay.contains("exclusiv") && (hay.contains("online") || hay.contains("digital") || hay.contains("web")) {
        return ""
    }
    if hay.contains("solo online") || hay.contains("solo digital") || hay.contains("venta online") {
        return ""
    }
    return trimmed
}

private func exclusionReason(_ promo: PaymentPromo, _ item: StockItem, _ unitPrice: Double) -> String {
    guard let store = promo.store else { return "" }
    if unitPrice <= 0 {
        let name = store == "dia" ? "Día" : store.capitalized
        return "Sin precio en \(name)"
    }
    if store == "coto" && !webDiscount(item, "coto").isEmpty {
        return "Ya tiene descuento web en Coto"
    }
    if promo.excludeVisaNfc {
        let hay = fold("\(item.name) \(item.category)")
        if visaNfcExclusions.contains(where: { hay.contains($0) }) { return "Excluido de Visa NFC" }
    }
    if promo.excludeCarrefourBank {
        let hay = fold("\(item.name) \(item.category)")
        if carrefourBankExclusions.contains(where: { hay.contains($0) }) { return "Excluido de promo bancaria" }
    }
    return ""
}
