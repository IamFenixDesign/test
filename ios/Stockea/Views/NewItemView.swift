import SwiftUI

struct NewItemView: View {
    @EnvironmentObject private var model: AppModel
    @State private var draft = NewItemDraft()
    @State private var query = ""

    private var dark: Bool { model.state.darkTheme }

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

                    Picker("Unidad", selection: $draft.qtyUnit) {
                        Text("Unidad").tag("unit")
                        Text("Kilo").tag("kg")
                    }
                    .pickerStyle(.segmented)
                    field(draft.qtyUnit == "kg" ? "Cantidad (gramos)" : "Cantidad", text: quantityText)
                    field(draft.qtyUnit == "kg" ? "Mínimo (gramos)" : "Mínimo", text: minText)

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
            .navigationTitle("Nuevo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { model.closeNewItem() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { save() }
                }
            }
            .onAppear {
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

    private func save() {
        if draft.priceSource == "custom" || (model.state.allowCustomPrice && draft.price <= 0) {
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
