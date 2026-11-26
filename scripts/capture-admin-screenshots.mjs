import puppeteer from "puppeteer-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, "../docs/screenshots");

const chromePath =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

/**
 * Captures high-DPI Admin Console screenshots (/admin, /admin/analytics, /admin/settings).
 * Ensure an authenticated local or preview session is active when running against protected routes.
 */
async function run() {
  console.log("Launching headless Chrome from:", chromePath);
  console.log("Target admin base URL:", baseUrl);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();

  const pagesToCapture = [
    {
      url: `${baseUrl}/admin`,
      output: path.join(screenshotsDir, "admin-dashboard.png"),
      title: "Admin Dashboard (Links Management, Health & QR Studio)",
    },
    {
      url: `${baseUrl}/admin/analytics`,
      output: path.join(screenshotsDir, "admin-analytics.png"),
      title: "Admin Analytics 3.0 (Telemetry, Heatmap & Live Stream)",
    },
    {
      url: `${baseUrl}/admin/settings`,
      output: path.join(screenshotsDir, "admin-settings.png"),
      title: "Admin Theme & Customization Studio (/admin/settings)",
    },
  ];

  for (const item of pagesToCapture) {
    console.log(`Navigating to ${item.title}: ${item.url}`);
    try {
      await page.goto(item.url, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await page.screenshot({ path: item.output, fullPage: false });
      console.log(`Saved screenshot: ${item.output}`);
    } catch (err) {
      console.error(`Failed to capture ${item.title}:`, err.message);
    }
  }

  await browser.close();
  console.log("Admin screenshots captured successfully.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
