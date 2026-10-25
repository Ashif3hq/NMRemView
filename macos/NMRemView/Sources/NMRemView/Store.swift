import SwiftUI
import AppKit
import UniformTypeIdentifiers

@MainActor
final class Store: ObservableObject {
    @Published var datasets: [DatasetInfo] = []
    @Published var selection: DatasetInfo.ID?
    @Published var results: [String: SpectrumResult] = [:]
    @Published var warnings: [String] = []
    @Published var errorMessage: String?
    /// The active spectrum tool (MestReNova-style toolbar).
    @Published var tool: Tool = .zoom { didSet { if tool != oldValue { prompt = nil } } }
    /// Inline text box shown over the plot for labels, notes, integral values and reference shifts.
    @Published var prompt: PromptRequest?
    /// A signal chosen on the plot for the Polymer panel.
    @Published var polymerPick: PolymerPick?
    /// Regions outlined on the plot (polymer counting and end-group signals).
    @Published var plotMarks: [PlotMark] = []
    @Published private var undoStacks: [String: [[String: Any]]] = [:]
    @Published private var redoStacks: [String: [[String: Any]]] = [:]
    private var pickSerial = 0
    private(set) lazy var polymerLibrary: PolymerLibrary? = try? core?.polymerLibrary()

    private var core: CoreBridge?

    init() {
        do { core = try CoreBridge() } catch { errorMessage = error.localizedDescription }
    }

    var current: SpectrumResult? { selection.flatMap { results[$0] } }

