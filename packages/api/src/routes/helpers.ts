/**
 * Extract a route parameter as a string.
 * Handles Express's string | string[] union type.
 */
export function param(req: { params: Record<string, string | string[]> }, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : val;
}
