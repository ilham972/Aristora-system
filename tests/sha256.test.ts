import { expect, test } from "vitest";
import { sha256Hex } from "../convex/lib/sha256";

type NodeCrypto = {
  createHash(alg: string): { update(s: string, enc: string): { digest(enc: string): string } };
  randomBytes(n: number): { toString(enc: string): string };
};

test("SHA-256: the standard test vectors", () => {
  expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  );
  expect(sha256Hex("a".repeat(1_000_000))).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
});

test("SHA-256 matches Node's, across block edges and Tamil text", async () => {
  const { createHash, randomBytes } = (await import("node:crypto" as string)) as NodeCrypto;
  const node = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
  for (const s of ["a".repeat(55), "a".repeat(56), "a".repeat(63), "a".repeat(64), "a".repeat(65), "தமிழ் ✓", "x".repeat(1000)]) {
    expect(sha256Hex(s)).toBe(node(s));
  }
  for (let i = 0; i < 300; i++) {
    const s = randomBytes(i).toString("base64");
    expect(sha256Hex(s)).toBe(node(s));
  }
});
