import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Divider,
  Empty,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CloudDownloadOutlined,
  ExperimentOutlined,
  FileExcelOutlined,
  LinkOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { Link } from "react-router-dom";
import {
  dryRunUnifiedImport,
  fetchCatalogProducts,
  fetchMetaCampaignAdvertisingAccounts,
  fetchProductAdvertisingAccounts,
  previewUnifiedImport,
  runUnifiedImport,
  type UnifiedImportBody,
} from "../api";
import { usePermission } from "../hooks/usePermission";
import { fmtInteger, fmtMoney } from "../utils/format";
import { parseShopifySessionsJsonl } from "../utils/parseShopifySessionsJsonl";
import type {
  AdvertisingAccount,
  CatalogProduct,
  UnifiedDryRunResponse,
  UnifiedImportResponse,
  UnifiedImportScopeInput,
  UnifiedPreviewResponse,
} from "../types";

const { Title, Text, Paragraph } = Typography;

/** Igual que `normalizeCampaignMapKey` del backend: los IDs viajan sin espacios. */
function campaignKey(id: string): string {
  return String(id).trim().replace(/\s+/g, "");
}

function errorMessage(e: unknown): string {
  const withResponse = e as { response?: { data?: { message?: string } }; message?: string };
  return withResponse?.response?.data?.message ?? withResponse?.message ?? "Error inesperado.";
}


