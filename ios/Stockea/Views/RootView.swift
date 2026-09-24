import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if model.state.booting {
                ZStack {
                    StockeaBackground(dark: model.state.darkTheme)
                    ProgressView()
                        .tint(StockeaColor.accent)
                }
            } else if model.state.user == nil {
                LoginView()
            } else {
                MainShell()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.onAppResumed() }
        }
    }
}

private struct MainShell: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack(alignment: .bottom) {
            StockeaColor.background(dark: model.state.darkTheme).ignoresSafeArea()
            Group {
                switch model.state.tab {
                case .stock:
                    StockView()
                case .compare:
                    CompareView()
                case .profile:
                    ProfileView()
                }
            }
            .padding(.bottom, 96)

            BottomBar()
        }
        .sheet(isPresented: Binding(
            get: { model.state.showCart },
            set: { if !$0 { model.closeCart() } }
        )) {
            CartView()
        }
        .sheet(isPresented: Binding(
            get: { model.state.showNewItem },
            set: { if !$0 { model.closeNewItem() } }
        )) {
            NewItemView()
        }
        .fullScreenCover(isPresented: Binding(
            get: { model.state.showScanner },
            set: { if !$0 { model.closeScanner() } }
        )) {
            ScannerView(
                onDetect: { model.onScannedEan($0) },
                onCancel: { model.closeScanner() }
            )
        }
        .alert("Stockea", isPresented: Binding(
            get: { !model.state.info.isEmpty || !model.state.error.isEmpty },
            set: { if !$0 { model.clearMessages() } }
        )) {
            Button("OK", role: .cancel) { model.clearMessages() }
        } message: {
            Text(model.state.error.isEmpty ? model.state.info : model.state.error)
        }
    }
}

private struct BottomBar: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        HStack(spacing: 0) {
            barButton("Comparar", system: "scalemass", selected: model.state.tab == .compare) {
                model.setTab(.compare)
            }
            barButton(
                model.state.darkTheme ? "Claro" : "Oscuro",
                system: model.state.darkTheme ? "sun.max" : "moon",
                selected: false
            ) {
                model.toggleTheme()
            }
            Button {
                model.openNewItem()
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(StockeaColor.accentInk)
                    .frame(width: 64, height: 64)
                    .background(StockeaColor.accent, in: Circle())
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Nuevo ítem")
            barButton("Stock", system: "shippingbox", selected: model.state.tab == .stock && !model.state.showNewItem && !model.state.showCart) {
                model.setTab(.stock)
            }
            barButton("Perfil", system: "person", selected: model.state.tab == .profile) {
                model.setTab(.profile)
            }
        }
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(.ultraThinMaterial)
    }

    private func barButton(_ title: String, system: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: system)
                    .font(.system(size: 20, weight: .medium))
                Text(title)
                    .font(.caption2.weight(.semibold))
            }
            .foregroundStyle(selected ? StockeaColor.accent : StockeaColor.muted(dark: model.state.darkTheme))
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}
