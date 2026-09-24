import Foundation

enum MainTab: String {
    case stock, compare, profile
}

struct NewItemDraft {
    var name = ""
    var barcode = ""
    var category = "Alimentos"
    var quantity = 1.0
    var minStock = 1.0
    var qtyUnit = "unit"
    var price = 0.0
    var priceSource = ""
    var priceCoto = 0.0
    var priceCarrefour = 0.0
    var priceDia = 0.0
    var listPriceCoto = 0.0
    var listPriceCarrefour = 0.0
    var listPriceDia = 0.0
    var image = ""
    var urlCoto = ""
    var urlCarrefour = ""
    var urlDia = ""
    var discountCoto = ""
    var discountCarrefour = ""
    var discountDia = ""
    var customPrice = ""
}

struct AppState {
    var booting = true
    var darkTheme = true
    var user: User?
    var items: [StockItem] = []
    var cartRemoved: Set<String> = []
    var tab: MainTab = .stock
    var busy = false
    var error = ""
    var info = ""
    var compareQuery = ""
    var compareResults: [CompareRow] = []
    var compareBusy = false
    var compareError = ""
    var showNewItem = false
    var editingItemId: String?
    var showCart = false
    var showScanner = false
    var scannedEan: String?
    var storeLookupBusy = false
    var storeLookupError = ""
    var storeResults = StoreSearchResults()
    var storeTab = "coto"
    var allowCustomPrice = false

    var cartItems: [StockItem] {
        items.filter { $0.shouldAutoCart && !cartRemoved.contains($0.id) }
    }

