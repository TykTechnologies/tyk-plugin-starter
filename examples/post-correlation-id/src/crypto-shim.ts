// Goja runtime shim for `crypto.getRandomValues` so the browser build of `uuid`
// works inside the Tyk gateway. Goja has no `crypto` global; webpack's
// `crypto-browserify` polyfill is excluded by webpack.config.js (`crypto: false`)
// because it pulls in `Buffer`/`stream` and bloats the bundle.
//
// Math.random() is sufficient for v4 UUID uniqueness in this plugin context —
// we only need ~122 bits of entropy spread across distinct request IDs, not
// cryptographic unpredictability. If you need CSPRNG quality, replace with a
// gateway-provided source when available.

(function installCryptoShim() {
  var g: any = typeof globalThis !== 'undefined' ? globalThis : (0, eval)('this');
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    return;
  }
  var existing = g.crypto || {};
  existing.getRandomValues = function getRandomValues(buf: Uint8Array): Uint8Array {
    for (var i = 0; i < buf.length; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
    return buf;
  };
  g.crypto = existing;
})();
