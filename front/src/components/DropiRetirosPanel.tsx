import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { fetchDropiWithdrawals, patchDropiWithdrawalNota } from "../api";
import { useAuth } from "../contexts/AuthContext";
import type { DropiWithdrawalRow } from "../types";

const { Text, Paragraph } = Typography;

function fmtMonto(s: string | null): string {
  if (s == null || s === "") return "—";
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(n);
}

export function DropiRetirosPanel() {
  const { user } = useAuth();
  const activeCompany = user?.activeCompany;
  const canEditNota = user?.role === "ADMIN" || user?.role === "OPERADOR";

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DropiWithdrawalRow[]>([]);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchDropiWithdrawals();
      setRows(list);
      setDraftNotes(Object.fromEntries(list.map((r) => [r.id, r.notaAdicional ?? ""])));
    } catch {
      message.error("No se pudieron cargar los retiros.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, activeCompany]);

  const columns: ColumnsType<DropiWithdrawalRow> = useMemo(
    () => [
      {
        title: "Fecha",
        dataIndex: "fecha",
        key: "fecha",
        width: 150,
        render: (v: string | null) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "—"),
      },
      {
        title: "ID movimiento Dropi",
        dataIndex: "dropiMovementId",
        key: "mid",
        width: 130,
        ellipsis: true,
      },
      {
        title: "Monto",
        dataIndex: "monto",
        key: "monto",
        width: 120,
        align: "right",
        render: (v: string | null) => fmtMonto(v),
      },
      {
        title: "Concepto (import)",
        dataIndex: "conceptoRetiro",
        key: "concepto",
        ellipsis: true,
        render: (v: string | null) => v || "—",
      },
      {
        title: "Descripción",
        dataIndex: "descripcion",
        key: "desc",
        width: 220,
        ellipsis: true,
        render: (v: string | null) => v || "—",
      },
      {
        title: "Nota adicional",
        key: "nota",
        width: 280,
        render: (_: unknown, record: DropiWithdrawalRow) => {
          if (!canEditNota) {
            return record.notaAdicional?.trim() ? record.notaAdicional : <Text type="secondary">—</Text>;
          }
          return (
            <Space direction="vertical" size={6} style={{ width: "100%" }}>
              <Input.TextArea
                rows={2}
                placeholder="Nota interna (no sustituye el concepto del Excel)"
                value={draftNotes[record.id] ?? ""}
                onChange={(e) => setDraftNotes((p) => ({ ...p, [record.id]: e.target.value }))}
              />
              <Button
                size="small"
                type="primary"
                loading={savingId === record.id}
                onClick={async () => {
                  const raw = (draftNotes[record.id] ?? "").trim();
                  setSavingId(record.id);
                  try {
                    const updated = await patchDropiWithdrawalNota(record.id, raw === "" ? null : raw);
                    setRows((prev) => prev.map((r) => (r.id === record.id ? updated : r)));
                    setDraftNotes((p) => ({ ...p, [record.id]: updated.notaAdicional ?? "" }));
                    message.success("Nota guardada.");
                  } catch {
                    message.error("No se pudo guardar la nota.");
                  } finally {
                    setSavingId(null);
                  }
                }}
              >
                Guardar nota
              </Button>
            </Space>
          );
        },
      },
    ],
    [canEditNota, draftNotes, savingId],
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Filas cuya <strong>descripción</strong> es «SALIDA POR PETICION DE RETIRO DE SALDO EN CARTERA» en el historial de cartera
        Dropi (último import). Los datos del
        archivo no se editan aquí; solo puedes añadir una <strong>nota adicional</strong>. Los registros corresponden a la{" "}
        <strong>empresa activa</strong> del selector superior.
      </Paragraph>
      <Table<DropiWithdrawalRow>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 15, showSizeChanger: true }}
        scroll={{ x: 1100 }}
        locale={{ emptyText: "Sin retiros importados. Importa la cartera para poblar esta lista." }}
      />
    </Space>
  );
}
