const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const prefix = '/chinese-chess-game/';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const handler = (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.writeHead(302, { Location: prefix }); res.end(); return; }
    if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end(); return; }
    const file = path.resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache, no-transform' });
    fs.createReadStream(file).pipe(res);
};
const https = process.env.HTTPS_CERT && process.env.HTTPS_KEY;
const server = https ? require('node:https').createServer({ cert: fs.readFileSync(process.env.HTTPS_CERT), key: fs.readFileSync(process.env.HTTPS_KEY) }, handler) : http.createServer(handler);
const port = Number(process.env.PORT || 8080);
server.listen(port, '127.0.0.1', () => console.log(`${https ? 'https' : 'http'}://127.0.0.1:${port}${prefix}`));
