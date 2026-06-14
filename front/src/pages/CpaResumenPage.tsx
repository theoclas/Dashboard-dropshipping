import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Space,
  Table,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { BarChartOutlined, ReloadOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { Link } from "react-router-dom";
import { fetchCpaResumen } from "../api";
import { usePermission } from "../hooks/usePermission";
import { fmtCpaDisplay } from "../utils/cpaDisplay";
import { fmtInteger, fmtMoney } from "../utils/format";
import type { CpaResumenRow, CpaResumenRowKind } from "../types";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

function colTitle(short: string, full: string) {
  return (
    <Tooltip title={full}>
      <span style={{ cursor: "default" }}>{short}</span>
    </Tooltip>
  );
}

function cellText(value: string | null | undefined): string {
  return value?.trim() ? value : "—";
}

function collectExpandableKeys(rows: CpaResumenRow[], kinds: CpaResumenRowKind[]): string[] {
  const keys: string[] = [];
  const walk = (nodes: CpaResumenRow[]) => {
    for (const node of nodes) {
      if (node.children?.length && kinds.includes(node.kind)) {
        keys.push(node.key);
        walk(node.children);
      }
    }
  };
  walk(rows);
  return keys;
}

function rowStyle(kind: CpaResumenRowKind): CSSProperties {
  if (kind === "grandTotal") return { fontWeight: 600, background: "rgba(22, 119, 255, 0.12)" };
  if (kind === "monthTotal") return { fontWeight: 600, background: "rgba(34, 197, 94, 0.14)" };
  if (kind === "weekTotal") return { fontWeight: 600, background: "rgba(148, 163, 184, 0.12)" };
  if (kind === "month" || kind === "week") return { fontWeight: 600 };
  if (kind === "product") return { background: "rgba(148, 163, 184, 0.04)" };
  return {};
}

export function CpaResumenPage() {
  const canModule = usePermission("moduleCpa");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(() => [
    dayjs().startOf("month"),
    dayjs().endOf("month"),
  ]);
  const [rows, setRows] = useState<CpaResumenRow[]>([]);
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    try {
      const res = await fetchCpaResumen({
        desde: range[0].format("YYYY-MM-DD"),
        hasta: range[1].format("YYYY-MM-DD"),
      });
      setRows(res.rows);
      setExpandedRowKeys([]);
    } catch {
      message.error("No se pudo cargar el resumen CPA.");
      setRows([]);
      setExpandedRowKeys([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    if (canModule && range) void load();
  }, [canModule, range, load]);

  const columns: ColumnsType<CpaResumenRow> = useMemo(
    () => [
      {
        title: "Meses",
        dataIndex: "meses",
        key: "mes",
        width: 130,
        render: (v, row) => (row.kind === "month" || row.kind === "monthTotal" || row.kind === "grandTotal" ? cellText(v) : ""),
      },
      {
        title: "SEMANA",
        dataIndex: "semana",
        key: "sem",
        width: 170,
        render: (v, row) =>
          row.kind === "week" || row.kind === "weekTotal" ? cellText(v) : "",
      },
      {
        title: "Fecha",
        dataIndex: "fecha",
        key: "fec",
        width: 96,
        render: (v, row) => (row.kind === "day" ? cellText(v) : ""),
      },
      {
        title: "Producto",
        dataIndex: "producto",
        key: "prod",
        width: 180,
        render: (v, row) => (row.kind === "product" ? cellText(v) : ""),
      },
      {
        title: colTitle("Gasto pub.", "GASTO PUBLICIDAD (Sum)"),
        dataIndex: "gastoPublicidad",
        key: "gasto",
        align: "right",
        width: 130,
        render: (v) => fmtMoney(v),
      },
      {
        title: colTitle("Conv.", "# de CONVERSACIONES"),
        dataIndex: "conversaciones",
        key: "conv",
        align: "right",
        width: 100,
        render: (v) => fmtInteger(v),
      },
      {
        title: colTitle("Ventas", "# de VENTAS"),
        dataIndex: "ventas",
        key: "ventas",
        align: "right",
        width: 90,
        render: (v) => fmtInteger(v),
      },
      {
        title: colTitle("Gan. prom.", "GANANCIA (Prom)"),
        dataIndex: "gananciaPromedio",
        key: "gan",
        align: "right",
        width: 120,
        render: (v) => (v != null ? fmtMoney(v) : "—"),
      },
      {
        title: colTitle("CPA", "CPA (Prom)"),
        dataIndex: "cpa",
        key: "cpa",
        align: "right",
        width: 110,
        render: (cpa, row) => fmtCpaDisplay(cpa, row.gastoPublicidad, row.ventas),
      },
      {
        title: colTitle("Util. apx.", "UTILIDAD APROX"),
        dataIndex: "utilidadAproximada",
        key: "util",
        align: "right",
        width: 130,
        render: (v) => (v != null ? fmtMoney(v) : "—"),
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
          <BarChartOutlined style={{ marginRight: 8 }} />
          CPA Resumen
        </Title>
        <Text type="secondary">
          Tabla dinámica como el Excel <em>RESUMEN_DIARIO</em>: expande mes → semana → día para ver cada producto.
          Los datos provienen de <Link to="/app/cpa-experimental">CPA experimental</Link>.
        </Text>
      </div>

      <Alert
        type="info"
        showIcon
        message="Cómo usar"
        description="Colapsado verás meses y totales. Expande una semana para ver días; expande un día para ver productos (ACEITE TRULY, BATANA, etc.). Calcula cada producto en CPA experimental antes."
      />

      <Card title="Rango de fechas">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={14}>
            <RangePicker
              value={range}
              onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
              format="DD/MM/YYYY"
              style={{ width: "100%", maxWidth: 360 }}
              allowClear={false}
            />
          </Col>
          <Col xs={24} md={10}>
            <Space wrap>
              <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
                Actualizar
              </Button>
              <Button onClick={() => setExpandedRowKeys(collectExpandableKeys(rows, ["month"]))}>
                Expandir semanas
              </Button>
              <Button onClick={() => setExpandedRowKeys(collectExpandableKeys(rows, ["month", "week"]))}>
                Expandir días
              </Button>
              <Button onClick={() => setExpandedRowKeys([])}>Colapsar todo</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card title="Resumen diario">
        <Table
          rowKey="key"
          size="small"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={false}
          scroll={{ x: "max-content" }}
          expandable={{
            expandedRowKeys,
            onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as string[]),
            indentSize: 20,
          }}
          onRow={(row) => ({ style: rowStyle(row.kind) })}
        />
      </Card>
    </Space>
  );
}
