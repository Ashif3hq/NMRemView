import * as NMR from './core/index.js';
import { SpectrumViewer } from './viewer.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SAMPLES = [
  { file: 'samples/ibuprofen-1h.zip.b64.txt', label: 'Ibuprofen ¹H · Bruker FID, 600 MHz' },
  { file: 'samples/ibuprofen-13c.zip.b64.txt', label: 'Ibuprofen ¹³C · Bruker FID, 151 MHz' },
  { file: 'samples/aspirin-1h.zip.b64.txt', label: 'Aspirin ¹H · Bruker FID, 300 MHz' },
  { file: 'samples/strychnine-1h.zip.b64.txt', label: 'Strychnine ¹H · Bruker, 400 MHz' },
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
  bindTab(it);
}

function fmtJ(J) { return J.length ? J.map((j) => j.toFixed(1)).join(', ') : ''; }

function signalsHTML(it) {
  const r = it.result;
  const is13 = /13C/.test(it.ds.nucleus);
  const sigs = r.analysis.multiplets.filter((m) => !m.minor || m.manual);
  const minor = r.analysis.multiplets.length - sigs.length;
  const rows = sigs.map((m, k) => {
    const c = m.candidates || [];
    const top = c[0] ? esc(c[0].group.name) : '<span class="alt">no match in table</span>';
    const alt = c.slice(1, 3).map((x) => esc(x.group.name)).join(' · ');
    const flag = m.flag ? `<div><span class="flag ${m.flag.kind}">${esc(m.flag.label)}</span></div>` : '';
    const shift = !is13 && m.multiplicity === 'm' ? `${m.ppmFrom.toFixed(2)}–${m.ppmTo.toFixed(2)}` : m.ppm.toFixed(is13 ? 1 : 2);
    return `<tr data-k="${k}" class="${m.excluded || (m.flag && m.flag.kind === 'solvent') ? 'muted' : ''} ${state.hoverSig && Math.abs(state.hoverSig.ppm - m.ppm) < 1e-6 ? 'hl' : ''}">
      <td class="mono">${shift}</td>
      ${is13 ? '' : `<td class="mult">${esc(m.multiplicity)}</td><td class="mono">${fmtJ(m.J)}</td><td class="mono">${m.excluded ? '–' : (m.nH || 0).toFixed(2)}</td>`}
      <td class="assign">${top}${alt ? `<div class="alt">${alt}</div>` : ''}${flag}</td>
      <td><button class="x" data-ex="${k}" type="button" title="${m.excluded ? 'Include' : 'Exclude from report and integrals'}" aria-label="Toggle signal">${m.excluded ? '↺' : '×'}</button></td>
    </tr>`;
  }).join('');
  const head = is13 ? '<th>δ ppm</th><th>Likely environment</th><th></th>' : '<th>δ ppm</th><th>Mult.</th><th>J (Hz)</th><th>nH</th><th>Likely environment</th><th></th>';
  const formula = is13 ? '' : `<div class="formula" style="margin-bottom:10px">
      <label for="formula" class="alt">Formula</label><input id="formula" type="text" placeholder="e.g. C13H18O2" value="${esc(it.session.params.formula)}">
      ${r.formula ? `<span class="mono">DBE ${r.formula.dbe} · ${r.formula.mw.toFixed(2)} g/mol · ${r.formula.totalH} H</span>` : '<span class="alt">sets the total H for integrals</span>'}
      ${it.session.params.manualRegions.length ? '<button class="btn small" id="clearManual" type="button">Clear manual integrals</button>' : ''}
    </div>`;
  return `${formula}<table class="sig"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    <p class="assign alt" style="margin-top:10px">${sigs.length} signals${minor ? `, ${minor} minor peaks hidden (satellites, impurities)` : ''}. Click a row to zoom to it.</p>`;
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
    const sigs = it.result.analysis.multiplets.filter((m) => !m.minor || m.manual);
    for (const tr of body.querySelectorAll('tr[data-k]')) {
      const m = sigs[+tr.dataset.k];
      tr.addEventListener('mouseenter', () => { viewer.highlight = m; viewer.draw(); });
      tr.addEventListener('mouseleave', () => { viewer.highlight = state.hoverSig; viewer.draw(); });
      tr.addEventListener('click', (e) => {
        if (e.target.closest('[data-ex]')) return;
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
