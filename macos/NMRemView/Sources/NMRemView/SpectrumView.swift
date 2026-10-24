import SwiftUI

/// Native spectrum plot: reversed ppm axis, peak labels, integral brackets, reference bands
/// and compound overlays. Drag to zoom, double-click to reset.
struct SpectrumView: View {
    let result: SpectrumResult
    var bands: [ShiftGroup] = []
    var overlay: CompoundMatch?
    var highlight: Signal?

    @State private var view: ClosedRange<Double>?
    @State private var dragStart: CGFloat?
    @State private var dragNow: CGFloat?

    private var fullRange: ClosedRange<Double> {
        let lo = min(result.ppmStart, result.ppmEnd), hi = max(result.ppmStart, result.ppmEnd)
        // Open on the populated region like the web app.
        if let maxP = result.peaks.map(\.ppm).max(), let minP = result.peaks.map(\.ppm).min() {
            let pad = result.is13C ? 8.0 : 0.4
            return max(lo, minP - pad)...min(hi, max(maxP + pad, result.is13C ? 220 : 10))
        }
        return lo...hi
    }

    var body: some View {
        GeometryReader { geo in
            let range = view ?? fullRange
            Canvas { ctx, size in draw(ctx: ctx, size: size, range: range) }
                .gesture(
                    DragGesture(minimumDistance: 4)
                        .onChanged { v in dragStart = v.startLocation.x; dragNow = v.location.x }
                        .onEnded { v in
                            let a = ppm(at: v.startLocation.x, width: geo.size.width, range: range)
                            let b = ppm(at: v.location.x, width: geo.size.width, range: range)
                            if abs(a - b) > 0.001 { view = min(a, b)...max(a, b) }
                            dragStart = nil; dragNow = nil
                        }
                )
                .onTapGesture(count: 2) { view = nil }
                .overlay(alignment: .topLeading) {
                    if let s = dragStart, let n = dragNow {
                        Rectangle().fill(Color.accentColor.opacity(0.12))
                            .frame(width: abs(n - s)).offset(x: min(s, n))
                    }
                }
        }
        .onChange(of: result.id) { view = nil }
        .onChange(of: highlight) {
            if let h = highlight {
                let w = max(h.ppmFrom - h.ppmTo, result.is13C ? 1 : 0.05)
                view = (h.ppmTo - w)...(h.ppmFrom + w)
            }
        }
    }

    private let margin: CGFloat = 12
    private func x(_ ppm: Double, width: CGFloat, range: ClosedRange<Double>) -> CGFloat {
        margin + CGFloat((range.upperBound - ppm) / (range.upperBound - range.lowerBound)) * (width - 2 * margin)
    }
    private func ppm(at x: CGFloat, width: CGFloat, range: ClosedRange<Double>) -> Double {
        range.upperBound - Double((x - margin) / (width - 2 * margin)) * (range.upperBound - range.lowerBound)
    }

