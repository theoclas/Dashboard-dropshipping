import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Card,
  Col,
  DatePicker,
  Flex,
  Row,
  Space,
  Tooltip,
  Typography,
  message,
  theme,
} from "antd";
import {
  BarChartOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  InfoCircleOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  TruckOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { api } from "../api";
import { fmtInteger, fmtMoney, fmtPercent } from "../utils/format";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const cardSurface = {
  background: "rgba(30, 41, 59, 0.72)",
  border: "1px solid rgba(148, 163, 184, 0.14)",
} as const;

export type DashboardMetrics = {
  companyId: string;
  desde: string | null;
  hasta: string | null;
  totalOrders: number;
  totalGuias: number;
  productosVendidos: number;
  sinMapear: number;
  entregados: number;
  entregadosPct: number;
  devoluciones: number;
  devolucionesPct: number;
  enProceso: number;
  enProcesoPct: number;
  totalVentas: number;
  gananciaTotal: number;
  gananciaProyectada: number;
  cpaPromedio: number;
  totalCpaSpend: number;
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      type="secondary"
      style={{
        display: "block",
        marginBottom: 12,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  emphasize,
}: {
  icon: ReactNode;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  emphasize?: boolean;
}) {
  const { token } = theme.useToken();
  return (
    <Card
      styles={{ body: { padding: 16 } }}
      style={{
        ...cardSurface,
        height: "100%",
        ...(emphasize
          ? { borderColor: token.colorPrimary, boxShadow: `0 0 0 1px ${token.colorPrimary}33 inset` }
          : {}),
      }}
    >
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Flex justify="space-between" align="center" style={{ width: "100%" }}>
          <span style={{ color: token.colorTextSecondary, fontSize: 18 }}>{icon}</span>
          {hint}
        </Flex>
        <div>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {label}
          </Text>
          <Title level={3} style={{ margin: "4px 0 0", fontWeight: 600 }}>
            {value}
          </Title>
        </div>
      </Space>
    </Card>
  );
}

export function DashboardPage() {
  const { token } = theme.useToken();
  const defaultRange = useMemo((): [Dayjs, Dayjs] => [dayjs().startOf("month"), dayjs().endOf("month")], []);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(defaultRange);
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const desde = range?.[0]?.format("YYYY-MM-DD");
      const hasta = range?.[1]?.format("YYYY-MM-DD");
      const params =
        desde && hasta
          ? ({ desde, hasta } as Record<string, string>)
          : ({} as Record<string, string>);
      const { data: d } = await api.get<DashboardMetrics>("/reports/dashboard", { params });
      setData(d);
    } catch {
      message.error("No se pudo cargar el dashboard.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  return (
    <Space direction="vertical" size={28} style={{ width: "100%" }}>
      <Flex justify="space-between" align="center" gap={16} wrap="wrap">
        <Space align="center" size={10}>
          <BarChartOutlined style={{ fontSize: 22, color: token.colorTextSecondary }} />
          <Title level={3} style={{ margin: 0 }}>
            Dashboard
          </Title>
        </Space>
        <Space align="center" wrap>
          <Text type="secondary">Filtrar por fecha:</Text>
          <RangePicker
            value={range}
            onChange={(v) => setRange(v as [Dayjs | null, Dayjs | null] | null)}
            format="DD/MM/YYYY"
            allowClear
            presets={[
              { label: "Este mes", value: [dayjs().startOf("month"), dayjs().endOf("month")] },
              { label: "Mes anterior", value: [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")] },
            ]}
          />
        </Space>
      </Flex>

      <div>
        <SectionLabel>Volumen y pedidos</SectionLabel>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              emphasize
              icon={<ShoppingCartOutlined />}
              label="Total pedidos"
              value={loading ? "…" : fmtInteger(data?.totalOrders ?? 0)}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<TruckOutlined />}
              label="Total guías"
              value={loading ? "…" : fmtInteger(data?.totalGuias ?? 0)}
              hint={
                <Tooltip title="Pedidos con número de guía asignado en el rango.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<ShoppingOutlined />}
              label="Productos vendidos"
              value={loading ? "…" : fmtInteger(data?.productosVendidos ?? 0)}
              hint={
                <Tooltip title="Suma de cantidades en productos detalle de los pedidos del rango.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<WarningOutlined />}
              label="Sin mapear"
              value={loading ? "…" : fmtInteger(data?.sinMapear ?? 0)}
            />
          </Col>
        </Row>
      </div>

      <div>
        <SectionLabel>Estados de entrega</SectionLabel>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <MetricCard
              icon={<CheckCircleOutlined />}
              label="Entregados"
              value={
                loading
                  ? "…"
                  : `${fmtInteger(data?.entregados ?? 0)} (${fmtPercent(data?.entregadosPct ?? 0)})`
              }
            />
          </Col>
          <Col xs={24} sm={8}>
            <MetricCard
              icon={<CloseCircleOutlined />}
              label="Devoluciones"
              value={
                loading
                  ? "…"
                  : `${fmtInteger(data?.devoluciones ?? 0)} (${fmtPercent(data?.devolucionesPct ?? 0)})`
              }
            />
          </Col>
          <Col xs={24} sm={8}>
            <MetricCard
              icon={<ClockCircleOutlined />}
              label="En proceso"
              value={
                loading
                  ? "…"
                  : `${fmtInteger(data?.enProceso ?? 0)} (${fmtPercent(data?.enProcesoPct ?? 0)})`
              }
            />
          </Col>
        </Row>
      </div>

      <div>
        <SectionLabel>Finanzas</SectionLabel>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<DollarOutlined />}
              label="Total ventas"
              value={loading ? "…" : `$${fmtMoney(data?.totalVentas ?? 0)}`}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<DollarOutlined />}
              label="Ganancia total"
              value={loading ? "…" : `$${fmtMoney(data?.gananciaTotal ?? 0)}`}
              hint={
                <Tooltip title="Neto tipo cartera en el rango: entregados (ganancia) más devoluciones (cargos negativos: flete/cartera). Si importaste cartera con estado OK, usa el neto real por pedido; si no, estimación del pedido. No resta CPA.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<DollarOutlined />}
              label="Ganancia proyectada"
              value={loading ? "…" : `$${fmtMoney(data?.gananciaProyectada ?? 0)}`}
              hint={
                <Tooltip title="Suma de ganancia calculada en pedidos en proceso (excluye entregados, devoluciones y sin mapear).">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<BarChartOutlined />}
              label="CPA promedio"
              value={loading ? "…" : `$${fmtMoney(data?.cpaPromedio ?? 0)}`}
              hint={
                <Tooltip
                  title={`Promedio del campo CPA en registros importados. Gasto CPA en el rango: $${fmtMoney(data?.totalCpaSpend ?? 0)}.`}
                >
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
        </Row>
      </div>
    </Space>
  );
}
