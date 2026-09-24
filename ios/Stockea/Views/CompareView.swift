import SwiftUI

struct CompareView: View {
    @EnvironmentObject private var model: AppModel
    @State private var query = ""

    private var dark: Bool { model.state.darkTheme }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Comparar")
                .font(.title.bold())
                .foregroundStyle(StockeaColor.ink(dark: dark))
            HStack {
                TextField("Producto o EAN", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .onSubmit { model.searchCompare(query) }
                Button("Buscar") { model.searchCompare(query) }
                    .font(.subheadline.bold())
                    .foregroundStyle(StockeaColor.accentInk)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(StockeaColor.accent, in: Capsule())
            }
            .padding(10)
            .stockeaGlass(in: RoundedRectangle(cornerRadius: 16, style: .continuous), interactive: true)

            if model.state.compareBusy && model.state.compareResults.isEmpty {
                ProgressView("Buscando en Coto, Carrefour y Día…")
                    .tint(StockeaColor.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if !model.state.compareError.isEmpty && model.state.compareResults.isEmpty {
                Text(model.state.compareError)
                    .foregroundStyle(StockeaColor.muted(dark: dark))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(model.state.compareResults) { row in
                            CompareCard(row: row)
                        }
                    }
                }
            }
        }
        .padding(16)
        .onAppear { query = model.state.compareQuery }
    }
}

private struct CompareCard: View {
    @EnvironmentObject private var model: AppModel
    let row: CompareRow

    private var dark: Bool { model.state.darkTheme }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(row.name)
                .font(.headline)
                .foregroundStyle(StockeaColor.ink(dark: dark))
            if !row.barcode.isEmpty {
                Text(row.barcode)
                    .font(.caption)
                    .foregroundStyle(StockeaColor.muted(dark: dark))
            }
            HStack {
                price("Coto", row.priceCoto, row.discountCoto)
                price("Carrefour", row.priceCarrefour, row.discountCarrefour)
                price("Día", row.priceDia, row.discountDia)
            }
            Button("Agregar al stock") { model.addFromCompare(row) }
                .font(.subheadline.bold())
                .foregroundStyle(StockeaColor.accentInk)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(StockeaColor.accent, in: Capsule())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .stockeaCard(dark: dark)
    }

    private func price(_ name: String, _ value: Double, _ discount: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(name)
                .font(.caption)
                .foregroundStyle(StockeaColor.muted(dark: dark))
            Text(money(value))
                .font(.subheadline.bold())
                .foregroundStyle(StockeaColor.ink(dark: dark))
            if !discount.isEmpty {
                Text(discount)
                    .font(.caption2.bold())
                    .foregroundStyle(StockeaColor.accent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
