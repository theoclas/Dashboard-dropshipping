import { useCallback, useRef, useState } from "react";
import { Alert, Button, Card, Input, Modal, Select, Space, Spin, Tag, Typography, message } from "antd";
import { KeyOutlined } from "@ant-design/icons";
import { changeUserPassword, searchUsersGlobal } from "../../api";
import type { AdminUserSearchRow } from "../../types";

const { Text, Paragraph } = Typography;

const MIN_LONGITUD = 8;

function errorMessage(e: unknown): string {
  const r = e as { response?: { data?: { message?: string } }; message?: string };
  return r?.response?.data?.message ?? r?.message ?? "Error inesperado.";
}

/**
 * Cambio de contraseña de cualquier usuario.
 *
 * Va en su propia tarjeta y con búsqueda global a propósito: el resto de la pantalla
 * está limitado a las empresas donde eres ADMIN, y el caso que esto resuelve es
 * justamente el contrario — alguien bloqueado en una empresa que no administras.
 */
export function AdminUserPasswordCard() {
  const [opciones, setOpciones] = useState<AdminUserSearchRow[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegido, setElegido] = useState<AdminUserSearchRow | null>(null);
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Evita que una respuesta lenta pise a otra más reciente al teclear.
  const ultimaBusqueda = useRef(0);

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

  const limpiar = useCallback(() => {
    setElegido(null);
    setClave("");
    setRepetida("");
    setOpciones([]);
  }, []);

  const coinciden = clave.length > 0 && clave === repetida;
  const suficiente = clave.length >= MIN_LONGITUD;
  const puedeGuardar = Boolean(elegido) && suficiente && coinciden && !guardando;

  const confirmar = useCallback(() => {
    if (!elegido) return;
    Modal.confirm({
      title: "Confirmar cambio de contraseña",
      icon: <KeyOutlined />,
      content: (
        <>
          <Paragraph style={{ marginBottom: 8 }}>
            Se cambiará la contraseña de <b>{elegido.fullName}</b> ({elegido.email}).
          </Paragraph>
          <Paragraph type="warning" style={{ marginBottom: 0 }}>
            La contraseña es del usuario, no de la empresa: con ella entrará a{" "}
            <b>
              {elegido.companies.length === 1
                ? "su empresa"
                : `las ${elegido.companies.length} empresas a las que pertenece`}
            </b>
            . Su sesión actual seguirá abierta hasta que caduque el token.
          </Paragraph>
        </>
      ),
      okText: "Cambiar contraseña",
      cancelText: "Cancelar",
      onOk: async () => {
        setGuardando(true);
        try {
          const r = await changeUserPassword(elegido.id, clave);
          message.success(`Contraseña cambiada para ${r.email}.`);
          limpiar();
        } catch (e) {
          message.error(errorMessage(e));
        } finally {
          setGuardando(false);
        }
      },
    });
  }, [elegido, clave, limpiar]);

  return (
    <Card title="Cambiar la contraseña de un usuario">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Aquí sí aparecen usuarios de empresas que no administras"
        description="Es para desbloquear a alguien que perdió el acceso. Pásale la contraseña por un canal privado y dile que la cambie al entrar."
      />

      <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 560 }}>
        <div>
          <Text strong>Usuario</Text>
          <Select
            showSearch
            allowClear
            style={{ width: "100%", marginTop: 8 }}
            placeholder="Busca por nombre, correo o usuario (mínimo 2 letras)"
            filterOption={false}
            notFoundContent={buscando ? <Spin size="small" /> : null}
            onSearch={(v) => void buscar(v)}
            value={elegido?.id}
            onChange={(id) => setElegido(opciones.find((o) => o.id === id) ?? null)}
            onClear={limpiar}
            options={opciones.map((u) => ({
              value: u.id,
              label: `${u.fullName} · ${u.email}`,
            }))}
          />
        </div>

        {elegido ? (
          <div>
            <Text type="secondary">Pertenece a:</Text>
            <div style={{ marginTop: 6 }}>
              {elegido.companies.length === 0 ? (
                <Tag>Sin empresas</Tag>
              ) : (
                elegido.companies.map((c) => (
                  <Tag key={c.name} color={c.role === "ADMIN" ? "gold" : "default"}>
                    {c.name} · {c.role}
                  </Tag>
                ))
              )}
            </div>
          </div>
        ) : null}

        <div>
          <Text strong>Contraseña nueva</Text>
          <Input.Password
            style={{ marginTop: 8 }}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder={`Mínimo ${MIN_LONGITUD} caracteres`}
            disabled={!elegido}
          />
        </div>

        <div>
          <Text strong>Repetir contraseña</Text>
          <Input.Password
            style={{ marginTop: 8 }}
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            disabled={!elegido}
            status={repetida.length > 0 && !coinciden ? "error" : undefined}
          />
          {repetida.length > 0 && !coinciden ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              No coinciden.
            </Text>
          ) : null}
          {clave.length > 0 && !suficiente ? (
            <Text type="danger" style={{ fontSize: 12, display: "block" }}>
              Le faltan {MIN_LONGITUD - clave.length} caracteres.
            </Text>
          ) : null}
        </div>

        <Space>
          <Button type="primary" icon={<KeyOutlined />} disabled={!puedeGuardar} onClick={confirmar}>
            Cambiar contraseña
          </Button>
          {elegido ? <Button onClick={limpiar}>Cancelar</Button> : null}
        </Space>
      </Space>
    </Card>
  );
}
