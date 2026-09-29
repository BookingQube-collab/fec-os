import { describe, expect, it } from "vitest";

import { documentPreviewKind } from "./document-preview-kind";

describe("documentPreviewKind", () => {
  it("renders images and PDFs from mime or extension", () => {
    expect(documentPreviewKind("image/jpeg", "qid.jpeg")).toBe("image");
    expect(documentPreviewKind("image/png", "scan.png")).toBe("image");
    expect(documentPreviewKind("image/webp", "scan.webp")).toBe("image");
    expect(documentPreviewKind("image/gif", "scan.gif")).toBe("image");
    expect(documentPreviewKind("IMAGE/JPEG; charset=binary", "qid.jpeg")).toBe("image");
    expect(documentPreviewKind("application/pdf", "contract.pdf")).toBe("pdf");
    expect(documentPreviewKind(null, "qid.JPEG")).toBe("image");
    expect(documentPreviewKind(null, "folder/contract.PDF")).toBe("pdf");
  });

  it("uses a file card when the type cannot be embedded", () => {
    expect(documentPreviewKind(null, "notes.docx")).toBe("file");
    expect(documentPreviewKind("application/octet-stream", "scan.bin")).toBe("file");
    expect(documentPreviewKind("", "")).toBe("file");
  });
});
