import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { AppstoreOutlined, PlusOutlined } from "@ant-design/icons";
import {
  createMetaAdsApp,
  deleteMetaAdsApp,
  fetchMetaAdsApps,
  updateMetaAdsApp,
} from "../../api";
import type { MetaAdsApp } from "../../types";

const { Title, Paragraph, Text } = Typography;

type FormValues = {
  name: string;
  metaAppId?: string;
  notes?: string;
  isActive?: boolean;
};

export function AdminMetaAdsAppsPage() {
  const [rows, setRows] = useState<MetaAdsApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MetaAdsApp | null>(null);
  const [form] = Form.useForm<FormValues>();

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchMetaAdsApps();
      setRows(list);
      if (list.length > 0 && !list.some((r) => r.id === selectedId)) {
        setSelectedId(list[0]!.id);
      }
    } catch {
      message.error("No se pudieron cargar las apps Meta.");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ isActive: true });
    setModalOpen(true);
  };

  const openEdit = (row: MetaAdsApp) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      metaAppId: row.metaAppId ?? undefined,
      notes: row.notes ?? undefined,
      isActive: row.isActive,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const payload = {
      name: values.name.trim(),
      metaAppId: values.metaAppId?.trim() || null,
      notes: values.notes?.trim() || null,
      isActive: values.isActive ?? true,
    };

    try {
      if (editing) {
        await updateMetaAdsApp(editing.id, payload);
        message.success("App Meta actualizada.");
      } else {
        const created = await createMetaAdsApp(payload);
        setSelectedId(created.id);
        message.success("App Meta creada.");
      }
      setModalOpen(false);
      await load();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Error")
          : "No se pudo guardar.";
      message.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMetaAdsApp(id);
      message.success("App eliminada.");
      if (selectedId === id) setSelectedId(null);
      await load();
    } catch {
      message.error("No se pudo eliminar.");
    }
  };

  const columns: ColumnsType<MetaAdsApp> = [
    {
      title: "Nombre",
      dataIndex: "name",
      key: "name",
      render: (name, row) => (
        <Space>
          <AppstoreOutlined />
          <span>{name}</span>
          {!row.isActive ? <Tag>Inactiva</Tag> : null}
        </Space>
      ),
    },
    {
      title: "App ID",
      dataIndex: "metaAppId",
      key: "metaAppId",
      width: 160,
      render: (v) => v ?? "—",
    },
    {
      title: "",
      key: "act",
      width: 160,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => openEdit(row)}>
            Editar
          </Button>
          <Popconfirm title="¿Eliminar esta app?" onConfirm={() => void handleDelete(row.id)}>
            <Button size="small" danger>
              Eliminar
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>
          Apps Meta
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8 }}>
          Catálogo de aplicaciones de Meta Developers (ej. FersuaStore Reportes). Asigna apps a usuarios del sistema en{" "}
          <Link to="/app/admin/meta-ads-usuarios">Usuarios Meta Ads</Link>; cada par usuario + app tiene su propio token.
        </Paragraph>
      </div>

      <Card
        title="Aplicaciones"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Agregar
          </Button>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={false}
          onRow={(row) => ({
            onClick: () => setSelectedId(row.id),
            style: {
              cursor: "pointer",
              background: selectedId === row.id ? "rgba(22, 119, 255, 0.08)" : undefined,
            },
          })}
        />
      </Card>

      {selected ? (
        <Card title={`Detalle — ${selected.name}`}>
          <Space direction="vertical">
            <div>
              <Text type="secondary">App ID</Text>
              <div>{selected.metaAppId ?? "—"}</div>
            </div>
            <div>
              <Text type="secondary">Notas</Text>
              <div>{selected.notes ?? "—"}</div>
            </div>
          </Space>
          <Button style={{ marginTop: 16 }} onClick={() => openEdit(selected)}>
            Editar
          </Button>
        </Card>
      ) : null}

      <Modal
        title={editing ? `Editar — ${editing.name}` : "Nueva app Meta"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSave()}
        okText="Guardar"
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Nombre" rules={[{ required: true, message: "Requerido" }]}>
            <Input placeholder="FersuaStore Reportes" />
          </Form.Item>
          <Form.Item name="metaAppId" label="App ID (opcional)">
            <Input placeholder="ID numérico de la app en Meta" />
          </Form.Item>
          <Form.Item name="notes" label="Notas">
            <Input.TextArea rows={2} placeholder="Caso de uso, permisos, etc." />
          </Form.Item>
          <Form.Item name="isActive" valuePropName="checked">
            <Checkbox>Activa</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
