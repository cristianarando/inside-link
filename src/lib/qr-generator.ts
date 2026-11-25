import { deflateSync, inflateSync } from "node:zlib";
import QRCode from "qrcode";

export interface QrGenerationOptions {
  slug: string;
  canonicalBaseUrl?: string;
  darkColor?: string;
  lightColor?: string;
  sizePx?: number;
  includeCenterBadge?: boolean;
}

export interface QrBundle {
  targetUrl: string;
  svg: string;
  pngDataUrl: string;
}

type RgbaColor = readonly [number, number, number, number];

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const BITMAP_GLYPHS: Record<string, readonly string[]> = {
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  "/": ["00001", "00010", "00100", "00100", "01000", "10000", "00000"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  A: ["00100", "01010", "10001", "10001", "11111", "10001", "10001"],
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

function parseHexColor(hex: string, fallback: RgbaColor): RgbaColor {
  const clean = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    const r = Number.parseInt(clean[0]! + clean[0]!, 16);
    const g = Number.parseInt(clean[1]! + clean[1]!, 16);
    const b = Number.parseInt(clean[2]! + clean[2]!, 16);
    return [r, g, b, 255];
  }
  if (/^[0-9a-f]{6}$/i.test(clean)) {
    const r = Number.parseInt(clean.slice(0, 2), 16);
    const g = Number.parseInt(clean.slice(2, 4), 16);
    const b = Number.parseInt(clean.slice(4, 6), 16);
    return [r, g, b, 255];
  }
  return fallback;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodeRgbaPng(
  pngBuffer: Buffer,
): { width: number; height: number; pixels: Uint8Array } | null {
  if (
    pngBuffer.length < 33 ||
    !pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)
  ) {
    return null;
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset + 12 <= pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > pngBuffer.length) return null;

    const chunkData = pngBuffer.subarray(dataStart, dataEnd);
    if (type === "IHDR" && length >= 13) {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8]!;
      colorType = chunkData[9]!;
    } else if (type === "IDAT") {
      idatChunks.push(chunkData);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (
    width <= 0 ||
    height <= 0 ||
    bitDepth !== 8 ||
    colorType !== 6 ||
    idatChunks.length === 0
  ) {
    return null;
  }

  const bpp = 4;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idatChunks));
  if (raw.length < height * (stride + 1)) {
    return null;
  }

  const pixels = new Uint8Array(width * height * bpp);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart]!;
    const outRow = y * stride;
    const prevRow = (y - 1) * stride;

    for (let x = 0; x < stride; x++) {
      const curr = raw[rowStart + 1 + x]!;
      const left = x >= bpp ? pixels[outRow + x - bpp]! : 0;
      const up = y > 0 ? pixels[prevRow + x]! : 0;
      const upLeft = y > 0 && x >= bpp ? pixels[prevRow + x - bpp]! : 0;

      let recon = curr;
      if (filter === 1) recon = (curr + left) & 0xff;
      else if (filter === 2) recon = (curr + up) & 0xff;
      else if (filter === 3) recon = (curr + ((left + up) >>> 1)) & 0xff;
      else if (filter === 4)
        recon = (curr + paethPredictor(left, up, upLeft)) & 0xff;

      pixels[outRow + x] = recon;
    }
  }

  return { width, height, pixels };
}

function encodeRgbaPng(
  width: number,
  height: number,
  pixels: Uint8Array,
): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const rawRow = y * (stride + 1);
    raw[rawRow] = 0; // Filter type 0 (None)
    const srcStart = y * stride;
    raw.set(pixels.subarray(srcStart, srcStart + stride), rawRow + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = deflateSync(raw);
  return Buffer.concat([
    PNG_SIGNATURE,
    makePngChunk("IHDR", ihdr),
    makePngChunk("IDAT", idat),
    makePngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function isInsideRoundedRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): boolean {
  if (px < x || px >= x + w || py < y || py >= y + h) return false;
  const cx = px < x + r ? x + r : px > x + w - r - 1 ? x + w - r - 1 : px;
  const cy = py < y + r ? y + r : py > y + h - r - 1 ? y + h - r - 1 : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function fillRoundedRect(
  pixels: Uint8Array,
  imgWidth: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: RgbaColor,
): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(imgWidth, Math.ceil(x + w));
  const y1 = Math.ceil(y + h);

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      if (!isInsideRoundedRect(px, py, x, y, w, h, r)) continue;
      const idx = (py * imgWidth + px) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = color[3];
    }
  }
}

