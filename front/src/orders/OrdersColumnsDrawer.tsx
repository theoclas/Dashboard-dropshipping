import { useEffect, useState } from "react";
import { Button, Checkbox, Drawer, Select, Space, Typography } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import type { OrdersTableConfig, OrdersTableColumnEntry } from "../types";
import {
  DEFAULT_ORDERS_TABLE_CONFIG,
  ORDERS_COLUMN_LABELS,
  mergeOrdersTableConfig,
} from "./ordersTableConfig";

const { Text } = Typography;

type Props = {
  open: boolean;
  savedConfig: OrdersTableConfig | null | undefined;
  onClose: () => void;
  onSave: (config: OrdersTableConfig) => Promise<void>;
};

export function OrdersColumnsDrawer({ open, savedConfig, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<OrdersTableColumnEntry[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const merged = mergeOrdersTableConfig(savedConfig ?? null);
    setDraft(merged.columns.map((c) => ({ ...c })));
  }, [open, savedConfig]);

  const move = (index: number, delta: number) => {
    const next = [...draft];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    if (next[index]?.key === "acciones" || next[target]?.key === "acciones") return;
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    setDraft(next);
  };

  const updateEntry = (key: string, patch: Partial<OrdersTableColumnEntry>) => {
    setDraft((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        version: 1,
        columns: draft.map((c) =>
          c.key === "acciones"
            ? { key: c.key, visible: true, pin: "right" as const }
            : { key: c.key, visible: c.visible, pin: c.pin },
        ),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(DEFAULT_ORDERS_TABLE_CONFIG.columns.map((c) => ({ ...c })));
  };

  return (
    <Drawer
      title="Configurar columnas"
      open={open}
      onClose={onClose}
      width={420}
      extra={
        <Space>
          <Button onClick={handleReset}>Restaurar predeterminado</Button>
          <Button type="primary" loading={saving} onClick={() => void handleSave()}>
            Guardar
          </Button>
        </Space>
      }
    >
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        Ordena, muestra u oculta columnas y fíjalas a la izquierda o derecha al hacer scroll horizontal.
        «Acciones» siempre queda visible a la derecha.
      </Text>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        {draft.map((col, index) => {
          const isAcciones = col.key === "acciones";
          return (
            <div
              key={col.key}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                padding: "8px 0",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <Space size={4}>
                <Button
                  size="small"
                  icon={<ArrowUpOutlined />}
                  disabled={index === 0 || isAcciones}
                  onClick={() => move(index, -1)}
                />
                <Button
                  size="small"
                  icon={<ArrowDownOutlined />}
                  disabled={index >= draft.length - 1 || isAcciones}
                  onClick={() => move(index, 1)}
                />
              </Space>
              <Checkbox
                checked={isAcciones ? true : col.visible}
                disabled={isAcciones}
                onChange={(e) => updateEntry(col.key, { visible: e.target.checked })}
              >
                {ORDERS_COLUMN_LABELS[col.key] ?? col.key}
              </Checkbox>
              <Select
                size="small"
                style={{ width: 120 }}
                disabled={isAcciones}
                placeholder="Fijar"
                allowClear
                value={isAcciones ? "right" : col.pin}
                onChange={(v) => updateEntry(col.key, { pin: v ?? undefined })}
                options={[
                  { value: "left", label: "Izquierda" },
                  { value: "right", label: "Derecha" },
                ]}
              />
            </div>
          );
        })}
      </Space>
    </Drawer>
  );
}
