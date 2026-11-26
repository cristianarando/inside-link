import { describe, expect, it } from "vitest";
import { isReservedSlug } from "../../src/lib/constants/reserved-slugs";
import { isTechnicalPreviewHost } from "../../src/proxy";

describe("Standalone Subdomain Deployment (links.cristianarando.dev)", () => {
  it("allows former portfolio slugs to be shortened on links.cristianarando.dev while keeping system routes reserved", () => {
    for (const slug of [
      "projects",
      "uses",
      "blog",
      "about",
      "contact",
      "cv",
      "es",
      "en",
    ]) {
      expect(
        isReservedSlug(slug),
        `Slug "${slug}" should no longer be blocked after decoupling my-portfolio`,
      ).toBe(false);
    }

    for (const systemSlug of [
      "admin",
      "login",
      "api",
      "links",
      "_next",
      "favicon.ico",
    ]) {
      expect(
        isReservedSlug(systemSlug),
        `System route "${systemSlug}" must remain reserved`,
      ).toBe(true);
    }
  });

  it("detects *.vercel.app technical preview domains to inject X-Robots-Tag: noindex, nofollow", () => {
    expect(isTechnicalPreviewHost("inside-link-cris.vercel.app")).toBe(true);
    expect(isTechnicalPreviewHost("inside-link-git-main.vercel.app:443")).toBe(
      true,
    );
    expect(isTechnicalPreviewHost("links.cristianarando.dev")).toBe(false);
    expect(isTechnicalPreviewHost("localhost:3000")).toBe(false);
  });
});
