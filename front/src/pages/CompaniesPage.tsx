import { useEffect, useState } from "react";
import { Button, Card, Form, Input, Select, Space, Table, Typography, message } from "antd";
import { api } from "../api";
import type { Company } from "../types";

export function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [createUserForm] = Form.useForm();

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

  async function assignUser(values: {
    companyId: string;
    loginOrEmail: string;
    role: "ADMIN" | "OPERADOR" | "LECTOR";
  }) {
    const raw = values.loginOrEmail.trim();
    const body = raw.includes("@")
      ? { email: raw, role: values.role }
      : { username: raw, role: values.role };
    await api.post(`/companies/${values.companyId}/users`, body);
    assignForm.resetFields();
    message.success("Usuario asignado.");
  }

  async function createUserInCompany(values: {
    companyId: string;
    username: string;
    email: string;
    fullName: string;
    password: string;
    role: "ADMIN" | "OPERADOR" | "LECTOR";
  }) {
    try {
      await api.post(`/companies/${values.companyId}/users/create`, {
        username: values.username.trim(),
        email: values.email.trim(),
        fullName: values.fullName.trim(),
        password: values.password,
        role: values.role,
      });
      createUserForm.resetFields();
      message.success("Usuario creado. Ya puede iniciar sesión con su nombre de usuario.");
    } catch {
      message.error("No se pudo crear el usuario (revisa slug/email/usuario únicos o permisos).");
    }
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Typography.Title level={3}>Empresas</Typography.Title>
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
      <Card title="Crear usuario nuevo (cuenta + acceso a la empresa)">
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Usa esto cuando la persona <strong>no</strong> exista aún. Si ya tiene cuenta, usa «Asignar usuario» con su email o usuario.
        </Typography.Paragraph>
        <Form layout="vertical" form={createUserForm} onFinish={createUserInCompany} style={{ maxWidth: 480 }}>
          <Form.Item name="companyId" label="Empresa" rules={[{ required: true }]}>
            <Select
              placeholder="Empresa"
              options={companies.map((c) => ({ value: c.id, label: `${c.name} (${c.slug})` }))}
            />
          </Form.Item>
          <Form.Item name="username" label="Nombre de usuario (login)" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="solo letras, números, . _ -" autoComplete="off" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="fullName" label="Nombre completo" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Contraseña inicial" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Rol en esta empresa" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "ADMIN", label: "ADMIN" },
                { value: "OPERADOR", label: "OPERADOR" },
                { value: "LECTOR", label: "LECTOR" },
              ]}
            />
          </Form.Item>
          <Button htmlType="submit" type="primary">
            Crear usuario
          </Button>
        </Form>
      </Card>
      <Card title="Asignar usuario a empresa">
        <Form layout="inline" form={assignForm} onFinish={assignUser}>
          <Form.Item name="companyId" rules={[{ required: true }]}>
            <Select
              placeholder="Empresa"
              style={{ minWidth: 220 }}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Form.Item name="loginOrEmail" rules={[{ required: true }]}>
            <Input placeholder="Email o nombre de usuario" style={{ minWidth: 220 }} />
          </Form.Item>
          <Form.Item name="role" rules={[{ required: true }]}>
            <Select
              placeholder="Rol"
              style={{ minWidth: 140 }}
              options={[
                { value: "ADMIN", label: "ADMIN" },
                { value: "OPERADOR", label: "OPERADOR" },
                { value: "LECTOR", label: "LECTOR" },
              ]}
            />
          </Form.Item>
          <Button htmlType="submit">Asignar</Button>
        </Form>
      </Card>
      <Table
        rowKey="id"
        dataSource={companies}
        columns={[
          { title: "Nombre", dataIndex: "name" },
          { title: "Slug", dataIndex: "slug" },
          { title: "Activa", render: (row) => (row.isActive ? "Sí" : "No") },
        ]}
      />
    </Space>
  );
}
