import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  Card,
  Divider,
  Drawer,
  Flex,
  Form,
  Input,
  Popconfirm,
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
  addUserMembership,
  assignUserToCompany,
  createCompanyUserAccount,
  fetchAssignableUsersForCompany,
  fetchCompanyMembers,
  fetchUserMemberships,
  patchCompanyMember,
  removeUserMembership,
} from "../../api";
import { OperatorPermissionsEditor } from "../../components/OperatorPermissionsEditor";
import { useAuth } from "../../contexts/AuthContext";
import { mergeOperatorPermissions } from "../../operatorPermissionsMerge";
import type {
  AssignableCompanyUser,
  CompanyMemberRow,
  OperatorPermissionKey,
  Role,
  UserMembershipRow,
} from "../../types";

const { Text, Paragraph } = Typography;

const roleOptions: { value: Role; label: string }[] = [
  { value: "ADMIN", label: "ADMIN" },
  { value: "OPERADOR", label: "OPERADOR" },
  { value: "LECTOR", label: "LECTOR" },
];

function membershipPermissionsTag(m: UserMembershipRow) {
  if (m.role === "ADMIN") {
    return <Tag color="purple">ADMIN · acceso total</Tag>;
  }
  if (m.operatorPermissions == null) {
    return <Tag>Por defecto (todo)</Tag>;
  }
  return <Tag color="processing">Personalizados</Tag>;
}

type Props = {
  companyId: string;
  /** Título opcional encima del contenido (p. ej. en drawer desde Empresas). */
  heading?: ReactNode;
  /** Si es false, se oculta «Asignar usuario existente» (p. ej. en la página Usuarios; en Empresas sigue visible). */
  showAssignExisting?: boolean;
};

