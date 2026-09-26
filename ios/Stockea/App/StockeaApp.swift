import GoogleSignIn
import SwiftUI

@main
struct StockeaApp: App {
    @StateObject private var model = AppModel()

    private var watchStamp: String {
        let items = model.state.items
            .map { "\($0.id):\($0.quantity):\($0.minStock):\($0.qtyUnit)" }
            .joined(separator: "|")
        return items
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
                .onAppear {
                    WatchBridge.start()
                    WatchBridge.send(items: model.state.items)
                }
                .onChange(of: watchStamp) { _, _ in
                    WatchBridge.send(items: model.state.items)
                }
        }
    }
}
