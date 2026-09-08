/**
 * Pull the streaming value of a JSON string field out of a partial JSON document
 * so the UI can render visible text as deltas arrive instead of raw JSON tokens.
 *
 * `json` is treated as a prefix of a well-formed JSON object — the field's
 * closing quote may not be in the buffer yet. When the closing quote is reached
 * the function returns the fully-decoded string; until then it returns the
 * decoded characters seen so far.
 *
 * Handles standard JSON escapes (`\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t`)
 * and `\uXXXX`. Mid-escape boundaries are treated as "wait for more" — we stop
 * emitting at the incomplete byte rather than guessing.
 */
export function extractStreamingStringField(
  json: string,
  fieldName: string
): string {
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startMatch = json.match(new RegExp(`"${escapedField}"\\s*:\\s*"`));
  if (!startMatch || startMatch.index === undefined) return '';

  let i = startMatch.index + startMatch[0].length;
  let out = '';

  const simpleEscape: Record<string, string> = {
    '"': '"',
    '\\': '\\',
    '/': '/',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
  };

  while (i < json.length) {
    const c = json[i];
    if (c === undefined) break;
    if (c === '\\') {
      const next = json[i + 1];
      if (next === undefined) break;
      if (next === 'u') {
        const hex = json.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        const code = Number.parseInt(hex, 16);
        if (Number.isNaN(code)) break;
        out += String.fromCharCode(code);
        i += 6;
        continue;
      }
      const decoded = simpleEscape[next];
      if (decoded === undefined) {
        out += next;
      } else {
        out += decoded;
      }
      i += 2;
      continue;
    }
    if (c === '"') return out;
    out += c;
    i += 1;
  }

  return out;
}