function drawBitmapText(
  pixels: Uint8Array,
  imgWidth: number,
  text: string,
  centerX: number,
  centerY: number,
  pixelScale: number,
  gapPx: number,
  color: RgbaColor,
): void {
  const chars = text.split("");
  const glyphW = 5 * pixelScale;
  const glyphH = 7 * pixelScale;
  const totalW = chars.length * glyphW + Math.max(0, chars.length - 1) * gapPx;
  let cursorX = Math.round(centerX - totalW / 2);
  const startY = Math.round(centerY - glyphH / 2);

  for (const ch of chars) {
    const rows = BITMAP_GLYPHS[ch];
    if (rows) {
      for (let gy = 0; gy < rows.length; gy++) {
        const row = rows[gy]!;
        for (let gx = 0; gx < row.length; gx++) {
          if (row[gx] !== "1") continue;
          const bx0 = cursorX + gx * pixelScale;
          const by0 = startY + gy * pixelScale;
          for (let dy = 0; dy < pixelScale; dy++) {
            for (let dx = 0; dx < pixelScale; dx++) {
              const px = bx0 + dx;
              const py = by0 + dy;
              if (px < 0 || px >= imgWidth || py < 0) continue;
              const idx = (py * imgWidth + px) * 4;
              if (idx + 3 >= pixels.length) continue;
              pixels[idx] = color[0];
              pixels[idx + 1] = color[1];
              pixels[idx + 2] = color[2];
              pixels[idx + 3] = color[3];
            }
          }
        }
      }
    }
    cursorX += glyphW + gapPx;
  }
}

function compositeCenterBadgeOnPng(
  pngBuffer: Buffer,
  lightColorHex: string,
): Buffer {
  const decoded = decodeRgbaPng(pngBuffer);
  if (!decoded) return pngBuffer;

  const { width, height, pixels } = decoded;
  const size = Math.min(width, height);
  const lightRgba = parseHexColor(lightColorHex, [255, 255, 255, 255]);
  const emeraldRgba: RgbaColor = [16, 185, 129, 255];
  const obsidianRgba: RgbaColor = [9, 9, 11, 255];
  const whiteRgba: RgbaColor = [250, 250, 250, 255];

  const outerSize = Math.round(size * 0.21);
  const outerOffset = Math.round((size - outerSize) / 2);
  const outerRadius = Math.max(4, Math.round(size * 0.045));
  fillRoundedRect(
    pixels,
    width,
    outerOffset,
    outerOffset,
    outerSize,
    outerSize,
    outerRadius,
    lightRgba,
  );

  const innerSize = Math.round(size * 0.18);
  const innerOffset = Math.round((size - innerSize) / 2);
  const innerRadius = Math.max(3, Math.round(size * 0.036));
  const strokeWidth = Math.max(2, Math.round(size * 0.007));

  fillRoundedRect(
    pixels,
    width,
    innerOffset,
    innerOffset,
    innerSize,
    innerSize,
    innerRadius,
    emeraldRgba,
  );
  fillRoundedRect(
    pixels,
    width,
    innerOffset + strokeWidth,
    innerOffset + strokeWidth,
    innerSize - strokeWidth * 2,
    innerSize - strokeWidth * 2,
    Math.max(2, innerRadius - strokeWidth),
    obsidianRgba,
  );

  const codeScale = Math.max(2, Math.round(size * 0.0055));
  const caScale = Math.max(1, Math.round(size * 0.0042));
  drawBitmapText(
    pixels,
    width,
    "</>",
    width / 2,
    height * 0.474,
    codeScale,
    Math.max(2, Math.round(codeScale * 1.1)),
    emeraldRgba,
  );
  drawBitmapText(
    pixels,
    width,
    "CA",
    width / 2,
    height * 0.542,
    caScale,
    Math.max(2, Math.round(caScale * 1.8)),
    whiteRgba,
  );

  return encodeRgbaPng(width, height, pixels);
}

