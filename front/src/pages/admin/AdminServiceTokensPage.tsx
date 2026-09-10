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
  Typography,
  message,
} from "antd";
import { CopyOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import {
  createServiceToken,
  fetchServiceTokens,
  revokeServiceToken,
  type ServiceToken,
  type ServiceTokenCreated,
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

/**
 * Credenciales de servicio para la API de solo lectura del agente.
 *
 * Existen porque el JWT de login caduca a las 8 horas y obligaba a generar uno nuevo en
 * cada sesión de análisis. Estas no caducan, pero **se revocan en un clic** y solo sirven
 * para hacer GET a `/api/agent/`: no pueden escribir nada ni ver datos de clientes.
 */
export function AdminServiceTokensPage() {
  const [items, setItems] = useState<ServiceToken[]>([]);
  const [cargando, setCargando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [recienCreada, setRecienCreada] = useState<ServiceTokenCreated | null>(null);
  const [form] = Form.useForm<{ name: string }>();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setItems(await fetchServiceTokens());
    } catch {
      message.error("No se pudieron cargar las credenciales.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const crear = async () => {
    const vals = await form.validateFields();
    setCreando(true);
    try {
      const creada = await createServiceToken(vals.name.trim());
      setRecienCreada(creada);
      setModalAbierto(false);
      form.resetFields();
      await cargar();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(msg ?? "No se pudo crear la credencial.");
    } finally {
      setCreando(false);
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

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      message.success("Token copiado.");
    } catch {
      message.warning("Cópialo a mano: el navegador bloqueó el portapapeles.");
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <AdminPageHeader
        title="Credenciales de servicio"
        subtitle="Acceso permanente y de solo lectura a la API de análisis. No caducan, pero se revocan en un clic."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalAbierto(true)}>
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
              <Text strong>Se muestra una sola vez.</Text> Solo se guarda su huella; si la pierdes,
              revócala y crea otra.
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
              width: 160,
              render: (v: string | null) =>
                v ? <Tag color="red">Revocada</Tag> : <Tag color="green">Activa</Tag>,
            },
            { title: "Creada", dataIndex: "createdAt", width: 190, render: fecha },
            {
              title: "Último uso",
              dataIndex: "lastUsedAt",
              width: 190,
              render: (v: string | null) =>
                v ? fecha(v) : <Text type="secondary">Nunca usada</Text>,
            },
            {
              title: "",
              key: "acciones",
              width: 130,
              render: (_: unknown, row) =>
                row.revokedAt ? null : (
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
                ),
            },
          ]}
        />
      </Card>

      <Modal
        title="Crear credencial de servicio"
        open={modalAbierto}
        onCancel={() => setModalAbierto(false)}
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
        title="Guarda este token ahora"
        open={!!recienCreada}
        onCancel={() => setRecienCreada(null)}
        footer={[
          <Button key="cerrar" type="primary" onClick={() => setRecienCreada(null)}>
            Ya lo guardé
          </Button>,
        ]}
        width={640}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="No se vuelve a mostrar"
          description="Solo se guarda su huella. Si lo pierdes, revoca esta credencial y crea otra."
        />
        <Paragraph>
          <Input.TextArea
            readOnly
            value={recienCreada?.token ?? ""}
            autoSize={{ minRows: 2, maxRows: 3 }}
            style={{ fontFamily: "monospace", fontSize: 12 }}
            onFocus={(e) => e.currentTarget.select()}
          />
        </Paragraph>
        <Button
          icon={<CopyOutlined />}
          onClick={() => recienCreada && copiar(recienCreada.token)}
          block
        >
          Copiar token
        </Button>
      </Modal>
    </Space>
  );
}
