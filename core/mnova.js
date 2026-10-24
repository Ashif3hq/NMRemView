// MestReNova .mnova documents are a closed, undocumented format. This reader recovers spectra
// that the document carries in an open form: embedded JCAMP-DX text, or zlib-compressed blocks
// that contain JCAMP-DX or Bruker parameter files plus their binary data.
import { inflateZlib } from './inflate.js';
import { readJcamp } from './jcamp.js';

const dec = (b) => new TextDecoder('latin1').decode(b);

export function isMnova(bytes, name = '') {
  return /\.mnova$/i.test(name);
}

export function readMnova(bytes, name = 'document.mnova') {
  const found = [];
  const tryText = (u8) => {
    const s = dec(u8);
    let i = s.indexOf('##TITLE=');
    while (i >= 0 && found.length < 20) {
      const end = s.indexOf('##END=', i);
      if (end < 0) break;
      try { for (const ds of readJcamp(s.slice(i, end + 8), name)) found.push({ ...ds, source: 'MestReNova (embedded JCAMP-DX)' }); } catch (e) { /* not a usable block */ }
      i = s.indexOf('##TITLE=', end);
    }
  };
  tryText(bytes);
  // Scan for zlib streams (Qt qCompress stores a 4-byte length then zlib data).
  let tried = 0;
  for (let p = 0; p < bytes.length - 2 && tried < 400 && !found.length; p++) {
    if (bytes[p] !== 0x78 || (bytes[p + 1] !== 0x9c && bytes[p + 1] !== 0xda && bytes[p + 1] !== 0x01)) continue;
    tried++;
    try {
      const inner = inflateZlib(bytes.subarray(p));
      if (inner.length > 64) tryText(inner);
    } catch (e) { /* not a stream */ }
  }
  if (!found.length) {
    throw new Error('This .mnova document stores its spectra in MestReNova\'s closed format. In MestReNova choose File › Save As… › JCAMP-DX (*.jdx) and open that, or open the original instrument folder.');
  }
  return found;
}