export function CompanyUserManagement({ companyId, heading, showAssignExisting = true }: Props) {
  const { user: authUser, refresh: refreshAuth } = useAuth();
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

  const [userMemberships, setUserMemberships] = useState<UserMembershipRow[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [addCompanyId, setAddCompanyId] = useState<string>("");
  const [addCompanyRole, setAddCompanyRole] = useState<Role>("OPERADOR");
  const [addingCompany, setAddingCompany] = useState(false);
  /** Empresa cuya membresía se edita en Rol y permisos (puede diferir de la vista de la página). */
  const [permissionsCompanyId, setPermissionsCompanyId] = useState<string | null>(null);

  const adminCompaniesForAssign = useMemo(
    () => authUser?.companies.filter((c) => c.role === "ADMIN") ?? [],
    [authUser],
  );

  const companiesAvailableToAdd = useMemo(() => {
    const inUser = new Set(userMemberships.map((m) => m.companyId));
    return adminCompaniesForAssign.filter((c) => !inUser.has(c.companyId));
  }, [adminCompaniesForAssign, userMemberships]);

  const manageableMemberships = useMemo(
    () => userMemberships.filter((m) => m.canManage),
    [userMemberships],
  );

  const activePermissionsMembership = useMemo(
    () => userMemberships.find((m) => m.companyId === permissionsCompanyId),
    [userMemberships, permissionsCompanyId],
  );

  const applyPermissionsFromMembership = useCallback((m: UserMembershipRow) => {
    setPermissionsCompanyId(m.companyId);
    setDrawerRole(m.role);
    setPermState(mergeOperatorPermissions(m.role, m.operatorPermissions));
  }, []);

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

  const loadUserMemberships = useCallback(async (userId: string) => {
    setMembershipsLoading(true);
    try {
      const list = await fetchUserMemberships(userId);
      setUserMemberships(list);
    } catch {
      message.error("No se pudieron cargar las empresas del usuario.");
      setUserMemberships([]);
    } finally {
      setMembershipsLoading(false);
    }
  }, []);

  const openPermissionsDrawer = useCallback(
    (row: CompanyMemberRow) => {
      setEditingMember(row);
      setPermissionsCompanyId(companyId);
      setDrawerRole(row.role);
      setPermState(mergeOperatorPermissions(row.role, row.operatorPermissions));
      setAddCompanyId("");
      setAddCompanyRole("OPERADOR");
      setDrawerOpen(true);
      void loadUserMemberships(row.userId);
    },
    [companyId, loadUserMemberships],
  );

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
            Rol, permisos y empresas
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
          Usa <strong>Rol, permisos y empresas</strong> para el nivel en esta empresa, los permisos de operador y las
          demás empresas a las que pertenece el usuario (incluido tú mismo).
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
        title={editingMember ? `Usuario — ${editingMember.fullName}` : "Usuario"}
        width={600}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditingMember(null);
          setUserMemberships([]);
          setPermissionsCompanyId(null);
        }}
        extra={
          <Space>
            <Button
              onClick={async () => {
                if (!editingMember || !activePermissionsMembership) return;
                try {
                  await patchCompanyMember(activePermissionsMembership.companyId, activePermissionsMembership.membershipId, {
                    operatorPermissions: null,
                  });
                  message.success(
                    `Permisos por defecto en ${activePermissionsMembership.companyName} (operador = todo permitido).`,
                  );
                  setPermState(mergeOperatorPermissions(drawerRole, null));
                  void loadUserMemberships(editingMember.userId);
                  if (activePermissionsMembership.companyId === companyId) void loadMembers();
                } catch {
                  message.error("No se pudo restablecer.");
                }
              }}
              disabled={drawerRole === "ADMIN" || !activePermissionsMembership}
            >
              Predeterminado operador
            </Button>
            <Button
              type="primary"
              onClick={async () => {
                if (!editingMember || !activePermissionsMembership) return;
                try {
                  const body: { role: Role; operatorPermissions?: Record<OperatorPermissionKey, boolean> | null } = {
                    role: drawerRole,
                  };
                  if (drawerRole === "ADMIN") {
                    body.operatorPermissions = null;
                  } else {
                    body.operatorPermissions = permState;
                  }
                  await patchCompanyMember(
                    activePermissionsMembership.companyId,
                    activePermissionsMembership.membershipId,
                    body,
                  );
                  const savedCompany = activePermissionsMembership.companyName;
                  if (
                    editingMember.userId === authUser?.id &&
                    activePermissionsMembership.companyId === authUser.activeCompany
                  ) {
                    await refreshAuth();
                    message.success(
                      `Permisos guardados para ${savedCompany}. Recarga (F5) si el menú no cambia.`,
                    );
                  } else {
                    message.success(
                      `Permisos guardados para ${savedCompany}. El usuario los verá al recargar o al cambiar a esa empresa.`,
                    );
                  }
                  void loadUserMemberships(editingMember.userId);
                  if (activePermissionsMembership.companyId === companyId) void loadMembers();
                } catch {
                  message.error("No se pudo guardar.");
                }
              }}
              disabled={!activePermissionsMembership}
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
              <Text strong>Empresas asignadas</Text>
              <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 8 }}>
                Solo puedes agregar o quitar empresas donde tú eres ADMIN (incluido tu propio usuario).
              </Paragraph>
              {membershipsLoading ? (
                <Spin />
              ) : userMemberships.length === 0 ? (
                <Text type="secondary">Sin empresas.</Text>
              ) : (
                <Space direction="vertical" style={{ width: "100%" }} size="small">
                  {userMemberships.map((m) => (
                    <Flex key={m.companyId} justify="space-between" align="center" wrap="wrap" gap={8}>
                      <Space size="small" wrap>
                        <Text>
                          {m.companyName}
                          <Text type="secondary"> ({m.companySlug})</Text>
                        </Text>
                        {!m.companyActive ? <Tag color="default">inactiva</Tag> : null}
                        {m.companyId === companyId ? <Tag color="blue">esta vista</Tag> : null}
                        {membershipPermissionsTag(m)}
                      </Space>
                      <Space size="small" wrap>
                        {m.canManage ? (
                          <Select
                            size="small"
                            style={{ width: 118 }}
                            value={m.role}
                            options={roleOptions}
                            onChange={async (role) => {
                              try {
                                await patchCompanyMember(m.companyId, m.membershipId, { role });
                                message.success("Rol actualizado en esa empresa.");
                                const list = await fetchUserMemberships(editingMember.userId);
                                setUserMemberships(list);
                                const updated = list.find((x) => x.companyId === m.companyId);
                                if (updated && updated.companyId === permissionsCompanyId) {
                                  applyPermissionsFromMembership(updated);
                                }
                                if (m.companyId === companyId) void loadMembers();
                                if (editingMember.userId === authUser?.id) void refreshAuth();
                              } catch {
                                message.error("No se pudo cambiar el rol.");
                              }
                            }}
                          />
                        ) : (
                          <Tag>{m.role}</Tag>
                        )}
                        {m.canManage ? (
                          <Popconfirm
                            title="¿Quitar de esta empresa?"
                            description="El usuario dejará de ver datos de esa empresa."
                            onConfirm={async () => {
                              try {
                                await removeUserMembership(editingMember.userId, m.companyId);
                                message.success("Empresa quitada.");
                                void loadUserMemberships(editingMember.userId);
                                void loadMembers();
                                if (editingMember.userId === authUser?.id) void refreshAuth();
                              } catch (e: unknown) {
                                const msg =
                                  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                                  "No se pudo quitar.";
                                message.error(msg);
                              }
                            }}
                          >
                            <Button type="link" size="small" danger>
                              Quitar
                            </Button>
                          </Popconfirm>
                        ) : null}
                      </Space>
                    </Flex>
                  ))}
                </Space>
              )}
              {companiesAvailableToAdd.length > 0 ? (
                <Space wrap style={{ marginTop: 12 }} align="end">
                  <div>
                    <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                      Agregar empresa
                    </Text>
                    <Select
                      style={{ minWidth: 220 }}
                      placeholder="Selecciona empresa"
                      value={addCompanyId || undefined}
                      options={companiesAvailableToAdd.map((c) => ({
                        value: c.companyId,
                        label: c.name,
                      }))}
                      onChange={setAddCompanyId}
                      allowClear
                    />
                  </div>
                  <div>
                    <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                      Rol
                    </Text>
                    <Select style={{ width: 118 }} value={addCompanyRole} options={roleOptions} onChange={setAddCompanyRole} />
                  </div>
                  <Button
                    type="primary"
                    loading={addingCompany}
                    disabled={!addCompanyId}
                    onClick={async () => {
                      if (!addCompanyId) return;
                      setAddingCompany(true);
                      try {
                        await addUserMembership(editingMember.userId, {
                          companyId: addCompanyId,
                          role: addCompanyRole,
                        });
                        message.success(
                          editingMember.userId === authUser?.id
                            ? "Empresa agregada. Si no la ves en el menú, cambia de empresa."
                            : "Empresa agregada.",
                        );
                        setAddCompanyId("");
                        setAddCompanyRole("OPERADOR");
                        void loadUserMemberships(editingMember.userId);
                        void loadMembers();
                        if (editingMember.userId === authUser?.id) void refreshAuth();
                      } catch (e: unknown) {
                        const msg =
                          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                          "No se pudo agregar.";
                        message.error(msg);
                      } finally {
                        setAddingCompany(false);
                      }
                    }}
                  >
                    Agregar
                  </Button>
                </Space>
              ) : userMemberships.length > 0 ? (
                <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
                  Ya está en todas las empresas que administras.
                </Text>
              ) : null}
            </div>

            <Divider style={{ margin: "4px 0" }} />

            <Alert
              type="info"
              showIcon
              message="Permisos por empresa"
              description="Los permisos se guardan solo en la empresa seleccionada abajo. El mismo usuario puede ser operador en dos tiendas con accesos distintos (por ejemplo Dashboard en una y no en la otra)."
            />

            {manageableMemberships.length === 0 ? (
              <Text type="secondary">No administras ninguna empresa de este usuario; no puedes editar permisos.</Text>
            ) : (
              <>
                <div>
                  <Text strong>Configurar permisos para</Text>
                  <Select
                    style={{ width: "100%", marginTop: 8 }}
                    value={permissionsCompanyId ?? undefined}
                    options={manageableMemberships.map((m) => ({
                      value: m.companyId,
                      label: m.companyName,
                    }))}
                    onChange={(id) => {
                      const m = userMemberships.find((x) => x.companyId === id);
                      if (m) applyPermissionsFromMembership(m);
                    }}
                  />
                  {activePermissionsMembership ? (
                    <Text type="secondary" style={{ display: "block", marginTop: 6 }}>
                      Rol y permisos de <strong>{activePermissionsMembership.companyName}</strong>
                      {activePermissionsMembership.companyId === companyId ? " (coincide con esta vista)" : null}.
                    </Text>
                  ) : null}
                </div>

                <div>
                  <Text strong>Rol en esta empresa</Text>
                  <Select
                    style={{ width: "100%", marginTop: 8 }}
                    value={drawerRole}
                    options={roleOptions}
                    onChange={(r) => {
                      setDrawerRole(r);
                      setPermState(
                        mergeOperatorPermissions(
                          r,
                          r === "ADMIN" ? null : activePermissionsMembership?.operatorPermissions,
                        ),
                      );
                    }}
                  />
                </div>
                <OperatorPermissionsEditor
                  key={`${activePermissionsMembership?.membershipId ?? "none"}-${drawerRole}`}
                  role={drawerRole}
                  permState={permState}
                  onChange={setPermState}
                />
              </>
            )}
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
