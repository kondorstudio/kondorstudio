// front/src/utils/index.js

// Converte rótulos/urls de menu em caminhos de rota estáveis.
// Ex: "Dashboard" -> "/", "Posts" -> "/posts", "Métricas" -> "/metricas"
export function createPageUrl(labelOrPath) {
  if (!labelOrPath) return "/";

  const raw = String(labelOrPath).trim().toLowerCase();

  if (raw === "dashboard" || raw === "home") {
    return "/";
  }

  const slug = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-") // troca espaços e símbolos por "-"
    .replace(/(^-|-$)+/g, ""); // remove "-" no começo/fim

  return `/${slug || ""}`;
}
