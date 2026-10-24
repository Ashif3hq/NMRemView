// Varian / Agilent VnmrJ reader (procpar + fid inside a .fid directory).

export function parseProcpar(text) {
  const lines = text.split(/\r?\n/);
  const out = {};
  let i = 0;
  while (i < lines.length) {
    const head = lines[i].trim().split(/\s+/);
    i++;
    if (head.length < 11) continue;
    const name = head[0];
    const basictype = parseInt(head[2], 10); // 1 real, 2 string
    let valueLine = (lines[i] || '').trim();
    i++;
    const count = parseInt(valueLine, 10);
    let values = [];
    if (basictype === 2) {
      let rest = valueLine.replace(/^\d+\s*/, '');
      const strs = [];
      const re = /"((?:[^"\\]|\\.)*)"/g;
      let m;
      while ((m = re.exec(rest))) strs.push(m[1]);
      while (strs.length < count && i < lines.length) {
        rest = lines[i++];
        re.lastIndex = 0;
        while ((m = re.exec(rest))) strs.push(m[1]);
      }
      values = strs;
    } else {
      values = valueLine.split(/\s+/).slice(1).map(Number);
    }
    // Enumeration line
    i++;
    out[name] = values.length === 1 ? values[0] : values;
  }
  return out;
}

export function readVarian(files, name = 'varian') {
  const ppBuf = files.get('procpar');
  const fidBuf = files.get('fid');
  if (!ppBuf || !fidBuf) throw new Error('Varian data needs both procpar and fid');
  const pp = parseProcpar(new TextDecoder('latin1').decode(ppBuf));
  const dv = new DataView(fidBuf.buffer, fidBuf.byteOffset, fidBuf.byteLength);
  const nblocks = dv.getInt32(0), ntraces = dv.getInt32(4), np = dv.getInt32(8);
  const ebytes = dv.getInt32(12), status = dv.getInt16(26);
  const isFloat = (status & 0x8) !== 0;
  const n = np / 2;
  const re = new Float64Array(n), im = new Float64Array(n);
  // Sum all blocks/traces of the first increment set (1D: usually one block).
  let off = 32 + 28;
  const read = (o) => (isFloat ? dv.getFloat32(o) : ebytes === 4 ? dv.getInt32(o) : dv.getInt16(o));
  for (let k = 0; k < n; k++) {
    re[k] = read(off + 2 * k * ebytes);
    im[k] = -read(off + (2 * k + 1) * ebytes);
  }
  const sw = Number(pp.sw), sfrq = Number(pp.sfrq);
  const rfl = Number(pp.rfl || 0), rfp = Number(pp.rfp || 0);
  // VnmrJ scale: frequency = (distance from right edge) - rfl + rfp
  const leftPpm = (sw - rfl + rfp) / sfrq;
  const centerPpm = leftPpm - sw / sfrq / 2;
  return {
    name, title: String(pp.samplename || pp.seqfil || name), nucleus: String(pp.tn || '1H'),
    solvent: pp.solvent, frequency: sfrq, source: 'Varian/Agilent',
    meta: { pulseSequence: pp.seqfil, scans: Number(pp.nt), temperature: Number(pp.temp), date: pp.date, blocks: nblocks, traces: ntraces },
    fid: { re, im, sw, centerPpm, grpdly: 0, origin: 'varian' },
  };
}
