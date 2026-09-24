import Foundation

final class APIClient {
    private let base = AppConfig.apiBase.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 25
        config.timeoutIntervalForResource = 40
        session = URLSession(configuration: config)
    }

    func clearSession() {
        let storage = HTTPCookieStorage.shared
        storage.cookies?.filter { $0.name == "stockly_session" }.forEach { storage.deleteCookie($0) }
    }

    func me() async throws -> User? {
        let data = try await request(method: "GET", path: "/api/auth")
        guard let user = data.object("user") else { return nil }
        return user.toUser()
    }

    func loginWithGoogle(idToken: String) async throws -> LoginResult {
        let data = try await request(method: "POST", path: "/api/auth", body: [
            "provider": "google",
            "credential": idToken,
        ])
        guard let user = data.object("user")?.toUser() else {
            throw APIError(message: "No se pudo iniciar sesión con Google")
        }
        return LoginResult(
            user: user,
            linked: data.bool("linked"),
            created: data.bool("created"),
            itemCount: data.int("itemCount"),
            moved: data.int("moved")
        )
    }

    func logout() async {
        _ = try? await request(method: "POST", path: "/api/auth", body: ["provider": "logout"])
        clearSession()
    }

    func updateProfile(firstName: String, lastName: String, email: String) async throws -> User {
        let data = try await request(method: "POST", path: "/api/auth", body: [
            "provider": "profile",
            "firstName": firstName,
            "lastName": lastName,
            "email": email,
        ])
        guard let user = data.object("user")?.toUser() else {
            throw APIError(message: "No se pudo guardar el perfil")
        }
        return user
    }

    func fetchItems() async throws -> [StockItem] {
        try await requestArray(path: "/api/items").map { $0.toStockItem() }
    }

    func upsertItem(_ item: StockItem) async throws {
        _ = try await request(method: "POST", path: "/api/items", body: item.asJSON())
    }

    func deleteItem(id: String) async throws {
        let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id
        _ = try await request(method: "DELETE", path: "/api/items?id=\(encoded)", body: ["id": id])
    }

    func searchSupersRaw(query: String, limit: Int = 24) async throws -> StoreSearchResults {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let data = try await request(
            method: "GET",
            path: "/api/supers?q=\(q)&limit=\(limit)&_ts=\(Int(Date().timeIntervalSince1970 * 1000))"
        )
        var errors: [String: String] = [:]
        if let obj = data.object("errors") {
            for (key, value) in obj.object {
                let message = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if !message.isEmpty { errors[key] = message }
            }
        }
        return StoreSearchResults(
            coto: data.array("coto").map { $0.toStoreProduct(store: "coto") },
            carrefour: data.array("carrefour").map { $0.toStoreProduct(store: "carrefour") },
            dia: data.array("dia").map { $0.toStoreProduct(store: "dia") },
            errors: errors
        )
    }

    func searchSupers(query: String, limit: Int = 48) async throws -> [CompareRow] {
        let raw = try await searchSupersRaw(query: query, limit: limit)
        return buildWebCompareRows(coto: raw.coto, carrefour: raw.carrefour, dia: raw.dia)
    }

    private func request(method: String, path: String, body: [String: Any]? = nil) async throws -> JSONBox {
        let (raw, response) = try await send(method: method, path: path, body: body)
        let parsed = JSONBox.parse(raw)
        if !response.isSuccessful {
            throw APIError(message: parsed.string("error").isEmpty ? "Error \(response.statusCode)" : parsed.string("error"))
        }
        return parsed
    }

    private func requestArray(path: String) async throws -> [JSONBox] {
        let (raw, response) = try await send(method: "GET", path: path, body: nil)
        if response.statusCode == 401 { return [] }
        if !response.isSuccessful {
            let parsed = JSONBox.parse(raw)
            throw APIError(message: parsed.string("error").isEmpty ? "Error \(response.statusCode)" : parsed.string("error"))
        }
        if let array = try? JSONSerialization.jsonObject(with: raw) as? [Any] {
            return array.map { JSONBox($0) }
        }
        return []
    }

    private func send(method: String, path: String, body: [String: Any]?) async throws -> (Data, HTTPURLResponse) {
        guard let url = URL(string: base + path) else {
            throw APIError(message: "URL inválida")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = path.contains("/api/supers") ? 20 : 25
        if method == "GET", path.contains("/api/supers") {
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        }
        if let body {
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError(message: "Respuesta inválida")
        }
        return (data, http)
    }
}

