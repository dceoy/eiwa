import { type AiExplanationOutput, validateAiExplanationOutput } from "./result-schema";

/** Read only completed top-level JSON values. Never repair unfinished strings,
 * evaluate model text, or mistake nested/quoted keys for result sections. */
export function parseAiProgress(text: string): AiExplanationOutput | null {
  const input = text.trimStart().replace(/^```(?:json)?\s*/i, "");
  if (input[0] !== "{") return null;
  const fields: Record<string, unknown> = {};
  let i = 1;
  const whitespace = () => {
    while (/\s/.test(input[i] ?? "") && i < input.length) i++;
  };
  while (i < input.length) {
    whitespace();
    if (input[i] !== '"') break;
    const keyStart = i++;
    let escaped = false;
    for (; i < input.length; i++) {
      const char = input[i];
      if (!escaped && char === '"') break;
      escaped = !escaped && char === "\\";
    }
    if (i >= input.length) break;
    let key: string;
    try {
      key = JSON.parse(input.slice(keyStart, ++i));
    } catch {
      break;
    }
    whitespace();
    if (input[i++] !== ":") break;
    whitespace();
    const start = i;
    let depth = 0;
    let quoted = false;
    escaped = false;
    for (; i < input.length; i++) {
      const char = input[i];
      if (quoted) {
        if (!escaped && char === '"') quoted = false;
        escaped = !escaped && char === "\\";
      } else if (char === '"') quoted = true;
      else if (char === "{" || char === "[") depth++;
      else if (char === "}" || char === "]") {
        if (depth === 0) break;
        depth--;
      } else if (char === "," && depth === 0) break;
    }
    // A closing object/array can complete a value even before its comma arrives.
    if (quoted || depth !== 0) break;
    try {
      const value = JSON.parse(input.slice(start, i));
      if (!(key in fields)) fields[key] = value;
    } catch {
      break;
    }
    if (input[i] !== ",") break;
    i++;
  }
  // Reuse the final schema's coercion/allowlist: dictionary facts never escape.
  return validateAiExplanationOutput(fields);
}
