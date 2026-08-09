import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { CloudDownloadOutlined, ExperimentOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import {
  fetchAdMetrics,
  fetchAdsHierarchy,
  fetchMetaAdsAppOptions,
  fetchMetaAdsSystemUserOptions,
  importAdsFromMetaApi,
} from "../api";
import { usePermission } from "../hooks/usePermission";
import { fmtInteger, fmtMoney, fmtPercentPoints } from "../utils/format";
import type {
  AdDailyRow,
  AdLevel,
  AdMetricsResponse,
  AdNodeRow,
  AdsHierarchy,
  AdVerdict,
  MetaAdsAppOption,
  MetaAdsSystemUserOption,
} from "../types";

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const LEVEL_OPTIONS: Array<{ value: AdLevel; label: string }> = [
  { value: "campaign", label: "Campañas" },
  { value: "adset", label: "Conjuntos" },
  { value: "ad", label: "Anuncios" },
];

const VERDICT_STYLE: Record<
  AdVerdict["action"],
  { color: string; label: string }
> = {
  matar: { color: "red", label: "Pausar" },
  vigilar: { color: "orange", label: "Vigilar" },
  dejar_correr: { color: "blue", label: "Sin señal" },
  ok: { color: "green", label: "OK" },
};

function errMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "response" in e) {
    const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
    if (msg) return msg;
  }
  return fallback;
}

function colTitle(short: string, full: string) {
  return (
    <Tooltip title={full}>
      <span style={{ cursor: "default" }}>{short}</span>
    </Tooltip>
  );
}

function statusTag(status: string | null) {
  if (!status) return null;
  const activo = status.toUpperCase() === "ACTIVE";
  return (
    <Tag color={activo ? "green" : "default"} style={{ marginInlineStart: 8 }}>
      {activo ? "Activo" : status.toLowerCase()}
    </Tag>
  );
}

/** Columnas del desglose día a día que se abre dentro de cada fila. */
const dailyColumns: ColumnsType<AdDailyRow> = [
  { title: "Día", dataIndex: "ymd", key: "d", width: 110, fixed: "left" },
  { title: "Gasto", dataIndex: "spend", key: "sp", align: "right", width: 120, render: fmtMoney },
  { title: "Impr.", dataIndex: "impressions", key: "im", align: "right", width: 100, render: fmtInteger },
  {
    title: "CTR",
    dataIndex: "ctr",
    key: "ctr",
    align: "right",
    width: 90,
    render: (v: number | null) => fmtPercentPoints(v),
  },
  { title: "CPM", dataIndex: "cpm", key: "cpm", align: "right", width: 110, render: fmtMoney },
  { title: "CPC", dataIndex: "cpc", key: "cpc", align: "right", width: 110, render: fmtMoney },
  { title: "Clics", dataIndex: "clicks", key: "cl", align: "right", width: 90, render: fmtInteger },
  {
    title: "Conver.",
    dataIndex: "conversations",
    key: "cv",
    align: "right",
    width: 90,
    render: fmtInteger,
  },
  { title: "Compras", dataIndex: "purchases", key: "pu", align: "right", width: 95, render: fmtInteger },
  {
    title: "Costo/compra",
    dataIndex: "costPerPurchase",
    key: "cpp",
    align: "right",
    width: 130,
    render: (v: number | null) => (v == null ? "—" : fmtMoney(v)),
  },
];