/**
 * Always builds the canonical short URL (`https://links.cristianarando.dev/[slug]`),
 * ignoring any technical `.vercel.app` host.
 */
export function buildCanonicalQrTargetUrl(
  slug: string,
  canonicalBaseUrl?: string,
): string {
  const base = (
    canonicalBaseUrl ||
    process.env.NEXT_PUBLIC_CANONICAL_URL ||
    "https://links.cristianarando.dev"
  ).replace(/\/+$/, "");
  const cleanSlug = slug.trim().replace(/^\/+/, "").toLowerCase();
  return `${base}/${cleanSlug}`;
}

/**
 * Generates a pure vector SVG QR code with ECC level `H` (30%)
 * and an optional centered `CA` brand badge.
 */
export async function generateQrCodeSvg(
  options: QrGenerationOptions,
): Promise<string> {
  const targetUrl = buildCanonicalQrTargetUrl(
    options.slug,
    options.canonicalBaseUrl,
  );
  const darkColor = options.darkColor || "#09090b";
  const lightColor = options.lightColor || "#ffffff";
  const includeCenterBadge = options.includeCenterBadge ?? true;

  const rawSvg = await QRCode.toString(targetUrl, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    width: options.sizePx ?? 1024,
    color: {
      dark: darkColor,
      light: lightColor,
    },
  });

  if (!includeCenterBadge) {
    return rawSvg;
  }

  // Embed centered vector badge occupying <18% of area (safe under ECC level H = 30%).
  const badgeOverlay = `<g id="cristianarando-brand-badge">
    <rect x="39.5%" y="39.5%" width="21%" height="21%" rx="4.5%" fill="${lightColor}" />
    <rect x="41%" y="41%" width="18%" height="18%" rx="3.6%" fill="#09090b" stroke="#10b981" stroke-width="0.7%" />
    <text x="50%" y="48.5%" text-anchor="middle" dominant-baseline="central" fill="#10b981" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-weight="900" font-size="6.2%">&lt;/&gt;</text>
    <text x="50%" y="54.8%" text-anchor="middle" dominant-baseline="central" fill="#fafafa" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-weight="700" font-size="3.2%" letter-spacing="0.12em">CA</text>
  </g></svg>`;

  return rawSvg.replace(/<\/svg>\s*$/i, badgeOverlay);
}

/**
 * Generates the QR code as a PNG Data URL (`data:image/png;base64,...`) at `1024x1024px` by default,
 * embedding the centered `CA` badge when `includeCenterBadge !== false`.
 */
export async function generateQrCodePngDataUrl(
  options: QrGenerationOptions,
): Promise<string> {
  const targetUrl = buildCanonicalQrTargetUrl(
    options.slug,
    options.canonicalBaseUrl,
  );
  const darkColor = options.darkColor || "#09090b";
  const lightColor = options.lightColor || "#ffffff";
  const includeCenterBadge = options.includeCenterBadge ?? true;

  const rawPngBuffer = await QRCode.toBuffer(targetUrl, {
    type: "png",
    errorCorrectionLevel: "H",
    margin: 2,
    width: options.sizePx ?? 1024,
    color: {
      dark: darkColor,
      light: lightColor,
    },
  });

  const finalPng = includeCenterBadge
    ? compositeCenterBadgeOnPng(rawPngBuffer, lightColor)
    : rawPngBuffer;

  return `data:image/png;base64,${finalPng.toString("base64")}`;
}

export async function generateQrBundle(
  options: QrGenerationOptions,
): Promise<QrBundle> {
  const targetUrl = buildCanonicalQrTargetUrl(
    options.slug,
    options.canonicalBaseUrl,
  );
  const [svg, pngDataUrl] = await Promise.all([
    generateQrCodeSvg(options),
    generateQrCodePngDataUrl(options),
  ]);
  return {
    targetUrl,
    svg,
    pngDataUrl,
  };
}
