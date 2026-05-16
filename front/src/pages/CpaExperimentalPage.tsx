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
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ExperimentOutlined, ReloadOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import {
  fetchCatalogProducts,
  fetchCpaExperimental,
  fetchMetaCampaignAdvertisingAccounts,
  rebuildCpaExperimental,
} from "../api";
import { usePermission } from "../hooks/usePermission";
import { fmtApiDateIsoYmd } from "../utils/calendarDateLocal";
import { fmtInteger, fmtMoney, fmtPercentPoints, fmtPercentRatio } from "../utils/format";
import type { AdvertisingAccount, CatalogProduct, CpaExperimentalRecordRow } from "../types";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return fmtMoney(v);
  const n = Number(v);
  return Number.isFinite(n) ? fmtMoney(n) : String(v);
}

export function CpaExperimentalPage() {
  const canModule = usePermission("moduleCpa");
  const canRebuild = usePermission("moduleCpa");

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [accounts, setAccounts] = useState<AdvertisingAccount[]>([]);
  const [productId, setProductId] = useState<string | undefined>();
  const [accountId, setAccountId] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [rows, setRows] = useState<CpaExperimentalRecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [lastWarnings, setLastWarnings] = useState<string[]>([]);

  const loadMeta = useCallback(async () => {
    try {
      const [plist, alist] = await Promise.all([fetchCatalogProducts(), fetchMetaCampaignAdvertisingAccounts()]);
      setProducts(plist.filter((p) => p.isActive));
      setAccounts(alist);
    } catch {
      message.error("No se pudieron cargar productos o cuentas.");
    }
  }, []);

  const loadRows = useCallback(async () => {
    if (!productId || !accountId || !range) return;
    setLoading(true);
    try {
      const list = await fetchCpaExperimental({
        catalogProductId: productId,
        advertisingAccountId: accountId,
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
  }, [productId, accountId, range]);

  useEffect(() => {
    if (canModule) void loadMeta();
  }, [canModule, loadMeta]);

  useEffect(() => {
    if (productId && accountId && range) void loadRows();
    else setRows([]);
  }, [productId, accountId, range, loadRows]);

  const handleRebuild = async () => {
    if (!productId || !accountId || !range) {
      message.warning("Selecciona producto, cuenta y rango de fechas.");
      return;
    }
    setRebuilding(true);
    setLastWarnings([]);
    try {
      const res = await rebuildCpaExperimental({
        catalogProductId: productId,
        advertisingAccountId: accountId,
        desde: range[0].format("YYYY-MM-DD"),
        hasta: range[1].format("YYYY-MM-DD"),
      });
      setLastWarnings(res.warnings);
      message.success(`CPA experimental: ${res.daysWritten} día(s) calculados.`);
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
  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: `${a.metaAccountId}${a.businessName ? ` — ${a.businessName}` : ""}`,
      })),
    [accounts],
  );

  const columns: ColumnsType<CpaExperimentalRecordRow> = useMemo(
    () => [
      { title: "Semana", dataIndex: "semana", key: "sem", width: 140, ellipsis: true },
      {
        title: "Fecha",
        dataIndex: "fecha",
        key: "fecha",
        width: 110,
        render: (v: string) => fmtApiDateIsoYmd(v),
      },
      { title: "Producto", dataIndex: "producto", key: "prod", ellipsis: true },
      { title: "Cuenta", dataIndex: "cuentaPublicitaria", key: "cuenta", ellipsis: true },
      {
        title: "Gasto pub.",
        dataIndex: "gastoPublicidad",
        key: "gasto",
        width: 120,
        align: "right",
        render: fmtCell,
      },
      {
        title: "Conv.",
        dataIndex: "conversaciones",
        key: "conv",
        width: 72,
        align: "right",
        render: (n) => (n != null ? fmtInteger(n) : "—"),
      },
      {
        title: "Total fact.",
        dataIndex: "totalFacturado",
        key: "tf",
        width: 120,
        align: "right",
        render: fmtCell,
      },
      {
        title: "Gan. prom.",
        dataIndex: "gananciaPromedio",
        key: "gp",
        width: 110,
        align: "right",
        render: fmtCell,
      },
      {
        title: "Ventas",
        dataIndex: "ventas",
        key: "ventas",
        width: 80,
        align: "right",
        render: (n) => (n != null ? fmtInteger(n) : "—"),
      },
      {
        title: "Ticket prom.",
        dataIndex: "ticketPromedioProducto",
        key: "ticket",
        width: 110,
        align: "right",
        render: fmtCell,
      },
      { title: "CPA", dataIndex: "cpa", key: "cpa", width: 100, align: "right", render: fmtCell },
      {
        title: "Conv. rate",
        dataIndex: "conversionRate",
        key: "cr",
        width: 90,
        align: "right",
        render: (v) => fmtPercentRatio(v),
      },
      {
        title: "Costo pub.",
        dataIndex: "costoPublicitario",
        key: "costo",
        width: 100,
        align: "right",
        render: (v) => fmtPercentPoints(v),
      },
      {
        title: "Rentab.",
        dataIndex: "rentabilidad",
        key: "rent",
        width: 90,
        align: "right",
        render: (v) => fmtPercentPoints(v),
      },
      {
        title: "Utilidad apx.",
        dataIndex: "utilidadAproximada",
        key: "util",
        width: 110,
        align: "right",
        render: fmtCell,
      },
    ],
    [],
  );

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
          Arma filas CPA por día: pedidos (ventas, facturación, ganancia; <strong>sin cancelados ni rechazados</strong>), conversaciones Meta + sesiones Shopify de
          campañas vinculadas al producto y cuenta, y gasto publicitario como la suma del «Importe gastado» del Excel
          Meta importado en Campañas (mismo valor que ves en el detalle de métricas). Si ese importe no está en la
          importación, se usa el gasto operacional del día para esa cuenta.
          Las columnas derivadas siguen la plantilla CPA: ticket y CPA en pesos; tasa de conversión como %;
          costo publicitario como en Excel (<strong>CPA × 100% / ticket promedio</strong>); rentabilidad como en la
          plantilla (<strong>100%</strong> si ventas = 0; si no <strong>CPA / ganancia promedio</strong> como %);
          utilidad aproximada en pesos (<strong>−gasto</strong> si ventas = 0; si no <strong>((ganancia × ventas) −
          gasto) × 0,75</strong>).
        </Text>
      </div>

      <Alert
        type="info"
        showIcon
        message="Cómo se arma el gasto y el CPA"
        description={
          <span>
            El gasto del día es la suma del «Importe gastado (COP)» / «Amount spent» guardado en cada fila de métricas
            Meta de las campañas de este producto en esta cuenta. Si hubiera varias campañas, se suman todas. Solo si
            ninguna fila trae ese importe en la importación se recurre al gasto operacional de la cuenta ese día.
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
            <li>Gastos operacionales con cuenta publicitaria y fecha (p. ej. import facturación Meta).</li>
            <li>Campañas Meta del producto asignadas a la misma cuenta publicitaria.</li>
            <li>Métricas diarias importadas en Campañas Meta (opcional para conversaciones / Shopify).</li>
          </ul>
        }
      />

      <Card title="Calcular rango">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
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
          <Col xs={24} md={8}>
            <Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
              Cuenta publicitaria
            </Text>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Cuenta Meta"
              style={{ width: "100%" }}
              options={accountOptions}
              value={accountId}
              onChange={setAccountId}
              allowClear
            />
          </Col>
          <Col xs={24} md={8}>
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
            disabled={!canRebuild || !productId || !accountId || !range}
            onClick={() => void handleRebuild()}
          >
            Calcular / actualizar
          </Button>
          <Button onClick={() => void loadRows()} disabled={!productId || !accountId || !range || loading}>
            Refrescar tabla
          </Button>
        </Space>
        {lastWarnings.length ? (
          <Alert type="warning" showIcon style={{ marginTop: 12 }} message={lastWarnings.join(" ")} />
        ) : null}
      </Card>

      <Card title="Filas CPA experimental">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1600 }}
        />
      </Card>
    </Space>
  );
}
