import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Col, DatePicker, Row, Select, Space, Statistic, Table, Tag, Typography, message, theme } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { Link } from "react-router-dom";
import { fetchCarteraEntradas } from "../api";
import { usePermission } from "../hooks/usePermission";
import type { CarteraEntradaCategoria, CarteraEntradaRow, CarteraEntradasResponse } from "../types";

const { Title, Text } = Typography;
const LABELS: Record<CarteraEntradaCategoria, string> = { pedido: "Entrada por pedido", otro: "Otra entrada" };

function fmtMoney(n: number): string {
  return n.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function CarteraEntradasPage() {
  const { token } = theme.useToken();
  const canSee = usePermission("moduleSalidasCartera");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CarteraEntradaRow[]>([]);
  const [summary, setSummary] = useState<CarteraEntradasResponse["summary"]>({
    totalMonto: 0,
    count: 0,
    byCategoria: { pedido: { count: 0, totalMonto: 0 }, otro: { count: 0, totalMonto: 0 } },
  });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [categoria, setCategoria] = useState<CarteraEntradaCategoria | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const desde = dateRange?.[0]?.format("YYYY-MM-DD");
      const hasta = dateRange?.[1]?.format("YYYY-MM-DD");
      const res = await fetchCarteraEntradas({
        ...(desde && hasta ? { desde, hasta } : {}),
        ...(categoria !== "all" ? { categoria } : {}),
      });
      setRows(res.items);
      setSummary(res.summary);
    } catch {
      message.error("No se pudieron cargar las entradas de cartera.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [categoria, dateRange]);

  useEffect(() => {
    if (canSee) void load();
  }, [canSee, load]);

  const columns: ColumnsType<CarteraEntradaRow> = useMemo(
    () => [
      {
        title: "Fecha",
        dataIndex: "fecha",
        width: 150,
        render: (v: string | null) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—"),
        sorter: (a, b) => dayjs(a.fecha ?? 0).valueOf() - dayjs(b.fecha ?? 0).valueOf(),
        defaultSortOrder: "descend",
      },
      {
        title: "Categoría",
        dataIndex: "categoria",
        width: 150,
        render: (v: CarteraEntradaCategoria) => <Tag color={v === "pedido" ? "green" : "default"}>{LABELS[v]}</Tag>,
      },
      {
        title: "Monto",
        dataIndex: "monto",
        width: 130,
        align: "right",
        render: (v: number | null) => (v == null ? "—" : <Text type="success">${fmtMoney(Math.abs(v))}</Text>),
        sorter: (a, b) => Math.abs(a.monto ?? 0) - Math.abs(b.monto ?? 0),
      },
      {
        title: "Pedido Dropi",
        width: 150,
        render: (_, r) =>
          r.ordenId ? (
            <Space direction="vertical" size={0}>
              {r.pedido ? <Link to="/app/pedidos">{r.ordenId}</Link> : <Text>{r.ordenId}</Text>}
              <Text type="secondary" style={{ fontSize: 11 }}>
                {r.pedido?.estadoUnificado ?? r.pedido?.estadoOperativo ?? "No importado"}
              </Text>
            </Space>
          ) : (
            <Tag>Otro</Tag>
          ),
      },
      {
        title: "Producto",
        width: 280,
        render: (_, r) =>
          r.productos.length ? (
            <Space direction="vertical" size={0}>
              {r.productos.map((p, i) => (
                <Text key={`${p.nombre}-${i}`}>{p.nombre} {p.cantidad > 1 ? `× ${p.cantidad}` : ""}</Text>
              ))}
            </Space>
          ) : (
            <Tag>Otro</Tag>
          ),
      },
      { title: "ID movimiento", dataIndex: "movementId", width: 120 },
      { title: "Descripción", dataIndex: "descripcion", ellipsis: true, render: (v: string | null) => v ?? "—" },
    ],
    [],
  );

  if (!canSee) return <Typography.Paragraph>No tienes permiso para ver movimientos de cartera.</Typography.Paragraph>;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>Entradas de cartera</Title>
        <Text type="secondary">
          Movimientos con TIPO = ENTRADA. Las entradas enlazadas a pedidos muestran sus productos; las demás se
          clasifican como «Otra entrada».
        </Text>
      </div>

      <Space wrap>
        <Text strong>Filtrar por fecha</Text>
        <DatePicker.RangePicker value={dateRange} onChange={setDateRange} format="DD/MM/YYYY" allowEmpty={[true, true]} />
        <Select
          style={{ minWidth: 220 }}
          value={categoria}
          onChange={setCategoria}
          options={[
            { value: "all", label: "Todas las categorías" },
            { value: "pedido", label: LABELS.pedido },
            { value: "otro", label: LABELS.otro },
          ]}
        />
        <Link to="/app/importar">Importar cartera</Link>
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ background: token.colorFillAlter }}>
            <Statistic title="Total entradas" value={summary.count} suffix="mov." />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ background: token.colorFillAlter }}>
            <Statistic title="Monto total" value={summary.totalMonto} prefix="$" formatter={(v) => fmtMoney(Number(v))} />
          </Card>
        </Col>
        {(["pedido", "otro"] as const).map((cat) => (
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
                title={LABELS[cat]}
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
        <Table
          rowKey="movementId"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 20, showTotal: (t) => `${t} entradas` }}
          locale={{ emptyText: "Sin entradas. Importa el historial de cartera Dropi." }}
          scroll={{ x: 1300 }}
        />
      </Card>
    </Space>
  );
}
