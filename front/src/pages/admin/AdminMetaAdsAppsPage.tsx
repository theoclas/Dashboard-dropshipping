import { useCallback, useEffect, useState } from "react";
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
  Divider,
  Select,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { AdminPageHeader } from "./AdminPageHeader";
import { AppstoreOutlined, PlusOutlined } from "@ant-design/icons";
import {
  createMetaAdsApp,
  deleteMetaAdsApp,
  fetchMetaAdsApps,
  updateMetaAdsApp,
  fetchCompanies,
  setMetaAdsAppCompanies,
} from "../../api";
import type { Company, MetaAdsApp } from "../../types";

const { Text } = Typography;

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
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [empresasElegidas, setEmpresasElegidas] = useState<string[]>([]);
  const [guardandoEmpresas, setGuardandoEmpresas] = useState(false);
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
    void (async () => {
      try {
        setEmpresas(await fetchCompanies());
      } catch {
        message.error("No se pudieron cargar las empresas.");
      }
    })();
  }, []);

  // Al cambiar de app seleccionada, la lista vuelve a lo guardado.
  useEffect(() => {
    setEmpresasElegidas(selected?.companies.map((c) => c.id) ?? []);
  }, [selected?.id, selected?.companies]);

  const guardarEmpresas = useCallback(async () => {
    if (!selected) return;
    setGuardandoEmpresas(true);
    try {
      await setMetaAdsAppCompanies(selected.id, empresasElegidas);
      message.success("Empresas actualizadas.");
      await load();
    } catch (e) {
      const r = e as { response?: { data?: { message?: string } } };
      message.error(r?.response?.data?.message ?? "No se pudo guardar.");
    } finally {
      setGuardandoEmpresas(false);
    }
  }, [selected, empresasElegidas, load]);

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
      title: "Empresas",
      key: "companies",
      render: (_: unknown, row: MetaAdsApp) =>
        row.companies.length === 0 ? (
          <Tag color="red">Ninguna</Tag>
        ) : (
          <Space size={4} wrap>
            {row.companies.map((c) => (
              <Tag key={c.id}>{c.name}</Tag>
            ))}
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
      <AdminPageHeader
        title="Apps Meta"
        subtitle="Catálogo de aplicaciones de Meta Developers. Cada par usuario + app tiene su propio token; se asignan en Usuarios Meta Ads."
      />

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

          <Divider orientationMargin={0}>Empresas que pueden usarla</Divider>
          <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
            Las empresas que no estén aquí no verán esta app al importar campañas.
          </Text>
          <Space.Compact style={{ width: "100%", maxWidth: 620 }}>
            <Select
              mode="multiple"
              allowClear={false}
              style={{ width: "100%" }}
              placeholder="Elige una o varias empresas"
              value={empresasElegidas}
              onChange={setEmpresasElegidas}
              options={empresas.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Button
              type="primary"
              loading={guardandoEmpresas}
              disabled={
                empresasElegidas.length === 0 ||
                (empresasElegidas.length === selected.companies.length &&
                  empresasElegidas.every((id) => selected.companies.some((c) => c.id === id)))
              }
              onClick={() => void guardarEmpresas()}
            >
              Guardar
            </Button>
          </Space.Compact>
          {empresasElegidas.length === 0 ? (
            <Text type="danger" style={{ display: "block", marginTop: 6, fontSize: 12 }}>
              Tiene que quedar al menos una: si no, la app desaparece de todos los selectores.
            </Text>
          ) : null}
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
            <Input placeholder="Allset Reportes" />
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
