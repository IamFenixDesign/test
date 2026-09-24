import SwiftUI

struct StockView: View {
    @EnvironmentObject private var model: AppModel

    private var dark: Bool { model.state.darkTheme }
    private var grouped: [(String, [StockItem])] {
        Dictionary(grouping: model.state.items) { $0.category.isEmpty ? "Otros" : $0.category }
            .sorted { $0.key.localizedCaseInsensitiveCompare($1.key) == .orderedAscending }
            .map { ($0.key, $0.value) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Stockea")
                        .font(.title.bold())
                        .foregroundStyle(StockeaColor.ink(dark: dark))
                    Spacer()
                    Button { model.openCart() } label: {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: "cart")
                                .font(.title3)
                                .foregroundStyle(model.state.cartItems.isEmpty ? StockeaColor.ink(dark: dark) : StockeaColor.accent)
                                .frame(width: 44, height: 44)
                            if !model.state.cartItems.isEmpty {
                                Text("\(model.state.cartItems.count)")
                                    .font(.caption2.bold())
                                    .foregroundStyle(StockeaColor.accentInk)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 2)
                                    .background(StockeaColor.accent, in: Capsule())
                                    .offset(x: 6, y: 2)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Abrir carrito")
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Alertas")
                        .foregroundStyle(StockeaColor.muted(dark: dark))
                    Text("\(model.state.items.filter(\.isLowStock).count)")
                        .font(.system(size: 40, weight: .bold))
                        .foregroundStyle(StockeaColor.accent)
                    Text("\(model.state.items.filter { $0.quantity <= 0 }.count) sin stock")
                        .foregroundStyle(StockeaColor.muted(dark: dark))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .stockeaCard(dark: dark, radius: 20)

                if model.state.items.isEmpty {
                    Text("Todavía no hay productos. Tocá + Nuevo o buscá en Comparar.")
                        .foregroundStyle(StockeaColor.muted(dark: dark))
                        .padding(20)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .stockeaCard(dark: dark, radius: 20)
                }

                ForEach(grouped, id: \.0) { category, rows in
                    Text(category)
                        .font(.title3.bold())
                        .foregroundStyle(StockeaColor.ink(dark: dark))
                        .padding(.top, 6)
                    ForEach(rows) { item in
                        StockCard(item: item)
                    }
                }
            }
            .padding(16)
        }
    }
}

private struct StockCard: View {
    @EnvironmentObject private var model: AppModel
    let item: StockItem

    private var dark: Bool { model.state.darkTheme }
    private var step: Double { item.qtyUnit == "kg" ? 0.1 : 1 }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name)
                        .font(.headline)
                        .foregroundStyle(StockeaColor.ink(dark: dark))
                    if !item.barcode.isEmpty {
                        Text(item.barcode)
                            .font(.caption)
                            .foregroundStyle(StockeaColor.muted(dark: dark))
                    }
                }
                Spacer()
                if item.isLowStock {
                    Text("Stock bajo")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(StockeaColor.danger.opacity(0.16), in: Capsule())
                        .foregroundStyle(StockeaColor.danger)
                }
            }
            Text(money(item.price))
                .font(.headline)
                .foregroundStyle(StockeaColor.ink(dark: dark))
            HStack {
                Button { model.bumpQty(id: item.id, delta: -step) } label: {
                    Image(systemName: "minus")
                        .frame(width: 36, height: 36)
                }
                Text(qtyLabel(item))
                    .font(.headline)
                    .frame(minWidth: 64)
                Button { model.bumpQty(id: item.id, delta: step) } label: {
                    Image(systemName: "plus")
                        .frame(width: 36, height: 36)
                }
                Spacer()
                Button { model.openEdit(item) } label: {
                    Label("Editar", systemImage: "pencil")
                        .font(.caption.bold())
                        .foregroundStyle(StockeaColor.accent)
                }
                .accessibilityLabel("Editar artículo")
                Button { model.toggleCart(id: item.id) } label: {
                    Image(systemName: model.state.isInCart(item.id) ? "cart.fill" : "cart")
                }
                Button(role: .destructive) { model.deleteItem(id: item.id) } label: {
                    Image(systemName: "trash")
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(StockeaColor.ink(dark: dark))
        }
        .padding(14)
        .stockeaCard(dark: dark)
    }
}
