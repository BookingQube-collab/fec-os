import { describe, expect, it } from "vitest";

import { identityFileContentType } from "./identity-file";

describe("identity file types", () => {
  it("accepts a WhatsApp JPEG even when the browser calls it image/jpg", () => {
    expect(identityFileContentType({ name: "IMG-20261013-WA0001.jpg", type: "image/jpg" })).toBe("image/jpeg");
    expect(identityFileContentType({ name: "IMG-20261013-WA0002.jpg", type: "" })).toBe("image/jpeg");
    expect(identityFileContentType({ name: "card.jpeg", type: "image/pjpeg" })).toBe("image/jpeg");
    expect(identityFileContentType({ name: "card.JPG", type: "application/octet-stream" })).toBe("image/jpeg");
  });

  it("rejects a type that is not a pdf or an image", () => {
    expect(identityFileContentType({ name: "notes.txt", type: "text/plain" })).toBeNull();
  });
});
