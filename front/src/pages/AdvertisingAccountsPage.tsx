import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { fetchAdvertisingAccountsWithStats, postMetaCampaignAdvertisingAccount } from "../api";
import { usePermission } from "../hooks/usePermission";
import type { AdvertisingAccountWithStats } from "../types";

const { Title, Text } = Typography;

export function AdvertisingAccountsPage() {
  const canSee = usePermission("moduleCuentasPublicitarias") || usePermission("moduleCampanasMeta");
  const canCrud =
    usePermission("actionCuentasPublicitariasCrud") || usePermission("actionCampanasMetaCrud");

  const [rows, setRows] = useState<AdvertisingAccountWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [metaId, setMetaId] = useState("");
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdvertisingAccountsWithStats();
      setRows(data);
    } catch {
      message.error("No se pudieron cargar las cuentas.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canSee) void load();
  }, [canSee, load]);

  const columns: ColumnsType<AdvertisingAccountWithStats> = [
    { title: "ID Meta", dataIndex: "metaAccountId", key: "mid" },
    { title: "Negocio", dataIndex: "businessName", key: "bn", render: (v) => v ?? "—" },
    { title: "Campañas", key: "c", render: (_, r) => r._count.advertisingCampaigns },
    { title: "Gastos vinculados", key: "g", render: (_, r) => r._count.operationalExpenses },
  ];

  if (!canSee) {
    return <Typography.Paragraph>No tienes permiso para ver cuentas publicitarias.</Typography.Paragraph>;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Title level={3} style={{ margin: 0 }}>
        Cuentas publicitarias
      </Title>

      <Card title="Nueva cuenta Meta">
        <Space wrap>
          <Input placeholder="ID cuenta (numérico)" value={metaId} onChange={(e) => setMetaId(e.target.value)} style={{ width: 200 }} />
          <Input placeholder="Nombre negocio (opcional)" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 240 }} />
          <Button type="primary" disabled={!canCrud} onClick={async () => {
            if (!metaId.trim()) {
              message.warning("Indica el ID de cuenta.");
              return;
            }
            try {
              await postMetaCampaignAdvertisingAccount({ metaAccountId: metaId.trim(), businessName: name.trim() || undefined });
              message.success("Creada.");
              setMetaId("");
              setName("");
              void load();
            } catch {
              message.error("No se pudo crear (¿duplicada?).");
            }
          }}>
            Crear
          </Button>
        </Space>
        {!canCrud ? <Text type="secondary"> Solo lectura: no tienes permiso de alta. </Text> : null}
      </Card>

      <Card>
        <Table rowKey="id" loading={loading} dataSource={rows} columns={columns} pagination={{ pageSize: 15 }} />
      </Card>
    </Space>
  );
}
