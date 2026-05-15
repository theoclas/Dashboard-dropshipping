import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
  Upload,
  message,
} from "antd";
import { EditOutlined, InboxOutlined, PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import {
  api,
  deleteCpaRecord,
  importCpaFile,
  patchCpaRecord,
  postCpaRecord,
  type CpaRecordWriteBody,
} from "./api";
import type { CpaRecordRow } from "./types";
import { fmtInteger, fmtMoney } from "./utils/format";
import { semanaDelMesDesdeFecha } from "./utils/cpaSemana";

const { Dragger } = Upload;

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return fmtMoney(v);
  const n = Number(v);
  return Number.isFinite(n) ? fmtMoney(n) : String(v);
}

export function CpaRecordsView() {
  const [rows, setRows] = useState<CpaRecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastImport, setLastImport] = useState<{ imported: number; errors: string[] } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CpaRecordRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<CpaRecordRow[]>("/cpa-records");
      setRows(data);
    } catch {
      message.error("No se pudo cargar CPA.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    const hoy = dayjs();
    form.setFieldsValue({
      fecha: hoy,
      semana: semanaDelMesDesdeFecha(hoy),
      producto: "",
      cuentaPublicitaria: "",
    });
    setModalOpen(true);
  }

  function openEdit(r: CpaRecordRow) {
    setEditing(r);
    const f = r.fecha ? dayjs(r.fecha.slice(0, 10)) : dayjs();
    form.setFieldsValue({
      semana: semanaDelMesDesdeFecha(f),
      fecha: f,
      producto: r.producto ?? "",
      cuentaPublicitaria: r.cuentaPublicitaria ?? "",
      gastoPublicidad: r.gastoPublicidad != null ? Number(r.gastoPublicidad) : undefined,
      conversaciones: r.conversaciones ?? undefined,
      totalFacturado: r.totalFacturado != null ? Number(r.totalFacturado) : undefined,
      gananciaPromedio: r.gananciaPromedio != null ? Number(r.gananciaPromedio) : undefined,
      ventas: r.ventas ?? undefined,
    });
    setModalOpen(true);
  }

  async function submitForm() {
    const v = await form.validateFields();
    const payload: CpaRecordWriteBody = {
      semana: (v.semana as string)?.trim() || null,
      fecha: (v.fecha as dayjs.Dayjs).format("YYYY-MM-DD"),
      producto: String(v.producto).trim(),
      cuentaPublicitaria: (v.cuentaPublicitaria as string)?.trim() || null,
      gastoPublicidad: v.gastoPublicidad == null ? null : Number(v.gastoPublicidad),
      conversaciones: v.conversaciones == null ? null : Math.trunc(Number(v.conversaciones)),
      totalFacturado: v.totalFacturado == null ? null : Number(v.totalFacturado),
      gananciaPromedio: v.gananciaPromedio == null ? null : Number(v.gananciaPromedio),
      ventas: v.ventas == null ? null : Math.trunc(Number(v.ventas)),
    };

    setSaving(true);
    try {
      if (editing) {
        await patchCpaRecord(editing.id, payload);
        message.success("CPA actualizado.");
      } else {
        await postCpaRecord(payload);
        message.success("CPA creado.");
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      const msg =
        typeof e === "object" && e && "response" in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "")
          : "";
      message.error(msg || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  const columns: ColumnsType<CpaRecordRow> = [
    { title: "Semana", dataIndex: "semana", width: 100, ellipsis: true },
    {
      title: "Fecha",
      dataIndex: "fecha",
      width: 110,
      render: (v: string | null) => (v ? v.slice(0, 10) : "—"),
    },
    { title: "Producto", dataIndex: "producto", ellipsis: true },
    { title: "Cuenta", dataIndex: "cuentaPublicitaria", ellipsis: true },
    { title: "Gasto pub.", dataIndex: "gastoPublicidad", width: 120, render: fmtCell },
    { title: "Conv.", dataIndex: "conversaciones", width: 72, render: (n) => (n != null ? fmtInteger(n) : "—") },
    { title: "Total fact.", dataIndex: "totalFacturado", width: 120, render: fmtCell },
    { title: "Gan. prom.", dataIndex: "gananciaPromedio", width: 110, render: fmtCell },
    { title: "Ventas", dataIndex: "ventas", width: 80, render: (n) => (n != null ? fmtInteger(n) : "—") },
    { title: "Ticket prom.", dataIndex: "ticketPromedioProducto", width: 110, render: fmtCell },
    { title: "CPA", dataIndex: "cpa", width: 100, render: fmtCell },
    { title: "Conv. rate", dataIndex: "conversionRate", width: 90, render: fmtCell },
    { title: "Costo pub.", dataIndex: "costoPublicitario", width: 100, render: fmtCell },
    { title: "Utilidad apx.", dataIndex: "utilidadAproximada", width: 110, render: fmtCell },
    { title: "Rentab.", dataIndex: "rentabilidad", width: 90, render: fmtCell },
    {
      title: "Acciones",
      key: "acciones",
      width: 120,
      fixed: "right",
      render: (_, r) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
            Editar
          </Button>
          <Popconfirm title="¿Eliminar este registro CPA?" onConfirm={() => void removeRow(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              Borrar
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  async function removeRow(id: string) {
    try {
      await deleteCpaRecord(id);
      message.success("Eliminado.");
      await load();
    } catch {
      message.error("No se pudo eliminar.");
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Space align="center" style={{ justifyContent: "space-between", width: "100%", flexWrap: "wrap" }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          CPA publicitario
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Nuevo registro
        </Button>
      </Space>

      <Card>
        <Typography.Paragraph type="secondary">
          Importa el Excel de CPA (reemplaza todos los registros de la empresa) o crea/edita filas desde aquí. Al
          guardar, el sistema calcula automáticamente: <strong>CPA</strong>, ticket promedio, tasa de conversión, costo
          publicitario, utilidad aproximada y rentabilidad (misma lógica que la plantilla / import).
        </Typography.Paragraph>
        <Dragger
          accept=".xlsx,.xls"
          multiple={false}
          showUploadList={false}
          disabled={importBusy}
          beforeUpload={async (file) => {
            setImportBusy(true);
            setProgress(0);
            setLastImport(null);
            try {
              const res = await importCpaFile(file, setProgress);
              setLastImport(res);
              message.success(`CPA importados: ${res.imported}`);
              await load();
            } catch {
              message.error("Error al importar CPA.");
            } finally {
              setImportBusy(false);
            }
            return false;
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Arrastra el Excel de CPA</p>
          {importBusy ? <Typography.Text type="secondary">Subiendo… {progress}%</Typography.Text> : null}
        </Dragger>
        {lastImport?.errors.length ? (
          <Alert style={{ marginTop: 12 }} type="warning" message="Errores" description={lastImport.errors.join("\n")} />
        ) : null}
      </Card>

      <Table<CpaRecordRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 1600 }}
        pagination={{ pageSize: 20 }}
        columns={columns}
      />

      <Modal
        title={editing ? "Editar CPA" : "Nuevo CPA"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void submitForm()}
        confirmLoading={saving}
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="semana"
            label="Semana"
            extra="Se completa sola al elegir la fecha (SEMANA 1…4: días 1–7, 8–14, 15–21, 22–31). Puedes corregirla a mano si hace falta."
          >
            <Input placeholder="SEMANA 1" maxLength={50} />
          </Form.Item>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true, message: "Requerida" }]}>
            <DatePicker
              style={{ width: "100%" }}
              format="DD/MM/YYYY"
              onChange={(d) => {
                form.setFieldValue("semana", d && d.isValid() ? semanaDelMesDesdeFecha(d) : "");
              }}
            />
          </Form.Item>
          <Form.Item name="producto" label="Producto" rules={[{ required: true, message: "Requerido" }]}>
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item name="cuentaPublicitaria" label="Cuenta publicitaria">
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item name="gastoPublicidad" label="Gasto publicidad">
            <InputNumber min={0} style={{ width: "100%" }} placeholder="0" />
          </Form.Item>
          <Form.Item name="conversaciones" label="Conversaciones">
            <InputNumber min={0} precision={0} style={{ width: "100%" }} placeholder="0" />
          </Form.Item>
          <Form.Item name="totalFacturado" label="Total facturado">
            <InputNumber min={0} style={{ width: "100%" }} placeholder="0" />
          </Form.Item>
          <Form.Item name="gananciaPromedio" label="Ganancia promedio (unitaria)">
            <InputNumber style={{ width: "100%" }} placeholder="0" />
          </Form.Item>
          <Form.Item name="ventas" label="Ventas (unidades)">
            <InputNumber min={0} precision={0} style={{ width: "100%" }} placeholder="0" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
