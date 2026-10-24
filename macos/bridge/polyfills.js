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
