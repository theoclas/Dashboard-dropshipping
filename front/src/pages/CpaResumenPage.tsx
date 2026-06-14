import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { CpaResumenRow } from "../types";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

function colTitle(short: string, full: string) {
  return (
    <Tooltip title={full}>
      <span style={{ cursor: "default" }}>{short}</span>
    </Tooltip>
  );
}

function rowKey(r: CpaResumenRow, idx?: number): string {
  return `${r.kind}-${r.meses}-${r.semana}-${r.fecha ?? ""}-${idx ?? 0}`;
}

export function CpaResumenPage() {
  const canModule = usePermission("moduleCpa");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(() => [
    dayjs().startOf("month"),
    dayjs().endOf("month"),
  ]);
  const [rows, setRows] = useState<CpaResumenRow[]>([]);
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
    } catch {
      message.error("No se pudo cargar el resumen CPA.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    if (canModule && range) void load();
  }, [canModule, range, load]);

  const columns: ColumnsType<CpaResumenRow> = useMemo(
    () => [
      { title: "Meses", dataIndex: "meses", key: "mes", width: 120, render: (v) => v || "—" },
      { title: "SEMANA", dataIndex: "semana", key: "sem", width: 160, render: (v) => v || "—" },
      { title: "Fecha", dataIndex: "fecha", key: "fec", width: 88, render: (v) => v ?? "—" },
      { title: "Producto", dataIndex: "producto", key: "prod", width: 100, render: (v) => v ?? "—" },
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
          Vista tipo tabla dinámica del Excel <em>RESUMEN_DIARIO</em>: todos los productos sumados por día, con
          subtotales por semana, mes y total general. Los datos provienen de{" "}
          <Link to="/app/cpa-experimental">CPA experimental</Link> (calcula cada producto antes).
        </Text>
      </div>

      <Alert
        type="info"
        showIcon
        message="Requisito"
        description="Debes haber calculado el rango en CPA experimental para cada producto que quieras incluir. Sin filas en BD, el resumen saldrá vacío."
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
            <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              Actualizar
            </Button>
          </Col>
        </Row>
      </Card>

      <Card title="Resumen diario">
        <Table
          rowKey={rowKey}
          size="small"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={false}
          scroll={{ x: "max-content" }}
          onRow={(row) => ({
            style: {
              fontWeight: row.kind !== "day" ? 600 : undefined,
              background:
                row.kind === "grandTotal"
                  ? "rgba(22, 119, 255, 0.12)"
                  : row.kind !== "day"
                    ? "rgba(148, 163, 184, 0.08)"
                    : undefined,
            },
          })}
        />
      </Card>
    </Space>
  );
}
