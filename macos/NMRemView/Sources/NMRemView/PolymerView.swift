import SwiftUI
import AppKit

/// Polymer tools: DP and Mn by end-group analysis, diene microstructure and copolymer
/// composition. All maths runs in the shared JavaScript core (core/polymer.js).
struct PolymerView: View {
    @EnvironmentObject var store: Store
    let result: SpectrumResult

    @State private var polymerId = "pi"
    @State private var repeatSig: Double? = nil   // nil: the polymer's standard window
    @State private var repeatH = 1.0
    @State private var m0 = 68.12
    @State private var endId = "custom"
    @State private var endSig: Double? = nil
    @State private var endH = 1.0
    @State private var endCount = 1
    @State private var endMass = 0.0
    @State private var comps: [Comp] = []

    struct Comp: Identifiable {
        let id = UUID()
        var name: String
        var sig: Double?
        var nH: Double
        var m0: Double
    }

    private var library: PolymerLibrary? { store.polymerLibrary }
    private var preset: PolymerPreset? { library?.polymers.first { $0.id == polymerId } }
    private var signals: [Signal] { result.signals.filter { !$0.excluded }.sorted { $0.ppm > $1.ppm } }

    private func label(_ s: Signal) -> String {
        String(format: "δ %.2f (%.2f–%.2f) · ∫ %.2f", s.ppm, s.ppmFrom, s.ppmTo, s.nH) + (s.manual ? " · manual" : "")
    }

    private var config: [String: Any] {
        [
            "polymer": polymerId,
            "repeatSig": repeatSig.map { $0 as Any } ?? "window",
            "repeatH": repeatH, "m0": m0,
            "endSig": endSig.map { $0 as Any } ?? NSNull(),
            "endH": endH, "endCount": endCount, "endMass": endMass,
            "comps": comps.map { ["name": $0.name, "sig": $0.sig.map { $0 as Any } ?? NSNull(), "nH": $0.nH, "m0": $0.m0] as [String: Any] },
        ]
    }

