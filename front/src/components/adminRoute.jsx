// front/src/components/adminRoute.jsx
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { base44 } from "@/apiClient/base44Client";
import { ADMIN_ROLES } from "@/utils/adminPermissions";

const AdminRoute = () => {
  const location = useLocation();
  const token = base44.storage.getAccessToken();
  const auth = base44.storage.loadAuthFromStorage?.();
  const role = auth?.user?.role;

  if (!token) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (!ADMIN_ROLES.includes(role)) {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{ from: location, reason: "forbidden" }}
      />
    );
  }

  return <Outlet />;
};

export default AdminRoute;
