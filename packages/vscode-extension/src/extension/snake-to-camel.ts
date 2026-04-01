export function snakeToCamelKey(key: string): string {
  return key.replace(/(?<=\w)_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function snakeToCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(snakeToCamel);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[snakeToCamelKey(key)] = snakeToCamel(value);
    }
    return result;
  }
  return obj;
}
