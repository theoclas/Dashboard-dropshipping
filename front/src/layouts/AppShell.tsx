import { useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button, Layout, Menu, Select, Typography, message, theme } from "antd";
import type { MenuProps } from "antd";
import {
  CloudUploadOutlined,
  DashboardOutlined,
  DollarCircleOutlined,
  FileTextOutlined,
  FundProjectionScreenOutlined,
  LineChartOutlined,
  LogoutOutlined,
  ShoppingOutlined,
  SwapOutlined,
  TeamOutlined,
  TruckOutlined,
  BankOutlined,
} from "@ant-design/icons";
import { api } from "../api";
import { BRANDING_LOGO_SIDER_SRC } from "../branding";
import { useAuth } from "../contexts/AuthContext";
import { usePermission } from "../hooks/usePermission";

const { Header, Sider, Content } = Layout;

const pathToKey = (pathname: string): string => {
  if (pathname.startsWith("/app/campanas-meta")) return "/app/campanas-meta";
  if (pathname.startsWith("/app/cuentas-publicitarias")) return "/app/cuentas-publicitarias";
  if (pathname.startsWith("/app/gasto-operacional")) return "/app/gasto-operacional";
  if (pathname.startsWith("/app/pedidos")) return "/app/pedidos";
  if (pathname.startsWith("/app/logistica")) return "/app/logistica";
  if (pathname.startsWith("/app/importar")) return "/app/importar";
  if (pathname.startsWith("/app/dashboard")) return "/app/dashboard";
  if (pathname.startsWith("/app/reportes")) return "/app/reportes";
  if (pathname.startsWith("/app/mapeo")) return "/app/mapeo";
  if (pathname.startsWith("/app/cpa")) return "/app/cpa";
  if (pathname.startsWith("/app/empresas")) return "/app/empresas";
  return "/app/pedidos";
};

export function AppShell() {
  const { token } = theme.useToken();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, refresh } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [companyId, setCompanyId] = useState(() => localStorage.getItem("fersua_company_id") ?? "");

  const selectedKey = pathToKey(location.pathname);

  const canAdmin = user?.role === "ADMIN";
  const canImport = user?.role === "ADMIN" || user?.role === "OPERADOR";

  const canCampanas = usePermission("moduleCampanasMeta");
  const canCuentas = usePermission("moduleCuentasPublicitarias");
  const canGastoOp = usePermission("moduleGastoOperacional");

  const menuItems: MenuProps["items"] = useMemo(
    () => [
      { key: "/app/dashboard", icon: <DashboardOutlined />, label: <Link to="/app/dashboard">Dashboard</Link> },
      { key: "/app/pedidos", icon: <ShoppingOutlined />, label: <Link to="/app/pedidos">Pedidos</Link> },
      { key: "/app/reportes", icon: <LineChartOutlined />, label: <Link to="/app/reportes">Reportes</Link> },
      ...(canImport
        ? [
            {
              key: "/app/logistica",
              icon: <TruckOutlined />,
              label: <Link to="/app/logistica">Logística</Link>,
            },
            {
              key: "/app/importar",
              icon: <CloudUploadOutlined />,
              label: <Link to="/app/importar">Importar</Link>,
            },
            { key: "/app/mapeo", icon: <SwapOutlined />, label: <Link to="/app/mapeo">Mapeo estados</Link> },
            { key: "/app/cpa", icon: <FileTextOutlined />, label: <Link to="/app/cpa">CPA</Link> },
            ...(canCampanas
              ? [
                  {
                    key: "/app/campanas-meta",
                    icon: <FundProjectionScreenOutlined />,
                    label: <Link to="/app/campanas-meta">Campañas Meta</Link>,
                  },
                ]
              : []),
            ...(canCuentas
              ? [
                  {
                    key: "/app/cuentas-publicitarias",
                    icon: <BankOutlined />,
                    label: <Link to="/app/cuentas-publicitarias">Cuentas publicitarias</Link>,
                  },
                ]
              : []),
            ...(canGastoOp
              ? [
                  {
                    key: "/app/gasto-operacional",
                    icon: <DollarCircleOutlined />,
                    label: <Link to="/app/gasto-operacional">Gasto operacional</Link>,
                  },
                ]
              : []),
          ]
        : []),
      ...(canAdmin
        ? [{ key: "/app/empresas", icon: <TeamOutlined />, label: <Link to="/app/empresas">Empresas</Link> }]
        : []),
    ],
    [canAdmin, canImport, canCampanas, canCuentas, canGastoOp],
  );

  return (
    <Layout style={{ minHeight: "100%" }}>
      <Sider
        className="fs-app-sider"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={240}
        breakpoint="lg"
        style={{ borderRight: `1px solid ${token.colorBorder}` }}
      >
        <div
          style={{
            padding: collapsed ? "12px 8px" : "14px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderBottom: `1px solid ${token.colorBorder}`,
          }}
        >
          <Link to="/app/dashboard" style={{ display: "flex", justifyContent: "center", width: "100%", lineHeight: 0 }}>
            <img
              src={BRANDING_LOGO_SIDER_SRC}
              alt="Fersua Analytics (FSA)"
              decoding="async"
              draggable={false}
              style={{
                width: "100%",
                maxWidth: collapsed ? 44 : 200,
                height: "auto",
                maxHeight: collapsed ? 40 : 48,
                objectFit: "contain",
                objectPosition: "center",
                display: "block",
              }}
            />
          </Link>
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={menuItems} style={{ borderInlineEnd: 0 }} />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${token.colorBorder}`,
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Fersua Analytics (FSA)
          </Typography.Text>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Typography.Text>
              Hola, <Typography.Text strong>{user?.fullName ?? "Usuario"}</Typography.Text>
              {user?.role ? (
                <Typography.Text type="secondary">{` (${user.role})`}</Typography.Text>
              ) : null}
            </Typography.Text>
            <Select
              size="middle"
              style={{ minWidth: 200 }}
              value={companyId || undefined}
              options={user?.companies.map((c) => ({ value: c.companyId, label: `${c.name} (${c.role})` })) ?? []}
              onChange={async (nextCompanyId: string) => {
                try {
                  const { data } = await api.post<{ accessToken: string }>("/auth/switch-company", {
                    companyId: nextCompanyId,
                  });
                  localStorage.setItem("fersua_token", data.accessToken);
                  localStorage.setItem("fersua_company_id", nextCompanyId);
                  setCompanyId(nextCompanyId);
                  await refresh();
                  message.success("Empresa actualizada.");
                } catch {
                  message.error("No se pudo cambiar de empresa.");
                }
              }}
            />
            <Button
              danger
              type="primary"
              icon={<LogoutOutlined />}
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
            >
              Salir
            </Button>
          </div>
        </Header>
        <Content style={{ padding: 24, overflow: "auto" }}>
          <Outlet key={companyId} />
        </Content>
      </Layout>
    </Layout>
  );
}
