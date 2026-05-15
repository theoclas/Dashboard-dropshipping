import { useEffect, useState } from "react";
import { Button, Space, Table, Tabs, Typography, message } from "antd";
import { api, downloadOrdersExport } from "../api";

type RentRow = { estadoUnificado: string | null; _count: { estadoUnificado: number } };
type LogRow = { ciudad: string | null; _count: { ciudad: number } };

export function ReportsPage() {
  const [rentability, setRentability] = useState<RentRow[]>([]);
  const [logistics, setLogistics] = useState<LogRow[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [r, l] = await Promise.all([
          api.get<RentRow[]>("/reports/rentability"),
          api.get<LogRow[]>("/reports/logistics"),
        ]);
        setRentability(r.data);
        setLogistics(l.data);
      } catch {
        message.error("No se pudieron cargar reportes.");
      }
    })();
  }, []);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Typography.Title level={3}>Reportes</Typography.Title>
      <Button type="primary" onClick={() => void downloadOrdersExport().then(() => message.success("Descarga iniciada.")).catch(() => message.error("Error al exportar."))}>
        Descargar pedidos (Excel)
      </Button>
      <Tabs
        items={[
          {
            key: "rentability",
            label: "Rentabilidad por estado unificado",
            children: (
              <Table
                rowKey={(row) => String(row.estadoUnificado ?? "null")}
                dataSource={rentability}
                columns={[
                  { title: "Estado unificado", dataIndex: "estadoUnificado", render: (v) => v ?? "—" },
                  { title: "Cantidad", render: (row) => row._count.estadoUnificado },
                ]}
              />
            ),
          },
          {
            key: "logistics",
            label: "Logística por ciudad",
            children: (
              <Table
                rowKey={(row) => String(row.ciudad ?? "null")}
                dataSource={logistics}
                columns={[
                  { title: "Ciudad", dataIndex: "ciudad", render: (v) => v ?? "—" },
                  { title: "Pedidos", render: (row) => row._count.ciudad },
                ]}
              />
            ),
          },
        ]}
      />
    </Space>
  );
}
