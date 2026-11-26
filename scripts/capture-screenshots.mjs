import puppeteer from "puppeteer-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, "../docs/screenshots");

const chromePath =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = (
  process.env.BASE_URL || "https://links.cristianarando.dev"
).replace(/\/+$/, "");

/**
 * Captures high-DPI public route screenshots from the standalone InsideLink v2 instance.
 * Note: `/` is the canonical public links directory (`/links` redirects 308 -> `/`).
 */
async function run() {
  console.log("Launching headless Chrome from:", chromePath);
  console.log("Target base URL:", baseUrl);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();

  const pagesToCapture = [
    {
      url: `${baseUrl}/`,
      output: path.join(screenshotsDir, "public-directory.png"),
      title: "Public Links Directory (/)",
    },
    {
      url: `${baseUrl}/proyecto-guia-turistica`,
      output: path.join(screenshotsDir, "hub-preview.png"),
      title: "Project Micro-Landing (Rich HUB)",
    },
    {
      url: `${baseUrl}/login`,
      output: path.join(screenshotsDir, "admin-login.png"),
      title: "Admin Login Console",
    },
    {
      url: `${baseUrl}/presupuesto-confidencial`,
      output: path.join(screenshotsDir, "pin-protection.png"),
      title: "PIN Protection Interstitial",
    },
    {
      url: `${baseUrl}/enlace-expirado`,
      output: path.join(screenshotsDir, "expired-link.png"),
      title: "Expired Link Notice (HTTP 410)",
    },
  ];

  for (const item of pagesToCapture) {
    console.log(`Navigating to ${item.title}: ${item.url}`);
    try {
      await page.goto(item.url, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await page.screenshot({ path: item.output, fullPage: false });
      console.log(`Saved screenshot: ${item.output}`);
    } catch (err) {
      console.error(`Failed to capture ${item.title}:`, err.message);
    }
  }

  await browser.close();
  console.log("Public screenshots captured successfully.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
