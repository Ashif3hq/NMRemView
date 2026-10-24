import * as NMR from './core/index.js';
import { SpectrumViewer } from './viewer.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SAMPLES = [
  { file: 'samples/ibuprofen-1h.zip.b64.txt', label: 'Ibuprofen ¹H · Bruker FID, 600 MHz' },
  { file: 'samples/ibuprofen-13c.zip.b64.txt', label: 'Ibuprofen ¹³C · Bruker FID, 151 MHz' },
  { file: 'samples/aspirin-1h.zip.b64.txt', label: 'Aspirin ¹H · Bruker FID, 300 MHz' },
  { file: 'samples/strychnine-1h.zip.b64.txt', label: 'Strychnine ¹H · Bruker, 400 MHz' },
  { file: 'samples/rutin-13c.jdf.b64.txt', label: 'Rutin ¹³C · JEOL Delta FID, 101 MHz' },
  { file: 'samples/cytisine-1h.jdx', label: 'Cytisine ¹H · JCAMP-DX, 600 MHz' },
  { file: 'samples/benchtop-60mhz-1h.jdx', label: 'Benchtop ¹H · JCAMP FID, 60 MHz' },
];

const state = { items: [], current: -1, tab: 'signals', query: '', bands: new Set(), compound: null, refPick: null, hoverSig: null };
let tabSaved;
try { tabSaved = localStorage.getItem('nmremview.tab'); } catch (e) { /* storage unavailable */ }
if (tabSaved) state.tab = tabSaved;

const viewer = new SpectrumViewer($('plot'), {
  onHover: (ppm) => {
    const it = cur();
    $('readout').textContent = ppm == null || !it ? '' : `δ ${ppm.toFixed(/13C/.test(it.ds.nucleus) ? 2 : 3)} ppm${it.ds.frequency ? ` · ${(ppm * it.ds.frequency).toFixed(1)} Hz` : ''}`;
  },
  onRange: (a, b) => {
    const it = cur(); if (!it) return;
    it.session.params.manualRegions.push([a, b]);
    rerun(); toast(`Integrated ${a.toFixed(2)} – ${b.toFixed(2)} ppm`);
  },
  onClickPpm: (ppm) => {
    const it = cur(); if (!it) return;
    if (viewer.mode === 'reference') {
      const peaks = it.result.analysis.peaks;
      const near = peaks.reduce((b, p) => (Math.abs(p.ppm - ppm) < Math.abs(b.ppm - ppm) ? p : b), peaks[0] || { ppm });
      state.refPick = near.ppm;
      setTab('info');
      setTimeout(() => $('refValue') && $('refValue').focus(), 0);
    } else {
      const sig = it.result.analysis.multiplets.find((m) => ppm <= m.ppmFrom && ppm >= m.ppmTo);
      if (sig) { state.hoverSig = sig; viewer.highlight = sig; viewer.draw(); if (state.tab === 'signals') renderTab(); }
    }
  },
});

function cur() { return state.items[state.current]; }

function setStatus(t) { $('status').textContent = t; }
function toast(t) {
  const el = $('toast'); el.textContent = t; el.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 2200);
}

async function addFiles(map, select = true) {
  setStatus('Reading…');
  try {
    const { datasets, warnings } = await NMR.loadFiles(map);
    const w = $('warns');
    w.hidden = !warnings.length; w.innerHTML = warnings.map(esc).join('<br>');
    const first = state.items.length;
    for (const ds of datasets) {
      const session = NMR.createSession(ds);
      state.items.push({ ds, session, result: null });
    }
    if (datasets.length && select) choose(first);
    renderLibrary();
    setStatus(datasets.length ? `${state.items.length} spectra loaded` : 'Nothing loaded');
  } catch (e) {
    setStatus('Could not read file');
    toast(e.message);
    console.error(e);
  }
}

function choose(i) {
  state.current = i;
  state.compound = null; viewer.sticks = [];
  state.hoverSig = null; viewer.highlight = null;
  const it = cur();
  if (!it.result) {
    const t = performance.now();
    it.result = it.session.run();
    setStatus(`Processed in ${Math.round(performance.now() - t)} ms`);
  }
  viewer.setResult(it.result);
  syncControls(); renderLibrary(); renderReport(); renderTab(); updateBands();
}

function rerun(keepView = true) {
  const it = cur(); if (!it) return;
  it.result = it.session.run();
  viewer.setResult(it.result, keepView);
  syncControls(); renderReport(); renderTab(); updateBands();
}
const set = (p) => { const it = cur(); if (!it) return; Object.assign(it.session.params, p); rerunSoon(); };
let raf = 0;
function rerunSoon() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => rerun()); }

function renderLibrary() {
  $('libList').innerHTML = state.items.map((it, i) => {
    const ds = it.ds;
    const c13 = /13C/.test(ds.nucleus);
    return `<button class="lib-item ${i === state.current ? 'active' : ''}" data-i="${i}" type="button">
      <span class="nuc ${c13 ? 'c13' : ''}">${esc(ds.nucleus)}</span>
      <span class="nm" title="${esc(ds.title)}">${esc(ds.title || ds.name)}</span>
      <span class="sub">${ds.frequency ? Math.round(ds.frequency) + ' MHz' : ''} ${esc(shortSolvent(ds.solvent))} · ${esc(ds.source)}</span>
    </button>`;
  }).join('') || '<div class="drop" style="margin:0 6px">No spectra yet.</div>';
}
function shortSolvent(s) { const f = NMR.findSolvent(s); return f ? f.id : s || ''; }

