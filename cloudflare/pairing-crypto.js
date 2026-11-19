/* Draft primitives only. Pairing needs a transactional server and is not enabled. */
'use strict';
(function (root) {
  const encode = bytes => {
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  };
  function createSecret(cryptoApi) {
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') throw new Error('Secure randomness required');
    const bytes = new Uint8Array(32); cryptoApi.getRandomValues(bytes);
    return encode(bytes);
  }
  async function verifier(secret, cryptoApi) {
    if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error('Invalid pairing secret');
    if (!cryptoApi || !cryptoApi.subtle) throw new Error('Web Crypto required');
    return encode(new Uint8Array(await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(secret))));
  }
  const api = { createSecret, verifier };
  if (typeof module !== 'undefined') module.exports = api; else root.HQPairingCrypto = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
