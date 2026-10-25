import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject var store: Store
    @State private var tab: Tab = .signals
    @State private var bands: [ShiftGroup] = []
    @State private var overlay: CompoundMatch?
    @State private var highlight: Signal?
    @State private var dropTargeted = false
    @State private var plotRange: ClosedRange<Double>?

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
                        ToolBarRow(result: r, range: $plotRange, exportPlot: { exportPNG(r) })
                        Divider()
                        ProcessingBar(result: r)
                        Divider()
                        plot(r)
                            .frame(minWidth: 560, minHeight: 380)
                            .overlay(alignment: .topLeading) {
                                if let p = store.prompt {
                                    PromptBox(request: p)
                                        .id(p.id)
                                        .offset(x: max(8, min(p.place.point.x - 20, p.place.plotWidth - 400)), y: p.place.point.y + 12)
                                }
                            }
                            .overlay(alignment: .bottomLeading) {
                                Text(store.tool.hint).font(.caption).foregroundStyle(.secondary).padding(.horizontal, 12).padding(.bottom, 2)
                                    .allowsHitTesting(false)
                            }
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
        .onChange(of: tab) { if tab != .polymer { store.plotMarks = [] } }
        .onChange(of: store.polymerPick) { if store.polymerPick != nil { tab = .polymer } }
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

extension ContentView {
    private func plot(_ r: SpectrumResult, range: Binding<ClosedRange<Double>?>? = nil) -> SpectrumView {
        SpectrumView(result: r, bands: bands.filter { ($0.nucleus == "13C") == r.is13C }, overlay: overlay, highlight: highlight,
                     tool: store.tool, marks: tab == .polymer ? store.plotMarks : [], view: range ?? $plotRange,
                     onRange: { a, b in store.handleRange(a, b) },
                     onClick: { ppm, pt, yFrac, w, perPt, hit in store.handleClick(ppm: ppm, point: pt, yFrac: yFrac, hit: hit, plotWidth: w, ppmPerPoint: perPt) })
    }

    /// Renders the current view of the plot at print size and saves it as PNG.
    @MainActor private func exportPNG(_ r: SpectrumResult) {
        let content = plot(r, range: .constant(plotRange))
            .frame(width: 1600, height: 800)
            .background(Color.white)
            .environment(\.colorScheme, .light)
        let renderer = ImageRenderer(content: content)
        renderer.scale = 2
        guard let img = renderer.nsImage, let tiff = img.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else {
            store.errorMessage = "Could not render the plot"; return
        }
        store.save(png, name: store.fileBase + ".png", type: .png)
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