function syncControls() {
  const it = cur(); if (!it) return;
  const p = it.session.params;
  const hasImag = !!(p.fromFid ? it.ds.fid : it.ds.rawImag);
  $('phaseGroup').style.opacity = hasImag ? 1 : 0.4;
  for (const id of ['ph0', 'ph1', 'autoPhase']) $(id).disabled = !hasImag;
  $('ph0').value = p.ph0; $('ph0v').textContent = (+p.ph0).toFixed(1) + '°';
  $('ph1').value = p.ph1; $('ph1v').textContent = (+p.ph1).toFixed(0) + '°';
  $('lb').value = p.lb; $('lb').disabled = !p.fromFid;
  $('snr').value = p.snr; $('snrv').textContent = p.snr;
  $('baseline').classList.toggle('on', !!p.baseline);
  $('reverse').classList.toggle('on', !!p.reverse); $('reverse').disabled = !p.fromFid;
  $('labels').classList.toggle('on', viewer.showLabels);
  $('curves').classList.toggle('on', viewer.showCurves);
}

function renderReport() {
  const it = cur();
  $('report').textContent = it ? it.result.report : '';
}

// ---------- Tabs ----------
function setTab(t) {
  state.tab = t;
  try { localStorage.setItem('nmremview.tab', t); } catch (e) { /* ignore */ }
  for (const b of $('tabs').querySelectorAll('button')) b.classList.toggle('active', b.dataset.tab === t);
  renderTab();
}

function renderTab() {
  const it = cur();
  const body = $('tabbody');
  if (state.tab === 'lookup') { body.innerHTML = lookupHTML(); bindLookup(); return; }
  if (!it) { body.innerHTML = '<p class="assign alt">Load a spectrum to see its signals.</p>'; return; }
  if (state.tab === 'signals') body.innerHTML = signalsHTML(it);
  if (state.tab === 'suggest') body.innerHTML = suggestHTML(it);
  if (state.tab === 'info') body.innerHTML = infoHTML(it);
  if (state.tab === 'polymer') body.innerHTML = polymerHTML(it);
  bindTab(it);
}

function visibleSignals(it) {
  return it.result.analysis.multiplets.filter((m) => state.showMinor || !m.minor || m.manual || m.reference);
}

function fmtJ(J) { return J.length ? J.map((j) => j.toFixed(1)).join(', ') : ''; }

function signalsHTML(it) {
  const r = it.result;
  const is13 = /13C/.test(it.ds.nucleus);
  const sigs = visibleSignals(it);
  const minor = r.analysis.multiplets.length - r.analysis.multiplets.filter((m) => !m.minor || m.manual).length;
  const rows = sigs.map((m, k) => {
    const c = m.candidates || [];
    const top = c[0] ? esc(c[0].group.name) : '<span class="alt">no match in table</span>';
    const alt = c.slice(1, 3).map((x) => esc(x.group.name)).join(' · ');
    const flag = m.flag ? `<div><span class="flag ${m.flag.kind}">${esc(m.flag.label)}</span></div>` : '';
    const shift = !is13 && m.multiplicity === 'm' ? `${m.ppmFrom.toFixed(2)}–${m.ppmTo.toFixed(2)}` : m.ppm.toFixed(is13 ? 1 : 2);
    return `<tr data-k="${k}" class="${m.reference ? 'ref ' : ''}${m.excluded || (m.flag && m.flag.kind === 'solvent') ? 'muted' : ''} ${state.hoverSig && Math.abs(state.hoverSig.ppm - m.ppm) < 1e-6 ? 'hl' : ''}">
      <td class="mono">${shift}</td>
      ${is13 ? '' : `<td class="mult">${esc(m.multiplicity)}</td><td class="mono">${fmtJ(m.J)}</td><td class="mono">${m.excluded ? '–' : `<input class="nh-in" data-nh="${k}" type="number" step="any" min="0" value="${(m.nH || 0).toFixed(2)}" title="Type a value to normalise all integrals to this one" aria-label="Integral">`}</td>`}
      <td class="assign">${top}${alt ? `<div class="alt">${alt}</div>` : ''}${flag}</td>
      <td>${m.manual ? `<button class="x" data-rm="${k}" type="button" title="Delete this manual integral" aria-label="Delete integral">🗑</button>` : `<button class="x" data-ex="${k}" type="button" title="${m.excluded ? 'Include' : 'Exclude from report and integrals'}" aria-label="Toggle signal">${m.excluded ? '↺' : '×'}</button>`}</td>
    </tr>`;
  }).join('');
  const head = is13 ? '<th>δ ppm</th><th>Likely environment</th><th></th>' : '<th>δ ppm</th><th>Mult.</th><th>J (Hz)</th><th>nH</th><th>Likely environment</th><th></th>';
  const formula = is13 ? '' : `<div class="formula" style="margin-bottom:10px">
      <label for="formula" class="alt">Formula</label><input id="formula" type="text" placeholder="e.g. C13H18O2" value="${esc(it.session.params.formula)}">
      ${r.formula ? `<span class="mono">DBE ${r.formula.dbe} · ${r.formula.mw.toFixed(2)} g/mol · ${r.formula.totalH} H</span>` : '<span class="alt">sets the total H for integrals</span>'}
      ${it.session.params.manualRegions.length ? '<button class="btn small" id="clearManual" type="button">Clear manual integrals</button>' : ''}
      ${it.session.params.integralRef ? '<button class="btn small" id="clearNorm" type="button">Reset normalisation</button>' : ''}
    </div>`;
  return `${formula}<table class="sig"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    <p class="assign alt" style="margin-top:10px">${sigs.length} signals${minor ? ` · <button class="linkish" id="toggleMinor" type="button">${state.showMinor ? 'hide' : 'show'} ${minor} small signals</button>` : ''}. Click a row to zoom to it. Type in the nH column to set that integral (the others scale with it). Use Integrate in the toolbar to add your own regions.</p>`;
}

