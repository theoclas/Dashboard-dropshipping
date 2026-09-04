import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Input, Modal, Select, Space, Spin, Tag, Typography, message } from "antd";
import { changeUserPassword, searchUsersGlobal } from "../../api";
import type { AdminUserSearchRow } from "../../types";

const { Text, Paragraph } = Typography;

const MIN_LONGITUD = 8;

function errorMessage(e: unknown): string {
  const r = e as { response?: { data?: { message?: string } }; message?: string };
  return r?.response?.data?.message ?? r?.message ?? "Error inesperado.";
}

/** Usuario ya identificado, cuando se abre desde una fila de la tabla. */
export type UsuarioParaClave = {
  id: string;
  fullName: string;
  email: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /**
   * Si viene, el modal va directo al formulario. Si no, muestra el buscador global, que
   * es lo que permite llegar a alguien de una empresa que no administras.
   */
  usuario?: UsuarioParaClave | null;
};

export function ChangePasswordModal({ open, onClose, usuario }: Props) {
  const [opciones, setOpciones] = useState<AdminUserSearchRow[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [encontrado, setEncontrado] = useState<AdminUserSearchRow | null>(null);
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Evita que una respuesta lenta pise a otra más reciente al teclear.
  const ultimaBusqueda = useRef(0);

  const destino: UsuarioParaClave | null = usuario ?? encontrado ?? null;
  const modoBusqueda = !usuario;

  useEffect(() => {
    if (open) return;
    // Al cerrar no se conserva nada: una contraseña no debe quedar viva en el estado.
    setClave("");
    setRepetida("");
    setEncontrado(null);
    setOpciones([]);
  }, [open]);

  const buscar = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setOpciones([]);
      return;
    }
    const marca = ++ultimaBusqueda.current;
    setBuscando(true);
    try {
      const rows = await searchUsersGlobal(q.trim());
      if (marca === ultimaBusqueda.current) setOpciones(rows);
    } catch (e) {
      if (marca === ultimaBusqueda.current) message.error(errorMessage(e));
    } finally {
      if (marca === ultimaBusqueda.current) setBuscando(false);
    }
  }, []);

  const coinciden = clave.length > 0 && clave === repetida;
  const suficiente = clave.length >= MIN_LONGITUD;
  const puedeGuardar = Boolean(destino) && suficiente && coinciden;

  const guardar = useCallback(async () => {
    if (!destino || guardando) return;
    setGuardando(true);
    try {
      const r = await changeUserPassword(destino.id, clave);
      message.success(`Contraseña cambiada para ${r.email}.`);
      onClose();
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setGuardando(false);
    }
  }, [destino, clave, guardando, onClose]);

  const empresas = encontrado?.companies ?? [];

  return (
    <Modal
      title={usuario ? `Contraseña de ${usuario.fullName}` : "Cambiar la contraseña de un usuario"}
      open={open}
      onCancel={onClose}
      onOk={() => void guardar()}
      okText="Cambiar contraseña"
      cancelText="Cancelar"
      okButtonProps={{ disabled: !puedeGuardar, loading: guardando, danger: true }}
      destroyOnClose
      width={520}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {modoBusqueda ? (
          <Alert
            type="info"
            showIcon
            message="Aquí aparecen también usuarios de empresas que no administras"
            description="Es para desbloquear a alguien que perdió el acceso."
          />
        ) : null}

        {modoBusqueda ? (
          <div>
            <Text strong>Usuario</Text>
            <Select
              showSearch
              allowClear
              autoFocus
              style={{ width: "100%", marginTop: 8 }}
              placeholder="Nombre, correo o usuario (mínimo 2 letras)"
              filterOption={false}
              notFoundContent={buscando ? <Spin size="small" /> : null}
              onSearch={(v) => void buscar(v)}
              value={encontrado?.id}
              onChange={(id) => setEncontrado(opciones.find((o) => o.id === id) ?? null)}
              onClear={() => setEncontrado(null)}
              options={opciones.map((u) => ({ value: u.id, label: `${u.fullName} · ${u.email}` }))}
            />
            {empresas.length > 0 ? (
              <div style={{ marginTop: 8 }}>
                {empresas.map((c) => (
                  <Tag key={c.name} color={c.role === "ADMIN" ? "gold" : "default"}>
                    {c.name} · {c.role}
                  </Tag>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <Text type="secondary">{destino?.email}</Text>
        )}

        <div>
          <Text strong>Contraseña nueva</Text>
          <Input.Password
            style={{ marginTop: 8 }}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder={`Mínimo ${MIN_LONGITUD} caracteres`}
            disabled={!destino}
            autoComplete="new-password"
          />
          {clave.length > 0 && !suficiente ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              Le faltan {MIN_LONGITUD - clave.length} caracteres.
            </Text>
          ) : null}
        </div>

        <div>
          <Text strong>Repetir</Text>
          <Input.Password
            style={{ marginTop: 8 }}
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            disabled={!destino}
            autoComplete="new-password"
            status={repetida.length > 0 && !coinciden ? "error" : undefined}
            onPressEnter={() => {
              if (puedeGuardar) void guardar();
            }}
          />
          {repetida.length > 0 && !coinciden ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              No coinciden.
            </Text>
          ) : null}
        </div>

        {destino ? (
          <Paragraph type="warning" style={{ marginBottom: 0, fontSize: 13 }}>
            La contraseña es del usuario, no de la empresa: le abre todas las empresas a las que
            pertenece. Su sesión actual sigue abierta hasta que caduque el token. Pásasela por un
            canal privado y dile que la cambie al entrar.
          </Paragraph>
        ) : null}
      </Space>
    </Modal>
  );
}
