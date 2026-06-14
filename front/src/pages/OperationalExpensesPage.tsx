import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { FilterDropdownProps } from "antd/es/table/interface";
import { PlusOutlined, UploadOutlined, ApiOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { Link } from "react-router-dom";
import {
  deleteOperationalExpense,
  fetchMetaAdsAppOptions,
  fetchMetaAdsSystemUserOptions,
  fetchMetaCampaignAdvertisingAccounts,
  fetchOperationalExpenses,
  importMetaBillingApi,
  importMetaBillingOperationalCsv,
  patchOperationalExpense,
  postOperationalExpense,
  previewMetaBillingApiImport,
} from "../api";
import { confirmWipePasswordDelete } from "../components/confirmWipePasswordDelete";
import { useAuth } from "../contexts/AuthContext";
import { formatDateOnly } from "../utils/formatDateOnly";
import { metaApiAccountAccessHint } from "../utils/metaApiErrorHint";
import { usePermission } from "../hooks/usePermission";
import type { AdvertisingAccount, MetaAdsAppOption, MetaAdsSystemUserOption, MetaBillingApiImportResult, OperationalExpenseRow } from "../types";

const { Title, Text } = Typography;

function metaAccountLabel(r: OperationalExpenseRow): string {
  return r.advertisingAccount?.metaAccountId ?? r.cuentaPublicitaria ?? "";
}

function FechaRangeFilterDropdown({ setSelectedKeys, selectedKeys, confirm, clearFilters }: FilterDropdownProps) {
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  useEffect(() => {
    const raw = String(selectedKeys[0] ?? "");
    const p = raw.split("|");
    if (p.length === 2 && p[0] && p[1]) setRange([dayjs(p[0]), dayjs(p[1])]);
    else setRange(null);
  }, [selectedKeys]);

  return (
    <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
      <DatePicker.RangePicker
        style={{ width: "100%" }}
        format="YYYY-MM-DD"
        value={range}
        onChange={(v) => setRange(v ?? null)}
        allowEmpty={[true, true]}
      />
      <Space style={{ marginTop: 8 }}>
        <Button
          type="primary"
          size="small"
          onClick={() => {
            if (range?.[0] && range?.[1]) {
              const a = range[0].format("YYYY-MM-DD");
              const b = range[1].format("YYYY-MM-DD");
              const [desde, hasta] = a <= b ? [a, b] : [b, a];
              setSelectedKeys([`${desde}|${hasta}`]);
            } else {
              setSelectedKeys([]);
            }
            confirm();
          }}
        >
          Filtrar
        </Button>
        <Button
          size="small"
          onClick={() => {
            setRange(null);
            setSelectedKeys([]);
            clearFilters?.();
            confirm();
          }}
        >
          Limpiar
        </Button>
      </Space>
    </div>
  );
}

function ConceptoFilterDropdown({ setSelectedKeys, selectedKeys, confirm, clearFilters }: FilterDropdownProps) {
  const [text, setText] = useState(String(selectedKeys[0] ?? ""));
  useEffect(() => {
    setText(String(selectedKeys[0] ?? ""));
  }, [selectedKeys]);

  return (
    <div style={{ padding: 8, width: 220 }} onKeyDown={(e) => e.stopPropagation()}>
      <Input
        placeholder="Contiene en concepto"
        value={text}
        onChange={(e) => setText(e.target.value)}
        allowClear
        onPressEnter={() => {
          setSelectedKeys(text.trim() ? [text.trim()] : []);
          confirm();
        }}
      />
      <Space style={{ marginTop: 8 }}>
        <Button
          type="primary"
          size="small"
          onClick={() => {
            setSelectedKeys(text.trim() ? [text.trim()] : []);
            confirm();
          }}
        >
          Filtrar
        </Button>
        <Button
          size="small"
          onClick={() => {
            setText("");
            setSelectedKeys([]);
            clearFilters?.();
            confirm();
          }}
        >
          Limpiar
        </Button>
      </Space>
    </div>
  );
}

export function OperationalExpensesPage() {
  const { user } = useAuth();
  const canModule = usePermission("moduleGastoOperacional");
  const canCrud = usePermission("actionGastoOperacionalCrud");
  const canImport = usePermission("actionImportMetaBillingOperacional");
  const isAdmin = user?.role === "ADMIN";

  const enabled = user?.companySettings?.operationalExpenseEnabled === true;

  const [rows, setRows] = useState<OperationalExpenseRow[]>([]);
  const [accounts, setAccounts] = useState<AdvertisingAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [form] = Form.useForm();

  const [apiAccountId, setApiAccountId] = useState<string | undefined>();
  const [metaAdsAppId, setMetaAdsAppId] = useState<string | undefined>();
  const [metaAdsSystemUserId, setMetaAdsSystemUserId] = useState<string | undefined>();
  const [metaAppOptions, setMetaAppOptions] = useState<MetaAdsAppOption[]>([]);
  const [metaSystemUserOptions, setMetaSystemUserOptions] = useState<MetaAdsSystemUserOption[]>([]);
  const [apiRange, setApiRange] = useState<[Dayjs, Dayjs] | null>(() => [
    dayjs().subtract(7, "day"),
    dayjs(),
  ]);
  const [apiPreview, setApiPreview] = useState<MetaBillingApiImportResult | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiImporting, setApiImporting] = useState(false);

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

  const loadMetaApps = useCallback(async () => {
    if (!canImport) return;
    try {
      const list = await fetchMetaAdsAppOptions();
      setMetaAppOptions(list);
      setMetaAdsAppId((prev) => prev ?? list[0]?.id);
    } catch {
      setMetaAppOptions([]);
    }
  }, [canImport]);

  const loadMetaSystemUsers = useCallback(async (appId?: string) => {
    if (!canImport) return;
    try {
      const list = await fetchMetaAdsSystemUserOptions(appId);
      setMetaSystemUserOptions(list);
      setMetaAdsSystemUserId((prev) => {
        if (prev && list.some((u) => u.id === prev)) return prev;
        return list.find((u) => u.isDefault)?.id ?? list[0]?.id;
      });
    } catch {
      setMetaSystemUserOptions([]);
    }
  }, [canImport]);

  useEffect(() => {
    if (canModule && enabled && canImport) void loadMetaApps();
  }, [canModule, enabled, canImport, loadMetaApps]);

  useEffect(() => {
    if (canModule && enabled && canImport) void loadMetaSystemUsers(metaAdsAppId);
  }, [canModule, enabled, canImport, metaAdsAppId, loadMetaSystemUsers]);

  useEffect(() => {
    if (accounts.length && !apiAccountId) setApiAccountId(accounts[0]?.id);
  }, [accounts, apiAccountId]);

  const apiBody = useCallback(() => {
    if (!apiAccountId || !apiRange) return null;
    return {
      advertisingAccountId: apiAccountId,
      metaAdsAppId: metaAdsAppId ?? null,
      metaAdsSystemUserId: metaAdsSystemUserId ?? null,
      since: apiRange[0].format("YYYY-MM-DD"),
      until: apiRange[1].format("YYYY-MM-DD"),
    };
  }, [apiAccountId, apiRange, metaAdsAppId, metaAdsSystemUserId]);

  const runApiPreview = useCallback(async () => {
    const body = apiBody();
    if (!body) {
      message.warning("Selecciona cuenta y rango de fechas.");
      return;
    }
    setApiLoading(true);
    try {
      const res = await previewMetaBillingApiImport(body);
      setApiPreview(res);
      if (res.billingEventsMatched === 0) {
        message.warning("Sin cargos de facturación con monto en el rango.");
      } else {
        message.success(`${res.billingEventsMatched} cargo(s) listos para importar.`);
      }
      if (res.errors.length) message.warning(res.errors.slice(0, 3).join(" | "));
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "response" in e
        ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      const text = msg ?? "No se pudo consultar la API de Meta.";
      const hint = metaApiAccountAccessHint(text);
      message.error(
        hint ? (
          <div>
            <div>{text}</div>
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 400 }}>{hint}</div>
          </div>
        ) : (
          text
        ),
        8,
      );
      setApiPreview(null);
    } finally {
      setApiLoading(false);
    }
  }, [apiBody]);

  const runApiImport = useCallback(async () => {
    const body = apiBody();
    if (!body) {
      message.warning("Selecciona cuenta y rango de fechas.");
      return;
    }
    setApiImporting(true);
    try {
      const res = await importMetaBillingApi(body);
      setApiPreview(res);
      const parts: string[] = [];
      if (res.expensesCreated > 0) parts.push(`${res.expensesCreated} nuevas`);
      if (res.expensesUpdated > 0) parts.push(`${res.expensesUpdated} actualizadas`);
      if (res.expensesSkipped > 0) parts.push(`${res.expensesSkipped} omitidas`);
      message.success(
        `API Meta: ${parts.length ? parts.join(", ") : "sin cambios"} (${res.metaAccountId}). El estado Pagado no se modifica en filas existentes.`,
      );
      if (res.errors.length) message.warning(res.errors.slice(0, 5).join(" | "));
      void load();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "response" in e
        ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      const text = msg ?? "Error al importar desde API Meta.";
      const hint = metaApiAccountAccessHint(text);
      message.error(
        hint ? (
          <div>
            <div>{text}</div>
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 400 }}>{hint}</div>
          </div>
        ) : (
          text
        ),
        8,
      );
    } finally {
      setApiImporting(false);
    }
  }, [apiBody, load]);

  const metaFilters = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) {
      const id = metaAccountLabel(r);
      if (id) ids.add(id);
    }
    return [...ids].sort().map((value) => ({ text: value, value }));
  }, [rows]);

  const columns: ColumnsType<OperationalExpenseRow> = useMemo(
    () => [
      {
        title: "Fecha",
        dataIndex: "fecha",
        key: "fecha",
        render: (v: string) => formatDateOnly(v),
        sorter: (a, b) => formatDateOnly(a.fecha).localeCompare(formatDateOnly(b.fecha)),
        defaultSortOrder: "descend",
        filterDropdown: (p) => <FechaRangeFilterDropdown {...p} />,
        onFilter: (value, record) => {
          const parts = String(value).split("|");
          if (parts.length !== 2 || !parts[0] || !parts[1]) return true;
          const [desde, hasta] = parts[0] <= parts[1] ? [parts[0], parts[1]] : [parts[1], parts[0]];
          const d = formatDateOnly(record.fecha);
          return d >= desde && d <= hasta;
        },
      },
      {
        title: "Concepto",
        dataIndex: "concepto",
        key: "concepto",
        sorter: (a, b) => a.concepto.localeCompare(b.concepto, "es"),
        filterDropdown: (p) => <ConceptoFilterDropdown {...p} />,
        onFilter: (value, record) =>
          record.concepto.toLowerCase().includes(String(value).toLowerCase()),
      },
      {
        title: "Monto",
        dataIndex: "monto",
        key: "monto",
        align: "right" as const,
        sorter: (a, b) => (a.monto ?? 0) - (b.monto ?? 0),
        render: (v: number) => (v != null ? v.toFixed(2) : "—"),
      },
      {
        title: "Cuenta Meta",
        key: "acc",
        sorter: (a, b) => metaAccountLabel(a).localeCompare(metaAccountLabel(b), "es"),
        filters: metaFilters,
        filterSearch: true,
        onFilter: (value, record) => metaAccountLabel(record) === value,
        render: (_, r) => r.advertisingAccount?.metaAccountId ?? r.cuentaPublicitaria ?? "—",
      },
      {
        title: "Pagado",
        dataIndex: "pagado",
        key: "pagado",
        filters: [
          { text: "Pagado", value: true },
          { text: "Pendiente", value: false },
        ],
        onFilter: (value, record) => String(record.pagado) === String(value),
        sorter: (a, b) => Number(a.pagado) - Number(b.pagado),
        render: (v: boolean, r) => (
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
                    confirmWipePasswordDelete({
                      title: "¿Eliminar este gasto?",
                      description: `${formatDateOnly(r.fecha)} — ${r.concepto} — $${Number(r.monto).toLocaleString("es-CO")}`,
                      onDelete: async (password) => {
                        await deleteOperationalExpense(r.id, password);
                        message.success("Eliminado.");
                        void load();
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
    ],
    [canCrud, load, metaFilters],
  );

  if (!canModule) {
    return <Typography.Paragraph>No tienes permiso para gastos operacionales.</Typography.Paragraph>;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Title level={3} style={{ margin: 0 }}>
        Gasto operacional
      </Title>

      {!enabled ? (
        <Space direction="vertical" size="small">
          <Text type="secondary">El módulo de gasto operacional está deshabilitado para esta empresa.</Text>
          {isAdmin ? (
            <Text>
              Puedes activarlo en <Link to="/app/configuracion">Configuración</Link>.
            </Text>
          ) : (
            <Text type="secondary">Pide a un administrador que lo active en Configuración.</Text>
          )}
        </Space>
      ) : (
        <>
          <Card title="Importar facturación Meta (CSV)">
            <Space wrap>
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
                      const parts: string[] = [];
                      if (res.expensesCreated > 0) parts.push(`${res.expensesCreated} nuevas`);
                      if (res.expensesUpdated > 0) parts.push(`${res.expensesUpdated} actualizadas`);
                      if (res.expensesSkipped > 0) parts.push(`${res.expensesSkipped} omitidas en el CSV`);
                      message.success(
                        `Importación: ${parts.length ? parts.join(", ") : "sin cambios"}; cuentas nuevas: ${res.accountsCreated}. El estado Pagado no se modifica en filas existentes.`,
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
              {canCrud ? (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setManualModalOpen(true)}>
                  Nuevo gasto
                </Button>
              ) : null}
            </Space>
          </Card>

          <Card title="Importar actividad de pago (API Meta)">
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Text type="secondary">
                Consulta <em>/act_&lt;cuenta&gt;/activities</em> por cuenta publicitaria (mismo token que Campañas Meta).
                Importa cargos de facturación como gastos operacionales. Si el gasto ya existe (mismo concepto o misma
                cuenta/fecha/monto), solo actualiza fecha, monto y cuenta; no cambia el estado Pagado.
              </Text>
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <Text strong style={{ display: "block", marginBottom: 6 }}>
                    Cuenta publicitaria
                  </Text>
                  <Select
                    style={{ width: "100%" }}
                    placeholder="Selecciona cuenta"
                    value={apiAccountId}
                    onChange={(v) => {
                      setApiAccountId(v);
                      setApiPreview(null);
                    }}
                    options={accounts.map((a) => ({
                      value: a.id,
                      label: `${a.metaAccountId}${a.businessName ? ` — ${a.businessName}` : ""}`,
                    }))}
                  />
                </Col>
                <Col xs={24} md={12}>
                  <Text strong style={{ display: "block", marginBottom: 6 }}>
                    Rango de fechas
                  </Text>
                  <DatePicker.RangePicker
                    style={{ width: "100%" }}
                    format="DD/MM/YYYY"
                    value={apiRange}
                    onChange={(v) => {
                      setApiRange(v as [Dayjs, Dayjs] | null);
                      setApiPreview(null);
                    }}
                    allowClear={false}
                    disabledDate={(current) => Boolean(current && current > dayjs().endOf("day"))}
                  />
                </Col>
                <Col xs={24} md={12}>
                  <Text strong style={{ display: "block", marginBottom: 6 }}>
                    App Meta
                  </Text>
                  <Select
                    allowClear={metaAppOptions.length === 0}
                    style={{ width: "100%" }}
                    value={metaAdsAppId}
                    onChange={(v) => {
                      setMetaAdsAppId(v);
                      setMetaAdsSystemUserId(undefined);
                      setApiPreview(null);
                    }}
                    options={metaAppOptions.map((a) => ({
                      value: a.id,
                      label: a.metaAppId ? `${a.name} (${a.metaAppId})` : a.name,
                    }))}
                  />
                </Col>
                <Col xs={24} md={12}>
                  <Text strong style={{ display: "block", marginBottom: 6 }}>
                    Usuario del sistema
                  </Text>
                  <Select
                    allowClear
                    style={{ width: "100%" }}
                    value={metaAdsSystemUserId}
                    onChange={(v) => {
                      setMetaAdsSystemUserId(v);
                      setApiPreview(null);
                    }}
                    options={metaSystemUserOptions.map((u) => ({
                      value: u.id,
                      label: `${u.name}${u.isDefault ? " (defecto)" : ""}`,
                    }))}
                  />
                </Col>
              </Row>
              <Space wrap>
                <Button
                  icon={<ApiOutlined />}
                  loading={apiLoading}
                  disabled={!canImport || !apiAccountId}
                  onClick={() => void runApiPreview()}
                >
                  Vista previa
                </Button>
                <Button
                  type="primary"
                  loading={apiImporting}
                  disabled={!canImport || !apiAccountId || !apiPreview?.billingEventsMatched}
                  onClick={() => void runApiImport()}
                >
                  Importar cargos
                </Button>
              </Space>
              {apiPreview ? (
                <div>
                  <Text type="secondary">
                    Cuenta {apiPreview.metaAccountId} · {apiPreview.since} → {apiPreview.until} ·{" "}
                    {apiPreview.billingEventsMatched} cargo(s) · {apiPreview.pagesFetched} página(s) API
                  </Text>
                  {apiPreview.preview && apiPreview.preview.length > 0 ? (
                    <Table
                      size="small"
                      style={{ marginTop: 12 }}
                      rowKey={(r, i) => `${r.concepto}-${i}`}
                      pagination={{ pageSize: 8 }}
                      dataSource={apiPreview.preview}
                      columns={[
                        {
                          title: "Fecha",
                          dataIndex: "eventTime",
                          render: (v: string | null) => (v ? formatDateOnly(v) : "—"),
                        },
                        { title: "Concepto", dataIndex: "concepto" },
                        {
                          title: "Monto",
                          dataIndex: "amount",
                          align: "right" as const,
                          render: (v: number | null) => (v != null ? v.toFixed(2) : "—"),
                        },
                        {
                          title: "Tipo",
                          dataIndex: "translatedEventType",
                          render: (v: string | null, r) => v ?? r.eventType,
                        },
                      ]}
                    />
                  ) : null}
                </div>
              ) : null}
            </Space>
          </Card>

          <Modal
            title="Nuevo gasto"
            open={manualModalOpen}
            onCancel={() => {
              if (!manualSaving) setManualModalOpen(false);
            }}
            footer={[
              <Button key="cancel" disabled={manualSaving} onClick={() => setManualModalOpen(false)}>
                Cancelar
              </Button>,
              <Button
                key="save"
                type="primary"
                loading={manualSaving}
                onClick={() => void form.submit()}
              >
                Guardar
              </Button>,
            ]}
            centered
            width="min(520px, 94vw)"
            destroyOnClose
            maskClosable={!manualSaving}
            styles={{
              body: { maxHeight: "calc(100vh - 220px)", overflowY: "auto", paddingTop: 8 },
            }}
          >
            <Form
              form={form}
              layout="vertical"
              disabled={!canCrud || manualSaving}
              initialValues={{ fecha: dayjs() }}
              onFinish={async (vals: {
                fecha: ReturnType<typeof dayjs>;
                monto: number;
                concepto: string;
                advertisingAccountId?: string;
              }) => {
                setManualSaving(true);
                try {
                  await postOperationalExpense({
                    fecha: vals.fecha.toISOString(),
                    monto: vals.monto,
                    concepto: vals.concepto,
                    advertisingAccountId: vals.advertisingAccountId || null,
                  });
                  message.success("Registrado.");
                  form.resetFields();
                  setManualModalOpen(false);
                  void load();
                } catch {
                  message.error("No se pudo crear.");
                } finally {
                  setManualSaving(false);
                }
              }}
            >
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
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
            </Form>
          </Modal>

          <Card>
            <Table rowKey="id" loading={loading} dataSource={rows} columns={columns} pagination={{ pageSize: 15 }} />
          </Card>
        </>
      )}
    </Space>
  );
}
