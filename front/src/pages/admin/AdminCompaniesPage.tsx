import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Drawer, Form, Input, Space, Table, Tooltip, Typography, message } from "antd";
import { api } from "../../api";
import { useAuth } from "../../contexts/AuthContext";
import type { Company } from "../../types";
import { CompanyUserManagement } from "./CompanyUserManagement";

export function AdminCompaniesPage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form] = Form.useForm();
  const [manageCompany, setManageCompany] = useState<Company | null>(null);

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
    await load();
    message.success("Empresa creada.");
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <Typography.Title level={3} style={{ margin: 0 }}>
        Empresas
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Alta de empresas y listado. Puedes <strong>asignar y crear usuarios</strong> desde el botón «Usuarios» en cada
        empresa donde seas ADMIN, o usar la vista centralizada en{" "}
        <Link to="/app/admin/usuarios">Usuarios</Link>.
      </Typography.Paragraph>
      <Card title="Crear empresa">
        <Form layout="inline" form={form} onFinish={createCompany}>
          <Form.Item name="name" rules={[{ required: true }]}>
            <Input placeholder='Nombre visible (ej. "J&D Tiendas online")' style={{ minWidth: 220 }} />
          </Form.Item>
          <Form.Item
            name="slug"
            rules={[{ required: true, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: "Solo minúsculas, números y guiones." }]}
            extra="Identificador único en URL/base de datos (sin espacios). Ej.: jd-tiendas-online"
          >
            <Input placeholder="jd-tiendas-online" style={{ minWidth: 200 }} />
          </Form.Item>
          <Button htmlType="submit" type="primary">
            Crear
          </Button>
        </Form>
      </Card>
      <Card title="Empresas registradas">
        <Table
          rowKey="id"
          dataSource={companies}
          columns={[
            { title: "Nombre", dataIndex: "name" },
            { title: "Slug", dataIndex: "slug" },
            { title: "Activa", render: (row: Company) => (row.isActive ? "Sí" : "No") },
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
