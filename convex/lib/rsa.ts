// RS256 in plain TypeScript (23 Nov 2026, the videos): a video's play link is signed by the server with its host's key
// (lib/videos.ts), in a mutation, the same in every Convex function and in tests, like the sha256 beside it. Signing
// only (RSASSA-PKCS1-v1_5 with SHA-256, RFC 8017 §8.2); the key is read from PEM (PKCS#1 "RSA PRIVATE KEY" or PKCS#8
// "PRIVATE KEY"), and the signature made with the CRT parts of the key (a few milliseconds a link).

import { sha256Hex } from "./sha256";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 (standard or URL-safe, padding optional) to bytes. */
export function fromB64(text: string): Uint8Array {
  const s = text.replace(/[\s=]/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error("Not base64");
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

/** Bytes to base64 (`url`: the URL-safe alphabet, no padding, as a JWT writes it). */
export function toB64(b: Uint8Array, url = false): string {
  let s = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < b.length ? B64[n & 63] : "=");
  }
  return url ? s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_") : s;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

type Der = { tag: number; start: number; end: number };

function der(b: Uint8Array, at: number): Der {
  if (at + 2 > b.length) throw new Error("Not a key");
  let len = b[at + 1];
  let start = at + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n > 4) throw new Error("Not a key");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[start + i];
    start += n;
  }
  if (start + len > b.length) throw new Error("Not a key");
  return { tag: b[at], start, end: start + len };
}

function items(b: Uint8Array, d: Der): Der[] {
  const out: Der[] = [];
  for (let at = d.start; at < d.end; ) {
    const x = der(b, at);
    out.push(x);
    at = x.end;
  }
  return out;
}

function big(b: Uint8Array, from = 0, to = b.length): bigint {
  let x = 0n;
  for (let i = from; i < to; i++) x = (x << 8n) | BigInt(b[i]);
  return x;
}

export type RsaKey = { n: bigint; d: bigint; p: bigint; q: bigint; dp: bigint; dq: bigint; qi: bigint; size: number };

/** An RSA private key from its PEM text (PKCS#1, or PKCS#8 holding one). */
export function rsaKey(pem: string): RsaKey {
  const bytes = fromB64(pem.replace(/-----[^-]+-----/g, ""));
  let top = der(bytes, 0);
  let list = items(bytes, top);
  // PKCS#8: version, the algorithm, then the PKCS#1 key inside an OCTET STRING.
  if (list.length === 3 && list[2].tag === 0x04) {
    top = der(bytes, list[2].start);
    list = items(bytes, top);
  }
  if (top.tag !== 0x30 || list.length < 9 || list.slice(0, 9).some((x) => x.tag !== 0x02)) throw new Error("Not an RSA private key");
  const [n, , d, p, q, dp, dq, qi] = list.slice(1, 9).map((x) => big(bytes, x.start, x.end));
  return { n, d, p, q, dp, dq, qi, size: Math.ceil(n.toString(16).length / 2) };
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n;
  let b = base % mod;
  for (let e = exp; e > 0n; e >>= 1n) {
    if (e & 1n) r = (r * b) % mod;
    b = (b * b) % mod;
  }
  return r;
}

/** SHA-256's DigestInfo header (RFC 8017 §9.2, note 1). */
const SHA256_INFO = [0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20];

/** The RS256 signature of a text (UTF-8). */
export function rs256(key: RsaKey, text: string): Uint8Array {
  const hex = sha256Hex(text);
  const t = [...SHA256_INFO, ...Array.from({ length: 32 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16))];
  const k = key.size;
  if (k < t.length + 11) throw new Error("The key is too short");
  const em = new Uint8Array(k).fill(0xff);
  em[0] = 0;
  em[1] = 1;
  em[k - t.length - 1] = 0;
  em.set(t, k - t.length);
  const m = big(em);
  // With the key's CRT parts: two half-size powers, then put together (Garner).
  const m1 = modPow(m, key.dp, key.p);
  const m2 = modPow(m, key.dq, key.q);
  const h = (key.qi * (((m1 - m2) % key.p) + key.p)) % key.p;
  let s = m2 + h * key.q;
  const out = new Uint8Array(k);
  for (let i = k - 1; i >= 0; i--) {
    out[i] = Number(s & 0xffn);
    s >>= 8n;
  }
  return out;
}

/** A JSON Web Token signed RS256, with the key's id in its header. */
export function jwtRs256(key: RsaKey, kid: string, claims: Record<string, unknown>): string {
  const head = toB64(utf8(JSON.stringify({ alg: "RS256", typ: "JWT", kid })), true);
  const body = toB64(utf8(JSON.stringify(claims)), true);
  return `${head}.${body}.${toB64(rs256(key, `${head}.${body}`), true)}`;
}
