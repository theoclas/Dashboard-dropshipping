import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  Checkbox,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  assignUserToCompany,
  createCompanyUserAccount,
  fetchAssignableUsersForCompany,
  fetchCompanyMembers,
  patchCompanyMember,
} from "../../api";
import { OPERATOR_PERMISSION_LABELS, permissionGroups } from "../../operatorPermissionLabels";
import { mergeOperatorPermissions } from "../../operatorPermissionsMerge";
import type { AssignableCompanyUser, CompanyMemberRow, OperatorPermissionKey, Role } from "../../types";

const { Text, Paragraph } = Typography;

const roleOptions: { value: Role; label: string }[] = [
  { value: "ADMIN", label: "ADMIN" },
  { value: "OPERADOR", label: "OPERADOR" },
  { value: "LECTOR", label: "LECTOR" },
];

type Props = {
  companyId: string;
  /** Título opcional encima del contenido (p. ej. en drawer desde Empresas). */
  heading?: ReactNode;
  /** Si es false, se oculta «Asignar usuario existente» (p. ej. en la página Usuarios; en Empresas sigue visible). */
  showAssignExisting?: boolean;
};

export function CompanyUserManagement({ companyId, heading, showAssignExisting = true }: Props) {
  const [assignForm] = Form.useForm<{ userId: string; role: Role }>();
  const [createUserForm] = Form.useForm<{
    username: string;
    email: string;
    fullName: string;
    password: string;
    role: Role;
  }>();

  const [members, setMembers] = useState<CompanyMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [assignUserOptions, setAssignUserOptions] = useState<AssignableCompanyUser[]>([]);
  const [assignSearchLoading, setAssignSearchLoading] = useState(false);
  const assignSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assignUsersById = useRef(new Map<string, AssignableCompanyUser>());

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<CompanyMemberRow | null>(null);
  const [drawerRole, setDrawerRole] = useState<Role>("OPERADOR");
  const [permState, setPermState] = useState<Record<OperatorPermissionKey, boolean>>(
    () => mergeOperatorPermissions("OPERADOR", null),
  );

  const loadMembers = useCallback(async () => {
    if (!companyId) return;
    setMembersLoading(true);
    try {
      const list = await fetchCompanyMembers(companyId);
      setMembers(list);
    } catch {
      message.error("No se pudieron cargar los usuarios de la empresa.");
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [companyId]);

  const runAssignUserSearch = useCallback(
    async (q: string) => {
      const t = q.trim();
      if (t.length < 2) {
        setAssignUserOptions([]);
        return;
      }
      setAssignSearchLoading(true);
      try {
        const rows = await fetchAssignableUsersForCompany(companyId, t);
        setAssignUserOptions(rows);
        for (const u of rows) assignUsersById.current.set(u.id, u);
      } catch {
        setAssignUserOptions([]);
      } finally {
        setAssignSearchLoading(false);
      }
    },
    [companyId],
  );

  useEffect(() => {
    assignUsersById.current = new Map();
    setAssignUserOptions([]);
    if (showAssignExisting) assignForm.resetFields();
    createUserForm.setFieldsValue({ role: "OPERADOR" });
    if (showAssignExisting) assignForm.setFieldsValue({ role: "OPERADOR" });
  }, [companyId, assignForm, createUserForm, showAssignExisting]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    return () => {
      if (assignSearchTimer.current) clearTimeout(assignSearchTimer.current);
    };
  }, []);

  const openPermissionsDrawer = useCallback((row: CompanyMemberRow) => {
    setEditingMember(row);
    setDrawerRole(row.role);
    setPermState(mergeOperatorPermissions(row.role, row.operatorPermissions));
    setDrawerOpen(true);
  }, []);

  const memberColumns: ColumnsType<CompanyMemberRow> = useMemo(
    () => [
      {
        title: "Nombre",
        dataIndex: "fullName",
        key: "fn",
        width: 168,
        ellipsis: { showTitle: false },
        render: (v: string) => (
          <Text ellipsis={{ tooltip: v }} style={{ maxWidth: "100%" }}>
            {v}
          </Text>
        ),
      },
      {
        title: "Email",
        dataIndex: "email",
        key: "em",
        width: 220,
        ellipsis: { showTitle: false },
        render: (v: string) => (
          <Text ellipsis={{ tooltip: v }} style={{ maxWidth: "100%" }}>
            {v}
          </Text>
        ),
      },
      {
        title: "Usuario",
        key: "un",
        width: 112,
        ellipsis: { showTitle: false },
        render: (_: unknown, r) => {
          const u = r.username ?? "—";
          return u === "—" ? (
            <Text type="secondary">—</Text>
          ) : (
            <Text ellipsis={{ tooltip: `@${u}` }} style={{ maxWidth: "100%" }}>
              @{u}
            </Text>
          );
        },
      },
      {
        title: "Rol",
        dataIndex: "role",
        key: "ro",
        width: 118,
        align: "center",
        render: (r: Role) => <Tag style={{ margin: 0 }}>{r}</Tag>,
      },
      {
        title: "Acciones",
        key: "act",
        width: 132,
        align: "right",
        render: (_: unknown, row) => (
          <Button type="link" size="small" style={{ padding: "0 4px" }} onClick={() => openPermissionsDrawer(row)}>
            Rol y permisos
          </Button>
        ),
      },
    ],
    [openPermissionsDrawer],
  );

  if (!companyId) return null;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {heading ? <div>{heading}</div> : null}

      {showAssignExisting ? (
        <Card title="Asignar usuario existente">
          <Paragraph type="secondary">
            Busca entre las cuentas ya registradas en la plataforma y elige el rol en esta empresa. Si ya es miembro, se
            actualizará su rol.
          </Paragraph>
          <Form
            form={assignForm}
            layout="vertical"
            style={{ maxWidth: 520 }}
            onFinish={async (values) => {
              const u = assignUsersById.current.get(values.userId);
              if (!u) {
                message.warning("Busca y selecciona un usuario de la lista.");
                return;
              }
              try {
                await assignUserToCompany(companyId, { email: u.email, role: values.role });
                assignForm.resetFields();
                assignForm.setFieldsValue({ role: "OPERADOR" });
                setAssignUserOptions([]);
                message.success(u.alreadyInCompany ? "Rol actualizado." : "Usuario asociado.");
                void loadMembers();
              } catch {
                message.error("No se pudo asignar.");
              }
            }}
          >
            <Form.Item name="userId" label="Usuario" rules={[{ required: true, message: "Selecciona un usuario." }]}>
              <Select
                showSearch
                allowClear
                filterOption={false}
                placeholder="Escribe al menos 2 letras (nombre, email o usuario)"
                notFoundContent={
                  assignSearchLoading ? (
                    <div style={{ padding: 12, textAlign: "center" }}>
                      <Spin size="small" />
                    </div>
                  ) : undefined
                }
                loading={assignSearchLoading}
                options={assignUserOptions.map((u) => ({
                  value: u.id,
                  label: `${u.fullName} — ${u.email}${u.username ? ` · @${u.username}` : ""}${
                    u.alreadyInCompany ? " (ya en esta empresa)" : ""
                  }`,
                }))}
                onSearch={(q) => {
                  if (assignSearchTimer.current) clearTimeout(assignSearchTimer.current);
                  assignSearchTimer.current = setTimeout(() => void runAssignUserSearch(q), 350);
                }}
                onClear={() => setAssignUserOptions([])}
              />
            </Form.Item>
            <Form.Item name="role" label="Rol en la empresa" rules={[{ required: true }]} initialValue="OPERADOR">
              <Select options={roleOptions} />
            </Form.Item>
            <Button type="primary" htmlType="submit">
              Asignar a esta empresa
            </Button>
          </Form>
        </Card>
      ) : null}

      <Card title="Crear usuario nuevo">
        <Form
          form={createUserForm}
          layout="vertical"
          style={{ maxWidth: 520 }}
          onFinish={async (values) => {
            try {
              await createCompanyUserAccount(companyId, {
                username: values.username.trim(),
                email: values.email.trim(),
                fullName: values.fullName.trim(),
                password: values.password,
                role: values.role,
              });
              createUserForm.resetFields();
              createUserForm.setFieldsValue({ role: "OPERADOR" });
              message.success("Usuario creado.");
              void loadMembers();
            } catch {
              message.error("No se pudo crear el usuario.");
            }
          }}
        >
          <Form.Item name="username" label="Nombre de usuario (login)" rules={[{ required: true, min: 2 }]}>
            <Input autoComplete="off" />
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
          <Form.Item name="role" label="Rol en la empresa" rules={[{ required: true }]} initialValue="OPERADOR">
            <Select options={roleOptions} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            Crear en esta empresa
          </Button>
        </Form>
      </Card>

      <Card title="Miembros, rol y permisos de operador" styles={{ body: { paddingTop: 12 } }}>
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Usa <strong>Rol y permisos</strong> para cambiar el nivel (ADMIN / OPERADOR / LECTOR) y, si no es ADMIN, marcar
          qué puede hacer el operador en la app (importar, campañas, gasto operacional, etc.).
        </Paragraph>
        <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <Table<CompanyMemberRow>
            bordered
            size="middle"
            rowKey="id"
            loading={membersLoading}
            dataSource={members}
            columns={memberColumns}
            pagination={false}
            tableLayout="fixed"
            scroll={{ x: 750 }}
            locale={{ emptyText: "Sin miembros" }}
          />
        </div>
      </Card>

      <Drawer
        title={editingMember ? `Rol y permisos — ${editingMember.fullName}` : "Permisos"}
        width={560}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditingMember(null);
        }}
        extra={
          <Space>
            <Button
              onClick={async () => {
                if (!editingMember) return;
                try {
                  await patchCompanyMember(companyId, editingMember.id, { operatorPermissions: null });
                  message.success("Permisos por defecto (null = todo permitido para operador).");
                  setPermState(mergeOperatorPermissions(drawerRole, null));
                  void loadMembers();
                } catch {
                  message.error("No se pudo restablecer.");
                }
              }}
              disabled={drawerRole === "ADMIN"}
            >
              Predeterminado operador
            </Button>
            <Button
              type="primary"
              onClick={async () => {
                if (!editingMember) return;
                try {
                  const body: { role: Role; operatorPermissions?: Record<OperatorPermissionKey, boolean> | null } = {
                    role: drawerRole,
                  };
                  if (drawerRole === "ADMIN") {
                    body.operatorPermissions = null;
                  } else {
                    body.operatorPermissions = permState;
                  }
                  await patchCompanyMember(companyId, editingMember.id, body);
                  message.success("Guardado. El usuario debe volver a iniciar sesión para ver los cambios.");
                  setDrawerOpen(false);
                  void loadMembers();
                } catch {
                  message.error("No se pudo guardar.");
                }
              }}
            >
              Guardar
            </Button>
          </Space>
        }
      >
        {editingMember ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <Text type="secondary">Email: {editingMember.email}</Text>
            </div>
            <div>
              <Text strong>Rol en la empresa</Text>
              <Select
                style={{ width: "100%", marginTop: 8 }}
                value={drawerRole}
                options={roleOptions}
                onChange={(r) => {
                  setDrawerRole(r);
                  setPermState(mergeOperatorPermissions(r, r === "ADMIN" ? null : editingMember.operatorPermissions));
                }}
              />
            </div>
            {drawerRole !== "ADMIN" ? (
              <>
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  Activa o desactiva cada permiso para este usuario en <strong>esta empresa</strong>.
                </Paragraph>
                {permissionGroups().map((g) => (
                  <div key={g.title}>
                    <Text strong style={{ display: "block", marginBottom: 8 }}>
                      {g.title}
                    </Text>
                    <Space direction="vertical" style={{ paddingLeft: 8 }}>
                      {g.keys.map((key) => (
                        <Checkbox
                          key={key}
                          checked={permState[key]}
                          onChange={(e) => setPermState((prev) => ({ ...prev, [key]: e.target.checked }))}
                        >
                          {OPERATOR_PERMISSION_LABELS[key]}
                        </Checkbox>
                      ))}
                    </Space>
                  </div>
                ))}
              </>
            ) : (
              <Text type="secondary">Los administradores tienen acceso completo; no se guardan permisos granulares.</Text>
            )}
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
