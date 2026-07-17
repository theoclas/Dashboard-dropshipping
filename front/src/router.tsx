import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { AppIndexRedirect, RootRedirect } from "./layouts/AppIndexRedirect";
import { RequireAuth } from "./layouts/RequireAuth";
import { RequirePermission } from "./layouts/RequirePermission";
import { RequireRoles } from "./layouts/RequireRoles";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { OrdersPage } from "./pages/OrdersPage";
import { ProductosPedidosPage } from "./pages/ProductosPedidosPage";
import { ImportPage } from "./pages/ImportPage";
import { ReportsPage } from "./pages/ReportsPage";
import { MapeoPage } from "./pages/MapeoPage";
import { CpaExperimentalPage } from "./pages/CpaExperimentalPage";
import { CpaResumenPage } from "./pages/CpaResumenPage";
import { AdminLayout } from "./layouts/AdminLayout";
import { AdminCompaniesPage } from "./pages/admin/AdminCompaniesPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { AdminConfigPage } from "./pages/admin/AdminConfigPage";
import { AdminMetaAdsAppsPage } from "./pages/admin/AdminMetaAdsAppsPage";
import { AdminMetaAdsUsersPage } from "./pages/admin/AdminMetaAdsUsersPage";
import { CompaniesPage } from "./pages/CompaniesPage";
import { LogisticsPage } from "./pages/LogisticsPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { AdvertisingAccountsPage } from "./pages/AdvertisingAccountsPage";
import { OperationalExpensesPage } from "./pages/OperationalExpensesPage";
import { CarteraSalidasPage } from "./pages/CarteraSalidasPage";
import { CarteraEntradasPage } from "./pages/CarteraEntradasPage";
import { SettingsPage } from "./pages/SettingsPage";

function Perm({ perm, children }: { perm: Parameters<typeof RequirePermission>[0]["perm"]; children: React.ReactNode }) {
  return <RequirePermission perm={perm}>{children}</RequirePermission>;
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
        <Route index element={<AppIndexRedirect />} />
        <Route
          path="dashboard"
          element={
            <Perm perm="moduleDashboard">
              <DashboardPage />
            </Perm>
          }
        />
        <Route
          path="pedidos"
          element={
            <Perm perm="modulePedidos">
              <OrdersPage />
            </Perm>
          }
        />
        <Route
          path="productos"
          element={
            <Perm perm="modulePedidos">
              <ProductosPedidosPage />
            </Perm>
          }
        />
        <Route
          path="logistica"
          element={
            <Perm perm="moduleImportaciones">
              <LogisticsPage />
            </Perm>
          }
        />
        <Route
          path="reportes"
          element={
            <Perm perm="moduleReportes">
              <ReportsPage />
            </Perm>
          }
        />
        <Route
          path="importar"
          element={
            <Perm perm="moduleImportaciones">
              <ImportPage />
            </Perm>
          }
        />
        <Route
          path="mapeo"
          element={
            <Perm perm="moduleMapeo">
              <MapeoPage />
            </Perm>
          }
        />
        {/* CPA clásico (import Excel manual): oculto del menú; usar CPA experimental. Ruta legacy redirige. */}
        <Route path="cpa" element={<Navigate to="/app/cpa-experimental" replace />} />
        <Route
          path="cpa-experimental"
          element={
            <Perm perm="moduleCpa">
              <CpaExperimentalPage />
            </Perm>
          }
        />
        <Route
          path="cpa-resumen"
          element={
            <Perm perm="moduleCpa">
              <CpaResumenPage />
            </Perm>
          }
        />
        <Route
          path="campanas-meta"
          element={
            <Perm perm="moduleCampanasMeta">
              <CampaignsPage />
            </Perm>
          }
        />
        <Route
          path="cuentas-publicitarias"
          element={
            <Perm perm="moduleCuentasPublicitarias">
              <AdvertisingAccountsPage />
            </Perm>
          }
        />
        <Route
          path="entradas-cartera"
          element={
            <Perm perm="moduleSalidasCartera">
              <CarteraEntradasPage />
            </Perm>
          }
        />
        <Route
          path="salidas-cartera"
          element={
            <Perm perm="moduleSalidasCartera">
              <CarteraSalidasPage />
            </Perm>
          }
        />
        <Route
          path="gasto-operacional"
          element={
            <Perm perm="moduleGastoOperacional">
              <OperationalExpensesPage />
            </Perm>
          }
        />
        <Route
          path="configuracion"
          element={
            <Perm perm="moduleConfiguracion">
              <SettingsPage />
            </Perm>
          }
        />
        <Route
          path="empresas"
          element={
            <RequireRoles roles={["ADMIN"]}>
              <CompaniesPage />
            </RequireRoles>
          }
        />
        <Route
          path="admin"
          element={
            <RequireRoles roles={["ADMIN"]}>
              <AdminLayout />
            </RequireRoles>
          }
        >
          <Route index element={<Navigate to="empresas" replace />} />
          <Route path="empresas" element={<AdminCompaniesPage />} />
          <Route path="usuarios" element={<AdminUsersPage />} />
          <Route path="meta-ads-apps" element={<AdminMetaAdsAppsPage />} />
          <Route path="meta-ads-usuarios" element={<AdminMetaAdsUsersPage />} />
          <Route path="configuracion" element={<AdminConfigPage />} />
        </Route>
      </Route>
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
