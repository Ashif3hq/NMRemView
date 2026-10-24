# NMRemView

Fast, friendly ¹H and ¹³C NMR analysis for chemists: open almost any 1D NMR file, get a
processed, phased, integrated spectrum with multiplets, a journal-ready peak list, likely
assignments and structure suggestions, plus searchable reference shift data by element or
functional group.

* `core/` shared processing engine (JavaScript, no dependencies)
* `web/` web trial (static site; everything runs in the browser, files never leave the machine)
* `macos/` native SwiftUI app for Apple silicon that runs the same core through JavaScriptCore
* `tests/` regression checks on real spectra

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design.

## Web trial

```sh
npm run serve        # builds dist/web and serves it at http://localhost:8765
```

Drop a Bruker or Varian folder (or .zip), a JEOL .jdf, a Magritek Spinsolve folder, NMRPipe, nmrML or JCAMP-DX file, or a CSV. MestReNova .mnova documents open when they embed open data; otherwise export JCAMP-DX from MestReNova.

## macOS app (Apple silicon, macOS 14+)

```sh
npm run build:core                  # writes macos/NMRemView/Sources/NMRemView/Resources/nmrcore.js
cd macos/NMRemView && swift run     # or: open Package.swift in Xcode and press Run
```

The Swift sources have not been compiled yet (they were written on Linux); expect a first
round of small Xcode fixes.

## Tests

```sh
npm test
```

Example spectra in `web/samples` come from the MIT-licensed cheminfo test collections.
