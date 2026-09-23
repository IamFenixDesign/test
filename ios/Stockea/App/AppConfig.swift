import Foundation

enum AppConfig {
    static let apiBase = "https://test-iota-two-49.vercel.app"
    /// Web client ID. El backend valida el ID token contra este cliente.
    static let webClientID = "114812133018-7hj44j9e78qer9psp92vtikl4v2fkhcn.apps.googleusercontent.com"

    /// Cliente OAuth de tipo iOS. Hay que crearlo en Google Cloud y pegarlo en Info.plist.
    static var iosClientID: String {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "GOOGLE_IOS_CLIENT_ID") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if raw.isEmpty || raw.contains("REEMPLAZAR") { return "" }
        return raw
    }
}
