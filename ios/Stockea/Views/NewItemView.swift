import SwiftUI

private struct FittedNewItemSheet: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content
                .presentationSizing(.fitted)
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(28)
        } else {
            content
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(28)
        }
    }
}

struct NewItemView: View {
    @EnvironmentObject private var model: AppModel
    @State private var draft = NewItemDraft()
    @State private var query = ""
    @State private var loaded = false
    @State private var searchTask: Task<Void, Never>?

    private var dark: Bool { model.state.darkTheme }
    private var editing: Bool { model.state.editingItemId != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Button("Cerrar") { model.closeNewItem() }
                    .font(.body)
                Spacer(minLength: 8)
                Text(editing ? "Editar" : "Nuevo")
                    .font(.headline)
                Spacer(minLength: 8)
                Button("Guardar") { save() }
                    .font(.body.weight(.semibold))
            }
            .foregroundStyle(StockeaColor.ink(dark: dark))
            field("Nombre", text: $draft.name)
                    HStack(alignment: .bottom, spacing: 8) {
                        field("EAN", text: $draft.barcode)
                        Button {
                            model.openScanner()
                        } label: {
                            Image(systemName: "barcode.viewfinder")
                                .font(.title3)
                                .frame(width: 44, height: 44)
                                .background(StockeaColor.surface(dark: dark), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Escanear código")
                    }
                    TextField("Buscar en súper", text: $query)
                        .textInputAutocapitalization(.never)
                        .submitLabel(.search)
                        .onSubmit { searchNow() }
                        .padding(12)
                        .background(StockeaColor.surface(dark: dark), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .onChange(of: query) { _, _ in scheduleSearch() }
                    if model.state.storeLookupBusy {
                        ProgressView()
                    }
                    if !model.state.storeLookupError.isEmpty {
                        Text(model.state.storeLookupError)
                            .font(.footnote)
                            .foregroundStyle(StockeaColor.muted(dark: dark))
                    }
                    if !model.state.storeResults.isEmpty {
                        segmentedRow(
                            options: [("Coto", "coto"), ("Carrefour", "carrefour"), ("Día", "dia")],
                            selection: model.state.storeTab,
                            onSelect: { model.setStoreTab($0) }
                        )
                        ScrollView {
                            VStack(spacing: 8) {
                                ForEach(model.state.storeResults.list(model.state.storeTab)) { product in
                                    Button {
                                        apply(product)
                                    } label: {
                                        HStack {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(product.name)
                                                    .font(.subheadline.weight(.semibold))
                                                    .foregroundStyle(StockeaColor.ink(dark: dark))
                                                    .multilineTextAlignment(.leading)
                                                Text(money(compareShelfPrice(product)))
                                                    .font(.caption)
                                                    .foregroundStyle(StockeaColor.muted(dark: dark))
                                            }
                                            Spacer(minLength: 0)
                                        }
                                        .padding(10)
                                        .background(StockeaColor.surface(dark: dark), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .frame(maxHeight: 220)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Categoría")
                            .font(.caption)
                            .foregroundStyle(StockeaColor.muted(dark: dark))
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(stockCategories, id: \.self) { category in
                                    Button(category) { draft.category = category }
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(draft.category == category ? StockeaColor.accentInk : StockeaColor.ink(dark: dark))
                                        .padding(.horizontal, 12)
                                        .frame(height: 36)
                                        .background(draft.category == category ? StockeaColor.accent : StockeaColor.surface(dark: dark), in: Capsule())
                                        .buttonStyle(.plain)
                                }
                            }
                        }
                        .frame(height: 36)
                    }
                    segmentedRow(
                        options: [("Unidad", "unit"), ("Kilo", "kg")],
                        selection: draft.qtyUnit,
                        onSelect: { next in
                            let previous = draft.qtyUnit
                            guard previous != next else { return }
                            draft.qtyUnit = next
                            draft.quantity = formWeightForUnit(draft.quantity, fromUnit: previous, toUnit: next)
                            draft.minStock = formWeightForUnit(draft.minStock, fromUnit: previous, toUnit: next)
                        }
                    )
                    field(draft.qtyUnit == "kg" ? "Cantidad (gramos)" : (editing ? "Cantidad" : "Cantidad inicial"), text: quantityText)
                    field(draft.qtyUnit == "kg" ? "Mínimo (gramos)" : "Mínimo", text: minText)
                    if draft.priceCoto > 0 || draft.priceCarrefour > 0 || draft.priceDia > 0 || draft.price > 0 {
                        Text("Precio actual \(money(draft.price))")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(StockeaColor.ink(dark: dark))
                        HStack(spacing: 8) {
                            if draft.priceCoto > 0 { storePill("Coto", store: "coto", price: draft.priceCoto) }
                            if draft.priceCarrefour > 0 { storePill("Carrefour", store: "carrefour", price: draft.priceCarrefour) }
                            if draft.priceDia > 0 { storePill("Día", store: "dia", price: draft.priceDia) }
                        }
                    }

                    if model.state.allowCustomPrice || draft.priceSource == "custom" {
                        field("Precio personalizado", text: $draft.customPrice)
                            .keyboardType(.decimalPad)
                    } else {
                        Button("Cargar precio personalizado") { model.enableCustomPrice() }
                            .font(.footnote.bold())
                            .foregroundStyle(StockeaColor.accent)
                    }

                    if !model.state.error.isEmpty {
                        Text(model.state.error)
                            .font(.footnote)
                            .foregroundStyle(StockeaColor.danger)
                    }
                }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .fixedSize(horizontal: false, vertical: true)
            .background(StockeaColor.background(dark: dark))
            .onAppear {
                if !loaded {
                    if let existing = model.editingDraft() {
                        draft = existing
                    }
                    loaded = true
                }
                if let ean = model.state.scannedEan {
                    draft.barcode = ean
                    query = ean
                    model.consumeScannedEan()
                    model.lookupStores(ean)
                }
            }
            .onChange(of: model.state.scannedEan) { _, ean in
                guard let ean else { return }
                draft.barcode = ean
                query = ean
                model.consumeScannedEan()
                model.lookupStores(ean)
            }
        .modifier(FittedNewItemSheet())
    }

    private var quantityText: Binding<String> {
        Binding(
            get: { formatNumber(draft.quantity) },
            set: { draft.quantity = parseNumber($0) }
        )
    }

    private var minText: Binding<String> {
        Binding(
            get: { formatNumber(draft.minStock) },
            set: { draft.minStock = parseNumber($0) }
        )
    }

    private func segmentedRow(options: [(String, String)], selection: String, onSelect: @escaping (String) -> Void) -> some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.1) { title, value in
                Button {
                    onSelect(value)
                } label: {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(selection == value ? StockeaColor.accentInk : StockeaColor.ink(dark: dark))
                        .frame(maxWidth: .infinity)
                        .frame(height: 36)
                        .background(selection == value ? StockeaColor.accent : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(StockeaColor.surface(dark: dark), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func field(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(StockeaColor.muted(dark: dark))
            TextField(title, text: text)
                .padding(12)
                .background(StockeaColor.surface(dark: dark), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .foregroundStyle(StockeaColor.ink(dark: dark))
        }
    }

    private func apply(_ product: StoreProduct) {
        draft.name = product.name
        if !product.ean.isEmpty { draft.barcode = product.ean }
        draft.category = guessCategory(product)
        draft.qtyUnit = product.qtyUnit == "kg" ? "kg" : "unit"
        draft.image = product.image
        draft.priceSource = product.store
        let shelf = compareShelfPrice(product)
        draft.price = shelf
        switch product.store {
        case "carrefour":
            draft.priceCarrefour = product.price
            draft.listPriceCarrefour = product.listPrice
            draft.urlCarrefour = product.url
            draft.discountCarrefour = product.hasDiscount ? product.discountLabel : ""
        case "dia":
            draft.priceDia = product.price
            draft.listPriceDia = product.listPrice
            draft.urlDia = product.url
            draft.discountDia = product.hasDiscount ? product.discountLabel : ""
        default:
            draft.priceCoto = product.price
            draft.listPriceCoto = product.listPrice
            draft.urlCoto = product.url
            draft.discountCoto = product.hasDiscount ? product.discountLabel : ""
        }
    }

    private func searchTerm() -> String {
        let typed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return typed.isEmpty ? draft.barcode : typed
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        let term = searchTerm()
        guard term.count >= 2 else { return }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            model.lookupStores(term)
        }
    }

    private func searchNow() {
        searchTask?.cancel()
        model.lookupStores(searchTerm())
    }

    private func storePill(_ title: String, store: String, price: Double) -> some View {
        Button {
            draft.priceSource = store
            draft.price = price
        } label: {
            Text("\(title) \(money(price))")
                .font(.caption.bold())
                .foregroundStyle(draft.priceSource == store ? StockeaColor.accentInk : StockeaColor.ink(dark: dark))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(draft.priceSource == store ? StockeaColor.accent : StockeaColor.surface(dark: dark), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func save() {
        if model.state.allowCustomPrice {
            let typed = parseNumber(draft.customPrice)
            if typed > 0 {
                draft.priceSource = "custom"
                draft.price = typed
            }
        } else if draft.priceSource == "custom" {
            draft.priceSource = "custom"
            draft.price = parseNumber(draft.customPrice)
        }
        _ = model.createItem(draft)
    }

    private func formatNumber(_ value: Double) -> String {
        if value == 0 { return "" }
        if value.rounded() == value { return String(Int(value)) }
        return String(value)
    }

    private func parseNumber(_ text: String) -> Double {
        Double(text.replacingOccurrences(of: ",", with: ".")) ?? 0
    }
}
