import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var model: AppModel
    @State private var localError = ""

    private var dark: Bool { model.state.darkTheme }

    var body: some View {
        ZStack {
            StockeaBackground(dark: dark)
            VStack(spacing: 0) {
                CubeMark(light: !dark, size: 92)
                    .padding(.bottom, 18)
                Text("Stockea")
                    .font(.system(size: 44, weight: .heavy))
                    .foregroundStyle(dark ? .white : StockeaColor.ink(dark: false))
                    .tracking(-1.4)
                Text("Tu stock, al día")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(StockeaColor.muted(dark: dark))
                    .padding(.top, 8)
                Text("Precios de súper y alertas en un solo lugar.")
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(StockeaColor.muted(dark: dark).opacity(0.9))
                    .padding(.top, 6)
                    .padding(.horizontal, 28)

                if let message = shownError {
                    Text(message)
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(StockeaColor.danger)
                        .padding(.top, 16)
                        .padding(.horizontal, 28)
                }

                Button {
                    signIn()
                } label: {
                    ZStack {
                        Circle().fill(.white).frame(width: 68, height: 68)
                            .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
                        if model.state.busy {
                            ProgressView().tint(Color(red: 0.26, green: 0.52, blue: 0.96))
                        } else {
                            GoogleG()
                        }
                    }
                }
                .buttonStyle(.plain)
                .disabled(model.state.busy)
                .padding(.top, 36)
                .accessibilityLabel("Iniciar sesión con Google")
            }
            .padding(.horizontal, 24)
        }
    }

    private var shownError: String? {
        if !localError.isEmpty { return localError }
        if !model.state.error.isEmpty { return model.state.error }
        return nil
    }

    private func signIn() {
        localError = ""
        Task {
            do {
                let token = try await GoogleAuth.idToken()
                model.loginWithGoogle(token)
            } catch {
                localError = error.localizedDescription
            }
        }
    }
}

private struct GoogleG: View {
    var body: some View {
        Text("G")
            .font(.system(size: 28, weight: .bold, design: .rounded))
            .foregroundStyle(
                LinearGradient(
                    colors: [
                        Color(red: 0.26, green: 0.52, blue: 0.96),
                        Color(red: 0.92, green: 0.26, blue: 0.21),
                        Color(red: 0.98, green: 0.74, blue: 0.02),
                        Color(red: 0.20, green: 0.66, blue: 0.33),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
    }
}
