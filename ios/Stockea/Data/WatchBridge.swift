import Foundation
import WatchConnectivity

/// Manda al Apple Watch la lista de stock. El reloj no tiene sesión propia.
enum WatchBridge {
    static func start() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = PhoneSession.shared
        session.activate()
    }

    static func send(items: [StockItem]) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }

        let rows = items.prefix(40).map { item -> [String: String] in
            [
                "id": item.id,
                "name": item.name,
                "qty": qtyLabel(item),
                "low": item.isLowStock ? "1" : "0",
            ]
        }
        try? session.updateApplicationContext(["stock": Array(rows)])
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
