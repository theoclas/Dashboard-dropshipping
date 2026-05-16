import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Select, Space, Typography, message } from "antd";
import { fetchCompanies } from "../../api";
import { useAuth } from "../../contexts/AuthContext";
import type { Company } from "../../types";
import { CompanyUserManagement } from "./CompanyUserManagement";

const { Title, Paragraph } = Typography;

export function AdminUsersPage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [usersCompanyId, setUsersCompanyId] = useState(user?.activeCompany ?? "");

  const adminCompanyIds = useMemo(
    () => user?.companies.filter((m) => m.role === "ADMIN").map((m) => m.companyId) ?? [],
    [user?.companies],
  );

  const companyOptionsForAdmin = useMemo(() => {
    return companies
      .filter((c) => adminCompanyIds.includes(c.id))
      .map((c) => ({ value: c.id, label: `${c.name} (${c.slug})` }));
  }, [companies, adminCompanyIds]);

  const loadCompanies = useCallback(async () => {
    try {
      const list = await fetchCompanies();
      setCompanies(list);
    } catch {
      message.error("No se pudieron cargar las empresas.");
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    if (!user?.activeCompany || companyOptionsForAdmin.length === 0) return;
    const def = companyOptionsForAdmin.some((o) => o.value === user.activeCompany)
      ? user.activeCompany
      : companyOptionsForAdmin[0]!.value;
    setUsersCompanyId(def);
  }, [user?.activeCompany, companyOptionsForAdmin]);

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>
          Usuarios
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 8 }}>
          Crear cuentas nuevas, definir el nivel (rol) y, si es operador o lector, qué módulos y acciones tienen en la
          aplicación. Para <strong>vincular una cuenta ya existente</strong> a la empresa, usa{" "}
          <strong>Administración → Empresas</strong> → Gestionar.
        </Paragraph>
      </div>

      <Card title="Empresa de trabajo">
        <Space wrap>
          <Typography.Text strong>Empresa:</Typography.Text>
          <Select
            style={{ minWidth: 320 }}
            value={usersCompanyId}
            options={companyOptionsForAdmin}
            onChange={(v) => setUsersCompanyId(v)}
          />
        </Space>
        <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          Solo aparecen empresas donde tu usuario es ADMIN. Los miembros y permisos son por empresa.
        </Paragraph>
      </Card>

      {usersCompanyId ? (
        <CompanyUserManagement key={usersCompanyId} companyId={usersCompanyId} showAssignExisting={false} />
      ) : null}
    </Space>
  );
}