function suggestHTML(it) {
  const s = it.result.suggestions;
  const hints = s.hints.map((h) => `<div class="hint"><b>${esc(h.text)}</b><div>${esc(h.detail)}</div></div>`).join('') || '<p class="assign alt">No characteristic patterns found yet. Try adjusting the peak threshold.</p>';
  const comps = s.compounds.map((c, i) => `<button class="cmp ${state.compound === c.compound.name ? 'on' : ''}" data-cmp="${i}" type="button">
      <span><b>${esc(c.compound.name)}</b> <small>${esc(c.compound.formula)}</small></span><small>${Math.round(c.score * 100)}%</small>
      <span class="bar"><i style="width:${Math.round(c.score * 100)}%"></i></span>
      <small>${c.matched}/${c.of} reference signals matched · click to overlay</small>
    </button>`).join('') || '<p class="assign alt">No close match in the reference library.</p>';
  const sol = s.solvent ? `<p class="assign alt">Solvent: ${esc(s.solvent.id)} (residual ${s.solvent.h.join(', ')} ppm ¹H${s.solvent.c.length ? '; ' + s.solvent.c.join(', ') + ' ppm ¹³C' : ''})</p>` : '';
  return `<div class="section"><h3>Structural fragments</h3>${hints}</div>
    <div class="section"><h3>Closest reference compounds</h3>${comps}
    <p class="assign alt">Matches come from a built-in library of ${NMR.COMPOUNDS.length} common compounds and solvents, so they are a starting point, not an identification.</p></div>${sol}`;
}

function infoHTML(it) {
  const ds = it.ds, p = it.session.params, m = ds.meta || {};
  const rows = [
    ['Title', ds.title], ['File', ds.name], ['Format', ds.source], ['Nucleus', ds.nucleus],
    ['Frequency', ds.frequency ? ds.frequency.toFixed(4) + ' MHz' : ''], ['Solvent', ds.solvent],
    ['Pulse program', m.pulseSequence], ['Scans', m.scans], ['Temperature', m.temperature ? m.temperature + ' K' : ''],
    ['Date', m.date], ['Origin', m.origin || m.spectrometer || m.instrument],
    ['Data', p.fromFid ? `FID, ${ds.fid.re.length} complex points, SW ${ds.fid.sw.toFixed(1)} Hz` : 'Processed spectrum'],
    ['Phase', `PH0 ${(+p.ph0).toFixed(1)}°, PH1 ${(+p.ph1).toFixed(1)}° (pivot at centre)`],
    ['Reference shift', `${p.referenceShift.toFixed(3)} ppm`],
  ].filter((r) => r[1] !== undefined && r[1] !== '' && r[1] !== null);
  const refUI = state.refPick != null
    ? `<div class="formula"><span>Peak at <b class="mono">${state.refPick.toFixed(3)}</b> should be</span><input id="refValue" type="number" step="0.001" value="${suggestRef(it, state.refPick)}"><button class="btn small primary" id="applyRef" type="button">Set reference</button></div>`
    : '<p class="assign alt">Choose Reference in the toolbar, then click a peak (TMS or the solvent residual) to set its shift.</p>';
  const fidBtn = ds.fid && ds.rawReal ? `<button class="btn small" id="toggleFid" type="button">${p.fromFid ? 'Use vendor-processed spectrum' : 'Reprocess from FID'}</button>` : '';
  return `<div class="section"><h3>Referencing</h3>${refUI}${p.referenceShift ? '<button class="btn small" id="clearRef" type="button">Clear reference correction</button>' : ''}</div>
    <div class="section"><h3>Dataset</h3><dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${fidBtn}</div>`;
}

// ---------- Polymer tools ----------
function polyState(it) {
  if (!it.poly) {
    // Take the best-ranked library match that is one of the polymer presets.
    const key = (p) => p.name.toLowerCase().replace(/^poly\(?/, '').replace(/\)$/, '');
    let guess = null;
    for (const c of it.result.suggestions.compounds.slice(0, 3)) {
      guess = NMR.POLYMERS.find((p) => c.compound.name.toLowerCase().includes(key(p)));
      if (guess) break;
    }
    guess = guess || NMR.POLYMERS[0];
    // Reuse the end group chosen on the previous spectrum (same RAFT agent across a series).
    const e = state.lastEnd;
    it.poly = { polymer: guess.id, repeatSig: 'window', repeatH: guess.signal.nH, m0: +guess.m0.toFixed(2), end: e ? e.end : 'custom', endSig: e && e.window ? 'window' : '', endH: e ? e.endH : 1, endCount: e ? e.endCount : 1, endMass: e ? e.endMass : 0, comps: [] };
  }
  return it.poly;
}
const sigKey = (m) => m.ppm.toFixed(4);
function polySignals(it) { return it.result.analysis.multiplets.filter((m) => !m.excluded); }
function sigArea(it, key) {
  const m = polySignals(it).find((x) => sigKey(x) === key);
  return m ? { area: m.area, nH: m.nH, m } : null;
}
function sigOptions(it, sel, extra = '') {
  const list = polySignals(it).slice().sort((a, b) => b.ppm - a.ppm);
  return extra + '<option value="">— choose a signal —</option>' + list.map((m) => {
    const range = `${m.ppmFrom.toFixed(2)}–${m.ppmTo.toFixed(2)}`;
    return `<option value="${sigKey(m)}" ${sel === sigKey(m) ? 'selected' : ''}>δ ${m.ppm.toFixed(2)} (${range}) · ∫ ${(m.nH || 0).toFixed(2)}${m.manual ? ' · manual' : ''}</option>`;
  }).join('');
}
const fmt = (v, d = 2) => (v == null || !isFinite(v) ? '–' : v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));

