// Reading a workbook straight from the file its builder made: the unit's source zip (its book.html and answer-key.json;
// a topic tute's tute.json; a theory book's fighter.json) or a book.html alone. Opening the zip is all this file does:
// the reading itself is src/workbookRead.ts (no package, so the Claude link's tool, scripts/workbook.ts, reads a chat's
// book with the same code; 24 Nov 2026), and everything it exports is exported from here too, as before.

import { unzipSync } from "fflate";
import { KEY_FILE, readWorkbookPages, THEORY_FILE, TUTE_FILE, type ReadTheory, type ReadTute, type ReadWorkbook } from "./workbookRead";

export * from "./workbookRead";

/** A zip file starts with "PK\x03\x04". */
function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Every workbook in the files the owner picked: unit source zips (their book.html is read), or book.html files.
 * A file with no marks sheet comes back as one entry with a problem, so nothing is silently skipped.
 */
export function readWorkbookFiles(files: { name: string; bytes: Uint8Array }[]): (ReadWorkbook | ReadTute | ReadTheory | { file: string; problem: string })[] {
  const out: (ReadWorkbook | ReadTute | ReadTheory | { file: string; problem: string })[] = [];
  const decode = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);
  for (const f of files) {
    let pages: string[] = [];
    let keyText: string | null = null;
    let tuteText: string | null = null;
    let theoryText: string | null = null;
    try {
      if (isZip(f.bytes)) {
        const inside = unzipSync(f.bytes, {
          filter: (e) =>
            (/\.html?$/i.test(e.name) && e.originalSize < 30_000_000) ||
            ((KEY_FILE.test(e.name) || TUTE_FILE.test(e.name) || THEORY_FILE.test(e.name)) && e.originalSize < 2_000_000),
        });
        for (const [name, bytes] of Object.entries(inside)) {
          if (KEY_FILE.test(name)) keyText = decode(bytes);
          else if (TUTE_FILE.test(name)) tuteText = decode(bytes);
          else if (THEORY_FILE.test(name)) theoryText = decode(bytes);
          else pages.push(decode(bytes));
        }
      } else if (/\.html?$/i.test(f.name)) {
        pages = [decode(f.bytes)];
      } else {
        out.push({ file: f.name, problem: "Not a workbook zip or book.html." });
        continue;
      }
    } catch {
      out.push({ file: f.name, problem: "This zip can't be opened. Download it again and retry." });
      continue;
    }
    out.push(...readWorkbookPages(pages, { key: keyText, tute: tuteText, theory: theoryText }, f.name));
  }
  return out;
}
