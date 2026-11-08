// Small dependency-free static SPA host. No proxying, uploads or directory listing.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(import.meta.dirname, "../dist");
const api = new URL(
  process.env.VITE_API_BASE_URL ||
    "https://fiduciary-api-sandbox.up.railway.app/api/v1",
).origin;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};
export const server = createServer(async (req, res) => {
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ${api}; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const name = decodeURIComponent(new URL(req.url, "http://local").pathname);
    if (name.includes("\0") || name.split("/").some((s) => s.startsWith("."))) {
      res.writeHead(404).end();
      return;
    }
    let path = resolve(root, `.${name}`);
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(404).end();
      return;
    }
    let exists = false;
    try {
      exists = (await stat(path)).isFile();
    } catch {}
    if (!exists) {
      if (
        extname(name) ||
        (name !== "/" && !(req.headers.accept || "").includes("text/html"))
      ) {
        res.writeHead(404).end();
        return;
      }
      path = resolve(root, "index.html");
    }
    const bytes = await readFile(path);
    res.setHeader(
      "Content-Type",
      types[extname(path)] || "application/octet-stream",
    );
    res.setHeader(
      "Cache-Control",
      extname(path) === ".html" ? "no-store" : "public, max-age=300",
    );
    res.writeHead(200);
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(400).end();
  }
});
server.headersTimeout = 15000;
server.requestTimeout = 15000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 50;
server.maxConnections = 100;
if (process.env.STATIC_SERVER_TEST !== "1")
  server.listen(Number(process.env.PORT || 8080), "0.0.0.0");