function polymerCalc(it) {
  const P = polyState(it);
  const poly = NMR.POLYMERS.find((p) => p.id === P.polymer);
  const u = it.result.integralUnit || 1;
  let repeat = null;
  if (P.repeatSig === 'window' && poly) repeat = { area: NMR.repeatArea(it.result.spectrum, poly), nH: P.repeatH };
  else if (P.repeatSig) { const s = sigArea(it, P.repeatSig); if (s) repeat = { area: s.area, nH: P.repeatH }; }
  const preset = NMR.END_GROUPS.find((g) => g.id === P.end);
  let endArea = null;
  if (P.endSig === 'window' && preset && preset.window) endArea = NMR.windowArea(it.result.spectrum, preset.window[0], preset.window[1]);
  else if (P.endSig) { const e = sigArea(it, P.endSig); if (e) endArea = e.area; }
  const end = endArea != null ? { area: endArea, nH: P.endH, count: P.endCount } : null;
  const dp = NMR.degreeOfPolymerisation({ repeat, end, m0: P.m0, endMass: P.endMass });
  const comp = NMR.composition(P.comps.map((c) => { const s = sigArea(it, c.sig); return { name: c.name, area: s ? s.area : 0, nH: c.nH, m0: c.m0 }; }));
  return { P, poly, repeat, end, dp, comp, u, endPreset: preset };
}

function polymerHTML(it) {
  if (!/1H/.test(it.ds.nucleus)) return '<p class="assign alt">Polymer tools use ¹H integrals. Open a ¹H spectrum.</p>';
  const { P, poly, repeat, end, dp, comp, u, endPreset } = polymerCalc(it);
  const micro = poly && poly.micro ? NMR.microstructure(it.result.spectrum, poly.micro) : null;
  const repeatInt = repeat ? repeat.area / u : null;
  const summary = dp ? `DP(¹H NMR) = ${fmt(dp.dp, 1)}${dp.mn ? `, Mn(NMR) = ${Math.round(dp.mn).toLocaleString('en-US')} g/mol` : ''} (${poly ? poly.name : 'repeat unit'}, M₀ = ${fmt(P.m0)} g/mol; end group ${endPreset ? endPreset.name : ''}, ${P.endH}H)` : '';
  let out = `<div class="section"><h3>Repeat unit</h3><div class="poly">
    <div class="row"><label for="pPoly">Polymer</label><select id="pPoly">${NMR.POLYMERS.map((p) => `<option value="${p.id}" ${p.id === P.polymer ? 'selected' : ''}>${esc(p.name)} (${esc(p.unit)})</option>`).join('')}<option value="custom" ${P.polymer === 'custom' ? 'selected' : ''}>Custom repeat unit</option></select></div>
    <div class="row"><label for="pRep">Counting signal</label><select id="pRep">${sigOptions(it, P.repeatSig, poly ? `<option value="window" ${P.repeatSig === 'window' ? 'selected' : ''}>Standard window: ${esc(poly.signal.label)}, δ ${poly.signal.from}–${poly.signal.to}</option>` : '')}</select></div>
    <div class="row"><label>H per unit · M₀ (g/mol)</label><div class="pair"><input id="pRepH" type="number" min="0.1" step="any" value="${P.repeatH}" aria-label="Protons per repeat unit"><input id="pM0" type="number" min="0" step="any" value="${P.m0}" aria-label="Repeat unit mass"></div></div>
    ${repeatInt != null ? `<p class="assign alt">Integral of counting signal: <b class="mono">${fmt(repeatInt)}</b> on the current scale.</p>` : ''}
  </div></div>
  <div class="section"><h3>End group</h3><div class="poly">
    <div class="row"><label for="pEnd">Type</label><select id="pEnd">${NMR.END_GROUPS.map((g) => `<option value="${g.id}" ${g.id === P.end ? 'selected' : ''}>${esc(g.name)}${g.ppm ? ' · ' + esc(g.ppm) : ''}</option>`).join('')}</select></div>
    <div class="row"><label for="pEndSig">Its signal</label><select id="pEndSig">${sigOptions(it, P.endSig, endPreset && endPreset.window ? `<option value="window" ${P.endSig === 'window' ? 'selected' : ''}>Standard window: δ ${endPreset.window[0]}–${endPreset.window[1]} (local baseline)</option>` : '')}</select></div>
    ${end ? `<p class="assign alt">End-group integral: <b class="mono">${fmt(end.area / u, 3)}</b> on the current scale.</p>` : ''}
    ${endPreset && endPreset.note ? `<p class="assign alt">${esc(endPreset.note)}</p>` : ''}
    <div class="row"><label>H in signal · ends/chain</label><div class="pair"><input id="pEndH" type="number" min="0.1" step="any" value="${P.endH}" aria-label="Protons in end-group signal"><input id="pEndN" type="number" min="1" step="1" value="${P.endCount}" aria-label="End groups per chain"></div></div>
    <div class="row"><label for="pEndM">End-group mass, both ends (g/mol)</label><input id="pEndM" type="number" min="0" step="any" value="${P.endMass}"></div>
    <p class="assign alt">End-group signals are usually small. If yours is not in the list, choose <b>Integrate</b> in the toolbar and drag across it.</p>
  </div></div>`;
  out += `<div class="section"><h3>Degree of polymerisation</h3>${dp ? `<div class="result">
      <span class="sub">DP<sub>n</sub> (number-average repeat units per chain)</span><span class="big">${fmt(dp.dp, 1)}</span>
      ${dp.mn ? `<span class="sub">M<sub>n</sub> = DP × M₀ + M<sub>end</sub> = ${fmt(dp.dp, 1)} × ${fmt(P.m0)} + ${fmt(P.endMass)}</span><span class="big">${Math.round(dp.mn).toLocaleString('en-US')} g/mol</span>` : ''}
      <span class="sub">(∫repeat / ${P.repeatH}H) ÷ (∫end / ${P.endH * P.endCount}H)</span>
      <button class="btn small" id="copyPoly" type="button" style="justify-self:start">Copy result</button>
    </div>` : '<p class="assign alt">Choose a counting signal and an end-group signal to get DP and Mn.</p>'}</div>`;
  if (micro) {
    out += `<div class="section"><h3>Microstructure</h3>${micro.rows.map((r) => `<div style="display:grid;gap:3px;margin-bottom:6px"><div style="display:flex;justify-content:space-between"><span>${esc(r.label)} <span class="alt">${esc(r.how)}</span></span><b class="mono">${fmt(r.pct, 1)}%</b></div><div class="pctbar"><i style="width:${Math.min(100, r.pct)}%"></i></div></div>`).join('')}
      ${micro.cisTrans ? `<p class="assign">1,4 cis : trans ≈ <b class="mono">${fmt(micro.cisTrans.cis, 0)} : ${fmt(micro.cisTrans.trans, 0)}</b></p>` : ''}
      <p class="assign alt">${esc(micro.note)}</p></div>`;
  }
  out += `<div class="section"><h3>Copolymer composition</h3>
    ${P.comps.map((c, i) => `<div class="comp-row poly" style="margin-bottom:4px">
      <input data-c="${i}" data-f="name" type="text" value="${esc(c.name)}" aria-label="Monomer name">
      <select data-c="${i}" data-f="sig" aria-label="Signal">${sigOptions(it, c.sig)}</select>
      <input data-c="${i}" data-f="nH" type="number" min="0.1" step="any" value="${c.nH}" aria-label="H per unit" title="H per unit">
      <input data-c="${i}" data-f="m0" type="number" min="0" step="any" value="${c.m0}" aria-label="Unit mass" title="Unit mass (g/mol)">
      <button class="x" data-crm="${i}" type="button" aria-label="Remove">×</button></div>`).join('')}
    <div class="formula"><select id="pAddMon" aria-label="Add monomer"><option value="">Add a monomer…</option>${NMR.POLYMERS.map((p) => `<option value="${p.id}">${esc(p.name.replace(/^Poly\(?|\)$/g, ''))}</option>`).join('')}<option value="custom">Custom</option></select></div>
    ${comp.length >= 2 ? `<table class="sig" style="margin-top:8px"><thead><tr><th>Unit</th><th>mol %</th><th>wt %</th></tr></thead><tbody>${comp.map((c) => `<tr><td>${esc(c.name)}</td><td class="mono">${fmt(c.molPct, 1)}</td><td class="mono">${c.wtPct == null ? '–' : fmt(c.wtPct, 1)}</td></tr>`).join('')}</tbody></table>` : '<p class="assign alt">Add two or more monomers, each with a signal that belongs only to it, to get mole and weight fractions.</p>'}
  </div>`;
  state.polySummary = summary;
  return out;
}

