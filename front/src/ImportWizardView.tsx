import { useState } from "react";
import { Alert, Button, Card, Col, Input, Modal, Row, Space, Typography, Upload, message } from "antd";
import { DeleteOutlined, InboxOutlined } from "@ant-design/icons";
import { isAxiosError } from "axios";
import type { ImportEndpoint, ImportResult } from "./api";
import { importFile, wipeCpa, wipeImportedTables } from "./api";

const { Dragger } = Upload;
const { Title, Text, Paragraph } = Typography;

const STEPS: { key: ImportEndpoint; title: string; description: string }[] = [
  { key: "cartera", title: "Cartera", description: "Archivo HISTORIAL DE CARTERA (Dropi)." },
  { key: "productos", title: "Productos", description: "Export de productos por pedido (Dropi)." },
  { key: "pedidos", title: "Pedidos", description: "Pedidos al final del flujo (tras cartera y productos)." },
];

export function ImportWizardView({ canAdmin }: { canAdmin: boolean }) {
  const [results, setResults] = useState<Record<ImportEndpoint, ImportResult | null>>({
    cartera: null,
    productos: null,
    pedidos: null,
  });
  const [loading, setLoading] = useState<Record<ImportEndpoint, boolean>>({
    cartera: false,
    productos: false,
    pedidos: false,
  });
  const [progress, setProgress] = useState<Record<ImportEndpoint, number>>({
    cartera: 0,
    productos: 0,
    pedidos: 0,
  });
  const [wipePwd, setWipePwd] = useState("");
  const [wipeBusy, setWipeBusy] = useState<"imported" | "cpa" | null>(null);

  const handleUpload = async (endpoint: ImportEndpoint, file: File) => {
    setLoading((p) => ({ ...p, [endpoint]: true }));
    setProgress((p) => ({ ...p, [endpoint]: 0 }));
    setResults((p) => ({ ...p, [endpoint]: null }));
    try {
      const result = await importFile(endpoint, file, (pct) => setProgress((p) => ({ ...p, [endpoint]: pct })));
      setResults((p) => ({ ...p, [endpoint]: result }));
      message.success(`${endpoint}: importados ${result.imported}`);
    } catch (e: unknown) {
      let detail = "Error de red o servidor";
      if (isAxiosError(e)) {
        const body = e.response?.data as { message?: string } | undefined;
        detail = body?.message?.trim() || e.message || detail;
      } else if (e instanceof Error) {
        detail = e.message;
      }
      message.error(`Error al importar ${endpoint}: ${detail}`);
      setResults((p) => ({ ...p, [endpoint]: { imported: 0, errors: [detail] } }));
    } finally {
      setLoading((p) => ({ ...p, [endpoint]: false }));
    }
    return false;
  };

  const confirmWipeImported = () => {
    const pwd = wipePwd.trim();
    if (!pwd) {
      message.warning("Escribe IMPORT_WIPE_SECRET (contraseña de limpieza del servidor).");
      return;
    }
    Modal.confirm({
      title: "¿Borrar datos importados de esta empresa?",
      content: (
        <Paragraph>
          Se eliminarán pedidos, líneas de producto y movimientos de cartera de la empresa activa. Otras empresas no se
          ven afectadas.
        </Paragraph>
      ),
      okText: "Sí, borrar",
      okButtonProps: { danger: true },
      onOk: async () => {
        setWipeBusy("imported");
        try {
          const r = await wipeImportedTables(pwd);
          message.success(
            `Borrado: pedidos ${r.deleted.pedidos}, productos ${r.deleted.productos_detalle}, cartera ${r.deleted.cartera_movimientos}`,
          );
        } catch {
          message.error("No se pudo limpiar (revisa contraseña y IMPORT_WIPE_SECRET en el backend).");
        } finally {
          setWipeBusy(null);
        }
      },
    });
  };

  const confirmWipeCpa = () => {
    const pwd = wipePwd.trim();
    if (!pwd) {
      message.warning("Escribe IMPORT_WIPE_SECRET.");
      return;
    }
    Modal.confirm({
      title: "¿Borrar filas CPA de esta empresa?",
      okText: "Sí, borrar CPA",
      okButtonProps: { danger: true },
      onOk: async () => {
        setWipeBusy("cpa");
        try {
          const r = await wipeCpa(pwd);
          message.success(`CPA eliminadas: ${r.deleted}`);
        } catch {
          message.error("No se pudo limpiar CPA.");
        } finally {
          setWipeBusy(null);
        }
      },
    });
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Title level={3}>Importaciones</Title>
      <Paragraph type="secondary">
        Mismo flujo y archivos que en el panel original (Dropi/Petho); aquí los datos se aplican{" "}
        <Text strong>solo a la empresa seleccionada</Text> en el encabezado. Orden recomendado:{" "}
        <Text strong>cartera → productos → pedidos</Text>. Carga antes el mapeo de estados si no quieres ver todo en
        «SIN MAPEAR».
      </Paragraph>
      <Row gutter={[16, 16]}>
        {STEPS.map((s) => (
          <Col xs={24} md={8} key={s.key}>
            <Card title={s.title}>
              <Paragraph type="secondary" style={{ minHeight: 48 }}>
                {s.description}
              </Paragraph>
              <Dragger
                accept=".xlsx,.xls"
                multiple={false}
                showUploadList={false}
                disabled={loading[s.key]}
                beforeUpload={(file) => handleUpload(s.key, file)}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">Arrastra o elige archivo</p>
                {loading[s.key] ? <Text type="secondary">Subiendo… {progress[s.key]}%</Text> : null}
              </Dragger>
              {results[s.key]?.errors.length ? (
                <Alert style={{ marginTop: 12 }} type="warning" message="Errores" description={results[s.key]!.errors.join("\n")} />
              ) : null}
            </Card>
          </Col>
        ))}
      </Row>

      {canAdmin ? (
        <div className="import-wipe-zone">
        <Card title="Zona peligrosa — limpieza (solo ADMIN)" extra={<DeleteOutlined />}>
          <Paragraph type="secondary">
            Contraseña = valor de <Text code>IMPORT_WIPE_SECRET</Text> en el backend. Solo afecta la empresa seleccionada
            en el encabezado.
          </Paragraph>
          <Space wrap>
            <Input.Password
              style={{ minWidth: 260 }}
              placeholder="IMPORT_WIPE_SECRET"
              value={wipePwd}
              onChange={(e) => setWipePwd(e.target.value)}
            />
            <Button danger loading={wipeBusy === "imported"} onClick={confirmWipeImported}>
              Limpiar pedidos / productos / cartera
            </Button>
            <Button danger type="default" loading={wipeBusy === "cpa"} onClick={confirmWipeCpa}>
              Limpiar CPA
            </Button>
          </Space>
        </Card>
        </div>
      ) : null}
    </Space>
  );
}
