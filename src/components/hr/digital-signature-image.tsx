"use client";

import { cn } from "@/lib/utils";

/**
 * Opt-in digital signature stamp for print slips and profile preview.
 * `mix-blend-mode: multiply` knocks out opaque white flats common in scanned /
 * exported signature PNGs/JPEGs so strokes sit cleanly on the form cell.
 */
export function DigitalSignatureImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL / data URL for print
    <img
      src={src}
      alt={alt}
      className={cn(
        "digital-signature-img mx-auto bg-transparent object-contain mix-blend-multiply",
        className,
      )}
    />
  );
}

/** Shared print CSS — keep blend mode + transparent bg under @media print. */
export const DIGITAL_SIGNATURE_PRINT_CSS = `
  .digital-signature-img {
    background: transparent !important;
    mix-blend-mode: multiply;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media print {
    .digital-signature-img {
      background: transparent !important;
      mix-blend-mode: multiply !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`;
