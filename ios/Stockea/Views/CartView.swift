import SwiftUI

struct CartView: View {
    @EnvironmentObject private var model: AppModel
    @State private var cartDay = todayWeekday()
    @State private var promoId = "none"

    private var dark: Bool { model.state.darkTheme }
    private var quote: CartQuote { quoteCart(items: model.state.cartItems, promoId: promoId) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    dealsPanel
                    if quote.lines.isEmpty {
                        Text("No hay productos bajo el mínimo.")
                            .foregroundStyle(StockeaColor.muted(dark: dark))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 8)
                    } else {
                        ForEach(quote.lines) { line in
                            lineCard(line)
                        }
                        totalCard
                    }
                }
                .padding(16)
            }
            .background(.clear)
            .navigationTitle("Carrito")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { model.closeCart() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Compré") { model.markCartBought() }
                        .disabled(quote.lines.isEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var dealsPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sucursal")
                .font(.caption.weight(.semibold))
                .foregroundStyle(StockeaColor.muted(dark: dark))
            Text(quote.promo.percent > 0 ? "\(weekdayLabel(cartDay)) · \(quote.promo.short)" : "\(weekdayLabel(cartDay)) · Sin dto")
                .font(.headline)
                .foregroundStyle(StockeaColor.ink(dark: dark))

            HStack(spacing: 6) {
                ForEach(weekdays) { day in
                    Button {
                        cartDay = day.id
                        promoId = "none"
                    } label: {
                        Text(day.short)
                            .font(.caption.weight(.bold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .foregroundStyle(cartDay == day.id ? StockeaColor.accentInk : StockeaColor.ink(dark: dark))
                            .background(
                                cartDay == day.id ? StockeaColor.accent : StockeaColor.surface(dark: dark),
                                in: Capsule()
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            HStack(alignment: .top, spacing: 6) {
                ForEach(promoColumns, id: \.title) { column in
                    VStack(spacing: 6) {
                        Text(column.title)
                            .font(.caption2.weight(.bold))
                            .textCase(.uppercase)
                            .foregroundStyle(column.tint)
                            .frame(maxWidth: .infinity)
                        ForEach(column.promos) { promo in
                            promoCard(promo, tint: column.tint)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .top)
                }
            }
        }
        .padding(14)
        .stockeaCard(dark: dark)
    }

    private var promoColumns: [(title: String, tint: Color, promos: [PaymentPromo])] {
        let grouped = Dictionary(uniqueKeysWithValues: promosForDayGrouped(cartDay))
        return [
            ("Coto", Color(red: 0.86, green: 0.18, blue: 0.18), grouped["Coto"] ?? []),
            ("Carrefour", Color(red: 0.12, green: 0.45, blue: 0.85), grouped["Carrefour"] ?? []),
            ("Día", Color(red: 0.85, green: 0.15, blue: 0.28), grouped["Día"] ?? []),
        ]
    }

    private func promoCard(_ promo: PaymentPromo, tint: Color) -> some View {
        let selected = promoId == promo.id
        return Button {
            promoId = selected ? "none" : promo.id
        } label: {
            VStack(spacing: 4) {
                Text("-\(promo.percent)%")
                    .font(.subheadline.bold())
                    .foregroundStyle(selected ? StockeaColor.accentInk : tint)
                Text(promo.short)
                    .font(.caption2.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .foregroundStyle(selected ? StockeaColor.accentInk : StockeaColor.ink(dark: dark))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .padding(.horizontal, 4)
            .background(selected ? StockeaColor.accent : StockeaColor.surface(dark: dark), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(selected ? StockeaColor.accent : tint.opacity(0.35), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(promo.short), \(promo.percent) por ciento, \(promo.payment)")
    }

    private func lineCard(_ line: CartQuoteLine) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(line.item.name)
                    .font(.headline)
                    .foregroundStyle(StockeaColor.ink(dark: dark))
                Spacer()
                Button("Quitar") { model.toggleCart(id: line.item.id) }
                    .font(.caption.bold())
            }
            Text("Faltan \(cartQtyLabel(line.item))")
                .font(.subheadline)
                .foregroundStyle(StockeaColor.muted(dark: dark))
            if !line.eligible && !line.reason.isEmpty {
                Text(line.reason)
                    .font(.caption)
                    .foregroundStyle(StockeaColor.danger)
            }
            HStack {
                Text(money(line.unitPrice))
                    .foregroundStyle(StockeaColor.muted(dark: dark))
                Spacer()
                if line.discount > 0 {
                    Text("-\(money(line.discount))")
                        .font(.caption.bold())
                        .foregroundStyle(StockeaColor.accent)
                }
                Text(money(line.payable))
                    .font(.headline)
                    .foregroundStyle(StockeaColor.ink(dark: dark))
            }
        }
        .padding(14)
        .stockeaCard(dark: dark, radius: 16)
    }

    private var totalCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            if quote.discountTotal > 0 {
                Text("Descuento \(money(quote.discountTotal))")
                    .foregroundStyle(StockeaColor.accent)
            }
            Text("Total \(money(quote.payable))")
                .font(.title3.bold())
                .foregroundStyle(StockeaColor.ink(dark: dark))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
