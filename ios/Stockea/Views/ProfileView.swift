import SwiftUI
import UniformTypeIdentifiers

struct ProfileView: View {
    @EnvironmentObject private var model: AppModel
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""
    @State private var importing = false

    private var dark: Bool { model.state.darkTheme }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Perfil")
                    .font(.title.bold())
                    .foregroundStyle(StockeaColor.ink(dark: dark))
                if let user = model.state.user {
                    Text(user.displayName)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(StockeaColor.ink(dark: dark))
                    Text(user.email)
                        .foregroundStyle(StockeaColor.muted(dark: dark))
                    Text("\(model.state.items.count) productos")
                        .font(.subheadline)
                        .foregroundStyle(StockeaColor.muted(dark: dark))
                }

                field("Nombre", text: $firstName)
                field("Apellido", text: $lastName)
                field("Email", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)

                Button(model.state.busy ? "Guardando…" : "Guardar") {
                    model.saveProfile(firstName: firstName, lastName: lastName, email: email)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(model.state.busy)

                Button(dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro") {
                    model.toggleTheme()
                }
                .buttonStyle(SecondaryButtonStyle(dark: dark))

                if let url = exportURL {
                    ShareLink(item: url) {
                        Text("Exportar stock")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(SecondaryButtonStyle(dark: dark))
                }

                Button("Importar stock") { importing = true }
                    .buttonStyle(SecondaryButtonStyle(dark: dark))

                Button("Cerrar sesión", role: .destructive) { model.logout() }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)

                Text("Created by Fenix")
                    .font(.footnote)
                    .foregroundStyle(StockeaColor.muted(dark: dark))
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)
            }
            .padding(16)
        }
        .onAppear(perform: load)
        .onChange(of: model.state.user?.id) { _, _ in load() }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            if case let .success(url) = result {
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                if let data = try? Data(contentsOf: url), let text = String(data: data, encoding: .utf8) {
                    model.importJSON(text)
                }
            }
        }
    }

    private var exportURL: URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("stockea.json")
        guard let data = model.exportJSON().data(using: .utf8) else { return nil }
        try? data.write(to: url, options: .atomic)
        return url
    }

    private func load() {
        guard let user = model.state.user else { return }
        firstName = user.firstName
        lastName = user.lastName
        email = user.email
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
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(StockeaColor.accentInk)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(StockeaColor.accent.opacity(configuration.isPressed ? 0.8 : 1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    var dark: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(StockeaColor.ink(dark: dark))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(StockeaColor.surface(dark: dark).opacity(configuration.isPressed ? 0.7 : 1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
