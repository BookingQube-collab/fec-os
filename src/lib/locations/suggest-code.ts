/** Uppercase site code from a display name; falls back to SITE. */
export function suggestLocationCode(name: string): string {
  const cleaned = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return cleaned || "SITE";
}
