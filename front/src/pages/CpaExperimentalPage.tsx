import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ExperimentOutlined, ReloadOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import { fetchCatalogProducts, fetchCpaExperimental, rebuildCpaExperimental } from "../api";
import { usePermission } from "../hooks/usePermission";
import { fmtApiDateIsoYmd } from "../utils/calendarDateLocal";
import { fmtCpaDisplay } from "../utils/cpaDisplay";
import { computeCpaExperimentalTotals } from "../utils/cpaExperimentalTotals";
import { fmtInteger, fmtMoney, fmtPercentPoints, fmtPercentRatio } from "../utils/format";
import type { CatalogProduct, CpaExperimentalRecordRow } from "../types";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return fmtMoney(v);
  const n = Number(v);
  return Number.isFinite(n) ? fmtMoney(n) : String(v);
}

function colTitle(short: string, full: string) {
  return (
    <Tooltip title={full}>
      <span style={{ cursor: "default" }}>{short}</span>
    </Tooltip>
  );
}

export function CpaExperimentalPage() {
  const canModule = usePermission("moduleCpa");
  const canRebuild = usePermission("actionCpaRegistrosCrud");

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productId, setProductId] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [rows, setRows] = useState<CpaExperimentalRecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [lastWarnings, setLastWarnings] = useState<string[]>([]);

  const loadMeta = useCallback(async () => {
    try {
      const plist = await fetchCatalogProducts();
      setProducts(plist.filter((p) => p.isActive));
    } catch {
      message.error("No se pudieron cargar productos.");
    }
  }, []);

  const loadRows = useCallback(async () => {
    if (!productId || !range) return;
    setLoading(true);
    try {
      const list = await fetchCpaExperimental({
        catalogProductId: productId,
        desde: range[0].format("YYYY-MM-DD"),
        hasta: range[1].format("YYYY-MM-DD"),
      });
      setRows(list);
    } catch {
      message.error("No se pudieron cargar filas CPA experimental.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [productId, range]);

  useEffect(() => {
    if (canModule) void loadMeta();
  }, [canModule, loadMeta]);

  useEffect(() => {
    if (productId && range) void loadRows();
    else setRows([]);
  }, [productId, range, loadRows]);

  const handleRebuild = async () => {
    if (!productId || !range) {
      message.warning("Selecciona producto y rango de fechas.");
      return;
    }
    setRebuilding(true);
    setLastWarnings([]);
    try {
      const res = await rebuildCpaExperimental({
        catalogProductId: productId,
        desde: range[0].format("YYYY-MM-DD"),
        hasta: range[1].format("YYYY-MM-DD"),
      });
      setLastWarnings(res.warnings);
      message.success(`CPA experimental: ${res.daysWritten} fila(s) guardadas.`);
      if (res.warnings.length) message.warning(res.warnings.join(" "));
      await loadRows();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "")
          : "";
      message.error(msg || "No se pudo calcular el CPA experimental.");
    } finally {
      setRebuilding(false);
    }
  };

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: `${p.name}${p.sku ? ` (${p.sku})` : ""}` })),
    [products],
  );

  const columns: ColumnsType<CpaExperimentalRecordRow> = useMemo(
    () => [
      { title: colTitle("Semana", "Semana"), dataIndex: "semana", key: "sem", width: 140, ellipsis: true },
      {
        title: colTitle("Fecha", "Fecha"),
        dataIndex: "fecha",
        key: "fecha",
        width: 128,
        render: (v: string) => <span style={{ whiteSpace: "nowrap" }}>{fmtApiDateIsoYmd(v)}</span>,
      },
      { title: colTitle("Producto", "Producto"), dataIndex: "producto", key: "prod", ellipsis: true },
      {
        title: colTitle("Gasto pub.", "Gasto publicitario"),
        dataIndex: "gastoPublicidad",
        key: "gasto",
        width: 120,
        align: "right",
        render: fmtCell,
      },
      {
        title: colTitle("Conv.", "Conversaciones"),
        dataIndex: "conversaciones",
        key: "conv",
        width: 72,
        align: "right",
        render: (n) => (n != null ? fmtInteger(n) : "—"),
      },
      {
        title: colTitle("Total fact.", "Total facturado"),
        dataIndex: "totalFacturado",
        key: "tf",
        width: 120,
        align: "right",
        render: fmtCell,
      },
      {
        title: colTitle("Gan. prom.", "Ganancia promedio"),
        dataIndex: "gananciaPromedio",
        key: "gp",
        width: 110,
        align: "right",
        render: fmtCell,
      },
      {
        title: colTitle("Ventas", "Ventas"),
        dataIndex: "ventas",
        key: "ventas",
        width: 80,
        align: "right",
        render: (n) => (n != null ? fmtInteger(n) : "—"),
      },
      {
        title: colTitle("Ticket prom.", "Ticket promedio de producto"),
        dataIndex: "ticketPromedioProducto",
        key: "ticket",
        width: 110,
        align: "right",
        render: fmtCell,
      },
      {
        title: colTitle("CPA", "Costo por adquisición (CPA)"),
        dataIndex: "cpa",
        key: "cpa",
        width: 100,
        align: "right",
        render: (cpa, row) => {
          const label = fmtCpaDisplay(cpa, row.gastoPublicidad, row.ventas);
          if (label === "Pérdida") return <Text type="danger">{label}</Text>;
          return label;
        },
      },
      {
        title: colTitle("Conv. rate", "Tasa de conversión"),
        dataIndex: "conversionRate",
        key: "cr",
        width: 90,
        align: "right",
        render: (v) => fmtPercentRatio(v),
      },
      {
        title: colTitle("Costo pub.", "Costo publicitario"),
        dataIndex: "costoPublicitario",
        key: "costo",
        width: 100,
        align: "right",
        render: (v) => fmtPercentPoints(v),
      },
      {
        title: colTitle("Rentab.", "Rentabilidad"),
        dataIndex: "rentabilidad",
        key: "rent",
        width: 90,
        align: "right",
        render: (v) => fmtPercentPoints(v),
      },
      {
        title: colTitle("Utilidad apx.", "Utilidad aproximada"),
        dataIndex: "utilidadAproximada",
        key: "util",
        width: 150,
        align: "right",
        render: fmtCell,
      },
    ],
    [],
  );

  const rangeTotals = useMemo(() => computeCpaExperimentalTotals(rows), [rows]);

  if (!canModule) {
    return <Typography.Paragraph>No tienes permiso para el módulo CPA.</Typography.Paragraph>;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>
          <ExperimentOutlined style={{ marginRight: 8 }} />
          CPA experimental
        </Title>
        <Text type="secondary">
          Arma filas CPA por día y producto: suma el gasto y las métricas de <strong>todas las campañas Meta</strong> de
          ese producto (sin desglose por cuenta). Pedidos: ventas, facturación y ganancia{" "}
          <strong>sin cancelados ni rechazados</strong>; conversaciones Meta + sesiones Shopify; gasto como suma del
          «Importe gastado» del Excel Meta importado en Campañas Meta. Las columnas derivadas siguen la plantilla CPA.
        </Text>
      </div>

      <Alert
        type="info"
        showIcon
        message="Cómo se arma el gasto y el CPA"
        description={
          <span>
            El gasto del día sale del Excel de métricas Meta importado en <strong>Campañas Meta</strong> (columna Importe
            gastado), sumando todas las campañas vinculadas a este producto. Si hay métricas pero el Excel no trae importe
            en ninguna fila del día, el gasto queda en cero. Las ventas pueden venir de pedidos Dropi aunque no haya
            campañas.
          </span>
        }
      />

      <Alert
        type="info"
        showIcon
        message="Requisitos"
        description={
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            <li>Variantes Dropi del producto vinculadas en Productos de pedidos.</li>
            <li>Campañas Meta del producto (opcional para gasto y conversaciones).</li>
            <li>Métricas diarias importadas en Campañas Meta (opcional para conversaciones / Shopify).</li>
          </ul>
        }
      />

      <Card title="Calcular rango">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
              Producto catálogo
            </Text>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Producto"
              style={{ width: "100%" }}
              options={productOptions}
              value={productId}
              onChange={setProductId}
              allowClear
            />
          </Col>
          <Col xs={24} md={12}>
            <Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
              Rango de fechas
            </Text>
            <RangePicker
              style={{ width: "100%" }}
              value={range}
              onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
              format="YYYY-MM-DD"
            />
          </Col>
        </Row>
        <Space wrap style={{ marginTop: 16 }}>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={rebuilding}
            disabled={!canRebuild || !productId || !range}
            onClick={() => void handleRebuild()}
          >
            Calcular / actualizar
          </Button>
          <Button onClick={() => void loadRows()} disabled={!productId || !range || loading}>
            Refrescar tabla
          </Button>
        </Space>
        {lastWarnings.length ? (
          <Alert type="warning" showIcon style={{ marginTop: 12 }} message={lastWarnings.join(" ")} />
        ) : null}
      </Card>

      <Card title="Filas CPA experimental (por producto)">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1500 }}
          summary={() =>
            rangeTotals ? (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ background: "rgba(255,255,255,0.06)" }}>
                  <Table.Summary.Cell index={0} colSpan={3}>
                    <Text strong>TOTAL</Text>
                    <Text type="secondary" style={{ display: "block", fontSize: 11, fontWeight: 400, marginTop: 2 }}>
                      {rangeTotals.dias} día{rangeTotals.dias === 1 ? "" : "s"} en el rango
                      {range
                        ? ` · ${range[0].format("DD/MM/YYYY")} – ${range[1].format("DD/MM/YYYY")}`
                        : ""}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <Text strong>{fmtMoney(rangeTotals.gastoPublicidad)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <Text strong>{fmtInteger(rangeTotals.conversaciones)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Text strong>{fmtMoney(rangeTotals.totalFacturado)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Text strong>
                      {rangeTotals.gananciaPromedio != null ? fmtMoney(rangeTotals.gananciaPromedio) : "—"}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <Text strong>{fmtInteger(rangeTotals.ventas)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    <Text strong>
                      {rangeTotals.ticketPromedioProducto != null
                        ? fmtMoney(rangeTotals.ticketPromedioProducto)
                        : "—"}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">
                    <Text strong type={rangeTotals.cpaEsPerdida ? "danger" : undefined}>
                      {rangeTotals.cpaEsPerdida
                        ? "Pérdida"
                        : rangeTotals.cpa != null
                          ? fmtMoney(rangeTotals.cpa)
                          : "—"}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right">
                    <Text strong>{fmtPercentRatio(rangeTotals.conversionRate)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={9} align="right">
                    <Text strong>{fmtPercentPoints(rangeTotals.costoPublicitario)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={10} align="right">
                    <Text strong>{fmtPercentPoints(rangeTotals.rentabilidad)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={11} align="right">
                    <Text strong style={{ whiteSpace: "nowrap", display: "inline-block" }}>
                      {rangeTotals.utilidadAproximada != null ? fmtMoney(rangeTotals.utilidadAproximada) : "—"}
                    </Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            ) : null
          }
        />
      </Card>
    </Space>
  );
}
