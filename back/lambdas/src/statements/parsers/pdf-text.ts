import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export interface PdfLine {
  pageIndex: number;
  y: number;
  text: string;
}

/**
 * Extract plain text lines from a PDF byte stream using pdfjs-dist. The
 * lambda runtime uses the legacy ESM build. Lines are reconstructed from
 * the token stream by grouping tokens within a 2-point y tolerance and
 * concatenating them in x order.
 *
 * Kept isolated in this file so the parsers themselves remain pure and
 * testable without pdfjs-dist.
 */
export async function extractText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdfjs-dist v4 requires a non-empty workerSrc even when Node.js falls back
  // to its in-process fake worker. Resolve the sibling worker file's path via
  // createRequire so this works in both Lambda (native ESM) and Vitest (SSR
  // transform mode, where import.meta.resolve is not available).
  const _require = createRequire(import.meta.url);
  const workerPath = _require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  (pdfjs as unknown as { GlobalWorkerOptions?: { workerSrc: string } })
    .GlobalWorkerOptions!.workerSrc = pathToFileURL(workerPath).href;

  const doc = await pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  const lines: PdfLine[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    type Item = { str: string; transform: number[] };
    const items = content.items as Item[];

    const byY = new Map<number, { x: number; text: string }[]>();
    for (const it of items) {
      if (!it.str || !it.transform) continue;
      const x = it.transform[4];
      const y = Math.round(it.transform[5]);
      const bucket = byY.get(y) ?? [];
      bucket.push({ x, text: it.str });
      byY.set(y, bucket);
    }

    const sortedYs = [...byY.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const parts = byY.get(y)!.sort((a, b) => a.x - b.x);
      const text = parts.map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim();
      if (text) lines.push({ pageIndex: i - 1, y, text });
    }
  }

  return lines.map((l) => l.text).join('\n');
}
