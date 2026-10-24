// Minimal TextDecoder for JavaScriptCore (it has no web APIs). Handles utf-8 and latin1.
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = class {
    constructor(enc = 'utf-8') { this.enc = String(enc).toLowerCase(); }
    decode(u8) {
      if (!u8) return '';
      let s = '';
      if (this.enc === 'latin1' || this.enc === 'iso-8859-1' || this.enc === 'ascii') {
        for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
        return s;
      }
      for (let i = 0; i < u8.length; i++) {
        const c = u8[i];
        if (c < 0x80) s += String.fromCharCode(c);
        else if (c >= 0xc0 && c < 0xe0) s += String.fromCharCode(((c & 0x1f) << 6) | (u8[++i] & 0x3f));
        else if (c >= 0xe0 && c < 0xf0) s += String.fromCharCode(((c & 0x0f) << 12) | ((u8[++i] & 0x3f) << 6) | (u8[++i] & 0x3f));
        else { const cp = ((c & 0x07) << 18) | ((u8[++i] & 0x3f) << 12) | ((u8[++i] & 0x3f) << 6) | (u8[++i] & 0x3f); s += String.fromCodePoint(cp); }
      }
      return s;
    }
  };
}

(() => {
  // core/jcamp.js
  var SQZ = { "@": 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, a: -1, b: -2, c: -3, d: -4, e: -5, f: -6, g: -7, h: -8, i: -9 };
  var DIF = { "%": 0, J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9, j: -1, k: -2, l: -3, m: -4, n: -5, o: -6, p: -7, q: -8, r: -9 };
  var DUP = { S: 1, T: 2, U: 3, V: 4, W: 5, X: 6, Y: 7, Z: 8, s: 9 };
  function normLabel(label) {
    return label.replace(/[\s\-\/_]/g, "").toUpperCase();
  }
  function parseRecords(text) {
    const records = [];
    const lines = text.split(/\r?\n/);
    let cur = null;
    for (const raw of lines) {
      const line = raw;
      if (line.startsWith("##")) {
        const eq = line.indexOf("=");
        if (eq < 0) continue;
        cur = { label: normLabel(line.slice(2, eq)), raw: line.slice(2, eq).trim(), value: line.slice(eq + 1) };
        records.push(cur);
      } else if (cur) {
        cur.value += "\n" + line;
      }
    }
    for (const r of records) {
      if (r.label !== "XYDATA" && r.label !== "DATATABLE" && r.label !== "PEAKTABLE" && r.label !== "XYPOINTS") {
        r.value = stripComment(r.value).trim();
      }
    }
    return records;
  }
  function stripComment(v) {
    return v.split("\n").map((l) => {
      const i = l.indexOf("$$");
      return i >= 0 ? l.slice(0, i) : l;
    }).join("\n");
  }
  function num(v) {
    if (v === void 0 || v === null) return void 0;
    const m = String(v).match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
    return m ? parseFloat(m[0]) : void 0;
  }
  function decodeXYData(body) {
    const ys = [];
    const xs = [];
    let lastLineEndedDif = false;
    const lines = body.split("\n");
    for (let li = 0; li < lines.length; li++) {
      let line = lines[li];
      const c = line.indexOf("$$");
      if (c >= 0) line = line.slice(0, c);
      line = line.trim();
      if (!line) continue;
      const tokens = tokenize(line);
      if (!tokens.length) continue;
      const x = tokens[0].v;
      const lineVals = [];
      let prev = ys.length ? ys[ys.length - 1] : 0;
      let lastDif = null;
      let endedDif = false;
      for (let t = 1; t < tokens.length; t++) {
        const tok = tokens[t];
        if (tok.t === "abs") {
          prev = tok.v;
          lineVals.push(prev);
          lastDif = null;
          endedDif = false;
        } else if (tok.t === "dif") {
          prev = (lineVals.length ? lineVals[lineVals.length - 1] : prev) + tok.v;
          lineVals.push(prev);
          lastDif = tok.v;
          endedDif = true;
        } else if (tok.t === "dup") {
          for (let k = 1; k < tok.v; k++) {
            if (lastDif !== null) prev = prev + lastDif;
            lineVals.push(prev);
          }
        }
      }
      if (lastLineEndedDif && lineVals.length && ys.length) lineVals.shift();
      for (const v of lineVals) ys.push(v);
      xs.push(x);
      lastLineEndedDif = endedDif;
    }
    return { ys, xs };
  }
  function tokenize(line) {
    const tokens = [];
    let i = 0;
    const n = line.length;
    while (i < n) {
      const ch = line[i];
      if (ch === " " || ch === "	" || ch === "," || ch === ";") {
        i++;
        continue;
      }
      let type, sign = 1, digits = "";
      if (ch in SQZ) {
        type = "abs";
        digits = String(Math.abs(SQZ[ch]));
        sign = SQZ[ch] < 0 ? -1 : 1;
        i++;
      } else if (ch in DIF) {
        type = "dif";
        digits = String(Math.abs(DIF[ch]));
        sign = DIF[ch] < 0 ? -1 : 1;
        i++;
      } else if (ch in DUP) {
        type = "dup";
        digits = String(DUP[ch]);
        i++;
      } else if (ch === "+" || ch === "-" || ch === "." || ch >= "0" && ch <= "9") {
        type = "abs";
        if (ch === "-") {
          sign = -1;
          i++;
        } else if (ch === "+") {
          i++;
        }
      } else {
        i++;
        continue;
      }
      while (i < n) {
        const c = line[i];
        if (c >= "0" && c <= "9" || c === ".") {
          digits += c;
          i++;
        } else if ((c === "E" || c === "e") && type === "abs" && (line[i + 1] === "+" || line[i + 1] === "-") && /\d/.test(line[i + 2] || "")) {
          digits += "e" + line[i + 1];
          i += 2;
        } else break;
      }
      if (digits === "" || digits === ".") continue;
      tokens.push({ t: type, v: type === "dup" ? parseInt(digits, 10) : sign * parseFloat(digits) });
    }
    return tokens;
  }
  function decodePairs(body) {
    const nums = [];
    for (let line of body.split("\n").slice(1)) {
      const c = line.indexOf("$$");
      if (c >= 0) line = line.slice(0, c);
      for (const s of line.split(/[\s,;]+/)) if (s) {
        const v = parseFloat(s);
        if (!isNaN(v)) nums.push(v);
      }
    }
    const out = [];
    for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
    return out;
  }
  function nucleusName(v) {
    if (!v) return void 0;
    const s = String(v).replace(/[\^<>\s]/g, "");
    const m = s.match(/(\d+)([A-Za-z]+)/);
    return m ? m[1] + m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() : s;
  }
  function readJcamp(text, name = "spectrum.jdx") {
    const records = parseRecords(text);
    const blocks = [];
    let cur = null;
    for (const r of records) {
      if (r.label === "TITLE") {
        cur = [];
        blocks.push(cur);
      }
      if (cur) cur.push(r);
    }
    const out = [];
    for (const b of blocks) {
      const ds = readBlock(b, name);
      if (ds) out.push(ds);
    }
    if (!out.length) throw new Error("No 1D NMR data found in JCAMP file");
    return out;
  }
  function readBlock(records, name) {
    const h = {};
    for (const r of records) if (!(r.label in h)) h[r.label] = r.value;
    const dataType = (h.DATATYPE || "").toUpperCase();
    if (dataType.includes("2D") || dataType.includes("NMR PEAK ASSIGNMENTS")) return null;
    const obsFreq = num(h[".OBSERVEFREQUENCY"]) || num(h.$SFO1) || num(h.$BF1) || num(h.$SF);
    const nucleus = nucleusName(h[".OBSERVENUCLEUS"] || h.$NUC1 || h.$T2NUCLEUS);
    const solvent = (h[".SOLVENTNAME"] || h.$SOLVENT || "").replace(/[<>]/g, "").trim() || void 0;
    const meta = {
      title: h.TITLE,
      origin: h.ORIGIN,
      owner: h.OWNER,
      date: h.LONGDATE || h.DATE,
      pulseSequence: h[".PULSESEQUENCE"] || (h.$PULPROG || "").replace(/[<>]/g, ""),
      scans: num(h[".AVERAGES"]) || num(h.$NS),
      temperature: num(h.TEMPERATURE) || num(h.$TE),
      spectrometer: h.SPECTROMETERDATASYSTEM,
      jcampVersion: h.JCAMPDX
    };
    const base = { name, title: (h.TITLE || name).trim(), nucleus, frequency: obsFreq, solvent, meta, source: "JCAMP-DX" };
    if (h.NTUPLES !== void 0) return readNtuples(records, h, base);
    const xyRec = records.find((r) => r.label === "XYDATA");
    if (xyRec) {
      const { ys } = decodeXYData(xyRec.value.split("\n").slice(1).join("\n"));
      const yf = num(h.YFACTOR) || 1;
      const npts = num(h.NPOINTS) || ys.length;
      let firstX = num(h.FIRSTX), lastX = num(h.LASTX);
      const xunits = (h.XUNITS || "PPM").toUpperCase();
      const y = new Float64Array(Math.min(npts, ys.length));
      for (let i = 0; i < y.length; i++) y[i] = ys[i] * yf;
      let toPpm = (x) => x;
      if (xunits.includes("HZ")) toPpm = hzToPpmFactory(h, obsFreq, firstX, lastX, y.length);
      return finishSpectrum(base, y, null, toPpm(firstX), toPpm(lastX));
    }
    const ptsRec = records.find((r) => r.label === "XYPOINTS" || r.label === "PEAKTABLE");
    if (ptsRec) {
      const pairs = decodePairs(ptsRec.value);
      const xf = num(h.XFACTOR) || 1, yf = num(h.YFACTOR) || 1;
      const xunits = (h.XUNITS || "PPM").toUpperCase();
      const pts = pairs.map(([x, y]) => [x * xf, y * yf]);
      const conv = xunits.includes("HZ") && obsFreq ? (x) => x / obsFreq : (x) => x;
      if (ptsRec.label === "PEAKTABLE") {
        return { ...base, stickPeaks: pts.map(([x, y]) => ({ ppm: conv(x), height: y })) };
      }
      return resampleXY(base, pts.map(([x, y]) => [conv(x), y]));
    }
    return null;
  }
  function hzToPpmFactory(h, obsFreq, firstX, lastX, n) {
    const sref = h[".SHIFTREFERENCE"];
    if (sref) {
      const parts = sref.split(",").map((s) => s.trim());
      const point = parseFloat(parts[2]), ppm = parseFloat(parts[3]);
      if (!isNaN(point) && !isNaN(ppm) && obsFreq) {
        const step = (lastX - firstX) / (n - 1);
        const xref = firstX + (point - 1) * step;
        return (x) => ppm + (x - xref) / obsFreq;
      }
    }
    const offset = num(h.$OFFSET);
    if (offset !== void 0 && obsFreq) return (x) => offset + (x - firstX) / obsFreq;
    return (x) => x / (obsFreq || 1);
  }
  function readNtuples(records, h, base) {
    const attr2 = {};
    const start = records.findIndex((r) => r.label === "NTUPLES");
    for (let i = start + 1; i < records.length; i++) {
      const r = records[i];
      if (r.label === "PAGE" || r.label === "DATATABLE") break;
      attr2[r.label] = r.value.split(",").map((s) => s.trim());
    }
    const symbols = (attr2.SYMBOL || []).map((s) => s.toUpperCase());
    const iR = symbols.indexOf("R"), iI = symbols.indexOf("I"), iX = symbols.indexOf("X");
    const factor = (k) => parseFloat((attr2.FACTOR || [])[k]) || 1;
    const first = (k) => parseFloat((attr2.FIRST || [])[k]);
    const last = (k) => parseFloat((attr2.LAST || [])[k]);
    const units = (attr2.UNITS || []).map((u) => u.toUpperCase());
    const dim = parseInt((attr2.VARDIM || [])[iR >= 0 ? iR : 1], 10);
    let re = null, im = null;
    for (const r of records) {
      if (r.label !== "DATATABLE") continue;
      const head = r.value.split("\n")[0].toUpperCase();
      const body = r.value.split("\n").slice(1).join("\n");
      const { ys } = decodeXYData(body);
      const isImag = /\(I\.\.I\)/.test(head.replace(/\s/g, ""));
      const k = isImag ? iI : iR;
      const f = factor(k);
      const arr = new Float64Array(Math.min(dim || ys.length, ys.length));
      for (let i = 0; i < arr.length; i++) arr[i] = ys[i] * f;
      if (isImag) {
        if (!im) im = arr;
      } else if (!re) re = arr;
      if (re && im) break;
    }
    if (!re) return null;
    const isFid = (h.NTUPLES || "").toUpperCase().includes("FID") || (units[iX] || "").includes("SEC");
    const xFirst = first(iX), xLast = last(iX);
    if (isFid) {
      const n = re.length;
      const dt = (xLast - xFirst) / (n - 1);
      const sw = num(h.$SWH) || 1 / dt;
      const fid = {
        re,
        im: im || new Float64Array(n),
        sw,
        centerPpm: centerPpmFromHeader(h, base.frequency),
        grpdly: grpdlyFromHeader(h),
        origin: (h.ORIGIN || "").toLowerCase(),
        reverse: /oxford/i.test(h.ORIGIN || "") || /oxford/i.test(h.SPECTROMETERDATASYSTEM || "")
      };
      return { ...base, fid };
    }
    const xunits = units[iX] || "HZ";
    let toPpm = (x) => x;
    if (xunits.includes("HZ")) toPpm = hzToPpmFactory(h, base.frequency, xFirst, xLast, re.length);
    return finishSpectrum(base, re, im, toPpm(xFirst), toPpm(xLast));
  }
  function centerPpmFromHeader(h, obsFreq) {
    const sf = num(h.$SF), sfo1 = num(h.$SFO1), bf1 = num(h.$BF1), o1 = num(h.$O1);
    if (sf && sfo1 && Math.abs(sfo1 - sf) < 1) return (sfo1 - sf) / sf * 1e6;
    if (o1 !== void 0 && bf1) return o1 / bf1;
    if (sfo1 && bf1) return (sfo1 - bf1) / bf1 * 1e6;
    if (sfo1 && obsFreq && sfo1 !== obsFreq) return (sfo1 - obsFreq) / obsFreq * 1e6;
    const o1p = num(h.$O1P);
    if (o1p !== void 0) return o1p;
    return 0;
  }
  var DSP_TABLE = {
    10: { 2: 44.75, 3: 33.5, 4: 66.625, 6: 59.083333, 8: 68.5625, 12: 60.375, 16: 69.53125, 24: 61.020833, 32: 70.015625, 48: 61.34375, 64: 70.2578125, 96: 61.505208, 128: 70.37890625, 192: 61.5859375, 256: 70.439453125, 384: 61.626302, 512: 70.4697265625, 768: 61.646484375, 1024: 70.48486328125, 1536: 61.656576, 2048: 70.492431640625 },
    11: { 2: 46, 3: 36.5, 4: 48, 6: 50.166667, 8: 53.25, 12: 69.5, 16: 72.25, 24: 70.166667, 32: 72.75, 48: 70.5, 64: 73, 96: 70.666667, 128: 72.5, 192: 71.333333, 256: 72.25, 384: 71.666667, 512: 72.125, 768: 71.833333, 1024: 72.0625, 1536: 71.916667, 2048: 72.03125 },
    12: { 2: 46, 3: 36.5, 4: 48, 6: 50.166667, 8: 53.25, 12: 69.5, 16: 71.625, 24: 70.166667, 32: 72.125, 48: 70.5, 64: 72.375, 96: 70.666667, 128: 72.5, 192: 71.333333, 256: 72.25, 384: 71.666667, 512: 72.125, 768: 71.833333, 1024: 72.0625, 1536: 71.916667, 2048: 72.03125 },
    13: { 2: 2.75, 3: 2.8333333, 4: 2.875, 6: 2.9166667, 8: 2.9375, 12: 2.9583333, 16: 2.96875, 24: 2.9791667, 32: 2.984375, 48: 2.9895833, 64: 2.9921875, 96: 2.9947917 }
  };
  function grpdlyFromHeader(h) {
    const g = num(h.$GRPDLY);
    if (g !== void 0 && g > 0) return g;
    const dspfvs = num(h.$DSPFVS), decim = num(h.$DECIM);
    if (dspfvs && decim && DSP_TABLE[dspfvs]) return DSP_TABLE[dspfvs][decim] || 0;
    return 0;
  }
  function finishSpectrum(base, real, imag, ppmFirst, ppmLast) {
    if (ppmFirst < ppmLast) {
      real = Float64Array.from(real).reverse();
      if (imag) imag = Float64Array.from(imag).reverse();
      [ppmFirst, ppmLast] = [ppmLast, ppmFirst];
    }
    return { ...base, real: Float64Array.from(real), imag: imag ? Float64Array.from(imag) : null, ppmStart: ppmFirst, ppmEnd: ppmLast };
  }
  function resampleXY(base, pts) {
    pts.sort((a, b) => b[0] - a[0]);
    const n = pts.length;
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = pts[i][1];
    return finishSpectrum(base, y, null, pts[0][0], pts[n - 1][0]);
  }

  // core/bruker.js
  function parseBrukerParams(text) {
    const out = {};
    for (const r of parseRecords(text)) {
      let v = r.value;
      if (/^\(\s*0\s*\.\.\s*\d+\s*\)/.test(v)) {
        v = v.replace(/^\([^)]*\)/, "").trim().split(/\s+/);
      } else if (v.startsWith("<")) {
        v = v.replace(/^<|>$/g, "");
      }
      out[r.label] = v;
    }
    return out;
  }
  function readInts(buf, bigEndian, float64) {
    const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, buf.byteLength);
    const size = float64 ? 8 : 4;
    const n = Math.floor(dv.byteLength / size);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = float64 ? dv.getFloat64(i * 8, !bigEndian) : dv.getInt32(i * 4, !bigEndian);
    return out;
  }
  var dec = (b) => new TextDecoder("latin1").decode(b);
  function readBruker(files, name = "bruker", opts = {}) {
    const get = (p) => files.get(p);
    const acqusBuf = get("acqus");
    if (!acqusBuf) throw new Error("Bruker folder has no acqus file");
    const acqus = parseBrukerParams(dec(acqusBuf));
    const nucleus = (acqus.$NUC1 || "1H").replace(/[<>]/g, "");
    const solvent = acqus.$SOLVENT;
    const meta = {
      pulseSequence: acqus.$PULPROG,
      scans: num(acqus.$NS),
      temperature: num(acqus.$TE),
      date: acqus.$DATE ? new Date(num(acqus.$DATE) * 1e3).toISOString() : void 0,
      origin: acqus.ORIGIN,
      owner: acqus.OWNER,
      instrument: acqus.$INSTRUM
    };
    const title = get("pdata/1/title") ? dec(get("pdata/1/title")).trim() : name;
    const base = { name, title: title || name, nucleus, solvent, frequency: num(acqus.$SFO1), meta, source: "Bruker" };
    let fid = null;
    const fidBuf = get("fid");
    if (fidBuf || opts.fidValues) {
      const td = num(acqus.$TD);
      const big = num(acqus.$BYTORDA) === 1;
      const raw = opts.fidValues || readInts(fidBuf, big, num(acqus.$DTYPA) === 2);
      const n = Math.min(Math.floor((td || raw.length) / 2), Math.floor(raw.length / 2));
      const scale = Math.pow(2, num(acqus.$NC) || 0);
      const re = new Float64Array(n), im = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        re[i] = raw[2 * i] * scale;
        im[i] = raw[2 * i + 1] * scale;
      }
      const sfo1 = num(acqus.$SFO1), bf1 = num(acqus.$BF1);
      const procsBuf0 = get("pdata/1/procs");
      const sf = procsBuf0 ? num(parseBrukerParams(dec(procsBuf0)).$SF) : void 0;
      const ref = sf || bf1;
      fid = {
        re,
        im,
        sw: num(acqus.$SWH),
        grpdly: grpdlyFromHeader(acqus),
        centerPpm: (sfo1 - ref) / ref * 1e6,
        origin: "bruker"
      };
    }
    let spectrum = null;
    const procsBuf = get("pdata/1/procs");
    const rBuf = get("pdata/1/1r");
    if (procsBuf && rBuf) {
      const procs = parseBrukerParams(dec(procsBuf));
      const big = num(procs.$BYTORDP) === 1;
      const scale = Math.pow(2, num(procs.$NCPROC) || 0);
      const real = readInts(rBuf, big, num(procs.$DTYPP) === 2).map((v) => v * scale);
      const iBuf = get("pdata/1/1i");
      const imag = iBuf ? readInts(iBuf, big, num(procs.$DTYPP) === 2).map((v) => v * scale) : null;
      const si = real.length;
      const sf = num(procs.$SF);
      const offset = num(procs.$OFFSET);
      const swp = num(procs.$SWP);
      const ppmEnd = offset - swp / sf * ((si - 1) / si);
      spectrum = { real, imag, ppmStart: offset, ppmEnd };
      base.frequency = sf || base.frequency;
      base.processing = { ph0: num(procs.$PHC0), ph1: num(procs.$PHC1), lb: num(procs.$LB) };
    }
    if (!fid && !spectrum) throw new Error("Bruker folder has neither fid nor pdata/1/1r");
    return { ...base, fid, ...spectrum || {} };
  }

  // core/varian.js
  function parseProcpar(text) {
    const lines = text.split(/\r?\n/);
    const out = {};
    let i = 0;
    while (i < lines.length) {
      const head = lines[i].trim().split(/\s+/);
      i++;
      if (head.length < 11) continue;
      const name = head[0];
      const basictype = parseInt(head[2], 10);
      let valueLine = (lines[i] || "").trim();
      i++;
      const count = parseInt(valueLine, 10);
      let values = [];
      if (basictype === 2) {
        let rest = valueLine.replace(/^\d+\s*/, "");
        const strs = [];
        const re = /"((?:[^"\\]|\\.)*)"/g;
        let m;
        while (m = re.exec(rest)) strs.push(m[1]);
        while (strs.length < count && i < lines.length) {
          rest = lines[i++];
          re.lastIndex = 0;
          while (m = re.exec(rest)) strs.push(m[1]);
        }
        values = strs;
      } else {
        values = valueLine.split(/\s+/).slice(1).map(Number);
      }
      i++;
      out[name] = values.length === 1 ? values[0] : values;
    }
    return out;
  }
  function readVarian(files, name = "varian") {
    const ppBuf = files.get("procpar");
    const fidBuf = files.get("fid");
    if (!ppBuf || !fidBuf) throw new Error("Varian data needs both procpar and fid");
    const pp = parseProcpar(new TextDecoder("latin1").decode(ppBuf));
    const dv = new DataView(fidBuf.buffer, fidBuf.byteOffset, fidBuf.byteLength);
    const nblocks = dv.getInt32(0), ntraces = dv.getInt32(4), np = dv.getInt32(8);
    const ebytes = dv.getInt32(12), status = dv.getInt16(26);
    const isFloat = (status & 8) !== 0;
    const n = np / 2;
    const re = new Float64Array(n), im = new Float64Array(n);
    let off = 32 + 28;
    const read = (o) => isFloat ? dv.getFloat32(o) : ebytes === 4 ? dv.getInt32(o) : dv.getInt16(o);
    for (let k = 0; k < n; k++) {
      re[k] = read(off + 2 * k * ebytes);
      im[k] = -read(off + (2 * k + 1) * ebytes);
    }
    const sw = Number(pp.sw), sfrq = Number(pp.sfrq);
    const rfl = Number(pp.rfl || 0), rfp = Number(pp.rfp || 0);
    const leftPpm = (sw - rfl + rfp) / sfrq;
    const centerPpm = leftPpm - sw / sfrq / 2;
    return {
      name,
      title: String(pp.samplename || pp.seqfil || name),
      nucleus: String(pp.tn || "1H"),
      solvent: pp.solvent,
      frequency: sfrq,
      source: "Varian/Agilent",
      meta: { pulseSequence: pp.seqfil, scans: Number(pp.nt), temperature: Number(pp.temp), date: pp.date, blocks: nblocks, traces: ntraces },
      fid: { re, im, sw, centerPpm, grpdly: 0, origin: "varian" }
    };
  }

  // core/inflate.js
  var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  function buildTree(lengths) {
    const counts = new Uint16Array(16);
    for (const l of lengths) counts[l]++;
    counts[0] = 0;
    const offs = new Uint16Array(16);
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
    const symbols = new Uint16Array(lengths.length);
    for (let i = 0; i < lengths.length; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
    return { counts, symbols };
  }
  var FIXED_LIT = null;
  var FIXED_DIST = null;
  function fixedTrees() {
    if (!FIXED_LIT) {
      const l = new Uint8Array(288);
      l.fill(8, 0, 144);
      l.fill(9, 144, 256);
      l.fill(7, 256, 280);
      l.fill(8, 280, 288);
      FIXED_LIT = buildTree(l);
      FIXED_DIST = buildTree(new Uint8Array(30).fill(5));
    }
    return [FIXED_LIT, FIXED_DIST];
  }
  function inflateRaw(src, sizeHint = 0) {
    let pos = 0, bit = 0, bitCount = 0;
    let out = new Uint8Array(Math.max(1024, sizeHint || src.length * 4));
    let o = 0;
    const ensure = (n) => {
      if (o + n <= out.length) return;
      let len = out.length * 2;
      while (len < o + n) len *= 2;
      const next = new Uint8Array(len);
      next.set(out);
      out = next;
    };
    const bits = (n) => {
      while (bitCount < n) {
        if (pos >= src.length) throw new Error("Unexpected end of compressed data");
        bit |= src[pos++] << bitCount;
        bitCount += 8;
      }
      const v = bit & (1 << n) - 1;
      bit >>>= n;
      bitCount -= n;
      return v;
    };
    const decode = (t) => {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len < 16; len++) {
        code |= bits(1);
        const count = t.counts[len];
        if (code - count < first) return t.symbols[index + (code - first)];
        index += count;
        first += count;
        first <<= 1;
        code <<= 1;
      }
      throw new Error("Invalid Huffman code");
    };
    let final = 0;
    while (!final) {
      final = bits(1);
      const type = bits(2);
      if (type === 0) {
        bit = 0;
        bitCount = 0;
        const len = src[pos] | src[pos + 1] << 8;
        pos += 4;
        ensure(len);
        out.set(src.subarray(pos, pos + len), o);
        o += len;
        pos += len;
        continue;
      }
      let lit, dist;
      if (type === 1) [lit, dist] = fixedTrees();
      else if (type === 2) {
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const cl = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits(3);
        const clt = buildTree(cl);
        const lens = new Uint8Array(hlit + hdist);
        for (let i = 0; i < hlit + hdist; ) {
          const sym = decode(clt);
          if (sym < 16) lens[i++] = sym;
          else if (sym === 16) {
            const p = lens[i - 1];
            for (let r = bits(2) + 3; r > 0; r--) lens[i++] = p;
          } else if (sym === 17) i += bits(3) + 3;
          else i += bits(7) + 11;
        }
        lit = buildTree(lens.subarray(0, hlit));
        dist = buildTree(lens.subarray(hlit));
      } else throw new Error("Invalid DEFLATE block");
      for (; ; ) {
        const sym = decode(lit);
        if (sym === 256) break;
        if (sym < 256) {
          ensure(1);
          out[o++] = sym;
          continue;
        }
        const li = sym - 257;
        const len = LEN_BASE[li] + bits(LEN_EXTRA[li]);
        const di = decode(dist);
        const d = DIST_BASE[di] + bits(DIST_EXTRA[di]);
        ensure(len);
        for (let k = 0; k < len; k++, o++) out[o] = out[o - d];
      }
    }
    return out.subarray(0, o);
  }
  function inflateZlib(src) {
    if (src.length < 2 || (src[0] & 15) !== 8 || (src[0] << 8 | src[1]) % 31 !== 0) throw new Error("Not a zlib stream");
    return inflateRaw(src.subarray(2));
  }

  // core/textformats.js
  function readText(text, name = "spectrum.txt") {
    const xs = [], ys = [];
    let nucleus, frequency;
    for (const line of text.split(/\r?\n/)) {
      if (/1H|proton/i.test(line) && !nucleus && /[a-z]/i.test(line)) nucleus = "1H";
      if (/13C|carbon/i.test(line) && !nucleus && /[a-z]/i.test(line)) nucleus = "13C";
      const f = line.match(/(\d{2,4}(?:\.\d+)?)\s*MHz/i);
      if (f && !frequency) frequency = parseFloat(f[1]);
      const parts = line.trim().split(/[\s,;\t]+/).map(Number);
      if (parts.length >= 2 && parts.every((v) => !isNaN(v))) {
        xs.push(parts[parts.length === 2 ? 0 : parts.length - 2]);
        ys.push(parts[parts.length - 1]);
      }
    }
    if (xs.length < 16) return null;
    const idx = xs.map((_, i) => i).sort((a, b) => xs[b] - xs[a]);
    const sx = idx.map((i) => xs[i]), sy = idx.map((i) => ys[i]);
    const n = sx.length;
    const start = sx[0], end = sx[n - 1];
    const out = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const x = start + (end - start) * i / (n - 1);
      while (j < n - 2 && sx[j + 1] > x) j++;
      const t = (sx[j] - x) / (sx[j] - sx[j + 1] || 1);
      out[i] = sy[j] + t * (sy[j + 1] - sy[j]);
    }
    if (!nucleus) nucleus = start - end > 40 ? "13C" : "1H";
    return finishSpectrum({ name, title: name, nucleus, frequency: frequency || (nucleus === "13C" ? 100 : 400), source: "Text/CSV", meta: {} }, out, null, start, end);
  }

  // core/jeol.js
  var PREFIX = { "-8": 24, "-7": 21, "-6": 18, "-5": 15, "-4": 12, "-3": 9, "-2": 6, "-1": 3, 0: 0, 1: -3, 2: -6, 3: -9, 4: -12, 5: -15, 6: -18, 7: -21 };
  var UNITS = { 13: "Hz", 26: "ppm", 28: "s" };
  function isJeol(bytes) {
    return bytes.length > 1300 && String.fromCharCode(...bytes.subarray(0, 8)).startsWith("JEOL.NMR");
  }
  function readJeol(bytes, name = "spectrum.jdf") {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const little = dv.getInt8(8) === 1;
    const dims = dv.getUint8(12);
    const typeByte = dv.getUint8(14);
    const float32 = typeByte >> 6 === 1;
    const format = typeByte & 63;
    if (format !== 1 || dims !== 1) throw new Error("Only 1D JEOL data is supported for now");
    const axisType = dv.getUint8(24);
    const unitBase = UNITS[dv.getInt8(33)] || "";
    const points = dv.getUint32(176);
    const axisStart = dv.getFloat64(272), axisStop = dv.getFloat64(336);
    const baseFreq = dv.getFloat64(1064);
    const paramStart = dv.getUint32(1212);
    const dataStart = dv.getUint32(1284);
    const str = (o, n) => {
      let s = "";
      for (let i = 0; i < n; i++) {
        const c = bytes[o + i];
        if (c) s += String.fromCharCode(c);
      }
      return s;
    };
    const title = str(48, 124).trim();
    const params = {};
    const high = dv.getUint32(paramStart + 8, little);
    for (let i = 0; i <= high; i++) {
      const o = paramStart + 16 + i * 64;
      if (o + 64 > bytes.length) break;
      const prefix = PREFIX[dv.getInt8(o + 6) >> 4] || 0;
      const vtype = dv.getInt32(o + 32, little);
      const pname = str(o + 36, 28).replace(/\s+$/, "").toLowerCase();
      let value2;
      if (vtype === 0) value2 = str(o + 16, 16).trim();
      else if (vtype === 1 || vtype === 4) value2 = dv.getInt32(o + 16, little);
      else if (vtype === 2) value2 = dv.getFloat64(o + 16, little) * Math.pow(10, prefix);
      params[pname] = value2;
    }
    const read = (off, n) => {
      const a = new Float64Array(n);
      for (let i = 0; i < n; i++) a[i] = float32 ? dv.getFloat32(off + i * 4, little) : dv.getFloat64(off + i * 8, little);
      return a;
    };
    const size = float32 ? 4 : 8;
    const re = read(dataStart, points);
    const im = axisType === 3 ? read(dataStart + points * size, points) : null;
    const nucleus = String(params.x_domain || "1H").replace(/[^0-9A-Za-z]/g, "");
    const freq = params.x_freq ? params.x_freq / 1e6 : baseFreq;
    const meta = { pulseSequence: params.experiment, scans: params.scans, temperature: params.temp_get, origin: "JEOL", date: void 0 };
    const base = { name, title: params.sample_id || title || name, nucleus, frequency: freq, solvent: params.solvent, meta, source: "JEOL Delta" };
    if (unitBase === "s") {
      const sw = params.x_sweep;
      const used = Math.min(points, params.x_points || points);
      return {
        ...base,
        fid: {
          re: re.subarray(0, used),
          im: (im || new Float64Array(points)).subarray(0, used),
          sw,
          centerPpm: params.x_offset || 0,
          grpdly: jeolDigitalFilter(params),
          origin: "jeol",
          // JEOL records the opposite quadrature sense to Bruker.
          reverse: true
        }
      };
    }
    let start = axisStart, stop = axisStop;
    if (unitBase === "Hz") {
      start /= freq;
      stop /= freq;
    }
    const real = Float64Array.from(re), imag = im ? Float64Array.from(im) : null;
    if (start < stop) {
      real.reverse();
      if (imag) imag.reverse();
      [start, stop] = [stop, start];
    }
    return { ...base, real, imag, ppmStart: start, ppmEnd: stop };
  }
  function jeolDigitalFilter(p) {
    const orders = String(p.orders || "").replace(/\s/g, ""), factors = String(p.factors || "").replace(/\s/g, "");
    if (!orders || !factors || !p.x_sweep || !p.x_acq_time || !p.x_points) return 0;
    const n = parseInt(orders[0], 10);
    if (!n) return 0;
    const w = (orders.length - 1) / n;
    const f = [];
    for (let i = 0; i < n; i++) f.push(parseInt(factors[i], 10));
    let s = 0;
    for (let i = 0; i < n; i++) {
      let prod = 1;
      for (let j = i; j < n; j++) prod *= f[j];
      s += (parseInt(orders.slice(1 + i * w, 1 + (i + 1) * w), 10) - 1) / prod;
    }
    s /= 2;
    return s / p.x_sweep / p.x_acq_time * (p.x_points - 1);
  }

  // core/nmrpipe.js
  function isNmrPipe(bytes) {
    if (bytes.length < 2048 + 16) return false;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return Math.abs(dv.getFloat32(8, true) - 2.345) < 1e-3 || Math.abs(dv.getFloat32(8, false) - 2.345) < 1e-3;
  }
  function readNmrPipe(bytes, name = "spectrum.ft") {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const le = Math.abs(dv.getFloat32(8, true) - 2.345) < 1e-3;
    const h = (i) => dv.getFloat32(i * 4, le);
    if (Math.round(h(9)) !== 1) throw new Error("Only 1D NMRPipe files are supported for now");
    const size = Math.round(h(99));
    const complex = Math.round(h(106)) === 0;
    const sw = h(100), obs = h(119), orig = h(101), car = h(66);
    const ft = Math.round(h(220)) === 1;
    let label = "";
    for (let i = 0; i < 8; i++) {
      const c = bytes[16 * 4 + i];
      if (c) label += String.fromCharCode(c);
    }
    const read = (off) => {
      const a = new Float64Array(size);
      for (let i = 0; i < size; i++) a[i] = dv.getFloat32(2048 + (off + i) * 4, le);
      return a;
    };
    const re = read(0), im = complex ? read(size) : null;
    const nucleus = label.trim() || "1H";
    const base = { name, title: name, nucleus, frequency: obs, solvent: void 0, meta: { origin: "NMRPipe" }, source: "NMRPipe" };
    if (!ft) return { ...base, fid: { re, im: im || new Float64Array(size), sw, centerPpm: car, grpdly: 0, origin: "nmrpipe" } };
    return { ...base, real: re, imag: im, ppmStart: (orig + sw * (size - 1) / size) / obs, ppmEnd: orig / obs };
  }

  // core/nmrml.js
  function b64(s) {
    const T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const m = new Uint8Array(128);
    for (let i = 0; i < 64; i++) m[T.charCodeAt(i)] = i;
    s = s.replace(/[^A-Za-z0-9+/]/g, "");
    const out = new Uint8Array(Math.floor(s.length * 3 / 4));
    let o = 0;
    for (let i = 0; i < s.length; i += 4) {
      const n = m[s.charCodeAt(i)] << 18 | m[s.charCodeAt(i + 1)] << 12 | m[s.charCodeAt(i + 2)] << 6 | m[s.charCodeAt(i + 3)];
      out[o++] = n >> 16 & 255;
      if (i + 2 < s.length) out[o++] = n >> 8 & 255;
      if (i + 3 < s.length) out[o++] = n & 255;
    }
    return out.subarray(0, o);
  }
  function attr(tag, name) {
    const m = tag && tag.match(new RegExp(name + '="([^"]*)"'));
    return m ? m[1] : void 0;
  }
  function binary(xml, element) {
    const m = xml.match(new RegExp("<" + element + "([^>]*)>([^<]*)</" + element + ">"));
    if (!m) return null;
    let bytes = b64(m[2]);
    if (attr(m[1], "compressed") === "true") bytes = inflateZlib(bytes);
    const fmt = (attr(m[1], "byteFormat") || "complex128").toLowerCase();
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const size = /64/.test(fmt) && !/128/.test(fmt) ? 4 : 8;
    const isInt = /int/.test(fmt);
    const n = Math.floor(bytes.length / size);
    const vals = new Float64Array(n);
    for (let i = 0; i < n; i++) vals[i] = isInt ? size === 8 ? Number(dv.getBigInt64(i * 8, true)) : dv.getInt32(i * 4, true) : size === 8 ? dv.getFloat64(i * 8, true) : dv.getFloat32(i * 4, true);
    return vals;
  }
  var value = (xml, el) => {
    const m = xml.match(new RegExp("<" + el + '[^>]*value="([^"]*)"'));
    return m ? parseFloat(m[1]) : void 0;
  };
  function readNmrML(text, name = "spectrum.nmrML") {
    const nuc = (text.match(/<acquisitionNucleus[^>]*name="([^"]*)"/) || [])[1] || "1H";
    const freq = value(text, "effectiveExcitationField") || value(text, "irradiationFrequency") / 1e6 || 400;
    const sw = value(text, "sweepWidth");
    const solvent = (text.match(/<fieldFrequencyLock[^>]*fieldFrequencyLockName="([^"]*)"/) || [])[1];
    const base = { name, title: name, nucleus: nuc.replace(/[^0-9A-Za-z]/g, ""), frequency: freq, solvent, meta: { origin: "nmrML" }, source: "nmrML" };
    const spec = binary(text, "spectrumDataArray");
    if (spec) {
      const x = text.match(/<xAxis[^>]*>/);
      const start = parseFloat(attr(x && x[0], "startValue")), end = parseFloat(attr(x && x[0], "endValue"));
      const n2 = spec.length / 2;
      const re2 = new Float64Array(n2), im2 = new Float64Array(n2);
      for (let i = 0; i < n2; i++) {
        re2[i] = spec[2 * i];
        im2[i] = spec[2 * i + 1];
      }
      let a = isNaN(start) ? 12 : start, b = isNaN(end) ? -1 : end;
      if (a < b) {
        re2.reverse();
        im2.reverse();
        [a, b] = [b, a];
      }
      return { ...base, real: re2, imag: im2, ppmStart: a, ppmEnd: b };
    }
    const fid = binary(text, "fidData");
    if (!fid) throw new Error("nmrML file has no FID or spectrum data");
    const n = fid.length / 2;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      re[i] = fid[2 * i];
      im[i] = fid[2 * i + 1];
    }
    const offset = value(text, "irradiationFrequencyOffset");
    return { ...base, fid: { re, im, sw: sw || 1, centerPpm: offset !== void 0 ? offset / freq : 4.7, grpdly: 0, origin: "nmrml" } };
  }

  // core/magritek.js
  function parseAcquPar(text) {
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([^=]+?)\s*=\s*(.*)$/);
      if (!m) continue;
      const v = m[2].trim().replace(/^"|"$/g, "");
      out[m[1]] = isNaN(Number(v)) || v === "" ? v : Number(v);
    }
    return out;
  }
  function read1d(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const xDim = dv.getInt32(16, true);
    const rest = bytes.length - 32;
    let axis = null, off = 32;
    if (rest === xDim * 4 + xDim * 8) {
      axis = new Float64Array(xDim);
      for (let i = 0; i < xDim; i++) axis[i] = dv.getFloat32(32 + i * 4, true);
      off = 32 + xDim * 4;
    } else if (rest === xDim * 16) {
      axis = new Float64Array(xDim);
      for (let i = 0; i < xDim; i++) axis[i] = dv.getFloat32(32 + i * 8, true);
      off = 32 + xDim * 8;
    }
    const re = new Float64Array(xDim), im = new Float64Array(xDim);
    for (let i = 0; i < xDim; i++) {
      re[i] = dv.getFloat32(off + i * 8, true);
      im[i] = dv.getFloat32(off + i * 8 + 4, true);
    }
    return { axis, re, im };
  }
  function readMagritek(files, name = "spinsolve") {
    const par = parseAcquPar(new TextDecoder("latin1").decode(files.get("acqu.par")));
    const freq = par.b1Freq || par.Frequency || 43;
    const nucleus = String(par.rxChannel || "1H").replace(/[^0-9A-Za-z]/g, "");
    const base = {
      name,
      title: par.Sample || par.Protocol || name,
      nucleus,
      frequency: freq,
      solvent: par.Solvent,
      meta: { pulseSequence: par.Protocol, scans: par.nrScans, origin: "Magritek Spinsolve", date: par.startTime },
      source: "Magritek Spinsolve"
    };
    let out = { ...base };
    const spec = files.get("spectrum.1d");
    if (spec) {
      const { axis, re, im } = read1d(spec);
      let a = axis ? axis[0] : 12, b = axis ? axis[axis.length - 1] : -1;
      if (axis && Math.abs(a) > 500) {
        a /= freq;
        b /= freq;
      }
      const R = Float64Array.from(re), I = Float64Array.from(im);
      if (a < b) {
        R.reverse();
        I.reverse();
        [a, b] = [b, a];
      }
      out = { ...out, real: R, imag: I, ppmStart: a, ppmEnd: b };
    }
    const fid = files.get("data.1d");
    if (fid) {
      const { re, im } = read1d(fid);
      const sw = (par.bandwidth || 5) * 1e3;
      const low = par.lowestFrequency !== void 0 ? par.lowestFrequency / freq : -sw / freq / 2 + 5;
      out.fid = { re, im, sw, centerPpm: low + sw / freq / 2, grpdly: 0, origin: "magritek" };
    }
    if (!out.fid && !out.real) throw new Error("Spinsolve folder has no data.1d or spectrum.1d");
    return out;
  }

  // core/mnova.js
  var dec2 = (b) => new TextDecoder("latin1").decode(b);
  var u32 = (b, p) => (b[p] << 24 | b[p + 1] << 16 | b[p + 2] << 8 | b[p + 3]) >>> 0;
  function lastUtf16(b, from, to, minLen = 3) {
    let best = null, run = "", start = -1;
    for (let p = Math.max(0, from); p + 1 < to; p += 2) {
      const ok = b[p] === 0 && b[p + 1] >= 32 && b[p + 1] < 127;
      if (ok) {
        if (!run) start = p;
        run += String.fromCharCode(b[p + 1]);
      }
      if (!ok || p + 3 >= to) {
        if (run.length >= minLen) best = { text: run, at: start };
        run = "";
      }
    }
    return best;
  }
  function findBlocks(b) {
    const blocks = [];
    for (let p = 8; p < b.length - 2; p++) {
      if (b[p] !== 120 || b[p + 1] !== 156 && b[p + 1] !== 218 && b[p + 1] !== 1 && b[p + 1] !== 94) continue;
      const clen = u32(b, p - 8) - 4, rawLen = u32(b, p - 4);
      if (clen <= 2 || clen > b.length - p || rawLen > 64e6) continue;
      try {
        const data = inflateZlib(b.subarray(p, p + clen));
        if (data.length !== rawLen) continue;
        const evenFrom = p - 8 - 200 - (p - 8) % 2;
        const n1 = lastUtf16(b, evenFrom, p - 8), n2 = lastUtf16(b, evenFrom + 1, p - 8);
        const nm = [n1, n2].filter(Boolean).sort((x, y) => y.at - x.at)[0];
        blocks.push({ at: p, end: p + clen, name: nm ? nm.text : "", data });
        p += clen - 1;
      } catch (e) {
      }
    }
    return blocks;
  }
  function findFid(b, from, to, td) {
    for (const size of [4, 8]) {
      const want = td * size;
      for (let p = from; p + 5 + want <= Math.min(b.length, to + 5 + want); p++) {
        if (u32(b, p) !== want || b[p + 4] > 1) continue;
        const dv = new DataView(b.buffer, b.byteOffset + p + 5, want);
        const vals = new Float64Array(td);
        let finite = true, energy = 0;
        for (let i = 0; i < td; i++) {
          const v = size === 4 ? dv.getFloat32(i * 4, true) : dv.getFloat64(i * 8, true);
          if (!Number.isFinite(v) || Math.abs(v) > 1e30) {
            finite = false;
            break;
          }
          vals[i] = v;
          energy += v * v;
        }
        if (finite && energy > 0) return { at: p, vals };
      }
    }
    return null;
  }
  function readMnovaBruker(b, name) {
    const blocks = findBlocks(b);
    const out = [], seen = /* @__PURE__ */ new Set();
    let group = /* @__PURE__ */ new Map();
    for (let k = 0; k < blocks.length; k++) {
      const blk = blocks[k];
      const file = blk.name.split("/").pop();
      if (file === "procs") group.set("pdata/1/procs", blk.data);
      else if (file === "title") group.set("pdata/1/title", blk.data);
      else if (file === "acqus") {
        group.set("acqus", blk.data);
        const files = group;
        group = /* @__PURE__ */ new Map();
        const acqus = parseBrukerParams(dec2(blk.data));
        const td = parseInt(acqus.$TD, 10);
        if (!(td > 0)) continue;
        const next = blocks.slice(k + 1).find((x) => x.name.split("/").pop() === "acqus");
        const limit = next ? next.at : b.length;
        const fid = findFid(b, blk.end, limit, td);
        if (!fid || seen.has(fid.at)) continue;
        seen.add(fid.at);
        const label = expName(b, blk.end, fid.at) || name;
        try {
          const ds = readBruker(files, label, { fidValues: fid.vals });
          if (!files.get("pdata/1/title") || !dec2(files.get("pdata/1/title")).trim()) ds.title = label;
          ds.source = "MestReNova (Bruker data)";
          if (ds.fid) ds.fid.origin = "mnova";
          out.push(ds);
        } catch (e) {
        }
      }
    }
    return out;
  }
  function expName(b, from, to) {
    let best = null;
    for (const off of [0, 1]) {
      let p = from + ((from + off) % 2 ? 1 : 0);
      let run = "";
      for (; p + 1 < to; p += 2) {
        if (b[p] === 0 && b[p + 1] >= 32 && b[p + 1] < 127) {
          run += String.fromCharCode(b[p + 1]);
          continue;
        }
        const m = run.match(/([^/\\]+)[/\\](\d+)[/\\](?:fid|ser|acqus?)$/);
        if (m) best = `${m[1]} (${m[2]})`;
        run = "";
      }
    }
    return best;
  }
  function readMnova(bytes, name = "document.mnova") {
    const found = [];
    try {
      found.push(...readMnovaBruker(bytes, name));
    } catch (e) {
    }
    if (found.length) return found;
    const tryText = (u8) => {
      const s = dec2(u8);
      let i = s.indexOf("##TITLE=");
      while (i >= 0 && found.length < 20) {
        const end = s.indexOf("##END=", i);
        if (end < 0) break;
        const block = s.slice(i, end + 8);
        if (/##DATA ?TABLE|##XYDATA|##PEAK ?TABLE|##XYPOINTS/i.test(block)) {
          try {
            for (const ds of readJcamp(block, name)) found.push({ ...ds, source: "MestReNova (embedded JCAMP-DX)" });
          } catch (e) {
          }
        }
        i = s.indexOf("##TITLE=", end);
      }
    };
    tryText(bytes);
    if (!found.length) {
      for (const blk of findBlocks(bytes)) if (blk.data.length > 64) tryText(blk.data);
    }
    if (!found.length) {
      throw new Error("Could not find spectrum data inside this .mnova document. In MestReNova choose File \u203A Save As\u2026 \u203A JCAMP-DX (*.jdx) and open that, or open the original instrument folder.");
    }
    return found;
  }

  // core/loader.js
  var JCAMP_EXT = /\.(jdx|dx|jcamp|jcm)$/i;
  var TEXT_EXT = /\.(csv|tsv|txt|asc|xy)$/i;
  function loadExpanded(all) {
    const datasets = [];
    const warnings = [];
    const used = /* @__PURE__ */ new Set();
    const brukerDirs = [...all.keys()].filter((p) => /(^|\/)acqus$/.test(p)).map((p) => p.replace(/acqus$/, ""));
    for (const dir of brukerDirs.sort()) {
      if (all.has(dir + "acqu2s")) {
        warnings.push(`${dir || "Bruker data"}: 2D experiment skipped (1D only for now)`);
        markUsed(all, dir, used);
        continue;
      }
      const sub = subset(all, dir);
      try {
        datasets.push(normalise(readBruker(sub, nameFor(dir, "Bruker"))));
      } catch (e) {
        warnings.push(`${dir}: ${e.message}`);
      }
      markUsed(all, dir, used);
    }
    const varianDirs = [...all.keys()].filter((p) => /(^|\/)procpar$/.test(p)).map((p) => p.replace(/procpar$/, ""));
    for (const dir of varianDirs) {
      if (used.has(dir + "procpar")) continue;
      try {
        datasets.push(normalise(readVarian(subset(all, dir), nameFor(dir, "Varian"))));
      } catch (e) {
        warnings.push(`${dir}: ${e.message}`);
      }
      markUsed(all, dir, used);
    }
    const magDirs = [...all.keys()].filter((p) => /(^|\/)acqu\.par$/.test(p)).map((p) => p.replace(/acqu\.par$/, ""));
    for (const dir of magDirs) {
      if (!all.has(dir + "data.1d") && !all.has(dir + "spectrum.1d")) continue;
      try {
        datasets.push(normalise(readMagritek(subset(all, dir), nameFor(dir, "Spinsolve"))));
      } catch (e) {
        warnings.push(`${dir}: ${e.message}`);
      }
      for (const f of ["acqu.par", "data.1d", "spectrum.1d"]) used.add(dir + f);
    }
    for (const [path, data] of all) {
      if (used.has(path)) continue;
      const base = path.split("/").pop();
      try {
        if (/\.mnova$/i.test(path)) {
          for (const ds of readMnova(data, base)) datasets.push(normalise(ds));
        } else if (/\.jdf$/i.test(path) || isJeol(data)) {
          datasets.push(normalise(readJeol(data, base)));
        } else if (/\.nmrml$/i.test(path) || /\.xml$/i.test(path) && /<nmrML/.test(new TextDecoder("latin1").decode(data.subarray(0, 2e3)))) {
          datasets.push(normalise(readNmrML(new TextDecoder().decode(data), base)));
        } else if (isNmrPipe(data)) {
          datasets.push(normalise(readNmrPipe(data, base)));
        } else if (JCAMP_EXT.test(path) || data.length > 8 && data[0] === 35 && data[1] === 35) {
          const text = new TextDecoder("latin1").decode(data);
          for (const ds of readJcamp(text, base)) datasets.push(normalise(ds));
        } else if (TEXT_EXT.test(path) && !/^(audit|title|integrals|peaklist|format)/i.test(base)) {
          const ds = readText(new TextDecoder().decode(data), base);
          if (ds) datasets.push(normalise(ds));
        }
      } catch (e) {
        warnings.push(`${base}: ${e.message}`);
      }
    }
    if (!datasets.length && !warnings.length) warnings.push("No supported NMR data found. Supported: Bruker, JEOL (.jdf), Varian/Agilent, Magritek Spinsolve, NMRPipe, nmrML, JCAMP-DX, MestReNova (.mnova), CSV/TXT.");
    return { datasets, warnings };
  }
  function subset(all, dir) {
    const m = /* @__PURE__ */ new Map();
    for (const [p, d] of all) if (p.startsWith(dir)) m.set(p.slice(dir.length), d);
    return m;
  }
  function markUsed(all, dir, used) {
    for (const p of all.keys()) if (p.startsWith(dir) && !p.slice(dir.length).match(/\.(jdx|dx)$/i)) used.add(p);
  }
  function nameFor(dir, fallback) {
    const parts = dir.split("/").filter(Boolean);
    return parts.slice(-2).join("/") || fallback;
  }
  var counter = 0;
  function normalise(ds) {
    const out = { ...ds, id: "ds" + ++counter + "-" + Math.random().toString(36).slice(2, 7) };
    out.nucleus = canonicalNucleus(ds.nucleus);
    if (ds.real) {
      out.rawReal = ds.real;
      out.rawImag = ds.imag || null;
      out.rawPpmStart = ds.ppmStart;
      out.rawPpmEnd = ds.ppmEnd;
    }
    delete out.real;
    delete out.imag;
    return out;
  }
  function canonicalNucleus(n) {
    if (!n) return "1H";
    const s = String(n).replace(/[^0-9A-Za-z]/g, "");
    const named = { proton: "1H", hydrogen: "1H", carbon: "13C", carbon13: "13C", fluorine: "19F", fluorine19: "19F", phosphorus: "31P", phosphorus31: "31P", nitrogen15: "15N", silicon29: "29Si", deuterium: "2H" };
    if (named[s.toLowerCase()]) return named[s.toLowerCase()];
    const m = s.match(/^(\d+)([A-Za-z]+)$/) || s.match(/^([A-Za-z]+)(\d+)$/);
    if (!m) return s;
    const [num2, el] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    return num2 + el[0].toUpperCase() + el.slice(1).toLowerCase();
  }

  // core/fft.js
  function fft(re, im, inverse = false) {
    const n = re.length;
    if (n & n - 1) throw new Error("FFT length must be a power of two");
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    const sign = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
      const ang = sign * 2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const xr = re[b] * cr - im[b] * ci;
          const xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = ncr;
        }
      }
    }
    if (inverse) {
      for (let i = 0; i < n; i++) {
        re[i] /= n;
        im[i] /= n;
      }
    }
  }
  function nextPow2(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
  }

  // core/processing.js
  function ppmAxis(spec) {
    const n = spec.real.length;
    const step = (spec.ppmEnd - spec.ppmStart) / (n - 1);
    return { n, step, at: (i) => spec.ppmStart + i * step, index: (ppm) => (ppm - spec.ppmStart) / step };
  }
  function defaultProcessing(ds) {
    const c13 = /13C/i.test(ds.nucleus || "");
    return { lb: c13 ? 1 : 0.3, zf: 2, ph0: 0, ph1: 0, autoPhase: true, baseline: true, maxPoints: c13 ? 131072 : 65536 };
  }
  function transformFid(fid, frequency, opts) {
    const n0 = fid.re.length;
    const sw = fid.sw;
    let n = Math.min(nextPow2(n0) * Math.max(1, opts.zf || 1), Math.max(opts.maxPoints || 65536, nextPow2(n0)));
    const re = new Float64Array(n), im = new Float64Array(n);
    const lb = opts.lb || 0;
    const conj = !!fid.reverse !== !!opts.reverse ? -1 : 1;
    for (let i = 0; i < n0 && i < n; i++) {
      const w = Math.exp(-Math.PI * lb * i / sw);
      re[i] = fid.re[i] * w;
      im[i] = conj * fid.im[i] * w;
    }
    if (!fid.grpdly) {
      re[0] *= 0.5;
      im[0] *= 0.5;
    }
    fft(re, im);
    const R = new Float64Array(n), I = new Float64Array(n);
    const half = n >> 1;
    for (let j = 0; j < n; j++) {
      const src = (j + half) % n;
      const dst = n - 1 - j;
      let r = re[src], m = im[src];
      if (fid.grpdly) {
        const k = j - half;
        const a = 2 * Math.PI * fid.grpdly * k / n;
        const c = Math.cos(a), s = Math.sin(a);
        const nr = r * c - m * s;
        m = r * s + m * c;
        r = nr;
      }
      R[dst] = r;
      I[dst] = m;
    }
    const swPpm = sw / frequency;
    const ppmStart = fid.centerPpm + (half - 1) * swPpm / n;
    const ppmEnd = fid.centerPpm - half * swPpm / n;
    return { real: R, imag: I, ppmStart, ppmEnd };
  }
  function applyPhase(re, im, ph0, ph1) {
    const n = re.length;
    const R = new Float64Array(n), I = new Float64Array(n);
    const d = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const p = (ph0 + ph1 * (i / (n - 1) - 0.5)) * d;
      const c = Math.cos(p), s = Math.sin(p);
      R[i] = re[i] * c - im[i] * s;
      I[i] = re[i] * s + im[i] * c;
    }
    return { re: R, im: I };
  }
  function autoPhase(re, im, opts = {}) {
    const n = re.length;
    const mag = new Float64Array(n);
    let max = 0;
    for (let i = 0; i < n; i++) {
      mag[i] = Math.hypot(re[i], im[i]);
      if (mag[i] > max) max = mag[i];
    }
    const sorted = Float64Array.from(mag).sort();
    const floor = sorted[Math.floor(n * 0.5)] * 4;
    const thr = Math.max(floor, max * 2e-3);
    let idx = [];
    for (let i = 0; i < n; i++) if (mag[i] > thr) idx.push(i);
    if (idx.length > 4e3) {
      const stride = idx.length / 4e3;
      const keep = [];
      for (let k = 0; k < 4e3; k++) keep.push(idx[Math.floor(k * stride)]);
      idx = keep;
    }
    if (!idx.length) return { ph0: 0, ph1: 0 };
    const fr = idx.map((i) => i / (n - 1) - 0.5);
    const rr = idx.map((i) => re[i]), ii = idx.map((i) => im[i]);
    const w = idx.map((i) => 1);
    const d = Math.PI / 180;
    const cost = (p0, p1) => {
      let neg = 0, tot = 0, sum = 0;
      for (let k = 0; k < idx.length; k++) {
        const p = (p0 + p1 * fr[k]) * d;
        const r = rr[k] * Math.cos(p) - ii[k] * Math.sin(p);
        if (r < 0) neg += r * r;
        tot += r * r;
        sum += r * w[k];
      }
      return neg / (tot || 1) - (sum > 0 ? 1e-3 : 0);
    };
    let best = { c: Infinity, p0: 0, p1: 0 };
    const L = idx.length, rp = new Float64Array(L), ip = new Float64Array(L);
    for (let p1 = -180; p1 <= 180; p1 += 15) {
      for (let k = 0; k < L; k++) {
        const p = p1 * fr[k] * d, c = Math.cos(p), s = Math.sin(p);
        rp[k] = rr[k] * c - ii[k] * s;
        ip[k] = rr[k] * s + ii[k] * c;
      }
      for (let p0 = -180; p0 < 180; p0 += 10) {
        const c0 = Math.cos(p0 * d), s0 = Math.sin(p0 * d);
        let neg = 0, tot = 0, sum = 0;
        for (let k = 0; k < L; k++) {
          const r = rp[k] * c0 - ip[k] * s0;
          if (r < 0) neg += r * r;
          tot += r * r;
          sum += r;
        }
        const c = neg / (tot || 1) - (sum > 0 ? 1e-3 : 0);
        if (c < best.c) best = { c, p0, p1 };
      }
    }
    let res = nelderMead((v) => cost(v[0], v[1]), [best.p0, best.p1], [5, 8], 150);
    const step = Math.max(1, Math.floor(n / 8192));
    const m = Math.floor(n / step);
    const r22 = new Float64Array(m), i2 = new Float64Array(m);
    for (let k = 0; k < m; k++) {
      r22[k] = re[k * step];
      i2[k] = im[k * step];
    }
    const full = (p0, p1) => {
      const a0 = (p0 - 0.5 * p1) * d, da = p1 * d * step / (n - 1);
      let c = Math.cos(a0), s = Math.sin(a0);
      const dc = Math.cos(da), ds = Math.sin(da);
      let neg = 0, pos = 0;
      for (let k = 0; k < m; k++) {
        const r = r22[k] * c - i2[k] * s;
        if (r < 0) neg -= r;
        else pos += r;
        const nc = c * dc - s * ds;
        s = s * dc + c * ds;
        c = nc;
      }
      return neg / (pos || 1);
    };
    let fb = { c: Infinity, p0: 0, p1: 0 };
    for (let p1 = -360; p1 <= 360; p1 += 15) {
      for (let p0 = -180; p0 < 180; p0 += 10) {
        const c = full(p0, p1);
        if (c < fb.c) fb = { c, p0, p1 };
      }
    }
    const alt = nelderMead((v) => full(v[0], v[1]), [fb.p0, fb.p1], [5, 8], 150);
    if (opts.wholeSpectrum !== false && full(alt[0], alt[1]) < 0.5 * full(res[0], res[1])) res = alt;
    let ph0 = (res[0] + 540) % 360 - 180;
    return { ph0, ph1: res[1] };
  }
  function nelderMead(f, x0, step, iters = 200) {
    const dim = x0.length;
    let pts = [x0.slice()];
    for (let i = 0; i < dim; i++) {
      const p = x0.slice();
      p[i] += step[i];
      pts.push(p);
    }
    let vals = pts.map(f);
    for (let it = 0; it < iters; it++) {
      const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
      pts = order.map((i) => pts[i]);
      vals = order.map((i) => vals[i]);
      const c = new Array(dim).fill(0);
      for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) c[j] += pts[i][j] / dim;
      const worst = pts[dim];
      const refl = c.map((v, j) => v + (v - worst[j]));
      const fr = f(refl);
      if (fr < vals[0]) {
        const exp = c.map((v, j) => v + 2 * (v - worst[j]));
        const fe = f(exp);
        if (fe < fr) {
          pts[dim] = exp;
          vals[dim] = fe;
        } else {
          pts[dim] = refl;
          vals[dim] = fr;
        }
      } else if (fr < vals[dim - 1]) {
        pts[dim] = refl;
        vals[dim] = fr;
      } else {
        const con = c.map((v, j) => v + 0.5 * (worst[j] - v));
        const fc = f(con);
        if (fc < vals[dim]) {
          pts[dim] = con;
          vals[dim] = fc;
        } else {
          for (let i = 1; i <= dim; i++) {
            pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j]));
            vals[i] = f(pts[i]);
          }
        }
      }
    }
    return pts[vals.indexOf(Math.min(...vals))];
  }
  function estimateNoise(y) {
    const n = y.length;
    const bins = 64;
    const size = Math.floor(n / bins);
    const sds = [];
    for (let b = 0; b < bins; b++) {
      const o = b * size;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let i = 0; i < size; i++) {
        const v = y[o + i];
        sx += i;
        sy += v;
        sxx += i * i;
        sxy += i * v;
      }
      const slope = (size * sxy - sx * sy) / (size * sxx - sx * sx || 1);
      const icpt = (sy - slope * sx) / size;
      let ss = 0;
      for (let i = 0; i < size; i++) {
        const r = y[o + i] - icpt - slope * i;
        ss += r * r;
      }
      sds.push(Math.sqrt(ss / size));
    }
    sds.sort((a, c) => a - c);
    return sds[Math.floor(bins * 0.15)] || 1e-9;
  }
  function baselineCorrect(y, order = 4) {
    const n = y.length;
    const bins = 256;
    const size = Math.max(4, Math.floor(n / bins));
    const sigma = estimateNoise(y);
    const xs = [], ys = [];
    for (let b = 0; b * size < n; b++) {
      const seg = Array.from(y.subarray(b * size, Math.min(n, (b + 1) * size)));
      if (seg.length < 3) continue;
      const s = seg.slice().sort((a, c) => a - c);
      const med = s[Math.floor(s.length / 2)];
      const range = s[Math.floor(s.length * 0.95)] - s[Math.floor(s.length * 0.05)];
      if (range < 8 * sigma) {
        xs.push((b + 0.5) * size / n * 2 - 1);
        ys.push(med);
      }
    }
    if (xs.length < order + 2) return { y: Float64Array.from(y), baseline: new Float64Array(n) };
    let keepX = xs, keepY = ys, coef;
    for (let iter = 0; iter < 4; iter++) {
      coef = polyfit(keepX, keepY, order);
      const res = keepY.map((v, i) => v - polyval(coef, keepX[i]));
      const sd = Math.sqrt(res.reduce((a, r) => a + r * r, 0) / res.length);
      const nx = [], ny = [];
      for (let i = 0; i < res.length; i++) if (Math.abs(res[i]) < 2.5 * sd + sigma) {
        nx.push(keepX[i]);
        ny.push(keepY[i]);
      }
      if (nx.length === keepX.length || nx.length < order + 2) break;
      keepX = nx;
      keepY = ny;
    }
    const baseline = new Float64Array(n);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      baseline[i] = polyval(coef, i / n * 2 - 1);
      out[i] = y[i] - baseline[i];
    }
    return { y: out, baseline };
  }
  function polyfit(x, y, order) {
    const m = order + 1;
    const A = Array.from({ length: m }, () => new Float64Array(m + 1));
    for (let k = 0; k < x.length; k++) {
      const p = [1];
      for (let j = 1; j < 2 * m; j++) p.push(p[j - 1] * x[k]);
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < m; j++) A[i][j] += p[i + j];
        A[i][m] += p[i] * y[k];
      }
    }
    for (let i = 0; i < m; i++) {
      let piv = i;
      for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
      [A[i], A[piv]] = [A[piv], A[i]];
      const d = A[i][i] || 1e-30;
      for (let r = 0; r < m; r++) {
        if (r === i) continue;
        const f = A[r][i] / d;
        for (let c = i; c <= m; c++) A[r][c] -= f * A[i][c];
      }
    }
    return Array.from({ length: m }, (_, i) => A[i][m] / (A[i][i] || 1e-30));
  }
  function polyval(c, x) {
    let v = 0;
    for (let i = c.length - 1; i >= 0; i--) v = v * x + c[i];
    return v;
  }

  // core/analysis.js
  function pickPeaks(spec, opts = {}) {
    const y = spec.real;
    const n = y.length;
    const ax = ppmAxis(spec);
    const noise = estimateNoise(y);
    let max = 0;
    for (let i = 0; i < n; i++) if (y[i] > max) max = y[i];
    const snr = opts.snr ?? (/13C/.test(spec.nucleus) ? 6 : 8);
    const thr = Math.max(snr * noise, (opts.minRelative ?? 2e-3) * max);
    const hzPerPt = Math.abs(ax.step) * spec.frequency;
    const win = Math.max(2, Math.round(1.5 / hzPerPt));
    const maxWin = Math.max(win, Math.round(40 / hzPerPt));
    const peaks = [];
    for (let i = 2; i < n - 2; i++) {
      const v = y[i];
      if (v < thr || v < y[i - 1] || v < y[i + 1]) continue;
      if (v === y[i - 1]) continue;
      let found = false;
      for (let w = win; w <= maxWin && !found; w *= 4) {
        let lmin = v, rmin = v, ok = true;
        for (let k = 1; k <= w; k++) {
          if (i - k >= 0) {
            if (y[i - k] > v) {
              ok = false;
              break;
            }
            lmin = Math.min(lmin, y[i - k]);
          }
          if (i + k < n) {
            if (y[i + k] > v) {
              ok = false;
              break;
            }
            rmin = Math.min(rmin, y[i + k]);
          }
        }
        if (!ok) break;
        found = v - Math.max(lmin, rmin) >= Math.max(3 * noise, 0.03 * v);
      }
      if (!found) continue;
      const a = y[i - 1], b = v, c = y[i + 1];
      const den = a - 2 * b + c;
      const d = den !== 0 ? 0.5 * (a - c) / den : 0;
      let l = i, r = i;
      while (l > 0 && y[l] > v / 2) l--;
      while (r < n - 1 && y[r] > v / 2) r++;
      peaks.push({
        index: i,
        ppm: ax.at(i + d),
        height: b - 0.25 * (a - c) * d,
        widthHz: Math.abs(r - l) * hzPerPt,
        snr: v / noise
      });
    }
    return { peaks, noise, max, threshold: thr };
  }
  function findMultiplets(spec, peaks, noise, opts = {}) {
    const y = spec.real;
    const n = y.length;
    const ax = ppmAxis(spec);
    const freq = spec.frequency || 400;
    const hzPerPt = Math.abs(ax.step) * freq;
    const gapHz = opts.gapHz ?? 14;
    const sorted = peaks.slice().sort((a, b) => a.index - b.index);
    const groups = [];
    for (const p of sorted) {
      const g = groups[groups.length - 1];
      if (g) {
        const last = g[g.length - 1];
        const gap = (p.index - last.index) * hzPerPt;
        let minBetween = Infinity;
        for (let k = last.index; k <= p.index; k++) minBetween = Math.min(minBetween, y[k]);
        const lopsided = gap > gapHz && Math.min(last.height, p.height) < 0.05 * Math.max(...g.map((q) => q.height), p.height);
        if (gap <= gapHz || !lopsided && minBetween > 0.5 * Math.min(last.height, p.height) + 3 * noise) {
          g.push(p);
          continue;
        }
      }
      groups.push([p]);
    }
    const regions = [];
    for (const g of groups) {
      const widest = Math.max(...g.map((p) => p.widthHz), 1);
      const top = Math.max(...g.map((p) => p.height));
      const floor = Math.max(2 * noise, 0.01 * top);
      const maxExt = (4 * widest + 25) / hzPerPt;
      const i0 = g[0].index, i1 = g[g.length - 1].index;
      let a = i0, b = i1;
      while (a > 0 && i0 - a < maxExt && y[a] > floor) a--;
      while (b < n - 1 && b - i1 < maxExt && y[b] > floor) b++;
      regions.push({ from: a, to: b, peaks: g, top });
    }
    const merged = [];
    for (const r of regions) {
      const m = merged[merged.length - 1];
      if (m && r.from <= m.to) {
        let cut = m.to, lo = Infinity;
        const s0 = m.peaks[m.peaks.length - 1].index, s1 = r.peaks[0].index;
        for (let k = s0; k <= s1; k++) if (y[k] < lo) {
          lo = y[k];
          cut = k;
        }
        if (lo < 0.3 * Math.min(m.top, r.top) || Math.min(m.top, r.top) < 0.05 * Math.max(m.top, r.top)) {
          m.to = cut;
          merged.push({ ...r, from: cut + 1, peaks: r.peaks.slice() });
          continue;
        }
        m.to = Math.max(m.to, r.to);
        m.peaks.push(...r.peaks);
        m.top = Math.max(m.top, r.top);
      } else merged.push({ ...r, peaks: r.peaks.slice() });
    }
    const dppm = Math.abs(ax.step);
    for (const r of merged) {
      let s = 0;
      for (let k = r.from; k <= r.to; k++) s += y[k];
      r.area = s * dppm;
      r.ppmFrom = ax.at(r.from);
      r.ppmTo = ax.at(r.to);
    }
    return merged.map((r) => describeMultiplet(r, freq));
  }
  function integrateRange(spec, ppmA, ppmB) {
    const ax = ppmAxis(spec);
    let a = Math.round(ax.index(Math.max(ppmA, ppmB))), b = Math.round(ax.index(Math.min(ppmA, ppmB)));
    a = Math.max(0, a);
    b = Math.min(spec.real.length - 1, b);
    let s = 0;
    for (let k = a; k <= b; k++) s += spec.real[k];
    return { from: a, to: b, area: s * Math.abs(ax.step), ppmFrom: ax.at(a), ppmTo: ax.at(b) };
  }
  var NAMES = { 1: "s", 2: "d", 3: "t", 4: "q", 5: "p", 6: "h", 7: "hept" };
  function describeMultiplet(region, freq) {
    const maxH = Math.max(...region.peaks.map((p) => p.height));
    const lines = region.peaks.filter((p) => p.height > 0.12 * maxH).sort((a, b) => b.ppm - a.ppm);
    const hz = lines.map((p) => p.ppm * freq);
    const sp = [];
    for (let i = 1; i < hz.length; i++) sp.push(hz[i - 1] - hz[i]);
    const k = lines.length;
    let mult = "m", J = [];
    const eq = (arr, tol = 0.18) => {
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.every((v) => Math.abs(v - m) <= tol * m + 0.4);
    };
    const sym = () => {
      for (let i = 0; i < k / 2; i++) if (Math.abs(lines[i].height - lines[k - 1 - i].height) > 0.35 * Math.max(lines[i].height, lines[k - 1 - i].height)) return false;
      return true;
    };
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    if (k === 1) mult = lines[0].widthHz > 6 ? "br s" : "s";
    else if (k === 2 && sp[0] < 20) {
      mult = "d";
      J = [sp[0]];
    } else if (k >= 3 && k <= 7 && eq(sp) && sym() && mean(sp) < 20) {
      const inner = lines[Math.floor(k / 2)].height, outer = lines[0].height;
      if (inner > outer * 1.2) {
        mult = NAMES[k];
        J = [mean(sp)];
      } else if (k === 4) {
        mult = "dd";
        J = [sp[0] + sp[1], sp[0]].sort((a, b) => b - a);
      }
    } else if (k === 4 && sym() && Math.abs(sp[0] - sp[2]) < 0.6 + 0.1 * sp[0]) {
      mult = "dd";
      J = [sp[0] + sp[1], sp[0]].sort((a, b) => b - a);
    } else if (k === 6 && sym() && Math.abs(sp[0] - sp[1]) < 0.8 && Math.abs(sp[3] - sp[4]) < 0.8) {
      mult = "dt";
      J = [hz[0] - hz[3], sp[0]];
    } else if (k === 6 && sym() && Math.abs(sp[0] - sp[4]) < 0.8 && Math.abs(sp[1] - sp[3]) < 0.8 && Math.abs(sp[0] - sp[2]) < 0.8) {
      mult = "td";
      J = [hz[0] - hz[2], sp[0]];
    } else if (k === 8 && sym()) {
      mult = "ddd";
      J = [hz[0] - hz[4], hz[0] - hz[2], sp[0]].sort((a, b) => b - a);
    }
    const center = mult === "m" || !lines.length ? centroid(region) : lines.reduce((a, p) => a + p.ppm, 0) / k;
    return {
      ppm: center,
      ppmFrom: region.ppmFrom,
      ppmTo: region.ppmTo,
      from: region.from,
      to: region.to,
      area: region.area,
      multiplicity: mult,
      J: J.map((v) => Math.round(v * 10) / 10),
      lines: lines.map((p) => p.ppm),
      peaks: region.peaks
    };
  }
  function centroid(region) {
    const ps = region.peaks;
    const w = ps.reduce((a, p) => a + p.height, 0);
    return ps.reduce((a, p) => a + p.ppm * p.height, 0) / (w || 1);
  }
  function normaliseIntegrals(multiplets, totalH) {
    const areas = multiplets.map((m) => m.area).filter((a) => a > 0);
    if (!areas.length) return 1;
    const sum = areas.reduce((a, b) => a + b, 0);
    if (totalH) return sum / totalH;
    const cands = [];
    for (const ref of areas) {
      for (let m = 1; m <= 6; m++) {
        const unit = ref / m;
        const total = sum / unit;
        if (total > 80) continue;
        let cost = 0;
        for (const a of areas) {
          const x = a / unit;
          cost += (x - Math.round(x)) ** 2 * (a / sum) * 10 + (Math.round(x) === 0 ? 2 * (a / sum) : 0);
        }
        cands.push({ cost, unit });
      }
    }
    if (!cands.length) return Math.min(...areas);
    const best = Math.min(...cands.map((c) => c.cost));
    return Math.max(...cands.filter((c) => c.cost <= best + 0.2).map((c) => c.unit));
  }
  function applyIntegralUnit(multiplets, totalH) {
    const usable = (m) => !(m.flag && (m.flag.kind === "solvent" || m.flag.kind === "water")) && !m.excluded;
    const big = Math.max(...multiplets.filter(usable).map((m) => m.area), 0);
    for (const m of multiplets) m.minor = m.area < 0.025 * big;
    const u = normaliseIntegrals(multiplets.filter((m) => usable(m) && !m.minor), totalH);
    for (const m of multiplets) {
      m.nH = m.area / u;
      if (m.nH < 0.4) m.minor = true;
    }
    return u;
  }
  function analyse(spec, opts = {}) {
    const { peaks, noise, max, threshold } = pickPeaks(spec, opts);
    const is1H = /1H/.test(spec.nucleus);
    let multiplets = [];
    if (is1H) {
      multiplets = findMultiplets(spec, peaks, noise, opts);
      applyIntegralUnit(multiplets, opts.totalH);
    } else {
      multiplets = peaks.map((p) => ({ ppm: p.ppm, ppmFrom: p.ppm + 0.15, ppmTo: p.ppm - 0.15, area: p.height, height: p.height, multiplicity: "s", J: [], lines: [p.ppm], peaks: [p] }));
    }
    return { peaks, noise, max, threshold, multiplets };
  }

  // core/database.js
  var H = [
    ["h-si", "Si\u2013CH\u2083 (TMS, silyl ethers)", -0.1, 0.3, 0.05, ["Si"], "silyl tms tbs tms-ether silane", "TMS reference at 0.00 ppm; TBS shows 0.05 (6H) + 0.90 (9H)", { mult: "s" }],
    ["h-cprop", "Cyclopropane C\u2013H", 0.2, 0.8, 0.5, [], "cyclopropyl ring strain", "Shielded by ring current of the strained ring"],
    ["h-ch3", "Alkyl CH\u2083 (R\u2013CH\u2083)", 0.8, 1.05, 0.9, [], "methyl alkyl aliphatic chain", "Triplet next to CH\u2082, doublet next to CH", { nH: 3 }],
    ["h-ch2", "Alkyl CH\u2082 (R\u2013CH\u2082\u2013R)", 1.15, 1.5, 1.3, [], "methylene alkyl aliphatic chain", "Long chains give a broad envelope at 1.25"],
    ["h-ch", "Alkyl CH (methine)", 1.4, 2, 1.6, [], "methine aliphatic branched", ""],
    ["h-tbu", "tert-Butyl C(CH\u2083)\u2083", 0.85, 1.35, 1, [], "tert-butyl tbu boc", "Sharp 9H singlet; Boc group ~1.45", { mult: "s", nH: 9 }],
    ["h-boc", "Boc / tBu ester (OC(CH\u2083)\u2083)", 1.4, 1.5, 1.45, ["O"], "boc tert-butyl ester carbamate protecting", "9H singlet", { mult: "s", nH: 9 }],
    ["h-allyl", "Allylic C=C\u2013CH", 1.6, 2.3, 1.9, [], "allylic alkene", ""],
    ["h-acyl-ch3", "Methyl ketone CH\u2083\u2013C(=O)R", 2.05, 2.7, 2.15, ["O"], "methyl ketone acetyl carbonyl", "Aryl methyl ketones ~2.6", { mult: "s", nH: 3 }],
    ["h-oac", "Acetate CH\u2083\u2013C(=O)O", 1.95, 2.15, 2.05, ["O"], "acetate acetyl ester carbonyl", "Ethyl acetate impurity at 2.05", { mult: "s", nH: 3 }],
    ["h-ch2co", "CH\u2082/CH \u03B1 to C=O", 2.1, 2.7, 2.35, ["O"], "alpha carbonyl ketone ester acid", ""],
    ["h-arch3", "Benzylic CH\u2083 (Ar\u2013CH\u2083)", 2.2, 2.5, 2.33, [], "benzylic toluene aromatic methyl", "", { mult: "s", nH: 3 }],
    ["h-arch2", "Benzylic CH\u2082/CH (Ar\u2013CH)", 2.5, 3, 2.65, [], "benzylic aromatic", ""],
    ["h-alkyne", "Terminal alkyne C\u2261C\u2013H", 1.8, 3.2, 2.5, [], "alkyne acetylene triple bond", "Often a small t or d (\u2074J \u2248 2.5 Hz)"],
    ["h-nch", "Amine N\u2013CH", 2.2, 3, 2.5, ["N"], "amine nitrogen alkylamine", ""],
    ["h-nch3", "Amine N\u2013CH\u2083", 2.2, 2.5, 2.3, ["N"], "amine nitrogen methylamine dimethylamine", "", { mult: "s", nH: 3 }],
    ["h-amide-nch", "Amide N\u2013CH\u2083 / N\u2013CH\u2082", 2.75, 3.5, 2.95, ["N", "O"], "amide nitrogen dmf peptide", "Rotamers can double these signals"],
    ["h-arnch", "Aryl amine Ar\u2013N\u2013CH\u2083", 2.8, 3.1, 2.95, ["N"], "aniline nitrogen", "", { mult: "s" }],
    ["h-sch", "Thioether/thiol S\u2013CH", 2, 2.9, 2.5, ["S"], "sulfur thioether sulfide thiol mercaptan", "S\u2013CH\u2083 \u2248 2.1"],
    ["h-sh", "Thiol S\u2013H", 1.2, 2, 1.4, ["S"], "thiol mercaptan sulfur", "Often a triplet coupling to CH\u2082 (J \u2248 8 Hz)"],
    ["h-so", "Sulfoxide/sulfone CH\u2083\u2013S(O)", 2.5, 3.1, 2.8, ["S", "O"], "sulfoxide sulfone dmso mesyl sulfur", "Mesylate CH\u2083SO\u2082O \u2248 3.0", { mult: "s" }],
    ["h-cl", "Alkyl chloride CH\u2013Cl", 3.4, 4.1, 3.55, ["Cl"], "chloride chlorine halide alkyl halogen", "CHCl\u2082 \u2248 5.8; CH\u2082Cl\u2082 5.30"],
    ["h-br", "Alkyl bromide CH\u2013Br", 3.3, 4.3, 3.45, ["Br"], "bromide bromine halide halogen", ""],
    ["h-i", "Alkyl iodide CH\u2013I", 3.1, 4.3, 3.2, ["I"], "iodide iodine halide halogen", ""],
    ["h-f", "Alkyl fluoride CH\u2013F", 4.3, 4.8, 4.45, ["F"], "fluoride fluorine halide halogen", "Large \xB2J(H,F) \u2248 47 Hz doublet"],
    ["h-ch2cf3", "CH\u2082\u2013CF\u2083", 2.1, 4, 3.9, ["F"], "trifluoromethyl fluorine", "Quartet from \xB3J(H,F) \u2248 8\u201311 Hz"],
    ["h-oh-co", "Ether/alcohol CH\u2013O", 3.3, 4.1, 3.6, ["O"], "ether alcohol oxygen hydroxyl", ""],
    ["h-och3", "Aliphatic methyl ether CH\u2083\u2013O", 3.2, 3.45, 3.35, ["O"], "methoxy ether oxygen", "", { mult: "s", nH: 3 }],
    ["h-arome", "Aryl methyl ether Ar\u2013OCH\u2083", 3.7, 3.95, 3.82, ["O"], "methoxy anisole aryl ether oxygen", "", { mult: "s", nH: 3 }],
    ["h-co2me", "Methyl ester \u2013CO\u2082CH\u2083", 3.6, 3.95, 3.7, ["O"], "methyl ester carbonyl oxygen", "Aryl esters ~3.9", { mult: "s", nH: 3 }],
    ["h-co2ch2", "Ester O\u2013CH\u2082 (e.g. ethyl ester)", 4, 4.45, 4.12, ["O"], "ester ethyl carbonyl oxygen", "Quartet (J \u2248 7.1) in ethyl esters", { mult: "q", nH: 2 }],
    ["h-co2ch", "Ester O\u2013CH (secondary)", 4.75, 5.2, 4.95, ["O"], "ester isopropyl carbonyl oxygen", ""],
    ["h-arch2o", "Benzylic Ar\u2013CH\u2082\u2013O", 4.4, 5.2, 4.6, ["O"], "benzyl ether ester alcohol oxygen bn", "Benzyl ester \u2248 5.1", { nH: 2 }],
    ["h-acetal", "Acetal O\u2013CH\u2013O", 4.5, 5.6, 4.9, ["O"], "acetal sugar anomeric ketal", "Anomeric H in sugars"],
    ["h-epox", "Epoxide CH", 2.5, 3.2, 2.8, ["O"], "epoxide oxirane", ""],
    ["h-no2", "Nitroalkane CH\u2013NO\u2082", 4.3, 4.7, 4.4, ["N", "O"], "nitro nitroalkane nitrogen", ""],
    ["h-cn", "CH \u03B1 to nitrile (CH\u2013C\u2261N)", 2.2, 2.6, 2.35, ["N"], "nitrile cyano nitrogen", ""],
    ["h-pch3", "P\u2013CH\u2083 / P\u2013CH\u2082", 1.2, 2, 1.5, ["P"], "phosphorus phosphonate phosphine phosphonium", "Doublet \xB2J(H,P) \u2248 13\u201318 Hz"],
    ["h-poch2", "Phosphate/phosphonate P\u2013O\u2013CH\u2082", 3.9, 4.2, 4.05, ["P", "O"], "phosphorus phosphate phosphonate ester", "Extra \xB3J(H,P) \u2248 7 Hz splitting"],
    ["h-ph", "P\u2013H (H-phosphonate/phosphine)", 6, 7.8, 6.8, ["P"], "phosphorus phosphite", "Huge \xB9J(H,P) \u2248 600\u2013700 Hz doublet"],
    ["h-oh", "Alcohol O\u2013H", 0.5, 5, 2, ["O"], "alcohol hydroxyl oh exchangeable", "Broad, concentration-dependent; disappears with D\u2082O shake", { mult: "br s", nH: 1 }],
    ["h-nh", "Amine N\u2013H", 0.5, 3.5, 1.5, ["N"], "amine nh exchangeable", "Broad; exchanges with D\u2082O", { mult: "br s" }],
    ["h-nh2ar", "Aniline N\u2013H\u2082", 3.3, 4.2, 3.6, ["N"], "aniline amine nh2 exchangeable", "", { mult: "br s", nH: 2 }],
    ["h-amide-nh", "Amide N\u2013H", 5.5, 8.7, 6.5, ["N", "O"], "amide nh peptide exchangeable", "In DMSO-d\u2086 ~7.5\u20139.5"],
    ["h-phenol", "Phenol O\u2013H", 4.5, 7.5, 5.5, ["O"], "phenol hydroxyl exchangeable", "In DMSO-d\u2086 9\u201310", { mult: "br s", nH: 1 }],
    ["h-boh", "Boronic acid B(OH)\u2082", 4.5, 8.5, 8, ["B", "O"], "boron boronic acid", "Broad; ~8.0 in DMSO-d\u2086", { mult: "br s" }],
    ["h-vinyl2", "Terminal alkene =CH\u2082", 4.6, 5.3, 4.95, [], "alkene vinyl olefin double bond", "cis J \u2248 10, trans J \u2248 17, gem J \u2248 1\u20132 Hz"],
    ["h-vinyl", "Internal alkene CH=CH", 5.2, 5.9, 5.4, [], "alkene olefin double bond", ""],
    ["h-enone", "Conjugated alkene (\u03B1,\u03B2-unsaturated C=O)", 5.8, 7.2, 6.5, ["O"], "enone acrylate alkene michael", "\u03B1-H \u2248 5.8\u20136.2, \u03B2-H \u2248 6.8\u20137.0; trans J \u2248 16 Hz"],
    ["h-vinylo", "Enol ether =CH\u2013O", 6, 6.6, 6.4, ["O"], "enol ether vinyl ether alkene oxygen", ""],
    ["h-arrich", "Aromatic H ortho/para to OR, NR\u2082, OH", 6.5, 7, 6.8, [], "aromatic electron-rich phenol aniline anisole", ""],
    ["h-ar", "Aromatic H (benzene ring)", 6.9, 7.7, 7.3, [], "aromatic benzene phenyl aryl ring", "Monosubstituted phenyl: 5H multiplet; para: two 2H doublets (J \u2248 8.5)"],
    ["h-arpoor", "Aromatic H ortho to C=O, NO\u2082, CN", 7.7, 8.3, 8, [], "aromatic electron-poor nitro carbonyl", ""],
    ["h-pyr-a", "Pyridine \u03B1-H (next to N)", 8.4, 8.8, 8.6, ["N"], "pyridine heteroaromatic nitrogen", ""],
    ["h-pyr-b", "Pyridine \u03B2/\u03B3-H", 7.1, 7.8, 7.4, ["N"], "pyridine heteroaromatic nitrogen", ""],
    ["h-furan", "Furan ring H", 6.2, 7.5, 7.4, ["O"], "furan heteroaromatic oxygen", "\u03B1-H \u2248 7.4, \u03B2-H \u2248 6.3"],
    ["h-thioph", "Thiophene ring H", 6.9, 7.4, 7.1, ["S"], "thiophene heteroaromatic sulfur", ""],
    ["h-pyrrole", "Pyrrole/indole ring C\u2013H", 6, 6.9, 6.6, ["N"], "pyrrole indole heteroaromatic nitrogen", "Indole N\u2013H \u2248 8.1 (br)"],
    ["h-imid", "Imidazole / triazole C\u2013H", 6.9, 8.2, 7.6, ["N"], "imidazole triazole azole heteroaromatic nitrogen", ""],
    ["h-imine", "Imine / oxime CH=N", 7.5, 8.6, 8.1, ["N"], "imine oxime hydrazone schiff base nitrogen", ""],
    ["h-formyl", "Formamide/formate H\u2013C(=O)X", 7.9, 8.3, 8.05, ["O", "N"], "formamide formate dmf", "DMF 8.02"],
    ["h-cho", "Aldehyde CHO", 9.4, 10.2, 9.8, ["O"], "aldehyde formyl carbonyl", "Aryl ~9.9\u201310.1 (s); aliphatic ~9.6\u20139.8 (t, J \u2248 2)", { nH: 1 }],
    ["h-cooh", "Carboxylic acid COOH", 10, 13.5, 11.5, ["O"], "carboxylic acid cooh exchangeable", "Very broad; may be invisible", { mult: "br s", nH: 1 }],
    ["h-chelate", "H-bonded / chelated OH (enol, salicyl)", 11, 16.5, 12.5, ["O"], "enol chelated hydrogen bond salicylaldehyde", "Sharp, downfield"]
  ];
  var C = [
    ["c-si", "Si\u2013CH\u2083", -5, 5, 0, ["Si"], "silyl tms tbs silane", "TMS = 0.0"],
    ["c-i", "C\u2013I", -10, 15, 5, ["I"], "iodide iodine halide halogen", "Heavy-atom shielding moves C\u2013I upfield"],
    ["c-ch3", "Alkyl CH\u2083", 8, 25, 14, [], "methyl alkyl aliphatic", ""],
    ["c-ch2", "Alkyl CH\u2082", 18, 45, 29, [], "methylene alkyl aliphatic", ""],
    ["c-ch", "Alkyl CH / quaternary C", 25, 50, 35, [], "methine quaternary aliphatic", ""],
    ["c-acyl", "CH\u2083/CH\u2082 \u03B1 to C=O", 20, 45, 30, ["O"], "alpha carbonyl acetyl", "Acetyl CH\u2083 \u2248 21 (ester), 26\u201330 (ketone)"],
    ["c-br", "C\u2013Br", 25, 45, 33, ["Br"], "bromide bromine halide halogen", ""],
    ["c-cl", "C\u2013Cl", 40, 65, 45, ["Cl"], "chloride chlorine halide halogen", "CH\u2082Cl\u2082 53.5; CHCl\u2083 77.2"],
    ["c-s", "C\u2013S (thioether)", 10, 45, 30, ["S"], "sulfur thioether sulfide thiol", "S\u2013CH\u2083 \u2248 15"],
    ["c-so", "C\u2013S(O)/C\u2013SO\u2082", 38, 60, 44, ["S", "O"], "sulfoxide sulfone sulfonyl sulfur", "DMSO 40.8"],
    ["c-n", "C\u2013N (amine)", 30, 60, 45, ["N"], "amine nitrogen alkylamine", "N\u2013CH\u2083 \u2248 40\u201345"],
    ["c-namide", "C\u2013N (amide/carbamate)", 25, 55, 37, ["N", "O"], "amide nitrogen peptide", "DMF 36.5, 31.4"],
    ["c-no2", "C\u2013NO\u2082", 70, 80, 75, ["N", "O"], "nitro nitroalkane nitrogen", ""],
    ["c-epox", "Epoxide C\u2013O", 40, 55, 47, ["O"], "epoxide oxirane", ""],
    ["c-co2me", "Methyl ester OCH\u2083", 50, 53, 52, ["O"], "methyl ester methoxy", ""],
    ["c-ome", "Ether OCH\u2083 (aliphatic / aryl)", 54, 62, 55.5, ["O"], "methoxy ether anisole", "Aryl OCH\u2083 \u2248 55\u201356"],
    ["c-co", "C\u2013O (alcohol / ether / ester)", 55, 85, 68, ["O"], "alcohol ether oxygen hydroxyl ester", "Ethyl ester OCH\u2082 \u2248 60.5; sugars 60\u201380"],
    ["c-f", "C\u2013F (aliphatic)", 75, 98, 84, ["F"], "fluoride fluorine halide halogen", "Doublet \xB9J(C,F) \u2248 160\u2013170 Hz"],
    ["c-alkyne", "Alkyne C\u2261C", 65, 95, 80, [], "alkyne triple bond", "Terminal \u2261CH \u2248 68\u201372"],
    ["c-acetal", "Acetal O\u2013C\u2013O", 90, 112, 100, ["O"], "acetal ketal anomeric sugar", ""],
    ["c-alkene", "Alkene C=C", 100, 150, 125, [], "alkene olefin vinyl double bond", "Terminal =CH\u2082 \u2248 110\u2013117"],
    ["c-cn", "Nitrile C\u2261N", 112, 125, 118, ["N"], "nitrile cyano nitrogen", "Weak (no NOE, quaternary)"],
    ["c-cf3", "CF\u2083", 115, 130, 124, ["F"], "trifluoromethyl fluorine", "Quartet \xB9J(C,F) \u2248 270\u2013290 Hz"],
    ["c-ar", "Aromatic C\u2013H / C\u2013C", 115, 145, 128.5, [], "aromatic benzene phenyl aryl ring", "Benzene 128.4; substituted ipso 135\u2013145"],
    ["c-arrich", "Aromatic C ortho/para to O, N", 100, 120, 114, [], "aromatic electron-rich phenol aniline anisole", ""],
    ["c-aro", "Aromatic C\u2013O / C\u2013N (ipso)", 140, 165, 155, ["O", "N"], "phenol anisole aniline ipso aromatic", "Phenol C\u2013OH \u2248 155, anisole C\u2013OMe \u2248 160"],
    ["c-arf", "Aromatic C\u2013F", 155, 168, 162, ["F"], "fluoroarene fluorine", "Doublet \xB9J(C,F) \u2248 245 Hz; ortho C \xB2J \u2248 21 Hz"],
    ["c-hetar", "Heteroaromatic C=N (pyridine C2)", 140, 160, 150, ["N"], "pyridine pyrimidine heteroaromatic nitrogen", ""],
    ["c-imine", "Imine / oxime C=N", 145, 170, 160, ["N"], "imine oxime hydrazone nitrogen", ""],
    ["c-carbonate", "Carbonate / carbamate / urea C=O", 150, 160, 155, ["O", "N"], "carbonate carbamate urea boc carbonyl", "Boc C=O \u2248 155, Boc C(CH\u2083)\u2083 \u2248 80, 28.4"],
    ["c-amide", "Amide C=O", 160, 175, 170, ["N", "O"], "amide lactam peptide carbonyl", ""],
    ["c-ester", "Ester / lactone C=O", 165, 175, 171, ["O"], "ester lactone carbonyl", "Conjugated (benzoate) esters \u2248 166"],
    ["c-anhyd", "Anhydride / acid chloride C=O", 160, 175, 168, ["O", "Cl"], "anhydride acid chloride acyl chloride carbonyl", ""],
    ["c-acid", "Carboxylic acid C=O", 170, 185, 178, ["O"], "carboxylic acid cooh carbonyl", ""],
    ["c-ald", "Aldehyde C=O", 188, 205, 195, ["O"], "aldehyde formyl carbonyl", "Shows as CH in DEPT"],
    ["c-ketone", "Ketone C=O", 195, 220, 208, ["O"], "ketone carbonyl", "Conjugated aryl ketones \u2248 196\u2013200"],
    ["c-cs", "Thiocarbonyl C=S", 190, 215, 200, ["S"], "thiocarbonyl thione thioamide sulfur", ""],
    ["c-cp", "C\u2013P", 10, 40, 25, ["P"], "phosphorus phosphonate phosphine", "Doublet \xB9J(C,P) \u2248 50\u2013140 Hz"],
    ["c-cb", "C\u2013B", 20, 40, 30, ["B"], "boron boronate", "Often broadened beyond detection (quadrupolar \xB9\xB9B)"]
  ];
  function expand(list, nucleus) {
    return list.map(([id, name, min, max, typical, elements, tags, note, expected]) => ({ id, name, nucleus, min, max, typical, elements, tags, note, expected: expected || null }));
  }
  var SHIFT_GROUPS = [...expand(H, "1H"), ...expand(C, "13C")];
  var ELEMENTS = {
    H: { name: "Hydrogen", isotopes: [{ iso: "1H", spin: "1/2", abundance: 99.985, freq: 100, receptivity: 1 }, { iso: "2H", spin: "1", abundance: 0.015, freq: 15.351 }], note: "Deuterium (\xB2H, spin 1) splits solvent \xB9\xB3C peaks into 1:1:1 triplets (CDCl\u2083) or septets (DMSO-d\u2086)." },
    C: { name: "Carbon", isotopes: [{ iso: "13C", spin: "1/2", abundance: 1.07, freq: 25.145, receptivity: 17e-5 }], note: "\xB9\xB3C satellites appear \xB1\xB9J(C,H)/2 (\u2248 \xB162\u201380 Hz) around strong \xB9H singlets at 0.55% each." },
    N: { name: "Nitrogen", isotopes: [{ iso: "14N", spin: "1", abundance: 99.632, freq: 7.226 }, { iso: "15N", spin: "1/2", abundance: 0.368, freq: 10.137 }], note: "Quadrupolar \xB9\u2074N broadens N\u2013H and adjacent \xB9H signals; N\u2013H protons often appear as broad singlets." },
    O: { name: "Oxygen", isotopes: [{ iso: "17O", spin: "5/2", abundance: 0.038, freq: 13.56 }], note: "No observable coupling; oxygen deshields neighbouring H (3.3\u20134.5 ppm) and C (50\u201390 ppm)." },
    F: { name: "Fluorine", isotopes: [{ iso: "19F", spin: "1/2", abundance: 100, freq: 94.094, receptivity: 0.83 }], note: "\xB9\u2079F couples strongly to both \xB9H and \xB9\xB3C: C\u2013F \xB9J \u2248 245 Hz (aryl), CF\u2083 \xB9J \u2248 272 Hz (quartet), \xB2J(H,F) \u2248 47 Hz." },
    P: { name: "Phosphorus", isotopes: [{ iso: "31P", spin: "1/2", abundance: 100, freq: 40.481, receptivity: 0.066 }], note: "\xB3\xB9P splits nearby \xB9H and \xB9\xB3C: \xB2J(H,P) \u2248 13\u201318 Hz, \xB3J(H,P) \u2248 7 Hz, \xB9J(C,P) 50\u2013140 Hz." },
    Si: { name: "Silicon", isotopes: [{ iso: "29Si", spin: "1/2", abundance: 4.685, freq: 19.867 }], note: "Si\u2013CH\u2083 near 0 ppm (\xB9H and \xB9\xB3C); small \xB2\u2079Si satellites around TMS." },
    S: { name: "Sulfur", isotopes: [{ iso: "33S", spin: "3/2", abundance: 0.76, freq: 7.676 }], note: "No observable coupling; S\u2013CH 2.0\u20133.0 ppm, sulfoxides/sulfones further downfield." },
    Cl: { name: "Chlorine", isotopes: [{ iso: "35Cl", spin: "3/2", abundance: 75.78, freq: 9.798 }, { iso: "37Cl", spin: "3/2", abundance: 24.22, freq: 8.156 }], note: "Quadrupolar, no visible splitting. CH\u2082\u2013Cl \u2248 3.4\u20133.7 ppm (\xB9H), 40\u201350 ppm (\xB9\xB3C)." },
    Br: { name: "Bromine", isotopes: [{ iso: "79Br", spin: "3/2", abundance: 50.69, freq: 25.054 }, { iso: "81Br", spin: "3/2", abundance: 49.31, freq: 27.006 }], note: "Quadrupolar, no visible splitting. C\u2013Br carbons sit upfield of C\u2013Cl (25\u201340 ppm)." },
    I: { name: "Iodine", isotopes: [{ iso: "127I", spin: "5/2", abundance: 100, freq: 20.007 }], note: "Heavy-atom effect shields directly bonded carbon (\u201310 to 15 ppm)." },
    B: { name: "Boron", isotopes: [{ iso: "11B", spin: "3/2", abundance: 80.1, freq: 32.084 }, { iso: "10B", spin: "3", abundance: 19.9, freq: 10.746 }], note: "Carbon bonded to boron is often too broad to see in \xB9\xB3C." },
    Li: { name: "Lithium", isotopes: [{ iso: "7Li", spin: "3/2", abundance: 92.41, freq: 38.863 }], note: "" },
    Na: { name: "Sodium", isotopes: [{ iso: "23Na", spin: "3/2", abundance: 100, freq: 26.452 }], note: "" },
    Se: { name: "Selenium", isotopes: [{ iso: "77Se", spin: "1/2", abundance: 7.63, freq: 19.071 }], note: "Se\u2013CH\u2083 \u2248 2.0 ppm (\xB9H)." },
    Sn: { name: "Tin", isotopes: [{ iso: "119Sn", spin: "1/2", abundance: 8.59, freq: 37.29 }], note: "Sn satellites (\xB2J \u2248 50 Hz) around Sn\u2013CH signals." },
    Pt: { name: "Platinum", isotopes: [{ iso: "195Pt", spin: "1/2", abundance: 33.8, freq: 21.4 }], note: "\xB9\u2079\u2075Pt satellites (\u2248 1:4:1 pattern) on ligand signals." }
  };
  var ELEMENT_ALIASES = { hydrogen: "H", proton: "H", carbon: "C", nitrogen: "N", oxygen: "O", fluorine: "F", phosphorus: "P", silicon: "Si", sulfur: "S", sulphur: "S", chlorine: "Cl", bromine: "Br", iodine: "I", boron: "B", lithium: "Li", sodium: "Na", selenium: "Se", tin: "Sn", platinum: "Pt" };
  var SOLVENTS = [
    { id: "CDCl3", names: ["cdcl3", "chloroform-d", "chloroform"], h: [7.26], c: [77.16], water: 1.56 },
    { id: "DMSO-d6", names: ["dmso", "dmso-d6", "dmso-d\u2086"], h: [2.5], c: [39.52], water: 3.33 },
    { id: "CD3OD", names: ["cd3od", "methanol-d4", "meod", "methanol"], h: [3.31], c: [49], water: 4.87 },
    { id: "D2O", names: ["d2o", "water"], h: [4.79], c: [], water: 4.79 },
    { id: "Acetone-d6", names: ["acetone", "acetone-d6"], h: [2.05], c: [29.84, 206.26], water: 2.84 },
    { id: "C6D6", names: ["c6d6", "benzene-d6", "benzene"], h: [7.16], c: [128.06], water: 0.4 },
    { id: "CD3CN", names: ["cd3cn", "acetonitrile-d3", "acetonitrile"], h: [1.94], c: [1.32, 118.26], water: 2.13 },
    { id: "CD2Cl2", names: ["cd2cl2", "dichloromethane-d2", "methylene chloride"], h: [5.32], c: [53.84], water: 1.52 },
    { id: "THF-d8", names: ["thf", "thf-d8"], h: [3.58, 1.72], c: [67.21, 25.31], water: 2.46 },
    { id: "Toluene-d8", names: ["toluene", "toluene-d8"], h: [7.09, 7.01, 6.97, 2.08], c: [137.48, 128.87, 127.96, 125.13, 20.43], water: 0.43 },
    { id: "Pyridine-d5", names: ["pyridine", "pyridine-d5"], h: [8.74, 7.58, 7.22], c: [150.35, 135.91, 123.87], water: 4.96 }
  ];
  function findSolvent(name) {
    if (!name) return null;
    const s = String(name).toLowerCase().replace(/\s+/g, "");
    return SOLVENTS.find((v) => v.id.toLowerCase() === s || v.names.some((n) => s.includes(n.replace(/\s+/g, "")))) || null;
  }
  var IMPURITIES = [
    { name: "Water", CDCl3: { h: [1.56] }, "DMSO-d6": { h: [3.33] } },
    { name: "Acetone", CDCl3: { h: [2.17], c: [207.07, 30.92] }, "DMSO-d6": { h: [2.09], c: [206.31, 30.56] } },
    { name: "Acetonitrile", CDCl3: { h: [2.1], c: [116.43, 1.89] }, "DMSO-d6": { h: [2.07], c: [117.91, 1.03] } },
    { name: "Benzene", CDCl3: { h: [7.36], c: [128.37] }, "DMSO-d6": { h: [7.37], c: [128.3] } },
    { name: "Dichloromethane", CDCl3: { h: [5.3], c: [53.52] }, "DMSO-d6": { h: [5.76], c: [54.84] } },
    { name: "Diethyl ether", CDCl3: { h: [3.48, 1.21], c: [65.91, 15.2] }, "DMSO-d6": { h: [3.38, 1.09], c: [62.05, 15.12] } },
    { name: "DMF", CDCl3: { h: [8.02, 2.96, 2.88], c: [162.62, 36.5, 31.39] }, "DMSO-d6": { h: [7.95, 2.89, 2.73], c: [162.29, 35.73, 30.73] } },
    { name: "DMSO", CDCl3: { h: [2.62], c: [40.76] } },
    { name: "Ethanol", CDCl3: { h: [3.72, 1.25], c: [58.28, 18.41] }, "DMSO-d6": { h: [3.44, 1.06], c: [56.07, 18.51] } },
    { name: "Ethyl acetate", CDCl3: { h: [4.12, 2.05, 1.26], c: [171.36, 60.49, 21.04, 14.19] }, "DMSO-d6": { h: [4.03, 1.99, 1.17], c: [170.31, 59.74, 20.68, 14.4] } },
    { name: "n-Hexane", CDCl3: { h: [1.26, 0.88], c: [31.64, 22.7, 14.14] }, "DMSO-d6": { h: [1.25, 0.86], c: [30.95, 22.05, 13.88] } },
    { name: "Methanol", CDCl3: { h: [3.49], c: [50.41] }, "DMSO-d6": { h: [3.16], c: [48.59] } },
    { name: "THF", CDCl3: { h: [3.76, 1.85], c: [67.97, 25.62] }, "DMSO-d6": { h: [3.6, 1.76], c: [67.03, 25.14] } },
    { name: "Toluene", CDCl3: { h: [7.25, 7.17, 2.36], c: [137.89, 129.07, 128.26, 125.33, 21.46] }, "DMSO-d6": { h: [7.18, 2.3], c: [137.35, 128.88, 128.18, 125.29, 20.99] } },
    { name: "Triethylamine", CDCl3: { h: [2.53, 1.03], c: [46.25, 11.61] }, "DMSO-d6": { h: [2.43, 0.93], c: [45.74, 10.75] } },
    { name: "Grease", CDCl3: { h: [1.26, 0.86], c: [29.76] } },
    { name: "Silicone grease", CDCl3: { h: [0.07], c: [1.19] } },
    { name: "Pyridine", CDCl3: { h: [8.62, 7.68, 7.29], c: [149.9, 135.96, 123.75] } },
    { name: "Chloroform", CDCl3: { h: [7.26], c: [77.36] }, "DMSO-d6": { h: [8.32], c: [79.16] } },
    { name: "TMS", CDCl3: { h: [0], c: [0] }, "DMSO-d6": { h: [0], c: [0] } }
  ];
  var COUPLINGS = [
    { name: "Vicinal sp\xB3 H\u2013C\u2013C\u2013H (free rotation)", range: "6\u20138 Hz", typical: 7 },
    { name: "Geminal H\u2013C\u2013H (sp\xB3)", range: "10\u201318 Hz", typical: 14 },
    { name: "Geminal =CH\u2082", range: "0\u20133 Hz", typical: 1.5 },
    { name: "Alkene cis H\u2013C=C\u2013H", range: "6\u201312 Hz", typical: 10 },
    { name: "Alkene trans H\u2013C=C\u2013H", range: "12\u201318 Hz", typical: 16 },
    { name: "Aldehyde H\u2013C\u2013CHO", range: "1\u20133 Hz", typical: 2 },
    { name: "Aromatic ortho", range: "6\u20139 Hz", typical: 8 },
    { name: "Aromatic meta", range: "1\u20133 Hz", typical: 2 },
    { name: "Aromatic para", range: "0\u20131 Hz", typical: 0.5 },
    { name: "Cyclohexane axial\u2013axial", range: "8\u201314 Hz", typical: 11 },
    { name: "Cyclohexane axial\u2013equatorial / eq\u2013eq", range: "2\u20135 Hz", typical: 3 },
    { name: "H\u2013C\u2013F geminal \xB2J(H,F)", range: "45\u201350 Hz", typical: 47 },
    { name: "H\u2013C\u2013C\u2013F vicinal \xB3J(H,F)", range: "5\u201325 Hz", typical: 20 },
    { name: "\xB9J(C,H) sp\xB3 / sp\xB2 / sp", range: "125 / 160 / 250 Hz", typical: 125 },
    { name: "\xB9J(C,F) aryl / CF\u2083", range: "245 / 272 Hz", typical: 245 },
    { name: "\xB2J(H,P) / \xB3J(H,P)", range: "13\u201318 / 6\u20138 Hz", typical: 15 }
  ];
  var COMPOUNDS = [
    { name: "Ethyl acetate", formula: "C4H8O2", h: [[4.12, "q", 2], [2.05, "s", 3], [1.26, "t", 3]], c: [171.4, 60.5, 21, 14.2] },
    { name: "Acetone", formula: "C3H6O", h: [[2.17, "s", 6]], c: [207.1, 30.9] },
    { name: "Ethanol", formula: "C2H6O", h: [[3.72, "q", 2], [1.25, "t", 3]], c: [58.3, 18.4] },
    { name: "Methanol", formula: "CH4O", h: [[3.49, "s", 3]], c: [50.4] },
    { name: "Toluene", formula: "C7H8", h: [[7.22, "m", 5], [2.36, "s", 3]], c: [137.9, 129.1, 128.3, 125.3, 21.5] },
    { name: "Benzene", formula: "C6H6", h: [[7.36, "s", 6]], c: [128.4] },
    { name: "Diethyl ether", formula: "C4H10O", h: [[3.48, "q", 4], [1.21, "t", 6]], c: [65.9, 15.2] },
    { name: "Tetrahydrofuran", formula: "C4H8O", h: [[3.76, "m", 4], [1.85, "m", 4]], c: [68, 25.6] },
    { name: "Dichloromethane", formula: "CH2Cl2", h: [[5.3, "s", 2]], c: [53.5] },
    { name: "Acetic acid", formula: "C2H4O2", h: [[11.4, "br s", 1], [2.1, "s", 3]], c: [176, 20.8] },
    { name: "Ethylbenzene", formula: "C8H10", h: [[7.22, "m", 5], [2.65, "q", 2], [1.24, "t", 3]], c: [144.3, 128.4, 127.9, 125.7, 28.9, 15.6] },
    { name: "Anisole", formula: "C7H8O", h: [[7.29, "m", 2], [6.94, "t", 1], [6.9, "d", 2], [3.8, "s", 3]], c: [159.7, 129.5, 120.7, 114, 55.1] },
    { name: "Benzaldehyde", formula: "C7H6O", h: [[10.02, "s", 1], [7.88, "d", 2], [7.64, "t", 1], [7.53, "t", 2]], c: [192.4, 136.4, 134.5, 129.7, 129] },
    { name: "Acetophenone", formula: "C8H8O", h: [[7.96, "d", 2], [7.56, "t", 1], [7.46, "t", 2], [2.61, "s", 3]], c: [198.1, 137.1, 133.1, 128.6, 128.3, 26.6] },
    { name: "Benzoic acid", formula: "C7H6O2", h: [[12, "br s", 1], [8.13, "d", 2], [7.62, "t", 1], [7.49, "t", 2]], c: [172.5, 133.9, 130.3, 129.4, 128.5] },
    { name: "Methyl benzoate", formula: "C8H8O2", h: [[8.04, "d", 2], [7.55, "t", 1], [7.43, "t", 2], [3.91, "s", 3]], c: [167.1, 132.9, 130.2, 129.6, 128.4, 52.1] },
    { name: "Ethyl benzoate", formula: "C9H10O2", h: [[8.05, "d", 2], [7.54, "t", 1], [7.43, "t", 2], [4.38, "q", 2], [1.39, "t", 3]], c: [166.6, 132.8, 130.6, 129.6, 128.3, 60.9, 14.4] },
    { name: "Phenol", formula: "C6H6O", h: [[7.25, "t", 2], [6.94, "t", 1], [6.84, "d", 2], [5.3, "br s", 1]], c: [155.4, 129.7, 121, 115.3] },
    { name: "Aniline", formula: "C6H7N", h: [[7.17, "t", 2], [6.77, "t", 1], [6.69, "d", 2], [3.6, "br s", 2]], c: [146.4, 129.3, 118.6, 115.2] },
    { name: "Nitrobenzene", formula: "C6H5NO2", h: [[8.22, "d", 2], [7.7, "t", 1], [7.55, "t", 2]], c: [148.3, 134.7, 129.4, 123.5] },
    { name: "Benzyl alcohol", formula: "C7H8O", h: [[7.33, "m", 5], [4.67, "s", 2], [2, "br s", 1]], c: [140.9, 128.6, 127.7, 127, 65.3] },
    { name: "Aspirin (acetylsalicylic acid)", formula: "C9H8O4", h: [[11, "br s", 1], [8.12, "dd", 1], [7.62, "td", 1], [7.36, "t", 1], [7.14, "d", 1], [2.36, "s", 3]], c: [170.2, 169.8, 151.3, 134.9, 132.5, 126.2, 124, 122.3, 21] },
    { name: "Ibuprofen", formula: "C13H18O2", h: [[7.22, "d", 2], [7.1, "d", 2], [3.71, "q", 1], [2.45, "d", 2], [1.85, "m", 1], [1.5, "d", 3], [0.9, "d", 6]], c: [181, 140.9, 137, 129.4, 127.3, 45.1, 45, 30.2, 22.4, 18.1] },
    { name: "Paracetamol (DMSO-d\u2086)", formula: "C8H9NO2", solvent: "DMSO-d6", h: [[9.65, "s", 1], [9.14, "s", 1], [7.34, "d", 2], [6.68, "d", 2], [1.98, "s", 3]], c: [167.6, 153.2, 131.1, 120.9, 115, 23.8] },
    { name: "Caffeine", formula: "C8H10N4O2", h: [[7.51, "s", 1], [4, "s", 3], [3.58, "s", 3], [3.41, "s", 3]], c: [155.4, 151.7, 148.7, 141.4, 107.6, 33.6, 29.7, 27.9] },
    { name: "Vanillin", formula: "C8H8O3", h: [[9.83, "s", 1], [7.43, "m", 2], [7.04, "d", 1], [6.2, "br s", 1], [3.97, "s", 3]], c: [191, 151.7, 147.2, 129.9, 127.6, 114.4, 108.8, 56.1] },
    { name: "trans-Cinnamic acid", formula: "C9H8O2", h: [[7.8, "d", 1], [7.56, "m", 2], [7.41, "m", 3], [6.46, "d", 1]], c: [172.7, 147.1, 134, 130.8, 129, 128.4, 117.3] },
    { name: "Styrene", formula: "C8H8", h: [[7.42, "d", 2], [7.33, "t", 2], [7.26, "t", 1], [6.72, "dd", 1], [5.75, "d", 1], [5.24, "d", 1]], c: [137.6, 136.9, 128.5, 127.8, 126.2, 113.8] },
    { name: "Cyclohexanone", formula: "C6H10O", h: [[2.33, "t", 4], [1.86, "m", 4], [1.72, "m", 2]], c: [212, 42, 27.1, 25.1] },
    { name: "Cyclohexane", formula: "C6H12", h: [[1.43, "s", 12]], c: [26.9] },
    { name: "n-Hexane", formula: "C6H14", h: [[1.26, "m", 8], [0.88, "t", 6]], c: [31.6, 22.7, 14.1] },
    { name: "N,N-Dimethylformamide", formula: "C3H7NO", h: [[8.02, "s", 1], [2.96, "s", 3], [2.88, "s", 3]], c: [162.6, 36.5, 31.4] },
    { name: "Dimethyl sulfoxide", formula: "C2H6OS", h: [[2.62, "s", 6]], c: [40.8] },
    { name: "Acetonitrile", formula: "C2H3N", h: [[2.1, "s", 3]], c: [116.4, 1.9] },
    { name: "Pyridine", formula: "C5H5N", h: [[8.62, "d", 2], [7.68, "t", 1], [7.29, "t", 2]], c: [149.9, 136, 123.8] },
    { name: "Triethylamine", formula: "C6H15N", h: [[2.53, "q", 6], [1.03, "t", 9]], c: [46.3, 11.6] },
    { name: "tert-Butanol", formula: "C4H10O", h: [[1.28, "s", 9]], c: [69.2, 31.3] },
    { name: "Isopropanol", formula: "C3H8O", h: [[4.04, "hept", 1], [1.22, "d", 6]], c: [64.5, 25.1] },
    { name: "Methyl acetate", formula: "C3H6O2", h: [[3.67, "s", 3], [2.06, "s", 3]], c: [171.6, 51.6, 20.7] },
    { name: "Diethyl malonate", formula: "C7H12O4", h: [[4.2, "q", 4], [3.36, "s", 2], [1.28, "t", 6]], c: [166.6, 61.5, 41.7, 14.1] },
    { name: "Ethyl acetoacetate", formula: "C6H10O3", h: [[4.2, "q", 2], [3.44, "s", 2], [2.27, "s", 3], [1.28, "t", 3]], c: [200.7, 167.1, 61.4, 50.2, 30.2, 14.1] },
    { name: "Naphthalene", formula: "C10H8", h: [[7.84, "m", 4], [7.48, "m", 4]], c: [133.5, 128, 125.9] },
    { name: "Chlorobenzene", formula: "C6H5Cl", h: [[7.32, "m", 5]], c: [134.3, 129.7, 128.6, 126.4] },
    { name: "Bromobenzene", formula: "C6H5Br", h: [[7.5, "d", 2], [7.3, "t", 1], [7.24, "t", 2]], c: [131.5, 130, 126.8, 122.6] },
    { name: "Fluorobenzene", formula: "C6H5F", h: [[7.32, "m", 2], [7.12, "t", 1], [7.04, "t", 2]], c: [162.9, 130, 124.1, 115.4] },
    { name: "1-Bromobutane", formula: "C4H9Br", h: [[3.41, "t", 2], [1.85, "p", 2], [1.47, "h", 2], [0.93, "t", 3]], c: [34.8, 33.4, 21.4, 13.3] },
    { name: "Benzyl bromide", formula: "C7H7Br", h: [[7.35, "m", 5], [4.5, "s", 2]], c: [137.8, 129, 128.8, 128.4, 33.6] },
    { name: "Butan-2-one", formula: "C4H8O", h: [[2.44, "q", 2], [2.14, "s", 3], [1.06, "t", 3]], c: [209.3, 36.9, 29.4, 7.9] },
    { name: "Propanal", formula: "C3H6O", h: [[9.79, "t", 1], [2.46, "qd", 2], [1.11, "t", 3]], c: [203, 37.3, 6] },
    { name: "Cytisine", formula: "C11H14N2O", h: [[7.29, "dd", 1], [6.43, "d", 1], [5.98, "d", 1], [4.09, "d", 1], [3.89, "dd", 1], [3, "m", 4], [2.31, "m", 1], [1.93, "m", 2]], c: [163.6, 151.1, 138.7, 116.7, 104.9, 53.7, 52.8, 49.9, 35.5, 27.6, 26.2] },
    { name: "Rutin (DMSO-d\u2086)", formula: "C27H30O16", solvent: "DMSO-d6", h: [[12.59, "s", 1], [7.55, "m", 2], [6.84, "d", 1], [6.39, "d", 1], [6.19, "d", 1], [5.34, "d", 1], [4.38, "s", 1], [3.3, "m", 10], [0.99, "d", 3]], c: [177.4, 164.1, 161.2, 156.6, 156.4, 148.4, 144.8, 133.3, 121.6, 121.2, 116.3, 115.2, 104, 101.2, 100.8, 98.7, 93.6, 76.5, 75.9, 74.1, 72, 70.6, 70.4, 70, 68.3, 67, 17.7] },
    // Polymers (repeat unit, CDCl3).
    { name: "cis-1,4-Polyisoprene (natural rubber)", formula: "C5H8", polymer: true, h: [[5.12, "br s", 1], [2.03, "br s", 4], [1.68, "s", 3]], c: [135.2, 125, 32.2, 26.4, 23.4] },
    { name: "trans-1,4-Polyisoprene (gutta-percha)", formula: "C5H8", polymer: true, h: [[5.12, "br s", 1], [2, "br s", 4], [1.6, "s", 3]], c: [134.9, 124.2, 39.7, 26.7, 16] },
    { name: "1,4-Polybutadiene", formula: "C4H6", polymer: true, h: [[5.4, "br s", 2], [2.06, "br s", 4]], c: [130, 129.5, 32.7, 27.4] },
    { name: "Polystyrene", formula: "C8H8", polymer: true, h: [[7.06, "m", 3], [6.57, "m", 2], [1.84, "m", 1], [1.42, "m", 2]], c: [145.3, 127.9, 125.6, 43.5, 40.4] },
    { name: "Poly(methyl methacrylate) (PMMA)", formula: "C5H8O2", polymer: true, h: [[3.6, "s", 3], [1.81, "m", 2], [1.02, "s", 1.5], [0.84, "s", 1.5]], c: [177.8, 54.4, 51.8, 44.5, 18.7, 16.5] },
    { name: "Poly(ethylene glycol) (PEG)", formula: "C2H4O", polymer: true, h: [[3.64, "s", 4]], c: [70.6] },
    { name: "Poly(lactic acid) (PLA)", formula: "C3H4O2", polymer: true, h: [[5.16, "q", 1], [1.58, "d", 3]], c: [169.6, 69, 16.6] },
    { name: "Poly(\u03B5-caprolactone) (PCL)", formula: "C6H10O2", polymer: true, h: [[4.06, "t", 2], [2.3, "t", 2], [1.65, "m", 4], [1.38, "m", 2]], c: [173.5, 64.1, 34.1, 28.3, 25.5, 24.6] },
    { name: "Strychnine", formula: "C21H22N2O2", h: [[8.09, "d", 1], [7.24, "m", 2], [7.09, "t", 1], [5.89, "m", 1], [4.28, "dt", 1], [4.13, "m", 1], [4.06, "dd", 1], [3.92, "d", 1], [3.85, "d", 1], [3.71, "m", 1], [3.17, "m", 2], [2.88, "m", 1], [2.7, "m", 2], [2.35, "m", 1], [1.89, "m", 2], [1.47, "m", 1], [1.27, "m", 1]], c: [169.3, 142.2, 140.5, 132.7, 128.6, 127.3, 124.2, 122.2, 116.2, 77.6, 64.6, 60.3, 60.1, 52.7, 52, 50.3, 48.2, 42.5, 42.4, 31.6, 26.9] }
  ];
  function searchReference(query, nucleus) {
    const q = String(query || "").trim();
    if (!q) return { groups: [], element: null, compounds: [] };
    const lower = q.toLowerCase();
    let element = null;
    const sym = Object.keys(ELEMENTS).find((s) => s.toLowerCase() === lower) || ELEMENT_ALIASES[lower];
    if (sym && (q === sym || q.length > 2 || ELEMENT_ALIASES[lower])) element = { symbol: sym, ...ELEMENTS[sym] };
    const shift = /^-?\d+(\.\d+)?$/.test(q) ? parseFloat(q) : null;
    const words = lower.split(/[\s,]+/).filter(Boolean);
    const groups = SHIFT_GROUPS.filter((g) => {
      if (nucleus && g.nucleus !== nucleus) return false;
      if (shift !== null) {
        const tol = g.nucleus === "13C" ? 2 : 0.1;
        return shift >= g.min - tol && shift <= g.max + tol;
      }
      if (element) return g.elements.includes(element.symbol) || element.symbol === "C" && g.nucleus === "13C" || element.symbol === "H" && g.nucleus === "1H";
      const hay = (g.name + " " + g.tags + " " + g.elements.join(" ")).toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const compounds = shift !== null ? [] : COMPOUNDS.filter((c) => {
      if (element) return element.symbol !== "C" && element.symbol !== "H" && new RegExp(element.symbol + "(?![a-z])").test(c.formula);
      return words.every((w) => c.name.toLowerCase().includes(w) || c.formula.toLowerCase() === w);
    });
    return { groups, element, compounds, shift };
  }

  // core/assign.js
  var r2 = (v) => Math.round(v * 100) / 100;
  var RARE = /* @__PURE__ */ new Set(["F", "P", "S", "Si", "B", "Br", "I", "Cl"]);
  function candidateGroups(signal, nucleus, formula) {
    const tol = nucleus === "13C" ? 2.5 : 0.12;
    const out = [];
    for (const g of SHIFT_GROUPS) {
      if (g.nucleus !== nucleus) continue;
      if (signal.ppm < g.min - tol || signal.ppm > g.max + tol) continue;
      if (formula && g.elements.some((el) => !formula[el])) continue;
      const half = Math.max((g.max - g.min) / 2, nucleus === "13C" ? 3 : 0.15);
      let score = 1 - Math.min(1, Math.abs(signal.ppm - g.typical) / (half * 2));
      if (signal.ppm < g.min || signal.ppm > g.max) score *= 0.5;
      if (g.expected && nucleus === "1H") {
        const nH = Math.round(signal.nH || 0);
        if (g.expected.nH) score *= g.expected.nH === nH ? 1.5 : 0.6;
        if (g.expected.mult) {
          const same = signal.multiplicity === g.expected.mult || g.expected.mult === "s" && signal.multiplicity === "br s";
          score *= same ? 1.3 : g.expected.mult === "br s" && signal.J && signal.J.length ? 0.25 : 0.7;
        }
      }
      if (!g.elements.length) score *= 1.15;
      if (!formula && g.elements.some((el) => RARE.has(el))) score *= 0.6;
      if (/heteroaromatic|alkyne/.test(g.tags)) score *= formula ? 0.85 : 0.65;
      score *= 1 + 0.3 / (1 + (g.max - g.min) / (nucleus === "13C" ? 10 : 0.5));
      out.push({ group: g, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 4);
  }
  function solventAndImpurities(signals, nucleus, solventName) {
    const solvent = findSolvent(solventName);
    const key = solvent && (solvent.id === "DMSO-d6" ? "DMSO-d6" : solvent.id === "CDCl3" ? "CDCl3" : null);
    const tol = nucleus === "13C" ? 0.4 : 0.03;
    const flags = /* @__PURE__ */ new Map();
    for (const s of signals) {
      if (solvent) {
        const refs = nucleus === "13C" ? solvent.c : solvent.h;
        const singlet = nucleus === "13C" || /s$/.test(s.multiplicity) || (s.J || []).length > 0 && s.J.every((j) => j < 3) || s.multiplicity === "m" && s.ppmFrom - s.ppmTo < 0.08;
        for (const v of refs) if (singlet && Math.abs(s.ppm - v) < (nucleus === "13C" ? 0.8 : 0.05)) flags.set(s, { kind: "solvent", label: `${solvent.id} residual (${v})` });
        if (nucleus === "1H" && singlet && Math.abs(s.ppm - solvent.water) < 0.1 && !flags.has(s)) flags.set(s, { kind: "water", label: `Water in ${solvent.id} (${solvent.water})` });
      }
      if (flags.has(s)) continue;
      for (const imp of IMPURITIES) {
        const d = imp[key || "CDCl3"];
        if (!d) continue;
        const refs = nucleus === "13C" ? d.c || [] : d.h || [];
        const v = refs.find((x) => Math.abs(s.ppm - x) < tol);
        if (v !== void 0 && (s.minor || (s.nH || 0) < 0.6 || nucleus === "13C")) {
          flags.set(s, { kind: "impurity", label: `Possible ${imp.name} (${v})` });
          break;
        }
      }
    }
    return { solvent, flags };
  }
  function fragmentHints(signals, nucleus) {
    const hints = [];
    const S = signals.filter((s) => !s.minor && !(s.flag && s.flag.kind !== "impurity"));
    if (nucleus === "1H") {
      const n = (s) => Math.round(s.nH || 0);
      const near = (a, b, tol = 0.6) => a.J.length && b.J.length && Math.abs(a.J[0] - b.J[0]) < tol;
      for (const q of S.filter((s) => s.multiplicity === "q" && n(s) === 2)) {
        const t = S.find((s) => s.multiplicity === "t" && n(s) === 3 && near(q, s));
        if (t) {
          const where = q.ppm > 3.9 ? "O\u2013CH\u2082CH\u2083 (ethyl ester / ethoxy)" : q.ppm > 3.2 ? "O\u2013CH\u2082CH\u2083 (ethyl ether / alcohol)" : q.ppm > 2.3 ? "CH\u2083CH\u2082\u2013C=O, N\u2013CH\u2082CH\u2083 or Ar\u2013CH\u2082CH\u2083" : "CH\u2083CH\u2082\u2013C";
          hints.push({ text: `Ethyl group: ${where}`, detail: `q ${r2(q.ppm)} (2H) and t ${r2(t.ppm)} (3H) share J = ${q.J[0]} Hz`, signals: [q, t] });
        }
      }
      for (const d of S.filter((s) => s.multiplicity === "d" && n(s) === 6)) {
        const sp = S.find((s) => s.multiplicity === "hept" && n(s) === 1 && near(s, d)) || S.find((s) => s.multiplicity === "m" && n(s) === 1 && s.ppm > d.ppm + 0.5 && s.ppm - d.ppm < 3.6);
        if (sp) hints.push({ text: sp.ppm > 3.5 ? "Isopropyl on oxygen (O\u2013CH(CH\u2083)\u2082)" : "Isopropyl group CH(CH\u2083)\u2082", detail: `1H at ${r2(sp.ppm)} with a 6H doublet at ${r2(d.ppm)}`, signals: [sp, d] });
      }
      for (const s of S.filter((x) => x.multiplicity === "s" && n(x) === 9 && x.ppm < 1.6)) hints.push({ text: s.ppm > 1.38 ? "tert-Butyl ester / Boc group" : "tert-Butyl group", detail: `9H singlet at ${r2(s.ppm)}`, signals: [s] });
      for (const s of S.filter((x) => x.multiplicity === "s" && n(x) === 3)) {
        let t = null;
        if (s.ppm >= 3.6 && s.ppm < 4.05) t = "O\u2013CH\u2083 (methyl ester or aryl methyl ether)";
        else if (s.ppm >= 3.2 && s.ppm < 3.6) t = "Aliphatic O\u2013CH\u2083 ether";
        else if (s.ppm >= 2.75 && s.ppm < 3.2) t = "N\u2013CH\u2083 (amide/aniline) or CH\u2083SO\u2082";
        else if (s.ppm >= 2 && s.ppm < 2.75) t = s.ppm < 2.12 ? "Acetate CH\u2083C(=O)O or CH\u2083\u2013C=O" : "CH\u2083\u2013C=O (methyl ketone) or Ar\u2013CH\u2083";
        if (t) hints.push({ text: `Isolated methyl: ${t}`, detail: `3H singlet at ${r2(s.ppm)}`, signals: [s] });
      }
      const ar = S.filter((s) => s.ppm > 6.4 && s.ppm < 8.6);
      const arH = ar.reduce((a, s) => a + n(s), 0);
      if (arH) {
        let t = `${arH} aromatic H`;
        const dd = ar.filter((s) => s.multiplicity === "d" && n(s) === 2);
        if (arH === 5) t += ": consistent with a monosubstituted benzene (C\u2086H\u2085\u2013)";
        else if (arH === 4 && dd.length === 2 && Math.abs(dd[0].J[0] - dd[1].J[0]) < 1) t += ": two 2H doublets \u2192 para-disubstituted benzene (AA\u2032BB\u2032)";
        else if (arH === 4) t += ": consistent with a disubstituted benzene (ortho or meta pattern)";
        else if (arH === 3) t += ": consistent with a trisubstituted benzene";
        hints.push({ text: t, detail: ar.map((s) => `${r2(s.ppm)} (${s.multiplicity}, ${n(s)}H)`).join(", "), signals: ar });
      }
      const vinyl = S.filter((s) => s.ppm > 4.5 && s.ppm < 6.4 && s.J.some((j) => j > 9));
      for (const v of vinyl) {
        const big = Math.max(...v.J);
        hints.push({ text: big > 13 ? "trans-Alkene (J > 13 Hz)" : "cis-Alkene or vinyl (J 9\u201313 Hz)", detail: `${r2(v.ppm)} with J = ${big} Hz`, signals: [v] });
      }
      for (const s of S.filter((x) => x.ppm > 9.3 && x.ppm < 10.3)) hints.push({ text: "Aldehyde (CHO)", detail: `${r2(s.ppm)} ppm`, signals: [s] });
      for (const s of S.filter((x) => x.ppm >= 10.3)) hints.push({ text: "Carboxylic acid / strongly H-bonded OH or NH", detail: `${r2(s.ppm)} ppm`, signals: [s] });
    } else {
      const co = S.filter((s) => s.ppm > 160);
      for (const s of co) {
        const t = s.ppm > 195 ? "Ketone/aldehyde C=O" : s.ppm > 185 ? "Aldehyde or conjugated ketone C=O" : s.ppm > 175 ? "Carboxylic acid C=O" : s.ppm > 165 ? "Ester/acid/amide C=O" : "Amide/conjugated ester C=O, or aryl C\u2013O/C=N";
        hints.push({ text: t, detail: `${r2(s.ppm)} ppm`, signals: [s] });
      }
      const ar = S.filter((s) => s.ppm > 110 && s.ppm <= 160);
      if (ar.length) hints.push({ text: `${ar.length} sp\xB2 carbon environments (aromatic/alkene, 110\u2013160 ppm)`, detail: ar.map((s) => r2(s.ppm)).join(", "), signals: ar });
      const co2 = S.filter((s) => s.ppm > 50 && s.ppm < 90);
      if (co2.length) hints.push({ text: `${co2.length} carbon(s) bonded to O or N (50\u201390 ppm)`, detail: co2.map((s) => r2(s.ppm)).join(", "), signals: co2 });
      const al = S.filter((s) => s.ppm <= 50 && s.ppm > -5);
      if (al.length) hints.push({ text: `${al.length} sp\xB3 carbon environments (0\u201350 ppm)`, detail: al.map((s) => r2(s.ppm)).join(", "), signals: al });
    }
    return hints;
  }
  function matchCompounds(signals, nucleus) {
    const obs = signals.filter((s) => !s.minor && !(s.flag && s.flag.kind === "solvent"));
    if (!obs.length) return [];
    const res = [];
    for (const c of COMPOUNDS) {
      if (nucleus === "1H") {
        const totObs = obs.reduce((a, s) => a + Math.max(s.nH || 1, 0.5), 0);
        const totRef = c.h.reduce((a, h) => a + h[2], 0);
        let refMatched = 0, used = /* @__PURE__ */ new Set();
        for (const [ppm, , nH] of c.h) {
          let best = null, bd = Infinity;
          for (const s of obs) {
            const d = ppm < s.ppmFrom + 0.05 && ppm > s.ppmTo - 0.05 ? Math.abs(ppm - s.ppm) * 0.3 : Math.abs(ppm - s.ppm);
            if (d < bd) {
              bd = d;
              best = s;
            }
          }
          if (best && bd < 0.1) {
            refMatched += nH * (1 - bd / 0.2);
            used.add(best);
          }
        }
        const obsMatched = [...used].reduce((a, s) => a + Math.max(s.nH || 1, 0.5), 0);
        const score = refMatched / totRef * Math.sqrt(obsMatched / totObs);
        if (score > 0.25) res.push({ compound: c, score, matched: used.size, of: c.h.length });
      } else {
        let m = 0;
        const used = /* @__PURE__ */ new Set();
        for (const ppm of c.c) {
          const best = obs.reduce((b, s) => Math.abs(s.ppm - ppm) < Math.abs((b ? b.ppm : 1e9) - ppm) ? s : b, null);
          if (best && Math.abs(best.ppm - ppm) < 1.2) {
            m++;
            used.add(best);
          }
        }
        const score = m / c.c.length * Math.sqrt(used.size / obs.length);
        if (score > 0.25) res.push({ compound: c, score, matched: m, of: c.c.length });
      }
    }
    return res.sort((a, b) => b.score - a.score).slice(0, 6);
  }
  function suggest(spec, analysis, opts = {}) {
    const nucleus = /13C/.test(spec.nucleus) ? "13C" : "1H";
    const signals = analysis.multiplets;
    const { solvent, flags } = solventAndImpurities(signals, nucleus, spec.solvent);
    for (const s of signals) s.flag = flags.get(s) || null;
    if (nucleus === "1H") applyIntegralUnit(signals, opts.totalH);
    const counts = opts.formula ? opts.formula.counts : null;
    for (const s of signals) s.candidates = candidateGroups(s, nucleus, counts);
    return {
      nucleus,
      solvent,
      hints: fragmentHints(signals, nucleus),
      compounds: matchCompounds(signals, nucleus)
    };
  }
  function journalReport(spec, signals) {
    const nucleus = /13C/.test(spec.nucleus) ? "13C" : "1H";
    const solvent = findSolvent(spec.solvent);
    const sup = (t) => t.replace(/\d/g, (d) => "\u2070\xB9\xB2\xB3\u2074\u2075\u2076\u2077\u2078\u2079"[d]);
    const iso = String(spec.nucleus || "1H").match(/^(\d+)([A-Za-z]+)$/);
    const head = `${iso ? sup(iso[1]) + iso[2] : spec.nucleus} NMR (${Math.round(spec.frequency || 0)} MHz, ${solvent ? solvent.id : spec.solvent || "solvent"}) \u03B4 `;
    const list = signals.filter((s) => !s.minor && !(s.flag && s.flag.kind === "solvent")).sort((a, b) => b.ppm - a.ppm);
    if (nucleus === "13C") return head + list.map((s) => s.ppm.toFixed(1)).join(", ") + ".";
    return head + list.map((s) => {
      const shift = s.multiplicity === "m" ? `${s.ppmFrom.toFixed(2)} \u2013 ${s.ppmTo.toFixed(2)}` : s.ppm.toFixed(2);
      const J = s.J.length ? `, J = ${s.J.map((j) => j.toFixed(1)).join(", ")} Hz` : "";
      return `${shift} (${s.multiplicity}${J}, ${Math.max(1, Math.round(s.nH || 0))}H)`;
    }).join(", ") + ".";
  }
  var ATOMIC = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, F: 18.998, P: 30.974, S: 32.06, Cl: 35.45, Br: 79.904, I: 126.904, Si: 28.085, B: 10.81, Na: 22.99, Li: 6.94, Se: 78.971, Sn: 118.71, D: 2.014 };
  function parseFormula(f) {
    const counts = {};
    const re = /([A-Z][a-z]?)(\d*)/g;
    let m;
    while (m = re.exec(String(f).replace(/\s/g, ""))) {
      if (!m[1]) continue;
      counts[m[1]] = (counts[m[1]] || 0) + (m[2] ? parseInt(m[2], 10) : 1);
    }
    return counts;
  }
  function formulaInfo(f) {
    const c = parseFormula(f);
    if (!Object.keys(c).length) return null;
    const X = (c.F || 0) + (c.Cl || 0) + (c.Br || 0) + (c.I || 0);
    const H2 = (c.H || 0) + (c.D || 0);
    const dbe = (c.C || 0) + (c.Si || 0) - (H2 + X) / 2 + ((c.N || 0) + (c.P || 0) + (c.B || 0)) / 2 + 1;
    let mw2 = 0;
    for (const [el, n] of Object.entries(c)) mw2 += (ATOMIC[el] || 0) * n;
    return { counts: c, dbe, mw: mw2, totalH: H2 };
  }

  // core/session.js
  function createSession(ds) {
    const fromFid = !!ds.fid && !ds.rawReal;
    const params = {
      ...defaultProcessing(ds),
      fromFid,
      autoPhase: fromFid,
      reverse: false,
      referenceShift: 0,
      snr: /13C/.test(ds.nucleus) ? 6 : 8,
      formula: "",
      totalH: null,
      manualRegions: [],
      // { ppm, value }: the integral containing ppm is set to value and all others scale with it.
      integralRef: null,
      // Raw FIDs from vendors whose headers are not referenced get referenced to the solvent.
      autoReference: !!ds.fid && ["jeol", "nmrpipe", "magritek", "nmrml", "mnova"].includes(ds.fid.origin),
      excluded: []
    };
    let fftCache = null;
    let phased = null;
    function complexSpectrum() {
      if (params.fromFid && ds.fid) {
        const key = [params.lb, params.zf, params.reverse].join("|");
        if (!fftCache || fftCache.key !== key) {
          fftCache = { key, ...transformFid(ds.fid, ds.frequency, params) };
          phased = null;
        }
        return fftCache;
      }
      return { real: ds.rawReal, imag: ds.rawImag, ppmStart: ds.rawPpmStart, ppmEnd: ds.rawPpmEnd };
    }
    function run() {
      const c = complexSpectrum();
      if (params.autoPhase && c.imag) {
        const a2 = autoPhase(c.real, c.imag, { wholeSpectrum: /1H/.test(ds.nucleus) });
        params.ph0 = Math.round(a2.ph0 * 10) / 10;
        params.ph1 = Math.round(a2.ph1 * 10) / 10;
        params.autoPhase = false;
      }
      let real = c.real;
      if (c.imag && (params.ph0 || params.ph1)) real = applyPhase(c.real, c.imag, params.ph0, params.ph1).re;
      real = Float64Array.from(real);
      let baseline = null;
      if (params.baseline) {
        const b = baselineCorrect(real);
        real = b.y;
        baseline = b.baseline;
      }
      const spec = {
        ...ds,
        real,
        ppmStart: c.ppmStart + params.referenceShift,
        ppmEnd: c.ppmEnd + params.referenceShift
      };
      const fi = params.formula ? formulaInfo(params.formula) : null;
      const totalH = params.totalH || fi && fi.totalH || null;
      let a = analyse(spec, { snr: params.snr });
      if (params.autoReference) {
        params.autoReference = false;
        const d = solventOffset(spec, a.peaks);
        if (d) {
          params.referenceShift += d;
          spec.ppmStart += d;
          spec.ppmEnd += d;
          a = analyse(spec, { snr: params.snr });
        }
      }
      let signals = a.multiplets;
      if (params.manualRegions.length && /1H/.test(spec.nucleus)) {
        const ax = ppmAxis(spec);
        for (const [p1, p2] of params.manualRegions) {
          const hi = Math.max(p1, p2), lo = Math.min(p1, p2);
          signals = signals.filter((m2) => m2.ppmTo > hi || m2.ppmFrom < lo);
          const from = Math.max(0, Math.round(ax.index(hi))), to = Math.min(spec.real.length - 1, Math.round(ax.index(lo)));
          let s = 0;
          for (let k = from; k <= to; k++) s += spec.real[k];
          const peaks = a.peaks.filter((p) => p.ppm <= hi && p.ppm >= lo);
          if (!peaks.length) peaks.push({ ppm: (hi + lo) / 2, height: 0, widthHz: 0, index: Math.round((from + to) / 2) });
          const m = describeMultiplet({ from, to, peaks, area: s * Math.abs(ax.step), ppmFrom: hi, ppmTo: lo }, spec.frequency);
          m.manual = true;
          signals.push(m);
        }
        signals.sort((x, y) => y.ppm - x.ppm);
      }
      for (const m of signals) m.excluded = params.excluded.some((e) => Math.abs(e - m.ppm) < 5e-3);
      a.multiplets = signals;
      let integralUnit = null;
      if (/1H/.test(spec.nucleus)) {
        integralUnit = applyIntegralUnit(signals, totalH);
        const ref = params.integralRef && signals.find((m) => params.integralRef.ppm <= m.ppmFrom + 1e-9 && params.integralRef.ppm >= m.ppmTo - 1e-9);
        if (ref && ref.area > 0 && params.integralRef.value > 0) {
          integralUnit = ref.area / params.integralRef.value;
          for (const m of signals) {
            m.nH = m.area / integralUnit;
            if (m.manual) m.minor = false;
          }
          ref.reference = true;
        }
      }
      const sug = suggest(spec, a, { totalH, formula: fi });
      const visible = signals.filter((m) => !m.excluded);
      return {
        spectrum: spec,
        baseline,
        analysis: a,
        suggestions: sug,
        formula: fi,
        integralUnit,
        report: journalReport(spec, visible),
        params: { ...params }
      };
    }
    return {
      dataset: ds,
      params,
      set(p) {
        Object.assign(params, p);
        return run();
      },
      run
    };
  }
  function solventOffset(spec, peaks) {
    const sol = findSolvent(spec.solvent);
    const is13 = /13C/.test(spec.nucleus);
    const target = sol && (is13 ? sol.c[0] : /1H/.test(spec.nucleus) ? sol.h[0] : void 0);
    if (target === void 0) return 0;
    const win = is13 ? 1.5 : 0.12;
    const near = peaks.filter((p) => Math.abs(p.ppm - target) < win);
    if (!near.length) return 0;
    const top = near.reduce((b, p) => p.height > b.height ? p : b);
    const span = is13 ? 0.8 : 0.03;
    const group = near.filter((p) => Math.abs(p.ppm - top.ppm) < span && p.height > top.height * 0.1);
    const centre = (Math.max(...group.map((p) => p.ppm)) + Math.min(...group.map((p) => p.ppm))) / 2;
    return target - centre;
  }

  // core/polymer.js
  var mw = (f) => (formulaInfo(f) || { mw: 0 }).mw;
  var POLYMERS = [
    { id: "pi", name: "Polyisoprene", unit: "C5H8", signal: { label: "=CH (1,4)", from: 5.25, to: 4.95, nH: 1 }, alt: { label: "CH\u2083", from: 1.75, to: 1.5, nH: 3 }, micro: "isoprene" },
    { id: "pb", name: "Polybutadiene", unit: "C4H6", signal: { label: "=CH (1,4 + 1,2)", from: 5.65, to: 5.25, nH: 2 }, micro: "butadiene" },
    { id: "ps", name: "Polystyrene", unit: "C8H8", signal: { label: "Ar\u2013H", from: 7.4, to: 6.25, nH: 5 } },
    { id: "pmma", name: "Poly(methyl methacrylate)", unit: "C5H8O2", signal: { label: "OCH\u2083", from: 3.7, to: 3.5, nH: 3 } },
    { id: "pnba", name: "Poly(n-butyl acrylate)", unit: "C7H12O2", signal: { label: "OCH\u2082", from: 4.15, to: 3.9, nH: 2 } },
    { id: "pvac", name: "Poly(vinyl acetate)", unit: "C4H6O2", signal: { label: "CH\u2013O", from: 5, to: 4.7, nH: 1 } },
    { id: "peg", name: "Poly(ethylene glycol)", unit: "C2H4O", signal: { label: "OCH\u2082CH\u2082O", from: 3.75, to: 3.5, nH: 4 } },
    { id: "pla", name: "Poly(lactic acid)", unit: "C3H4O2", signal: { label: "CH", from: 5.25, to: 5.08, nH: 1 } },
    { id: "pcl", name: "Poly(\u03B5-caprolactone)", unit: "C6H10O2", signal: { label: "CH\u2082O", from: 4.12, to: 4, nH: 2 } },
    { id: "pib", name: "Polyisobutylene", unit: "C4H8", signal: { label: "C(CH\u2083)\u2082", from: 1.2, to: 1, nH: 6 } },
    { id: "pdms", name: "Poly(dimethylsiloxane)", unit: "C2H6OSi", signal: { label: "Si(CH\u2083)\u2082", from: 0.2, to: -0.05, nH: 6 } }
  ].map((p) => ({ ...p, m0: mw(p.unit) }));
  var END_GROUPS = [
    { id: "sbu", name: "sec-Butyl (s-BuLi initiator)", nH: 6, ppm: "0.8\u20130.9 (2 \xD7 CH\u2083)", mass: mw("C4H9") },
    { id: "nbu", name: "n-Butyl (n-BuLi initiator)", nH: 3, ppm: "0.85\u20130.92 (CH\u2083)", mass: mw("C4H9") },
    { id: "tbu", name: "tert-Butyl", nH: 9, ppm: "0.9\u20131.45 (C(CH\u2083)\u2083)", mass: mw("C4H9") },
    { id: "ome", name: "Methoxy (mPEG, methyl ester)", nH: 3, ppm: "3.3\u20133.4 (OCH\u2083)", mass: mw("CH3O") },
    { id: "ch2oh", name: "Hydroxymethyl \u2013CH\u2082OH", nH: 2, ppm: "3.6\u20134.1 (CH\u2082OH)", mass: mw("CH3O") },
    { id: "bn", name: "Benzyl ester/ether (BnOH initiator)", nH: 2, ppm: "5.1 (OCH\u2082Ph)", mass: mw("C7H7O") },
    { id: "ph", name: "Phenyl (aromatic end)", nH: 5, ppm: "7.1\u20137.4 (Ar\u2013H)", mass: mw("C6H5") },
    { id: "tms", name: "Trimethylsilyl", nH: 9, ppm: "0.0\u20130.2 (Si(CH\u2083)\u2083)", mass: mw("C3H9Si") },
    { id: "vinyl", name: "Vinyl / methacrylate end (=CH\u2082)", nH: 2, ppm: "4.6\u20136.2 (=CH\u2082)", mass: mw("C2H3") },
    { id: "cho", name: "Aldehyde (\u2013CHO)", nH: 1, ppm: "9.5\u20139.8 (CHO)", mass: mw("CHO") },
    { id: "custom", name: "Custom", nH: 1, ppm: "", mass: 0 }
  ];
  function degreeOfPolymerisation({ repeat, end, m0 = 0, endMass = 0 }) {
    if (!(repeat && end && repeat.area > 0 && end.area > 0 && repeat.nH > 0 && end.nH > 0)) return null;
    const perUnit = repeat.area / repeat.nH;
    const perChain = end.area / (end.nH * (end.count || 1));
    const dp = perUnit / perChain;
    const mn = m0 > 0 ? dp * m0 + (endMass || 0) : null;
    return { dp, mn, perUnit, perChain };
  }
  function composition(components) {
    const rows = components.filter((c) => c.area > 0 && c.nH > 0).map((c) => ({ ...c, mol: c.area / c.nH }));
    const totMol = rows.reduce((a, c) => a + c.mol, 0);
    const totMass = rows.reduce((a, c) => a + c.mol * (c.m0 || 0), 0);
    return rows.map((c) => ({ ...c, molPct: 100 * c.mol / totMol, wtPct: totMass > 0 ? 100 * c.mol * (c.m0 || 0) / totMass : null }));
  }
  function microstructure(spec, kind) {
    const A = (a, b) => Math.max(0, integrateRange(spec, a, b).area);
    if (kind === "isoprene") {
      const u14 = A(5.25, 4.95) / 1;
      const u34 = A(4.8, 4.55) / 2;
      const u12 = A(5.9, 5.65) / 1;
      const tot = u14 + u34 + u12;
      if (!(tot > 0)) return null;
      const cis = A(1.75, 1.645), trans = A(1.645, 1.55);
      const r = [
        { label: "1,4-units", pct: 100 * u14 / tot, how: "=CH, \u03B4 5.12 (1H)" },
        { label: "3,4-units", pct: 100 * u34 / tot, how: "=CH\u2082, \u03B4 4.6\u20134.8 (2H)" },
        { label: "1,2-units", pct: 100 * u12 / tot, how: "CH=, \u03B4 5.7\u20135.9 (1H)" }
      ];
      const ct = cis + trans > 0 ? { cis: 100 * cis / (cis + trans), trans: 100 * trans / (cis + trans) } : null;
      return { rows: r, cisTrans: ct, note: "cis/trans from the CH\u2083 signals (cis 1.68, trans 1.60 ppm); 3,4-unit CH\u2083 also falls near 1.6 ppm." };
    }
    if (kind === "butadiene") {
      const vinylCH2 = A(5.08, 4.85) / 2;
      const olefin = A(5.65, 5.25);
      const u14 = Math.max(0, (olefin - vinylCH2) / 2);
      const tot = u14 + vinylCH2;
      if (!(tot > 0)) return null;
      return {
        rows: [
          { label: "1,4-units", pct: 100 * u14 / tot, how: "=CH, \u03B4 5.3\u20135.5 (2H)" },
          { label: "1,2-units (vinyl)", pct: 100 * vinylCH2 / tot, how: "=CH\u2082, \u03B4 4.9\u20135.0 (2H)" }
        ],
        cisTrans: null,
        note: "cis/trans 1,4 cannot be separated reliably by \xB9H; use \xB9\xB3C (cis 27.4, trans 32.7 ppm)."
      };
    }
    return null;
  }
  function repeatArea(spec, polymer) {
    return Math.max(0, integrateRange(spec, polymer.signal.from, polymer.signal.to).area);
  }

  // macos/bridge/bridge.js
  var sessions = /* @__PURE__ */ new Map();
  var lastResults = /* @__PURE__ */ new Map();
  function fromBase64(b642) {
    const T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const map = new Uint8Array(128);
    for (let i = 0; i < T.length; i++) map[T.charCodeAt(i)] = i;
    const s = b642.replace(/[^A-Za-z0-9+/]/g, "");
    const out = new Uint8Array(Math.floor(s.length * 3 / 4));
    let o = 0;
    for (let i = 0; i < s.length; i += 4) {
      const n = map[s.charCodeAt(i)] << 18 | map[s.charCodeAt(i + 1)] << 12 | map[s.charCodeAt(i + 2)] << 6 | map[s.charCodeAt(i + 3)];
      out[o++] = n >> 16 & 255;
      if (i + 2 < s.length) out[o++] = n >> 8 & 255;
      if (i + 3 < s.length) out[o++] = n & 255;
    }
    return out.subarray(0, o);
  }
  function decimate(y, cols) {
    if (y.length <= cols * 2) return Array.from(y);
    const out = [];
    const step = y.length / cols;
    for (let c = 0; c < cols; c++) {
      let mn = Infinity, mx = -Infinity;
      for (let i = Math.floor(c * step); i < Math.floor((c + 1) * step); i++) {
        if (y[i] < mn) mn = y[i];
        if (y[i] > mx) mx = y[i];
      }
      out.push(mn, mx);
    }
    return out;
  }
  function summarise(id, r, cols) {
    const s = r.spectrum;
    const sig = (m) => ({
      ppm: m.ppm,
      ppmFrom: m.ppmFrom,
      ppmTo: m.ppmTo,
      multiplicity: m.multiplicity,
      J: m.J,
      nH: m.nH || 0,
      minor: !!m.minor,
      excluded: !!m.excluded,
      flag: m.flag ? m.flag.label : null,
      area: m.area || 0,
      manual: !!m.manual,
      reference: !!m.reference,
      candidates: (m.candidates || []).slice(0, 3).map((c) => c.group.name)
    });
    return {
      id,
      title: s.title,
      nucleus: s.nucleus,
      frequency: s.frequency || 0,
      solvent: s.solvent || "",
      source: s.source,
      ppmStart: s.ppmStart,
      ppmEnd: s.ppmEnd,
      points: s.real.length,
      y: decimate(s.real, cols || 4096),
      peaks: r.analysis.peaks.map((p) => ({ ppm: p.ppm, height: p.height })),
      signals: r.analysis.multiplets.map(sig),
      hints: r.suggestions.hints.map((h) => ({ text: h.text, detail: h.detail })),
      compounds: r.suggestions.compounds.map((c) => ({ name: c.compound.name, formula: c.compound.formula, score: c.score, h: c.compound.h.map((x) => x[0]), c: c.compound.c })),
      report: r.report,
      params: {
        ph0: r.params.ph0,
        ph1: r.params.ph1,
        lb: r.params.lb,
        snr: r.params.snr,
        baseline: r.params.baseline,
        fromFid: r.params.fromFid,
        referenceShift: r.params.referenceShift,
        formula: r.params.formula,
        manualRegions: r.params.manualRegions.map(([a, b]) => [a, b]),
        hasIntegralRef: !!r.params.integralRef
      },
      integralUnit: r.integralUnit || 0
    };
  }
  globalThis.NMRBridge = {
    // files: JSON {"relative/path": "<base64>"} -> JSON {datasets:[{id,title,nucleus}], warnings}
    open(filesJSON) {
      const obj = JSON.parse(filesJSON);
      const map = new Map(Object.entries(obj).map(([k, v]) => [k, fromBase64(v)]));
      const { datasets, warnings } = loadExpanded(map);
      const list = datasets.map((ds) => {
        sessions.set(ds.id, createSession(ds));
        return { id: ds.id, title: ds.title, nucleus: ds.nucleus, frequency: ds.frequency || 0, solvent: ds.solvent || "", source: ds.source };
      });
      return JSON.stringify({ datasets: list, warnings });
    },
    // Apply parameter changes (JSON object, may be "{}") and return the processed result.
    run(id, paramsJSON, cols) {
      const s = sessions.get(id);
      if (!s) throw new Error("Unknown dataset " + id);
      const r = s.set(JSON.parse(paramsJSON || "{}"));
      lastResults.set(id, r);
      return JSON.stringify(summarise(id, r, cols));
    },
    close(id) {
      sessions.delete(id);
      lastResults.delete(id);
    },
    polymerLibrary() {
      return JSON.stringify({
        polymers: POLYMERS.map((p) => ({ id: p.id, name: p.name, unit: p.unit, m0: p.m0, signalLabel: p.signal.label, from: p.signal.from, to: p.signal.to, nH: p.signal.nH, micro: p.micro || "" })),
        endGroups: END_GROUPS.map((g) => ({ id: g.id, name: g.name, nH: g.nH, ppm: g.ppm, mass: g.mass }))
      });
    },
    // config: { polymer, repeatSig ('window' | ppm), repeatH, m0, endSig (ppm | null), endH, endCount, endMass,
    //           comps: [{ name, sig, nH, m0 }] }. Signals are named by their centre ppm.
    polymer(id, configJSON) {
      const r = lastResults.get(id);
      if (!r) throw new Error("Run the dataset first");
      const c = JSON.parse(configJSON);
      const sigs = r.analysis.multiplets.filter((m) => !m.excluded);
      const at = (ppm) => ppm == null ? null : sigs.find((m) => Math.abs(m.ppm - ppm) < 1e-4);
      const poly = POLYMERS.find((p) => p.id === c.polymer);
      let repeat = null;
      if (c.repeatSig === "window" && poly) repeat = { area: repeatArea(r.spectrum, poly), nH: c.repeatH };
      else {
        const m = at(c.repeatSig);
        if (m) repeat = { area: m.area, nH: c.repeatH };
      }
      const e = at(c.endSig);
      const dp = degreeOfPolymerisation({ repeat, end: e ? { area: e.area, nH: c.endH, count: c.endCount || 1 } : null, m0: c.m0, endMass: c.endMass });
      const comp = composition((c.comps || []).map((x) => {
        const m = at(x.sig);
        return { name: x.name, area: m ? m.area : 0, nH: x.nH, m0: x.m0 };
      }));
      const micro = poly && poly.micro ? microstructure(r.spectrum, poly.micro) : null;
      return JSON.stringify({
        repeatIntegral: repeat && r.integralUnit ? repeat.area / r.integralUnit : null,
        dp: dp ? dp.dp : null,
        mn: dp ? dp.mn : null,
        composition: comp.map((x) => ({ name: x.name, molPct: x.molPct, wtPct: x.wtPct })),
        microstructure: micro ? { rows: micro.rows, cis: micro.cisTrans ? micro.cisTrans.cis : null, trans: micro.cisTrans ? micro.cisTrans.trans : null, note: micro.note } : null
      });
    },
    search(query) {
      const r = searchReference(query);
      return JSON.stringify({
        element: r.element ? { symbol: r.element.symbol, name: r.element.name, note: r.element.note, isotopes: r.element.isotopes } : null,
        groups: r.groups.map((g) => ({ id: g.id, name: g.name, nucleus: g.nucleus, min: g.min, max: g.max, typical: g.typical, note: g.note })),
        compounds: r.compounds.map((c) => ({ name: c.name, formula: c.formula }))
      });
    },
    tables() {
      return JSON.stringify({ solvents: SOLVENTS, impurities: IMPURITIES, couplings: COUPLINGS });
    }
  };
})();
