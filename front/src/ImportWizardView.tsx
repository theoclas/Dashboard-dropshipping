import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Col, Input, Modal, Row, Space, Table, Tag, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, InboxOutlined, UndoOutlined } from "@ant-design/icons";
import { isAxiosError } from "axios";
import dayjs from "dayjs";
import type { ImportBatchRow, ImportEndpoint, ImportResult } from "./api";
import { fetchImportBatches, importFile, undoImportBatch, wipeCpa, wipeImportedTables } from "./api";
import { usePermission } from "./hooks/usePermission";

const { Dragger } = Upload;
const { Title, Text, Paragraph } = Typography;

const STEPS: { key: ImportEndpoint; title: string; description: string }[] = [
  { key: "cartera", title: "Cartera", description: "Archivo HISTORIAL DE CARTERA (Dropi)." },
  { key: "productos", title: "Productos", description: "Export de productos por pedido (Dropi)." },
  { key: "pedidos", title: "Pedidos", description: "Pedidos al final del flujo (tras cartera y productos)." },
];

const KIND_LABELS: Record<ImportBatchRow["kind"], string> = {
  CARTERA: "Cartera",
  PRODUCTOS: "Productos",
  PEDIDOS: "Pedidos",
};

export function ImportWizardView({ canAdmin }: { canAdmin: boolean }) {
  const canImportDropi = usePermission("actionImportarDropi");
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
  const [batches, setBatches] = useState<ImportBatchRow[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    if (!canImportDropi) return;
    setBatchesLoading(true);
    try {
      setBatches(await fetchImportBatches());
    } catch {
      setBatches([]);
    } finally {
      setBatchesLoading(false);
    }
  }, [canImportDropi]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  const handleUpload = async (endpoint: ImportEndpoint, file: File) => {
    setLoading((p) => ({ ...p, [endpoint]: true }));
    setProgress((p) => ({ ...p, [endpoint]: 0 }));
    setResults((p) => ({ ...p, [endpoint]: null }));
    try {
      const result = await importFile(endpoint, file, (pct) => setProgress((p) => ({ ...p, [endpoint]: pct })));
      setResults((p) => ({ ...p, [endpoint]: result }));
      void loadBatches();
      message.success(
        `${endpoint}: importados ${result.imported}` +
          (endpoint === "cartera" && typeof result.retirosUpserted === "number"
            ? `; retiros Dropi ${result.retirosUpserted}`
            : ""),
      );
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
          Se eliminarán pedidos, líneas de producto, movimientos de cartera y retiros Dropi de la empresa activa. Otras
          empresas no se ven afectadas.
        </Paragraph>
      ),
      okText: "Sí, borrar",
      okButtonProps: { danger: true },
      onOk: async () => {
        setWipeBusy("imported");
        try {
          const r = await wipeImportedTables(pwd);
          message.success(
            `Borrado: pedidos ${r.deleted.pedidos}, productos ${r.deleted.productos_detalle}, cartera ${r.deleted.cartera_movimientos}, retiros Dropi ${r.deleted.retiros_dropi}`,
          );
        } catch (e: unknown) {
          const msg =
            (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            "No se pudo limpiar (revisa contraseña y IMPORT_WIPE_SECRET en el backend).";
          message.error(msg);
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
        } catch (e: unknown) {
          const msg =
            (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            "No se pudo limpiar CPA.";
          message.error(msg);
        } finally {
          setWipeBusy(null);
        }
      },
    });
  };

  const confirmUndoBatch = (row: ImportBatchRow) => {
    Modal.confirm({
      title: "¿Deshacer esta importación?",
      content: (
        <Paragraph style={{ marginBottom: 0 }}>
          Se revertirán los cambios del archivo <strong>{row.fileName ?? "sin nombre"}</strong> (
          {KIND_LABELS[row.kind]}, {row.imported} filas). Los pedidos nuevos de ese lote se eliminarán; los que ya
          existían volverán a su estado anterior. Productos restaura las líneas que había antes del archivo.
        </Paragraph>
      ),
      okText: "Sí, deshacer",
      okButtonProps: { danger: true },
      onOk: async () => {
        setUndoingId(row.id);
        try {
          const r = await undoImportBatch(row.id);
          const parts = [
            ...Object.entries(r.deleted).map(([k, n]) => `eliminados ${k}: ${n}`),
            ...Object.entries(r.restored).map(([k, n]) => `restaurados ${k}: ${n}`),
          ];
          message.success(parts.length ? parts.join("; ") : "Importación deshecha.");
          void loadBatches();
        } catch (e: unknown) {
          const msg =
            (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            "No se pudo deshacer.";
          message.error(msg);
        } finally {
          setUndoingId(null);
        }
      },
    });
  };

  const batchColumns: ColumnsType<ImportBatchRow> = [
    {
      title: "Fecha",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 150,
      render: (v: string) => dayjs(v).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "Tipo",
      dataIndex: "kind",
      key: "kind",
      width: 100,
      render: (k: ImportBatchRow["kind"]) => KIND_LABELS[k],
    },
    {
      title: "Archivo",
      dataIndex: "fileName",
      key: "fileName",
      ellipsis: true,
      render: (v: string | null) => v ?? "—",
    },
    {
      title: "Filas",
      dataIndex: "imported",
      key: "imported",
      width: 72,
      align: "right",
    },
    {
      title: "Estado",
      key: "st",
      width: 110,
      render: (_, r) =>
        r.undoneAt ? <Tag color="default">Deshecho</Tag> : <Tag color="success">Activo</Tag>,
    },
    {
      title: "",
      key: "act",
      width: 120,
      render: (_, r) =>
        r.undoneAt ? null : (
          <Button
            size="small"
            icon={<UndoOutlined />}
            loading={undoingId === r.id}
            onClick={() => confirmUndoBatch(r)}
          >
            Deshacer
          </Button>
        ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Title level={3}>Importaciones</Title>
      <Paragraph type="secondary">
        Mismo flujo y archivos que en el panel original (Dropi/Petho); aquí los datos se aplican{" "}
        <Text strong>solo a la empresa seleccionada</Text> en el encabezado. Orden recomendado:{" "}
        <Text strong>cartera → productos → pedidos</Text>. Carga antes el mapeo de estados si no quieres ver todo en
        «SIN MAPEAR».
      </Paragraph>
      {!canImportDropi ? (
        <Alert
          type="warning"
          showIcon
          message="No tienes permiso para importar archivos Dropi. Un administrador puede activarlo en Rol y permisos → Importar → Ver acciones."
        />
      ) : null}
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
                disabled={loading[s.key] || !canImportDropi}
                beforeUpload={(file) => {
                  if (!canImportDropi) {
                    message.warning("Sin permiso para importar archivos Dropi.");
                    return Upload.LIST_IGNORE;
                  }
                  return handleUpload(s.key, file);
                }}
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

      {canImportDropi ? (
        <Card
          title="Historial de importaciones (deshacer)"
          extra={
            <Button size="small" onClick={() => void loadBatches()} loading={batchesLoading}>
              Actualizar
            </Button>
          }
        >
          <Paragraph type="secondary" style={{ marginTop: 0 }}>
            Cada subida de cartera, productos o pedidos queda registrada. Puedes deshacer un lote concreto si subiste el
            archivo equivocado (otra tienda, archivo erróneo, etc.) sin borrar todo con la zona peligrosa.
          </Paragraph>
          <Table<ImportBatchRow>
            size="small"
            rowKey="id"
            loading={batchesLoading}
            dataSource={batches}
            columns={batchColumns}
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
            locale={{ emptyText: "Aún no hay importaciones registradas en esta empresa." }}
          />
        </Card>
      ) : null}

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
