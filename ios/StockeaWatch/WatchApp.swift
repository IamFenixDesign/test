import SwiftUI
import WatchConnectivity

@main
struct StockeaWatchApp: App {
    @StateObject private var model = WatchModel()

    var body: some Scene {
        WindowGroup {
            WatchHomeView()
                .environmentObject(model)
        }
    }
}

struct WatchItem: Identifiable, Equatable {
    var id: String
    var name: String
    var qty: String
}

@MainActor
final class WatchModel: NSObject, ObservableObject, WCSessionDelegate {
    @Published var items: [WatchItem] = []
    @Published var cartCount = 0
    @Published var total = 0
    @Published var hasPhone = false

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        let context = session.receivedApplicationContext
        Task { @MainActor in
            hasPhone = session.isCompanionAppInstalled
            apply(context)
        }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in
            hasPhone = true
            apply(applicationContext)
        }
    }

    private func apply(_ context: [String: Any]) {
        let rows = context["low"] as? [[String: String]] ?? []
        items = rows.map {
            WatchItem(id: $0["id"] ?? UUID().uuidString, name: $0["name"] ?? "", qty: $0["qty"] ?? "")
        }
        cartCount = context["cart"] as? Int ?? 0
        total = context["total"] as? Int ?? 0
    }
}

struct WatchHomeView: View {
    @EnvironmentObject private var model: WatchModel

    var body: some View {
        NavigationStack {
            Group {
                if model.items.isEmpty && model.total == 0 {
                    VStack(spacing: 8) {
                        Image(systemName: "shippingbox")
                            .font(.title2)
                        Text("Abrí Stockea en el iPhone para ver el stock.")
                            .font(.footnote)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 4)
                } else if model.items.isEmpty {
                    VStack(spacing: 6) {
                        Text("\(model.total)")
                            .font(.title.bold())
                        Text(model.total == 1 ? "producto" : "productos")
                            .foregroundStyle(.secondary)
                        Text("Nada bajo el mínimo")
                            .font(.footnote)
                    }
                } else {
                    List(model.items) { item in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name)
                                .lineLimit(2)
                            Text(item.qty)
                                .font(.caption)
                                .foregroundStyle(.orange)
                        }
                    }
                }
            }
            .navigationTitle(model.cartCount > 0 ? "Carrito \(model.cartCount)" : "Stock")
        }
    }
}
