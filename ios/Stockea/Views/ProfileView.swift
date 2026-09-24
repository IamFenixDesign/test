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
            VStack(spacing: 14) {
                if let user = model.state.user {
                    hero(user)
                }
                formCard
                stockCard
                logoutButton
                Text("Versión \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(StockeaColor.muted(dark: dark))
                Text("Created by Fenix")
                    .font(.footnote)
                    .foregroundStyle(StockeaColor.muted(dark: dark))
            }
            .padding(16)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
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

    private func hero(_ user: User) -> some View {
        HStack(spacing: 14) {
            avatar(user)
            VStack(alignment: .leading, spacing: 3) {
                Text(user.displayName)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(StockeaColor.ink(dark: dark))
                    .lineLimit(2)
                if !user.email.isEmpty {
                    Text(user.email)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(StockeaColor.muted(dark: dark))
                        .lineLimit(1)
                }
                Text(user.provider == "google" ? "Vinculada a Google" : "Cuenta con correo")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(StockeaColor.accent)
                    .textCase(.uppercase)
                Text("\(model.state.items.count) productos")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(StockeaColor.muted(dark: dark))
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .stockeaCard(dark: dark, radius: 22)
    }

    @ViewBuilder
    private func avatar(_ user: User) -> some View {
        let letter = String((user.displayName.isEmpty ? user.email : user.displayName).prefix(1)).uppercased()
        if let url = URL(string: user.picture), !user.picture.isEmpty {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    avatarLetter(letter)
                }
            }
            .frame(width: 64, height: 64)
            .clipShape(Circle())
        } else {
            avatarLetter(letter)
        }
    }

    private func avatarLetter(_ letter: String) -> some View {
        Text(letter.isEmpty ? "S" : letter)
            .font(.title2.bold())
            .foregroundStyle(StockeaColor.ink(dark: dark))
            .frame(width: 64, height: 64)
            .background(StockeaColor.background(dark: dark), in: Circle())
    }

    private var formCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            field("Nombre", text: $firstName)
            field("Apellido", text: $lastName)
            field("Correo", text: $email)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
            Button(model.state.busy ? "Guardando…" : "Guardar cambios") {
                model.saveProfile(firstName: firstName, lastName: lastName, email: email)
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(model.state.busy)
        }
        .padding(16)
        .stockeaCard(dark: dark, radius: 22)
    }

    private var stockCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Lista de stock")
                .font(.headline)
                .foregroundStyle(StockeaColor.ink(dark: dark))
            Text("Exportá un JSON de respaldo o importá una lista para sumar productos.")
                .font(.subheadline)
                .foregroundStyle(StockeaColor.muted(dark: dark))
            HStack(spacing: 10) {
                if let url = exportURL {
                    ShareLink(item: url) {
                        Label("Exportar", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(SecondaryButtonStyle(dark: dark))
                    .disabled(model.state.items.isEmpty)
                }
                Button {
                    importing = true
                } label: {
                    Label("Importar", systemImage: "square.and.arrow.down")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle(dark: dark))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .stockeaCard(dark: dark, radius: 22)
    }

    private var logoutButton: some View {
        Button {
            model.logout()
        } label: {
            Label("Cerrar sesión", systemImage: "rectangle.portrait.and.arrow.right")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(LogoutButtonStyle())
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
                .font(.caption.weight(.semibold))
                .foregroundStyle(StockeaColor.muted(dark: dark))
            TextField(title, text: text)
                .padding(12)
                .background(StockeaColor.background(dark: dark), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
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
            .font(.subheadline.bold())
            .foregroundStyle(StockeaColor.ink(dark: dark))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(StockeaColor.background(dark: dark).opacity(configuration.isPressed ? 0.7 : 1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct LogoutButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(StockeaColor.danger)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(StockeaColor.danger.opacity(configuration.isPressed ? 0.22 : 0.14), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
