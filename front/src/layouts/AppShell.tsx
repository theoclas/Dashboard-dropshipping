import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button, Layout, Menu, Select, Typography, message, theme } from "antd";
import type { MenuProps } from "antd";
import {
  BarChartOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  DollarCircleOutlined,
  ExperimentOutlined,
  FundProjectionScreenOutlined,
  InboxOutlined,
  KeyOutlined,
  LineChartOutlined,
  LogoutOutlined,
  ShoppingOutlined,
  SwapOutlined,
  UserOutlined,
  TruckOutlined,
  ApiOutlined,
  BankOutlined,
  AppstoreOutlined,
  SettingOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import { api } from "../api";
import { BRANDING_LOGO_SIDER_SRC } from "../branding";
import { useAuth } from "../contexts/AuthContext";
import { useFirstAllowedAppPath, usePermission } from "../hooks/usePermission";

const { Header, Sider, Content } = Layout;

type AppMenuItem = NonNullable<MenuProps["items"]>[number];

const SUBMENU_OPERACION = "submenu-operacion";
const SUBMENU_DATOS = "submenu-datos";
const SUBMENU_MARKETING = "submenu-marketing";
const SUBMENU_FINANZAS = "submenu-finanzas";
const SUBMENU_ANALISIS = "submenu-analisis";
const SUBMENU_CONFIG = "submenu-config";
const SUBMENU_META_ADS = "submenu-meta-ads";

const MENU_OPEN_KEYS_STORAGE = "fersua_menu_open_keys";

function pushSubMenu(out: AppMenuItem[], key: string, label: string, children: AppMenuItem[]) {
  const subChildren = children.filter(Boolean) as AppMenuItem[];
  if (subChildren.length === 0) return;
  out.push({ key, label, className: "fs-menu-section", children: subChildren });
}

/** Submenús que deben abrirse según la ruta activa. */
function openSubmenusForPath(pathname: string): string[] {
  const keys: string[] = [];
  if (pathname.startsWith("/app/admin") || pathname.startsWith("/app/configuracion")) {
    keys.push(SUBMENU_CONFIG);
  }
  if (pathname.includes("/app/admin/meta-ads")) {
    keys.push(SUBMENU_META_ADS);
  }
  if (
    pathname.startsWith("/app/pedidos") ||
    pathname.startsWith("/app/productos") ||
    pathname.startsWith("/app/logistica")
  ) {
    keys.push(SUBMENU_OPERACION);
  }
  if (pathname.startsWith("/app/importar") || pathname.startsWith("/app/mapeo")) {
    keys.push(SUBMENU_DATOS);
  }
  if (
    pathname.startsWith("/app/campanas-meta") ||
    pathname.startsWith("/app/cuentas-publicitarias") ||
    pathname.startsWith("/app/cpa")
  ) {
    keys.push(SUBMENU_MARKETING);
  }
  if (pathname.startsWith("/app/gasto-operacional") || pathname.startsWith("/app/salidas-cartera")) {
    keys.push(SUBMENU_FINANZAS);
  }
  if (pathname.startsWith("/app/reportes")) {
    keys.push(SUBMENU_ANALISIS);
  }
  return keys;
}

function readStoredOpenKeys(): string[] | null {
  try {
    const raw = localStorage.getItem(MENU_OPEN_KEYS_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : null;
  } catch {
    return null;
  }
}

const pathToKey = (pathname: string): string => {
  if (pathname.startsWith("/app/campanas-meta")) return "/app/campanas-meta";
  if (pathname.startsWith("/app/cuentas-publicitarias")) return "/app/cuentas-publicitarias";
  if (pathname.startsWith("/app/gasto-operacional")) return "/app/gasto-operacional";
  if (pathname.startsWith("/app/salidas-cartera")) return "/app/salidas-cartera";
  if (pathname.startsWith("/app/pedidos")) return "/app/pedidos";
  if (pathname.startsWith("/app/productos")) return "/app/productos";
  if (pathname.startsWith("/app/logistica")) return "/app/logistica";
  if (pathname.startsWith("/app/importar")) return "/app/importar";
  if (pathname.startsWith("/app/dashboard")) return "/app/dashboard";
  if (pathname.startsWith("/app/reportes")) return "/app/reportes";
  if (pathname.startsWith("/app/mapeo")) return "/app/mapeo";
  if (pathname.startsWith("/app/cpa-resumen")) return "/app/cpa-resumen";
  if (pathname.startsWith("/app/cpa-experimental")) return "/app/cpa-experimental";
  /* Ruta legacy /app/cpa redirige a CPA experimental; no aparece en el menú. */
  if (pathname.startsWith("/app/cpa")) return "/app/cpa-experimental";
  if (pathname.startsWith("/app/admin/empresas")) return "/app/admin/empresas";
  if (pathname.startsWith("/app/admin/usuarios")) return "/app/admin/usuarios";
  if (pathname.startsWith("/app/admin/meta-ads-apps")) return "/app/admin/meta-ads-apps";
  if (pathname.startsWith("/app/admin/meta-ads-usuarios")) return "/app/admin/meta-ads-usuarios";
  if (pathname.startsWith("/app/admin/configuracion")) return "/app/admin/configuracion";
  if (pathname.startsWith("/app/admin")) return "/app/admin/empresas";
  if (pathname.startsWith("/app/empresas")) return "/app/admin/empresas";
  if (pathname.startsWith("/app/configuracion")) return "/app/configuracion";
  return "/app/pedidos";
};

export function AppShell() {
  const { token } = theme.useToken();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, refresh } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [companyId, setCompanyId] = useState(() => localStorage.getItem("fersua_company_id") ?? "");
  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    const stored = readStoredOpenKeys();
    if (stored) return stored;
    return openSubmenusForPath(location.pathname);
  });

  const selectedKey = pathToKey(location.pathname);

  useEffect(() => {
    const forPath = openSubmenusForPath(location.pathname);
    if (forPath.length === 0) return;
    setOpenKeys((prev) => {
      const next = new Set(prev);
      for (const k of forPath) next.add(k);
      return [...next];
    });
  }, [location.pathname]);

  const handleMenuOpenChange: MenuProps["onOpenChange"] = (keys) => {
    const next = keys as string[];
    setOpenKeys(next);
    try {
      localStorage.setItem(MENU_OPEN_KEYS_STORAGE, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  };

  const homePath = useFirstAllowedAppPath();
  const canAdmin = user?.role === "ADMIN";
  const canDashboard = usePermission("moduleDashboard");
  const canPedidos = usePermission("modulePedidos");
  const canReportes = usePermission("moduleReportes");
  const canImportaciones = usePermission("moduleImportaciones");
  const canSalidasCartera = usePermission("moduleSalidasCartera");
  const canMapeo = usePermission("moduleMapeo");
  const canCpa = usePermission("moduleCpa");
  const canCampanas = usePermission("moduleCampanasMeta");
  const canCuentas = usePermission("moduleCuentasPublicitarias");
  const canGastoOp = usePermission("moduleGastoOperacional");
  const canConfig = usePermission("moduleConfiguracion");

  const menuItems: MenuProps["items"] = useMemo(() => {
    const items: AppMenuItem[] = [];

    if (canDashboard) {
      items.push({
        key: "/app/dashboard",
        icon: <DashboardOutlined />,
        label: <Link to="/app/dashboard">Dashboard</Link>,
      });
    }

    pushSubMenu(items, SUBMENU_OPERACION, "Operación", [
      canPedidos
        ? {
            key: "/app/pedidos",
            icon: <ShoppingOutlined />,
            label: <Link to="/app/pedidos">Pedidos</Link>,
          }
        : null,
      canPedidos
        ? {
            key: "/app/productos",
            icon: <InboxOutlined />,
            label: <Link to="/app/productos">Productos</Link>,
          }
        : null,
      canImportaciones
        ? {
            key: "/app/logistica",
            icon: <TruckOutlined />,
            label: <Link to="/app/logistica">Logística</Link>,
          }
        : null,
    ]);

    pushSubMenu(items, SUBMENU_DATOS, "Datos", [
      canImportaciones
        ? {
            key: "/app/importar",
            icon: <CloudUploadOutlined />,
            label: <Link to="/app/importar">Importar</Link>,
          }
        : null,
      canMapeo
        ? {
            key: "/app/mapeo",
            icon: <SwapOutlined />,
            label: <Link to="/app/mapeo">Mapeo estados</Link>,
          }
        : null,
    ]);

    pushSubMenu(items, SUBMENU_MARKETING, "Marketing", [
      canCampanas
        ? {
            key: "/app/campanas-meta",
            icon: <FundProjectionScreenOutlined />,
            label: <Link to="/app/campanas-meta">Campañas Meta</Link>,
          }
        : null,
      canCuentas
        ? {
            key: "/app/cuentas-publicitarias",
            icon: <BankOutlined />,
            label: <Link to="/app/cuentas-publicitarias">Cuentas publicitarias</Link>,
          }
        : null,
      canCpa
        ? {
            key: "/app/cpa-resumen",
            icon: <BarChartOutlined />,
            label: <Link to="/app/cpa-resumen">CPA Resumen</Link>,
          }
        : null,
      canCpa
        ? {
            key: "/app/cpa-experimental",
            icon: <ExperimentOutlined />,
            label: <Link to="/app/cpa-experimental">CPA experimental</Link>,
          }
        : null,
      /* CPA clásico (Excel / cpa-records) oculto: sustituido por CPA experimental. Ver CpaPage / CpaRecordsView. */
    ]);

    pushSubMenu(items, SUBMENU_FINANZAS, "Finanzas", [
      canSalidasCartera
        ? {
            key: "/app/salidas-cartera",
            icon: <ExportOutlined />,
            label: <Link to="/app/salidas-cartera">Salidas cartera</Link>,
          }
        : null,
      canGastoOp
        ? {
            key: "/app/gasto-operacional",
            icon: <DollarCircleOutlined />,
            label: <Link to="/app/gasto-operacional">Gasto operacional</Link>,
          }
        : null,
    ]);

    pushSubMenu(items, SUBMENU_ANALISIS, "Análisis", [
      canReportes
        ? {
            key: "/app/reportes",
            icon: <LineChartOutlined />,
            label: <Link to="/app/reportes">Reportes</Link>,
          }
        : null,
    ]);

    if (canAdmin) {
      items.push({
        key: SUBMENU_CONFIG,
        icon: <SettingOutlined />,
        label: "Configuración",
        children: [
          {
            key: "/app/admin/empresas",
            icon: <BankOutlined />,
            label: <Link to="/app/admin/empresas">Empresas</Link>,
          },
          {
            key: "/app/admin/usuarios",
            icon: <UserOutlined />,
            label: <Link to="/app/admin/usuarios">Usuarios</Link>,
          },
          {
            key: SUBMENU_META_ADS,
            icon: <ApiOutlined />,
            label: "Configuración Meta Ads",
            children: [
              {
                key: "/app/admin/meta-ads-apps",
                icon: <AppstoreOutlined />,
                label: <Link to="/app/admin/meta-ads-apps">Apps Meta</Link>,
              },
              {
                key: "/app/admin/meta-ads-usuarios",
                icon: <KeyOutlined />,
                label: <Link to="/app/admin/meta-ads-usuarios">Usuarios Meta Ads</Link>,
              },
            ],
          },
          {
            key: "/app/admin/configuracion",
            icon: <DashboardOutlined />,
            label: <Link to="/app/admin/configuracion">Configuraciones especiales</Link>,
          },
        ],
      });
    } else if (canConfig) {
      items.push({
        key: "/app/configuracion",
        icon: <SettingOutlined />,
        label: <Link to="/app/configuracion">Configuración</Link>,
      });
    }

    return items;
  }, [
    canAdmin,
    canDashboard,
    canPedidos,
    canReportes,
    canImportaciones,
    canMapeo,
    canCpa,
    canCampanas,
    canCuentas,
    canGastoOp,
    canConfig,
  ]);

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
          <Link to={homePath} style={{ display: "flex", justifyContent: "center", width: "100%", lineHeight: 0 }}>
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
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={handleMenuOpenChange}
          items={menuItems}
          style={{ borderInlineEnd: 0 }}
        />
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
