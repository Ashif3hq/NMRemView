// Exports for other software: JCAMP-DX, nmrML, plain x/y text, peak and integral tables, and the
// plot as SVG. Each takes a session result (session.run()) and returns a string.

const isC13 = (r) => /13C/.test(r.spectrum.nucleus);

// Signals worth reporting: the ones the integral brackets show.
function reportedSignals(r) {
  return r.analysis.multiplets.filter((m) => !m.excluded && (!m.minor || m.manual || m.reference || isC13(r)));
}

function labelsIn(r, m) {
  const sh = r.params.referenceShift;
  return (r.params.annotations || []).filter((a) => a.kind === 'label' && a.ppm + sh <= m.ppmFrom + 1e-6 && a.ppm + sh >= m.ppmTo - 1e-6).map((a) => a.text).join('; ');
}

function table(rows, sep) {
  const cell = (v) => {
    const s = String(v ?? '');
    if (sep === '\t') return s.replace(/[\t\n]/g, ' ');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((row) => row.map(cell).join(sep)).join('\n') + '\n';
}

/** Peak list: ppm, Hz, height, relative %, how it was picked. sep ',' (CSV) or '\t' (TSV, pastes into Excel). */
export function peakTable(r, sep = ',') {
  const freq = r.spectrum.frequency || 0;
  const peaks = r.analysis.peaks;
  const maxH = Math.max(...peaks.map((p) => p.height), 1);
  return table([['ppm', 'Hz', 'intensity', 'relative %', 'picked']].concat(peaks.map((p) => [
    p.ppm.toFixed(4), freq ? (p.ppm * freq).toFixed(2) : '', p.height.toPrecision(6), (100 * p.height / maxH).toFixed(2), p.manual ? 'manual' : 'auto',
  ])), sep);
}

/** Integral / multiplet table with labels and notes, as MestReNova's multiplet report lists them. */
export function integralTable(r, sep = ',') {
  const c13 = isC13(r);
  const rows = [['from ppm', 'to ppm', 'centre ppm', 'multiplicity', 'J (Hz)', 'integral', 'absolute area', 'label', 'likely environment']];
  for (const m of reportedSignals(r)) {
    rows.push([m.ppmFrom.toFixed(3), m.ppmTo.toFixed(3), m.ppm.toFixed(3), m.multiplicity || '', (m.J || []).map((j) => j.toFixed(1)).join(' '),
      c13 ? '' : (m.nH || 0).toFixed(3), (m.area || 0).toPrecision(6), labelsIn(r, m), m.candidates && m.candidates[0] ? m.candidates[0].group.name : '']);
  }
  let out = table(rows, sep);
  const notes = (r.params.annotations || []).filter((a) => a.kind === 'note');
  if (notes.length) out += '\n' + table([['note at ppm', 'text']].concat(notes.map((a) => [(a.ppm + r.params.referenceShift).toFixed(3), a.text])), sep);
  return out;
}

/** The processed spectrum as two columns (ppm, intensity), highest shift first. Every program imports this. */
export function spectrumXY(r, sep = ',') {
  const s = r.spectrum, n = s.real.length, step = (s.ppmEnd - s.ppmStart) / (n - 1);
  const lines = [`ppm${sep}intensity`];
  for (let i = 0; i < n; i++) lines.push(`${(s.ppmStart + i * step).toFixed(6)}${sep}${s.real[i].toPrecision(8)}`);
  return lines.join('\n') + '\n';
}

const NUC = (n) => (/13C/.test(n) ? '^13C' : /1H/.test(n) ? '^1H' : '^' + n);

/** JCAMP-DX 5.01 processed spectrum (XYDATA in Hz with .SHIFT REFERENCE), readable by MestReNova, TopSpin, ACD and others. */
export function toJcamp(r) {
  const s = r.spectrum, n = s.real.length, freq = s.frequency || 0;
  const ppmStep = (s.ppmEnd - s.ppmStart) / (n - 1);
  let maxAbs = 0;
  for (let i = 0; i < n; i++) maxAbs = Math.max(maxAbs, Math.abs(s.real[i]));
  const yf = maxAbs ? maxAbs / 1e9 : 1;
  const hz = !!freq;
  const x0 = hz ? s.ppmStart * freq : s.ppmStart, dx = hz ? ppmStep * freq : ppmStep;
  const head = [
    `##TITLE= ${s.title || 'NMRemView export'}`,
    '##JCAMP-DX= 5.01', '##DATA TYPE= NMR SPECTRUM', '##DATA CLASS= XYDATA',
    '##ORIGIN= NMRemView', `##OWNER= ${s.meta && s.meta.owner ? s.meta.owner : ''}`,
    `##.OBSERVE NUCLEUS= ${NUC(s.nucleus)}`,
    ...(freq ? [`##.OBSERVE FREQUENCY= ${freq.toFixed(6)}`] : []),
    ...(s.solvent ? [`##.SOLVENT NAME= ${s.solvent}`] : []),
    ...(hz ? [`##.SHIFT REFERENCE= (INTERNAL, ${s.solvent || 'TMS'}, 1, ${s.ppmStart.toFixed(6)})`, `##$OFFSET= ${s.ppmStart.toFixed(6)}`] : []),
    `##XUNITS= ${hz ? 'HZ' : 'PPM'}`, '##YUNITS= ARBITRARY UNITS',
    '##XFACTOR= 1', `##YFACTOR= ${yf.toPrecision(10)}`,
    `##FIRSTX= ${x0.toFixed(6)}`, `##LASTX= ${(x0 + dx * (n - 1)).toFixed(6)}`, `##DELTAX= ${dx.toPrecision(10)}`,
    `##NPOINTS= ${n}`, `##FIRSTY= ${Math.round(s.real[0] / yf)}`,
    '##XYDATA= (X++(Y..Y))',
  ];
  const lines = [];
  for (let i = 0; i < n; i += 10) {
    const ys = [];
    for (let k = i; k < Math.min(n, i + 10); k++) ys.push(Math.round(s.real[k] / yf));
    lines.push(`${(x0 + dx * i).toFixed(4)} ${ys.join(' ')}`);
  }
  return head.concat(lines, ['##END='], '').join('\n');
}

function base64(bytes) {
  const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    const n = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += T[(n >> 18) & 63] + T[(n >> 12) & 63] + (i + 1 < bytes.length ? T[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? T[n & 63] : '=');
  }
  return out;
}

const xmlEsc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** nmrML (open XML standard) with the processed spectrum as complex128, imaginary part zero. */
export function toNmrML(r) {
  const s = r.spectrum, n = s.real.length;
  const buf = new ArrayBuffer(n * 16), dv = new DataView(buf);
  for (let i = 0; i < n; i++) { dv.setFloat64(i * 16, s.real[i], true); dv.setFloat64(i * 16 + 8, 0, true); }
  const data = base64(new Uint8Array(buf));
  const nuc = /13C/.test(s.nucleus) ? '13C' : '1H';
  return `<?xml version="1.0" encoding="UTF-8"?>
<nmrML xmlns="http://nmrml.org/schema" version="1.0.rc1" accession="NMRemView">
  <cvList><cv id="NMRCV" fullName="nmrCV" version="1.1.0" URI="http://nmrml.org/cv/v1.1.0/nmrCV.owl"/><cv id="UO" fullName="Unit Ontology" version="1.0" URI="http://purl.obolibrary.org/obo/uo.owl"/></cvList>
  <fileDescription><fileContent><cvParam cvRef="NMRCV" accession="NMR:1400119" name="one-dimensional acquisition"/></fileContent></fileDescription>
  <softwareList><software id="NMRemView" cvRef="NMRCV" accession="NMR:1400217" name="NMRemView" version="1"/></softwareList>
  <acquisition><acquisition1D>
    <acquisitionParameterSet numberOfScans="${(s.meta && s.meta.scans) || 1}" numberOfSteadyStateScans="0">
      <sampleContainer cvRef="NMRCV" accession="NMR:1400128" name="tube"/>
      <sampleAcquisitionTemperature value="${(s.meta && s.meta.temperature) || 298}" unitCvRef="UO" unitAccession="UO:0000012" unitName="kelvin"/>
      <spinningRate value="0" unitCvRef="UO" unitAccession="UO:0000106" unitName="hertz"/>
      <relaxationDelay value="1" unitCvRef="UO" unitAccession="UO:0000010" unitName="second"/>
      <pulseSequence name="${xmlEsc((s.meta && s.meta.pulseSequence) || 'zg')}"/>
      <DirectDimensionParameterSet decoupled="false" numberOfDataPoints="${n}">
        <acquisitionNucleus cvRef="NMRCV" accession="NMR:1400151" name="${nuc}"/>
        <effectiveExcitationField value="${s.frequency || 0}" unitCvRef="UO" unitAccession="UO:0000325" unitName="megaHertz"/>
        <sweepWidth value="${Math.abs(s.ppmStart - s.ppmEnd) * (s.frequency || 1)}" unitCvRef="UO" unitAccession="UO:0000106" unitName="hertz"/>
        <irradiationFrequency value="${(s.frequency || 0) * 1e6}" unitCvRef="UO" unitAccession="UO:0000106" unitName="hertz"/>
      </DirectDimensionParameterSet>
    </acquisitionParameterSet>
  </acquisition1D></acquisition>
  <sampleList><sample originalBiologicalSampleReference="${xmlEsc(s.title)}"><solventType><cvParam cvRef="NMRCV" accession="NMR:1400033" name="${xmlEsc(s.solvent || 'unknown')}"/></solventType></sample></sampleList>
  <spectrumList>
    <spectrum1D id="spectrum1" numberOfDataPoints="${n}">
      <spectrumDataArray compressed="false" encodedLength="${data.length}" byteFormat="complex128">${data}</spectrumDataArray>
      <xAxis unitAccession="UO:0000169" unitName="parts per million" unitCvRef="UO" startValue="${s.ppmStart}" endValue="${s.ppmEnd}"/>
      <processingParameterSet><postAcquisitionSolventSuppressionMethod cvRef="NMRCV" accession="NMR:1400094" name="none"/></processingParameterSet>
    </spectrum1D>
  </spectrumList>
</nmrML>
`;
}

/**
 * The plot as SVG (vector; opens in Illustrator, Inkscape, Word, PowerPoint, ChemDraw).
 * opts: hi, lo (ppm range, default the populated region), width, height, labels, integrals, title.
 */
export function plotSVG(r, opts = {}) {
  const s = r.spectrum, y = s.real, n = y.length;
  const W = opts.width || 1200, H = opts.height || 600;
  const c13 = isC13(r);
  let hi = opts.hi, lo = opts.lo;
  if (hi == null || lo == null) {
    const pk = r.analysis.peaks.map((p) => p.ppm);
    hi = pk.length ? Math.min(s.ppmStart, Math.max(...pk) + (c13 ? 10 : 0.5)) : s.ppmStart;
    lo = pk.length ? Math.max(s.ppmEnd, Math.min(...pk) - (c13 ? 5 : 0.3)) : s.ppmEnd;
  }
  const labelsOn = opts.labels !== false, intsOn = opts.integrals !== false && !c13;
  const L = 30, R = W - 30, top = labelsOn ? 110 : 40, axisY = H - (intsOn ? 80 : 50);
  const step = (s.ppmEnd - s.ppmStart) / (n - 1);
  const X = (p) => L + ((hi - p) / (hi - lo)) * (R - L);
  const i0 = Math.max(0, Math.floor((hi - s.ppmStart) / step)), i1 = Math.min(n - 1, Math.ceil((lo - s.ppmStart) / step));
  let vmax = 0;
  for (let i = i0; i <= i1; i++) vmax = Math.max(vmax, y[i]);
  vmax = vmax || 1;
  const Y = (v) => axisY - 6 - (v / vmax) * (axisY - top - 10);
  const f = (v) => v.toFixed(1);
  const parts = [];
  // Trace, min/max per pixel column.
  const cols = Math.ceil(R - L), pts = [];
  for (let c = 0; c < cols; c++) {
    const a = Math.floor(i0 + (c / cols) * (i1 - i0)), b = Math.max(a, Math.floor(i0 + ((c + 1) / cols) * (i1 - i0)));
    let mn = Infinity, mx = -Infinity;
    for (let i = a; i <= b && i < n; i++) { mn = Math.min(mn, y[i]); mx = Math.max(mx, y[i]); }
    pts.push(`${f(L + c + 0.5)},${f(Y(mn))}`, `${f(L + c + 0.5)},${f(Y(mx))}`);
  }
  parts.push(`<polyline fill="none" stroke="#18306b" stroke-width="1" stroke-linejoin="round" points="${pts.join(' ')}"/>`);
  // Axis
  const span = hi - lo, raw = span / 10, mag = Math.pow(10, Math.floor(Math.log10(raw))), nr = raw / mag;
  const tick = (nr < 1.5 ? 1 : nr < 3 ? 2 : nr < 7 ? 5 : 10) * mag, dec = Math.max(0, -Math.floor(Math.log10(tick) + 1e-9));
  let ax = `M${L},${axisY}H${R}`;
  const tl = [];
  for (let t = Math.ceil(lo / tick) * tick; t <= hi + 1e-9; t += tick) {
    ax += `M${f(X(t))},${axisY}v6`;
    tl.push(`<text x="${f(X(t))}" y="${axisY + 20}" text-anchor="middle">${t.toFixed(dec)}</text>`);
  }
  parts.push(`<path d="${ax}" stroke="#333" fill="none"/>`, `<g font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#333">${tl.join('')}<text x="${R}" y="${axisY + 36}" text-anchor="end">ppm</text></g>`);
  // Peak labels with leaders
  if (labelsOn) {
    const pk = r.analysis.peaks.filter((p) => p.ppm <= hi && p.ppm >= lo).sort((a, b) => b.ppm - a.ppm);
    const maxN = Math.floor((R - L) / 11);
    const shown = pk.length > maxN ? pk.slice().sort((a, b) => (b.manual - a.manual) || (b.height - a.height)).slice(0, maxN).sort((a, b) => b.ppm - a.ppm) : pk;
    const xs = shown.map((p) => X(p.ppm)), pos = xs.slice();
    for (let it = 0; it < 60; it++) for (let i = 1; i < pos.length; i++) if (pos[i] - pos[i - 1] < 11) { const d = (11 - pos[i] + pos[i - 1]) / 2; pos[i - 1] -= d; pos[i] += d; }
    const g = [];
    shown.forEach((p, k) => {
      g.push(`<path d="M${f(pos[k])},${top - 30}v6L${f(xs[k])},${top - 8}V${f(Math.min(top + 4, Math.max(top - 2, Y(p.height) - 4)))}" stroke="#999" stroke-width="0.6" fill="none"/>`);
      g.push(`<text transform="translate(${f(pos[k] + 3.5)},${top - 32}) rotate(-90)" fill="${p.manual ? '#0e7c86' : '#222'}">${p.ppm.toFixed(c13 ? 2 : 3)}</text>`);
    });
    parts.push(`<g font-family="Menlo, Consolas, monospace" font-size="10">${g.join('')}</g>`);
  }
  // Integral brackets and values
  if (intsOn) {
    const g = [];
    const vis = reportedSignals(r).filter((m) => m.ppmTo <= hi && m.ppmFrom >= lo).sort((a, b) => b.ppm - a.ppm);
    const cx = vis.map((m) => (X(Math.min(hi, m.ppmFrom)) + X(Math.max(lo, m.ppmTo))) / 2), tx = cx.slice();
    // Values sit under their brackets, nudged apart when brackets crowd together.
    for (let it = 0; it < 60; it++) for (let i = 1; i < tx.length; i++) if (tx[i] - tx[i - 1] < 34) { const d = (34 - tx[i] + tx[i - 1]) / 2; tx[i - 1] -= d; tx[i] += d; }
    vis.forEach((m, k) => {
      const x1 = X(Math.min(hi, m.ppmFrom)), x2 = X(Math.max(lo, m.ppmTo));
      g.push(`<path d="M${f(x1)},${axisY + 28}v4H${f(x2)}v-4" stroke="#c4561b" fill="none"/><text x="${f(tx[k])}" y="${axisY + 48}" text-anchor="middle">${(m.nH || 0).toFixed(2)}</text>`);
    });
    parts.push(`<g font-family="Menlo, Consolas, monospace" font-size="11" fill="#c4561b">${g.join('')}</g>`);
  }
  // Labels and notes
  const sh = r.params.referenceShift, g = [];
  for (const a of r.params.annotations || []) {
    const p = a.ppm + sh;
    if (p > hi || p < lo) continue;
    const w = a.text.length * 6.6 + 12;
    let bx = X(p), by;
    if (a.kind === 'label') {
      const k = Math.round((p - s.ppmStart) / step), sp = Math.max(2, Math.round(0.03 / Math.abs(step)));
      let apex = 0;
      for (let i = Math.max(0, k - sp); i <= Math.min(n - 1, k + sp); i++) apex = Math.max(apex, y[i]);
      const t = Math.max(top + 23, Y(apex) - 10);
      by = t - 17; g.push(`<path d="M${f(bx)},${f(t)}v6" stroke="#6a3ea1"/>`); bx -= w / 2;
    } else by = top + (a.yFrac ?? 0.2) * (axisY - top);
    bx = Math.min(R - w, Math.max(L, bx));
    g.push(`<rect x="${f(bx)}" y="${f(by)}" width="${f(w)}" height="17" rx="4" fill="#fff" stroke="#6a3ea1"/><text x="${f(bx + 6)}" y="${f(by + 12.5)}">${xmlEsc(a.text)}</text>`);
  }
  parts.push(`<g font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="600" fill="#6a3ea1">${g.join('')}</g>`);
  const title = opts.title ?? `${s.title || ''} · ${s.nucleus}${s.frequency ? ` · ${Math.round(s.frequency)} MHz` : ''}${s.solvent ? ` · ${s.solvent}` : ''}`;
  parts.push(`<text x="${L}" y="18" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#555">${xmlEsc(title)}</text>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${parts.join('')}</svg>\n`;
}

/** Every export by id, with file suffix and media type, for the UI menus on web and Mac. */
export const EXPORTS = [
  { id: 'svg', label: 'Plot as SVG (vector)', suffix: '.svg', type: 'image/svg+xml', group: 'Image' },
  { id: 'jcamp', label: 'Spectrum as JCAMP-DX (.jdx)', suffix: '.jdx', type: 'chemical/x-jcamp-dx', group: 'Spectrum' },
  { id: 'xy-csv', label: 'Spectrum as CSV (ppm, intensity)', suffix: '-spectrum.csv', type: 'text/csv', group: 'Spectrum' },
  { id: 'xy-tsv', label: 'Spectrum as TSV / ASCII', suffix: '-spectrum.txt', type: 'text/tab-separated-values', group: 'Spectrum' },
  { id: 'nmrml', label: 'Spectrum as nmrML', suffix: '.nmrML', type: 'application/xml', group: 'Spectrum' },
  { id: 'peaks-csv', label: 'Peak list (CSV)', suffix: '-peaks.csv', type: 'text/csv', group: 'Tables' },
  { id: 'peaks-tsv', label: 'Peak list (TSV, for Excel)', suffix: '-peaks.tsv', type: 'text/tab-separated-values', group: 'Tables' },
  { id: 'ints-csv', label: 'Integrals and multiplets (CSV)', suffix: '-integrals.csv', type: 'text/csv', group: 'Tables' },
  { id: 'ints-tsv', label: 'Integrals and multiplets (TSV, for Excel)', suffix: '-integrals.tsv', type: 'text/tab-separated-values', group: 'Tables' },
  { id: 'report', label: 'Journal report (text)', suffix: '-report.txt', type: 'text/plain', group: 'Tables' },
];

export function exportAs(r, id, opts = {}) {
  switch (id) {
    case 'svg': return plotSVG(r, opts);
    case 'jcamp': return toJcamp(r);
    case 'xy-csv': return spectrumXY(r, ',');
    case 'xy-tsv': return spectrumXY(r, '\t');
    case 'nmrml': return toNmrML(r);
    case 'peaks-csv': return peakTable(r, ',');
    case 'peaks-tsv': return peakTable(r, '\t');
    case 'ints-csv': return integralTable(r, ',');
    case 'ints-tsv': return integralTable(r, '\t');
    case 'report': return r.report;
    default: throw new Error('Unknown export ' + id);
  }
}
