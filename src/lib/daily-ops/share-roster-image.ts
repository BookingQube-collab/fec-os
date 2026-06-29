export type ShareRosterResult = "shared" | "downloaded";

/** Tailwind v4 / modern CSS may resolve colors to oklab, which html2canvas cannot parse. */
const MODERN_COLOR_RE = /\b(oklab|oklch|color-mix|lab\(|lch\()/i;

const CSS_COLOR_PROPERTIES = [
  "color",
  "background-color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "column-rule-color",
  "caret-color",
  "fill",
  "stroke",
] as const;

const CSS_COMPOUND_COLOR_PROPERTIES = [
  "background",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "outline",
  "box-shadow",
  "text-shadow",
] as const;

const SKIPPED_COLOR_VALUES = new Set(["", "none", "transparent", "currentcolor"]);

function usesModernColor(value: string): boolean {
  return MODERN_COLOR_RE.test(value);
}

function resolveRgbColorValue(
  probe: HTMLElement,
  view: Window,
  property: string,
  computedValue: string,
): string | null {
  const value = computedValue.trim();
  if (!value || SKIPPED_COLOR_VALUES.has(value.toLowerCase())) return null;

  probe.style.setProperty(property, value);
  const resolved = view.getComputedStyle(probe).getPropertyValue(property).trim();
  probe.style.removeProperty(property);

  if (!resolved || SKIPPED_COLOR_VALUES.has(resolved.toLowerCase())) return null;
  if (usesModernColor(resolved)) return null;
  return resolved;
}

/** Rewrite oklab/oklch/color-mix computed values as rgb/rgba on inline styles for html2canvas. */
export function sanitizeModernColorsForHtml2Canvas(
  root: HTMLElement,
  doc: Document = root.ownerDocument,
): void {
  const view = doc.defaultView;
  if (!view) return;

  const probe = doc.createElement("div");
  probe.style.display = "none";
  doc.body.appendChild(probe);

  const elements = [root, ...Array.from(root.querySelectorAll("*"))];

  try {
    for (const el of elements) {
      if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) continue;

      const target = el as HTMLElement;
      const computed = view.getComputedStyle(el);

      for (const prop of CSS_COLOR_PROPERTIES) {
        const value = computed.getPropertyValue(prop);
        if (!value || !usesModernColor(value)) continue;

        const resolved = resolveRgbColorValue(probe, view, prop, value);
        if (resolved) target.style.setProperty(prop, resolved, "important");
      }

      for (const prop of CSS_COMPOUND_COLOR_PROPERTIES) {
        const value = computed.getPropertyValue(prop);
        if (!value || value === "none" || !usesModernColor(value)) continue;

        const resolved = resolveRgbColorValue(probe, view, prop, value);
        if (resolved) target.style.setProperty(prop, resolved, "important");
      }
    }
  } finally {
    doc.body.removeChild(probe);
  }
}

function canShareFiles(file: File): boolean {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  try {
    return navigator.canShare?.({ files: [file] }) ?? false;
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Capture a DOM node as PNG and share via Web Share API or download fallback. */
export async function captureAndShareRosterImage(
  element: HTMLElement,
  options: { filename: string; shareTitle: string; shareText: string },
): Promise<ShareRosterResult> {
  const { default: html2canvas } = await import("html2canvas");

  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
    onclone: (doc, clonedElement) => {
      sanitizeModernColorsForHtml2Canvas(clonedElement, doc);
    },
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to create image"))), "image/png");
  });

  const file = new File([blob], options.filename, { type: "image/png" });

  if (canShareFiles(file)) {
    await navigator.share({
      files: [file],
      title: options.shareTitle,
      text: options.shareText,
    });
    return "shared";
  }

  downloadBlob(blob, options.filename);
  return "downloaded";
}
