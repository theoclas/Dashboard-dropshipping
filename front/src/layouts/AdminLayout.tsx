import { Link, Outlet, useLocation } from "react-router-dom";
import { Layout, Menu, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import { BankOutlined, SettingOutlined, UserOutlined } from "@ant-design/icons";

const { Sider, Content } = Layout;

function adminSectionKey(pathname: string): string {
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
    key: "configuracion",
    icon: <SettingOutlined />,
    label: <Link to="/app/admin/configuracion">Configuraciones especiales</Link>,
  },
];

export function AdminLayout() {
  const { token } = theme.useToken();
  const location = useLocation();
  const selected = adminSectionKey(location.pathname);

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
        <Menu mode="inline" selectedKeys={[selected]} items={menuItems} style={{ borderInlineEnd: 0 }} />
      </Sider>
      <Content style={{ paddingLeft: 24, minWidth: 0 }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
