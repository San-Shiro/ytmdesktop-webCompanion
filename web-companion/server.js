/**
 * YTMD Web Companion — Proxy Server
 *
 * Serves the static dashboard files and proxies all /api and /metadata
 * requests to the actual YTMD companion server, bypassing CORS.
 * Also proxies the socket.io WebSocket connection.
 *
 * Usage:  node server.js
 *         Then open http://localhost:5099 in your browser.
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// ── Load config ──────────────────────────────────────────────
const configPath = path.join(__dirname, "config.json");
let config = { host: "localhost", port: 9863 };
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (e) {
  console.warn("Could not load config.json, using defaults:", e.message);
}

const YTMD_HOST = config.host || "localhost";
const YTMD_PORT = config.port || 9863;
const PROXY_PORT = 5099;

// ── MIME types ───────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

// ── Static file server ──────────────────────────────────────
function serveStatic(req, res) {
  let filePath = req.url.split("?")[0];
  if (filePath === "/") filePath = "/index.html";
  const fullPath = path.join(__dirname, filePath);

  // Security: prevent directory traversal
  if (!fullPath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(fullPath);
  const contentType = MIME[ext] || "application/octet-stream";

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const headers = { "Content-Type": contentType };
    // Prevent caching of CSS/JS so changes take effect immediately
    if (ext === ".css" || ext === ".js" || ext === ".html") {
      headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

// ── HTTP Proxy ──────────────────────────────────────────────
function proxyRequest(req, res) {
  const options = {
    hostname: YTMD_HOST,
    port: YTMD_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${YTMD_HOST}:${YTMD_PORT}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Add CORS headers so the browser is happy
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    });
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (e) => {
    console.error("Proxy error:", e.message);
    res.writeHead(502);
    res.end(JSON.stringify({ error: "Bad Gateway", message: e.message }));
  });

  req.pipe(proxyReq, { end: true });
}

// ── WebSocket Proxy (for socket.io) ─────────────────────────
function proxyUpgrade(req, clientSocket, head) {
  const options = {
    hostname: YTMD_HOST,
    port: YTMD_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${YTMD_HOST}:${YTMD_PORT}` },
  };

  const proxyReq = http.request(options);

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    // Send the 101 Switching Protocols back to the client
    let rawHeaders = `HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`;
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
      rawHeaders += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`;
    }
    rawHeaders += "\r\n";

    clientSocket.write(rawHeaders);
    if (proxyHead && proxyHead.length) clientSocket.write(proxyHead);

    // Bidirectional pipe
    proxySocket.pipe(clientSocket);
    clientSocket.pipe(proxySocket);

    proxySocket.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => proxySocket.destroy());
  });

  proxyReq.on("error", (e) => {
    console.error("WebSocket proxy error:", e.message);
    clientSocket.destroy();
  });

  proxyReq.end();
}

// ── Create server ───────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    });
    res.end();
    return;
  }

  // Route: proxy API and metadata requests, serve everything else as static
  if (req.url.startsWith("/img-proxy?")) {
    // Thumbnail proxy to avoid CORB
    try {
      const imgUrl = new URL(req.url, `http://localhost:${PROXY_PORT}`).searchParams.get("url");
      if (!imgUrl) { res.writeHead(400); res.end("Missing url param"); return; }
      const proto = imgUrl.startsWith("https") ? https : http;
      proto.get(imgUrl, (imgRes) => {
        res.writeHead(imgRes.statusCode, {
          "Content-Type": imgRes.headers["content-type"] || "image/jpeg",
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        });
        imgRes.pipe(res, { end: true });
      }).on("error", () => { res.writeHead(502); res.end(); });
    } catch (e) { res.writeHead(400); res.end("Bad URL"); }
  } else if (req.url.startsWith("/api/") || req.url.startsWith("/metadata") || req.url.startsWith("/socket.io/")) {
    proxyRequest(req, res);
  } else {
    serveStatic(req, res);
  }
});

// Handle WebSocket upgrades
server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/socket.io/")) {
    proxyUpgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(PROXY_PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════════════╗`);
  console.log(`  ║  YTMD Web Companion Proxy Server                ║`);
  console.log(`  ╠══════════════════════════════════════════════════╣`);
  console.log(`  ║  Dashboard:  http://localhost:${PROXY_PORT}              ║`);
  console.log(`  ║  Proxying:   http://${YTMD_HOST}:${YTMD_PORT}              ║`);
  console.log(`  ╚══════════════════════════════════════════════════╝\n`);
});
