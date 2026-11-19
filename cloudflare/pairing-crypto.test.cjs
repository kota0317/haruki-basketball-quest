'use strict';
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const {createSecret,verifier} = require('./pairing-crypto.js');
(async()=>{
 const a=createSecret(webcrypto), b=createSecret(webcrypto);
 assert.match(a,/^[A-Za-z0-9_-]{43}$/); assert.notEqual(a,b);
 const hash=await verifier(a,webcrypto);
 assert.match(hash,/^[A-Za-z0-9_-]{43}$/); assert.notEqual(hash,a);
 assert.equal(await verifier(a,webcrypto),hash);
 assert.notEqual(await verifier(b,webcrypto),hash);
 await assert.rejects(()=>verifier('short',webcrypto),/Invalid/);
 assert.throws(()=>createSecret(null),/Secure randomness/);
 console.log('PASS pairing randomness, verifier, invalid input');
})().catch(e=>{console.error(e);process.exitCode=1});
