/**
 * Validate the basic email shape accepted by Supabase Auth.
 * Uses bounded string operations rather than a backtracking regular expression
 * on user-controlled input.
 */
export function isValidEmailAddress(value: string): boolean {
  if (value.length === 0 || value.length > 254) return false;

  const separator = value.indexOf("@");
  if (separator <= 0 || separator !== value.lastIndexOf("@")) return false;

  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  if (local.length > 64 || domain.length < 3 || domain.length > 253) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  if (!domain.includes(".")) return false;

  // Reject whitespace and common address delimiters without a potentially
  // expensive nested-quantifier expression.
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 32 || code === 127 || character === "<" || character === ">" || character === "," || character === ";" || character === ":" || character === "\\" || character === "/" || character === "[" || character === "]" || character === "(" || character === ")") {
      return false;
    }
  }

  return true;
}
