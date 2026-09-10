import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { CopyOutlined, EyeOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import {
  createServiceToken,
  fetchServiceTokens,
  revealServiceToken,
  revokeServiceToken,
  type ServiceToken,
} from "../../api";
import { AdminPageHeader } from "./AdminPageHeader";

const { Text, Paragraph } = Typography;

function fecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mensajeError(e: unknown, porDefecto: string): string {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? porDefecto;
}

/**
 * Credenciales de servicio para la API de solo lectura del agente.
 *
 * Existen porque el JWT de login caduca a las 8 horas y obligaba a generar uno nuevo en
 * cada sesión de análisis. Estas no caducan, se pueden volver a copiar desde aquí, y se
 * revocan en un clic.
 *
 * El token no viaja en el listado: se pide con un botón, y cada vez que alguien lo mira
 * queda escrito en el log del servidor.
 */
export function AdminServiceTokensPage() {
  const [items, setItems] = useState<ServiceToken[]>([]);
  const [empresa, setEmpresa] = useState("");
  const [cargando, setCargando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [modalCrear, setModalCrear] = useState(false);
  const [viendo, setViendo] = useState<{ nombre: string; token: string; nueva: boolean } | null>(
    null,
  );
  const [revelandoId, setRevelandoId] = useState<string | null>(null);
  const [form] = Form.useForm<{ name: string }>();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetchServiceTokens();
      setEmpresa(r.empresa);
      setItems(r.items);
    } catch {
      message.error("No se pudieron cargar las credenciales.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      message.success("Token copiado.");
    } catch {
      message.warning("Cópialo a mano: el navegador bloqueó el portapapeles.");
    }
  };

  const crear = async () => {
    const vals = await form.validateFields();
    setCreando(true);
    try {
      const creada = await createServiceToken(vals.name.trim());
      setModalCrear(false);
      form.resetFields();
      setViendo({ nombre: creada.name, token: creada.token, nueva: true });
      await cargar();
    } catch (e) {
      message.error(mensajeError(e, "No se pudo crear la credencial."));
    } finally {
      setCreando(false);
    }
  };

  const ver = async (row: ServiceToken) => {
    setRevelandoId(row.id);
    try {
      const token = await revealServiceToken(row.id);
      setViendo({ nombre: row.name, token, nueva: false });
    } catch (e) {
      message.error(mensajeError(e, "No se pudo leer la credencial."));
    } finally {
      setRevelandoId(null);
    }
  };

  const revocar = async (id: string) => {
    try {
      await revokeServiceToken(id);
      message.success("Credencial revocada. Deja de servir de inmediato.");
      await cargar();
    } catch {
      message.error("No se pudo revocar.");
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <AdminPageHeader
        title="Credenciales de servicio"
        subtitle={
          <>
            Acceso permanente y de solo lectura a la API de análisis. Cópialo cuando lo
            necesites; revócalo si se filtra.
            {empresa ? (
              <>
                {" "}
                Estas credenciales son de <Text strong>{empresa}</Text> y solo dejan ver los
                datos de esa empresa.
              </>
            ) : null}
          </>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
            Crear credencial
          </Button>
        }
      />

      <Alert
        type="info"
        showIcon
        message="Qué puede y qué no puede hacer una credencial"
        description={
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            <li>
              <Text strong>Solo consulta.</Text> Únicamente admite <Text code>GET</Text> sobre{" "}
              <Text code>/api/agent/</Text>. Cualquier otra ruta o método se rechaza en el
              servidor, aunque el token diga otra cosa.
            </li>
            <li>
              <Text strong>Sin datos de clientes.</Text> Esa API devuelve solo agregados: nada de
              teléfono, dirección, nombre ni correo.
            </li>
            <li>
              <Text strong>No caduca, pero se revoca.</Text> Si se filtra, revócala aquí y deja de
              funcionar en la siguiente petición.
            </li>
            <li>
              <Text strong>Solo la ven los administradores</Text>, y cada vez que alguien la mira
              queda registrado en el servidor.
            </li>
            <li>
              <Text strong>Atada a una empresa.</Text> Solo consulta los datos de la empresa donde
              se creó. Si administras varias, crea una credencial en cada una.
            </li>
          </ul>
        }
      />

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table<ServiceToken>
          rowKey="id"
          loading={cargando}
          dataSource={items}
          pagination={false}
          size="middle"
          locale={{ emptyText: "Todavía no hay credenciales." }}
          columns={[
            {
              title: "Nombre",
              dataIndex: "name",
              render: (v: string, row) => (
                <Space direction="vertical" size={0}>
                  <Text delete={!!row.revokedAt} strong={!row.revokedAt}>
                    {v}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <Text code>{row.prefix}…</Text>
                  </Text>
                </Space>
              ),
            },
            {
              title: "Estado",
              dataIndex: "revokedAt",
              width: 130,
              render: (v: string | null) =>
                v ? <Tag color="red">Revocada</Tag> : <Tag color="green">Activa</Tag>,
            },
            { title: "Creada", dataIndex: "createdAt", width: 180, render: fecha },
            {
              title: "Último uso",
              dataIndex: "lastUsedAt",
              width: 180,
              render: (v: string | null) =>
                v ? fecha(v) : <Text type="secondary">Nunca usada</Text>,
            },
            {
              title: "",
              key: "acciones",
              width: 200,
              render: (_: unknown, row) => (
                <Space size={4}>
                  {row.puedeVerse ? (
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      loading={revelandoId === row.id}
                      onClick={() => ver(row)}
                    >
                      Ver token
                    </Button>
                  ) : (
                    <Tooltip title="Se creó antes de que se guardaran; ya no se puede recuperar.">
                      <Button size="small" disabled icon={<EyeOutlined />}>
                        Ver token
                      </Button>
                    </Tooltip>
                  )}
                  {row.revokedAt ? null : (
                    <Popconfirm
                      title="¿Revocar esta credencial?"
                      description="Deja de funcionar de inmediato y no se puede deshacer."
                      okText="Revocar"
                      okButtonProps={{ danger: true }}
                      cancelText="Cancelar"
                      onConfirm={() => revocar(row.id)}
                    >
                      <Button size="small" danger icon={<StopOutlined />}>
                        Revocar
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="Crear credencial de servicio"
        open={modalCrear}
        onCancel={() => setModalCrear(false)}
        onOk={crear}
        confirmLoading={creando}
        okText="Crear"
        cancelText="Cancelar"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label="¿Para qué es?"
            rules={[{ required: true, min: 3, message: "Ponle un nombre de al menos 3 caracteres." }]}
            extra="Sirve para reconocerla en la lista y saber qué estás revocando."
          >
            <Input placeholder="Ej. Agente IA de análisis" autoFocus maxLength={120} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={viendo?.nueva ? "Credencial creada" : `Token de "${viendo?.nombre ?? ""}"`}
        open={!!viendo}
        onCancel={() => setViendo(null)}
        footer={[
          <Button key="cerrar" onClick={() => setViendo(null)}>
            Cerrar
          </Button>,
          <Button
            key="copiar"
            type="primary"
            icon={<CopyOutlined />}
            onClick={() => viendo && copiar(viendo.token)}
          >
            Copiar token
          </Button>,
        ]}
        width={640}
      >
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          Úsalo como <Text code>Authorization: Bearer …</Text>. Puedes volver a esta pantalla a
          copiarlo cuando quieras.
        </Paragraph>
        <Input.TextArea
          readOnly
          value={viendo?.token ?? ""}
          autoSize={{ minRows: 2, maxRows: 3 }}
          style={{ fontFamily: "monospace", fontSize: 12 }}
          onFocus={(e) => e.currentTarget.select()}
        />
      </Modal>
    </Space>
  );
}
