// front/src/components/privateRoute.jsx
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { base44 } from "@/apiClient/base44Client";

const PrivateRoute = () => {
  const location = useLocation();
  const token = base44.storage.getAccessToken();

  // Se não tiver token, manda pro /login
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Se tiver token, renderiza as rotas internas (Layout + páginas)
  return <Outlet />;
};

export default PrivateRoute;
