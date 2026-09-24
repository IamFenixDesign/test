import SwiftUI

struct NewItemView: View {
    @EnvironmentObject private var model: AppModel
    @State private var draft = NewItemDraft()
    @State private var query = ""
    @State private var loaded = false
    @State private var ignoreUnitChange = false

    private var dark: Bool { model.state.darkTheme }
    private var editing: Bool { model.state.editingItemId != nil }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    field("Nombre", text: $draft.name)
                    HStack {
                        field("EAN", text: $draft.barcode)
                        Button {
                            model.openScanner()
                        } label: {
                            Image(systemName: "barcode.viewfinder")
                                .font(.title2)
                                .frame(width: 48, height: 48)
                                .background(StockeaColor.surface(dark: dark), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 18)
                        .accessibilityLabel("Escanear código")
                    }
                    HStack {
                        TextField("Buscar en súper", text: $query)
                            .textInputAutocapitalization(.never)
                            .padding(12)
                            .background(StockeaColor.surface(dark: dark), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        Button("Buscar") {
                            let term = query.trimmingCharacters(in: .whitespaces).isEmpty ? draft.barcode : query
                            model.lookupStores(term)
                        }
                        .font(.subheadline.bold())
                        .foregroundStyle(StockeaColor.accentInk)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(StockeaColor.accent, in: Capsule())
                    }
                    if model.state.storeLookupBusy {
                        ProgressView()
                    }
                    if !model.state.storeLookupError.isEmpty {
                        Text(model.state.storeLookupError)
                            .font(.footnote)
                            .foregroundStyle(StockeaColor.muted(dark: dark))
                    }
                    if !model.state.storeResults.isEmpty {
                        Picker("Súper", selection: Binding(
                            get: { model.state.storeTab },
                            set: { model.setStoreTab($0) }
                        )) {
                            Text("Coto").tag("coto")
                            Text("Carrefour").tag("carrefour")
                            Text("Día").tag("dia")
                        }
                        .pickerStyle(.segmented)
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
                                    Spacer()
                                }
                                .padding(10)
                                .background(StockeaColor.surface(dark: dark), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    Picker("Categoría", selection: $draft.category) {
                        ForEach(stockCategories, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.menu)
                    Picker("Unidad", selection: $draft.qtyUnit) {
                        Text("Unidad").tag("unit")
                        Text("Kilo").tag("kg")
                    }
                    .pickerStyle(.segmented)
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
            }
            .background(StockeaColor.background(dark: dark))
            .navigationTitle(editing ? "Editar" : "Nuevo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { model.closeNewItem() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing ? "Guardar cambios" : "Guardar") { save() }
                }
            }
            .onAppear {
                if !loaded {
                    if let existing = model.editingDraft() {
                        ignoreUnitChange = existing.qtyUnit != draft.qtyUnit
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
            .onChange(of: draft.qtyUnit) { old, new in
                if ignoreUnitChange {
                    ignoreUnitChange = false
                    return
                }
                guard old != new else { return }
                draft.quantity = formWeightForUnit(draft.quantity, fromUnit: old, toUnit: new)
                draft.minStock = formWeightForUnit(draft.minStock, fromUnit: old, toUnit: new)
            }
            .onChange(of: model.state.scannedEan) { _, ean in
                guard let ean else { return }
                draft.barcode = ean
                query = ean
                model.consumeScannedEan()
                model.lookupStores(ean)
            }
        }
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

    private func field(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
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