function UnifiedImportPage() {
  const puedeApi = usePermission("actionImportUnificadoApi");
  const puedeArchivo = usePermission("actionImportUnificadoArchivo");

  const [fuente, setFuente] = useState<"api" | "archivo">("api");

  const [scopeKind, setScopeKind] = useState<"product" | "all">("product");
  const [productos, setProductos] = useState<CatalogProduct[]>([]);
  const [productId, setProductId] = useState<string | undefined>();
  const [cuentas, setCuentas] = useState<AdvertisingAccount[]>([]);
  const [cuentasProducto, setCuentasProducto] = useState<string[] | null>(null);
  const [cuentasElegidas, setCuentasElegidas] = useState<string[]>([]);

  const [rango, setRango] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(7, "day"),
    dayjs().subtract(1, "day"),
  ]);

  const [preview, setPreview] = useState<UnifiedPreviewResponse | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [simulacion, setSimulacion] = useState<UnifiedDryRunResponse | null>(null);
  const [resultado, setResultado] = useState<UnifiedImportResponse | null>(null);

  const [usarShopify, setUsarShopify] = useState(false);
  const [modalShopify, setModalShopify] = useState(false);
  const [textoShopify, setTextoShopify] = useState("");
  const [sesionesPorDia, setSesionesPorDia] = useState<Record<string, number>>({});
  const [repartoManual, setRepartoManual] = useState<Record<string, number>>({});

  const [cargando, setCargando] = useState<"preview" | "dry" | "import" | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [p, c] = await Promise.all([
          fetchCatalogProducts(),
          fetchMetaCampaignAdvertisingAccounts(),
        ]);
        setProductos(p.filter((x) => x.isActive !== false));
        setCuentas(c);
      } catch (e) {
        message.error(errorMessage(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (scopeKind !== "product" || !productId) {
      setCuentasProducto(null);
      return;
    }
    void (async () => {
      try {
        const list = await fetchProductAdvertisingAccounts(productId);
        setCuentasProducto(list.map((a) => a.id));
      } catch {
        setCuentasProducto([]);
      }
    })();
  }, [scopeKind, productId]);

  /** Cualquier cambio de configuración invalida lo ya consultado. */
  const reset = useCallback(() => {
    setPreview(null);
    setSeleccion([]);
    setSimulacion(null);
    setResultado(null);
    setRepartoManual({});
  }, []);


  const scope: UnifiedImportScopeInput = useMemo(() => {
    const accounts =
      scopeKind === "product" && cuentasElegidas.length === 0
        ? undefined
        : cuentasElegidas.length > 0
          ? cuentasElegidas
          : undefined;
    if (scopeKind === "product") {
      return { kind: "product", catalogProductId: productId ?? "", advertisingAccountIds: accounts };
    }
    return { kind: "all", advertisingAccountIds: accounts };
  }, [scopeKind, productId, cuentasElegidas]);

  const cuerpoBase = useCallback(
    (extra?: Partial<UnifiedImportBody>): UnifiedImportBody => ({
      scope,
      desde: rango[0].format("YYYY-MM-DD"),
      hasta: rango[1].format("YYYY-MM-DD"),
      ...extra,
    }),
    [scope, rango],
  );

  const puedeConsultar =
    (scopeKind === "all" || Boolean(productId)) && Boolean(rango[0]) && Boolean(rango[1]);

  const verCampañas = useCallback(async () => {
    setCargando("preview");
    try {
      const r = await previewUnifiedImport(cuerpoBase());
      setPreview(r);
      setSeleccion(r.defaultSelectedCampaignIds.map(campaignKey));
      setSimulacion(null);
      setResultado(null);
      if (r.campaigns.length === 0) {
        message.info("Meta no devolvió campañas con actividad en ese rango.");
      }
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setCargando(null);
    }
  }, [cuerpoBase]);

  /** Reparto proporcional al gasto de cada campaña ese día. */
  const repartoAutomatico = useMemo(() => {
    if (!simulacion || Object.keys(sesionesPorDia).length === 0) return {};
    const porDia = new Map<string, { key: string; spend: number }[]>();
    for (const row of simulacion.rows) {
      if (row.spend <= 0) continue;
      const lista = porDia.get(row.ymd) ?? [];
      lista.push({ key: campaignKey(row.externalCampaignId), spend: row.spend });
      porDia.set(row.ymd, lista);
    }

    const out: Record<string, number> = {};
    for (const [ymd, lista] of porDia) {
      const total = sesionesPorDia[ymd];
      if (!total) continue;
      const gastoDia = lista.reduce((n, c) => n + c.spend, 0);
      if (gastoDia <= 0) continue;
      let repartido = 0;
      lista.forEach((c, i) => {
        const valor =
          i === lista.length - 1
            ? total - repartido
            : Math.round((c.spend / gastoDia) * total);
        repartido += valor;
        out[`${ymd}|${c.key}`] = Math.max(0, valor);
      });
    }
    return out;
  }, [simulacion, sesionesPorDia]);

  const reparto = useMemo(
    () => ({ ...repartoAutomatico, ...repartoManual }),
    [repartoAutomatico, repartoManual],
  );

  const shopifyPayload = useMemo(() => {
    if (!usarShopify) return undefined;
    const out: Record<string, Record<string, number>> = {};
    for (const [k, v] of Object.entries(reparto)) {
      const [ymd, campaña] = k.split("|");
      if (!ymd || !campaña) continue;
      out[ymd] = out[ymd] ?? {};
      out[ymd][campaña] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }, [usarShopify, reparto]);

  const simular = useCallback(async () => {
    setCargando("dry");
    try {
      const r = await dryRunUnifiedImport(
        cuerpoBase({
          runId: preview?.runId,
          scope: { ...scope, selectedCampaignIds: seleccion } as UnifiedImportScopeInput,
          useShopifySessions: usarShopify,
          shopifySessionsByDayAndCampaign: shopifyPayload,
        }),
      );
      setSimulacion(r);
      setResultado(null);
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setCargando(null);
    }
  }, [cuerpoBase, preview, scope, seleccion, usarShopify, shopifyPayload]);

  const importar = useCallback(() => {
    const filas = simulacion?.totals.campaignDayRows ?? 0;
    Modal.confirm({
      title: "Confirmar import",
      icon: <CloudDownloadOutlined />,
      content: (
        <>
          <Paragraph style={{ marginBottom: 8 }}>
            Se escribirán <b>{fmtInteger(filas)}</b> filas de campaña-día
            {simulacion ? (
              <>
                {" "}
                por <b>{fmtMoney(simulacion.totals.spend)}</b> de gasto
              </>
            ) : null}
            .
          </Paragraph>
          {seleccion.length > 0 && scopeKind === "product" ? (
            <Paragraph style={{ marginBottom: 0 }}>
              Se vincularán <b>{seleccion.length}</b> campaña(s) al producto elegido.
            </Paragraph>
          ) : null}
        </>
      ),
      okText: "Importar",
      cancelText: "Cancelar",
      onOk: async () => {
        setCargando("import");
        try {
          const r = await runUnifiedImport(
            cuerpoBase({
              runId: preview?.runId,
              scope: { ...scope, selectedCampaignIds: seleccion } as UnifiedImportScopeInput,
              useShopifySessions: usarShopify,
              shopifySessionsByDayAndCampaign: shopifyPayload,
            }),
          );
          setResultado(r);
          message.success(
            `Import terminado: ${fmtInteger(r.counters.campaignMetricsWritten)} filas de campaña-día.`,
          );
        } catch (e) {
          message.error(errorMessage(e));
        } finally {
          setCargando(null);
        }
      },
    });
  }, [cuerpoBase, preview, scope, seleccion, scopeKind, simulacion, usarShopify, shopifyPayload]);

  const aplicarShopify = useCallback(() => {
    const r = parseShopifySessionsJsonl(textoShopify);
    if (!r.ok) {
      message.error(r.message);
      return;
    }
    setSesionesPorDia(Object.fromEntries(r.byDate));
    setRepartoManual({});
    setModalShopify(false);
    message.success(`${r.parsedCount} día(s) de sesiones cargados.`);
  }, [textoShopify]);

  if (!puedeApi && !puedeArchivo) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Sin permisos de import"
        description="Tu usuario puede ver este módulo pero no tiene ninguna fuente de import habilitada. Pídele a un administrador el permiso de API de Meta o el de archivo."
      />
    );
  }

  const columnasCampañas: ColumnsType<UnifiedPreviewResponse["campaigns"][number]> = [
    {
      title: "Campaña",
      dataIndex: "displayName",
      render: (v: string | null, row) => (
        <Space direction="vertical" size={0}>
          <Text>{v ?? <Text type="secondary">(sin nombre)</Text>}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {row.externalCampaignId}
          </Text>
        </Space>
      ),
    },
    {
      title: "Días",
      dataIndex: "days",
      width: 90,
      align: "right",
      render: (v: number) => fmtInteger(v),
    },
    {
      title: "Gasto en el rango",
      dataIndex: "spend",
      width: 170,
      align: "right",
      render: (v: number) => fmtMoney(v),
      sorter: (a, b) => a.spend - b.spend,
      defaultSortOrder: "descend",
    },
    {
      title: "Producto",
      dataIndex: "linkedToProduct",
      width: 130,
      render: (v: boolean) =>
        v ? <Tag color="green">Ya vinculada</Tag> : <Tag>Sin vincular</Tag>,
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message="Módulo en pruebas"
        description="Escribe en las mismas tablas que Campañas Meta y Anuncios. Úsalo en paralelo y compara antes de dejar de usar los otros dos."
      />

      <Card>
        <Title level={4} style={{ marginTop: 0 }}>
          1 · Qué quieres traer
        </Title>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Text strong>Alcance</Text>
            <div style={{ marginTop: 8 }}>
              <Radio.Group
                value={scopeKind}
                onChange={(e) => {
                  setScopeKind(e.target.value);
                  setCuentasElegidas([]);
                  reset();
                }}
              >
                <Radio.Button value="product">Un producto</Radio.Button>
                <Radio.Button value="all">Todo</Radio.Button>
              </Radio.Group>
            </div>
          </Col>

          {scopeKind === "product" ? (
            <Col xs={24} md={8}>
              <Text strong>Producto</Text>
              <Select
                style={{ width: "100%", marginTop: 8 }}
                placeholder="Elige un producto"
                showSearch
                optionFilterProp="label"
                value={productId}
                onChange={(v) => {
                  setProductId(v);
                  setCuentasElegidas([]);
                  reset();
                }}
                options={productos.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Col>
          ) : null}

          <Col xs={24} md={8}>
            <Text strong>Cuentas publicitarias</Text>
            <Select
              mode="multiple"
              allowClear
              style={{ width: "100%", marginTop: 8 }}
              placeholder={
                scopeKind === "product" && cuentasProducto?.length
                  ? "Las del producto"
                  : "Todas las de la empresa"
              }
              value={cuentasElegidas}
              onChange={(v) => {
                setCuentasElegidas(v);
                reset();
              }}
              options={cuentas.map((c) => ({
                value: c.id,
                label: c.businessName ? `${c.businessName} · ${c.metaAccountId}` : c.metaAccountId,
              }))}
            />
            {scopeKind === "product" && cuentasProducto?.length === 0 ? (
              <Text type="warning" style={{ fontSize: 12 }}>
                Este producto no tiene cuentas asignadas: se consultarán todas.
              </Text>
            ) : null}
          </Col>
        </Row>

        <Divider />

        <Row gutter={[16, 16]} align="bottom">
          {puedeApi && puedeArchivo ? (
            <Col xs={24} md={8}>
              <Text strong>Fuente</Text>
              <div style={{ marginTop: 8 }}>
                <Segmented
                  value={fuente}
                  onChange={(v) => setFuente(v as "api" | "archivo")}
                  options={[
                    { label: "API de Meta", value: "api", icon: <CloudDownloadOutlined /> },
                    { label: "Archivo", value: "archivo", icon: <FileExcelOutlined /> },
                  ]}
                />
              </div>
            </Col>
          ) : null}

          <Col xs={24} md={10}>
            <Text strong>Rango de fechas</Text>
            <div style={{ marginTop: 8 }}>
              <DatePicker.RangePicker
                style={{ width: "100%" }}
                value={rango}
                allowClear={false}
                onChange={(v) => {
                  if (v && v[0] && v[1]) {
                    setRango([v[0], v[1]]);
                    reset();
                  }
                }}
                disabledDate={(d) => d.isAfter(dayjs(), "day")}
              />
            </div>
          </Col>

          <Col xs={24} md={6}>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              block
              disabled={!puedeConsultar || fuente === "archivo"}
              loading={cargando === "preview"}
              onClick={() => void verCampañas()}
            >
              Ver campañas
            </Button>
          </Col>
        </Row>

        {fuente === "archivo" ? (
          <Alert
            style={{ marginTop: 16 }}
            type="info"
            showIcon
            message="El import por archivo llega en el siguiente paso"
            description="De momento usa la API de Meta. Cuando esté, pasará por la misma fusión de snapshot, así que subir un Excel dejará de borrar lo que trajo la API."
          />
        ) : null}
      </Card>

      {preview ? (
        <Card>
          <Title level={4} style={{ marginTop: 0 }}>
            2 · Qué campañas entran
          </Title>

          <Space direction="vertical" size="small" style={{ width: "100%", marginBottom: 12 }}>
            <Text type="secondary">
              {fmtInteger(preview.accountsQueried)} cuenta(s) consultada(s) ·{" "}
              {fmtInteger(preview.adRowsFetched)} filas de anuncio-día
              {preview.chunks.length > 1 ? ` · ${preview.chunks.length} tramos` : ""}
            </Text>
            {preview.warnings.map((w, i) => (
              <Alert key={i} type="warning" showIcon message={w} />
            ))}
            {preview.errors.map((e, i) => (
              <Alert key={i} type="error" showIcon message={e} />
            ))}
            {scopeKind === "product" ? (
              <Alert
                type="info"
                showIcon
                message="Solo se vincularán al producto las campañas que marques aquí. Las demás se importan igual y aparecen al final como «sin vincular»."
              />
            ) : null}
          </Space>

          <Table
            rowKey={(r) => campaignKey(r.externalCampaignId)}
            size="small"
            dataSource={preview.campaigns}
            columns={columnasCampañas}
            pagination={false}
            scroll={{ x: true, y: 360 }}
            rowSelection={{
              selectedRowKeys: seleccion,
              onChange: (keys) => setSeleccion(keys.map(String)),
            }}
          />

          <Divider />

          <Space wrap>
            <Checkbox
              checked={usarShopify}
              onChange={(e) => {
                setUsarShopify(e.target.checked);
                setSimulacion(null);
              }}
            >
              Aplicar sesiones Shopify manuales
            </Checkbox>
            {usarShopify ? (
              <Button size="small" onClick={() => setModalShopify(true)}>
                Pegar sesiones ({Object.keys(sesionesPorDia).length} día(s))
              </Button>
            ) : null}
            <Button
              type="primary"
              icon={<ExperimentOutlined />}
              loading={cargando === "dry"}
              disabled={seleccion.length === 0}
              onClick={() => void simular()}
            >
              Simular sin escribir
            </Button>
          </Space>
        </Card>
      ) : null}

      {simulacion ? (
        <Card>
          <Title level={4} style={{ marginTop: 0 }}>
            3 · Qué cambiaría
          </Title>

          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Statistic
                title="Filas campaña-día"
                value={simulacion.totals.campaignDayRows}
                formatter={(v) => fmtInteger(Number(v))}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Filas nuevas" value={simulacion.totals.newRows} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="Gasto que se escribiría"
                value={simulacion.totals.spend}
                formatter={(v) => fmtMoney(Number(v))}
              />
            </Col>
            <Col xs={12} md={6}>
              <Tooltip title="Diferencia contra el gasto que hay hoy guardado para esas mismas filas.">
                <Statistic
                  title="Diferencia vs. lo guardado"
                  value={simulacion.totals.spendDelta}
                  valueStyle={{
                    color:
                      Math.abs(simulacion.totals.spendDelta) < 1
                        ? undefined
                        : simulacion.totals.spendDelta > 0
                          ? "#cf1322"
                          : "#3f8600",
                  }}
                  formatter={(v) => fmtMoney(Number(v))}
                />
              </Tooltip>
            </Col>
          </Row>

          {simulacion.warnings.map((w, i) => (
            <Alert key={i} style={{ marginTop: 12 }} type="warning" showIcon message={w} />
          ))}
          {simulacion.errors.map((e, i) => (
            <Alert key={i} style={{ marginTop: 12 }} type="error" showIcon message={e} />
          ))}

          {usarShopify && Object.keys(reparto).length > 0 ? (
            <>
              <Divider orientationMargin={0}>Sesiones Shopify por día y campaña</Divider>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="Repartidas en proporción al gasto de cada campaña ese día. Puedes corregir cualquier celda antes de importar."
              />
              <Table
                size="small"
                rowKey={(r) => r.key}
                pagination={{ pageSize: 20, size: "small" }}
                dataSource={Object.entries(reparto).map(([key, valor]) => {
                  const [ymd, campaña] = key.split("|");
                  return { key, ymd, campaña, valor };
                })}
                columns={[
                  { title: "Día", dataIndex: "ymd", width: 120 },
                  { title: "Campaña", dataIndex: "campaña" },
                  {
                    title: "Total del día",
                    dataIndex: "ymd",
                    width: 130,
                    align: "right",
                    render: (ymd: string) => fmtInteger(sesionesPorDia[ymd] ?? 0),
                  },
                  {
                    title: "Sesiones",
                    dataIndex: "valor",
                    width: 130,
                    align: "right",
                    render: (v: number, row) => (
                      <InputNumber
                        size="small"
                        min={0}
                        value={v}
                        onChange={(nv) =>
                          setRepartoManual((prev) => ({ ...prev, [row.key]: Number(nv ?? 0) }))
                        }
                      />
                    ),
                  },
                ]}
              />
            </>
          ) : null}

          <Divider />
          <Button
            type="primary"
            danger
            icon={<CloudDownloadOutlined />}
            loading={cargando === "import"}
            disabled={!puedeApi || simulacion.totals.campaignDayRows === 0}
            onClick={importar}
          >
            Importar de verdad
          </Button>
          {!puedeApi ? (
            <Text type="secondary" style={{ marginLeft: 12 }}>
              Tu usuario puede simular pero no importar desde la API.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {resultado ? (
        <Card>
          <Title level={4} style={{ marginTop: 0 }}>
            Resultado
          </Title>
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Statistic title="Campañas" value={resultado.counters.campaignsTouched} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Conjuntos" value={resultado.counters.adSetsTouched} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Anuncios" value={resultado.counters.adsTouched} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Vínculos creados" value={resultado.counters.linksCreated} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="Filas anuncio-día"
                value={resultado.counters.adMetricsWritten}
                formatter={(v) => fmtInteger(Number(v))}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="Filas campaña-día"
                value={resultado.counters.campaignMetricsWritten}
                formatter={(v) => fmtInteger(Number(v))}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="Gasto importado"
                value={resultado.spend}
                formatter={(v) => fmtMoney(Number(v))}
              />
            </Col>
          </Row>

          {resultado.errors.map((e, i) => (
            <Alert key={i} style={{ marginTop: 12 }} type="error" showIcon message={e} />
          ))}

          {resultado.linkConflicts.length > 0 ? (
            <>
              <Divider orientationMargin={0}>Conflictos de vínculo</Divider>
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message="Estas campañas ya son de otro producto, así que no se tocaron."
                description="Vincularlas también aquí no movería el gasto: lo contaría dos veces, y subiría el margen de los dos productos."
              />
              <Table
                size="small"
                rowKey="campaignId"
                pagination={false}
                dataSource={resultado.linkConflicts}
                columns={[
                  { title: "Campaña", dataIndex: "displayName", render: (v) => v ?? "(sin nombre)" },
                  { title: "ID de Meta", dataIndex: "externalCampaignId", width: 180 },
                  { title: "Pertenece a", dataIndex: "ownedByProductName", width: 220 },
                ]}
              />
            </>
          ) : null}

          <Divider orientationMargin={0}>Campañas sin producto vinculado</Divider>
          {resultado.unlinkedCampaigns.length === 0 ? (
            <Empty description="Todas las campañas importadas tienen producto." />
          ) : (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="Su gasto suma al total del dashboard, pero no al desglose por producto ni al CPA."
                description={
                  <>
                    Para vincularlas, ve a{" "}
                    <Link to="/app/campanas-meta">
                      <LinkOutlined /> Campañas Meta
                    </Link>
                    .
                  </>
                }
              />
              <Table
                size="small"
                rowKey="campaignId"
                pagination={{ pageSize: 10, size: "small" }}
                dataSource={resultado.unlinkedCampaigns}
                columns={[
                  { title: "Campaña", dataIndex: "displayName", render: (v) => v ?? "(sin nombre)" },
                  { title: "ID de Meta", dataIndex: "externalCampaignId", width: 170 },
                  {
                    title: "Cuenta",
                    dataIndex: "accountName",
                    width: 200,
                    render: (v: string | null, row) => v ?? row.metaAccountId ?? "—",
                  },
                  {
                    title: "Gasto en el rango",
                    dataIndex: "spendInRange",
                    width: 160,
                    align: "right",
                    render: (v: number) => fmtMoney(v),
                  },
                  { title: "Días con gasto", dataIndex: "daysWithSpend", width: 130, align: "right" },
                ]}
              />
            </>
          )}
        </Card>
      ) : null}


      <Modal
        title="Pegar sesiones de Shopify"
        open={modalShopify}
        onCancel={() => setModalShopify(false)}
        onOk={aplicarShopify}
        okText="Aplicar"
        cancelText="Cancelar"
        width={640}
      >
        <Paragraph type="secondary">
          Pega el JSON o JSONL con una fila por día. Se aceptan las claves{" "}
          <Text code>day</Text>/<Text code>date</Text>/<Text code>fecha</Text> y{" "}
          <Text code>sessions</Text>/<Text code>sesiones</Text>.
        </Paragraph>
        <Input.TextArea
          rows={10}
          value={textoShopify}
          onChange={(e) => setTextoShopify(e.target.value)}
          placeholder={'{"day":"2026-08-10","sessions":320}'}
        />
      </Modal>
    </Space>
  );
}

export { UnifiedImportPage };