    private func draw(ctx: GraphicsContext, size: CGSize, range: ClosedRange<Double>) {
        let top: CGFloat = 70, axisY = size.height - 56
        let W = size.width
        // Data arrive as min/max pairs over the full spectrum.
        let pairs = result.y.count / 2
        let colPpm = { (c: Int) -> Double in result.ppmStart + (result.ppmEnd - result.ppmStart) * Double(c) / Double(max(1, pairs - 1)) }
        var vmax = 1e-12
        for c in 0..<pairs where range.contains(colPpm(c)) { vmax = max(vmax, result.y[2 * c + 1]) }
        let yOf = { (v: Double) -> CGFloat in axisY - 6 - CGFloat(v / vmax) * (axisY - top - 10) }

        for b in bands {
            let x1 = x(b.max, width: W, range: range), x2 = x(b.min, width: W, range: range)
            ctx.fill(Path(CGRect(x: x1, y: top, width: x2 - x1, height: axisY - top)), with: .color(.teal.opacity(0.12)))
            ctx.draw(Text(b.name).font(.caption2).foregroundColor(.teal), at: CGPoint(x: x1 + 4, y: top + 8), anchor: .leading)
        }
        if let h = highlight {
            let x1 = x(h.ppmFrom, width: W, range: range), x2 = x(h.ppmTo, width: W, range: range)
            ctx.fill(Path(CGRect(x: x1, y: top, width: x2 - x1, height: axisY - top)), with: .color(.orange.opacity(0.12)))
        }

        // Axis
        var axis = Path()
        axis.move(to: CGPoint(x: margin, y: axisY)); axis.addLine(to: CGPoint(x: W - margin, y: axisY))
        let span = range.upperBound - range.lowerBound
        let raw = span / 10, mag = pow(10, floor(log10(raw)))
        let step = (raw / mag < 1.5 ? 1 : raw / mag < 3 ? 2 : raw / mag < 7 ? 5 : 10) * mag
        var t = (range.lowerBound / step).rounded(.up) * step
        let decimals = max(0, Int(-floor(log10(step))))
        while t <= range.upperBound {
            let X = x(t, width: W, range: range)
            axis.move(to: CGPoint(x: X, y: axisY)); axis.addLine(to: CGPoint(x: X, y: axisY + 5))
            ctx.draw(Text(String(format: "%.\(decimals)f", t)).font(.system(size: 10, design: .monospaced)).foregroundColor(.secondary), at: CGPoint(x: X, y: axisY + 15))
            t += step
        }
        ctx.stroke(axis, with: .color(.secondary), lineWidth: 1)

        // Trace
        var path = Path()
        var started = false
        for c in 0..<pairs {
            let p = colPpm(c)
            guard range.contains(p) else { continue }
            let X = x(p, width: W, range: range)
            let a = CGPoint(x: X, y: yOf(result.y[2 * c])), b = CGPoint(x: X, y: yOf(result.y[2 * c + 1]))
            if !started { path.move(to: a); started = true } else { path.addLine(to: a) }
            path.addLine(to: b)
        }
        ctx.stroke(path, with: .color(Color(red: 0.09, green: 0.19, blue: 0.42)), lineWidth: 1)

        // Compound overlay sticks
        if let o = overlay {
            var sticks = Path()
            for p in (result.is13C ? o.c : o.h) where range.contains(p) {
                let X = x(p, width: W, range: range)
                sticks.move(to: CGPoint(x: X, y: axisY - 6)); sticks.addLine(to: CGPoint(x: X, y: top + 40))
            }
            ctx.stroke(sticks, with: .color(.pink), style: StrokeStyle(lineWidth: 2, dash: [4, 3]))
        }

        // Peak labels along the top
        let visible = result.peaks.filter { range.contains($0.ppm) }.sorted { $0.ppm > $1.ppm }
        let maxLabels = Int((W - 2 * margin) / 11)
        let shown = visible.count > maxLabels ? Array(visible.sorted { $0.height > $1.height }.prefix(maxLabels)).sorted { $0.ppm > $1.ppm } : visible
        var lastX = -CGFloat.infinity
        for p in shown {
            var lx = max(x(p.ppm, width: W, range: range), lastX + 11)
            lx = min(lx, W - margin)
            lastX = lx
            var leader = Path()
            leader.move(to: CGPoint(x: lx, y: top - 14)); leader.addLine(to: CGPoint(x: x(p.ppm, width: W, range: range), y: top - 2))
            ctx.stroke(leader, with: .color(.secondary.opacity(0.6)), lineWidth: 0.6)
            var label = ctx
            label.translateBy(x: lx, y: top - 16)
            label.rotate(by: .degrees(-90))
            label.draw(Text(String(format: result.is13C ? "%.2f" : "%.3f", p.ppm)).font(.system(size: 9, design: .monospaced)), at: .zero, anchor: .leading)
        }

        // Integral brackets
        if !result.is13C {
            for s in result.signals where !s.minor && !s.excluded {
                let x1 = x(s.ppmFrom, width: W, range: range), x2 = x(s.ppmTo, width: W, range: range)
                guard x2 > margin, x1 < W - margin else { continue }
                var br = Path()
                br.move(to: CGPoint(x: x1, y: axisY + 26)); br.addLine(to: CGPoint(x: x1, y: axisY + 30))
                br.addLine(to: CGPoint(x: x2, y: axisY + 30)); br.addLine(to: CGPoint(x: x2, y: axisY + 26))
                ctx.stroke(br, with: .color(.orange), lineWidth: 1.2)
                ctx.draw(Text(String(format: "%.2f", s.nH)).font(.system(size: 10, design: .monospaced).weight(.semibold)).foregroundColor(.orange), at: CGPoint(x: (x1 + x2) / 2, y: axisY + 42))
            }
        }
    }
}
