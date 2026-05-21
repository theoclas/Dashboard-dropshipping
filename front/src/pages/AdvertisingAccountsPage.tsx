import { useCallback, useEffect, useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
  theme,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import {
  deleteOperationalExpense,
  fetchAdvertisingAccountOperationalExpenses,
  fetchAdvertisingAccountsWithStats,
  postMetaCampaignAdvertisingAccount,
} from "../api";
import { confirmWipePasswordDelete } from "../components/confirmWipePasswordDelete";
import { usePermission } from "../hooks/usePermission";
import { formatDateOnly } from "../utils/formatDateOnly";
import type { AdvertisingAccountWithStats, OperationalExpenseRow } from "../types";

const { Title, Text } = Typography;

function fmtMoney(n: number): string {
  return n.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function AdvertisingAccountsPage() {
  const { token } = theme.useToken();
  const canSee = usePermission("moduleCuentasPublicitarias") || usePermission("moduleCampanasMeta");
  const canCrud =
    usePermission("actionCuentasPublicitariasCrud") || usePermission("actionCampanasMetaCrud");
  const canDeleteExpense = usePermission("actionGastoOperacionalCrud");

  const [rows, setRows] = useState<AdvertisingAccountWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [metaId, setMetaId] = useState("");
  const [name, setName] = useState("");
  const [newAccountOpen, setNewAccountOpen] = useState(false);

  const [selected, setSelected] = useState<AdvertisingAccountWithStats | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [summary, setSummary] = useState({ totalGastado: 0, totalPagado: 0, pendientePorPagar: 0 });
  const [detailRows, setDetailRows] = useState<OperationalExpenseRow[]>([]);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

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

  const loadDetail = useCallback(async () => {
    if (!selected) return;
    setDetailLoading(true);
    try {
      const desde = dateRange?.[0]?.format("YYYY-MM-DD");
      const hasta = dateRange?.[1]?.format("YYYY-MM-DD");
      const res = await fetchAdvertisingAccountOperationalExpenses(selected.id, {
        ...(desde && hasta ? { desde, hasta } : {}),
      });
      setSummary(res.summary);
      setDetailRows(res.items);
    } catch {
      message.error("No se pudieron cargar los gastos de la cuenta.");
      setSummary({ totalGastado: 0, totalPagado: 0, pendientePorPagar: 0 });
      setDetailRows([]);
    } finally {
      setDetailLoading(false);
    }
  }, [selected, dateRange]);

  useEffect(() => {
    if (canSee) void load();
  }, [canSee, load]);

  useEffect(() => {
    if (selected) void loadDetail();
  }, [selected, loadDetail]);

  const columns: ColumnsType<AdvertisingAccountWithStats> = [
    { title: "ID Meta", dataIndex: "metaAccountId", key: "mid" },
    { title: "Negocio", dataIndex: "businessName", key: "bn", render: (v) => v ?? "—" },
    { title: "Campañas", key: "c", render: (_, r) => r._count.advertisingCampaigns },
    { title: "Gastos vinculados", key: "g", render: (_, r) => r._count.operationalExpenses },
  ];

  const expenseColumns: ColumnsType<OperationalExpenseRow> = [
    {
      title: "Fecha",
      dataIndex: "fecha",
      key: "fecha",
      width: 120,
      render: (v: string) => formatDateOnly(v),
    },
    { title: "Concepto", dataIndex: "concepto", key: "concepto", ellipsis: true },
    {
      title: "Monto",
      dataIndex: "monto",
      key: "monto",
      width: 120,
      align: "right",
      render: (v: number) => `$${fmtMoney(v)}`,
    },
    {
      title: "Estado",
      key: "pagado",
      width: 100,
      render: (_, r) =>
        r.pagado ? <Tag color="green">Pagado</Tag> : <Tag color="orange">Pendiente</Tag>,
    },
    { title: "Categoría", dataIndex: "categoria", key: "cat", width: 130, render: (v) => v ?? "—" },
    { title: "Notas", dataIndex: "notas", key: "notas", ellipsis: true, render: (v) => v ?? "—" },
    ...(canDeleteExpense
      ? [
          {
            title: "",
            key: "del",
            width: 90,
            render: (_: unknown, r: OperationalExpenseRow) => (
              <Button
                danger
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmWipePasswordDelete({
                    title: "¿Eliminar este gasto?",
                    description: `${formatDateOnly(r.fecha)} — ${r.concepto} — $${fmtMoney(r.monto)}`,
                    onDelete: async (password) => {
                      await deleteOperationalExpense(r.id, password);
                      message.success("Eliminado.");
                      void loadDetail();
                    },
                  });
                }}
              >
                Borrar
              </Button>
            ),
          } as const,
        ]
      : []),
  ];

  if (!canSee) {
    return <Typography.Paragraph>No tienes permiso para ver cuentas publicitarias.</Typography.Paragraph>;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Title level={3} style={{ margin: 0 }}>
        Cuentas publicitarias
      </Title>

      <Card size="small" title="Nueva cuenta Meta">
        {!canCrud ? (
          <Text type="secondary">Solo lectura: no tienes permiso de alta.</Text>
        ) : !newAccountOpen ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewAccountOpen(true)}>
            Nueva cuenta Meta
          </Button>
        ) : (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Button
              type="link"
              size="small"
              style={{ padding: 0 }}
              onClick={() => {
                setNewAccountOpen(false);
                setMetaId("");
                setName("");
              }}
            >
              Cerrar formulario
            </Button>
            <Space wrap>
              <Input
                placeholder="ID cuenta (numérico)"
                value={metaId}
                onChange={(e) => setMetaId(e.target.value)}
                style={{ width: 200 }}
              />
              <Input
                placeholder="Nombre negocio (opcional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: 240 }}
              />
              <Button
                type="primary"
                onClick={async () => {
                  if (!metaId.trim()) {
                    message.warning("Indica el ID de cuenta.");
                    return;
                  }
                  try {
                    await postMetaCampaignAdvertisingAccount({
                      metaAccountId: metaId.trim(),
                      businessName: name.trim() || undefined,
                    });
                    message.success("Creada.");
                    setMetaId("");
                    setName("");
                    setNewAccountOpen(false);
                    void load();
                  } catch {
                    message.error("No se pudo crear (¿duplicada?).");
                  }
                }}
              >
                Crear
              </Button>
              <Button
                onClick={() => {
                  setNewAccountOpen(false);
                  setMetaId("");
                  setName("");
                }}
              >
                Cancelar
              </Button>
            </Space>
          </Space>
        )}
      </Card>

      <Card>
        <Table<AdvertisingAccountWithStats>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 15 }}
          onRow={(record) => ({
            onClick: () => setSelected((prev) => (prev?.id === record.id ? null : record)),
            style: { cursor: "pointer" },
          })}
          rowClassName={(record) => (selected?.id === record.id ? "fs-account-row-selected" : "")}
        />
      </Card>

      {selected ? (
        <Card
          title={
            <Space wrap>
              <span>
                Cuenta: <Text strong>{selected.metaAccountId}</Text>
                {selected.businessName ? <Text type="secondary"> — {selected.businessName}</Text> : null}
              </span>
              <Button size="small" onClick={() => setSelected(null)}>
                Cerrar detalle
              </Button>
            </Space>
          }
        >
          <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
            Haz clic de nuevo en la misma fila de la tabla superior para ocultar este panel. Los importes corresponden a{" "}
            <strong>gastos operacionales</strong> vinculados a esta cuenta Meta.
          </Text>
          <Space wrap style={{ marginBottom: 16 }} align="center">
            <Text strong>Filtrar por fecha</Text>
            <DatePicker.RangePicker
              format="DD/MM/YYYY"
              value={dateRange}
              placeholder={["Desde", "Hasta"]}
              onChange={(v) => setDateRange(v)}
              allowEmpty={[true, true]}
            />
            <Button
              onClick={() => {
                setDateRange(null);
              }}
            >
              Ver todo el historial
            </Button>
          </Space>

          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ background: token.colorFillAlter }}>
                <Statistic title="Total registrado (gasto)" value={summary.totalGastado} prefix="$" formatter={(v) => fmtMoney(Number(v))} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ background: token.colorFillAlter }}>
                <Statistic title="Pagado" value={summary.totalPagado} prefix="$" valueStyle={{ color: token.colorSuccess }} formatter={(v) => fmtMoney(Number(v))} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ background: token.colorFillAlter }}>
                <Statistic
                  title="Pendiente por pagar"
                  value={summary.pendientePorPagar}
                  prefix="$"
                  valueStyle={{ color: summary.pendientePorPagar > 0 ? token.colorWarning : undefined }}
                  formatter={(v) => fmtMoney(Number(v))}
                />
              </Card>
            </Col>
          </Row>

          <Table<OperationalExpenseRow>
            rowKey="id"
            loading={detailLoading}
            dataSource={detailRows}
            columns={expenseColumns}
            pagination={{ pageSize: 12, showTotal: (t) => `${t} registros` }}
            locale={{ emptyText: "Sin gastos vinculados a esta cuenta en el rango seleccionado." }}
          />
        </Card>
      ) : null}

      <style>{`
        .fs-account-row-selected > td {
          background: ${token.colorPrimaryBg} !important;
        }
      `}</style>
    </Space>
  );
}
