import { useMemo } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Menu, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import {
  ApiOutlined,
  AppstoreOutlined,
  BankOutlined,
  KeyOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons";

const SUBMENU_META_ADS = "meta-ads-config";

function adminSectionKey(pathname: string): string {
  if (pathname.includes("/app/admin/meta-ads-apps")) return "meta-ads-apps";
  if (pathname.includes("/app/admin/meta-ads-usuarios")) return "meta-ads-usuarios";
  if (pathname.includes("/app/admin/usuarios")) return "usuarios";
  if (pathname.includes("/app/admin/configuracion")) return "configuracion";
  return "empresas";
}

const menuItems: MenuProps["items"] = [
  {
    key: "empresas",
    icon: <BankOutlined />,
    label: <Link to="/app/admin/empresas">Empresas</Link>,
  },
  {
    key: "usuarios",
    icon: <UserOutlined />,
    label: <Link to="/app/admin/usuarios">Usuarios</Link>,
  },
  {
    // En horizontal, Ant Design lo pinta como desplegable al pasar el ratón.
    key: SUBMENU_META_ADS,
    icon: <ApiOutlined />,
    label: "Configuración Meta Ads",
    children: [
      {
        key: "meta-ads-apps",
        icon: <AppstoreOutlined />,
        label: <Link to="/app/admin/meta-ads-apps">Apps Meta</Link>,
      },
      {
        key: "meta-ads-usuarios",
        icon: <KeyOutlined />,
        label: <Link to="/app/admin/meta-ads-usuarios">Usuarios Meta Ads</Link>,
      },
    ],
  },
  {
    key: "configuracion",
    icon: <SettingOutlined />,
    label: <Link to="/app/admin/configuracion">Configuraciones especiales</Link>,
  },
];

/**
 * Administración con la navegación arriba.
 *
 * Antes era una barra lateral dentro del contenido, o sea un segundo menú vertical
 * pegado al del sidebar principal: dos columnas de navegación compitiendo por el mismo
 * espacio y dejando el contenido en una franja estrecha. En horizontal, las secciones se
 * leen de un vistazo y las que tienen hijos se despliegan al pasar el ratón.
 */
export function AdminLayout() {
  const { token } = theme.useToken();
  const location = useLocation();
  const selected = useMemo(() => adminSectionKey(location.pathname), [location.pathname]);

  return (
    <div style={{ minHeight: "100%" }}>
      <div
        style={{
          borderBottom: `1px solid ${token.colorBorder}`,
          marginBottom: 24,
        }}
      >
        <Typography.Title level={5} style={{ margin: "0 0 2px" }}>
          Administración
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Empresas, usuarios y preferencias
        </Typography.Text>
        <Menu
          mode="horizontal"
          selectedKeys={[selected]}
          items={menuItems}
          // Sin borde propio: el de abajo lo pone el contenedor, y así la línea llega de
          // lado a lado en vez de cortarse donde acaban los ítems.
          style={{ borderBottom: "none", marginTop: 8, background: "transparent" }}
        />
      </div>
      <Outlet />
    </div>
  );
}