export function AdsPage() {
  const canModule = usePermission("moduleAnuncios");
  const canImport = usePermission("actionImportarAnuncios");

  const [hierarchy, setHierarchy] = useState<AdsHierarchy | null>(null);
  const [appOptions, setAppOptions] = useState<MetaAdsAppOption[]>([]);
  const [userOptions, setUserOptions] = useState<MetaAdsSystemUserOption[]>([]);

  const [level, setLevel] = useState<AdLevel>("ad");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>([dayjs().subtract(7, "day"), dayjs().subtract(1, "day")]);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [adSetIds, setAdSetIds] = useState<string[]>([]);
  const [cpaObjetivo, setCpaObjetivo] = useState<number | null>(null);
  const [showDaily, setShowDaily] = useState(true);

  const [data, setData] = useState<AdMetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const [importAppId, setImportAppId] = useState<string | undefined>();
  const [importUserId, setImportUserId] = useState<string | undefined>();
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const loadHierarchy = useCallback(async () => {
    try {
      setHierarchy(await fetchAdsHierarchy());
    } catch {
      message.error("No se pudo cargar la lista de cuentas y campañas.");
    }
  }, []);

  const loadOptions = useCallback(async () => {
    if (!canImport) return;
    try {
      setAppOptions(await fetchMetaAdsAppOptions());
    } catch {
      /* el import puede funcionar con el par por defecto */
    }
  }, [canImport]);

  useEffect(() => {
    if (!canModule) return;
    void loadHierarchy();
    void loadOptions();
  }, [canModule, loadHierarchy, loadOptions]);

  useEffect(() => {
    if (!canImport) return;
    let cancelled = false;
    void (async () => {
      try {
        const opts = await fetchMetaAdsSystemUserOptions(importAppId);
        if (!cancelled) setUserOptions(opts);
      } catch {
        if (!cancelled) setUserOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canImport, importAppId]);

  const loadMetrics = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    try {
      const res = await fetchAdMetrics({
        desde: range[0].format("YYYY-MM-DD"),
        hasta: range[1].format("YYYY-MM-DD"),
        level,
        daily: showDaily,
        cpaObjetivo,
        advertisingAccountIds: accountIds,
        campaignIds,
        adSetIds,
      });
      setData(res);
    } catch (e) {
      message.error(errMessage(e, "No se pudieron cargar las métricas de anuncios."));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range, level, showDaily, cpaObjetivo, accountIds, campaignIds, adSetIds]);

  useEffect(() => {
    if (canModule) void loadMetrics();
  }, [canModule, loadMetrics]);

  const handleImport = async () => {
    if (!range) {
      message.warning("Selecciona un rango de fechas.");
      return;
    }
    if (accountIds.length === 0) {
      message.warning("Elige al menos una cuenta publicitaria para importar.");
      return;
    }
    setImporting(true);
    setImportSummary(null);
    setImportErrors([]);
    try {
      const res = await importAdsFromMetaApi({
        advertisingAccountIds: accountIds,
        desde: range[0].format("YYYY-MM-DD"),
        hasta: range[1].format("YYYY-MM-DD"),
        metaAdsAppId: importAppId ?? null,
        metaAdsSystemUserId: importUserId ?? null,
      });
      const t = res.totals;
      setImportSummary(
        `${t.adMetricsWritten} fila(s) anuncio × día · ${t.adsCreated} anuncio(s) nuevo(s) · ` +
          `${t.adSetsCreated} conjunto(s) · ${t.campaignsCreated} campaña(s) · ` +
          `${t.campaignMetricsWritten} fila(s) de nivel campaña actualizadas para CPA.`,
      );
      const allErrors = [...res.errors, ...res.results.flatMap((r) => r.errors)];
      setImportErrors(allErrors);
      message.success("Import de anuncios terminado.");
      await loadHierarchy();
      await loadMetrics();
    } catch (e) {
      message.error(errMessage(e, "No se pudo importar desde la API de Meta."));
    } finally {
      setImporting(false);
    }
  };

  const accountOptions = useMemo(
    () => (hierarchy?.accounts ?? []).map((a) => ({ value: a.id, label: a.name })),
    [hierarchy],
  );

  const campaignOptions = useMemo(() => {
    const list = hierarchy?.campaigns ?? [];
    const filtered = accountIds.length
      ? list.filter((c) => c.advertisingAccountId && accountIds.includes(c.advertisingAccountId))
      : list;
    return filtered.map((c) => ({ value: c.id, label: c.name }));
  }, [hierarchy, accountIds]);

  const adSetOptions = useMemo(() => {
    const list = hierarchy?.adSets ?? [];
    const filtered = campaignIds.length ? list.filter((s) => campaignIds.includes(s.campaignId)) : list;
    return filtered.map((s) => ({ value: s.id, label: s.name }));
  }, [hierarchy, campaignIds]);

  const columns: ColumnsType<AdNodeRow> = useMemo(() => {
    const nameTitle =
      level === "campaign" ? "Campaña" : level === "adset" ? "Conjunto" : "Anuncio";

    const cols: ColumnsType<AdNodeRow> = [
      {
        title: nameTitle,
        dataIndex: "name",
        key: "name",
        width: 300,
        fixed: "left",
        render: (name: string, row) => (
          <div>
            <div>
              <Text strong>{name}</Text>
              {statusTag(row.effectiveStatus)}
            </div>
            {level !== "campaign" && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {level === "ad" ? `${row.campaignName} › ${row.adSetName}` : row.campaignName}
              </Text>
            )}
          </div>
        ),
      },
      {
        title: colTitle("Veredicto", "Semáforo de descarte según el CPA objetivo y el CTR de sus hermanos"),
        dataIndex: "verdict",
        key: "verdict",
        width: 130,
        render: (v: AdVerdict | null) => {
          if (!v) return <Text type="secondary">—</Text>;
          const style = VERDICT_STYLE[v.action];
          return (
            <Tooltip title={v.reason}>
              <Tag color={style.color}>{style.label}</Tag>
            </Tooltip>
          );
        },
      },
      { title: "Gasto", dataIndex: "spend", key: "spend", align: "right", width: 130, render: fmtMoney },
      {
        title: colTitle("CTR", "Clics ÷ impresiones. La métrica de «¿llama la atención?»; madura en ~24 h."),
        dataIndex: "ctr",
        key: "ctr",
        align: "right",
        width: 95,
        render: (v: number | null) => fmtPercentPoints(v),
      },
      {
        title: colTitle("CPM", "Costo por mil impresiones. Si sube es presión de subasta o audiencia, no el creativo."),
        dataIndex: "cpm",
        key: "cpm",
        align: "right",
        width: 120,
        render: fmtMoney,
      },
      { title: "CPC", dataIndex: "cpc", key: "cpc", align: "right", width: 115, render: fmtMoney },
      {
        title: colTitle("Impr.", "Impresiones"),
        dataIndex: "impressions",
        key: "im",
        align: "right",
        width: 110,
        render: fmtInteger,
      },
      { title: "Clics", dataIndex: "clicks", key: "cl", align: "right", width: 95, render: fmtInteger },
      {
        title: colTitle("Conver.", "Conversaciones de mensajes iniciadas"),
        dataIndex: "conversations",
        key: "cv",
        align: "right",
        width: 100,
        render: fmtInteger,
      },
      {
        title: colTitle("Costo/conv.", "Gasto ÷ conversaciones iniciadas"),
        dataIndex: "costPerConversation",
        key: "cpcv",
        align: "right",
        width: 130,
        render: (v: number | null) => (v == null ? "—" : fmtMoney(v)),
      },
      {
        title: colTitle("Compras", "Compras según el pixel de Meta, NO pedidos entregados de Dropi"),
        dataIndex: "purchases",
        key: "pu",
        align: "right",
        width: 100,
        render: fmtInteger,
      },
      {
        title: colTitle("Costo/compra", "Gasto ÷ compras del pixel"),
        dataIndex: "costPerPurchase",
        key: "cpp",
        align: "right",
        width: 135,
        render: (v: number | null) => (v == null ? "—" : fmtMoney(v)),
      },
      {
        title: colTitle("Días", "Días con datos dentro del rango"),
        dataIndex: "daysWithData",
        key: "dd",
        align: "right",
        width: 80,
        render: fmtInteger,
      },
    ];
    return cols;
  }, [level]);

  if (!canModule) {
    return <Alert type="warning" showIcon message="No tienes acceso al módulo Anuncios." />;
  }

  const totals = data?.totals;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          <ExperimentOutlined /> Anuncios
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          La jerarquía cuenta → campaña → conjunto → anuncio tal como la ves en Meta, con desglose día a día.
          Sirve para testear creativos rápido: el CTR te dice en 24 h si un anuncio llama la atención, mucho
          antes de saber si el pedido se entrega.
        </Paragraph>
      </div>

      <Card size="small" title="Traer desde la API de Meta">
        {!canImport ? (
          <Alert
            type="info"
            showIcon
            message="Puedes consultar los anuncios ya importados, pero no traer datos nuevos desde Meta."
          />
        ) : (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Una sola llamada por cuenta"
              description={
                <>
                  A diferencia de Campañas Meta, aquí el rango completo se trae en una única consulta por
                  cuenta (<Text code>time_increment=1</Text>), así que no hay espera día por día. El import
                  también actualiza el gasto de nivel campaña que consume CPA experimental, para que no
                  queden dos cifras distintas.
                </>
              }
            />
            <Row gutter={[12, 12]} align="bottom">
              <Col xs={24} md={8}>
                <Text type="secondary">App Meta (opcional)</Text>
                <Select
                  allowClear
                  style={{ width: "100%" }}
                  placeholder="Par por defecto"
                  value={importAppId}
                  onChange={(v) => {
                    setImportAppId(v);
                    setImportUserId(undefined);
                  }}
                  options={appOptions.map((a) => ({ value: a.id, label: a.name }))}
                />
              </Col>
              <Col xs={24} md={8}>
                <Text type="secondary">Usuario del sistema (opcional)</Text>
                <Select
                  allowClear
                  style={{ width: "100%" }}
                  placeholder="Par por defecto"
                  value={importUserId}
                  onChange={setImportUserId}
                  options={userOptions.map((u) => ({ value: u.id, label: u.name }))}
                />
              </Col>
              <Col xs={24} md={8}>
                <Button
                  type="primary"
                  icon={<CloudDownloadOutlined />}
                  loading={importing}
                  onClick={handleImport}
                  block
                >
                  Traer anuncios del rango
                </Button>
              </Col>
            </Row>
            {importSummary && (
              <Alert type="success" showIcon style={{ marginTop: 16 }} message={importSummary} />
            )}
            {importErrors.length > 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 12 }}
                message="Avisos del import"
                description={
                  <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                    {importErrors.slice(0, 8).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                }
              />
            )}
          </>
        )}
      </Card>

      <Card size="small">
        <Row gutter={[12, 12]} align="bottom">
          <Col xs={24} md={7}>
            <Text type="secondary">Rango</Text>
            <RangePicker
              style={{ width: "100%" }}
              value={range}
              onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
              allowClear={false}
            />
          </Col>
          <Col xs={24} md={4}>
            <Text type="secondary">Nivel</Text>
            <Select
              style={{ width: "100%" }}
              value={level}
              onChange={(v) => setLevel(v)}
              options={LEVEL_OPTIONS}
            />
          </Col>
          <Col xs={24} md={5}>
            <Text type="secondary">Cuentas</Text>
            <Select
              mode="multiple"
              allowClear
              style={{ width: "100%" }}
              placeholder="Todas"
              value={accountIds}
              onChange={(v) => {
                setAccountIds(v);
                setCampaignIds([]);
                setAdSetIds([]);
              }}
              options={accountOptions}
              maxTagCount="responsive"
              optionFilterProp="label"
            />
          </Col>
          <Col xs={24} md={4}>
            <Tooltip title="Tu CPA máximo tolerable para este producto. Sin esto no se calcula el semáforo de descarte.">
              <Text type="secondary">CPA objetivo</Text>
            </Tooltip>
            <InputNumber
              style={{ width: "100%" }}
              min={0}
              step={1000}
              placeholder="ej. 20000"
              value={cpaObjetivo ?? undefined}
              onChange={(v) => setCpaObjetivo(v == null ? null : Number(v))}
            />
          </Col>
          <Col xs={24} md={4}>
            <Space>
              <Switch checked={showDaily} onChange={setShowDaily} />
              <Text type="secondary">Día a día</Text>
              <Button icon={<ReloadOutlined />} onClick={() => void loadMetrics()} loading={loading} />
            </Space>
          </Col>
        </Row>

        {(campaignOptions.length > 0 || adSetOptions.length > 0) && (
          <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
            <Col xs={24} md={12}>
              <Text type="secondary">Campañas</Text>
              <Select
                mode="multiple"
                allowClear
                style={{ width: "100%" }}
                placeholder="Todas"
                value={campaignIds}
                onChange={(v) => {
                  setCampaignIds(v);
                  setAdSetIds([]);
                }}
                options={campaignOptions}
                maxTagCount="responsive"
                optionFilterProp="label"
              />
            </Col>
            <Col xs={24} md={12}>
              <Text type="secondary">Conjuntos</Text>
              <Select
                mode="multiple"
                allowClear
                style={{ width: "100%" }}
                placeholder="Todos"
                value={adSetIds}
                onChange={setAdSetIds}
                options={adSetOptions}
                maxTagCount="responsive"
                optionFilterProp="label"
              />
            </Col>
          </Row>
        )}
      </Card>

      {data?.notes.length ? (
        <Alert
          type="info"
          showIcon
          message="Cómo leer esta tabla"
          description={
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {data.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
              <li>
                Las compras son las del pixel de Meta. Los pedidos de Dropi no guardan de qué anuncio
                vinieron, así que la rentabilidad real sigue viviendo en CPA experimental por producto.
              </li>
            </ul>
          }
        />
      ) : null}

      <Card
        size="small"
        title={
          totals ? (
            <Space split={<Divider type="vertical" />} wrap>
              <span>
                Gasto <Text strong>{fmtMoney(totals.spend)}</Text>
              </span>
              <span>
                CTR <Text strong>{fmtPercentPoints(totals.ctr)}</Text>
              </span>
              <span>
                Conversaciones <Text strong>{fmtInteger(totals.conversations)}</Text>
              </span>
              <span>
                Compras <Text strong>{fmtInteger(totals.purchases)}</Text>
              </span>
              <span>
                Costo/compra{" "}
                <Text strong>{totals.costPerPurchase == null ? "—" : fmtMoney(totals.costPerPurchase)}</Text>
              </span>
            </Space>
          ) : (
            "Resultados"
          )
        }
      >
        <Table<AdNodeRow>
          rowKey="key"
          size="small"
          loading={loading}
          dataSource={data?.rows ?? []}
          columns={columns}
          scroll={{ x: 1700 }}
          pagination={{ pageSize: 50, showSizeChanger: true }}
          expandable={
            showDaily
              ? {
                  rowExpandable: (row) => (row.daily?.length ?? 0) > 0,
                  expandedRowRender: (row) => (
                    <Table<AdDailyRow>
                      rowKey="ymd"
                      size="small"
                      dataSource={row.daily ?? []}
                      columns={dailyColumns}
                      pagination={false}
                      scroll={{ x: 1100 }}
                    />
                  ),
                }
              : undefined
          }
          locale={{
            emptyText:
              "Sin anuncios en este rango. Trae los datos desde la API de Meta con el bloque de arriba.",
          }}
        />
      </Card>
    </Space>
  );
}