function bindPolymer(it) {
  const P = polyState(it);
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const redraw = () => renderTab();
  on('pPoly', 'change', (e) => {
    P.polymer = e.target.value;
    const p = NMR.POLYMERS.find((x) => x.id === P.polymer);
    if (p) { P.repeatH = p.signal.nH; P.m0 = +p.m0.toFixed(2); P.repeatSig = 'window'; } else if (P.repeatSig === 'window') P.repeatSig = '';
    redraw();
  });
  on('pRep', 'change', (e) => { P.repeatSig = e.target.value; redraw(); });
  on('pRepH', 'change', (e) => { P.repeatH = +e.target.value || 1; redraw(); });
  on('pM0', 'change', (e) => { P.m0 = +e.target.value || 0; redraw(); });
  on('pEnd', 'change', (e) => {
    P.end = e.target.value;
    const g = NMR.END_GROUPS.find((x) => x.id === P.end);
    if (g && g.id !== 'custom') { P.endH = g.nH; P.endMass = +g.mass.toFixed(2); P.endCount = 1; }
    P.endSig = g && g.window ? 'window' : '';
    state.lastEnd = { end: P.end, endH: P.endH, endCount: P.endCount, endMass: P.endMass, window: !!(g && g.window) };
    redraw();
  });
  on('pEndSig', 'change', (e) => { P.endSig = e.target.value; redraw(); });
  on('pEndH', 'change', (e) => { P.endH = +e.target.value || 1; redraw(); });
  on('pEndN', 'change', (e) => { P.endCount = Math.max(1, Math.round(+e.target.value || 1)); redraw(); });
  on('pEndM', 'change', (e) => { P.endMass = +e.target.value || 0; redraw(); });
  on('pAddMon', 'change', (e) => {
    const p = NMR.POLYMERS.find((x) => x.id === e.target.value);
    const sig = p ? polySignals(it).find((m) => m.ppm <= p.signal.from && m.ppm >= p.signal.to) : null;
    P.comps.push(p ? { name: p.name.replace(/^Poly\(?|\)$/g, ''), sig: sig ? sigKey(sig) : '', nH: p.signal.nH, m0: +p.m0.toFixed(2) } : { name: 'Monomer', sig: '', nH: 1, m0: 100 });
    redraw();
  });
  for (const el of $('tabbody').querySelectorAll('[data-c]')) el.addEventListener('change', () => {
    const c = P.comps[+el.dataset.c], f = el.dataset.f;
    c[f] = f === 'name' || f === 'sig' ? el.value : +el.value || 0;
    redraw();
  });
  for (const b of $('tabbody').querySelectorAll('[data-crm]')) b.addEventListener('click', () => { P.comps.splice(+b.dataset.crm, 1); redraw(); });
  on('copyPoly', 'click', () => {
    const t = state.polySummary;
    try { navigator.clipboard.writeText(t).then(() => toast('Result copied'), () => toast(t)); } catch (e) { toast(t); }
  });
  // Highlight the chosen signals on the spectrum.
  const hl = [P.repeatSig !== 'window' && P.repeatSig, P.endSig].filter(Boolean).map((k) => sigArea(it, k)).filter(Boolean);
  viewer.highlight = hl.length ? hl[hl.length - 1].m : null; viewer.draw();
}

