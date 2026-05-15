import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { RequireAuth } from "./layouts/RequireAuth";
import { RequireRoles } from "./layouts/RequireRoles";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OrdersPage } from "./pages/OrdersPage";
import { ImportPage } from "./pages/ImportPage";
import { ReportsPage } from "./pages/ReportsPage";
import { MapeoPage } from "./pages/MapeoPage";
import { CpaPage } from "./pages/CpaPage";
import { CompaniesPage } from "./pages/CompaniesPage";
import { LogisticsPage } from "./pages/LogisticsPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { AdvertisingAccountsPage } from "./pages/AdvertisingAccountsPage";
import { OperationalExpensesPage } from "./pages/OperationalExpensesPage";

function RootRedirect() {
  const token = localStorage.getItem("fersua_token");
  return <Navigate to={token ? "/app/pedidos" : "/login"} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="pedidos" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="pedidos" element={<OrdersPage />} />
        <Route
          path="logistica"
          element={
            <RequireRoles roles={["ADMIN", "OPERADOR"]}>
              <LogisticsPage />
            </RequireRoles>
          }
        />
        <Route path="reportes" element={<ReportsPage />} />
        <Route
          path="importar"
          element={
            <RequireRoles roles={["ADMIN", "OPERADOR"]}>
              <ImportPage />
            </RequireRoles>
          }
        />
        <Route
          path="mapeo"
          element={
            <RequireRoles roles={["ADMIN", "OPERADOR"]}>
              <MapeoPage />
            </RequireRoles>
          }
        />
        <Route
          path="cpa"
          element={
            <RequireRoles roles={["ADMIN", "OPERADOR"]}>
              <CpaPage />
            </RequireRoles>
          }
        />
        <Route path="campanas-meta" element={<CampaignsPage />} />
        <Route path="cuentas-publicitarias" element={<AdvertisingAccountsPage />} />
        <Route path="gasto-operacional" element={<OperationalExpensesPage />} />
        <Route
          path="empresas"
          element={
            <RequireRoles roles={["ADMIN"]}>
              <CompaniesPage />
            </RequireRoles>
          }
        />
      </Route>
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
