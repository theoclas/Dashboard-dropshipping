import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { AdminPageHeader } from "./AdminPageHeader";
import { BankOutlined, KeyOutlined, MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  createMetaAdsSystemUser,
  fetchCompanies,
  deleteMetaAdsSystemUser,
  fetchMetaAdsApps,
  fetchMetaAdsSystemUsers,
  setMetaAdsSystemUserCompanies,
  updateMetaAdsSystemUser,
} from "../../api";
import type { Company, MetaAdsApp, MetaAdsSystemUser } from "../../types";

const { Text } = Typography;

type AppAccessFormRow = {
  appId: string;
  accessToken?: string;
  tokenExpiresAt?: dayjs.Dayjs | null;
  isDefault?: boolean;
};

type FormValues = {
  name: string;
  metaSystemUserId?: string;
  notes?: string;
  isActive?: boolean;
  appAccess: AppAccessFormRow[];
};

export function AdminMetaAdsUsersPage() {
  const [rows, setRows] = useState<MetaAdsSystemUser[]>([]);
  const [apps, setApps] = useState<MetaAdsApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MetaAdsSystemUser | null>(null);
  const [form] = Form.useForm<FormValues>();
  // Asignacion a empresas: se edita aparte del formulario de tokens porque es otra
  // decision (quien puede usarlo) y no queremos obligar a repasar tokens para tocarla.
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [empresasElegidas, setEmpresasElegidas] = useState<string[]>([]);
  const [guardandoEmpresas, setGuardandoEmpresas] = useState(false);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    void (async () => {
      try {
        setEmpresas(await fetchCompanies());
      } catch {
        message.error("No se pudieron cargar las empresas.");
      }
    })();
  }, []);

  // Al cambiar de usuario seleccionado, la lista vuelve a lo que hay guardado.
  useEffect(() => {
    setEmpresasElegidas(selected?.companies.map((c) => c.id) ?? []);
  }, [selected?.id, selected?.companies]);

  const activeApps = apps.filter((a) => a.isActive);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, appList] = await Promise.all([fetchMetaAdsSystemUsers(), fetchMetaAdsApps()]);
      setRows(list);
      setApps(appList);
      if (list.length > 0 && !list.some((r) => r.id === selectedId)) {
        setSelectedId(list[0]!.id);
      }
    } catch {
      message.error("No se pudieron cargar los usuarios Meta Ads.");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const guardarEmpresas = useCallback(async () => {
    if (!selected) return;
    setGuardandoEmpresas(true);
    try {
      await setMetaAdsSystemUserCompanies(selected.id, empresasElegidas);
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
    form.setFieldsValue({
      isActive: true,
      appAccess: [{ isDefault: rows.length === 0 }],
    });
    setModalOpen(true);
  };

  const openEdit = (row: MetaAdsSystemUser) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      metaSystemUserId: row.metaSystemUserId ?? undefined,
      notes: row.notes ?? undefined,
      isActive: row.isActive,
      appAccess: row.apps.map((a) => ({
        appId: a.appId,
        tokenExpiresAt: a.tokenExpiresAt ? dayjs(a.tokenExpiresAt) : null,
        isDefault: a.isDefault,
      })),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const appAccess = (values.appAccess ?? []).filter((a) => a.appId);
    if (appAccess.length === 0) {
      message.warning("Asigna al menos una app.");
      return;
    }

    const payload = {
      name: values.name.trim(),
      metaSystemUserId: values.metaSystemUserId?.trim() || null,
      notes: values.notes?.trim() || null,
      isActive: values.isActive ?? true,
      appAccess: appAccess.map((a) => ({
        appId: a.appId,
        ...(a.accessToken?.trim() ? { accessToken: a.accessToken.trim() } : {}),
        tokenExpiresAt: a.tokenExpiresAt ? a.tokenExpiresAt.toISOString() : null,
        isDefault: a.isDefault ?? false,
      })),
    };

    try {
      if (editing) {
        const missingToken = appAccess.some(
          (a) => !a.accessToken?.trim() && !editing.apps.find((ea) => ea.appId === a.appId)?.hasToken,
        );
        if (missingToken) {
          message.warning("Indica el token para cada app nueva o sin token guardado.");
          return;
        }
        await updateMetaAdsSystemUser(editing.id, payload);
        message.success("Usuario Meta Ads actualizado.");
      } else {
        const missingToken = appAccess.some((a) => !a.accessToken?.trim());
        if (missingToken) {
          message.warning("El token es obligatorio para cada app al crear.");
          return;
        }
        const created = await createMetaAdsSystemUser({
          ...payload,
          appAccess: appAccess.map((a) => ({
            appId: a.appId,
            accessToken: a.accessToken!.trim(),
            tokenExpiresAt: a.tokenExpiresAt ? a.tokenExpiresAt.toISOString() : null,
            isDefault: a.isDefault ?? false,
          })),
        });
        setSelectedId(created.id);
        message.success("Usuario Meta Ads creado.");
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
      await deleteMetaAdsSystemUser(id);
      message.success("Usuario eliminado.");
      if (selectedId === id) setSelectedId(null);
      await load();
    } catch {
      message.error("No se pudo eliminar.");
    }
  };

  const columns: ColumnsType<MetaAdsSystemUser> = [
    {
      title: "Nombre",
      dataIndex: "name",
      key: "name",
      render: (name, row) => (
        <Space>
          <KeyOutlined />
          <span>{name}</span>
          {!row.isActive ? <Tag>Inactivo</Tag> : null}
        </Space>
      ),
    },
    {
      title: "Apps",
      key: "apps",
      render: (_, row) =>
        row.apps.length > 0 ? (
          <Space wrap size={[4, 4]}>
            {row.apps.map((a) => (
              <Tag key={a.appId} color={a.isDefault ? "blue" : undefined}>
                {a.appName}
                {a.isDefault ? " ★" : ""}
              </Tag>
            ))}
          </Space>
        ) : (
          "—"
        ),
    },
    {
      title: "Empresas",
      key: "companies",
      render: (_: unknown, row: MetaAdsSystemUser) =>
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
      title: "ID sistema",
      dataIndex: "metaSystemUserId",
      key: "mid",
      width: 140,
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
          <Popconfirm title="¿Eliminar este usuario Meta?" onConfirm={() => void handleDelete(row.id)}>
            <Button size="small" danger>
              Eliminar
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const appAccessColumns: ColumnsType<MetaAdsSystemUser["apps"][number]> = [
    { title: "App", dataIndex: "appName", key: "appName" },
    { title: "App ID", dataIndex: "metaAppId", key: "metaAppId", render: (v) => v ?? "—" },
    { title: "Token", dataIndex: "tokenMasked", key: "token", render: (v) => v ?? "—" },
    {
      title: "Expira",
      dataIndex: "tokenExpiresAt",
      key: "exp",
      render: (v) => (v ? dayjs(v).format("DD/MM/YYYY HH:mm") : "Sin fecha"),
    },
    {
      title: "Por defecto",
      dataIndex: "isDefault",
      key: "def",
      render: (v) => (v ? <Tag color="blue">Sí</Tag> : "—"),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <AdminPageHeader
        title="Usuarios Meta Ads"
        subtitle={
          <>
            Usuarios del sistema de Meta, como en Business Manager. Cada uno puede tener varias{" "}
            <Link to="/app/admin/meta-ads-apps">apps Meta</Link> con su propio token. Si no eliges
            app y usuario al importar, se usa el par marcado <em>por defecto</em>.
          </>
        }
      />

      {activeApps.length === 0 ? (
        <Alert
          type="info"
          showIcon
          message={
            <>
              Crea al menos una app en <Link to="/app/admin/meta-ads-apps">Apps Meta</Link> antes de asignar tokens a
              usuarios.
            </>
          }
        />
      ) : null}

      <Alert
        type="warning"
        showIcon
        message="Los tokens no se muestran completos por seguridad. Al editar, deja el campo token vacío para conservar el actual."
      />

      <Card
        title="Usuarios del sistema"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={activeApps.length === 0}>
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
          <Row gutter={[24, 12]}>
            <Col xs={24} md={12}>
              <Text type="secondary">ID en Meta</Text>
              <div>{selected.metaSystemUserId ?? "—"}</div>
            </Col>
            <Col xs={24}>
              <Text type="secondary">Notas</Text>
              <div>{selected.notes ?? "—"}</div>
            </Col>
          </Row>
          <Divider />
          <Table
            rowKey="appId"
            size="small"
            pagination={false}
            dataSource={selected.apps}
            columns={appAccessColumns}
          />
          <Button style={{ marginTop: 16 }} onClick={() => openEdit(selected)}>
            Editar / renovar tokens
          </Button>

          <Divider orientationMargin={0}>
            <Space size={6}>
              <BankOutlined />
              Empresas que pueden usarlo
            </Space>
          </Divider>
          <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
            Un mismo usuario de Meta puede servir a varias empresas. Las que no estén aquí no verán
            este usuario ni podrán usar sus tokens al importar.
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
              Tiene que quedar al menos una: si no, nadie podría usar sus tokens.
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Modal
        title={editing ? `Editar — ${editing.name}` : "Nuevo usuario Meta Ads"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSave()}
        okText="Guardar"
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Nombre" rules={[{ required: true, message: "Requerido" }]}>
            <Input placeholder="API Reportes" />
          </Form.Item>
          <Form.Item name="metaSystemUserId" label="ID usuario del sistema (Meta)">
            <Input placeholder="61590464925336" />
          </Form.Item>
          <Form.Item name="notes" label="Notas">
            <Input.TextArea rows={2} placeholder="Permisos, apps vinculadas, etc." />
          </Form.Item>
          <Form.Item name="isActive" valuePropName="checked">
            <Checkbox>Activo</Checkbox>
          </Form.Item>

          <Divider>Apps asignadas</Divider>

          <Form.List name="appAccess">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Card key={field.key} size="small" style={{ marginBottom: 12 }}>
                    <Row gutter={12}>
                      <Col span={24}>
                        <Form.Item
                          name={[field.name, "appId"]}
                          label="App"
                          rules={[{ required: true, message: "Selecciona una app" }]}
                        >
                          <Select
                            placeholder="App del catálogo"
                            options={activeApps.map((a) => ({ value: a.id, label: a.name }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={24}>
                        <Form.Item
                          name={[field.name, "accessToken"]}
                          label={editing ? "Token (vacío = mantener)" : "Token de acceso"}
                          rules={editing ? [] : [{ required: true, message: "Requerido" }]}
                        >
                          <Input.Password placeholder="EAAG..." autoComplete="new-password" />
                        </Form.Item>
                      </Col>
                      <Col span={16}>
                        <Form.Item name={[field.name, "tokenExpiresAt"]} label="Caducidad (opcional)">
                          <DatePicker showTime style={{ width: "100%" }} format="DD/MM/YYYY HH:mm" />
                        </Form.Item>
                      </Col>
                      <Col span={8} style={{ display: "flex", alignItems: "flex-end" }}>
                        <Form.Item name={[field.name, "isDefault"]} valuePropName="checked" style={{ marginBottom: 24 }}>
                          <Checkbox>Por defecto</Checkbox>
                        </Form.Item>
                      </Col>
                    </Row>
                    {fields.length > 1 ? (
                      <Button
                        type="text"
                        danger
                        icon={<MinusCircleOutlined />}
                        onClick={() => remove(field.name)}
                      >
                        Quitar app
                      </Button>
                    ) : null}
                  </Card>
                ))}
                <Button type="dashed" onClick={() => add({ isDefault: false })} block icon={<PlusOutlined />}>
                  Añadir app
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </Space>
  );
}