function suggestRef(it, ppm) {
  const sol = NMR.findSolvent(it.ds.solvent);
  const refs = [0, ...(sol ? (/13C/.test(it.ds.nucleus) ? sol.c : sol.h) : [])];
  const best = refs.reduce((b, v) => (Math.abs(v - ppm) < Math.abs(b - ppm) ? v : b), refs[0]);
  return Math.abs(best - ppm) < (/13C/.test(it.ds.nucleus) ? 3 : 0.3) ? best : ppm.toFixed(3);
}

function lookupHTML() {
  const it = cur();
  const nucleus = it ? (/13C/.test(it.ds.nucleus) ? '13C' : '1H') : '1H';
  const res = NMR.searchReference(state.query);
  const sigs = it ? it.result.analysis.multiplets.filter((m) => !m.minor && !m.excluded) : [];
  const chips = ['O', 'N', 'Cl', 'Br', 'F', 'S', 'P', 'Si', 'carbonyl', 'ester', 'aldehyde', 'aromatic', 'alkene', 'amide', 'methoxy', 'acid'];
  let out = `<div class="section"><div class="search"><input id="q" type="search" placeholder="Element (Cl, oxygen), group (ester) or shift (3.7)" value="${esc(state.query)}" aria-label="Search shift data"></div>
    <div class="chips">${chips.map((c) => `<button data-q="${c}" type="button">${c}</button>`).join('')}</div></div>`;
  if (!state.query) {
    out += `<p class="assign alt">Search an element or functional group to see where its ¹H and ¹³C signals fall. Tap a result to shade its range on the spectrum and see which of your peaks fall inside.</p>`;
    out += refTables();
    return out;
  }
  if (res.element) {
    const e = res.element;
    out += `<div class="section"><div class="elcard"><span class="elsym">${esc(e.symbol)}</span><b>${esc(e.name)}</b><span class="alt">NMR-active isotopes</span>
      <table><tr><th>Isotope</th><th>Spin</th><th>Abund. %</th><th>ν at 400 MHz ¹H</th></tr>${e.isotopes.map((i) => `<tr><td>${esc(i.iso)}</td><td>${esc(i.spin)}</td><td>${i.abundance}</td><td>${(i.freq * 4).toFixed(1)} MHz</td></tr>`).join('')}</table>
      <p>${esc(e.note)}</p></div></div>`;
  }
  const groups = res.groups.slice().sort((a, b) => (a.nucleus === nucleus ? -1 : 1) - (b.nucleus === nucleus ? -1 : 1) || a.min - b.min);
  if (groups.length) {
    out += `<div class="section"><h3>${groups.length} shift ranges</h3>`;
    for (const g of groups) {
      const span = g.nucleus === '13C' ? [-10, 230] : [-0.5, 16.5];
      const l = ((g.min - span[0]) / (span[1] - span[0])) * 100, w = ((g.max - g.min) / (span[1] - span[0])) * 100;
      const t = ((g.typical - span[0]) / (span[1] - span[0])) * 100;
      const hits = g.nucleus === nucleus ? sigs.filter((m) => m.ppm >= g.min && m.ppm <= g.max) : null;
      const hitTxt = hits === null ? '' : hits.length ? `<div class="hits">In your spectrum: ${hits.map((m) => m.ppm.toFixed(nucleus === '13C' ? 1 : 2) + (nucleus === '1H' ? ` (${m.multiplicity}, ${Math.round(m.nH || 0)}H)` : '')).join(', ')}</div>` : '<div class="hits none">No peaks of yours in this range</div>';
      out += `<div class="grp ${state.bands.has(g.id) ? 'on' : ''}" data-g="${g.id}" role="button" tabindex="0">
        <span><span class="nucsmall">${g.nucleus === '13C' ? '¹³C' : '¹H'}</span> ${esc(g.name)}</span><span class="rng">${g.min}–${g.max} ppm</span>
        <span class="scale" style="direction:rtl"><i style="right:${l}%;width:${Math.max(w, 0.8)}%"></i><b style="right:${t}%"></b></span>
        ${g.note ? `<span class="note">${esc(g.note)}</span>` : ''}${hitTxt}
      </div>`;
    }
    out += '</div>';
  }
  if (res.compounds.length) {
    out += `<div class="section"><h3>Reference compounds containing it</h3>${res.compounds.map((c) => `<div class="hint"><b>${esc(c.name)}</b> <span class="alt mono">${esc(c.formula)}</span><div>¹H ${c.h.map((h) => `${h[0]} (${h[1]}, ${h[2]}H)`).join(', ')}<br>¹³C ${c.c.join(', ')}</div></div>`).join('')}</div>`;
  }
  if (!groups.length && !res.element && !res.compounds.length) out += '<p class="assign alt">Nothing found. Try an element symbol like Cl, a group like ketone, or a shift like 4.1.</p>';
  return out;
}

function refTables() {
  return `<details class="section"><summary>Solvent residual peaks</summary><table>${NMR.SOLVENTS.map((s) => `<tr><td>${esc(s.id)}</td><td class="mono">${s.h.join(', ')}</td><td class="mono">${s.c.join(', ')}</td><td class="mono">H₂O ${s.water}</td></tr>`).join('')}</table></details>
    <details class="section"><summary>Common impurities in CDCl₃</summary><table>${NMR.IMPURITIES.filter((i) => i.CDCl3).map((i) => `<tr><td>${esc(i.name)}</td><td class="mono">${(i.CDCl3.h || []).join(', ')}</td><td class="mono">${(i.CDCl3.c || []).join(', ')}</td></tr>`).join('')}</table></details>
    <details class="section"><summary>Typical coupling constants</summary><table>${NMR.COUPLINGS.map((c) => `<tr><td>${esc(c.name)}</td><td class="mono">${esc(c.range)}</td></tr>`).join('')}</table></details>`;
}

