// Canvas spectrum viewer: reversed ppm axis, peak labels with leaders, integral
// brackets and curves, reference-range bands, compound stick overlays, zoom/pan.

export class SpectrumViewer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onHover = opts.onHover || (() => {});
    this.onRange = opts.onRange || (() => {});
    this.onClickPpm = opts.onClickPpm || (() => {});
    this.onContext = opts.onContext || (() => {});
    this.mode = 'zoom';
    this.result = null;
    this.bands = [];
    this.sticks = [];
    this.highlight = null;
    this.showLabels = true;
    this.showCurves = true;
    this.yScale = 1;
    this.view = null;
    this.drag = null;
    this.hoverPpm = null;
    this.annotations = [];
    this.picks = [];
    this._boxes = [];
    this._bind();
    new ResizeObserver(() => this.draw()).observe(canvas.parentElement);
  }

  setResult(result, keepView) {
    const prev = this.result;
    this.result = result;
    const s = result.spectrum;
    if (!keepView || !this.view || !prev || prev.spectrum.id !== s.id) {
      this.view = this.defaultView(result);
      this.yScale = 1;
    }
    this.draw();
  }

  defaultView(result) {
    const s = result.spectrum;
    const peaks = result.analysis.peaks;
    // Open on the region that contains signals, like a chemist would plot it.
    const is13 = /13C/.test(s.nucleus);
    let hi = is13 ? 220 : 12, lo = is13 ? -5 : -0.5;
    if (peaks.length) {
      const maxP = Math.max(...peaks.map((p) => p.ppm)), minP = Math.min(...peaks.map((p) => p.ppm));
      hi = Math.min(Math.max(hi, maxP + (is13 ? 10 : 0.5)), s.ppmStart);
      lo = Math.max(Math.min(lo, minP - (is13 ? 5 : 0.3)), s.ppmEnd);
    }
    return { hi: Math.min(hi, s.ppmStart), lo: Math.max(lo, s.ppmEnd) };
  }

  setMode(m) {
    this.mode = m;
    const cursors = { pan: 'grab', label: 'text', note: 'text', peakDel: 'pointer', setint: 'pointer', reference: 'pointer' };
    this.canvas.style.cursor = cursors[m] || 'crosshair';
  }

  // Annotation under a canvas point (labels and notes are hit-tested by their drawn box).
  annotationAt(x, y) {
    return this._boxes.find((b) => x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4) || null;
  }

  reset() { if (this.result) { this.view = this.defaultView(this.result); this.yScale = 1; this.draw(); } }
  zoomTo(hi, lo) { this.view = { hi, lo }; this.draw(); }
  zoomBy(f) {
    if (!this.view) return;
    const c = (this.view.hi + this.view.lo) / 2, w = (this.view.hi - this.view.lo) * f / 2;
    const s = this.result.spectrum;
    this.view = { hi: Math.min(s.ppmStart, c + w), lo: Math.max(s.ppmEnd, c - w) };
    this.draw();
  }

  colors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    return {
      trace: g('--trace'), axis: g('--muted'), grid: g('--grid'), text: g('--fg'), muted: g('--muted'),
      integral: g('--integral'), band: g('--band'), bandText: g('--band-ink'), hl: g('--hl'),
      stick: g('--stick'), bg: g('--plot'), solvent: g('--solvent'), select: g('--select'),
      accent: g('--accent'), note: g('--note'), surface: g('--surface'),
    };
  }

  layout() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(200, r.width), h = Math.max(220, r.height);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    }
    const labels = this.showLabels ? Math.min(78, h * 0.22) : 12;
    return { w, h, dpr, left: 12, right: w - 12, top: labels + 6, labelTop: 4, bottom: h - 72, axisY: h - 72 };
  }

  xOf(ppm, L) { return L.left + ((this.view.hi - ppm) / (this.view.hi - this.view.lo)) * (L.right - L.left); }
  ppmOf(x, L) { return this.view.hi - ((x - L.left) / (L.right - L.left)) * (this.view.hi - this.view.lo); }

  draw() {
    const ctx = this.ctx;
    const L = this.layout();
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    const C = this.colors();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, L.w, L.h);
    if (!this.result) return;
    const s = this.result.spectrum;
    const y = s.real;
    const n = y.length;
    const step = (s.ppmEnd - s.ppmStart) / (n - 1);
    const idx = (ppm) => (ppm - s.ppmStart) / step;
    const i0 = Math.max(0, Math.floor(idx(this.view.hi))), i1 = Math.min(n - 1, Math.ceil(idx(this.view.lo)));

    // Vertical scale: tallest visible point (ignoring solvent) fills the plot.
    let vmax = 0;
    const solv = (this.result.analysis.multiplets || []).filter((m) => m.flag && m.flag.kind === 'solvent');
    for (let i = i0; i <= i1; i++) {
      const p = s.ppmStart + i * step;
      if (y[i] > vmax && !solv.some((m) => p <= m.ppmFrom && p >= m.ppmTo)) vmax = y[i];
    }
    if (!vmax) for (let i = i0; i <= i1; i++) vmax = Math.max(vmax, y[i]);
    vmax = (vmax || 1) / this.yScale;
    const plotH = L.axisY - L.top;
    const base = L.axisY - 6;
    const yOf = (v) => base - (v / vmax) * (plotH - 10);
    this._yOf = yOf; this._L = L;

    // Bands from reference search
    ctx.font = '600 10px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-ui');
    for (const b of this.bands) {
      const x1 = this.xOf(b.max, L), x2 = this.xOf(b.min, L);
      if (x2 < L.left || x1 > L.right) continue;
      ctx.fillStyle = C.band;
      ctx.fillRect(Math.max(L.left, x1), L.top, Math.min(L.right, x2) - Math.max(L.left, x1), L.axisY - L.top);
      ctx.save();
      ctx.fillStyle = C.bandText;
      ctx.translate(Math.max(L.left, x1) + 11, L.top + 4);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(b.label.slice(0, 40), 0, 0);
      ctx.restore();
    }

    // Grid + axis
    const ticks = niceTicks(this.view.lo, this.view.hi, Math.max(4, Math.floor((L.right - L.left) / 70)));
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const t of ticks.major) { const x = Math.round(this.xOf(t, L)) + 0.5; ctx.moveTo(x, L.top); ctx.lineTo(x, L.axisY); }
    ctx.stroke();
    ctx.strokeStyle = C.axis;
    ctx.beginPath(); ctx.moveTo(L.left, L.axisY + 0.5); ctx.lineTo(L.right, L.axisY + 0.5);
    for (const t of ticks.minor) { const x = Math.round(this.xOf(t, L)) + 0.5; ctx.moveTo(x, L.axisY); ctx.lineTo(x, L.axisY + 3); }
    for (const t of ticks.major) { const x = Math.round(this.xOf(t, L)) + 0.5; ctx.moveTo(x, L.axisY); ctx.lineTo(x, L.axisY + 6); }
    ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.font = '11px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-mono');
    ctx.textAlign = 'center';
    for (const t of ticks.major) ctx.fillText(t.toFixed(ticks.decimals), this.xOf(t, L), L.axisY + 18);
    ctx.textAlign = 'right';
    ctx.fillText('ppm', L.right, L.axisY + 18 + 12);

    // Highlighted multiplet
    const hl = this.highlight;
    if (hl) {
      ctx.fillStyle = C.hl;
      const x1 = this.xOf(hl.ppmFrom, L), x2 = this.xOf(hl.ppmTo, L);
      ctx.fillRect(x1, L.top, x2 - x1, L.axisY - L.top);
    }

    // Trace: min/max decimation per pixel column.
    ctx.save();
    ctx.beginPath(); ctx.rect(L.left, L.top - 8, L.right - L.left, L.axisY - L.top + 8); ctx.clip();
    ctx.strokeStyle = C.trace; ctx.lineWidth = 1.15; ctx.lineJoin = 'round';
    ctx.beginPath();
    const pxPerPt = (L.right - L.left) / Math.max(1, i1 - i0);
    if (pxPerPt >= 1) {
      for (let i = i0; i <= i1; i++) {
        const X = this.xOf(s.ppmStart + i * step, L), Y = yOf(y[i]);
        i === i0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
      }
    } else {
      const cols = Math.ceil(L.right - L.left);
      let first = true;
      for (let c = 0; c < cols; c++) {
        const a = Math.floor(i0 + (c / cols) * (i1 - i0)), b = Math.floor(i0 + ((c + 1) / cols) * (i1 - i0));
        let mn = Infinity, mx = -Infinity;
        for (let i = a; i <= b && i < n; i++) { if (y[i] < mn) mn = y[i]; if (y[i] > mx) mx = y[i]; }
        const X = L.left + c + 0.5;
        if (first) { ctx.moveTo(X, yOf(mn)); first = false; } else ctx.lineTo(X, yOf(mn));
        ctx.lineTo(X, yOf(mx));
      }
    }
    ctx.stroke();

    // Integral curves
    const sigs = (this.result.analysis.multiplets || []).filter((m) => (!m.minor || m.manual || m.reference) && !m.excluded);
    const is1H = /1H/.test(s.nucleus);
    if (is1H && this.showCurves) {
      ctx.strokeStyle = C.integral; ctx.lineWidth = 1.3;
      const maxArea = Math.max(...sigs.map((m) => m.area), 1);
      for (const m of sigs) {
        if (m.ppmTo > this.view.hi || m.ppmFrom < this.view.lo) continue;
        const h = Math.max(18, (m.area / maxArea) * plotH * 0.45);
        let acc = 0;
        const tot = m.area / Math.abs(step) || 1;
        ctx.beginPath();
        for (let i = m.from; i <= m.to; i++) {
          acc += y[i];
          const X = this.xOf(s.ppmStart + i * step, L), Y = base - 20 - (acc / tot) * h;
          i === m.from ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
        }
        ctx.stroke();
      }
    }

    // Reference compound sticks
    if (this.sticks.length) {
      ctx.strokeStyle = C.stick; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.beginPath();
      for (const st of this.sticks) {
        const X = this.xOf(st.ppm, L);
        ctx.moveTo(X, base); ctx.lineTo(X, base - Math.min(1, st.h) * (plotH - 20));
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();

    // Integral brackets under the axis
    ctx.font = '600 11px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-mono');
    ctx.textAlign = 'center';
    if (is1H) {
      const vis = sigs.filter((m) => this.xOf(m.ppmTo, L) >= L.left && this.xOf(m.ppmFrom, L) <= L.right);
      const centres = [];
      for (const m of vis) {
        const x1 = this.xOf(m.ppmFrom, L), x2 = this.xOf(m.ppmTo, L);
        ctx.strokeStyle = C.integral; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x1, L.axisY + 24); ctx.lineTo(x1, L.axisY + 28); ctx.lineTo(x2, L.axisY + 28); ctx.lineTo(x2, L.axisY + 24); ctx.stroke();
        centres.push((x1 + x2) / 2);
      }
      // Integral values sit under their brackets, nudged apart when brackets crowd together.
      const pos = spread(centres, 30, L.left + 14, L.right - 14);
      ctx.fillStyle = C.integral;
      vis.forEach((m, k) => {
        if (Math.abs(pos[k] - centres[k]) > 2) {
          ctx.strokeStyle = C.integral; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(centres[k], L.axisY + 29); ctx.lineTo(pos[k], L.axisY + 34); ctx.stroke();
        }
        ctx.fillText((m.nH || 0).toFixed(2), pos[k], L.axisY + 45);
      });
    }

    // Peak labels: spread along the top with leader lines (MestReNova style).
    if (this.showLabels) {
      let peaks = this.result.analysis.peaks.filter((p) => p.ppm <= this.view.hi && p.ppm >= this.view.lo).sort((a, b) => b.ppm - a.ppm);
      if (peaks.length > 40) {
        const major = (this.result.analysis.multiplets || []).filter((m) => !m.minor);
        peaks = peaks.filter((p) => p.manual || major.some((m) => p.ppm <= m.ppmFrom && p.ppm >= m.ppmTo));
      }
      const maxLabels = Math.floor((L.right - L.left) / 11);
      let shown = peaks;
      if (shown.length > maxLabels) shown = peaks.slice().sort((a, b) => (b.manual - a.manual) || (b.height - a.height)).slice(0, maxLabels).sort((a, b) => b.ppm - a.ppm);
      const xs = shown.map((p) => this.xOf(p.ppm, L));
      const pos = spread(xs, 11, L.left + 6, L.right - 6);
      const dec = /13C/.test(s.nucleus) ? 2 : 3;
      ctx.font = '10px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-mono');
      ctx.textAlign = 'left';
      const labelBase = L.top - 22;
      for (let k = 0; k < shown.length; k++) {
        const p = shown[k];
        const X = xs[k], Y = Math.max(L.top - 4, yOf(p.height) - 4);
        ctx.strokeStyle = C.muted; ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(pos[k], labelBase); ctx.lineTo(pos[k], labelBase + 6); ctx.lineTo(X, L.top - 2);
        ctx.lineTo(X, Math.min(L.top + 4, Y));
        ctx.stroke();
        ctx.save();
        ctx.translate(pos[k] + 3.5, labelBase - 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = p.manual ? C.accent : C.text;
        ctx.fillText(p.ppm.toFixed(dec), 0, 0);
        ctx.restore();
      }
    }
    // Hand-picked peaks get a marker at the apex.
    ctx.fillStyle = C.accent;
    for (const p of this.result.analysis.peaks) {
      if (!p.manual || p.ppm > this.view.hi || p.ppm < this.view.lo) continue;
      const X = this.xOf(p.ppm, L), Y = Math.max(L.top + 6, yOf(p.height) - 4);
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X - 4, Y - 7); ctx.lineTo(X + 4, Y - 7); ctx.closePath(); ctx.fill();
    }

    // Signals chosen for a calculation (polymer counting signal and end group).
    ctx.font = '600 10px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-ui');
    ctx.textAlign = 'center';
    this.picks.forEach((pk, k) => {
      const x1 = this.xOf(pk.from, L), x2 = this.xOf(pk.to, L);
      if (x2 < L.left || x1 > L.right) return;
      ctx.strokeStyle = C.note; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.strokeRect(x1, L.top, x2 - x1, L.axisY - L.top);
      ctx.setLineDash([]);
      ctx.fillStyle = C.note;
      ctx.fillText(pk.text, (x1 + x2) / 2, L.top + 12 + k * 13);
    });

    // Labels on signals sit over the signal's apex; notes sit where they were placed.
    this._boxes = [];
    ctx.font = '600 11px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-ui');
    ctx.textAlign = 'left';
    for (const a of this.annotations) {
      if (a.ppm > this.view.hi || a.ppm < this.view.lo) continue;
      const X = this.xOf(a.ppm, L);
      const w = ctx.measureText(a.text).width + 10, h = 17;
      let bx, by;
      if (a.kind === 'label') {
        const k = Math.round(idx(a.ppm)), span = Math.max(2, Math.round(0.03 / Math.abs(step)));
        let apex = 0;
        for (let i = Math.max(0, k - span); i <= Math.min(n - 1, k + span); i++) apex = Math.max(apex, y[i]);
        const top = Math.max(L.top + h + 6, yOf(apex) - 10);
        bx = X - w / 2; by = top - h;
        ctx.strokeStyle = C.note; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X, by + h); ctx.lineTo(X, top + 6); ctx.stroke();
      } else {
        bx = X; by = L.top + (a.yFrac ?? 0.2) * (L.axisY - L.top);
      }
      bx = Math.min(L.right - w, Math.max(L.left, bx));
      ctx.fillStyle = C.surface; ctx.strokeStyle = C.note; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, w, h, 4) : ctx.rect(bx, by, w, h); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.note;
      ctx.fillText(a.text, bx + 5, by + 12.5);
      this._boxes.push({ x: bx, y: by, w, h, a });
    }

    // Drag selection
    if (this.drag && this.drag.x2 !== undefined) {
      ctx.fillStyle = C.select;
      const a = Math.min(this.drag.x1, this.drag.x2), b = Math.max(this.drag.x1, this.drag.x2);
      ctx.fillRect(a, L.top, b - a, L.axisY - L.top);
    }
    // Crosshair
    if (this.hoverX !== undefined && this.hoverX >= L.left && this.hoverX <= L.right) {
      ctx.strokeStyle = C.muted; ctx.setLineDash([2, 3]); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(this.hoverX + 0.5, L.top); ctx.lineTo(this.hoverX + 0.5, L.axisY); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _bind() {
    const c = this.canvas;
    const pt = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener('contextmenu', (e) => {
      if (!this.result) return;
      e.preventDefault();
      const p = pt(e), L = this._L || this.layout();
      this.onContext(this.ppmOf(p.x, L), { x: p.x, y: p.y, yFrac: (p.y - L.top) / (L.axisY - L.top) });
    });
    c.addEventListener('pointerdown', (e) => {
      if (!this.result || e.button === 2) return;
      c.setPointerCapture(e.pointerId);
      const p = pt(e);
      this.drag = { x1: p.x, y1: p.y, pan: e.button === 1 || e.shiftKey || this.mode === 'pan', view: { ...this.view } };
      if (this.drag.pan) c.style.cursor = 'grabbing';
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.result) return;
      const p = pt(e);
      const L = this._L || this.layout();
      this.hoverX = p.x;
      this.onHover(this.ppmOf(p.x, L), { x: p.x, y: p.y, dragging: !!this.drag, inPlot: p.y >= L.top - 10 && p.y <= L.axisY });
      if (this.drag) {
        if (this.drag.pan) {
          const d = ((p.x - this.drag.x1) / (L.right - L.left)) * (this.drag.view.hi - this.drag.view.lo);
          const s = this.result.spectrum;
          let hi = this.drag.view.hi + d, lo = this.drag.view.lo + d;
          if (hi > s.ppmStart) { lo -= hi - s.ppmStart; hi = s.ppmStart; }
          if (lo < s.ppmEnd) { hi += s.ppmEnd - lo; lo = s.ppmEnd; }
          this.view = { hi, lo };
        } else this.drag.x2 = p.x;
      }
      this.draw();
    });
    const end = (e) => {
      if (!this.drag) return;
      const d = this.drag; this.drag = null;
      const L = this._L || this.layout();
      if (d.pan) this.setMode(this.mode);
      if (!d.pan && d.x2 !== undefined && Math.abs(d.x2 - d.x1) > 4) {
        const a = this.ppmOf(Math.min(d.x1, d.x2), L), b = this.ppmOf(Math.max(d.x1, d.x2), L);
        if (RANGE_MODES.has(this.mode)) this.onRange(a, b);
        else this.zoomTo(a, b);
      } else if (!d.pan && e.type === 'pointerup') {
        this.onClickPpm(this.ppmOf(d.x1, L), { x: d.x1, y: d.y1, yFrac: (d.y1 - L.top) / (L.axisY - L.top) });
      }
      this.draw();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { this.hoverX = undefined; this.onHover(null); this.draw(); });
    c.addEventListener('dblclick', () => { if (!['label', 'note'].includes(this.mode)) this.reset(); });
    c.addEventListener('wheel', (e) => {
      if (!this.result) return;
      e.preventDefault();
      const L = this._L || this.layout();
      const s = this.result.spectrum;
      const span = this.view.hi - this.view.lo;
      if (e.shiftKey || e.altKey) {
        // Shift or Option + wheel: vertical scale.
        const d = e.deltaY || e.deltaX;
        this.yScale = Math.min(500, Math.max(0.2, this.yScale * Math.exp(-d * 0.002)));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Sideways swipe on a trackpad or tilt wheel: pan.
        let d = (e.deltaX / (L.right - L.left)) * span;
        d = Math.max(-(s.ppmStart - this.view.hi), Math.min(d, this.view.lo - s.ppmEnd));
        this.view = { hi: this.view.hi - d, lo: this.view.lo - d };
      } else {
        // Wheel or pinch: zoom around the pointer.
        const p = this.ppmOf(pt(e).x, L);
        const f = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        this.view = { hi: Math.min(s.ppmStart, p + (this.view.hi - p) * f), lo: Math.max(s.ppmEnd, p - (p - this.view.lo) * f) };
      }
      this.draw();
    }, { passive: false });
  }
}

