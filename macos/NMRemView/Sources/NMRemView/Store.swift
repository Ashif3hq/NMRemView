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
        if results[id] == nil { apply([:]) }
    }

    /// Sends parameter changes to the core and refreshes the current result.
    func apply(_ changes: [String: Any]) {
        guard let core, let id = selection else { return }
        do { results[id] = try core.run(id: id, changes: changes) }
        catch { errorMessage = error.localizedDescription }
    }

    func search(_ q: String) -> SearchResult? {
        guard let core, !q.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return try? core.search(q)
    }
}