    var body: some View {
        if result.is13C {
            ContentUnavailableView("¹H spectrum needed", systemImage: "function", description: Text("Polymer tools use ¹H integrals."))
        } else {
            let res = store.polymer(config)
            Form {
                Section("Repeat unit") {
                    Picker("Polymer", selection: $polymerId) {
                        ForEach(library?.polymers ?? []) { p in Text("\(p.name) (\(p.unit))").tag(p.id) }
                        Text("Custom repeat unit").tag("custom")
                    }
                    Picker("Counting signal", selection: $repeatSig) {
                        if let p = preset { Text("Standard window: \(p.signalLabel), δ \(p.from, specifier: "%g")–\(p.to, specifier: "%g")").tag(Double?.none) }
                        else { Text("Choose a signal").tag(Double?.none) }
                        ForEach(signals) { s in Text(label(s)).tag(Optional(s.ppm)) }
                    }
                    number("H per repeat unit", $repeatH)
                    number("M₀ (g/mol)", $m0)
                    if let ri = res?.repeatIntegral { LabeledContent("Integral of counting signal", value: String(format: "%.2f", ri)) }
                }
                Section {
                    Picker("Type", selection: $endId) {
                        ForEach(library?.endGroups ?? []) { g in Text(g.ppm.isEmpty ? g.name : "\(g.name) · \(g.ppm)").tag(g.id) }
                    }
                    Picker("Its signal", selection: $endSig) {
                        Text("Choose a signal").tag(Double?.none)
                        ForEach(signals) { s in Text(label(s)).tag(Optional(s.ppm)) }
                    }
                    number("H in that signal", $endH)
                    Stepper("End groups per chain: \(endCount)", value: $endCount, in: 1...4)
                    number("End-group mass, both ends (g/mol)", $endMass)
                } header: { Text("End group") } footer: {
                    Text("End-group signals are usually small. Turn on Integrate in the toolbar and drag across yours if it is not listed.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("Degree of polymerisation") {
                    if let dp = res?.dp {
                        LabeledContent("DPₙ") { Text(String(format: "%.1f", dp)).font(.title2.monospacedDigit().bold()) }
                        if let mn = res?.mn {
                            LabeledContent("Mₙ (NMR)") { Text("\(Int(mn.rounded()).formatted()) g/mol").font(.title2.monospacedDigit().bold()) }
                            Text(String(format: "Mₙ = %.1f × %.2f + %.2f", dp, m0, endMass)).font(.caption.monospaced()).foregroundStyle(.secondary)
                        }
                        Button("Copy result") {
                            var t = String(format: "DP(¹H NMR) = %.1f", dp)
                            if let mn = res?.mn { t += ", Mn(NMR) = \(Int(mn.rounded()).formatted()) g/mol" }
                            t += " (\(preset?.name ?? "repeat unit"), M0 = \(String(format: "%.2f", m0)) g/mol)"
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(t, forType: .string)
                        }
                    } else {
                        Text("Choose a counting signal and an end-group signal.").foregroundStyle(.secondary)
                    }
                }
                if let micro = res?.microstructure {
                    Section("Microstructure") {
                        ForEach(micro.rows, id: \.self) { r in
                            VStack(alignment: .leading, spacing: 2) {
                                HStack { Text(r.label); Text(r.how).font(.caption).foregroundStyle(.secondary); Spacer(); Text(String(format: "%.1f %%", r.pct)).monospacedDigit() }
                                ProgressView(value: min(100, max(0, r.pct)), total: 100)
                            }
                        }
                        if let c = micro.cis, let t = micro.trans { LabeledContent("1,4 cis : trans", value: String(format: "%.0f : %.0f", c, t)) }
                        Text(micro.note).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section("Copolymer composition") {
                    ForEach($comps) { $c in
                        HStack {
                            TextField("Name", text: $c.name).frame(width: 90)
                            Picker("", selection: $c.sig) {
                                Text("Signal…").tag(Double?.none)
                                ForEach(signals) { s in Text(String(format: "δ %.2f", s.ppm)).tag(Optional(s.ppm)) }
                            }.labelsHidden()
                            TextField("H", value: $c.nH, format: .number).frame(width: 40)
                            TextField("M₀", value: $c.m0, format: .number).frame(width: 60)
                            Button { comps.removeAll { $0.id == c.id } } label: { Image(systemName: "minus.circle") }.buttonStyle(.borderless)
                        }
                    }
                    Menu("Add monomer") {
                        ForEach(library?.polymers ?? []) { p in
                            Button(p.name) {
                                let s = signals.first { $0.ppm <= p.from && $0.ppm >= p.to }
                                comps.append(Comp(name: p.name, sig: s?.ppm, nH: p.nH, m0: p.m0))
                            }
                        }
                        Button("Custom") { comps.append(Comp(name: "Monomer", sig: nil, nH: 1, m0: 100)) }
                    }
                    if let comp = res?.composition, comp.count >= 2 {
                        ForEach(comp, id: \.self) { c in
                            LabeledContent(c.name, value: String(format: "%.1f mol %%", c.molPct) + (c.wtPct.map { String(format: " · %.1f wt %%", $0) } ?? ""))
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .onAppear(perform: guessPolymer)
            .onChange(of: polymerId) {
                if let p = preset { repeatH = p.nH; m0 = (p.m0 * 100).rounded() / 100; repeatSig = nil }
            }
            .onChange(of: endId) {
                if let g = library?.endGroups.first(where: { $0.id == endId }), g.id != "custom" { endH = g.nH; endMass = (g.mass * 100).rounded() / 100 }
            }
        }
    }

    private func number(_ title: String, _ value: Binding<Double>) -> some View {
        LabeledContent(title) { TextField("", value: value, format: .number).multilineTextAlignment(.trailing).frame(width: 90) }
    }

    private func guessPolymer() {
        guard let lib = library else { return }
        // Take the best-ranked library match that is one of the polymer presets.
        for name in result.compounds.prefix(3).map({ $0.name.lowercased() }) {
            for p in lib.polymers {
                let key = p.name.lowercased().replacingOccurrences(of: "poly(", with: "").replacingOccurrences(of: "poly", with: "").replacingOccurrences(of: ")", with: "")
                if name.contains(key) { polymerId = p.id; repeatH = p.nH; m0 = (p.m0 * 100).rounded() / 100; return }
            }
        }
        if let p = lib.polymers.first(where: { $0.id == polymerId }) { repeatH = p.nH; m0 = (p.m0 * 100).rounded() / 100 }
    }
}
