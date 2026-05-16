import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Button,
  Card,
  Checkbox,
  Descriptions,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { patchDashboardConfig } from "../api";
import { DropiRetirosPanel } from "../components/DropiRetirosPanel";
import { useAuth } from "../contexts/AuthContext";
import { usePermission } from "../hooks/usePermission";
import {
  DASHBOARD_CARD_KEYS,
  DASHBOARD_CARD_LABELS,
  mergeDashboardVisibility,
  type DashboardCardKey,
} from "../dashboardVisibility";
import type { CompanyMembership, Role } from "../types";

const { Title, Text, Paragraph } = Typography;

const dashboardCardBodyScroll = {
  maxHeight: "min(560px, calc(100vh - 260px))" as const,
  overflowY: "auto" as const,
  paddingRight: 4,
};

/**
 * Configuración para usuarios que no son ADMIN global (p. ej. operador con módulo configuración):
 * resumen de empresa, perfil, tarjetas del dashboard.
 * Los ADMIN con permiso de configuración van a `/app/admin/configuracion` (Configuraciones especiales).
 */
export function SettingsPage() {
  const { user, refresh } = useAuth();
  const canModule = usePermission("moduleConfiguracion");
  const canDashboardCards = usePermission("actionConfigDashboardTarjetas");
  const isAdmin = user?.role === "ADMIN";

  const [activeTab, setActiveTab] = useState("dashboard");
  const [cards, setCards] = useState<Record<DashboardCardKey, boolean>>(() =>
    mergeDashboardVisibility(user?.dashboardConfig),
  );

  useEffect(() => {
    setCards(mergeDashboardVisibility(user?.dashboardConfig));
  }, [user?.dashboardConfig]);

  const sections = useMemo(() => {
    const map = new Map<string, DashboardCardKey[]>();
    for (const k of DASHBOARD_CARD_KEYS) {
      const sec = DASHBOARD_CARD_LABELS[k].section;
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(k);
    }
    return [...map.entries()];
  }, []);

  const membershipColumns: ColumnsType<CompanyMembership> = useMemo(
    () => [
      { title: "Empresa", dataIndex: "name", key: "name", ellipsis: true },
      {
        title: "Rol",
        dataIndex: "role",
        key: "role",
        width: 120,
        render: (r: Role) => <Tag>{r}</Tag>,
      },
      {
        title: "",
        key: "act",
        width: 110,
        render: (_, m) =>
          m.companyId === user?.activeCompany ? <Tag color="processing">Activa</Tag> : <Text type="secondary">—</Text>,
      },
    ],
    [user?.activeCompany],
  );

  if (isAdmin && canModule) {
    return <Navigate to="/app/admin/configuracion" replace />;
  }

  if (!canModule) {
    return <Paragraph>No tienes permiso para el módulo de configuración.</Paragraph>;
  }

  const cs = user?.companySettings;
  const expenseEnabled = user?.companySettings?.operationalExpenseEnabled ?? false;

  const empresaDescriptions = (
    <>
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Datos de la <strong>empresa activa</strong>. Para cambiar de empresa usa el selector en la barra superior
        (derecha).
      </Paragraph>
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
        <Descriptions.Item label="ID">{cs?.id ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Nombre">{cs?.name ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Slug">{cs?.slug ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Estado">
          {cs?.isActive === false ? <Tag color="red">Inactiva</Tag> : <Tag color="green">Activa</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="Tu rol en la empresa activa (barra superior)">
          <Tag>{user?.role ?? "—"}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Gasto operacional (esta empresa)">
          <Text type="secondary">{expenseEnabled ? "Habilitado" : "Desactivado"} (solo ADMIN)</Text>
        </Descriptions.Item>
      </Descriptions>
      <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 8 }}>
        El módulo de gasto operacional lo habilita un administrador de la empresa en Administración → Configuraciones
        especiales.
      </Paragraph>
      <Text strong style={{ display: "block", marginBottom: 8 }}>
        Empresas vinculadas a tu cuenta
      </Text>
      <Table<CompanyMembership>
        rowKey="companyId"
        size="small"
        pagination={false}
        dataSource={user?.companies ?? []}
        columns={membershipColumns}
        locale={{ emptyText: "Sin empresas asignadas" }}
      />
    </>
  );

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Title level={3} style={{ margin: 0 }}>
        Configuración
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 0, marginTop: -8 }}>
        Preferencias personales del dashboard, datos de empresa y tu perfil. La configuración avanzada (gasto
        operacional, etc.) la gestionan los administradores desde el menú <Text strong>Administración</Text> →
        Configuraciones especiales.
      </Paragraph>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "dashboard",
            label: "Dashboard",
            children: (
              <Card
                title="Visibilidad de tarjetas"
                extra={
                  <Button
                    type="primary"
                    disabled={!canDashboardCards}
                    onClick={async () => {
                      try {
                        await patchDashboardConfig(cards);
                        message.success("Preferencias guardadas.");
                        await refresh();
                      } catch {
                        message.error("No se pudo guardar.");
                      }
                    }}
                  >
                    Guardar
                  </Button>
                }
                styles={{ body: dashboardCardBodyScroll }}
              >
                <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
                  Ajustes personales: qué bloques ver en la página Dashboard. Si no ves todas las opciones, desplázate
                  dentro de este panel.
                </Text>
                <Space direction="vertical" size="large" style={{ width: "100%", paddingBottom: 8 }}>
                  {sections.map(([section, keys]) => (
                    <div key={section}>
                      <Text strong style={{ display: "block", marginBottom: 8 }}>
                        {section}
                      </Text>
                      <Space direction="vertical" style={{ paddingLeft: 8 }}>
                        {keys.map((key) => (
                          <Checkbox
                            key={key}
                            checked={cards[key]}
                            disabled={!canDashboardCards}
                            onChange={(e) => setCards((prev) => ({ ...prev, [key]: e.target.checked }))}
                          >
                            {DASHBOARD_CARD_LABELS[key].label}
                          </Checkbox>
                        ))}
                      </Space>
                    </div>
                  ))}
                </Space>
              </Card>
            ),
          },
          {
            key: "empresa",
            label: "Empresa",
            children: <Card styles={{ body: { paddingBottom: 8 } }}>{empresaDescriptions}</Card>,
          },
          {
            key: "retiros-dropi",
            label: "Retiros Dropi",
            children: (
              <Card title="Retiros Dropi" styles={{ body: { paddingBottom: 8 } }}>
                <DropiRetirosPanel />
              </Card>
            ),
          },
          {
            key: "perfil",
            label: "Perfil",
            children: (
              <Card title="Tu cuenta">
                <Descriptions bordered size="small" column={{ xs: 1, sm: 1 }}>
                  <Descriptions.Item label="Nombre">{user?.fullName ?? "—"}</Descriptions.Item>
                  <Descriptions.Item label="Usuario (login)">{user?.username ?? "—"}</Descriptions.Item>
                  <Descriptions.Item label="Email">{user?.email ?? "—"}</Descriptions.Item>
                  <Descriptions.Item label="Rol en empresa activa">
                    <Tag>{user?.role ?? "—"}</Tag>
                  </Descriptions.Item>
                </Descriptions>
                <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
                  Para cambiar contraseña u otros datos de cuenta contacta a un administrador de la empresa.
                </Paragraph>
              </Card>
            ),
          },
        ]}
      />
    </Space>
  );
}
