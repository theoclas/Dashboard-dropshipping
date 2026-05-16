import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Descriptions,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { Link } from "react-router-dom";
import { fetchCompanies, patchCompanySettings, patchDashboardConfig } from "../../api";
import { DropiRetirosPanel } from "../../components/DropiRetirosPanel";
import { useAuth } from "../../contexts/AuthContext";
import {
  DASHBOARD_CARD_KEYS,
  DASHBOARD_CARD_LABELS,
  mergeDashboardVisibility,
  type DashboardCardKey,
} from "../../dashboardVisibility";
import type { Company } from "../../types";

const { Title, Text, Paragraph } = Typography;

const dashboardCardBodyScroll = {
  maxHeight: "min(560px, calc(100vh - 260px))" as const,
  overflowY: "auto" as const,
  paddingRight: 4,
};

export function AdminConfigPage() {
  const { user, refresh } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [settingsCompanyId, setSettingsCompanyId] = useState(user?.activeCompany ?? "");
  const [expenseEnabled, setExpenseEnabled] = useState(user?.companySettings?.operationalExpenseEnabled ?? false);
  const [cards, setCards] = useState<Record<DashboardCardKey, boolean>>(() =>
    mergeDashboardVisibility(user?.dashboardConfig),
  );

  const adminCompanyIds = useMemo(
    () => user?.companies.filter((m) => m.role === "ADMIN").map((m) => m.companyId) ?? [],
    [user?.companies],
  );

  const companyOptionsForAdmin = useMemo(() => {
    return companies
      .filter((c) => adminCompanyIds.includes(c.id))
      .map((c) => ({ value: c.id, label: `${c.name} (${c.slug})` }));
  }, [companies, adminCompanyIds]);

  const selectedCompanyRow = useMemo(
    () => companies.find((c) => c.id === settingsCompanyId),
    [companies, settingsCompanyId],
  );

  const loadCompanies = useCallback(async () => {
    try {
      const list = await fetchCompanies();
      setCompanies(list);
    } catch {
      message.error("No se pudieron cargar las empresas.");
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    setExpenseEnabled(user?.companySettings?.operationalExpenseEnabled ?? false);
  }, [user?.companySettings?.operationalExpenseEnabled]);

  useEffect(() => {
    setCards(mergeDashboardVisibility(user?.dashboardConfig));
  }, [user?.dashboardConfig]);

  useEffect(() => {
    if (!user?.activeCompany || companyOptionsForAdmin.length === 0) return;
    const def = companyOptionsForAdmin.some((o) => o.value === user.activeCompany)
      ? user.activeCompany
      : companyOptionsForAdmin[0]!.value;
    setSettingsCompanyId(def);
  }, [user?.activeCompany, companyOptionsForAdmin]);

  useEffect(() => {
    const co = companies.find((c) => c.id === settingsCompanyId);
    if (co) setExpenseEnabled(co.operationalExpenseEnabled ?? false);
  }, [settingsCompanyId, companies]);

  const sections = useMemo(() => {
    const map = new Map<string, DashboardCardKey[]>();
    for (const k of DASHBOARD_CARD_KEYS) {
      const sec = DASHBOARD_CARD_LABELS[k].section;
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(k);
    }
    return [...map.entries()];
  }, []);

  const cs = user?.companySettings;

  const empresaDescriptions = (
    <>
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
        <Descriptions.Item label="ID">{selectedCompanyRow?.id ?? cs?.id ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Nombre">{selectedCompanyRow?.name ?? cs?.name ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Slug">{selectedCompanyRow?.slug ?? cs?.slug ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Estado">
          {(selectedCompanyRow?.isActive ?? cs?.isActive) === false ? (
            <Tag color="red">Inactiva</Tag>
          ) : (
            <Tag color="green">Activa</Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Tu rol en la empresa activa (barra superior)">
          <Tag>{user?.role ?? "—"}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Gasto operacional (esta empresa)">
          <Space align="center">
            <Switch
              checked={expenseEnabled}
              onChange={async (v) => {
                if (!settingsCompanyId) return;
                try {
                  await patchCompanySettings(settingsCompanyId, { operationalExpenseEnabled: v });
                  message.success("Guardado.");
                  setExpenseEnabled(v);
                  await loadCompanies();
                  await refresh();
                } catch {
                  message.error("No se pudo guardar.");
                }
              }}
            />
            <Text type="secondary">{expenseEnabled ? "Habilitado" : "Desactivado"}</Text>
          </Space>
        </Descriptions.Item>
      </Descriptions>
      <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        El módulo de gasto operacional es <strong>por empresa</strong>. Si administras varias, elige cuál configuras
        arriba.
      </Paragraph>
    </>
  );

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Title level={3} style={{ margin: 0 }}>
        Configuraciones especiales
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Qué tarjetas ves en el dashboard y datos de la empresa. Para usuarios y permisos usa{" "}
        <Link to="/app/admin/usuarios">Usuarios</Link>; para altas de empresa,{" "}
        <Link to="/app/admin/empresas">Empresas</Link>.
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
                  Ajustes personales: qué bloques ver en la página Dashboard. Si la lista es larga, desplázate dentro
                  de este panel.
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
            children: (
              <Card>
                {companyOptionsForAdmin.length > 1 ? (
                  <Space style={{ marginBottom: 16 }} wrap>
                    <Text strong>Empresa a configurar:</Text>
                    <Select
                      style={{ minWidth: 280 }}
                      value={settingsCompanyId}
                      options={companyOptionsForAdmin}
                      onChange={(v) => setSettingsCompanyId(v)}
                    />
                  </Space>
                ) : null}
                {empresaDescriptions}
              </Card>
            ),
          },
          {
            key: "retiros-dropi",
            label: "Retiros Dropi",
            children: (
              <Card title="Retiros Dropi">
                <DropiRetirosPanel />
              </Card>
            ),
          },
        ]}
      />
    </Space>
  );
}
