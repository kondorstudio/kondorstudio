import React from "react";
import ReactDOM from "react-dom/client";
import Layout from "./Layout";

// =========================================
// KONDOR STUDIO — FRONT ENTRYPOINT (main.jsx)
// =========================================
//
// Este arquivo inicializa a aplicação React.
// O componente <Layout /> é a raiz da interface.
// Todo o roteamento das Pages e lógica do front
// acontecerá dentro dele.
//
// O Vite injeta este arquivo no index.html:
// <script type="module" src="/src/main.jsx"></script>
// =========================================

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Layout />
  </React.StrictMode>
);
