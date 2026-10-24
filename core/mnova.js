// MestReNova .mnova documents are a closed, undocumented format (a Qt QDataStream). This reader
// recovers the spectra a document carries in a form we understand:
//  - Bruker experiments: Mnova keeps the original parameter files (acqus, procs, ...) as
//    qCompress blocks named by a preceding UTF-16 string, followed later by the FID as a
//    big-endian byte count and little-endian float32 (or float64) values.
//  - Embedded JCAMP-DX text, plain or zlib-compressed.
import { inflateZlib } from './inflate.js';
import { readJcamp } from './jcamp.js';
import { readBruker, parseBrukerParams } from './bruker.js';

const dec = (b) => new TextDecoder('latin1').decode(b);
const u32 = (b, p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;

export function isMnova(bytes, name = '') {
  return /\.mnova$/i.test(name) || dec(bytes.subarray(0, 23)) === 'Mestrelab Research S.L.';
}

// Last run of printable ASCII stored as UTF-16BE in b[from, to).
function lastUtf16(b, from, to, minLen = 3) {
  let best = null, run = '', start = -1;
  for (let p = Math.max(0, from); p + 1 < to; p += 2) {
    const ok = b[p] === 0 && b[p + 1] >= 0x20 && b[p + 1] < 0x7f;
    if (ok) { if (!run) start = p; run += String.fromCharCode(b[p + 1]); }
    if (!ok || p + 3 >= to) { if (run.length >= minLen) best = { text: run, at: start }; run = ''; }
  }
  return best;
}

// qCompress blocks: [u32 BE compressed length + 4][u32 BE raw length][zlib stream].
function findBlocks(b) {
  const blocks = [];
  for (let p = 8; p < b.length - 2; p++) {
    if (b[p] !== 0x78 || (b[p + 1] !== 0x9c && b[p + 1] !== 0xda && b[p + 1] !== 0x01 && b[p + 1] !== 0x5e)) continue;
    const clen = u32(b, p - 8) - 4, rawLen = u32(b, p - 4);
    if (clen <= 2 || clen > b.length - p || rawLen > 64e6) continue;
    try {
      const data = inflateZlib(b.subarray(p, p + clen));
      if (data.length !== rawLen) continue;
      const evenFrom = p - 8 - 200 - ((p - 8) % 2);
      const n1 = lastUtf16(b, evenFrom, p - 8), n2 = lastUtf16(b, evenFrom + 1, p - 8);
      const nm = [n1, n2].filter(Boolean).sort((x, y) => y.at - x.at)[0];
      blocks.push({ at: p, end: p + clen, name: nm ? nm.text : '', data });
      p += clen - 1;
    } catch (e) { /* not a block */ }
  }
  return blocks;
}

// After an experiment's parameters, the FID is stored as [u32 BE byte count][flag byte][values].
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
        if (!Number.isFinite(v) || Math.abs(v) > 1e30) { finite = false; break; }
        vals[i] = v; energy += v * v;
      }
      if (finite && energy > 0) return { at: p, vals };
    }
  }
  return null;
}

function readMnovaBruker(b, name) {
  const blocks = findBlocks(b);
  const out = [], seen = new Set();
  let group = new Map();
  for (let k = 0; k < blocks.length; k++) {
    const blk = blocks[k];
    const file = blk.name.split('/').pop();
    if (file === 'procs') group.set('pdata/1/procs', blk.data);
    else if (file === 'title') group.set('pdata/1/title', blk.data);
    else if (file === 'acqus') {
      group.set('acqus', blk.data);
      const files = group;
      group = new Map();
      const acqus = parseBrukerParams(dec(blk.data));
      const td = parseInt(acqus.$TD, 10);
      if (!(td > 0)) continue;
      const next = blocks.slice(k + 1).find((x) => x.name.split('/').pop() === 'acqus');
      const limit = next ? next.at : b.length;
      const fid = findFid(b, blk.end, limit, td);
      if (!fid || seen.has(fid.at)) continue;
      seen.add(fid.at);
      const label = expName(b, blk.end, fid.at) || name;
      try {
        const ds = readBruker(files, label, { fidValues: fid.vals });
        if (!files.get('pdata/1/title') || !dec(files.get('pdata/1/title')).trim()) ds.title = label;
        ds.source = 'MestReNova (Bruker data)';
        if (ds.fid) ds.fid.origin = 'mnova';
        out.push(ds);
      } catch (e) { /* skip unusable experiment */ }
    }
  }
  return out;
}

// Name an experiment after its original folder, e.g. ".../Student/Macro1/10/fid" -> "Macro1 (10)".
function expName(b, from, to) {
  let best = null;
  for (const off of [0, 1]) {
    let p = from + ((from + off) % 2 ? 1 : 0);
    let run = '';
    for (; p + 1 < to; p += 2) {
      if (b[p] === 0 && b[p + 1] >= 0x20 && b[p + 1] < 0x7f) { run += String.fromCharCode(b[p + 1]); continue; }
      const m = run.match(/([^/\\]+)[/\\](\d+)[/\\](?:fid|ser|acqus?)$/);
      if (m) best = `${m[1]} (${m[2]})`;
      run = '';
    }
  }
  return best;
}

export function readMnova(bytes, name = 'document.mnova') {
  const found = [];
  try { found.push(...readMnovaBruker(bytes, name)); } catch (e) { /* fall through */ }
  if (found.length) return found;
  const tryText = (u8) => {
    const s = dec(u8);
    let i = s.indexOf('##TITLE=');
    while (i >= 0 && found.length < 20) {
      const end = s.indexOf('##END=', i);
      if (end < 0) break;
      const block = s.slice(i, end + 8);
      if (/##DATA ?TABLE|##XYDATA|##PEAK ?TABLE|##XYPOINTS/i.test(block)) {
        try { for (const ds of readJcamp(block, name)) found.push({ ...ds, source: 'MestReNova (embedded JCAMP-DX)' }); } catch (e) { /* not a usable block */ }
      }
      i = s.indexOf('##TITLE=', end);
    }
  };
  tryText(bytes);
  if (!found.length) for (const blk of findBlocks(bytes)) if (blk.data.length > 64) tryText(blk.data);
  if (!found.length) {
    throw new Error('Could not find spectrum data inside this .mnova document. In MestReNova choose File › Save As… › JCAMP-DX (*.jdx) and open that, or open the original instrument folder.');
  }
  return found;
}