    func isInCart(_ id: String) -> Bool {
        guard let item = items.first(where: { $0.id == id }) else { return false }
        return item.shouldAutoCart && !cartRemoved.contains(id)
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published var state = AppState()

    private let api = APIClient()
    private var priceRefreshTask: Task<Void, Never>?
    private var compareTask: Task<Void, Never>?
    private var priceRefreshAt: [String: Date] = [:]
    private var refreshingPrices = false

    init() {
        Task { await boot() }
    }

    func boot() async {
        let user = try? await api.me()
        if let user {
            let items = (try? await api.fetchItems()) ?? []
            state.booting = false
            state.user = user
            state.items = items
            state.cartRemoved = pruneCartRemoved(state.cartRemoved, items)
            startPriceRefreshLoop()
        } else {
            state.booting = false
            state.user = nil
        }
    }

    func applySystemTheme(dark: Bool) {
        state.darkTheme = dark
    }

    func setTab(_ tab: MainTab) {
        if tab != .compare {
            compareTask?.cancel()
            compareTask = nil
        }
        state.tab = tab
        state.error = ""
        state.info = ""
        state.compareError = ""
        state.showNewItem = false
        state.editingItemId = nil
        state.showCart = false
        state.showScanner = false
        state.scannedEan = nil
        clearStoreLookup()
        if tab == .stock { refreshItems() }
        if tab == .compare {
            let query = state.compareQuery.trimmingCharacters(in: .whitespacesAndNewlines)
            if query.count >= 2 { startComparePoll(query, showSpinner: false) }
        }
    }

    func clearMessages() {
        state.error = ""
        state.info = ""
    }

    func openNewItem() {
        state.editingItemId = nil
        state.showNewItem = true
        state.showCart = false
        state.tab = .stock
        state.showScanner = false
        state.scannedEan = nil
        state.error = ""
        clearStoreLookup()
    }

    func openEdit(_ item: StockItem) {
        state.editingItemId = item.id
        state.showNewItem = true
        state.showCart = false
        state.tab = .stock
        state.showScanner = false
        state.scannedEan = nil
        state.error = ""
        clearStoreLookup()
        state.allowCustomPrice = item.priceSource == "custom"
    }

    func editingDraft() -> NewItemDraft? {
        guard let id = state.editingItemId,
              let item = state.items.first(where: { $0.id == id }) else { return nil }
        let kg = item.qtyUnit == "kg"
        return NewItemDraft(
            name: item.name,
            barcode: item.barcode,
            category: stockCategories.contains(item.category) ? item.category : "Alimentos",
            quantity: kg ? gramsFromKg(item.quantity) : item.quantity,
            minStock: kg ? gramsFromKg(item.minStock) : item.minStock,
            qtyUnit: kg ? "kg" : "unit",
            price: item.price,
            priceSource: item.priceSource,
            priceCoto: item.priceCoto,
            priceCarrefour: item.priceCarrefour,
            priceDia: item.priceDia,
            listPriceCoto: item.listPriceCoto,
            listPriceCarrefour: item.listPriceCarrefour,
            listPriceDia: item.listPriceDia,
            image: item.image,
            urlCoto: item.urlCoto,
            urlCarrefour: item.urlCarrefour,
            urlDia: item.urlDia,
            discountCoto: item.discountCoto,
            discountCarrefour: item.discountCarrefour,
            discountDia: item.discountDia,
            customPrice: item.priceSource == "custom" ? plainNumber(item.price) : ""
        )
    }

    func closeNewItem() {
        state.showNewItem = false
        state.editingItemId = nil
        state.showScanner = false
        state.scannedEan = nil
        clearStoreLookup()
    }

    func openCart() {
        refreshItems()
        state.showCart = true
        state.showNewItem = false
        state.editingItemId = nil
        state.showScanner = false
        state.tab = .stock
    }

    func closeCart() { state.showCart = false }

    func openScanner() { state.showScanner = true }
    func closeScanner() { state.showScanner = false }

    func onScannedEan(_ ean: String) {
        state.showScanner = false
        state.scannedEan = ean
        state.showNewItem = true
        state.info = "EAN \(ean) cargado · buscando…"
    }

    func consumeScannedEan() { state.scannedEan = nil }

    func clearStoreLookup() {
        state.storeLookupBusy = false
        state.storeLookupError = ""
        state.storeResults = StoreSearchResults()
        state.storeTab = "coto"
        state.allowCustomPrice = false
    }

    func setStoreTab(_ tab: String) { state.storeTab = tab }

    func enableCustomPrice() {
        state.allowCustomPrice = true
        state.storeLookupError = ""
    }

    func lookupStores(_ query: String) {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2 else {
            state.storeLookupError = "Escribí un producto o EAN."
            return
        }
        Task {
            state.storeLookupBusy = true
            state.storeLookupError = ""
            state.storeResults = StoreSearchResults()
            state.allowCustomPrice = false
            do {
                let results = try await api.searchSupersRaw(query: q, limit: 24)
                state.storeLookupBusy = false
                state.storeResults = results
                if results.isEmpty {
                    state.storeTab = "coto"
                    state.allowCustomPrice = true
                    state.storeLookupError = "No está en Coto, Carrefour ni Día. Podés cargar un precio personalizado."
                } else {
                    state.storeTab = results.preferTab()
                }
            } catch {
                state.storeLookupBusy = false
                state.storeResults = StoreSearchResults()
                state.allowCustomPrice = true
                state.storeLookupError = isTimeout(error)
                    ? "Los súper tardaron demasiado. Probá de nuevo."
                    : error.localizedDescription
            }
        }
    }

    func createItem(_ draft: NewItemDraft) -> Bool {
        let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else {
            state.error = "El nombre es obligatorio."
            return false
        }
        let unit = draft.qtyUnit == "kg" ? "kg" : "unit"
        if unit == "kg" && draft.quantity > 0 && draft.quantity < 0.1 {
            state.error = "La cantidad por kilo debe ser 0,1 g o más."
            return false
        }
        if unit == "kg" && draft.minStock > 0 && draft.minStock < 0.1 {
            state.error = "El stock mínimo por kilo debe ser 0,1 g o más."
            return false
        }
        let source = draft.priceSource
        let sourceOk = source == "coto" || source == "carrefour" || source == "dia" || source == "custom"
        guard sourceOk, draft.price > 0 else {
            state.error = state.allowCustomPrice || source == "custom"
                ? "Ingresá un precio personalizado válido."
                : "Elegí un precio de Coto, Carrefour o Día, o cargá uno personalizado."
            return false
        }
        let quantity = unit == "kg" ? normalizeQty(kgFromGrams(draft.quantity), "kg") : normalizeQty(max(0, draft.quantity), "unit")
        let minStock = unit == "kg" ? normalizeQty(kgFromGrams(draft.minStock), "kg") : normalizeQty(max(0, draft.minStock), "unit")
        let custom = source == "custom"
        let editingId = state.editingItemId
        let item = StockItem(
            id: editingId ?? UUID().uuidString,
            name: name,
            barcode: draft.barcode.trimmingCharacters(in: .whitespacesAndNewlines),
            category: draft.category.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Alimentos" : draft.category,
            quantity: quantity,
            minStock: minStock,
            qtyUnit: unit,
            price: max(0, draft.price),
            priceSource: source,
            priceCoto: draft.priceCoto,
            priceCarrefour: draft.priceCarrefour,
            priceDia: draft.priceDia,
            listPriceCoto: draft.listPriceCoto,
            listPriceCarrefour: draft.listPriceCarrefour,
            listPriceDia: draft.listPriceDia,
            image: draft.image,
            urlCoto: draft.urlCoto,
            urlCarrefour: draft.urlCarrefour,
            urlDia: draft.urlDia,
            discountCoto: custom ? "" : draft.discountCoto,
            discountCarrefour: custom ? "" : draft.discountCarrefour,
            discountDia: custom ? "" : draft.discountDia
        )
        replaceItem(item, persist: true, prepend: editingId == nil)
        priceRefreshAt[item.id] = Date()
        state.showNewItem = false
        state.editingItemId = nil
        state.showScanner = false
        state.scannedEan = nil
        state.info = editingId == nil ? "Producto agregado" : "Producto actualizado"
        state.tab = .stock
        state.error = ""
        clearStoreLookup()
        return true
    }

    func loginWithGoogle(_ idToken: String) {
        Task {
            state.busy = true
            state.error = ""
            state.info = ""
            do {
                let result = try await api.loginWithGoogle(idToken: idToken)
                let items = (try? await api.fetchItems()) ?? []
                priceRefreshAt.removeAll()
                let info: String = {
                    if result.linked { return "Cuenta vinculada a Google · \(result.itemCount) productos" }
                    if result.itemCount > 0 { return "Bienvenido · \(result.itemCount) productos sincronizados" }
                    return ""
                }()
                state.busy = false
                state.booting = false
                state.user = result.user
                state.items = items
                state.cartRemoved = []
                state.tab = .stock
                state.error = ""
                state.info = info
                startPriceRefreshLoop()
            } catch {
                state.busy = false
                state.error = error.localizedDescription
            }
        }
    }

    func logout() {
        priceRefreshTask?.cancel()
        priceRefreshTask = nil
        priceRefreshAt.removeAll()
        let dark = state.darkTheme
        Task {
            await api.logout()
            state = AppState(booting: false, darkTheme: dark)
        }
    }

    func refreshItems() {
        Task {
            do {
                let items = try await api.fetchItems()
                state.items = items
                state.cartRemoved = pruneCartRemoved(state.cartRemoved, items)
            } catch {
                if !isTimeout(error) { state.error = error.localizedDescription }
            }
        }
    }

    func onAppResumed() {
        guard state.user != nil, !state.booting else { return }
        Task { await refreshStaleStorePrices() }
    }

    func bumpQty(id: String, delta: Double) {
        guard let current = state.items.first(where: { $0.id == id }) else { return }
        var next = current
        next.quantity = normalizeQty(max(0, current.quantity + delta), current.qtyUnit)
        replaceItem(next, persist: true)
    }

    func toggleCart(id: String) {
        guard let current = state.items.first(where: { $0.id == id }) else { return }
        guard current.shouldAutoCart else {
            state.info = "Solo productos bajo el mínimo entran al carrito"
            return
        }
        if state.cartRemoved.contains(id) {
            state.cartRemoved.remove(id)
        } else {
            state.cartRemoved.insert(id)
        }
    }

    func deleteItem(id: String) {
        Task {
            do {
                try await api.deleteItem(id: id)
                priceRefreshAt.removeValue(forKey: id)
                state.items.removeAll { $0.id == id }
                state.cartRemoved.remove(id)
            } catch {
                state.error = error.localizedDescription
            }
        }
    }

    func addFromCompare(_ row: CompareRow) {
        if let existing = state.items.first(where: { !$0.barcode.isEmpty && $0.barcode == row.barcode }) {
            state.info = "Ya está en tu stock"
            state.tab = .stock
            _ = existing
            return
        }
        let prices = [row.priceCoto, row.priceCarrefour, row.priceDia].filter { $0 > 0 }
        let cheaper = prices.min() ?? 0
        let source: String = {
            if cheaper == row.priceCoto && cheaper > 0 { return "coto" }
            if cheaper == row.priceCarrefour && cheaper > 0 { return "carrefour" }
            if cheaper == row.priceDia && cheaper > 0 { return "dia" }
            return ""
        }()
        let unit = row.qtyUnit == "kg" ? "kg" : "unit"
        let item = StockItem(
            id: UUID().uuidString,
            name: row.name,
            barcode: row.barcode,
            category: row.category.isEmpty ? "Alimentos" : row.category,
            quantity: 0,
            minStock: unit == "kg" ? 0.5 : 1,
            qtyUnit: unit,
            price: cheaper,
            priceSource: source,
            priceCoto: row.priceCoto,
            priceCarrefour: row.priceCarrefour,
            priceDia: row.priceDia,
            listPriceCoto: row.listPriceCoto,
            listPriceCarrefour: row.listPriceCarrefour,
            listPriceDia: row.listPriceDia,
            image: row.image
        )
        replaceItem(item, persist: true, prepend: true)
        state.info = "Agregado al stock (entra al carrito por stock bajo)"
        state.tab = .stock
        state.cartRemoved.remove(item.id)
        Task { await refreshStorePrices(item, silent: true) }
    }

    func searchCompare(_ query: String) {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        state.compareQuery = q
        state.compareBusy = true
        state.error = ""
        state.compareError = ""
        state.compareResults = []
        compareTask?.cancel()
        compareTask = nil
        guard q.count >= 2 else {
            state.compareBusy = false
            return
        }
        startComparePoll(q, showSpinner: true)
    }

    func saveProfile(firstName: String, lastName: String, email: String) {
        Task {
            state.busy = true
            state.error = ""
            state.info = ""
            do {
                let user = try await api.updateProfile(firstName: firstName, lastName: lastName, email: email)
                state.busy = false
                state.user = user
                state.info = "Perfil guardado"
            } catch {
                state.busy = false
                state.error = error.localizedDescription
            }
        }
    }

    func exportJSON() -> String {
        let items = state.items.map { $0.asJSON() }
        let payload: [String: Any] = [
            "version": 1,
            "app": "stockea",
            "exportedAt": ISO8601DateFormatter().string(from: Date()),
            "items": items,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]),
              let text = String(data: data, encoding: .utf8) else { return "{}" }
        return text
    }

