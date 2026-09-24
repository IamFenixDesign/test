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
            .background(StockeaColor.background(dark: dark))
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

            ForEach(promosForDayGrouped(cartDay), id: \.0) { title, promos in
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(StockeaColor.muted(dark: dark))
                    .padding(.top, 2)
                ForEach(promos) { promo in
                    Button {
                        promoId = promoId == promo.id ? "none" : promo.id
                    } label: {
                        HStack(spacing: 10) {
                            Text("-\(promo.percent)%")
                                .font(.subheadline.bold())
                                .foregroundStyle(StockeaColor.accentInk)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(StockeaColor.accent, in: Capsule())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(promo.short)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(StockeaColor.ink(dark: dark))
                                Text(promo.payment)
                                    .font(.caption2)
                                    .foregroundStyle(StockeaColor.muted(dark: dark))
                            }
                            Spacer()
                            Image(systemName: promoId == promo.id ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(promoId == promo.id ? StockeaColor.accent : StockeaColor.muted(dark: dark))
                        }
                        .padding(10)
                        .background(StockeaColor.surface(dark: dark), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(promoId == promo.id ? StockeaColor.accent : .clear, lineWidth: 1.5)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
        .background(StockeaColor.surface(dark: dark).opacity(0.55), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
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
        .background(StockeaColor.surface(dark: dark), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
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
