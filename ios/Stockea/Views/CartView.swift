import SwiftUI

struct CartView: View {
    @EnvironmentObject private var model: AppModel

    private var dark: Bool { model.state.darkTheme }
    private var items: [StockItem] { model.state.cartItems }

    var body: some View {
        NavigationStack {
            Group {
                if items.isEmpty {
                    Text("No hay productos bajo el mínimo.")
                        .foregroundStyle(StockeaColor.muted(dark: dark))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(items) { item in
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.name)
                                        .font(.headline)
                                    Text("Faltan \(cartQtyLabel(item))")
                                        .font(.subheadline)
                                        .foregroundStyle(StockeaColor.muted(dark: dark))
                                }
                                Spacer()
                                Button("Quitar") { model.toggleCart(id: item.id) }
                                    .font(.caption.bold())
                            }
                            .listRowBackground(StockeaColor.surface(dark: dark))
                        }
                    }
                    .scrollContentBackground(.hidden)
                }
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
                        .disabled(items.isEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
