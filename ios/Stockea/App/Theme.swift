import SwiftUI

enum StockeaColor {
    static let accent = Color(red: 0.831, green: 0.961, blue: 0.384)
    static let accentInk = Color(red: 0.078, green: 0.098, blue: 0.043)
    static let mint = Color(red: 0.494, green: 0.886, blue: 0.722)
    static let danger = Color(red: 1, green: 0.478, blue: 0.431)

    static func background(dark: Bool) -> Color {
        dark ? Color(red: 0.043, green: 0.051, blue: 0.047) : Color(red: 0.949, green: 0.961, blue: 0.933)
    }

    static func surface(dark: Bool) -> Color {
        dark ? Color(red: 0.090, green: 0.110, blue: 0.098) : Color.white
    }

    static func ink(dark: Bool) -> Color {
        dark ? Color(red: 0.933, green: 0.957, blue: 0.918) : Color(red: 0.078, green: 0.110, blue: 0.086)
    }

    static func muted(dark: Bool) -> Color {
        dark ? Color(red: 0.545, green: 0.588, blue: 0.533) : Color(red: 0.361, green: 0.416, blue: 0.373)
    }
}

struct StockeaBackground: View {
    var dark: Bool

    var body: some View {
        LinearGradient(
            colors: dark
                ? [Color(red: 0.141, green: 0.188, blue: 0.094), Color(red: 0.043, green: 0.051, blue: 0.047), .black]
                : [Color(red: 0.843, green: 0.906, blue: 0.643), Color(red: 0.953, green: 0.965, blue: 0.933), .white],
            startPoint: .top,
            endPoint: .bottom
        )
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
