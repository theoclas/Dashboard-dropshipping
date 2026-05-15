import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  deleteOperationalExpense,
  fetchMetaCampaignAdvertisingAccounts,
  fetchOperationalExpenses,
  importMetaBillingOperationalCsv,
  patchCompanySettings,
  patchOperationalExpense,
  postOperationalExpense,
} from "../api";
import { useAuth } from "../contexts/AuthContext";
import { usePermission } from "../hooks/usePermission";
import type { AdvertisingAccount, OperationalExpenseRow } from "../types";

const { Title, Text } = Typography;

export function OperationalExpensesPage() {
  const { user, refresh } = useAuth();
  const canModule = usePermission("moduleGastoOperacional");
  const canCrud = usePermission("actionGastoOperacionalCrud");
  const canImport = usePermission("actionImportMetaBillingOperacional");
  const isAdmin = user?.role === "ADMIN";

  const enabled = user?.companySettings?.operationalExpenseEnabled === true;

  const [rows, setRows] = useState<OperationalExpenseRow[]>([]);
  const [accounts, setAccounts] = useState<AdvertisingAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, acc] = await Promise.all([fetchOperationalExpenses(), fetchMetaCampaignAdvertisingAccounts()]);
      setRows(list);
      setAccounts(acc);
    } catch {
      message.error("No se pudieron cargar los gastos.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canModule && enabled) void load();
  }, [canModule, enabled, load]);

  const columns: ColumnsType<OperationalExpenseRow> = [
    { title: "Fecha", dataIndex: "fecha", key: "f", render: (v: string) => dayjs(v).format("YYYY-MM-DD") },
    { title: "Concepto", dataIndex: "concepto", key: "c" },
    {
      title: "Monto",
      dataIndex: "monto",
      key: "m",
      render: (v: number) => (v != null ? v.toFixed(2) : "—"),
    },
    {
      title: "Cuenta Meta",
      key: "acc",
      render: (_, r) => r.advertisingAccount?.metaAccountId ?? r.cuentaPublicitaria ?? "—",
    },
    {
      title: "Pagado",
      dataIndex: "pagado",
      key: "p",
      render: (v, r) => (
        <Switch
          checked={v}
          disabled={!canCrud}
          onChange={async (checked) => {
            try {
              await patchOperationalExpense(r.id, { pagado: checked });
              message.success("Actualizado.");
              void load();
            } catch {
              message.error("No se pudo actualizar.");
            }
          }}
        />
      ),
    },
    ...(canCrud
      ? [
          {
            title: "",
            key: "del",
            render: (_: unknown, r: OperationalExpenseRow) => (
              <Button
                danger
                size="small"
                onClick={() => {
                  void (async () => {
                    await deleteOperationalExpense(r.id);
                    message.success("Eliminado.");
                    void load();
                  })();
                }}
              >
                Borrar
              </Button>
            ),
          } as const,
        ]
      : []),
  ];

  if (!canModule) {
    return <Typography.Paragraph>No tienes permiso para gastos operacionales.</Typography.Paragraph>;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Title level={3} style={{ margin: 0 }}>
        Gasto operacional
      </Title>

      {isAdmin ? (
        <Card title="Configuración de empresa">
          <Space align="center">
            <Text>Módulo habilitado</Text>
            <Switch
              checked={enabled}
              onChange={async (v) => {
                if (!user?.activeCompany) return;
                try {
                  await patchCompanySettings(user.activeCompany, { operationalExpenseEnabled: v });
                  message.success("Configuración guardada.");
                  await refresh();
                } catch {
                  message.error("No se pudo guardar.");
                }
              }}
            />
          </Space>
        </Card>
      ) : null}

      {!enabled ? (
        <Text type="secondary">El módulo está deshabilitado. Pide a un administrador que lo active.</Text>
      ) : (
        <>
          <Card title="Importar facturación Meta (CSV)">
            <Upload
              maxCount={1}
              showUploadList={false}
              beforeUpload={(file) => {
                void (async () => {
                  if (!canImport) {
                    message.warning("Sin permiso de importación.");
                    return false;
                  }
                  try {
                    const res = await importMetaBillingOperationalCsv(file);
                    message.success(
                      `Creadas ${res.expensesCreated} líneas de gasto; cuentas nuevas: ${res.accountsCreated}.`,
                    );
                    if (res.errors.length) message.warning(res.errors.slice(0, 5).join(" | "));
                    void load();
                  } catch {
                    message.error("Error al importar CSV.");
                  }
                })();
                return false;
              }}
            >
              <Button icon={<UploadOutlined />} disabled={!canImport}>
                Subir CSV
              </Button>
            </Upload>
          </Card>

          <Card title="Alta manual">
            <Form
              form={form}
              layout="vertical"
              disabled={!canCrud}
              onFinish={async (vals: {
                fecha: ReturnType<typeof dayjs>;
                monto: number;
                concepto: string;
                advertisingAccountId?: string;
              }) => {
                try {
                  await postOperationalExpense({
                    fecha: vals.fecha.toISOString(),
                    monto: vals.monto,
                    concepto: vals.concepto,
                    advertisingAccountId: vals.advertisingAccountId || null,
                  });
                  message.success("Registrado.");
                  form.resetFields();
                  void load();
                } catch {
                  message.error("No se pudo crear.");
                }
              }}
            >
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]} initialValue={dayjs()}>
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="monto" label="Monto" rules={[{ required: true }]}>
                <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="concepto" label="Concepto" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="advertisingAccountId" label="Cuenta publicitaria (opcional)">
                <Select
                  allowClear
                  options={accounts.map((a) => ({ value: a.id, label: `${a.metaAccountId} ${a.businessName ?? ""}` }))}
                />
              </Form.Item>
              <Button type="primary" htmlType="submit">
                Guardar
              </Button>
            </Form>
          </Card>

          <Card>
            <Table rowKey="id" loading={loading} dataSource={rows} columns={columns} pagination={{ pageSize: 15 }} />
          </Card>
        </>
      )}
    </Space>
  );
}