function bindLookup() {
  const q = $('q');
  q.addEventListener('input', () => { state.query = q.value; const pos = q.selectionStart; renderTab(); const n = $('q'); n.focus(); n.setSelectionRange(pos, pos); });
  for (const b of $('tabbody').querySelectorAll('[data-q]')) b.addEventListener('click', () => { state.query = b.dataset.q; state.bands.clear(); renderTab(); });
  for (const g of $('tabbody').querySelectorAll('[data-g]')) {
    const toggle = () => {
      const id = g.dataset.g;
      state.bands.has(id) ? state.bands.delete(id) : state.bands.add(id);
      updateBands(); renderTab();
      const grp = NMR.SHIFT_GROUPS.find((x) => x.id === id);
      const it = cur();
      if (state.bands.has(id) && it && grp.nucleus === (/13C/.test(it.ds.nucleus) ? '13C' : '1H')) {
        const pad = grp.nucleus === '13C' ? 8 : 0.4;
        const s = it.result.spectrum;
        viewer.zoomTo(Math.min(s.ppmStart, Math.max(viewer.view.hi, grp.max + pad)), Math.max(s.ppmEnd, Math.min(viewer.view.lo, grp.min - pad)));
      }
    };
    g.addEventListener('click', toggle);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  }
}

function updateBands() {
  const it = cur();
  const nucleus = it ? (/13C/.test(it.ds.nucleus) ? '13C' : '1H') : null;
  viewer.bands = NMR.SHIFT_GROUPS.filter((g) => state.bands.has(g.id) && g.nucleus === nucleus).map((g) => ({ min: g.min, max: g.max, label: g.name }));
  viewer.draw();
}

function bindTab(it) {
  const body = $('tabbody');
  if (state.tab === 'signals') {
    const sigs = visibleSignals(it);
    for (const tr of body.querySelectorAll('tr[data-k]')) {
      const m = sigs[+tr.dataset.k];
      tr.addEventListener('mouseenter', () => { viewer.highlight = m; viewer.draw(); });
      tr.addEventListener('mouseleave', () => { viewer.highlight = state.hoverSig; viewer.draw(); });
      tr.addEventListener('click', (e) => {
        if (e.target.closest('[data-ex],[data-rm],[data-nh]')) return;
        const w = Math.max(m.ppmFrom - m.ppmTo, /13C/.test(it.ds.nucleus) ? 1 : 0.05);
        state.hoverSig = m; viewer.highlight = m;
        viewer.zoomTo(m.ppmFrom + w * 1.2, m.ppmTo - w * 1.2);
        for (const r of body.querySelectorAll('tr')) r.classList.toggle('hl', r === tr);
      });
    }
    for (const b of body.querySelectorAll('[data-ex]')) b.addEventListener('click', () => {
      const m = sigs[+b.dataset.ex];
      const ex = it.session.params.excluded;
      const k = ex.findIndex((e) => Math.abs(e - m.ppm) < 0.005);
      k >= 0 ? ex.splice(k, 1) : ex.push(m.ppm);
      rerun();
    });
    const f = $('formula');
    if (f) f.addEventListener('change', () => { it.session.params.formula = f.value.trim(); rerun(); });
    for (const inp of body.querySelectorAll('[data-nh]')) inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      const m = sigs[+inp.dataset.nh];
      it.session.params.integralRef = v > 0 ? { ppm: m.ppm, value: v } : null;
      rerun(); toast(v > 0 ? `Integral at ${m.ppm.toFixed(2)} ppm set to ${v}` : 'Normalisation reset');
    });
    for (const b of body.querySelectorAll('[data-rm]')) b.addEventListener('click', () => {
      const m = sigs[+b.dataset.rm];
      const mr = it.session.params.manualRegions;
      const k = mr.findIndex(([a, c]) => Math.abs(Math.max(a, c) - m.ppmFrom) < 1e-6 && Math.abs(Math.min(a, c) - m.ppmTo) < 1e-6);
      if (k >= 0) mr.splice(k, 1);
      rerun();
    });
    const tm = $('toggleMinor');
    if (tm) tm.addEventListener('click', () => { state.showMinor = !state.showMinor; renderTab(); });
    const cn = $('clearNorm');
    if (cn) cn.addEventListener('click', () => { it.session.params.integralRef = null; rerun(); });
    const cm = $('clearManual');
    if (cm) cm.addEventListener('click', () => { it.session.params.manualRegions = []; rerun(); });
  }
  if (state.tab === 'suggest') {
    for (const b of body.querySelectorAll('[data-cmp]')) b.addEventListener('click', () => {
      const c = it.result.suggestions.compounds[+b.dataset.cmp].compound;
      if (state.compound === c.name) { state.compound = null; viewer.sticks = []; }
      else {
        state.compound = c.name;
        const is13 = /13C/.test(it.ds.nucleus);
        viewer.sticks = is13 ? c.c.map((ppm) => ({ ppm, h: 0.8 })) : c.h.map(([ppm, , nH]) => ({ ppm, h: 0.25 + 0.12 * nH }));
      }
      viewer.draw(); renderTab();
    });
  }
  if (state.tab === 'polymer') bindPolymer(it);
  if (state.tab === 'info') {
    const ap = $('applyRef');
    if (ap) ap.addEventListener('click', () => {
      const v = parseFloat($('refValue').value);
      if (isNaN(v)) return;
      it.session.params.referenceShift += v - state.refPick;
      state.refPick = null; setMode('zoom'); rerun(); toast('Reference set');
    });
    const cr = $('clearRef');
    if (cr) cr.addEventListener('click', () => { it.session.params.referenceShift = 0; rerun(); });
    const tf = $('toggleFid');
    if (tf) tf.addEventListener('click', () => {
      const p = it.session.params;
      p.fromFid = !p.fromFid; p.autoPhase = p.fromFid; if (!p.fromFid) { p.ph0 = 0; p.ph1 = 0; }
      rerun(false);
    });
  }
}