private extension HTTPURLResponse {
    var isSuccessful: Bool { (200..<300).contains(statusCode) }
}

struct JSONBox {
    let raw: Any

    init(_ raw: Any) { self.raw = raw }

    static func parse(_ data: Data) -> JSONBox {
        if data.isEmpty { return JSONBox([String: Any]()) }
        if let object = try? JSONSerialization.jsonObject(with: data) {
            return JSONBox(object)
        }
        return JSONBox([String: Any]())
    }

    var object: [String: Any] { raw as? [String: Any] ?? [:] }

    func string(_ key: String, _ fallback: String = "") -> String {
        let value = object[key]
        if value is NSNull || value == nil { return fallback }
        if let text = value as? String { return text }
        if let number = value as? NSNumber { return number.stringValue }
        return fallback
    }

    func double(_ key: String) -> Double {
        let value = object[key]
        if value is NSNull || value == nil { return 0 }
        if let number = value as? NSNumber { return number.doubleValue }
        if let text = value as? String {
            return Double(text.replacingOccurrences(of: ",", with: ".")) ?? 0
        }
        return 0
    }

    func int(_ key: String) -> Int {
        Int(double(key))
    }

    func bool(_ key: String) -> Bool {
        if let flag = object[key] as? Bool { return flag }
        if let number = object[key] as? NSNumber { return number.boolValue }
        return false
    }

    func object(_ key: String) -> JSONBox? {
        guard let value = object[key] as? [String: Any] else { return nil }
        return JSONBox(value)
    }

    func array(_ key: String) -> [JSONBox] {
        (object[key] as? [Any] ?? []).map { JSONBox($0) }
    }

    func stringList(_ key: String) -> [String] {
        (object[key] as? [Any] ?? []).compactMap { value -> String? in
            if let text = value as? String {
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? nil : trimmed
            }
            return nil
        }
    }
}

private extension JSONBox {
    func toUser() -> User {
        User(
            id: string("id"),
            email: string("email"),
            name: string("name"),
            firstName: string("firstName"),
            lastName: string("lastName"),
            picture: string("picture"),
            provider: string("provider", "email")
        )
    }

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

    func toStoreProduct(store fallback: String) -> StoreProduct {
        let list = double("listPrice")
        let price = double("price")
        let hasDiscount: Bool = {
            if object["hasDiscount"] != nil { return bool("hasDiscount") }
            if list > 0 && price > 0 { return list > price * 1.005 }
            return false
        }()
        var label = string("discountLabel")
        if label.isEmpty && hasDiscount && list > 0 && price > 0 {
            let pct = max(1, Int(((1 - price / list) * 100).rounded()))
            label = "\(pct)% OFF"
        }
        let ean = string("ean").isEmpty ? string("barcode") : string("ean")
        return StoreProduct(
            store: string("store").isEmpty ? fallback : string("store"),
            name: string("name"),
            ean: ean,
            price: price,
            listPrice: list,
            qtyUnit: string("qtyUnit", "unit") == "kg" ? "kg" : "unit",
            image: string("image"),
            url: string("url"),
            brand: string("brand"),
            department: string("department"),
            categories: stringList("categories"),
            hasDiscount: hasDiscount,
            discountLabel: label
        )
    }
}

extension StockItem {
    func asJSON() -> [String: Any] {
        [
            "id": id,
            "name": name,
            "barcode": barcode,
            "category": category,
            "quantity": quantity,
            "minStock": minStock,
            "qtyUnit": qtyUnit,
            "price": price,
            "priceSource": priceSource,
            "priceCoto": priceCoto,
            "priceCarrefour": priceCarrefour,
            "priceDia": priceDia,
            "listPriceCoto": listPriceCoto,
            "listPriceCarrefour": listPriceCarrefour,
            "listPriceDia": listPriceDia,
            "image": image,
            "urlCoto": urlCoto,
            "urlCarrefour": urlCarrefour,
            "urlDia": urlDia,
            "discountCoto": discountCoto,
            "discountCarrefour": discountCarrefour,
            "discountDia": discountDia,
        ]
    }
}
