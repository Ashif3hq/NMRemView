# NMRemView architecture

NMRemView is one processing engine with two front ends. Everything a chemist relies on
(file import, processing, peak picking, integration, multiplet analysis, assignment
suggestions, shift reference data) lives in a single JavaScript core, so the web trial and
the macOS app always give the same answer for the same file.

```
                ┌──────────────────────────── core/ (plain ES modules, no dependencies) ───────────────────────────┐
 files ───────► │ loader ─► jcamp / bruker / varian / textformats / zip                                            │
                │    │                                                                                             │
                │    ▼                                                                                             │
                │ session ─► processing (FFT, apodisation, zero fill, digital-filter fix, auto phase, baseline)    │
                │    │                                                                                             │
                │    ├──► analysis (peak picking, integral regions, multiplets s/d/t/q/dd/dt/td/ddd/m, J, nH)      │
                │    └──► assign  (candidate groups, solvent & impurity flags, fragment rules, compound matching,  │
                │                  journal-style report, formula → DBE)  ◄── database (shift ranges, isotopes,      │
                │                                                             solvents, impurities, J table, library)│
                └──────────────────────────────────────────────────────────────────────────────────────────────────┘
                         │ ES modules                                       │ esbuild IIFE + bridge.js (JSON API)
                         ▼                                                  ▼
              web/ (trial, any browser)                         macos/ (SwiftUI, Apple silicon)
              canvas viewer, drag-and-drop folders,             JavaScriptCore runs nmrcore.js; native
              all processing local in the browser               SwiftUI Canvas plot, Table, search
```

## Why a JavaScript core

* The web trial needs it anyway, and JavaScriptCore ships with macOS, so the Mac app reuses
  the exact same code with no extra runtime, on Apple silicon natively.
* One test suite (`npm test`) guards both apps.
* If heavy 2D processing later needs more speed, individual modules (FFT, phasing) can move to
  Rust compiled to WebAssembly for the web and to a static library for macOS, behind the same
  `session` API.

## Data model

A dataset is `{nucleus, frequency, solvent, meta, fid?, rawReal?/rawImag?}`. Index 0 of every
spectrum is the highest ppm. `createSession(ds)` caches the FFT so phase, baseline and
threshold changes run in ~30 ms on a 64k-point spectrum.

## Formats

| Format | Status |
| --- | --- |
| Bruker TopSpin/XWIN-NMR folders (acqus, fid, pdata/1/procs, 1r/1i), also zipped | Done, verified on real 300–600 MHz data |
| JEOL Delta `.jdf` (1D FID and spectra, digital filter, auto solvent referencing) | Done, verified on real 400/600 MHz ¹H and ¹³C data |
| JCAMP-DX 4.24–6.0: XYDATA, NTUPLES spectra and FIDs, ASDF compression, PEAK TABLE | Done, verified (Bruker, Varian, Nanalysis, Oxford Instruments exports) |
| Varian/Agilent VnmrJ `.fid` folders (procpar + fid) | Written, needs a real test file |
| Magritek Spinsolve folders (acqu.par + data.1d / spectrum.1d) | Written, needs a real test file |
| NMRPipe 1D `.fid` / `.ft` | Written, needs a real test file |
| nmrML (open XML standard, zlib or plain) | Written, needs a real test file |
| MestReNova `.mnova` | Closed Qt format, reverse-engineered. Bruker experiments are recovered: the original acqus/procs are stored as named qCompress blocks, and the FID follows as a big-endian byte count, a flag byte and little-endian float32 values. Tested on a 13-spectrum Mnova 15 document. Embedded JCAMP-DX is also read. Non-Bruker data inside .mnova is not yet supported. |
| CSV/TXT two-column (ppm, intensity) | Done |
| 2D (COSY, HSQC, HMBC) | Detected and skipped; planned |

## Intelligence

Today the "suggestions" are deterministic and explainable:

1. Each signal gets ranked candidate environments from ~100 curated ¹H/¹³C shift ranges,
   weighted by distance to the typical shift, multiplicity, integral and (if given) the formula.
2. Solvent residuals, water and common impurities (Fulmer et al. 2010) are flagged.
3. Pattern rules find fragments (ethyl, isopropyl, tert-butyl, OMe/NMe/acetyl singlets,
   mono/para-substituted benzene, cis/trans alkenes, aldehydes, acids, carbonyl classes).
4. A reference library is scored against the peak list and can be overlaid on the spectrum.

Next steps for "intelligent": larger reference database (e.g. nmrshiftdb2, open data), shift
prediction from a drawn structure, and an optional Claude-powered assistant that explains the
spectrum and proposes structures from the peak table, formula and fragment hints.

## Polymer analysis (`core/polymer.js`)

* `degreeOfPolymerisation`: DPₙ = (∫repeat / H per unit) ÷ (∫end / H in end signal × ends per chain); Mₙ = DPₙ·M₀ + M_end.
* `composition`: mole fraction from ∫/nH per monomer, weight fraction weighted by M₀.
* `microstructure`: fixed CDCl₃ windows. Polyisoprene: 1,4 (=CH 5.12, 1H), 3,4 (=CH₂ 4.6–4.8, 2H), 1,2 (CH= 5.7–5.9, 1H), cis/trans from CH₃ 1.68 / 1.60. Polybutadiene: 1,2 from =CH₂ 4.9–5.0, 1,4 from the remaining olefinic area.
* Integral normalisation: session param `integralRef = { ppm, value }` scales every integral so the one containing `ppm` equals `value`.

