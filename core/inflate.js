// Pure-JS DEFLATE decoder (RFC 1951) plus zlib wrapper, so compressed payloads can be read
// where DecompressionStream is unavailable (JavaScriptCore in the macOS app).

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

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

let FIXED_LIT = null, FIXED_DIST = null;
function fixedTrees() {
  if (!FIXED_LIT) {
    const l = new Uint8Array(288);
    l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
    FIXED_LIT = buildTree(l);
    FIXED_DIST = buildTree(new Uint8Array(30).fill(5));
  }
  return [FIXED_LIT, FIXED_DIST];
}

export function inflateRaw(src, sizeHint = 0) {
  let pos = 0, bit = 0, bitCount = 0;
  let out = new Uint8Array(Math.max(1024, sizeHint || src.length * 4));
  let o = 0;
  const ensure = (n) => {
    if (o + n <= out.length) return;
    let len = out.length * 2;
    while (len < o + n) len *= 2;
    const next = new Uint8Array(len); next.set(out); out = next;
  };
  const bits = (n) => {
    while (bitCount < n) {
      if (pos >= src.length) throw new Error('Unexpected end of compressed data');
      bit |= src[pos++] << bitCount; bitCount += 8;
    }
    const v = bit & ((1 << n) - 1);
    bit >>>= n; bitCount -= n;
    return v;
  };
  const decode = (t) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const count = t.counts[len];
      if (code - count < first) return t.symbols[index + (code - first)];
      index += count; first += count; first <<= 1; code <<= 1;
    }
    throw new Error('Invalid Huffman code');
  };
  let final = 0;
  while (!final) {
    final = bits(1);
    const type = bits(2);
    if (type === 0) {
      bit = 0; bitCount = 0;
      const len = src[pos] | (src[pos + 1] << 8);
      pos += 4;
      ensure(len); out.set(src.subarray(pos, pos + len), o); o += len; pos += len;
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
      for (let i = 0; i < hlit + hdist;) {
        const sym = decode(clt);
        if (sym < 16) lens[i++] = sym;
        else if (sym === 16) { const p = lens[i - 1]; for (let r = bits(2) + 3; r > 0; r--) lens[i++] = p; }
        else if (sym === 17) i += bits(3) + 3;
        else i += bits(7) + 11;
      }
      lit = buildTree(lens.subarray(0, hlit));
      dist = buildTree(lens.subarray(hlit));
    } else throw new Error('Invalid DEFLATE block');
    for (;;) {
      const sym = decode(lit);
      if (sym === 256) break;
      if (sym < 256) { ensure(1); out[o++] = sym; continue; }
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

// zlib stream: 2-byte header, deflate data, adler32.
export function inflateZlib(src) {
  if (src.length < 2 || (src[0] & 0x0f) !== 8 || ((src[0] << 8) | src[1]) % 31 !== 0) throw new Error('Not a zlib stream');
  return inflateRaw(src.subarray(2));
}
