import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Select, Space, message } from "antd";
import { KeyOutlined } from "@ant-design/icons";
import { fetchCompanies } from "../../api";
import { useAuth } from "../../contexts/AuthContext";
import type { Company } from "../../types";
import { AdminPageHeader } from "./AdminPageHeader";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { CompanyUserManagement } from "./CompanyUserManagement";

export function AdminUsersPage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [usersCompanyId, setUsersCompanyId] = useState(user?.activeCompany ?? "");
  const [buscarClave, setBuscarClave] = useState(false);

  const adminCompanyIds = useMemo(
    () => user?.companies.filter((m) => m.role === "ADMIN").map((m) => m.companyId) ?? [],
    [user?.companies],
  );

  const companyOptionsForAdmin = useMemo(
    () =>
      companies
        .filter((c) => adminCompanyIds.includes(c.id))
        .map((c) => ({ value: c.id, label: c.name })),
    [companies, adminCompanyIds],
  );

  const loadCompanies = useCallback(async () => {
    try {
      setCompanies(await fetchCompanies());
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
      <AdminPageHeader
        title="Usuarios"
        subtitle="Miembros, roles y permisos de cada empresa. Solo aparecen las empresas donde eres ADMIN."
        extra={
          <Space wrap>
            <Select
              style={{ minWidth: 240 }}
              value={usersCompanyId || undefined}
              options={companyOptionsForAdmin}
              onChange={setUsersCompanyId}
              placeholder="Elige una empresa"
            />
            <Button icon={<KeyOutlined />} onClick={() => setBuscarClave(true)}>
              Contraseña de otro usuario
            </Button>
          </Space>
        }
      />

      {companyOptionsForAdmin.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          message="No administras ninguna empresa"
          description="Aun así puedes cambiarle la contraseña a un usuario con el botón de arriba."
        />
      ) : null}

      {usersCompanyId ? (
        <CompanyUserManagement key={usersCompanyId} companyId={usersCompanyId} showAssignExisting />
      ) : null}

      {/* Sin usuario preseleccionado: el modal abre en modo búsqueda global, que es la
          única vía para llegar a alguien de una empresa que no administras. */}
      <ChangePasswordModal open={buscarClave} onClose={() => setBuscarClave(false)} />
    </Space>
  );
}
