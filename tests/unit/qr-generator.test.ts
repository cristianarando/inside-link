import { describe, expect, it } from "vitest";
import {
  buildCanonicalQrTargetUrl,
  generateQrBundle,
  generateQrCodePngDataUrl,
  generateQrCodeSvg,
} from "../../src/lib/qr-generator";

describe("Custom QR Code Generator (SVG & PNG)", () => {
  it("always targets the canonical domain https://links.cristianarando.dev/[slug]", () => {
    expect(
      buildCanonicalQrTargetUrl("github", "https://links.cristianarando.dev/"),
    ).toBe("https://links.cristianarando.dev/github");
    expect(
      buildCanonicalQrTargetUrl(
        "/Demo-Project",
        "https://links.cristianarando.dev",
      ),
    ).toBe("https://links.cristianarando.dev/demo-project");
  });

  it("generates valid vector SVG with optional CA badge and base64 PNG", async () => {
    const svgWithBadge = await generateQrCodeSvg({
      slug: "linkedin",
      canonicalBaseUrl: "https://links.cristianarando.dev",
      includeCenterBadge: true,
    });
    expect(svgWithBadge).toContain("<svg");
    expect(svgWithBadge).toContain("cristianarando-brand-badge");
    expect(svgWithBadge).toContain("</svg>");

    const svgPlain = await generateQrCodeSvg({
      slug: "linkedin",
      canonicalBaseUrl: "https://links.cristianarando.dev",
      includeCenterBadge: false,
    });
    expect(svgPlain).toContain("<svg");
    expect(svgPlain).not.toContain("cristianarando-brand-badge");

    const pngDataUrl = await generateQrCodePngDataUrl({
      slug: "linkedin",
      canonicalBaseUrl: "https://links.cristianarando.dev",
      sizePx: 512,
    });
    expect(pngDataUrl.startsWith("data:image/png;base64,")).toBe(true);

    const bundle = await generateQrBundle({
      slug: "cv-pdf",
      canonicalBaseUrl: "https://links.cristianarando.dev",
    });
    expect(bundle.targetUrl).toBe("https://links.cristianarando.dev/cv-pdf");
  });
});
