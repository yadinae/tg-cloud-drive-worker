/**
 * HTTP Range header parsing (RFC 9110 §14.2) for file downloads.
 *
 * Only single byte-ranges are served. Anything else is either ignored or
 * unsatisfiable, and the caller decides the response:
 * - `ignore` — no header, malformed syntax, or multiple ranges. The server
 *   MAY ignore the Range header, so the caller returns the full file (200).
 * - `unsatisfiable` — valid syntax but outside the representation (start
 *   past the end, empty file, zero-length suffix). The caller returns 416
 *   with `Content-Range: bytes *\/<total>`.
 * - `range` — a single satisfiable byte-range, end already clamped to
 *   totalSize - 1. The caller returns 206.
 */
export type ParsedRange =
  | { kind: 'range'; start: number; end: number }
  | { kind: 'unsatisfiable' }
  | { kind: 'ignore' };

export function parseRangeHeader(
  header: string | undefined | null,
  totalSize: number,
): ParsedRange {
  if (!header) return { kind: 'ignore' };
  if (totalSize <= 0) return { kind: 'unsatisfiable' };

  const match = /^bytes=([^,]+)$/.exec(header.trim());
  if (!match) return { kind: 'ignore' }; // wrong unit or multiple ranges
  const spec = match[1].trim();

  // Suffix range: bytes=-N → the last N bytes.
  if (spec.startsWith('-')) {
    const suffix = Number(spec.slice(1));
    if (!Number.isInteger(suffix) || suffix <= 0) return { kind: 'unsatisfiable' };
    if (suffix >= totalSize) return { kind: 'range', start: 0, end: totalSize - 1 };
    return { kind: 'range', start: totalSize - suffix, end: totalSize - 1 };
  }

  const parts = spec.split('-');
  if (parts.length !== 2) return { kind: 'ignore' };
  const start = Number(parts[0]);
  const end = parts[1] === '' ? totalSize - 1 : Number(parts[1]);
  if (!Number.isInteger(start) || start < 0) return { kind: 'ignore' };
  if (parts[1] !== '' && (!Number.isInteger(end) || end < start)) return { kind: 'ignore' };
  if (start >= totalSize) return { kind: 'unsatisfiable' };
  return { kind: 'range', start, end: Math.min(end, totalSize - 1) };
}
