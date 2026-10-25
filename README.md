# NMRemView

**Created and maintained by [Ashif](https://github.com/Ashif3hq).**

### [⬇ Download for macOS (Apple silicon)](https://github.com/Ashif3hq/NMRemView/releases/latest/download/NMRemView-macOS-arm64.zip) · [▶ Open the web version](https://claude.ai/artifact/XS2cMA3a168QonPK8RjwjB)

The macOS link always fetches the newest release (macOS 14+, M1 or later). Unzip, move
NMRemView.app to Applications, then right-click it and choose **Open** the first time, because the
app is not notarised yet. All versions are on the [Releases page](https://github.com/Ashif3hq/NMRemView/releases).
The web version runs in the browser and your files never leave your computer.

Fast, friendly ¹H and ¹³C NMR analysis for chemists: open almost any 1D NMR file, get a
processed, phased, integrated spectrum with multiplets, a journal-ready peak list, likely
assignments and structure suggestions, plus searchable reference shift data by element or
functional group.

* `core/` shared processing engine (JavaScript, no dependencies)
* `web/` web trial (static site; everything runs in the browser, files never leave the machine)
* `macos/` native SwiftUI app for Apple silicon that runs the same core through JavaScriptCore
* `tests/` regression checks on real spectra

Integrals work like in MestReNova: drag to add a region, type a value to normalise every
integral to it, delete single regions. The Polymer panel turns integrals into polymer data:
DPₙ and Mₙ by end-group analysis (repeat-unit and end-group presets), copolymer mole and weight
fractions, and polyisoprene / polymyrcene / polybutadiene microstructure (1,4 / 3,4 / 1,2, cis : trans).

The web trial and the macOS app have a MestReNova-style toolbar (keyboard shortcut in brackets): Zoom (Z), Pan (H),
Peak + (K) and Peak − (X) for manual peak picking, Integrate (I), ∫ = n (N) to set a reference
integral, δ ref (R) to reference the shift, Label (L) to name a signal, Note (T) for free text on
the plot, undo/redo (Ctrl/⌘ Z), and Export to PNG, peak-list CSV and integral CSV. The letter
shortcuts are web-only; on the Mac, undo and redo are ⌘Z and ⇧⌘Z. In the Polymer
panel, "pick on spectrum" chooses the counting and end-group signals by clicking or dragging on
the plot.

Mouse: scroll to zoom around the pointer, Shift/⌥-scroll for the vertical scale, swipe sideways
or Shift-drag to pan, double-click to fit, right-click a signal for a menu (zoom to it, mark or
remove peaks, set its integral, label it, reference it, use it for the polymer calculation, copy
it for a report), and hover a signal to see δ, multiplicity, J, integral and label.

Export for other software: the spectrum as JCAMP-DX (MestReNova, TopSpin, ACD/Labs), CSV/TSV
(Origin, Excel, any plotting tool) or nmrML; the plot as SVG, high-resolution PNG or (Mac) PDF;
peak and integral tables as CSV or TSV that paste straight into Excel.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design.

## Web trial

```sh
npm run serve        # builds dist/web and serves it at http://localhost:8765
```

Drop a Bruker or Varian folder (or .zip), a JEOL .jdf, a Magritek Spinsolve folder, NMRPipe, nmrML or JCAMP-DX file, or a CSV. MestReNova .mnova documents open too: every Bruker FID a document holds is recovered (other vendors' data inside .mnova still needs a JCAMP-DX export).

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

## Author

NMRemView is designed and built by **Ashif** ([@Ashif3hq](https://github.com/Ashif3hq)).
© 2026 Ashif. All rights reserved; see [LICENSE](LICENSE).
