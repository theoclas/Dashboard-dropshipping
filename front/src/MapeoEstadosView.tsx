import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Modal, Space, Table, Typography, Upload, message } from "antd";
import { InboxOutlined, ReloadOutlined } from "@ant-design/icons";
import { api, importMapeoEstadosFile, remapearEstados } from "./api";
import type { MapeoEstadoRow } from "./types";

const { Dragger } = Upload;

export function MapeoEstadosView() {
  const [rows, setRows] = useState<MapeoEstadoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [remapearBusy, setRemapearBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MapeoEstadoRow | null>(null);
  const [form] = Form.useForm();

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<MapeoEstadoRow[]>("/mapeo-estados");
      setRows(data);
    } catch {
      message.error("No se pudo cargar mapeo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(r: MapeoEstadoRow) {
    setEditing(r);
    form.setFieldsValue({
      transportadora: r.transportadora,
      estatusOriginal: r.estatusOriginal,
      ultimoMovimiento: r.ultimoMovimiento,
      estadoUnificado: r.estadoUnificado,
    });
    setModalOpen(true);
  }

  async function submitMapeo() {
    const v = await form.validateFields();
    try {
      if (editing) {
        await api.patch(`/mapeo-estados/${editing.id}`, {
          transportadora: v.transportadora ?? "",
          estadoUnificado: v.estadoUnificado,
        });
        message.success("Actualizado.");
      } else {
        await api.post("/mapeo-estados", {
          transportadora: v.transportadora,
          estatusOriginal: v.estatusOriginal,
          ultimoMovimiento: v.ultimoMovimiento,
          estadoUnificado: v.estadoUnificado,
        });
        message.success("Creado.");
      }
      setModalOpen(false);
      await load();
    } catch {
      message.error("No se pudo guardar.");
    }
  }

  async function removeRow(id: string) {
    Modal.confirm({
      title: "¿Eliminar esta fila de mapeo?",
      onOk: async () => {
        try {
          await api.delete(`/mapeo-estados/${id}`);
          message.success("Eliminado.");
          await load();
        } catch {
          message.error("No se pudo eliminar.");
        }
      },
    });
  }

  async function onRemapear() {
    setRemapearBusy(true);
    try {
      const r = await remapearEstados();
      message.success(`Procesados: ${r.procesados}, remapeados: ${r.remapeados}`);
      message.info("Vuelve a Pedidos o reimporta si necesitas refrescar la tabla.");
    } catch {
      message.error("Remapeo falló.");
    } finally {
      setRemapearBusy(false);
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Typography.Title level={3}>Mapeo de estados</Typography.Title>
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Button type="primary" onClick={openCreate}>
            Nuevo mapeo
          </Button>
          <Button icon={<ReloadOutlined />} loading={remapearBusy} onClick={() => void onRemapear()}>
            Remapear pedidos «SIN MAPEAR»
          </Button>
        </Space>
        <Typography.Paragraph type="secondary">
          Importa un Excel con las columnas esperadas (estatus original, transportadora, último movimiento, estado
          unificado). Luego usa Remapear para aplicar a pedidos ya importados.
        </Typography.Paragraph>
        <Dragger
          accept=".xlsx,.xls"
          multiple={false}
          showUploadList={false}
          disabled={importBusy}
          beforeUpload={async (file) => {
            setImportBusy(true);
            setImportProgress(0);
            setImportResult(null);
            try {
              const res = await importMapeoEstadosFile(file, setImportProgress);
              setImportResult(res);
              message.success(`Mapeo importado: ${res.imported} filas`);
              await load();
            } catch {
              message.error("Error al importar mapeo.");
            } finally {
              setImportBusy(false);
            }
            return false;
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Excel de mapeo de estados</p>
          {importBusy ? <Typography.Text type="secondary">Subiendo… {importProgress}%</Typography.Text> : null}
        </Dragger>
        {importResult?.errors.length ? (
          <Alert style={{ marginTop: 12 }} type="warning" message="Errores" description={importResult.errors.join("\n")} />
        ) : null}
      </Card>
      <Table<MapeoEstadoRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        scroll={{ x: true }}
        columns={[
          { title: "Transportadora", dataIndex: "transportadora", width: 120 },
          { title: "Estatus original", dataIndex: "estatusOriginal", ellipsis: true },
          { title: "Último mov.", dataIndex: "ultimoMovimiento", ellipsis: true },
          { title: "Estado unificado", dataIndex: "estadoUnificado" },
          {
            title: "Acciones",
            key: "a",
            render: (_, r) => (
              <Space>
                <Button size="small" onClick={() => openEdit(r)}>
                  Editar
                </Button>
                <Button size="small" danger onClick={() => removeRow(r.id)}>
                  Borrar
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? "Editar mapeo" : "Nuevo mapeo"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void submitMapeo()}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Transportadora" name="transportadora">
            <Input placeholder="Vacío si aplica a todas" />
          </Form.Item>
          {!editing ? (
            <>
              <Form.Item label="Estatus original" name="estatusOriginal" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="Último movimiento" name="ultimoMovimiento">
                <Input placeholder="Opcional" />
              </Form.Item>
            </>
          ) : null}
          <Form.Item label="Estado unificado" name="estadoUnificado" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
