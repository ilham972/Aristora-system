// A sealed box: words only the two holders of one secret key can read or write (10 Nov 2026, the Claude link).
// - Why: the owner's books travel between the app and a Claude chat through a public place (a GitHub check machine
//   and a branch of this public repo carry them). What travels is sealed with a key that only his app's database and
//   his chat hold, so the carrier (and anyone reading the repo) sees letters without meaning, and can't forge any.
// - How: plain TypeScript on SHA-256 (FIPS 180-4), the same in every Convex function, in Node and in tests, with no
//   randomness of its own (a query can't make any): the sender brings the nonce. The key gives two keys (one to hide,
//   one to sign). Hidden with a keystream: block i = SHA-256(hide key ‖ nonce ‖ i). Signed with HMAC-SHA-256 over
//   nonce ‖ hidden bytes (checked before anything is read). A box = base64url(nonce 16 ‖ hidden ‖ tag 32).
// - A nonce must never be used twice with one key: the asker makes a random one, the answer derives its own from it.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

export const NONCE_BYTES = 16;
export const KEY_BYTES = 32;
const TAG_BYTES = 32;
const W = new Uint32Array(64);

/** One SHA-256 round over the 64 bytes of `data` at `off`: `h` (8 words) moves on. */
function compress(h: Uint32Array, data: Uint8Array, off: number): void {
  for (let i = 0; i < 16; i++) {
    const j = off + i * 4;
    W[i] = ((data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3]) >>> 0;
  }
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15];
    const b = W[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
  }
  let a = h[0];
  let b = h[1];
  let c = h[2];
  let d = h[3];
  let e = h[4];
  let f = h[5];
  let g = h[6];
  let hh = h[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
    hh = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }
  h[0] = (h[0] + a) >>> 0;
  h[1] = (h[1] + b) >>> 0;
  h[2] = (h[2] + c) >>> 0;
  h[3] = (h[3] + d) >>> 0;
  h[4] = (h[4] + e) >>> 0;
  h[5] = (h[5] + f) >>> 0;
  h[6] = (h[6] + g) >>> 0;
  h[7] = (h[7] + hh) >>> 0;
}

function words(h: Uint32Array): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = h[i] >>> 24;
    out[i * 4 + 1] = (h[i] >>> 16) & 255;
    out[i * 4 + 2] = (h[i] >>> 8) & 255;
    out[i * 4 + 3] = h[i] & 255;
  }
  return out;
}

/** SHA-256 of the pieces one after another. */
export function sha256(...pieces: Uint8Array[]): Uint8Array {
  const len = pieces.reduce((s, p) => s + p.length, 0);
  const data = new Uint8Array(Math.ceil((len + 9) / 64) * 64);
  let at = 0;
  for (const p of pieces) {
    data.set(p, at);
    at += p.length;
  }
  data[len] = 0x80;
  const bits = len * 8;
  const end = data.length;
  data[end - 8] = (bits / 2 ** 56) & 255;
  data[end - 7] = (bits / 2 ** 48) & 255;
  data[end - 6] = (bits / 2 ** 40) & 255;
  data[end - 5] = (bits / 2 ** 32) & 255;
  data[end - 4] = (bits >>> 24) & 255;
  data[end - 3] = (bits >>> 16) & 255;
  data[end - 2] = (bits >>> 8) & 255;
  data[end - 1] = bits & 255;
  const h = new Uint32Array(IV);
  for (let off = 0; off < data.length; off += 64) compress(h, data, off);
  return words(h);
}

/** HMAC-SHA-256 (RFC 2104) of the pieces one after another. */
export function hmac(key: Uint8Array, ...pieces: Uint8Array[]): Uint8Array {
  const k = key.length > 64 ? sha256(key) : key;
  const ipad = new Uint8Array(64).fill(0x36);
  const opad = new Uint8Array(64).fill(0x5c);
  for (let i = 0; i < k.length; i++) {
    ipad[i] ^= k[i];
    opad[i] ^= k[i];
  }
  return sha256(opad, sha256(ipad, ...pieces));
}

const text = (s: string) => new TextEncoder().encode(s);

