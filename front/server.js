import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "dist");

const rawBase = (
  process.env.VITE_BASE_PATH ||
  process.env.VITE_PUBLIC_APP_URL ||
  "/"
).trim();
let basePath = rawBase || "/";
if (rawBase) {
  try {
    basePath = new URL(rawBase).pathname || "/";
  } catch (err) {
    basePath = rawBase;
  }
}
if (!basePath.startsWith("/")) basePath = `/${basePath}`;
if (!basePath.endsWith("/")) basePath += "/";
if (basePath === "//") basePath = "/";

const mountPath = basePath === "/" ? "" : basePath.slice(0, -1);

const app = express();
app.disable("x-powered-by");

const setNoStore = (res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("CDN-Cache-Control", "no-store");
};

const assetPath = `${mountPath}/assets`;
app.use(
  assetPath,
  express.static(path.join(distDir, "assets"), {
    immutable: true,
    maxAge: "1y",
  })
);

app.get(`${assetPath}/*`, (req, res) => {
  setNoStore(res);
  res.status(404).send("Not found");
});

app.use(
  mountPath || "/",
  express.static(distDir, {
    etag: true,
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        setNoStore(res);
      }
    },
  })
);

const fallbackRoute = mountPath ? `${mountPath}/*` : "*";
app.get(fallbackRoute, (req, res) => {
  if (req.path.includes(".") && req.path !== "/") {
    setNoStore(res);
    res.status(404).send("Not found");
    return;
  }
  setNoStore(res);
  res.sendFile(path.join(distDir, "index.html"));
});

const port = Number.parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  console.log(`Front server listening on ${port} (base: ${basePath})`);
});