// Tools where dragging selects a region instead of zooming.
const RANGE_MODES = new Set(['integrate', 'peakAdd', 'peakDel', 'pickRepeat', 'pickEnd']);

function niceTicks(lo, hi, count) {
  const span = hi - lo;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const stepM = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const minor = stepM / 5;
  const major = [], mins = [];
  for (let t = Math.ceil(lo / stepM) * stepM; t <= hi + 1e-9; t += stepM) major.push(Math.round(t / stepM) * stepM);
  for (let t = Math.ceil(lo / minor) * minor; t <= hi + 1e-9; t += minor) mins.push(t);
  return { major, minor: mins, decimals: Math.max(0, -Math.floor(Math.log10(stepM) + 1e-9)) };
}

// Spread label positions so neighbours are at least `gap` px apart, staying near targets.
function spread(xs, gap, min, max) {
  const n = xs.length;
  const pos = xs.map((x) => Math.min(max, Math.max(min, x)));
  for (let it = 0; it < 60; it++) {
    let moved = false;
    for (let i = 1; i < n; i++) {
      const d = pos[i] - pos[i - 1];
      if (d < gap) {
        const push = (gap - d) / 2;
        pos[i - 1] -= push; pos[i] += push; moved = true;
      }
    }
    for (let i = 0; i < n; i++) pos[i] = Math.min(max, Math.max(min, pos[i]));
    if (!moved) break;
  }
  return pos;
}
