// One-click Supporting Information: for each spectrum the ACS-style data string and a
// publication figure on one printable page (open it in a browser and print to PDF).
import { journalReport } from './assign.js';
import { plotSVG } from './export.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const visible = (r) => r.analysis.multiplets.filter((m) => !m.excluded);

/** ACS data string for a processed result: plain Unicode text, or HTML with <sup>/<sub>/<i>J</i>. */
export function acsDataString(r, opts = {}) {
  return journalReport(r.spectrum, visible(r), opts);
}

/**
 * The SI page as a standalone HTML document.
 * entries: [{ result, name?, hi?, lo? }]; name is the compound heading (default the spectrum title).
 * opts: { title, labels, integrals }.
 */
export function siPage(entries, opts = {}) {
  const list = entries.filter((e) => e && e.result);
  const date = new Date().toISOString().slice(0, 10);
  const sections = list.map((e, k) => {
    const r = e.result, s = r.spectrum;
    const name = e.name || s.title || s.name || `Spectrum ${k + 1}`;
    const svg = plotSVG(r, { hi: e.hi, lo: e.lo, width: 1400, height: 620, labels: opts.labels !== false, integrals: opts.integrals !== false, title: '' })
      .replace(/^<\?xml[^>]*>\s*/, '');
    const meta = [s.nucleus, s.frequency ? `${Math.round(s.frequency)} MHz` : '', s.solvent, s.name].filter(Boolean).map(esc).join(' · ');
    return `<section>
  <h2>${esc(name)}</h2>
  <p class="data">${acsDataString(r, { html: true })}</p>
  <figure>${svg}<figcaption>Figure S${k + 1}. ${esc(name)}, ${journalHead(s)}.</figcaption></figure>
  <p class="meta">${meta}</p>
</section>`;
  }).join('\n');
  const title = opts.title || 'Supporting Information: NMR spectra';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 11pt/1.45 "Times New Roman", Times, serif; color: #111; background: #fff; max-width: 190mm; margin: 0 auto; padding: 12px 16px 40px; }
  h1 { font: 600 15pt/1.3 Helvetica, Arial, sans-serif; margin: 0 0 4px; }
  .sub { font: 9pt Helvetica, Arial, sans-serif; color: #666; margin: 0 0 18px; }
  section { break-inside: avoid; page-break-inside: avoid; margin: 0 0 22px; }
  section + section { break-before: auto; }
  h2 { font: 600 12pt/1.3 Helvetica, Arial, sans-serif; margin: 0 0 6px; }
  .data { margin: 0 0 8px; text-align: justify; }
  figure { margin: 0; }
  figure svg { width: 100%; height: auto; display: block; border: 0.5pt solid #ddd; }
  figcaption { font-size: 9.5pt; color: #333; margin-top: 4px; }
  .meta { font: 8.5pt Menlo, Consolas, monospace; color: #777; margin: 4px 0 0; }
  footer { font: 8.5pt Helvetica, Arial, sans-serif; color: #888; margin-top: 24px; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
<p class="sub">${list.length} spectr${list.length === 1 ? 'um' : 'a'} · ${date}</p>
${sections}
<footer>Processed and reported with NMRemView. Check every value before submission.</footer>
</body>
</html>
`;
}

function journalHead(s) {
  const c13 = /13C/.test(s.nucleus);
  return `${c13 ? '<sup>13</sup>C{<sup>1</sup>H}' : '<sup>1</sup>H'} NMR spectrum (${Math.round(s.frequency || 0)} MHz, ${esc(s.solvent || '').replace(/\d+/g, '<sub>$&</sub>')})`;
}
