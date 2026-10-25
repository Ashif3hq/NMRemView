import SwiftUI

struct SignalsView: View {
    @EnvironmentObject var store: Store
    let result: SpectrumResult
    @Binding var highlight: Signal?
    @State private var formula = ""
    @State private var showSmall = false

    var rows: [Signal] { result.signals.filter { showSmall || !$0.minor || $0.manual || $0.reference } }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !result.is13C {
                HStack {
                    Text("Formula").foregroundStyle(.secondary)
                    TextField("e.g. C13H18O2", text: $formula).textFieldStyle(.roundedBorder).frame(width: 140)
                        .onSubmit { store.apply(["formula": formula]) }
                    Spacer()
                    Toggle("Small signals", isOn: $showSmall).toggleStyle(.checkbox)
                }
                .padding(.horizontal, 10)
                HStack {
                    if result.params.hasIntegralRef { Button("Reset normalisation") { store.resetNormalisation() } }
                    if !result.params.manualRegions.isEmpty { Button("Clear manual integrals") { store.clearIntegrals() } }
                    Spacer()
                }
                .controlSize(.small)
                .padding(.horizontal, 10)
            }
            Table(rows, selection: Binding(get: { highlight?.id }, set: { id in highlight = rows.first { $0.id == id } })) {
                TableColumn("δ ppm") { s in
                    Text(s.multiplicity == "m" && !result.is13C ? String(format: "%.2f–%.2f", s.ppmFrom, s.ppmTo) : String(format: result.is13C ? "%.1f" : "%.2f", s.ppm))
                        .font(.system(.body, design: .monospaced))
                }.width(min: 70, ideal: 90)
                TableColumn("Mult.") { s in Text(result.is13C ? "" : s.multiplicity).bold() }.width(44)
                TableColumn("J (Hz)") { s in Text(s.J.map { String(format: "%.1f", $0) }.joined(separator: ", ")) }.width(min: 40, ideal: 60)
                TableColumn("nH") { s in
                    if result.is13C { Text("") } else { IntegralField(signal: s) }
                }.width(58)
                TableColumn("Likely environment") { s in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.manual ? "Manual integral" : (s.candidates.first ?? "–"))
                            let lab = store.labels(for: s)
                            if !lab.isEmpty { Text(lab).font(.caption.weight(.semibold)).foregroundStyle(.purple) }
                            if let f = s.flag { Text(f).font(.caption).foregroundStyle(.orange) }
                        }
                        Spacer()
                        if s.manual {
                            Button { store.removeIntegral(s) } label: { Image(systemName: "trash") }
                                .buttonStyle(.borderless).help("Delete this integral")
                        }
                    }
                }
            }
            if !result.is13C {
                Text("Type a value in nH to set that integral; the others scale with it. Choose Integrate in the toolbar and drag across a signal to add a region, or ∫ = n and click a signal to set the reference integral.")
                    .font(.caption).foregroundStyle(.secondary).padding(.horizontal, 10).padding(.bottom, 8)
            }
        }
        .onAppear { formula = result.params.formula }
    }
}

/// Editable integral value. Committing a number normalises all integrals to it.
struct IntegralField: View {
    @EnvironmentObject var store: Store
    let signal: Signal
    @State private var text = ""

    var body: some View {
        TextField("", text: $text)
            .font(.system(.body, design: .monospaced))
            .textFieldStyle(.plain)
            .foregroundStyle(signal.reference ? Color.accentColor : Color.primary)
            .onSubmit { if let v = Double(text.replacingOccurrences(of: ",", with: ".")) { store.setIntegral(signal, value: v) } }
            .onAppear { text = String(format: "%.2f", signal.nH) }
            .onChange(of: signal.nH) { text = String(format: "%.2f", signal.nH) }
    }
}

struct SuggestionsView: View {
    let result: SpectrumResult
    @Binding var overlay: CompoundMatch?

    var body: some View {
        List {
            Section("Structural fragments") {
                if result.hints.isEmpty { Text("No characteristic patterns found.").foregroundStyle(.secondary) }
                ForEach(result.hints, id: \.self) { h in
                    VStack(alignment: .leading) {
                        Text(h.text).bold()
                        Text(h.detail).font(.system(.caption, design: .monospaced)).foregroundStyle(.secondary)
                    }
                }
            }
            Section("Closest reference compounds") {
                ForEach(result.compounds) { c in
                    Button {
                        overlay = overlay?.name == c.name ? nil : c
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Text(c.name).bold(); Text(c.formula).font(.caption).foregroundStyle(.secondary); Spacer(); Text("\(Int(c.score * 100))%") }
                            ProgressView(value: c.score)
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(4)
                    .background(overlay?.name == c.name ? Color.pink.opacity(0.1) : .clear, in: RoundedRectangle(cornerRadius: 6))
                }
            }
        }
    }
}

struct LookupView: View {
    @EnvironmentObject var store: Store
    let result: SpectrumResult
    @Binding var bands: [ShiftGroup]
    @State private var query = ""

    var body: some View {
        let res = store.search(query)
        VStack(alignment: .leading, spacing: 8) {
            TextField("Element (Cl, oxygen), group (ester) or shift (3.7)", text: $query)
                .textFieldStyle(.roundedBorder).padding(.horizontal, 10)
            List {
                if let e = res?.element {
                    Section("\(e.symbol) · \(e.name)") {
                        ForEach(e.isotopes, id: \.self) { i in
                            Text("\(i.iso)  spin \(i.spin)  \(String(format: "%.3g", i.abundance))% natural abundance").font(.system(.caption, design: .monospaced))
                        }
                        Text(e.note).font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let groups = res?.groups, !groups.isEmpty {
                    Section("Shift ranges") {
                        ForEach(groups) { g in
                            let hits = result.signals.filter { !$0.minor && g.nucleus == (result.is13C ? "13C" : "1H") && $0.ppm >= g.min && $0.ppm <= g.max }
                            Button {
                                if let i = bands.firstIndex(of: g) { bands.remove(at: i) } else { bands.append(g) }
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack {
                                        Text(g.nucleus == "13C" ? "¹³C" : "¹H").font(.caption.monospaced()).foregroundStyle(.secondary)
                                        Text(g.name)
                                        Spacer()
                                        Text("\(g.min, specifier: "%g")–\(g.max, specifier: "%g") ppm").font(.caption.monospaced())
                                    }
                                    if !g.note.isEmpty { Text(g.note).font(.caption).foregroundStyle(.secondary) }
                                    if !hits.isEmpty {
                                        Text("In your spectrum: " + hits.map { String(format: "%.2f", $0.ppm) }.joined(separator: ", "))
                                            .font(.caption.monospaced()).foregroundStyle(.green)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .listRowBackground(bands.contains(g) ? Color.teal.opacity(0.12) : Color.clear)
                        }
                    }
                }
            }
        }
    }
}
