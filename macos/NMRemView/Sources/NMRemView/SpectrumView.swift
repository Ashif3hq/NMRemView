import SwiftUI
import AppKit

/// Native spectrum plot: reversed ppm axis, peak labels, integral brackets, reference bands,
/// compound overlays, hand-picked peaks, labels and notes. What a drag or click does depends on
/// the active tool; double-click fits the spectrum in Zoom and Pan.
struct SpectrumView: View {
    let result: SpectrumResult
    var bands: [ShiftGroup] = []
    var overlay: CompoundMatch?
    var highlight: Signal?
    var tool: Tool = .zoom
    var marks: [PlotMark] = []
    @Binding var view: ClosedRange<Double>?
    var onRange: ((Double, Double) -> Void)? = nil
    /// ppm, point in the view, vertical position as a fraction of the plot, plot width, ppm per point, index of a label or note hit.
    var onClick: ((Double, CGPoint, Double, CGFloat, Double, Int?) -> Void)? = nil

    @State private var dragStart: CGFloat?
    @State private var dragNow: CGFloat?
    @State private var panFrom: ClosedRange<Double>?
    @State private var lastClick = Date.distantPast

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
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { v in
                            if tool == .pan {
                                if panFrom == nil { panFrom = range }
                                pan(by: v.translation.width, width: geo.size.width)
                            } else if abs(v.translation.width) > 3 {
                                dragStart = v.startLocation.x; dragNow = v.location.x
                            }
                        }
                        .onEnded { v in end(v, size: geo.size, range: range) }
                )
                .overlay(alignment: .topLeading) {
                    if let s = dragStart, let n = dragNow {
                        Rectangle().fill((tool.dragSelects ? Color.orange : Color.accentColor).opacity(0.15))
                            .frame(width: abs(n - s)).offset(x: min(s, n))
                    }
                }
                .onHover { inside in
                    if inside { cursor.push() } else { NSCursor.pop() }
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

    private var cursor: NSCursor {
        switch tool {
        case .pan: return .openHand
        case .label, .note: return .iBeam
        case .peakDel, .setIntegral, .reference: return .pointingHand
        default: return .crosshair
        }
    }

    private func pan(by dx: CGFloat, width: CGFloat) {
        guard let from = panFrom else { return }
        let lo = min(result.ppmStart, result.ppmEnd), hi = max(result.ppmStart, result.ppmEnd)
        let w = from.upperBound - from.lowerBound
        let d = Double(dx / (width - 2 * margin)) * w
        var a = from.lowerBound + d, b = from.upperBound + d
        if b > hi { a -= b - hi; b = hi }
        if a < lo { b += lo - a; a = lo }
        view = a...min(hi, b)
    }

    private func end(_ v: DragGesture.Value, size: CGSize, range: ClosedRange<Double>) {
        defer { dragStart = nil; dragNow = nil; panFrom = nil }
        if tool == .pan && abs(v.translation.width) > 3 { return }
        let W = size.width
        if abs(v.translation.width) > 4 {
            let a = ppm(at: v.startLocation.x, width: W, range: range), b = ppm(at: v.location.x, width: W, range: range)
            guard abs(a - b) > 0.0005 else { return }
            if tool.dragSelects, let onRange { onRange(max(a, b), min(a, b)) } else { view = min(a, b)...max(a, b) }
            return
        }
        let now = Date()
        if now.timeIntervalSince(lastClick) < 0.35 && (tool == .zoom || tool == .pan) { view = nil; lastClick = .distantPast; return }
        lastClick = now
        let g = Geo(size: size, range: range, view: self)
        let p = v.location
        let hit = annotationBoxes(g).first { $0.rect.insetBy(dx: -4, dy: -4).contains(p) }?.index
        let yFrac = Double((p.y - g.top) / (g.axisY - g.top))
        onClick?(ppm(at: p.x, width: W, range: range), p, yFrac, W, (range.upperBound - range.lowerBound) / Double(W - 2 * margin), hit)
    }

    private let margin: CGFloat = 12
    private func x(_ ppm: Double, width: CGFloat, range: ClosedRange<Double>) -> CGFloat {
        margin + CGFloat((range.upperBound - ppm) / (range.upperBound - range.lowerBound)) * (width - 2 * margin)
    }
    private func ppm(at x: CGFloat, width: CGFloat, range: ClosedRange<Double>) -> Double {
        range.upperBound - Double((x - margin) / (width - 2 * margin)) * (range.upperBound - range.lowerBound)
    }

    /// Plot geometry shared by drawing and hit-testing.
    private struct Geo {
        let W: CGFloat, top: CGFloat, axisY: CGFloat
        let range: ClosedRange<Double>
        let pairs: Int
        let vmax: Double
        let result: SpectrumResult
        init(size: CGSize, range: ClosedRange<Double>, view: SpectrumView) {
            W = size.width; top = 70; axisY = size.height - 56
            self.range = range
            result = view.result
            let n = view.result.y.count / 2
            pairs = n
            var m = 1e-12
            for c in 0..<n where range.contains(Geo.colPpm(c, view.result, n)) { m = max(m, view.result.y[2 * c + 1]) }
            vmax = m
        }
        static func colPpm(_ c: Int, _ r: SpectrumResult, _ pairs: Int) -> Double {
            r.ppmStart + (r.ppmEnd - r.ppmStart) * Double(c) / Double(max(1, pairs - 1))
        }
        func colPpm(_ c: Int) -> Double { Geo.colPpm(c, result, pairs) }
        func yOf(_ v: Double) -> CGFloat { axisY - 6 - CGFloat(v / vmax) * (axisY - top - 10) }
        /// Highest point within ±half ppm of a shift.
        func apex(_ ppm: Double, half: Double) -> Double {
            var m = 0.0
            for c in 0..<pairs where abs(colPpm(c) - ppm) <= half { m = max(m, result.y[2 * c + 1]) }
            return m
        }
    }

    private struct AnnotationBox { let index: Int; let rect: CGRect; let anchorX: CGFloat; let apexY: CGFloat?; let a: Annotation }

    private func annotationBoxes(_ g: Geo) -> [AnnotationBox] {
        let sh = result.params.referenceShift
        var out: [AnnotationBox] = []
        for (i, a) in result.params.annotations.enumerated() {
            let p = a.ppm + sh
            guard g.range.contains(p) else { continue }
            let X = x(p, width: g.W, range: g.range)
            let w = CGFloat(a.text.count) * 6.6 + 12, h: CGFloat = 17
            var rect: CGRect
            var apexY: CGFloat? = nil
            if a.kind == "label" {
                let ay = g.yOf(g.apex(p, half: 0.03))
                let topY = max(g.top + h + 6, ay - 10)
                rect = CGRect(x: X - w / 2, y: topY - h, width: w, height: h)
                apexY = topY + 6
            } else {
                rect = CGRect(x: X, y: g.top + CGFloat(a.yFrac ?? 0.2) * (g.axisY - g.top), width: w, height: h)
            }
            rect.origin.x = min(g.W - margin - w, max(margin, rect.origin.x))
            out.append(AnnotationBox(index: i, rect: rect, anchorX: X, apexY: apexY, a: a))
        }
        return out
    }

    private func draw(ctx: GraphicsContext, size: CGSize, range: ClosedRange<Double>) {
        let g = Geo(size: size, range: range, view: self)
        let top = g.top, axisY = g.axisY, W = g.W
        let yOf = g.yOf

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
        for c in 0..<g.pairs {
            let p = g.colPpm(c)
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

        // Peak labels along the top; hand-picked peaks always get one.
        let visible = result.peaks.filter { range.contains($0.ppm) }.sorted { $0.ppm > $1.ppm }
        let maxLabels = Int((W - 2 * margin) / 11)
        let shown = visible.count > maxLabels
            ? Array(visible.sorted { a, b in a.manual != b.manual ? a.manual : a.height > b.height }.prefix(maxLabels)).sorted { $0.ppm > $1.ppm }
            : visible
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
            label.draw(Text(String(format: result.is13C ? "%.2f" : "%.3f", p.ppm)).font(.system(size: 9, design: .monospaced)).foregroundColor(p.manual ? .teal : .primary), at: .zero, anchor: .leading)
        }
        for p in visible where p.manual {
            let X = x(p.ppm, width: W, range: range), Y = max(top + 6, yOf(p.height) - 4)
            var tri = Path()
            tri.move(to: CGPoint(x: X, y: Y)); tri.addLine(to: CGPoint(x: X - 4, y: Y - 7)); tri.addLine(to: CGPoint(x: X + 4, y: Y - 7)); tri.closeSubpath()
            ctx.fill(tri, with: .color(.teal))
        }

        // Integral brackets
        if !result.is13C {
            for s in result.signals where (!s.minor || s.manual || s.reference) && !s.excluded {
                let x1 = x(s.ppmFrom, width: W, range: range), x2 = x(s.ppmTo, width: W, range: range)
                guard x2 > margin, x1 < W - margin else { continue }
                var br = Path()
                br.move(to: CGPoint(x: x1, y: axisY + 26)); br.addLine(to: CGPoint(x: x1, y: axisY + 30))
                br.addLine(to: CGPoint(x: x2, y: axisY + 30)); br.addLine(to: CGPoint(x: x2, y: axisY + 26))
                ctx.stroke(br, with: .color(s.manual ? .pink : .orange), lineWidth: s.reference ? 2 : 1.2)
                ctx.draw(Text(String(format: "%.2f", s.nH)).font(.system(size: 10, design: .monospaced).weight(.semibold)).foregroundColor(.orange), at: CGPoint(x: (x1 + x2) / 2, y: axisY + 42))
            }
        }

        // Signals chosen for the polymer calculation.
        for (k, m) in marks.enumerated() {
            let x1 = x(max(m.from, m.to), width: W, range: range), x2 = x(min(m.from, m.to), width: W, range: range)
            guard x2 > margin, x1 < W - margin else { continue }
            ctx.stroke(Path(CGRect(x: x1, y: top, width: x2 - x1, height: axisY - top)), with: .color(.purple), style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
            ctx.draw(Text(m.text).font(.caption2.weight(.semibold)).foregroundColor(.purple), at: CGPoint(x: (x1 + x2) / 2, y: top + 10 + CGFloat(k) * 13))
        }

        // Labels sit over their signal's apex; notes sit where they were placed.
        for b in annotationBoxes(g) {
            if let ay = b.apexY {
                var tick = Path()
                tick.move(to: CGPoint(x: b.anchorX, y: b.rect.maxY)); tick.addLine(to: CGPoint(x: b.anchorX, y: ay))
                ctx.stroke(tick, with: .color(.purple), lineWidth: 1)
            }
            let box = Path(roundedRect: b.rect, cornerRadius: 4)
            ctx.fill(box, with: .color(Color(nsColor: .textBackgroundColor)))
            ctx.stroke(box, with: .color(.purple), lineWidth: 1)
            ctx.draw(Text(b.a.text).font(.system(size: 11, weight: .semibold)).foregroundColor(.purple), at: CGPoint(x: b.rect.minX + 6, y: b.rect.midY), anchor: .leading)
        }
    }
}