    func presentOpenPanel() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = true
        panel.canChooseFiles = true
        panel.message = "Choose NMR data: Bruker or Varian folders, .zip, JEOL .jdf, MestReNova .mnova, JCAMP-DX, nmrML, NMRPipe or CSV"
        if panel.runModal() == .OK { open(urls: panel.urls) }
    }

    func open(urls: [URL]) {
        guard let core else { return }
        var files: [String: Data] = [:]
        for url in urls { collect(url: url, prefix: "", into: &files) }
        do {
            let r = try core.open(files: files)
            warnings = r.warnings
            datasets.append(contentsOf: r.datasets)
            if let first = r.datasets.first { select(first.id) }
        } catch { errorMessage = error.localizedDescription }
    }

    /// Reads a file or folder tree into relative-path → data. Zip archives are expanded with ditto.
    private func collect(url: URL, prefix: String, into files: inout [String: Data]) {
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir) else { return }
        let name = url.lastPathComponent
        if isDir.boolValue {
            let items = (try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)) ?? []
            for item in items where !item.lastPathComponent.hasPrefix(".") {
                collect(url: item, prefix: prefix + name + "/", into: &files)
            }
        } else if url.pathExtension.lowercased() == "zip" {
            let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
            p.arguments = ["-x", "-k", url.path, tmp.path]
            try? p.run()
            p.waitUntilExit()
            collect(url: tmp, prefix: prefix + url.deletingPathExtension().lastPathComponent + "/", into: &files)
            try? FileManager.default.removeItem(at: tmp)
        } else if let d = try? Data(contentsOf: url), d.count < 200_000_000 {
            files[prefix + name] = d
        }
    }

    func select(_ id: String) {
        selection = id
        prompt = nil
        if results[id] == nil { apply([:]) }
    }

    /// Sends parameter changes to the core and refreshes the current result.
    func apply(_ changes: [String: Any]) {
        guard let core, let id = selection else { return }
        do { results[id] = try core.run(id: id, changes: changes) }
        catch { errorMessage = error.localizedDescription }
    }

    // MARK: Undo

    /// Everything the tools edit, as parameters the core accepts.
    private func snapshot(_ r: SpectrumResult) -> [String: Any] {
        [
            "manualRegions": r.params.manualRegions,
            "integralRef": r.params.integralRef.map { ["ppm": $0.ppm, "value": $0.value] as Any } ?? NSNull(),
            "peakEdits": r.params.peakEdits.json,
            "annotations": r.params.annotations.map(\.json),
            "referenceShift": r.params.referenceShift,
        ]
    }

    /// Applies an edit and records the previous state for undo.
    func edit(_ changes: [String: Any]) {
        guard let r = current, let id = selection else { return }
        undoStacks[id, default: []].append(snapshot(r))
        if undoStacks[id]!.count > 100 { undoStacks[id]!.removeFirst() }
        redoStacks[id] = []
        apply(changes)
    }

    var canUndo: Bool { selection.map { !(undoStacks[$0] ?? []).isEmpty } ?? false }
    var canRedo: Bool { selection.map { !(redoStacks[$0] ?? []).isEmpty } ?? false }

    func undo() {
        guard let r = current, let id = selection, let snap = undoStacks[id]?.popLast() else { return }
        redoStacks[id, default: []].append(snapshot(r))
        apply(snap)
    }

    func redo() {
        guard let r = current, let id = selection, let snap = redoStacks[id]?.popLast() else { return }
        undoStacks[id, default: []].append(snapshot(r))
        apply(snap)
    }

    // MARK: Integrals

    func addIntegral(_ a: Double, _ b: Double) {
        guard let r = current else { return }
        edit(["manualRegions": r.params.manualRegions + [[max(a, b), min(a, b)]]])
    }

    func removeIntegral(_ s: Signal) {
        guard let r = current else { return }
        let kept = r.params.manualRegions.filter { reg in
            !(abs((reg.max() ?? 0) - s.ppmFrom) < 1e-6 && abs((reg.min() ?? 0) - s.ppmTo) < 1e-6)
        }
        edit(["manualRegions": kept])
    }

    func clearIntegrals() { edit(["manualRegions": [[Double]]()]) }

    /// Sets one integral to `value`; every other integral scales with it.
    func setIntegral(_ s: Signal, value: Double) {
        let ref: Any = value > 0 ? (["ppm": s.ppm, "value": value] as [String: Any]) as Any : NSNull()
        edit(["integralRef": ref])
    }

    func resetNormalisation() { edit(["integralRef": NSNull()]) }

    // MARK: Peaks, labels and notes

    private func peakTolerance(_ r: SpectrumResult) -> Double { r.is13C ? 0.05 : 0.004 }

    private func addPeak(_ r: SpectrumResult, at ppm: Double) {
        var pe = r.params.peakEdits
        let raw = ppm - r.params.referenceShift, tol = peakTolerance(r)
        if let k = pe.remove.firstIndex(where: { abs($0 - raw) < tol }) { pe.remove.remove(at: k) }
        else if !r.peaks.contains(where: { abs($0.ppm - ppm) < tol }) { pe.add.append(raw) }
        else { return }
        edit(["peakEdits": pe.json])
    }

    private func removePeaks(_ r: SpectrumResult, _ peaks: [Peak]) {
        guard !peaks.isEmpty else { return }
        var pe = r.params.peakEdits
        let tol = peakTolerance(r)
        for p in peaks {
            let raw = p.ppm - r.params.referenceShift
            if p.manual { if let k = pe.add.firstIndex(where: { abs($0 - raw) < tol * 2 }) { pe.add.remove(at: k) } }
            else { pe.remove.append(raw) }
        }
        edit(["peakEdits": pe.json])
    }

    /// Text of the labels that sit inside a signal.
    func labels(for s: Signal) -> String {
        guard let r = current else { return "" }
        let sh = r.params.referenceShift
        return r.params.annotations.filter { $0.kind == "label" && $0.ppm + sh <= s.ppmFrom + 1e-6 && $0.ppm + sh >= s.ppmTo - 1e-6 }.map(\.text).joined(separator: "; ")
    }

    private func signal(at ppm: Double, in r: SpectrumResult) -> Signal? {
        let sigs = r.signals.filter { !$0.excluded }
        if let s = sigs.first(where: { ppm <= $0.ppmFrom && ppm >= $0.ppmTo }) { return s }
        let tol = r.is13C ? 0.5 : 0.05
        return sigs.map { ($0, min(abs($0.ppmFrom - ppm), abs($0.ppmTo - ppm))) }.filter { $0.1 < tol }.min { $0.1 < $1.1 }?.0
    }

    // MARK: Tool actions from the plot

    /// A drag across the plot in a tool that selects a region.
    func handleRange(_ a: Double, _ b: Double) {
        guard let core, let r = current, let id = selection else { return }
        let hi = max(a, b), lo = min(a, b)
        switch tool {
        case .integrate:
            addIntegral(hi, lo)
        case .peakAdd:
            if let p = try? core.tallest(id: id, hi, lo) { addPeak(r, at: p) }
        case .peakDel:
            removePeaks(r, r.peaks.filter { $0.ppm <= hi && $0.ppm >= lo })
        case .pickRepeat, .pickEnd:
            guard !r.is13C else { return }
            addIntegral(hi, lo)
            guard let now = current else { return }
            let s = now.signals.first { $0.manual && abs($0.ppmFrom - hi) < 1e-6 && abs($0.ppmTo - lo) < 1e-6 } ?? signal(at: (hi + lo) / 2, in: now)
            finishPick(s)
        default:
            break
        }
    }

    /// A click on the plot. `hit` is the index of a label or note under the pointer.
    func handleClick(ppm: Double, point: CGPoint, yFrac: Double, hit: Int?, plotWidth: CGFloat, ppmPerPoint: Double) {
        guard let core, let r = current, let id = selection else { return }
        let place = PromptRequest.Place(point: point, plotWidth: plotWidth)
        if let hit, [.zoom, .pan, .label, .note].contains(tool), hit < r.params.annotations.count {
            let a = r.params.annotations[hit]
            prompt = PromptRequest(title: a.kind == "label" ? "Label" : "Note", initial: a.text, numeric: false, place: place,
                onOK: { [weak self] text in
                    guard let self, let r = self.current, hit < r.params.annotations.count else { return }
                    let t = text.trimmingCharacters(in: .whitespaces)
                    guard !t.isEmpty, t != a.text else { return }
                    var list = r.params.annotations; list[hit].text = t
                    self.edit(["annotations": list.map(\.json)])
                },
                onDelete: { [weak self] in
                    guard let self, let r = self.current, hit < r.params.annotations.count else { return }
                    var list = r.params.annotations; list.remove(at: hit)
                    self.edit(["annotations": list.map(\.json)])
                })
            return
        }
        let sh = r.params.referenceShift
        switch tool {
        case .peakAdd:
            if let p = try? core.snap(id: id, ppm: ppm) { addPeak(r, at: p) }
        case .peakDel:
            let tol = 8 * ppmPerPoint
            if let p = r.peaks.filter({ abs($0.ppm - ppm) < tol }).min(by: { abs($0.ppm - ppm) < abs($1.ppm - ppm) }) { removePeaks(r, [p]) }
        case .setIntegral:
            guard !r.is13C, let s = signal(at: ppm, in: r) else { return }
            prompt = PromptRequest(title: String(format: "∫ δ %.2f =", s.ppm), initial: String(format: "%.2f", s.nH), numeric: true, place: place,
                onOK: { [weak self] v in if let x = Double(v), x > 0 { self?.setIntegral(s, value: x) } }, onDelete: nil)
        case .reference:
            let near = r.peaks.min { abs($0.ppm - ppm) < abs($1.ppm - ppm) }?.ppm ?? ppm
            let guess = (try? core.suggestReference(id: id, ppm: near)) ?? near
            prompt = PromptRequest(title: String(format: "Peak at %.3f is", near), initial: String(format: "%.3f", guess), numeric: true, place: place,
                onOK: { [weak self] v in
                    guard let self, let x = Double(v), let r = self.current else { return }
                    self.edit(["referenceShift": r.params.referenceShift + x - near])
                }, onDelete: nil)
        case .label:
            let at = signal(at: ppm, in: r)?.ppm ?? ((try? core.snap(id: id, ppm: ppm)) ?? ppm)
            prompt = PromptRequest(title: String(format: "Label δ %.2f", at), initial: "", numeric: false, place: place,
                onOK: { [weak self] text in self?.addAnnotation(Annotation(ppm: at - sh, text: text, kind: "label", yFrac: nil)) }, onDelete: nil)
        case .note:
            prompt = PromptRequest(title: "Note", initial: "", numeric: false, place: place,
                onOK: { [weak self] text in self?.addAnnotation(Annotation(ppm: ppm - sh, text: text, kind: "note", yFrac: min(0.95, max(0, yFrac)))) }, onDelete: nil)
        case .pickRepeat, .pickEnd:
            finishPick(signal(at: ppm, in: r))
        default:
            break
        }
    }

    private func addAnnotation(_ a: Annotation) {
        guard let r = current else { return }
        var a = a
        a.text = a.text.trimmingCharacters(in: .whitespaces)
        guard !a.text.isEmpty else { return }
        edit(["annotations": (r.params.annotations + [a]).map(\.json)])
    }

    private func finishPick(_ s: Signal?) {
        guard let s else { tool = .zoom; return }
        pickSerial += 1
        polymerPick = PolymerPick(repeatUnit: tool == .pickRepeat, ppm: s.ppm, serial: pickSerial)
        tool = .zoom
    }

    // MARK: Export

    func exportText(_ kind: String) -> String {
        guard let core, let id = selection else { return "" }
        return (try? core.exportText(id: id, kind: kind)) ?? ""
    }

    func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    func save(_ data: Data, name: String, type: UTType) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.allowedContentTypes = [type]
        if panel.runModal() == .OK, let url = panel.url {
            do { try data.write(to: url) } catch { errorMessage = error.localizedDescription }
        }
    }

    var fileBase: String {
        let t = current?.title ?? "spectrum"
        return String(t.map { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "." ? $0 : "_" }.prefix(60))
    }

    func polymer(_ config: [String: Any]) -> PolymerResult? {
        guard let core, let id = selection else { return nil }
        return try? core.polymer(id: id, config: config)
    }

    func search(_ q: String) -> SearchResult? {
        guard let core, !q.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return try? core.search(q)
    }
}
