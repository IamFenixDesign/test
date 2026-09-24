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

private enum BarSlot: Hashable {
    case compare, nuevo, stock
}

private struct SlotFramesKey: PreferenceKey {
    static var defaultValue: [BarSlot: CGRect] = [:]
    static func reduce(value: inout [BarSlot: CGRect], nextValue: () -> [BarSlot: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { $1 })
    }
}

private struct BottomBar: View {
    @EnvironmentObject private var model: AppModel
    @Namespace private var selection
    @State private var slotFrames: [BarSlot: CGRect] = [:]
    @State private var dragSlot: BarSlot?

    private var highlighted: BarSlot? {
        if let dragSlot { return dragSlot }
        if model.state.showNewItem { return .nuevo }
        if model.state.tab == .compare { return .compare }
        if model.state.tab == .stock && !model.state.showCart { return .stock }
        return nil
    }

    var body: some View {
        glassBar
            .padding(.horizontal, 12)
            .padding(.bottom, 6)
    }

    @ViewBuilder
    private var glassBar: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: 16) {
                barContent
                    .padding(.horizontal, 6)
                    .padding(.vertical, 6)
                    .glassEffect(.regular, in: Capsule())
            }
        } else {
            barContent
                .padding(.horizontal, 6)
                .padding(.vertical, 6)
                .stockeaGlass(in: Capsule(), interactive: true)
        }
    }

    private var barContent: some View {
        HStack(spacing: 4) {
            barButton("Comparar", system: "scalemass", slot: .compare)
            barButton("Nuevo", system: "plus", slot: .nuevo)
            barButton("Stock", system: "shippingbox", selectedSymbol: "shippingbox.fill", slot: .stock)
        }
        .coordinateSpace(name: "tabbar")
        .onPreferenceChange(SlotFramesKey.self) { slotFrames = $0 }
        .contentShape(Capsule())
        .gesture(tabDrag)
    }

    private var tabDrag: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .named("tabbar"))
            .onChanged { value in
                let slot = slot(at: value.location)
                guard slot != dragSlot else { return }
                withAnimation(.smooth(duration: 0.22)) { dragSlot = slot }
            }
            .onEnded { value in
                let slot = dragSlot ?? self.slot(at: value.location)
                dragSlot = nil
                guard let slot else { return }
                withAnimation(.smooth(duration: 0.35)) { activate(slot) }
            }
    }

    private func slot(at point: CGPoint) -> BarSlot? {
        slotFrames.first { $0.value.contains(point) }?.key
    }

    private func activate(_ slot: BarSlot) {
        switch slot {
        case .compare:
            model.setTab(.compare)
        case .nuevo:
            model.openNewItem()
        case .stock:
            model.setTab(.stock)
        }
    }

    private func barButton(_ title: String, system: String, selectedSymbol: String? = nil, slot: BarSlot) -> some View {
        let selected = highlighted == slot
        return VStack(spacing: 3) {
            Image(systemName: selected ? (selectedSymbol ?? system) : system)
                .font(.system(size: 20, weight: selected ? .semibold : .regular))
                .symbolEffect(.bounce, value: selected)
            Text(title)
                .font(.caption2.weight(selected ? .bold : .semibold))
        }
        .foregroundStyle(selected ? StockeaColor.ink(dark: model.state.darkTheme) : StockeaColor.muted(dark: model.state.darkTheme))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background {
            if selected {
                selectionLens
            }
        }
        .background {
            GeometryReader { geo in
                Color.clear.preference(key: SlotFramesKey.self, value: [slot: geo.frame(in: .named("tabbar"))])
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction { activate(slot) }
    }

    @ViewBuilder
    private var selectionLens: some View {
        if #available(iOS 26.0, *) {
            Capsule()
                .fill(.clear)
                .glassEffect(.regular.interactive(), in: Capsule())
                .glassEffectID("tab-selection", in: selection)
        } else {
            Capsule()
                .fill(.white.opacity(model.state.darkTheme ? 0.16 : 0.72))
                .matchedGeometryEffect(id: "tab-selection", in: selection)
        }
    }
}