    func importJSON(_ raw: String) {
        Task {
            state.busy = true
            state.error = ""
            state.info = ""
            do {
                let incoming = try parseStockExport(raw)
                var byId = Dictionary(uniqueKeysWithValues: state.items.map { ($0.id, $0) })
                var added = 0
                var updated = 0
                for item in incoming {
                    if byId[item.id] == nil { added += 1 } else { updated += 1 }
                    byId[item.id] = item
                }
                for item in incoming {
                    try await api.upsertItem(item)
                }
                state.busy = false
                state.items = state.items.map { byId[$0.id] ?? $0 } + incoming.filter { item in
                    !state.items.contains { $0.id == item.id }
                }
                // Rebuild preserving incoming updates and new items at the end of existing order.
                var ordered: [StockItem] = []
                var seen = Set<String>()
                for item in state.items {
                    if let next = byId[item.id], seen.insert(item.id).inserted {
                        ordered.append(next)
                    }
                }
                for item in incoming where seen.insert(item.id).inserted {
                    ordered.append(item)
                }
                state.items = ordered
                state.info = "Importado: \(added) nuevos, \(updated) actualizados"
            } catch {
                state.busy = false
                state.error = error.localizedDescription
            }
        }
    }

    func markCartBought() {
        let cart = state.cartItems
        guard !cart.isEmpty else { return }
        for item in cart {
            var updated = item
            updated.quantity = normalizeQty(item.quantity + item.neededToMin, item.qtyUnit)
            replaceItem(updated, persist: true)
        }
        state.info = cart.count == 1 ? "Compra aplicada al stock" : "\(cart.count) productos actualizados"
        state.tab = .stock
        state.showCart = false
        state.cartRemoved = []
    }

