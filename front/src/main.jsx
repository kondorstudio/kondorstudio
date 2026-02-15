// front/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./app.jsx";
import { SubscriptionProvider } from "./components/SubscriptionContext.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles/global.css";

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
