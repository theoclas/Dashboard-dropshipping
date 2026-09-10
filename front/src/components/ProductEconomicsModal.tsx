import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, InputNumber, Modal, Space, Typography, message } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { patchCatalogProduct } from "../api";
import type { CatalogProduct, PrecioPack } from "../types";

const { Text } = Typography;

type Props = {
  producto: CatalogProduct | null;
  onClose: () => void;
  onSaved: (p: CatalogProduct) => void;
};

const moneda = {
  formatter: (v?: number | string) =>
    v === undefined || v === "" ? "" : `$ ${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`,
  parser: (v?: string) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0,
};

/**
 * Economía de un producto: el CPA de equilibrio y de dónde sale.
 *
 * Existe porque estos números **cambian**: el equilibrio del shampoo pasó de $26.493 a
 * $31.135 cuando maduraron las devoluciones de agosto. Tenerlos guardados con su fecha
 * evita decidir contra un umbral viejo, y hace que la API pueda emitir veredicto sola en
 * vez de que alguien recuerde la cifra.
 */
export function ProductEconomicsModal({ producto, onClose, onSaved }: Props) {
  const [form] = Form.useForm();
  const [guardando, setGuardando] = useState(false);
  const [precios, setPrecios] = useState<PrecioPack[]>([]);

  useEffect(() => {
    if (!producto) return;
    form.setFieldsValue({
      cpaObjetivo: producto.cpaObjetivo ?? null,
      cpaAlerta: producto.cpaAlerta ?? null,
      costoUnitario: producto.costoUnitario ?? null,
      proveedor: producto.proveedor ?? "",
      economiaNotas: producto.economiaNotas ?? "",
    });
    setPrecios(producto.precios ?? []);
  }, [producto, form]);

  const guardar = async () => {
    if (!producto) return;
    const v = await form.validateFields();
    setGuardando(true);
    try {
      const limpios = precios
        .filter((p) => p.unidades > 0 && p.precio > 0)
        .sort((a, b) => a.unidades - b.unidades);
      const row = await patchCatalogProduct(producto.id, {
        cpaObjetivo: v.cpaObjetivo ?? null,
        cpaAlerta: v.cpaAlerta ?? null,
        costoUnitario: v.costoUnitario ?? null,
        precios: limpios.length > 0 ? limpios : null,
        proveedor: v.proveedor?.trim() || null,
        economiaNotas: v.economiaNotas?.trim() || null,
      });
      message.success("Economía guardada.");
      onSaved(row);
      onClose();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg ?? "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      title={`Economía · ${producto?.name ?? ""}`}
      open={!!producto}
      onCancel={onClose}
      onOk={guardar}
      confirmLoading={guardando}
      okText="Guardar"
      cancelText="Cancelar"
      width={620}
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="El CPA objetivo no es el margen bruto"
        description={
          <>
            Es el <Text strong>margen neto esperado por pedido generado</Text>, contando que una
            parte se devuelve:
            <div style={{ margin: "6px 0", fontFamily: "monospace", fontSize: 12 }}>
              p × (ganancia por entregado) − (1 − p) × (pérdida por devuelto)
            </div>
            donde <Text code>p</Text> es la tasa de entrega entre pedidos <Text strong>ya
            resueltos</Text> — no sobre los enviados, que incluye los que siguen en tránsito y sale
            demasiado baja.
          </>
        }
      />

      <Form form={form} layout="vertical">
        <Space size={16} style={{ display: "flex" }}>
          <Form.Item
            name="cpaObjetivo"
            label="CPA objetivo"
            style={{ flex: 1 }}
            extra="Umbral duro: por encima, pierdes."
          >
            <InputNumber min={0} step={1000} style={{ width: "100%" }} {...moneda} />
          </Form.Item>
          <Form.Item
            name="cpaAlerta"
            label="CPA de alerta"
            style={{ flex: 1 }}
            extra="El equilibrio si la entrega empeora."
          >
            <InputNumber min={0} step={1000} style={{ width: "100%" }} {...moneda} />
          </Form.Item>
        </Space>

        <Space size={16} style={{ display: "flex" }}>
          <Form.Item name="costoUnitario" label="Costo por unidad" style={{ flex: 1 }}>
            <InputNumber min={0} step={500} style={{ width: "100%" }} {...moneda} />
          </Form.Item>
          <Form.Item name="proveedor" label="Proveedor" style={{ flex: 1 }}>
            <Input placeholder="Ej. calishop" maxLength={255} />
          </Form.Item>
        </Space>

        <Form.Item label="Precios por pack" style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
            El margen real vive aquí, no en la unidad suelta.
          </Text>
          {precios.map((p, i) => (
            <Space key={i} style={{ display: "flex", marginBottom: 8 }} align="baseline">
              <InputNumber
                min={1}
                value={p.unidades}
                onChange={(v) =>
                  setPrecios((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, unidades: Number(v) || 1 } : x)),
                  )
                }
                addonAfter="uds"
                style={{ width: 130 }}
              />
              <InputNumber
                min={0}
                step={1000}
                value={p.precio}
                onChange={(v) =>
                  setPrecios((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, precio: Number(v) || 0 } : x)),
                  )
                }
                style={{ width: 170 }}
                {...moneda}
              />
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                onClick={() => setPrecios((prev) => prev.filter((_, j) => j !== i))}
              />
            </Space>
          ))}
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() =>
              setPrecios((prev) => [
                ...prev,
                { unidades: prev.length > 0 ? prev[prev.length - 1]!.unidades + 1 : 2, precio: 0 },
              ])
            }
          >
            Añadir pack
          </Button>
        </Form.Item>

        <Form.Item
          name="economiaNotas"
          label="Cómo se calculó"
          extra="De qué periodo salió y con qué tasa de entrega. Dentro de un mes no te vas a acordar."
        >
          <Input.TextArea
            rows={3}
            maxLength={2000}
            placeholder="Ej. Agosto maduro, 136 pedidos resueltos: entrega 83,1%, ganancia por entregado $40.467, pérdida por devuelto $14.717."
          />
        </Form.Item>

        {producto?.economiaActualizadaEn ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Última actualización: {new Date(producto.economiaActualizadaEn).toLocaleDateString("es-CO")}
          </Text>
        ) : null}
      </Form>
    </Modal>
  );
}