    private func startPriceRefreshLoop() {
        priceRefreshTask?.cancel()
        priceRefreshTask = Task {
            try? await Task.sleep(nanoseconds: 200_000_000)
            while !Task.isCancelled {
                if state.user != nil { await refreshStaleStorePrices() }
                try? await Task.sleep(nanoseconds: 60_000_000_000)
            }
        }
    }

    private func startComparePoll(_ query: String, showSpinner: Bool) {
        compareTask?.cancel()
        compareTask = Task {
            var first = true
            while !Task.isCancelled {
                if first && showSpinner {
                    state.compareBusy = true
                    state.compareError = ""
                }
                do {
                    let rows = try await api.searchSupers(query: query)
                    if query != state.compareQuery.trimmingCharacters(in: .whitespacesAndNewlines) { return }
                    state.compareBusy = false
                    state.compareResults = rows
                    state.compareError = rows.isEmpty ? "No hay productos web para esa búsqueda." : ""
                } catch {
                    if query != state.compareQuery.trimmingCharacters(in: .whitespacesAndNewlines) { return }
                    state.compareBusy = false
                    if first && state.compareResults.isEmpty {
                        state.compareError = isTimeout(error)
                            ? "Los súper tardaron demasiado. Probá de nuevo."
                            : error.localizedDescription
                    }
                }
                first = false
                try? await Task.sleep(nanoseconds: 8_000_000_000)
            }
        }
    }

