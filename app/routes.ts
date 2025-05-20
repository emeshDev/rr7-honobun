import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  ...prefix("dashboard", [
    layout("routes/dashboard/layout.tsx", { id: "DashboardLayout" }, [
      index("routes/dashboard/index.tsx"),
      route("todos", "routes/dashboard/todos.tsx"),
    ]),
  ]),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("verify-email", "routes/verify-email.tsx"),
  route("verification-pending", "routes/verification-pending.tsx"),
] satisfies RouteConfig;
