// Снимки веб-админки xtrud в безголовом Chromium на VDS (2026-10-04).
// Сборка admin/dist отдаётся по /admin/, сессия подставляется в
// localStorage, все запросы к api.xtrud.pro подменяются выдуманными данными
// из admin-fixtures.mjs — к живой базе не уходит ничего.
//
// node admin-shot.mjs <out-dir> <route>[,<route>] [--mobile] [--dark] [--click "текст"]...
// route — хеш админки: "/", "/users", "/users/u1", "/reports"…

import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixture } from "./admin-fixtures.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const here = fileURLToPath(new URL(".", import.meta.url));
const dist = join(here, "../../admin/dist");

const [outDir, routesArg, ...rest] = process.argv.slice(2);
const mobile = rest.includes("--mobile");
const dark = rest.includes("--dark");
const clicks = [];
for (let i = 0; i < rest.length; i++) if (rest[i] === "--click") clicks.push(rest[++i]);

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  let path = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/admin/, "") || "/";
  let file = join(dist, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(dist, "index.html");
  } catch {
    file = join(dist, "index.html");
  }
  try {
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
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
const ctx = await browser.newContext({
  viewport: mobile ? { width: 393, height: 852 } : { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: dark ? "dark" : "light",
  isMobile: mobile,
  hasTouch: mobile,
  locale: "ru-RU",
});
// Поддельная сессия: подпись не проверяется — сервер подменён.
const payload = Buffer.from(
  JSON.stringify({ sub: "00000000-0000-4000-8000-000000000001", role: "authenticated" }),
).toString("base64url");
await ctx.addInitScript((token) => {
  localStorage.setItem(
    "xtrud-admin-session",
    JSON.stringify({
      accessToken: token,
      refreshToken: "fake-refresh-token-xxxxxxxx",
      expiresAt: 4102444800,
    }),
  );
}, `x.${payload}.x`);
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};
await ctx.route("https://api.xtrud.pro/**", async (route) => {
  const req = route.request();
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  const url = new URL(req.url());
  let args = {};
  try {
    args = req.postDataJSON() ?? {};
  } catch {}
  const body = fixture(url.pathname, args);
  if (url.pathname === "/v2/rpc/admin_list_users" && args.p_search) {
    // поиск ⌘K: отдаём совпадения по имени
  }
  if (body === undefined) {
    console.log("NO FIXTURE", url.pathname);
    return route.fulfill({ status: 404, headers: cors, body: "{}" });
  }
  return route.fulfill({
    status: 200,
    headers: { ...cors, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 200)));
for (const route of routesArg.split(",")) {
  await page.goto(`http://127.0.0.1:${port}/admin/#${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  for (const text of clicks) {
    if (text.startsWith("key:")) {
      await page.keyboard.press(text.slice(4));
      await page.waitForTimeout(400);
      continue;
    }
    if (text.startsWith("type:")) {
      await page.keyboard.type(text.slice(5));
      await page.waitForTimeout(800);
      continue;
    }
    if (text.startsWith("aria:")) {
      await page
        .getByLabel(text.slice(5), { exact: true })
        .first()
        .click({ timeout: 4000 })
        .catch((e) => console.log("click fail", text, e.message.split("\n")[0]));
      await page.waitForTimeout(600);
      continue;
    }
    await page
      .getByText(text, { exact: true })
      .first()
      .click({ timeout: 4000 })
      .catch((e) => console.log("click fail", text, e.message.split("\n")[0]));
    await page.waitForTimeout(600);
  }
  const name = `${route.replace(/[^a-z0-9]+/gi, "_") || "root"}${mobile ? "-m" : ""}${dark ? "-dark" : ""}.png`;
  await page.screenshot({ path: join(outDir, name), fullPage: !mobile });
  console.log(join(outDir, name));
}
await browser.close();
server.close();