    private func refreshStaleStorePrices() async {
        if refreshingPrices { return }
        refreshingPrices = true
        defer { refreshingPrices = false }
        let now = Date()
        let stale = state.items.filter { item in
            tracksStorePrices(item) && now.timeIntervalSince(priceRefreshAt[item.id] ?? .distantPast) >= 2
        }
        for item in stale {
            if state.user == nil || Task.isCancelled { return }
            await refreshStorePrices(item, silent: true)
            priceRefreshAt[item.id] = Date()
        }
    }

    private func refreshStorePrices(_ item: StockItem, silent: Bool) async {
        guard state.items.contains(where: { $0.id == item.id }) else { return }
        let code = extractEan13(item.barcode).isEmpty ? item.barcode.trimmingCharacters(in: .whitespaces) : extractEan13(item.barcode)
        let query = code.isEmpty ? item.name : code
        guard !query.isEmpty else { return }
        do {
            let data = try await api.searchSupersRaw(query: query, limit: 24)
            func pick(_ list: [StoreProduct]) -> StoreProduct? {
                if !code.isEmpty, let match = list.first(where: { $0.ean == code }) { return match }
                return list.first
            }
            let coto = pick(data.coto)
            let carrefour = pick(data.carrefour)
            let dia = pick(data.dia)
            guard coto != nil || carrefour != nil || dia != nil else { return }
            guard var current = state.items.first(where: { $0.id == item.id }) else { return }
            let nextCoto = coto?.price ?? current.priceCoto
            let nextCarrefour = carrefour?.price ?? current.priceCarrefour
            let nextDia = dia?.price ?? current.priceDia
            switch current.priceSource {
            case "coto" where nextCoto > 0: current.price = nextCoto
            case "carrefour" where nextCarrefour > 0: current.price = nextCarrefour
            case "dia" where nextDia > 0: current.price = nextDia
            default: break
            }
            current.priceCoto = nextCoto
            current.priceCarrefour = nextCarrefour
            current.priceDia = nextDia
            current.listPriceCoto = coto.map(listPriceOfProduct) ?? current.listPriceCoto
            current.listPriceCarrefour = carrefour.map(listPriceOfProduct) ?? current.listPriceCarrefour
            current.listPriceDia = dia.map(listPriceOfProduct) ?? current.listPriceDia
            if current.barcode.isEmpty {
                current.barcode = coto?.ean ?? carrefour?.ean ?? dia?.ean ?? ""
            }
            current.discountCoto = coto == nil ? current.discountCoto : (coto?.hasDiscount == true ? (coto?.discountLabel.isEmpty == false ? coto!.discountLabel : "Oferta") : "")
            current.discountCarrefour = carrefour == nil ? current.discountCarrefour : (carrefour?.hasDiscount == true ? (carrefour?.discountLabel.isEmpty == false ? carrefour!.discountLabel : "Oferta") : "")
            current.discountDia = dia == nil ? current.discountDia : (dia?.hasDiscount == true ? (dia?.discountLabel.isEmpty == false ? dia!.discountLabel : "Oferta") : "")
            replaceItem(current, persist: true)
            priceRefreshAt[item.id] = Date()
            if !silent { state.info = "Precios de \(item.name) actualizados" }
        } catch {
            if !silent { state.info = "No se pudieron consultar los supermercados" }
        }
    }

