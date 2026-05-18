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
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  ExportOutlined,
  InfoCircleOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  StopOutlined,
  TruckOutlined,
  UndoOutlined,
  WalletOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { Link } from "react-router-dom";
import { api } from "../api";
import { isDashboardCardVisible } from "../dashboardVisibility";
import { useAuth } from "../contexts/AuthContext";
import { usePermission } from "../hooks/usePermission";
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
  pedidosCancelados: number;
  pedidosCanceladosPct: number;
  pedidosPendientes: number;
  pedidosPendientesPct: number;
  entregados: number;
  entregadosPct: number;
  devoluciones: number;
  devolucionesPct: number;
  enProceso: number;
  enProcesoPct: number;
  totalVentas: number;
  gananciaTotal: number;
  gananciaEstimada: number;
  gananciaProyectada: number;
  cpaPromedio: number;
  totalCpaSpend: number;
  gastoOperacional: number;
  retirosDropiTotal: number;
  retirosDropiCount: number;
  pedidosCarteraSinOk: number;
  pedidosCarteraSinOkPct: number;
  pedidosCarteraSinOkEntregados: number;
  pedidosCarteraSinOkEntregadosPct: number;
  pedidosCarteraOkEntregados: number;
  pedidosCarteraOkEntregadosPct: number;
  pedidosCarteraOkDevoluciones: number;
  pedidosCarteraOkDevolucionesPct: number;
  pedidosNovedad: number;
  pedidosNovedadPct: number;
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
  const { user } = useAuth();
  const canOpenSettings = usePermission("moduleConfiguracion");
  const dashCfg = user?.dashboardConfig;
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
          {canOpenSettings ? (
            <Link to="/app/configuracion" style={{ fontSize: 13 }}>
              Configuración
            </Link>
          ) : null}
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
          {isDashboardCardVisible(dashCfg, "card_totalOrders") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              emphasize
              icon={<ShoppingCartOutlined />}
              label="Total pedidos"
              value={loading ? "…" : fmtInteger(data?.totalOrders ?? 0)}
            />
          </Col>
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_totalGuias") ? (
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
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_productosVendidos") ? (
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
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_sinMapear") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<WarningOutlined />}
              label="Sin mapear"
              value={loading ? "…" : fmtInteger(data?.sinMapear ?? 0)}
            />
          </Col>
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_pedidosCancelados") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<StopOutlined />}
              label="Total pedidos cancelados"
              value={
                loading
                  ? "…"
                  : `${fmtInteger(data?.pedidosCancelados ?? 0)} (${fmtPercent(data?.pedidosCanceladosPct ?? 0)})`
              }
              hint={
                <Tooltip title="Pedidos con estado cancelado o rechazado en el rango. El porcentaje es sobre el total de pedidos.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_pedidosPendientes") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<ClockCircleOutlined />}
              label="Total pedidos pendientes"
              value={
                loading
                  ? "…"
                  : `${fmtInteger(data?.pedidosPendientes ?? 0)} (${fmtPercent(data?.pedidosPendientesPct ?? 0)})`
              }
              hint={
                <Tooltip title="Pedidos en tránsito: aún no entregados, devueltos ni cancelados (misma base que «En proceso»).">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          ) : null}
        </Row>
      </div>

      <div>
        <SectionLabel>Estados de entrega</SectionLabel>
        <Row gutter={[16, 16]}>
          {isDashboardCardVisible(dashCfg, "card_entregados") ? (
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
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_devoluciones") ? (
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
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_enProceso") ? (
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
          ) : null}
        </Row>
      </div>

      <div>
        <SectionLabel>Finanzas</SectionLabel>
        <Row gutter={[16, 16]}>
          {isDashboardCardVisible(dashCfg, "card_totalVentas") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<DollarOutlined />}
              label="Total ventas"
              value={loading ? "…" : `$${fmtMoney(data?.totalVentas ?? 0)}`}
            />
          </Col>
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_gananciaTotal") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<DollarOutlined />}
              label="Ganancia total (cartera OK)"
              value={loading ? "…" : `$${fmtMoney(data?.gananciaTotal ?? 0)}`}
              hint={
                <Tooltip title="Neto de movimientos de cartera (ENTRADA suma, otros restan) enlazados a pedidos con cartera OK y estado entregado o devolución en el rango. Las devoluciones quedan reflejadas en ese neto. No incluye CPA.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_gananciaEstimada") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<DollarOutlined />}
              label="Ganancia estimada"
              value={loading ? "…" : `$${fmtMoney(data?.gananciaEstimada ?? 0)}`}
              hint={
                <Tooltip title="Ganancia total (cartera OK) más la suma de ganancia_calc de pedidos entregados cuya cartera aún no está en OK.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_gananciaProyectada") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<DollarOutlined />}
              label="Ganancia proyectada"
              value={loading ? "…" : `$${fmtMoney(data?.gananciaProyectada ?? 0)}`}
              hint={
                <Tooltip title="Ganancia estimada más la suma de ganancia_calc de pedidos en tránsito (pendientes), como si todo lo pendiente se entregara.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_cpaPromedio") ? (
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
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_gastoOperacional") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<WalletOutlined />}
              label="Gasto operacional"
              value={loading ? "…" : `$${fmtMoney(data?.gastoOperacional ?? 0)}`}
              hint={
                <Tooltip title="Suma de gastos operacionales registrados para la empresa en el mismo rango de fechas que los pedidos.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_retirosDropi") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<ExportOutlined />}
              label="Retiros Dropi"
              value={
                loading
                  ? "…"
                  : `$${fmtMoney(data?.retirosDropiTotal ?? 0)} (${fmtInteger(data?.retirosDropiCount ?? 0)} mov.)`
              }
              hint={
                <Tooltip title="Suma de montos en retiros_dropi (detectados al importar cartera por la descripción estándar de retiro de saldo), con fecha del movimiento en el rango. El número entre paréntesis es la cantidad de movimientos. Detalle en Configuración → Retiros Dropi.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          ) : null}
        </Row>
      </div>

      <div>
        <SectionLabel>Cartera y novedades</SectionLabel>
        <Row gutter={[16, 16]}>
          {isDashboardCardVisible(dashCfg, "card_pedidosCarteraSinOk") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<WarningOutlined />}
              label="Devoluciones cartera sin OK"
              value={
                loading
                  ? "…"
                  : `${fmtInteger(data?.pedidosCarteraSinOk ?? 0)} (${fmtPercent(data?.pedidosCarteraSinOkPct ?? 0)})`
              }
              hint={
                <Tooltip title="Solo pedidos clasificados como devolución en el rango, con estado de cartera distinto de «OK». No incluye entregados. El % es sobre el total de pedidos del rango.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_pedidosCarteraSinOkEntregados") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<TruckOutlined />}
              label="Entregados cartera sin OK"
              value={
                loading
                  ? "…"
                  : `${fmtInteger(data?.pedidosCarteraSinOkEntregados ?? 0)} (${fmtPercent(data?.pedidosCarteraSinOkEntregadosPct ?? 0)})`
              }
              hint={
                <Tooltip title="Pedidos clasificados como entregados con estado de cartera distinto de «OK». No incluye devoluciones. El % es sobre el total de pedidos del rango.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_pedidosCarteraOkEntregados") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<CheckCircleOutlined />}
              label="Cartera OK — entregados"
              value={
                loading
                  ? "…"
                  : `${fmtInteger(data?.pedidosCarteraOkEntregados ?? 0)} (${fmtPercent(data?.pedidosCarteraOkEntregadosPct ?? 0)})`
              }
              hint={
                <Tooltip title="Pedidos clasificados como entregados con estado de cartera «OK». El % es sobre el total de pedidos del rango.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_pedidosCarteraOkDevoluciones") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<UndoOutlined />}
              label="Cartera OK — devoluciones"
              value={
                loading
                  ? "…"
                  : `${fmtInteger(data?.pedidosCarteraOkDevoluciones ?? 0)} (${fmtPercent(data?.pedidosCarteraOkDevolucionesPct ?? 0)})`
              }
              hint={
                <Tooltip title="Pedidos clasificados como devolución con estado de cartera «OK». El % es sobre el total de pedidos del rango.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          ) : null}
          {isDashboardCardVisible(dashCfg, "card_pedidosNovedad") ? (
          <Col xs={24} sm={12} lg={6}>
            <MetricCard
              icon={<BellOutlined />}
              label="Novedades (pedidos)"
              value={
                loading
                  ? "…"
                  : `${fmtInteger(data?.pedidosNovedad ?? 0)} (${fmtPercent(data?.pedidosNovedadPct ?? 0)})`
              }
              hint={
                <Tooltip title="Pedidos con estado unificado NOVEDAD o cuyo estado operativo, último movimiento o estatus original menciona novedad. El % es sobre el total de pedidos del rango.">
                  <InfoCircleOutlined style={{ color: token.colorTextQuaternary, fontSize: 14 }} />
                </Tooltip>
              }
            />
          </Col>
          ) : null}
        </Row>
        {!loading &&
        (isDashboardCardVisible(dashCfg, "card_pedidosCarteraSinOk") ||
          isDashboardCardVisible(dashCfg, "card_pedidosCarteraSinOkEntregados") ||
          isDashboardCardVisible(dashCfg, "card_pedidosCarteraOkEntregados") ||
          isDashboardCardVisible(dashCfg, "card_pedidosCarteraOkDevoluciones") ||
          isDashboardCardVisible(dashCfg, "card_pedidosNovedad")) ? (
          <Text type="secondary" style={{ display: "block", marginTop: 10, fontSize: 12 }}>
            <Link to="/app/pedidos">Abrir grilla de pedidos</Link> para filtrar por columna (estado cartera, estado unificado, etc.).
          </Text>
        ) : null}
      </div>
    </Space>
  );
}
