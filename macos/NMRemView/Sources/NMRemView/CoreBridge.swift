import Foundation
import JavaScriptCore

// Swift side of the shared processing core. The same JavaScript that runs the web trial is
// bundled as Resources/nmrcore.js (scripts/build-core-bundle.mjs) and driven through JSON.

struct DatasetInfo: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let nucleus: String
    let frequency: Double
    let solvent: String
    let source: String
}

struct OpenResult: Codable {
    let datasets: [DatasetInfo]
    let warnings: [String]
}

struct Peak: Codable, Hashable {
    let ppm: Double
    let height: Double
}

struct Signal: Codable, Identifiable, Hashable {
    var id: Double { ppm }
    let ppm: Double
    let ppmFrom: Double
    let ppmTo: Double
    let multiplicity: String
    let J: [Double]
    let nH: Double
    let minor: Bool
    let excluded: Bool
    let flag: String?
    let candidates: [String]
}

struct Hint: Codable, Hashable {
    let text: String
    let detail: String
}

struct CompoundMatch: Codable, Hashable, Identifiable {
    var id: String { name }
    let name: String
    let formula: String
    let score: Double
    let h: [Double]
    let c: [Double]
}

struct Params: Codable {
    var ph0: Double
    var ph1: Double
    var lb: Double
    var snr: Double
    var baseline: Bool
    var fromFid: Bool
    var referenceShift: Double
    var formula: String
}

struct SpectrumResult: Codable {
    let id: String
    let title: String
    let nucleus: String
    let frequency: Double
    let solvent: String
    let source: String
    let ppmStart: Double
    let ppmEnd: Double
    let points: Int
    /// Min/max pairs per column (or raw points for short spectra).
    let y: [Double]
    let peaks: [Peak]
    let signals: [Signal]
    let hints: [Hint]
    let compounds: [CompoundMatch]
    let report: String
    let params: Params

    var is13C: Bool { nucleus.contains("13C") }
}

struct ShiftGroup: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let nucleus: String
    let min: Double
    let max: Double
    let typical: Double
    let note: String
}

struct Isotope: Codable, Hashable {
    let iso: String
    let spin: String
    let abundance: Double
    let freq: Double
}

struct ElementInfo: Codable, Hashable {
    let symbol: String
    let name: String
    let note: String
    let isotopes: [Isotope]
}

struct SearchResult: Codable {
    let element: ElementInfo?
    let groups: [ShiftGroup]
    let compounds: [CompoundName]
    struct CompoundName: Codable, Hashable { let name: String; let formula: String }
}

enum CoreError: LocalizedError {
    case missingBundle
    case script(String)
    var errorDescription: String? {
        switch self {
        case .missingBundle: return "nmrcore.js is missing from the app bundle. Run scripts/build-core-bundle.mjs."
        case .script(let m): return m
        }
    }
}

final class CoreBridge {
    private let context: JSContext
    private var lastError: String?

    init() throws {
        guard let url = Bundle.module.url(forResource: "nmrcore", withExtension: "js"),
              let source = try? String(contentsOf: url) else { throw CoreError.missingBundle }
        context = JSContext()
        context.exceptionHandler = { [weak self] _, exc in
            self?.lastError = exc?.toString() ?? "Unknown script error"
        }
        context.evaluateScript(source, withSourceURL: url)
        if let e = lastError { throw CoreError.script(e) }
    }

    private func call(_ fn: String, _ args: [Any]) throws -> String {
        lastError = nil
        let bridge = context.objectForKeyedSubscript("NMRBridge")
        let out = bridge?.invokeMethod(fn, withArguments: args)
        if let e = lastError { throw CoreError.script(e) }
        return out?.toString() ?? ""
    }

    private func decode<T: Decodable>(_ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    /// files: relative path -> file contents for one drop/open action.
    func open(files: [String: Data]) throws -> OpenResult {
        let payload = files.mapValues { $0.base64EncodedString() }
        let json = String(data: try JSONSerialization.data(withJSONObject: payload), encoding: .utf8) ?? "{}"
        return try decode(try call("open", [json]))
    }

    func run(id: String, changes: [String: Any] = [:], columns: Int = 4096) throws -> SpectrumResult {
        let json = String(data: try JSONSerialization.data(withJSONObject: changes), encoding: .utf8) ?? "{}"
        return try decode(try call("run", [id, json, columns]))
    }

    func search(_ query: String) throws -> SearchResult {
        try decode(try call("search", [query]))
    }
}
