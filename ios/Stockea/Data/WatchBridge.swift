import Foundation
import WatchConnectivity

/// Manda al Apple Watch el stock bajo y el carrito. El reloj no tiene sesión propia.
enum WatchBridge {
    static func start() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = PhoneSession.shared
        session.activate()
    }

    static func send(items: [StockItem], cartRemoved: Set<String>) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }

        let low = items.filter(\.isLowStock).prefix(24).map { item -> [String: String] in
            [
                "id": item.id,
                "name": item.name,
                "qty": qtyLabel(item),
            ]
        }
        let cart = items.filter { $0.shouldAutoCart && !cartRemoved.contains($0.id) }.count
        let payload: [String: Any] = [
            "low": Array(low),
            "cart": cart,
            "total": items.count,
        ]
        try? session.updateApplicationContext(payload)
    }
}

private final class PhoneSession: NSObject, WCSessionDelegate {
    static let shared = PhoneSession()

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {}

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }
}
