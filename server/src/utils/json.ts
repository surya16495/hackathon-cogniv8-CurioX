/**
 * Pull a JSON value out of model output. Models sometimes wrap JSON in ```json fences
 * or add a sentence before it even when asked not to.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const start = trimmed.search(/[[{]/);
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (start !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new SyntaxError('No JSON found in model output');
}
