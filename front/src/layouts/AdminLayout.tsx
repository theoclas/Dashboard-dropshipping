import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Layout, Menu, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import { BankOutlined, AppstoreOutlined, ApiOutlined, KeyOutlined, SettingOutlined, UserOutlined } from "@ant-design/icons";

const { Sider, Content } = Layout;

const SUBMENU_META_ADS = "meta-ads-config";

function adminSectionKey(pathname: string): string {
  if (pathname.includes("/app/admin/meta-ads-apps")) return "meta-ads-apps";
  if (pathname.includes("/app/admin/meta-ads-usuarios")) return "meta-ads-usuarios";
  if (pathname.includes("/app/admin/usuarios")) return "usuarios";
  if (pathname.includes("/app/admin/configuracion")) return "configuracion";
  return "empresas";
}

function adminOpenKeys(pathname: string): string[] {
  if (pathname.includes("/app/admin/meta-ads")) return [SUBMENU_META_ADS];
  return [];
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

export function AdminLayout() {
  const { token } = theme.useToken();
  const location = useLocation();
  const selected = adminSectionKey(location.pathname);
  const [openKeys, setOpenKeys] = useState<string[]>(() => adminOpenKeys(location.pathname));

  useEffect(() => {
    const forPath = adminOpenKeys(location.pathname);
    if (forPath.length === 0) return;
    setOpenKeys((prev) => {
      const next = new Set(prev);
      for (const k of forPath) next.add(k);
      return [...next];
    });
  }, [location.pathname]);

  return (
    <Layout style={{ minHeight: "100%", background: "transparent" }}>
      <Sider
        width={240}
        theme="light"
        style={{
          borderRight: `1px solid ${token.colorBorder}`,
          background: token.colorBgContainer,
        }}
      >
        <div style={{ padding: "16px 16px 8px" }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            Administración
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Empresas, usuarios y preferencias
          </Typography.Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selected]}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          items={menuItems}
          style={{ borderInlineEnd: 0 }}
        />
      </Sider>
      <Content style={{ paddingLeft: 24, minWidth: 0 }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
