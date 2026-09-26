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

/// Misma G de cuatro colores que Android y la web.
private struct GoogleG: View {
    var body: some View {
        Canvas { context, canvas in
            let s = min(canvas.width, canvas.height) / 48
            func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }

            var red = Path()
            red.move(to: pt(24, 9.5))
            red.addCurve(to: pt(33.21, 13.1), control1: pt(27.54, 9.5), control2: pt(30.71, 10.72))
            red.addLine(to: pt(40.06, 6.25))
            red.addCurve(to: pt(24, 0), control1: pt(35.9, 2.38), control2: pt(30.47, 0))
            red.addCurve(to: pt(2.56, 13.22), control1: pt(14.62, 0), control2: pt(6.51, 5.38))
            red.addLine(to: pt(10.54, 19.41))
            red.addCurve(to: pt(24, 9.5), control1: pt(12.43, 13.72), control2: pt(17.74, 9.5))
            red.closeSubpath()

            var blue = Path()
            blue.move(to: pt(46.98, 24.55))
            blue.addCurve(to: pt(46.6, 20), control1: pt(46.98, 22.98), control2: pt(46.83, 21.46))
            blue.addLine(to: pt(24, 20))
            blue.addLine(to: pt(24, 29.02))
            blue.addLine(to: pt(36.94, 29.02))
            blue.addCurve(to: pt(32.16, 36.2), control1: pt(36.36, 31.98), control2: pt(34.68, 34.5))
            blue.addLine(to: pt(39.89, 42.2))
            blue.addCurve(to: pt(46.98, 24.55), control1: pt(44.4, 38.02), control2: pt(46.98, 31.84))
            blue.closeSubpath()

            var yellow = Path()
            yellow.move(to: pt(10.53, 28.59))
            yellow.addCurve(to: pt(9.77, 24), control1: pt(10.05, 27.14), control2: pt(9.77, 25.6))
            yellow.addCurve(to: pt(10.53, 19.41), control1: pt(9.77, 22.4), control2: pt(10.04, 20.86))
            yellow.addLine(to: pt(2.55, 13.22))
            yellow.addCurve(to: pt(0, 24), control1: pt(0.92, 16.46), control2: pt(0, 20.12))
            yellow.addCurve(to: pt(2.56, 34.78), control1: pt(0, 27.88), control2: pt(0.92, 31.54))
            yellow.addLine(to: pt(10.53, 28.59))
            yellow.closeSubpath()

            var green = Path()
            green.move(to: pt(24, 48))
            green.addCurve(to: pt(39.89, 42.19), control1: pt(30.48, 48), control2: pt(35.93, 45.87))
            green.addLine(to: pt(32.16, 36.19))
            green.addCurve(to: pt(24, 38.49), control1: pt(30.01, 37.64), control2: pt(27.24, 38.49))
            green.addCurve(to: pt(10.53, 28.58), control1: pt(17.74, 38.49), control2: pt(12.43, 34.27))
            green.addLine(to: pt(2.55, 34.77))
            green.addCurve(to: pt(24, 48), control1: pt(6.51, 42.62), control2: pt(14.62, 48))
            green.closeSubpath()

            context.fill(red, with: .color(Color(red: 234 / 255, green: 67 / 255, blue: 53 / 255)))
            context.fill(blue, with: .color(Color(red: 66 / 255, green: 133 / 255, blue: 244 / 255)))
            context.fill(yellow, with: .color(Color(red: 251 / 255, green: 188 / 255, blue: 5 / 255)))
            context.fill(green, with: .color(Color(red: 52 / 255, green: 168 / 255, blue: 83 / 255)))
        }
        .frame(width: 30, height: 30)
        .accessibilityHidden(true)
    }
}