    private func replaceItem(_ item: StockItem, persist: Bool, prepend: Bool = false) {
        if prepend {
            state.items.removeAll { $0.id == item.id }
            state.items.insert(item, at: 0)
        } else if let index = state.items.firstIndex(where: { $0.id == item.id }) {
            state.items[index] = item
        } else {
            state.items.append(item)
        }
        state.cartRemoved = pruneCartRemoved(state.cartRemoved, state.items)
        if persist {
            Task {
                do {
                    try await api.upsertItem(item)
                } catch {
                    if !isTimeout(error) { state.error = error.localizedDescription }
                }
            }
        }
    }

    private func isTimeout(_ error: Error) -> Bool {
        if let urlError = error as? URLError, urlError.code == .timedOut { return true }
        let text = error.localizedDescription.lowercased()
        return text.contains("tiempo de espera") || text.contains("timed out")
    }

    private func pruneCartRemoved(_ removed: Set<String>, _ items: [StockItem]) -> Set<String> {
        let byId = Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })
        return Set(removed.filter { id in
            guard let item = byId[id] else { return false }
            return item.shouldAutoCart
        })
    }

    private func parseStockExport(_ raw: String) throws -> [StockItem] {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let data = trimmed.data(using: .utf8) else {
            throw APIError(message: "El archivo está vacío")
        }
        let json = try JSONSerialization.jsonObject(with: data)
        let list: [Any]
        if let array = json as? [Any] {
            list = array
        } else if let object = json as? [String: Any], let items = object["items"] as? [Any] {
            list = items
        } else {
            throw APIError(message: "No encontramos una lista de productos en el archivo")
        }
        if list.isEmpty { throw APIError(message: "La lista está vacía") }
        let items = list.compactMap { entry -> StockItem? in
            guard var object = entry as? [String: Any] else { return nil }
            let name = (object["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if name.isEmpty { return nil }
            if (object["id"] as? String)?.isEmpty != false {
                object["id"] = UUID().uuidString
            }
            return JSONBox(object).toStockItem()
        }
        if items.isEmpty { throw APIError(message: "No hay productos válidos para importar") }
        return items
    }
}

private extension JSONBox {
    func toStockItem() -> StockItem {
        StockItem(
            id: string("id"),
            name: string("name"),
            barcode: string("barcode"),
            category: string("category", "Alimentos"),
            quantity: double("quantity"),
            minStock: double("minStock"),
            qtyUnit: string("qtyUnit", "unit"),
            price: double("price"),
            priceSource: string("priceSource"),
            priceCoto: double("priceCoto"),
            priceCarrefour: double("priceCarrefour"),
            priceDia: double("priceDia"),
            listPriceCoto: double("listPriceCoto"),
            listPriceCarrefour: double("listPriceCarrefour"),
            listPriceDia: double("listPriceDia"),
            image: string("image"),
            urlCoto: string("urlCoto"),
            urlCarrefour: string("urlCarrefour"),
            urlDia: string("urlDia"),
            discountCoto: string("discountCoto"),
            discountCarrefour: string("discountCarrefour"),
            discountDia: string("discountDia")
        )
    }
}
