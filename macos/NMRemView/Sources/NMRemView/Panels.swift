import SwiftUI

struct SignalsView: View {
    @EnvironmentObject var store: Store
    let result: SpectrumResult
    @Binding var highlight: Signal?
    @State private var formula = ""

    var rows: [Signal] { result.signals.filter { !$0.minor } }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !result.is13C {
                HStack {
                    Text("Formula").foregroundStyle(.secondary)
                    TextField("e.g. C13H18O2", text: $formula).textFieldStyle(.roundedBorder).frame(width: 140)
                        .onSubmit { store.apply(["formula": formula]) }
                }
                .padding(.horizontal, 10)
            }
            Table(rows, selection: Binding(get: { highlight?.id }, set: { id in highlight = rows.first { $0.id == id } })) {
                TableColumn("δ ppm") { s in
                    Text(s.multiplicity == "m" && !result.is13C ? String(format: "%.2f–%.2f", s.ppmFrom, s.ppmTo) : String(format: result.is13C ? "%.1f" : "%.2f", s.ppm))
                        .font(.system(.body, design: .monospaced))
                }.width(min: 70, ideal: 90)
                TableColumn("Mult.") { s in Text(result.is13C ? "" : s.multiplicity).bold() }.width(44)
                TableColumn("J (Hz)") { s in Text(s.J.map { String(format: "%.1f", $0) }.joined(separator: ", ")) }.width(min: 40, ideal: 60)
                TableColumn("nH") { s in Text(result.is13C ? "" : String(format: "%.2f", s.nH)) }.width(40)
                TableColumn("Likely environment") { s in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.candidates.first ?? "–")
                        if let f = s.flag { Text(f).font(.caption).foregroundStyle(.orange) }
                    }
                }
            }
        }
        .onAppear { formula = result.params.formula }
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
