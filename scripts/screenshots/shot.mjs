// Снимки экранов веб-сборки xtrud в безголовом Chromium на VDS (навык
// .claude/skills/xtrud-screenshots). Светлая и тёмная тема, 393×852 @2x.
// node shot.mjs <web-dist> <out> <route>[,<route>] [--click "текст"]... [--wheel px]

import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";

// playwright-core ставится вне проекта: PLAYWRIGHT_CORE=<путь к пакету>.
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");

const [dist, outDir, routesArg, ...rest] = process.argv.slice(2);
const clicks = [];
let wheel = 0;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--click") clicks.push(rest[++i]);
  else if (rest[i] === "--wheel") wheel = Number(rest[++i]);
}
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = join(dist, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(dist, "app.html");
  } catch {
    file = join(dist, "app.html");
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  }
}).listen(0);
const port = server.address().port;
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
});
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
  });
  // API отвечает только своему домену (CORS): запросы гостя проксируются
  // отсюда. Телеметрия ошибок и запись не отправляются никогда.
  await ctx.route("https://api.xtrud.pro/**", async (route) => {
    const req = route.request();
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (
      /client_errors|events|track/.test(req.url()) ||
      !["GET", "HEAD", "POST"].includes(req.method())
    )
      return route.fulfill({ status: 204, headers: cors });
    const isRpc = req.method() === "POST" && req.url().includes("/rpc/");
    if (req.method() === "POST" && !isRpc) return route.fulfill({ status: 204, headers: cors });
    const res = await fetch(req.url(), {
      method: req.method(),
      headers: { ...req.headers(), origin: "https://xtrud.pro" },
      body: req.postData() ?? undefined,
    });
    const headers = Object.fromEntries(res.headers.entries());
    delete headers["content-encoding"];
    delete headers["content-length"];
    return route.fulfill({
      status: res.status,
      headers: { ...headers, ...cors },
      body: Buffer.from(await res.arrayBuffer()),
    });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300));
  });
  for (const route of routesArg.split(",")) {
    await page
      .goto(`http://127.0.0.1:${port}${route}`, { waitUntil: "networkidle" })
      .catch(() => {});
    await page.waitForTimeout(2500);
    // Веб-обёртка NativeTabs оставляет контейнерам вкладки нулевую высоту
    // (на iOS это нативный UITabBarController) — растягиваем их на экран.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("#root div")) {
        const r = el.getBoundingClientRect();
        if (r.height === 0 && el.scrollHeight > 0 && el.children.length) {
          el.style.flex = "1 1 auto";
          el.style.minHeight = "100vh";
        }
      }
    });
    await page.waitForTimeout(500);
    for (const text of clicks) {
      await page
        .getByText(text, { exact: true })
        .filter({ visible: true })
        .first()
        .click({ timeout: 5000 })
        .catch((e) => console.log("click fail", text, e.message.split("\n")[0]));
      await page.waitForTimeout(1500);
    }
    if (wheel) {
      await page.mouse.move(196, 500);
      await page.mouse.wheel(0, wheel);
      await page.waitForTimeout(800);
    }
    const name = `${route.replace(/[^a-z0-9]+/gi, "_") || "root"}-${scheme}.png`;
    await page.screenshot({ path: join(outDir, name) });
    console.log(join(outDir, name));
  }
  await ctx.close();
}
await browser.close();
server.close();
