import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "dist");

const rawBase = (process.env.VITE_BASE_PATH || "/").trim();
let basePath = rawBase || "/";
if (!basePath.startsWith("/")) basePath = `/${basePath}`;
if (!basePath.endsWith("/")) basePath += "/";
if (basePath === "//") basePath = "/";

const mountPath = basePath === "/" ? "" : basePath.slice(0, -1);

const app = express();
app.disable("x-powered-by");

const assetPath = `${mountPath}/assets`;
app.use(
  assetPath,
  express.static(path.join(distDir, "assets"), {
    immutable: true,
    maxAge: "1y",
  })
);

app.use(
  mountPath || "/",
  express.static(distDir, {
    etag: true,
    maxAge: 0,
  })
);

const fallbackRoute = mountPath ? `${mountPath}/*` : "*";
app.get(fallbackRoute, (req, res) => {
  if (req.path.includes(".") && req.path !== "/") {
    res.status(404).set("Cache-Control", "no-store").send("Not found");
    return;
  }
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(distDir, "index.html"));
});

const port = Number.parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  console.log(`Front server listening on ${port} (base: ${basePath})`);
});
