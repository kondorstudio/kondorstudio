// front/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./app.jsx";
import { SubscriptionProvider } from "./components/SubscriptionContext.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles/global.css";

const CHUNK_RELOAD_KEY = "kondor_chunk_reload_at";
const CHUNK_RELOAD_TTL_MS = 60 * 1000;

function isChunkLoadFailure(reason) {
  const message = String(reason?.message || reason || "").toLowerCase();
  if (!message) return false;
  return (
    message.includes("loading chunk") ||
    message.includes("chunkloaderror") ||
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed")
  );
}

function tryRecoverFromChunkFailure(reason) {
  if (typeof window === "undefined") return false;
  if (!isChunkLoadFailure(reason)) return false;

  const now = Date.now();
  const lastReloadAt = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);

  if (lastReloadAt && now - lastReloadAt < CHUNK_RELOAD_TTL_MS) {
    return false;
  }

  window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  window.location.reload();
  return true;
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    tryRecoverFromChunkFailure(event?.error || event?.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (tryRecoverFromChunkFailure(event?.reason)) {
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
    mutations: {
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SubscriptionProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </SubscriptionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
