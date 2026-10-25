import SwiftUI
import AppKit
import UniformTypeIdentifiers

/// Spectrum tools, as in the MestReNova toolbar.
enum Tool: String, CaseIterable, Identifiable {
    case zoom, pan, peakAdd, peakDel, integrate, setIntegral, reference, label, note, pickRepeat, pickEnd
    var id: String { rawValue }

    static let toolbar: [Tool] = [.zoom, .pan, .peakAdd, .peakDel, .integrate, .setIntegral, .reference, .label, .note]

    var title: String {
        switch self {
        case .zoom: return "Zoom"
        case .pan: return "Pan"
        case .peakAdd: return "Peak +"
        case .peakDel: return "Peak −"
        case .integrate: return "Integrate"
        case .setIntegral: return "∫ = n"
        case .reference: return "δ ref"
        case .label: return "Label"
        case .note: return "Note"
        case .pickRepeat: return "Pick repeat unit"
        case .pickEnd: return "Pick end group"
        }
    }

    var symbol: String {
        switch self {
        case .zoom: return "plus.magnifyingglass"
        case .pan: return "hand.draw"
        case .peakAdd: return "mappin.and.ellipse"
        case .peakDel: return "mappin.slash"
        case .integrate: return "function"
        case .setIntegral: return "equal.square"
        case .reference: return "scope"
        case .label: return "tag"
        case .note: return "text.bubble"
        case .pickRepeat, .pickEnd: return "hand.point.up.left"
        }
    }

    var hint: String {
        switch self {
        case .zoom: return "Scroll to zoom · drag to zoom to a region · shift-drag to pan · double-click to fit · right-click for more"
        case .pan: return "Drag left or right to move along the spectrum · scroll to zoom · shift-scroll for intensity"
        case .peakAdd: return "Click a peak to mark it (snaps to the top) · drag over a region to mark its tallest point"
        case .peakDel: return "Click near a peak to remove it · drag over a region to remove every peak in it"
        case .integrate: return "Drag across a signal to add an integral region"
        case .setIntegral: return "Click a signal and type how many protons it is; every other integral scales with it"
        case .reference: return "Click TMS or the solvent residual and type its true shift"
        case .label: return "Click a signal to label it (e.g. CH₂–S end group) · click a label to edit or delete it"
        case .note: return "Click anywhere on the plot to add a note · click a note to edit or delete it"
        case .pickRepeat: return "Polymer: click the repeat-unit signal, or drag across it to integrate it"
        case .pickEnd: return "Polymer: click the end-group signal, or drag across it to integrate it"
        }
    }

    /// Tools where dragging selects a region instead of zooming.
    var dragSelects: Bool { [.integrate, .peakAdd, .peakDel, .pickRepeat, .pickEnd].contains(self) }
    /// Tools that only make sense on ¹H integrals.
    var protonOnly: Bool { [.integrate, .setIntegral, .pickRepeat, .pickEnd].contains(self) }
}

struct PromptRequest: Identifiable {
    struct Place { let point: CGPoint; let plotWidth: CGFloat }
    let id = UUID()
    let title: String
    let initial: String
    let numeric: Bool
    let place: Place
    let onOK: (String) -> Void
    let onDelete: (() -> Void)?
}

struct PolymerPick: Equatable {
    let repeatUnit: Bool
    let ppm: Double
    let serial: Int
}

struct PlotMark: Hashable {
    let from: Double
    let to: Double
    let text: String
}

