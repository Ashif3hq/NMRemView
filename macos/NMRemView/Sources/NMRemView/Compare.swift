import SwiftUI
import AppKit

/// Overlay and stack of several spectra. The maths matches core/stack.js so the plot and the
/// exported SVG place traces the same way.
enum CompareMode: String, CaseIterable, Identifiable {
    case single = "Single", overlay = "Overlay", stack = "Stack"
    var id: String { rawValue }
    var core: String { self == .overlay ? "overlay" : "stack" }
}

struct CompareSettings: Equatable {
    var mode: CompareMode = .single
    /// 0 = traces on top of each other, 1 = no overlap (stack only).
    var gap: Double = 0.6
    /// All traces share one intensity scale instead of each filling its own height.
    var commonScale = false
}

/// One spectrum drawn in an overlay or stack.
struct StackTrace {
    let result: SpectrumResult
    let colorIndex: Int
    let active: Bool
    var color: Color { StackPalette.color(colorIndex) }
}

enum StackPalette {
    /// Same order as STACK_COLORS in core/stack.js (light) and the web app's dark series.
    private static let light: [UInt32] = [0x18306b, 0xc4561b, 0x0e7c86, 0xb0287a, 0x3b7d23, 0x6a3ea1, 0x8a6d00, 0x5d6b79]
    private static let dark: [UInt32] = [0x8fb4ff, 0xf0905a, 0x3fb8c2, 0xf07ac4, 0x7cc95e, 0xc4a3f2, 0xe0c050, 0xa5b1bd]

    static func color(_ i: Int) -> Color {
        let k = ((i % light.count) + light.count) % light.count
        return Color(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            let v = (isDark ? dark : light)[k]
            return NSColor(srgbRed: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
        })
    }
}

/// Single / Overlay / Stack switch, stack gap and common scale, shown above the plot.
struct CompareBar: View {
    @EnvironmentObject var store: Store

    var body: some View {
        HStack(spacing: 10) {
            Picker("Compare", selection: Binding(get: { store.compare.mode }, set: { store.setCompareMode($0) })) {
                ForEach(CompareMode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 210)
            .help("Overlay or stack the spectra ticked in the sidebar")
            if store.compare.mode == .stack {
                Text("Gap").font(.caption)
                Slider(value: Binding(get: { store.compare.gap }, set: { store.compare.gap = $0 }), in: 0...1).frame(width: 110)
            }
            if store.compare.mode != .single {
                Toggle("Same scale", isOn: Binding(get: { store.compare.commonScale }, set: { store.compare.commonScale = $0 }))
                    .help("Off: each spectrum fills its own height. On: all share one intensity scale, so relative heights compare.")
                Text("\(store.compareTraces.count) shown · tick spectra in the sidebar").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}
