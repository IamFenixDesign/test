import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme

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
        .onAppear { model.applySystemTheme(dark: colorScheme == .dark) }
        .onChange(of: colorScheme) { _, scheme in
            model.applySystemTheme(dark: scheme == .dark)
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
            StockeaBackground(dark: model.state.darkTheme)
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
            .id(model.state.tab)
            .transition(.blurReplace)
            .padding(.bottom, 96)

            BottomBar()
        }
        .animation(.smooth(duration: 0.38), value: model.state.tab)
        .animation(.smooth(duration: 0.45), value: model.state.darkTheme)
        .sheet(isPresented: Binding(
            get: { model.state.showCart },
            set: { if !$0 { model.closeCart() } }
        )) {
            CartView()
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(28)
        }
        .sheet(isPresented: Binding(
            get: { model.state.showNewItem },
            set: { if !$0 { model.closeNewItem() } }
        )) {
            NewItemView()
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(28)
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
    @Namespace private var selection

    var body: some View {
        glassBar
            .padding(.horizontal, 12)
            .padding(.bottom, 6)
    }

    private var glassBar: some View {
        let bar = HStack(spacing: 0) {
            barButton("Comparar", system: "scalemass", selected: model.state.tab == .compare) {
                model.setTab(.compare)
            }
            Button {
                withAnimation(.spring(duration: 0.42, bounce: 0.28)) { model.openNewItem() }
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(StockeaColor.accentInk)
                    .frame(width: 64, height: 64)
                    .background(StockeaColor.accent, in: Circle())
                    .frame(maxWidth: .infinity)
                    .symbolEffect(.bounce, value: model.state.showNewItem)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Nuevo ítem")
            barButton("Stock", system: "shippingbox", selected: model.state.tab == .stock && !model.state.showNewItem && !model.state.showCart) {
                model.setTab(.stock)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)

        if #available(iOS 26.0, *) {
            return AnyView(
                GlassEffectContainer(spacing: 12) {
                    bar.glassEffect(.regular.interactive(), in: Capsule())
                }
            )
        }
        return AnyView(bar.stockeaGlass(in: Capsule(), interactive: true))
    }

    private func barButton(_ title: String, system: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.smooth(duration: 0.38)) { action() }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: system)
                    .font(.system(size: 20, weight: .medium))
                    .symbolEffect(.bounce, value: selected)
                Text(title)
                    .font(.caption2.weight(.semibold))
            }
            .foregroundStyle(selected ? StockeaColor.accent : StockeaColor.muted(dark: model.state.darkTheme))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
            .background {
                if selected {
                    Capsule()
                        .fill(StockeaColor.accent.opacity(0.18))
                        .matchedGeometryEffect(id: "tab-selection", in: selection)
                }
            }
        }
        .buttonStyle(.plain)
    }
}
