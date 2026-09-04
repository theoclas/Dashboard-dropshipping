import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Drawer, Form, Input, Modal, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import { BankOutlined, PlusOutlined } from "@ant-design/icons";
import { AdminPageHeader } from "./AdminPageHeader";
import { api } from "../../api";
import { useAuth } from "../../contexts/AuthContext";
import type { Company } from "../../types";
import { CompanyUserManagement } from "./CompanyUserManagement";

export function AdminCompaniesPage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form] = Form.useForm();
  const [manageCompany, setManageCompany] = useState<Company | null>(null);
  // El alta va en modal: es una accion puntual y no merece ocupar la mitad de la pantalla.
  const [crearAbierto, setCrearAbierto] = useState(false);

  const adminCompanyIds = useMemo(
    () => user?.companies.filter((m) => m.role === "ADMIN").map((m) => m.companyId) ?? [],
    [user?.companies],
  );

  async function load() {
    try {
      const { data } = await api.get<Company[]>("/companies");
      setCompanies(data);
    } catch {
      message.error("No se pudieron cargar empresas.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createCompany(values: { name: string; slug: string }) {
    await api.post("/companies", {
      name: values.name.trim(),
      slug: values.slug.trim().toLowerCase().replace(/\s+/g, "-"),
    });
    form.resetFields();
    setCrearAbierto(false);
    await load();
    message.success("Empresa creada.");
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <AdminPageHeader
        title="Empresas"
        subtitle="Alta y listado. Los usuarios de cada empresa se gestionan desde el botón Usuarios de su fila, o en la pantalla Usuarios."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCrearAbierto(true)}>
            Crear empresa
          </Button>
        }
      />

      <Modal
        title="Crear empresa"
        open={crearAbierto}
        onCancel={() => setCrearAbierto(false)}
        footer={null}
        destroyOnClose
        width={520}
      >
        <Form layout="vertical" form={form} onFinish={createCompany}>
          <Form.Item name="name" label="Nombre visible" rules={[{ required: true }]}>
            <Input placeholder="J&D Tiendas online" />
          </Form.Item>
          <Form.Item
            name="slug"
            label="Identificador"
            rules={[
              { required: true, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: "Solo minúsculas, números y guiones." },
            ]}
            extra="Único en URL y base de datos, sin espacios."
          >
            <Input placeholder="jd-tiendas-online" />
          </Form.Item>
          <Button htmlType="submit" type="primary">
            Crear
          </Button>
        </Form>
      </Modal>

      <Card
        title={
          <Space>
            <BankOutlined />
            {`Empresas registradas (${companies.length})`}
          </Space>
        }
      >
        <Table
          rowKey="id"
          dataSource={companies}
          pagination={false}
          columns={[
            { title: "Nombre", dataIndex: "name" },
            {
              title: "Identificador",
              dataIndex: "slug",
              render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
            },
            {
              title: "Estado",
              width: 110,
              render: (row: Company) =>
                row.isActive ? <Tag color="green">Activa</Tag> : <Tag>Inactiva</Tag>,
            },
            {
              title: "Usuarios",
              key: "users",
              width: 120,
              render: (_, row) => {
                const canManage = adminCompanyIds.includes(row.id);
                const btn = (
                  <Button type="link" size="small" disabled={!canManage} onClick={() => setManageCompany(row)}>
                    Gestionar
                  </Button>
                );
                return canManage ? (
                  btn
                ) : (
                  <Tooltip title="Solo un administrador de esa empresa puede asignar usuarios aquí.">
                    <span>{btn}</span>
                  </Tooltip>
                );
              },
            },
          ]}
        />
      </Card>

      <Drawer
        title={manageCompany ? `Usuarios — ${manageCompany.name}` : "Usuarios"}
        width={Math.min(720, typeof window !== "undefined" ? window.innerWidth - 24 : 720)}
        open={Boolean(manageCompany)}
        destroyOnClose
        onClose={() => setManageCompany(null)}
      >
        {manageCompany ? (
          <CompanyUserManagement
            companyId={manageCompany.id}
            heading={
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                Empresa <Typography.Text code>{manageCompany.slug}</Typography.Text> · Misma gestión que en{" "}
                <Link to="/app/admin/usuarios" onClick={() => setManageCompany(null)}>
                  Usuarios
                </Link>
                .
              </Typography.Paragraph>
            }
          />
        ) : null}
      </Drawer>
    </Space>
  );
}
