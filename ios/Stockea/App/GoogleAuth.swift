import GoogleSignIn
import UIKit

enum GoogleAuth {
    @MainActor
    static func idToken() async throws -> String {
        guard !AppConfig.iosClientID.isEmpty else {
            throw APIError(
                message: "Falta el Client ID de iOS. En Google Cloud creá un cliente OAuth iOS (app.stockea.ios) y pegalo en GOOGLE_IOS_CLIENT_ID."
            )
        }
        guard let presenter = UIApplication.topViewController() else {
            throw APIError(message: "No se pudo abrir Google Sign-In")
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(
            clientID: AppConfig.iosClientID,
            serverClientID: AppConfig.webClientID
        )
        return try await withCheckedThrowingContinuation { continuation in
            GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { result, error in
                if let error {
                    let code = (error as NSError).code
                    // -5 es kGIDSignInErrorCodeCanceled en GoogleSignIn.
                    if code == -5 {
                        continuation.resume(throwing: APIError(message: "Inicio de sesión cancelado"))
                        return
                    }
                    continuation.resume(throwing: error)
                    return
                }
                guard let token = result?.user.idToken?.tokenString, !token.isEmpty else {
                    continuation.resume(throwing: APIError(message: "Google no devolvió un token"))
                    return
                }
                continuation.resume(returning: token)
            }
        }
    }
}

extension UIApplication {
    static func topViewController() -> UIViewController? {
        let scene = shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var controller = scene?.windows.first(where: \.isKeyWindow)?.rootViewController
            ?? scene?.windows.first?.rootViewController
        while let presented = controller?.presentedViewController {
            controller = presented
        }
        return controller
    }
}
