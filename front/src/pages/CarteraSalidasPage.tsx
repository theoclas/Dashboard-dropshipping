import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  Col,
  DatePicker,
  Row,
  Select,
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
import dayjs from "dayjs";
import { Link } from "react-router-dom";
import { fetchCarteraSalidas } from "../api";
import { usePermission } from "../hooks/usePermission";
import type { CarteraSalidaCategoria, CarteraSalidaRow, CarteraSalidasResponse } from "../types";

const { Title, Text } = Typography;

const CATEGORIA_LABELS: Record<CarteraSalidaCategoria, string> = {
  pedido: "Pedido",
  retiro: "Retiro de saldo",
  recarga_tarjeta: "Recarga / tarjeta Dropi",
  otro: "Otra salida",
};

const CATEGORIA_COLORS: Record<CarteraSalidaCategoria, string> = {
  pedido: "blue",
  retiro: "orange",
  recarga_tarjeta: "purple",
  otro: "default",
};

function fmtMoney(n: number): string {
  return n.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function CarteraSalidasPage() {
  const { token } = theme.useToken();
  const canSee = usePermission("moduleSalidasCartera");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CarteraSalidaRow[]>([]);
  const [summary, setSummary] = useState({
    totalMonto: 0,
    count: 0,
    byCategoria: {
      pedido: { count: 0, totalMonto: 0 },
      retiro: { count: 0, totalMonto: 0 },
      recarga_tarjeta: { count: 0, totalMonto: 0 },
      otro: { count: 0, totalMonto: 0 },
    } as CarteraSalidasResponse["summary"]["byCategoria"],
  });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [categoria, setCategoria] = useState<CarteraSalidaCategoria | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const desde = dateRange?.[0]?.format("YYYY-MM-DD");
      const hasta = dateRange?.[1]?.format("YYYY-MM-DD");
      const res = await fetchCarteraSalidas({
        ...(desde && hasta ? { desde, hasta } : {}),
        ...(categoria !== "all" ? { categoria } : {}),
      });
      setRows(res.items);
      setSummary(res.summary);
    } catch {
      message.error("No se pudieron cargar las salidas de cartera.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [categoria, dateRange]);

  useEffect(() => {
    if (canSee) void load();
  }, [canSee, load]);

  const columns: ColumnsType<CarteraSalidaRow> = useMemo(
    () => [
      {
        title: "Fecha",
        dataIndex: "fecha",
        key: "fecha",
        width: 150,
        render: (v: string | null) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—"),
        sorter: (a, b) => dayjs(a.fecha ?? 0).valueOf() - dayjs(b.fecha ?? 0).valueOf(),
        defaultSortOrder: "descend",
      },
      {
        title: "Categoría",
        dataIndex: "categoria",
        key: "categoria",
        width: 170,
        filters: (Object.keys(CATEGORIA_LABELS) as CarteraSalidaCategoria[]).map((k) => ({
          text: CATEGORIA_LABELS[k],
          value: k,
        })),
        onFilter: (value, record) => record.categoria === value,
        render: (v: CarteraSalidaCategoria) => <Tag color={CATEGORIA_COLORS[v]}>{CATEGORIA_LABELS[v]}</Tag>,
      },
      {
        title: "Monto",
        dataIndex: "monto",
        key: "monto",
        width: 120,
        align: "right",
        render: (v: number | null) =>
          v != null ? (
            <Text type="danger">${fmtMoney(Math.abs(v))}</Text>
          ) : (
            "—"
          ),
        sorter: (a, b) => Math.abs(a.monto ?? 0) - Math.abs(b.monto ?? 0),
      },
      {
        title: "Pedido Dropi",
        key: "pedido",
        width: 140,
        render: (_, r) => {
          if (!r.ordenId) return <Text type="secondary">—</Text>;
          if (r.pedido) {
            return (
              <Space direction="vertical" size={0}>
                <Link to="/app/pedidos">{r.pedido.externalOrderId}</Link>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {r.pedido.estadoUnificado ?? r.pedido.estadoOperativo ?? "Sin estado"}
                </Text>
              </Space>
            );
          }
          return (
            <Space direction="vertical" size={0}>
              <Text>{r.ordenId}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                No importado en pedidos
              </Text>
            </Space>
          );
        },
      },
      {
        title: "ID movimiento",
        dataIndex: "movementId",
        key: "movementId",
        width: 120,
      },
      {
        title: "Producto",
        key: "productos",
        width: 260,
        render: (_, r) =>
          r.productos.length > 0 ? (
            <Space direction="vertical" size={0}>
              {r.productos.map((p, i) => (
                <Text key={`${p.nombre}-${i}`}>
                  {p.nombre} {p.cantidad > 1 ? `× ${p.cantidad}` : ""}
                </Text>
              ))}
            </Space>
          ) : (
            <Tag>Otro</Tag>
          ),
      },
      {
        title: "Descripción",
        dataIndex: "descripcion",
        key: "descripcion",
        ellipsis: true,
        render: (v: string | null) => v ?? "—",
      },
    ],
    [],
  );

  if (!canSee) {
    return <Typography.Paragraph>No tienes permiso para ver salidas de cartera.</Typography.Paragraph>;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>
          Salidas de cartera
        </Title>
        <Text type="secondary">
          Movimientos con TIPO = SALIDA del historial de cartera Dropi (importado). Clasificados por pedido, retiro de
          saldo o recarga/tarjeta.
        </Text>
      </div>

      <Space wrap align="center">
        <Text strong>Filtrar por fecha</Text>
        <DatePicker.RangePicker
          format="DD/MM/YYYY"
          value={dateRange}
          placeholder={["Desde", "Hasta"]}
          onChange={(v) => setDateRange(v)}
          allowEmpty={[true, true]}
        />
        <Select
          style={{ minWidth: 220 }}
          value={categoria}
          onChange={setCategoria}
          options={[
            { value: "all", label: "Todas las categorías" },
            ...(Object.keys(CATEGORIA_LABELS) as CarteraSalidaCategoria[]).map((k) => ({
              value: k,
              label: CATEGORIA_LABELS[k],
            })),
          ]}
        />
        <Link to="/app/importar">Importar cartera</Link>
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ background: token.colorFillAlter }}>
            <Statistic title="Total salidas" value={summary.count} suffix="mov." />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ background: token.colorFillAlter }}>
            <Statistic title="Monto total" value={summary.totalMonto} prefix="$" formatter={(v) => fmtMoney(Number(v))} />
          </Card>
        </Col>
        {(Object.keys(CATEGORIA_LABELS) as CarteraSalidaCategoria[]).map((cat) => (
          <Col xs={24} sm={12} lg={6} key={cat}>
            <Card
              size="small"
              hoverable
              onClick={() => setCategoria(cat)}
              style={{
                background: token.colorFillAlter,
                borderColor: categoria === cat ? token.colorPrimary : undefined,
                cursor: "pointer",
              }}
            >
              <Statistic
                title={CATEGORIA_LABELS[cat]}
                value={summary.byCategoria[cat].totalMonto}
                prefix="$"
                suffix={`(${summary.byCategoria[cat].count})`}
                formatter={(v) => fmtMoney(Number(v))}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card>
        <Table<CarteraSalidaRow>
          rowKey="movementId"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 20, showTotal: (t) => `${t} salidas` }}
          locale={{ emptyText: "Sin salidas. Importa el historial de cartera Dropi." }}
          scroll={{ x: 1360 }}
        />
      </Card>
    </Space>
  );
}