/// Small text box over the plot (the macOS counterpart of the web popover).
struct PromptBox: View {
    @EnvironmentObject var store: Store
    let request: PromptRequest
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 6) {
            Text(request.title).font(.caption).foregroundStyle(.secondary)
            TextField("", text: $text)
                .textFieldStyle(.roundedBorder)
                .frame(width: request.numeric ? 80 : 180)
                .focused($focused)
                .onSubmit(ok)
            Button("OK", action: ok).keyboardShortcut(.defaultAction)
            if let del = request.onDelete {
                Button("Delete") { store.prompt = nil; del() }
            }
            Button { store.prompt = nil } label: { Image(systemName: "xmark") }
                .buttonStyle(.borderless)
                .keyboardShortcut(.cancelAction)
        }
        .controlSize(.small)
        .padding(6)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 7))
        .overlay(RoundedRectangle(cornerRadius: 7).stroke(Color.purple.opacity(0.6)))
        .shadow(radius: 4, y: 2)
        .onAppear { text = request.initial; focused = true }
    }

    private func ok() {
        let v = text
        store.prompt = nil
        request.onOK(v)
    }
}

/// Tool buttons, undo/redo, view controls and export.
struct ToolBarRow: View {
    @EnvironmentObject var store: Store
    let result: SpectrumResult
    @Binding var range: ClosedRange<Double>?
    var exportPlot: () -> Void
    var exportPDF: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Tool.toolbar) { t in
                Toggle(isOn: Binding(get: { store.tool == t }, set: { _ in store.tool = t })) {
                    Label(t.title, systemImage: t.symbol)
                }
                .toggleStyle(.button)
                .disabled(t.protonOnly && result.is13C)
                .help(t.hint)
                if t == .pan || t == .reference { Divider().frame(height: 18) }
            }
            Divider().frame(height: 18)
            Button { zoomOut() } label: { Image(systemName: "minus.magnifyingglass") }.help("Zoom out")
            Button("Fit") { range = nil }.help("Show the whole spectrum")
            Divider().frame(height: 18)
            Button { store.undo() } label: { Image(systemName: "arrow.uturn.backward") }.disabled(!store.canUndo).help("Undo (⌘Z)")
            Button { store.redo() } label: { Image(systemName: "arrow.uturn.forward") }.disabled(!store.canRedo).help("Redo (⇧⌘Z)")
            Menu {
                Section("Image") {
                    Button("Plot as PNG (high resolution)…", action: exportPlot)
                    Button("Plot as PDF (vector)…", action: exportPDF)
                    ForEach(store.exportFormats.filter { $0.group == "Image" }) { f in Button(f.label + "…") { store.saveExport(f, range: range) } }
                }
                ForEach(["Spectrum", "Tables"], id: \.self) { g in
                    Section(g) {
                        ForEach(store.exportFormats.filter { $0.group == g }) { f in Button(f.label + "…") { store.saveExport(f, range: range) } }
                    }
                }
                Section("Copy to clipboard") {
                    Button("Copy peak list (pastes into Excel)") { store.copy(store.exportText("peaks-tsv")) }
                    Button("Copy integrals (pastes into Excel)") { store.copy(store.exportText("ints-tsv")) }
                    Button("Copy report") { store.copy(store.exportText("report")) }
                }
            } label: { Label("Export", systemImage: "square.and.arrow.up") }
                .fixedSize()
                .help("JCAMP-DX, CSV/TSV and nmrML open in MestReNova, TopSpin, ACD/Labs, Origin and Excel; SVG and PDF in Illustrator, Word and PowerPoint")
            Spacer(minLength: 0)
        }
        .labelStyle(.titleAndIcon)
        .controlSize(.small)
        .padding(.horizontal, 8).padding(.vertical, 6)
    }

    private func save(_ kind: String, _ suffix: String, _ type: UTType) {
        store.save(Data(store.exportText(kind).utf8), name: store.fileBase + suffix, type: type)
    }

    private func zoomOut() {
        guard let r = range else { return }
        let lo = min(result.ppmStart, result.ppmEnd), hi = max(result.ppmStart, result.ppmEnd)
        let c = (r.lowerBound + r.upperBound) / 2, w = r.upperBound - r.lowerBound
        let a = max(lo, c - w), b = min(hi, c + w)
        range = (a <= lo && b >= hi) ? nil : a...b
    }
}
