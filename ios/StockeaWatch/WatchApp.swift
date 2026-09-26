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
    var low: Bool
}

@MainActor
final class WatchModel: NSObject, ObservableObject, WCSessionDelegate {
    @Published var items: [WatchItem] = []

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        let context = session.receivedApplicationContext
        Task { @MainActor in apply(context) }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in apply(applicationContext) }
    }

    private func apply(_ context: [String: Any]) {
        let rows = context["stock"] as? [[String: String]] ?? []
        items = rows.map {
            WatchItem(
                id: $0["id"] ?? UUID().uuidString,
                name: $0["name"] ?? "",
                qty: $0["qty"] ?? "",
                low: $0["low"] == "1"
            )
        }
    }
}

struct WatchHomeView: View {
    @EnvironmentObject private var model: WatchModel

    var body: some View {
        NavigationStack {
            if model.items.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "shippingbox")
                        .font(.title2)
                    Text("Abrí Stockea en el iPhone para ver el stock.")
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 4)
                .navigationTitle("Stock")
            } else {
                List(model.items) { item in
                    HStack {
                        Text(item.name)
                            .lineLimit(2)
                        Spacer(minLength: 6)
                        Text(item.qty)
                            .font(.caption.bold())
                            .foregroundStyle(item.low ? .orange : .secondary)
                    }
                }
                .navigationTitle("Stock")
            }
        }
    }
}
