import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject var store: Store
    @State private var tab: Tab = .signals
    @State private var bands: [ShiftGroup] = []
    @State private var overlay: CompoundMatch?
    @State private var highlight: Signal?
    @State private var dropTargeted = false

    enum Tab: String, CaseIterable { case signals = "Signals", suggestions = "Suggestions", polymer = "Polymer", lookup = "Lookup" }

    var body: some View {
        NavigationSplitView {
            List(selection: Binding(get: { store.selection }, set: { if let id = $0 { store.select(id) } })) {
                Section("Spectra") {
                    ForEach(store.datasets) { ds in
                        HStack(spacing: 8) {
                            Text(ds.nucleus)
                                .font(.system(.caption, design: .monospaced).weight(.semibold))
                                .padding(.horizontal, 5).padding(.vertical, 1)
                                .background(ds.nucleus.contains("13C") ? Color.orange : Color.indigo, in: RoundedRectangle(cornerRadius: 4))
                                .foregroundStyle(.white)
                            VStack(alignment: .leading) {
                                Text(ds.title).lineLimit(1)
                                Text("\(Int(ds.frequency)) MHz · \(ds.solvent) · \(ds.source)")
                                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                        .tag(ds.id)
                    }
                }
                if !store.warnings.isEmpty {
                    Section("Notes") { ForEach(store.warnings, id: \.self) { Text($0).font(.caption).foregroundStyle(.orange) } }
                }
            }
            .navigationSplitViewColumnWidth(min: 200, ideal: 230)
            .toolbar { Button { store.presentOpenPanel() } label: { Label("Open", systemImage: "folder") } }
        } detail: {
            if let r = store.current {
                HSplitView {
                    VStack(spacing: 0) {
                        ProcessingBar(result: r)
                        Divider()
                        SpectrumView(result: r, bands: bands.filter { ($0.nucleus == "13C") == r.is13C }, overlay: overlay, highlight: highlight,
                                     integrateMode: store.integrateMode && !r.is13C,
                                     onIntegrate: { a, b in store.addIntegral(a, b) })
                            .frame(minWidth: 560, minHeight: 380)
                        Divider()
                        HStack(alignment: .top) {
                            Text(r.report).font(.system(.callout, design: .monospaced)).textSelection(.enabled)
                            Spacer()
                            Button("Copy") {
                                NSPasteboard.general.clearContents()
                                NSPasteboard.general.setString(r.report, forType: .string)
                            }
                        }
                        .padding(10)
                    }
                    VStack(spacing: 0) {
                        Picker("", selection: $tab) { ForEach(Tab.allCases, id: \.self) { Text($0.rawValue) } }
                            .pickerStyle(.segmented).padding(8)
                        switch tab {
                        case .signals: SignalsView(result: r, highlight: $highlight)
                        case .suggestions: SuggestionsView(result: r, overlay: $overlay)
                        case .polymer: PolymerView(result: r).id(r.id)
                        case .lookup: LookupView(result: r, bands: $bands)
                        }
                    }
                    .frame(minWidth: 340, idealWidth: 380)
                }
            } else {
                ContentUnavailableView("Open NMR data", systemImage: "waveform.path.ecg",
                    description: Text("Drop Bruker or Varian folders, JCAMP-DX, CSV or .zip files here, or press ⌘O."))
            }
        }
        .onDrop(of: [.fileURL], isTargeted: $dropTargeted) { providers in
            Task {
                var urls: [URL] = []
                for p in providers {
                    if let item = try? await p.loadItem(forTypeIdentifier: UTType.fileURL.identifier),
                       let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil) { urls.append(url) }
                }
                await MainActor.run { store.open(urls: urls) }
            }
            return true
        }
        .alert("Something went wrong", isPresented: Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })) {
            Button("OK") { store.errorMessage = nil }
        } message: { Text(store.errorMessage ?? "") }
    }
}

struct ProcessingBar: View {
    @EnvironmentObject var store: Store
    let result: SpectrumResult
    @State private var ph0: Double = 0
    @State private var ph1: Double = 0

    var body: some View {
        HStack(spacing: 14) {
            if result.params.fromFid {
                HStack { Text("PH0").font(.caption); Slider(value: $ph0, in: -180...180, onEditingChanged: { editing in if !editing { store.apply(["ph0": ph0]) } }).frame(width: 120) }
                HStack { Text("PH1").font(.caption); Slider(value: $ph1, in: -360...360, onEditingChanged: { editing in if !editing { store.apply(["ph1": ph1]) } }).frame(width: 120) }
                Button("Auto phase") { store.apply(["autoPhase": true]) }
            }
            if !result.is13C {
                Toggle("Integrate", isOn: $store.integrateMode)
                    .toggleStyle(.button)
                    .help("Drag across a signal to add an integral region")
            }
            Toggle("Baseline", isOn: Binding(get: { result.params.baseline }, set: { store.apply(["baseline": $0]) }))
            Stepper("Peak S/N \(Int(result.params.snr))", value: Binding(get: { result.params.snr }, set: { store.apply(["snr": $0]) }), in: 3...60, step: 1)
            Spacer()
            Text("\(result.title) · \(result.nucleus) · \(Int(result.frequency)) MHz").foregroundStyle(.secondary).font(.caption)
        }
        .padding(8)
        .onAppear { ph0 = result.params.ph0; ph1 = result.params.ph1 }
        .onChange(of: result.id) { ph0 = result.params.ph0; ph1 = result.params.ph1 }
    }
}
