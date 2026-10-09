import React from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { getToken, getUser } from "../utils/token";

export default function RequireAuth({ children, roles, owner = false }) {
  const location = useLocation();
  const { userId } = useParams();
  const user = getUser();
  if (!getToken() || !user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (roles && !roles.includes(user.roleId)) return <Navigate to="/" replace />;
  if (owner && userId && String(userId) !== String(user.id)) {
    return <Navigate to={`/order/${user.id}`} replace />;
  }
  return children;
}
