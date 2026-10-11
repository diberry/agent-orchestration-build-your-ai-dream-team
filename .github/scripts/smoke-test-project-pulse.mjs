#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFile } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";

function valueAfter(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const root = path.resolve(valueAfter("--root", process.cwd()));
const port = Number(valueAfter("--port", "5500"));
const logPath = valueAfter("--log", "");

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error("--port must be an integer between 1024 and 65535.");
  process.exit(2);
}

const messages = [];
const record = (message) => {
  messages.push(message);
  console.log(message);
};

const assets = new Map([
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
  ["/project-data.json", { file: "project-data.json", type: "application/json; charset=utf-8" }]
]);

const server = createServer((request, response) => {
  const asset = assets.get(new URL(request.url, "http://127.0.0.1").pathname);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }

  readFile(path.join(root, "app", asset.file), (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end();
      return;
    }
    response.writeHead(200, { "Content-Type": asset.type });
    response.end(content);
  });
});

const listen = new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});

async function run() {
  try {
    await listen;
    for (const asset of ["index.html", "styles.css", "project-data.json"]) {
      const response = await fetch(`http://127.0.0.1:${port}/${asset}`);
      if (!response.ok) {
        throw new Error(`${asset} returned HTTP ${response.status}.`);
      }
      record(`${asset}: HTTP ${response.status}`);
    }
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    record("Preview server stopped.");
    if (logPath) {
      const resolvedLogPath = path.resolve(logPath);
      mkdirSync(path.dirname(resolvedLogPath), { recursive: true });
      appendFileSync(resolvedLogPath, `${messages.filter(Boolean).join("\n")}\n`, "utf8");
    }
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
