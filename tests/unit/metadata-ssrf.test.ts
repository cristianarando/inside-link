import { describe, expect, it } from "vitest";
import {
  assertSafeMetadataUrl,
  isPublicIpAddress,
  MetadataServiceError,
  previewUrlMetadata,
  type LookupAddressFn,
} from "@/server/services/metadata.service";

const publicLookup: LookupAddressFn = async () => [
  { address: "93.184.216.34", family: 4 },
];

describe("Metadata Service — SSRF Protection & IP Filtering", () => {
  it("blocks private, loopback, link-local, ULA, and reserved IPv4/IPv6 addresses", () => {
    const blockedIps = [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "fe80::1%eth0",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
    ];

    for (const ip of blockedIps) {
      expect(isPublicIpAddress(ip), `Expected ${ip} to be blocked`).toBe(false);
    }

    const publicIps = [
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34",
      "2606:4700:4700::1111",
    ];
    for (const ip of publicIps) {
      expect(isPublicIpAddress(ip), `Expected ${ip} to be allowed`).toBe(true);
    }
  });

  it("blocks localhost, private IPs, cloud metadata, IPv6 local targets, and file:// URLs", async () => {
    const blockedUrls = [
      "http://localhost/admin",
      "http://localhost:3000/api",
      "http://127.0.0.1/secret",
      "http://10.0.0.5/internal",
      "http://172.16.0.1/status",
      "http://192.168.1.1/router",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[fc00::1]/",
      "http://[fe80::1]/",
      "file:///etc/passwd",
    ];

    for (const url of blockedUrls) {
      await expect(
        assertSafeMetadataUrl(url, publicLookup),
      ).rejects.toBeInstanceOf(MetadataServiceError);
    }
  });

  it("blocks public-looking domains that resolve via DNS to private IPs", async () => {
    const rebindLookup: LookupAddressFn = async () => [
      { address: "10.0.0.5", family: 4 },
    ];

    await expect(
      assertSafeMetadataUrl(
        "https://rebind.example.com/resource",
        rebindLookup,
      ),
    ).rejects.toMatchObject({
      code: "SSRF_BLOCKED",
    });
  });

  it("allows globally routable public IPs and domains", async () => {
    const ipUrl = await assertSafeMetadataUrl(
      "https://1.1.1.1/dns-query",
      publicLookup,
    );
    expect(ipUrl.hostname).toBe("1.1.1.1");

    const domainUrl = await assertSafeMetadataUrl(
      "https://github.com/cristianarando",
      publicLookup,
    );
    expect(domainUrl.hostname).toBe("github.com");
  });

  it("extracts metadata safely and blocks redirects to internal targets", async () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta property="og:title" content="InsideLink &amp; Core" />
          <meta name="description" content="Edge shortener &amp; hub." />
        </head>
      </html>
    `;

    const result = await previewUrlMetadata(
      "https://github.com/cristianarando/inside-link",
      {
        lookup: publicLookup,
        fetchFn: async () =>
          new Response(html, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      },
    );

    expect(result).toEqual({
      url: "https://github.com/cristianarando/inside-link",
      title: "InsideLink & Core",
      description: "Edge shortener & hub.",
      icon: "github",
    });

    await expect(
      previewUrlMetadata("https://example.com/redirect", {
        lookup: publicLookup,
        fetchFn: async () =>
          new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data/" },
          }),
      }),
    ).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });
});
