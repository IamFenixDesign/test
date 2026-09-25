import SwiftUI

enum StockeaColor {
    static let accent = Color(red: 0.831, green: 0.961, blue: 0.384)
    static let accentInk = Color(red: 0.078, green: 0.098, blue: 0.043)
    static let mint = Color(red: 0.494, green: 0.886, blue: 0.722)
    static let danger = Color(uiColor: .systemRed)

    static func background(dark: Bool) -> Color {
        Color(uiColor: dark ? .systemBackground : .systemBackground)
    }

    static func surface(dark: Bool) -> Color {
        Color(uiColor: dark ? .secondarySystemGroupedBackground : .secondarySystemGroupedBackground)
    }

    static func ink(dark: Bool) -> Color {
        dark ? Color.primary : Color.primary
    }

    static func muted(dark: Bool) -> Color {
        dark ? Color.secondary : Color.secondary
    }
}

extension View {
    @ViewBuilder
    func stockeaGlass<S: Shape>(in shape: S, interactive: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            if interactive {
                self.glassEffect(.regular.interactive(), in: shape)
            } else {
                self.glassEffect(.regular, in: shape)
            }
        } else {
            self.background(.ultraThinMaterial, in: shape)
        }
    }

    @ViewBuilder
    func stockeaCard(dark: Bool, radius: CGFloat = 18) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: shape)
        } else {
            self.background(StockeaColor.surface(dark: dark), in: shape)
        }
    }
}

struct StockeaBackground: View {
    var dark: Bool

    var body: some View {
        StockeaColor.background(dark: dark)
            .ignoresSafeArea()
    }
}

struct CubeMark: View {
    var light: Bool
    var size: CGFloat = 92

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.25, style: .continuous)
                .fill(light ? Color(red: 0.949, green: 0.961, blue: 0.933) : Color(red: 0.043, green: 0.051, blue: 0.047))
            Canvas { context, canvas in
                let s = min(canvas.width, canvas.height) / 32
                func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
                var top = Path()
                top.move(to: p(16, 6.1))
                top.addLine(to: p(25.4, 11.1))
                top.addLine(to: p(16, 16.1))
                top.addLine(to: p(6.6, 11.1))
                top.closeSubpath()
                var left = Path()
                left.move(to: p(6.6, 11.1))
                left.addLine(to: p(16, 16.1))
                left.addLine(to: p(16, 25.9))
                left.addLine(to: p(6.6, 20.9))
                left.closeSubpath()
                var right = Path()
                right.move(to: p(25.4, 11.1))
                right.addLine(to: p(16, 16.1))
                right.addLine(to: p(16, 25.9))
                right.addLine(to: p(25.4, 20.9))
                right.closeSubpath()
                context.fill(top, with: .color(Color(red: 0.831, green: 0.961, blue: 0.384)))
                context.fill(left, with: .color(Color(red: 0.478, green: 0.612, blue: 0.141)))
                context.fill(right, with: .color(Color(red: 0.494, green: 0.886, blue: 0.722)))
            }
            .padding(size * 0.16)
        }
        .frame(width: size, height: size)
        .shadow(color: .black.opacity(light ? 0.08 : 0.35), radius: 16, y: 8)
    }
}