/** `data` with the keystream of (hide key, nonce) over it: the same call hides and shows. */
function stream(hideKey: Uint8Array, nonce: Uint8Array, data: Uint8Array): Uint8Array {
  // One block of 64 bytes: key 32 ‖ nonce 16 ‖ counter 4 ‖ SHA-256's own padding for 52 bytes.
  const block = new Uint8Array(64);
  block.set(hideKey, 0);
  block.set(nonce, 32);
  block[52] = 0x80;
  block[62] = (52 * 8) >>> 8;
  block[63] = (52 * 8) & 255;
  const out = new Uint8Array(data.length);
  const h = new Uint32Array(8);
  for (let i = 0, n = 0; i < data.length; i += 32, n++) {
    block[48] = n >>> 24;
    block[49] = (n >>> 16) & 255;
    block[50] = (n >>> 8) & 255;
    block[51] = n & 255;
    h.set(IV);
    compress(h, block, 0);
    const end = Math.min(32, data.length - i);
    for (let j = 0; j < end; j++) out[i + j] = data[i + j] ^ ((h[j >> 2] >>> (24 - 8 * (j & 3))) & 255);
  }
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const UN64 = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

/** Bytes as base64url, no padding. */
export function toB64(b: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < b.length; i += 3 * 4096) {
    let s = "";
    const end = Math.min(b.length, i + 3 * 4096);
    for (let j = i; j < end; j += 3) {
      const n = (b[j] << 16) | ((b[j + 1] ?? 0) << 8) | (b[j + 2] ?? 0);
      s += B64[n >>> 18] + B64[(n >>> 12) & 63] + (j + 1 < end ? B64[(n >>> 6) & 63] : "") + (j + 2 < end ? B64[n & 63] : "");
    }
    parts.push(s);
  }
  return parts.join("");
}

/** base64url back into bytes; null when it isn't base64url. */
export function fromB64(s: string): Uint8Array | null {
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let at = 0;
  for (let i = 0; i < s.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (i + k < s.length ? (UN64[s.charCodeAt(i + k)] ?? -1) : 0));
    if (c.some((x) => x < 0)) return null;
    const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
    out[at++] = n >>> 16;
    if (i + 2 < s.length) out[at++] = (n >>> 8) & 255;
    if (i + 3 < s.length) out[at++] = n & 255;
  }
  return out;
}

function keys(key: Uint8Array): { hide: Uint8Array; sign: Uint8Array } {
  return { hide: hmac(key, text("aristora link: hide")), sign: hmac(key, text("aristora link: sign")) };
}

/** Words sealed with the key and a nonce never used with it before. */
export function seal(key: Uint8Array, nonce: Uint8Array, words: string): string {
  if (key.length !== KEY_BYTES || nonce.length !== NONCE_BYTES) throw new Error("seal: a key of 32 bytes and a nonce of 16");
  const k = keys(key);
  const hidden = stream(k.hide, nonce, text(words));
  const tag = hmac(k.sign, nonce, hidden);
  const box = new Uint8Array(NONCE_BYTES + hidden.length + TAG_BYTES);
  box.set(nonce, 0);
  box.set(hidden, NONCE_BYTES);
  box.set(tag, NONCE_BYTES + hidden.length);
  return toB64(box);
}

/** A sealed box opened: its words and its nonce; null when the key didn't seal it (or a letter of it changed). */
export function unseal(key: Uint8Array, box: string): { words: string; nonce: Uint8Array } | null {
  const b = fromB64(box);
  if (!b || key.length !== KEY_BYTES || b.length < NONCE_BYTES + TAG_BYTES) return null;
  const k = keys(key);
  const nonce = b.subarray(0, NONCE_BYTES);
  const hidden = b.subarray(NONCE_BYTES, b.length - TAG_BYTES);
  const tag = b.subarray(b.length - TAG_BYTES);
  const want = hmac(k.sign, nonce, hidden);
  let diff = 0;
  for (let i = 0; i < TAG_BYTES; i++) diff |= want[i] ^ tag[i];
  if (diff !== 0) return null;
  try {
    return { words: new TextDecoder("utf-8", { fatal: true }).decode(stream(k.hide, nonce, hidden)), nonce: nonce.slice() };
  } catch {
    return null;
  }
}

/** The nonce of an answer, from the question's: never the question's own, never the same for two questions. */
export function answerNonce(key: Uint8Array, asked: Uint8Array): Uint8Array {
  return hmac(key, text("aristora link: answer"), asked).subarray(0, NONCE_BYTES);
}