function setMode(m) {
  viewer.mode = m;
  for (const b of document.querySelectorAll('[data-mode]')) b.classList.toggle('on', b.dataset.mode === m);
  $('modehint').textContent = m === 'integrate' ? 'Drag across a signal to add an integral region' : m === 'reference' ? 'Click the peak you want to reference (TMS or solvent residual)' : 'Drag to zoom · shift-drag to pan · scroll for intensity · ctrl-scroll or pinch to zoom · double-click to fit';
}

// ---------- Controls ----------
for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode));
$('zoomOut').addEventListener('click', () => viewer.zoomBy(2));
$('resetView').addEventListener('click', () => viewer.reset());
$('ph0').addEventListener('input', (e) => { $('ph0v').textContent = (+e.target.value).toFixed(1) + '°'; set({ ph0: +e.target.value }); });
$('ph1').addEventListener('input', (e) => { $('ph1v').textContent = (+e.target.value).toFixed(0) + '°'; set({ ph1: +e.target.value }); });
$('autoPhase').addEventListener('click', () => set({ autoPhase: true }));
$('lb').addEventListener('change', (e) => set({ lb: Math.max(0, +e.target.value || 0) }));
$('snr').addEventListener('input', (e) => { $('snrv').textContent = e.target.value; set({ snr: +e.target.value }); });
$('baseline').addEventListener('click', () => { const it = cur(); if (it) set({ baseline: !it.session.params.baseline }); });
$('reverse').addEventListener('click', () => { const it = cur(); if (it) set({ reverse: !it.session.params.reverse, autoPhase: true }); });
$('labels').addEventListener('click', () => { viewer.showLabels = !viewer.showLabels; syncControls(); viewer.draw(); });
$('curves').addEventListener('click', () => { viewer.showCurves = !viewer.showCurves; syncControls(); viewer.draw(); });
$('copyReport').addEventListener('click', () => {
  const t = $('report').textContent;
  const done = () => toast('Report copied');
  try {
    navigator.clipboard.writeText(t).then(done, () => { selectText($('report')); toast('Press ⌘C to copy'); });
  } catch (e) { selectText($('report')); toast('Press ⌘C to copy'); }
});
function selectText(el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
$('libList').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) choose(+b.dataset.i); });

// ---------- File input ----------
async function readFileList(list) {
  const map = new Map();
  for (const f of list) map.set(f.webkitRelativePath || f.name, new Uint8Array(await f.arrayBuffer()));
  return map;
}
$('openBtn').addEventListener('click', () => $('fileInput').click());
$('openDir').addEventListener('click', () => $('dirInput').click());
$('fileInput').addEventListener('change', async (e) => { await addFiles(await readFileList(e.target.files)); e.target.value = ''; });
$('dirInput').addEventListener('change', async (e) => { await addFiles(await readFileList(e.target.files)); e.target.value = ''; });

const app = $('app');
window.addEventListener('dragover', (e) => { e.preventDefault(); app.classList.add('dragover'); });
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) app.classList.remove('dragover'); });
window.addEventListener('drop', async (e) => {
  e.preventDefault(); app.classList.remove('dragover');
  const map = new Map();
  const items = [...(e.dataTransfer.items || [])].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (items.length) { for (const en of items) await walkEntry(en, '', map); }
  else for (const f of e.dataTransfer.files) map.set(f.name, new Uint8Array(await f.arrayBuffer()));
  if (map.size) addFiles(map);
});
function walkEntry(entry, prefix, map) {
  return new Promise((resolve) => {
    if (entry.isFile) entry.file(async (f) => { map.set(prefix + entry.name, new Uint8Array(await f.arrayBuffer())); resolve(); }, resolve);
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];
      const next = () => reader.readEntries(async (ents) => {
        if (!ents.length) { for (const en of all) await walkEntry(en, prefix + entry.name + '/', map); resolve(); }
        else { all.push(...ents); next(); }
      }, resolve);
      next();
    } else resolve();
  });
}

// ---------- Samples ----------
$('samples').innerHTML = SAMPLES.map((s, i) => `<button data-s="${i}" type="button">${esc(s.label)}</button>`).join('');
$('samples').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) loadSample(SAMPLES[+b.dataset.s]); });
async function loadSample(s, select = true) {
  setStatus('Loading example…');
  try {
    const res = await fetch(s.file);
    if (!res.ok) throw new Error('Example file is missing');
    let name = s.file.split('/').pop();
    let bytes;
    // Archives are shipped base64-encoded so any static host will serve them.
    if (name.endsWith('.b64.txt')) {
      const bin = atob((await res.text()).trim());
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      name = name.replace(/\.b64\.txt$/, '');
    } else bytes = new Uint8Array(await res.arrayBuffer());
    await addFiles(new Map([[name, bytes]]), select);
    const it = state.items[state.items.length - 1];
    if (it) it.ds.title = s.label.split(' · ')[0];
    renderLibrary();
  } catch (e) { setStatus('Example not available'); toast(e.message); }
}

setTab(state.tab);
(async () => {
  await loadSample(SAMPLES[0]);
  await loadSample(SAMPLES[1], false);
})();
