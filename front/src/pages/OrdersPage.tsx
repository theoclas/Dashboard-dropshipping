import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  CloseOutlined,
  DownloadOutlined,
  EditOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { FilterDropdownProps } from "antd/es/table/interface";
import { isAxiosError } from "axios";
import {
  api,
  downloadOrdersExport,
  fetchOrdersPage,
  fetchProductosDetalle,
  remapearEstados,
  updateOrder,
} from "../api";
import { useAuth } from "../contexts/AuthContext";
import { dayjsFromYmdFilterString, fmtCalendarDateDdMmYyyy } from "../utils/calendarDateLocal";

const { Title, Text } = Typography;

/** Fila API (snake_case, alineada a Petho). */
interface Pedido {
  id: string;
  id_dropi: string;
  fecha: string | null;
  cliente: string | null;
  transportadora: string | null;
  estado_operativo: string | null;
  guia: string | null;
  departamento: string | null;
  ciudad: string | null;
  direccion: string | null;
  telefono: string | null;
  notas: string | null;
  venta: number | null;
  ganancia_calc: number | null;
  flete: number | null;
  costo_devolucion_estimado: number | null;
  costo_proveedor: number | null;
  cartera: number | null;
  cartera_aplicada: number | null;
  estado_cartera: string | null;
  estado_unificado: string | null;
  estatus_original: string | null;
  ultimo_mov: string | null;
  fecha_ult_mov: string | null;
  dias_desde_ult_mov: number | null;
  notas_manuales: string | null;
}

interface ProductoDetalle {
  id: number;
  pedido_id_dropi: string;
  producto_nombre: string | null;
  cantidad: number | null;
  precio_proveedor: number | null;
  sku: string | null;
  variacion: string | null;
}

const estadoColors: Record<string, string> = {
  ENTREGADO: "green",
  DEVOLUCION: "red",
  DEVOLUCIÓN: "red",
  "EN REPARTO": "blue",
  NOVEDAD: "orange",
  OFICINA: "purple",
  "OFICINA 1": "volcano",
  CANCELADO: "default",
  "SIN MAPEAR": "gold",
  DESPACHADA: "cyan",
  "EN RUTA": "geekblue",
};

const PEDIDO_COLUMN_FILTER_KEYS = [
  "id",
  "id_dropi",
  "estado_unificado",
  "transportadora",
  "ciudad",
  "cliente",
  "telefono",
  "guia",
  "notas_manuales",
  "estado_operativo",
  "notas",
  "estatus_original",
  "ultimo_mov",
  "estado_cartera",
  "venta",
  "ganancia_calc",
  "flete",
  "cartera",
  "dias_desde_ult_mov",
  "fecha",
] as const;

type PedidoColumnFilterKey = (typeof PEDIDO_COLUMN_FILTER_KEYS)[number];

const initialColumnFilters: Record<PedidoColumnFilterKey, string> = {
  id: "",
  id_dropi: "",
  estado_unificado: "",
  transportadora: "",
  ciudad: "",
  cliente: "",
  telefono: "",
  guia: "",
  notas_manuales: "",
  estado_operativo: "",
  notas: "",
  estatus_original: "",
  ultimo_mov: "",
  estado_cartera: "",
  venta: "",
  ganancia_calc: "",
  flete: "",
  cartera: "",
  dias_desde_ult_mov: "",
  fecha: "",
};

export function OrdersPage() {
  const { user } = useAuth();
  const activeCompanyId = localStorage.getItem("fersua_company_id");
  const [form] = Form.useForm();
  const [data, setData] = useState<Pedido[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [filters, setFilters] = useState({
    ...initialColumnFilters,
    startDate: "",
    endDate: "",
  });
  const [sortField, setSortField] = useState<string>("id");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("DESC");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Pedido>>({});
  const [expandedProducts, setExpandedProducts] = useState<Record<string, ProductoDetalle[]>>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);

  const buildListParams = useCallback((): Record<string, unknown> => {
    const params: Record<string, unknown> = { sortField, sortOrder };
    for (const k of PEDIDO_COLUMN_FILTER_KEYS) {
      const raw = filters[k];
      const v = typeof raw === "string" ? raw.trim() : "";
      if (!v) continue;
      if (k === "fecha") params.fecha_contains = v;
      else params[k] = v;
    }
    if (filters.startDate && filters.endDate) {
      params.startDate = filters.startDate;
      params.endDate = filters.endDate;
    }
    return params;
  }, [filters, sortField, sortOrder]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit, ...buildListParams() };
      const result = await fetchOrdersPage(params);
      setData(result.data as Pedido[]);
      setTotal(result.total);
      setSelectedRowKeys([]);
    } catch (e) {
      const detail =
        isAxiosError(e) && e.response?.data && typeof e.response.data === "object" && "message" in e.response.data
          ? String((e.response.data as { message?: string }).message ?? "")
          : isAxiosError(e)
            ? e.message
            : e instanceof Error
              ? e.message
              : "";
      message.error(detail ? `Error cargando pedidos: ${detail}` : "Error cargando pedidos");
    }
    setLoading(false);
  }, [page, limit, buildListParams]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, activeCompanyId, user?.activeCompany]);

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await downloadOrdersExport(buildListParams());
      message.success("Excel descargado");
    } catch {
      message.error("Error al exportar a Excel");
    } finally {
      setExporting(false);
    }
  };

  async function createOrder(values: {
    externalOrderId: string;
    cliente?: string;
    ciudad?: string;
    estadoOperativo?: string;
    venta?: number | string;
  }) {
    const ventaNum =
      values.venta === undefined || values.venta === null || values.venta === ""
        ? undefined
        : Number(values.venta);
    await api.post("/orders", {
      externalOrderId: values.externalOrderId,
      cliente: values.cliente,
      ciudad: values.ciudad,
      estadoOperativo: values.estadoOperativo,
      venta: Number.isFinite(ventaNum!) ? ventaNum : undefined,
    });
    form.resetFields();
    await fetchData();
    message.success("Pedido guardado.");
  }

  const handleEdit = (record: Pedido) => {
    setEditingId(record.id);
    setEditData({ ...record });
  };

  const handleSave = async () => {
    if (!editingId) return;
    try {
      const editableFields: (keyof Pedido)[] = [
        "cliente",
        "notas",
        "notas_manuales",
        "telefono",
        "direccion",
        "ciudad",
        "departamento",
        "transportadora",
        "guia",
        "estado_operativo",
        "estado_unificado",
        "estado_cartera",
      ];
      const payload: Record<string, unknown> = {};
      for (const field of editableFields) {
        if (editData[field] !== undefined) {
          payload[field] = editData[field];
        }
      }
      await updateOrder(editingId, payload);
      message.success("Pedido actualizado");
      setEditingId(null);
      await fetchData();
    } catch {
      message.error("Error al guardar");
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditData({});
  };

  const loadProducts = async (idDropi: string) => {
    if (expandedProducts[idDropi]) return;
    try {
      const prods = await fetchProductosDetalle(idDropi);
      setExpandedProducts((prev) => ({ ...prev, [idDropi]: prods as ProductoDetalle[] }));
    } catch {
      message.error("Error cargando productos");
    }
  };

  const renderEditable = (field: keyof Pedido, record: Pedido) => {
    if (user?.role === "LECTOR") return record[field];

    if (editingId === record.id) {
      return (
        <Input
          size="small"
          value={editData[field] as string}
          onChange={(e) => setEditData({ ...editData, [field]: e.target.value })}
        />
      );
    }
    return record[field];
  };

  const getColumnSearchProps = (title: string, filterKey: PedidoColumnFilterKey) => ({
    filterDropdown: ({
      setSelectedKeys,
      selectedKeys,
      confirm,
      clearFilters,
    }: FilterDropdownProps) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          placeholder={`Buscar ${title}`}
          value={String(selectedKeys[0] ?? "")}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button type="primary" onClick={() => confirm()} icon={<SearchOutlined />} size="small" style={{ width: 90 }}>
            Buscar
          </Button>
          <Button
            onClick={() => {
              clearFilters?.();
              confirm();
            }}
            size="small"
            style={{ width: 90 }}
          >
            Limpiar
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />,
    filteredValue: filters[filterKey] ? [filters[filterKey]] : null,
  });

  const columns: ColumnsType<Pedido> = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 88,
      fixed: "left",
      sorter: true,
      ellipsis: true,
      ...getColumnSearchProps("ID", "id"),
    },
    {
      title: "ID Dropi",
      dataIndex: "id_dropi",
      key: "id_dropi",
      width: 100,
      fixed: "left",
      sorter: true,
      ...getColumnSearchProps("ID Dropi", "id_dropi"),
    },
    {
      title: "Fecha",
      dataIndex: "fecha",
      key: "fecha",
      width: 100,
      sorter: true,
      ...getColumnSearchProps("fecha (texto)", "fecha"),
      render: (v: string | null) => fmtCalendarDateDdMmYyyy(v ?? undefined, "-"),
    },
    {
      title: "Cliente",
      dataIndex: "cliente",
      key: "cliente",
      width: 180,
      sorter: true,
      ...getColumnSearchProps("Cliente", "cliente"),
      render: (_: unknown, r) => renderEditable("cliente", r),
    },
    {
      title: "Teléfono",
      dataIndex: "telefono",
      key: "telefono",
      width: 120,
      sorter: true,
      ...getColumnSearchProps("Teléfono", "telefono"),
      render: (_: unknown, r) => renderEditable("telefono", r),
    },
    {
      title: "Ciudad",
      dataIndex: "ciudad",
      key: "ciudad",
      width: 130,
      sorter: true,
      ...getColumnSearchProps("Ciudad", "ciudad"),
    },
    {
      title: "Mis Notas",
      dataIndex: "notas_manuales",
      key: "notas_manuales",
      width: 200,
      sorter: true,
      ...getColumnSearchProps("Mis notas", "notas_manuales"),
      ellipsis: { showTitle: false },
      render: (v: string | null, r: Pedido) => {
        if (editingId === r.id && user?.role !== "LECTOR") {
          return (
            <Input.TextArea
              size="small"
              value={(editData.notas_manuales as string) ?? ""}
              onChange={(e) => setEditData({ ...editData, notas_manuales: e.target.value })}
              rows={2}
              placeholder="Escribe tus notas aquí..."
            />
          );
        }
        return (
          <Tooltip title={v ?? ""}>
            <span>{v || "-"}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "Transportadora",
      dataIndex: "transportadora",
      key: "transportadora",
      width: 140,
      sorter: true,
      ...getColumnSearchProps("Transportadora", "transportadora"),
    },
    {
      title: "Guía",
      dataIndex: "guia",
      key: "guia",
      width: 140,
      sorter: true,
      ...getColumnSearchProps("Guía", "guia"),
    },
    {
      title: "Operativo",
      dataIndex: "estado_operativo",
      key: "estado_operativo",
      width: 130,
      sorter: true,
      ...getColumnSearchProps("Operativo", "estado_operativo"),
      render: (v: string | null) => <Tag color={estadoColors[v ?? ""] || "default"}>{v || "-"}</Tag>,
    },
    {
      title: "Venta",
      dataIndex: "venta",
      key: "venta",
      width: 100,
      align: "right",
      sorter: true,
      ...getColumnSearchProps("Venta", "venta"),
      render: (v: number | null) => `$${Number(v ?? 0).toLocaleString()}`,
    },
    {
      title: "Ganancia",
      dataIndex: "ganancia_calc",
      key: "ganancia_calc",
      width: 100,
      align: "right",
      sorter: true,
      ...getColumnSearchProps("Ganancia", "ganancia_calc"),
      render: (v: number | null) => {
        const num = Number(v ?? 0);
        return (
          <Text type={num >= 0 ? "success" : "danger"}>${num.toLocaleString()}</Text>
        );
      },
    },
    {
      title: "Flete",
      dataIndex: "flete",
      key: "flete",
      width: 90,
      align: "right",
      sorter: true,
      ...getColumnSearchProps("Flete", "flete"),
      render: (v: number | null) => `$${Number(v ?? 0).toLocaleString()}`,
    },
    {
      title: "Cartera",
      dataIndex: "cartera",
      key: "cartera",
      width: 100,
      align: "right",
      sorter: true,
      ...getColumnSearchProps("Cartera", "cartera"),
      render: (v: number | null) => {
        const num = Number(v ?? 0);
        return (
          <Text type={num >= 0 ? "success" : "danger"}>${num.toLocaleString()}</Text>
        );
      },
    },
    {
      title: "Est. Cartera",
      dataIndex: "estado_cartera",
      key: "estado_cartera",
      width: 90,
      sorter: true,
      ...getColumnSearchProps("Est. Cartera", "estado_cartera"),
      render: (v: string | null) => (v === "OK" ? <Tag color="green">OK</Tag> : "-"),
    },
    {
      title: "Días últ. mov",
      dataIndex: "dias_desde_ult_mov",
      key: "dias_desde_ult_mov",
      width: 90,
      align: "center",
      sorter: true,
      ...getColumnSearchProps("Días últ. mov", "dias_desde_ult_mov"),
      render: (v: number | null) => {
        if (v !== 0 && !v) return "-";
        return <Tag color={v > 5 ? "red" : v > 2 ? "orange" : "green"}>{v}</Tag>;
      },
    },
    {
      title: "Notas Dropi",
      dataIndex: "notas",
      key: "notas",
      width: 200,
      sorter: true,
      ...getColumnSearchProps("Notas Dropi", "notas"),
      ellipsis: { showTitle: false },
      render: (v: string | null, r: Pedido) => {
        if (editingId === r.id && user?.role !== "LECTOR") {
          return (
            <Input.TextArea
              size="small"
              value={(editData.notas as string) ?? ""}
              onChange={(e) => setEditData({ ...editData, notas: e.target.value })}
              rows={2}
            />
          );
        }
        return (
          <Tooltip title={v ?? ""}>
            <span>{v || "-"}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "Estado Dropi",
      dataIndex: "estatus_original",
      key: "estatus_original",
      width: 140,
      sorter: true,
      ...getColumnSearchProps("Estado Dropi", "estatus_original"),
      render: (v: string | null) => <Text type="secondary">{v || "-"}</Text>,
    },
    {
      title: "Últ. Mov. Dropi",
      dataIndex: "ultimo_mov",
      key: "ultimo_mov",
      width: 150,
      sorter: true,
      ...getColumnSearchProps("Últ. mov. Dropi", "ultimo_mov"),
      ellipsis: { showTitle: false },
      render: (v: string | null) => (
        <Tooltip title={v ?? ""}>
          <Text type="secondary">{v || "-"}</Text>
        </Tooltip>
      ),
    },
    {
      title: "Estado Asignado",
      dataIndex: "estado_unificado",
      key: "estado_unificado",
      width: 150,
      sorter: true,
      ...getColumnSearchProps("Estado asignado", "estado_unificado"),
      render: (v: string | null) => <Tag color={estadoColors[v ?? ""] || "default"}>{v || "-"}</Tag>,
    },
    {
      title: "Acciones",
      key: "acciones",
      width: 100,
      fixed: "right",
      render: (_, record) => {
        if (user?.role === "LECTOR") return null;
        if (editingId === record.id) {
          return (
            <Space size="small">
              <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => void handleSave()} />
              <Button size="small" icon={<CloseOutlined />} onClick={handleCancel} />
            </Space>
          );
        }
        return <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />;
      },
    },
  ];

  const selectedRows = data.filter((r) => selectedRowKeys.includes(r.id));
  const sumVenta = selectedRows.reduce((s, r) => s + Number(r.venta ?? 0), 0);
  const sumGanancia = selectedRows.reduce((s, r) => s + Number(r.ganancia_calc ?? 0), 0);
  const sumFlete = selectedRows.reduce((s, r) => s + Number(r.flete ?? 0), 0);
  const sumCartera = selectedRows.reduce((s, r) => s + Number(r.cartera ?? 0), 0);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          📋 Pedidos
        </Title>
        <Space wrap>
          <DatePicker.RangePicker
            placeholder={["Desde", "Hasta"]}
            format="DD/MM/YYYY"
            value={
              filters.startDate && filters.endDate
                ? [dayjsFromYmdFilterString(filters.startDate), dayjsFromYmdFilterString(filters.endDate)]
                : null
            }
            onChange={(dates) => {
              const d0 = dates?.[0];
              const d1 = dates?.[1];
              if (!d0 || !d1) {
                setFilters((prev) => ({ ...prev, startDate: "", endDate: "" }));
              } else {
                setFilters((prev) => ({
                  ...prev,
                  startDate: d0.format("YYYY-MM-DD"),
                  endDate: d1.format("YYYY-MM-DD"),
                }));
              }
              setPage(1);
            }}
          />
          {user?.role !== "LECTOR" && (
            <Button
              type="primary"
              onClick={async () => {
                setLoading(true);
                try {
                  const res = await remapearEstados();
                  message.success(
                    `Sincronización lista: ${res.remapeados} pedidos actualizados` +
                      (res.procesados != null ? ` (${res.procesados} evaluados).` : "."),
                  );
                  await fetchData();
                } catch {
                  message.error("Error al automapear estados. Reintente o revise logs del API.");
                } finally {
                  setLoading(false);
                }
              }}
            >
              Sincronizar Estados
            </Button>
          )}
          <Button icon={<DownloadOutlined />} onClick={() => void handleExportExcel()} loading={exporting}>
            Exportar Excel
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchData()}>
            Recargar
          </Button>
          <Text type="secondary">{total.toLocaleString()} resultados</Text>
        </Space>
      </div>

      <Table<Pedido>
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 2000 }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        summary={() =>
          selectedRowKeys.length > 0 ? (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={10}>
                  <Text strong>
                    Total ({selectedRowKeys.length} fila{selectedRowKeys.length !== 1 ? "s" : ""} seleccionada
                    {selectedRowKeys.length !== 1 ? "s" : ""})
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9} align="right">
                  <Text strong>${sumVenta.toLocaleString()}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={10} align="right">
                  <Text strong type={sumGanancia >= 0 ? "success" : "danger"}>
                    ${sumGanancia.toLocaleString()}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={11} align="right">
                  <Text strong>${sumFlete.toLocaleString()}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={12} align="right">
                  <Text strong type={sumCartera >= 0 ? "success" : "danger"}>
                    ${sumCartera.toLocaleString()}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={13} colSpan={7} />
              </Table.Summary.Row>
            </Table.Summary>
          ) : null
        }
        pagination={{
          current: page,
          pageSize: limit,
          total,
          showSizeChanger: true,
          pageSizeOptions: [25, 50, 100, 200, 800],
          showTotal: (t) => `Total: ${t.toLocaleString()}`,
        }}
        onChange={(pagination, tableFilters, sorter, extra) => {
          if (extra.action === "paginate") {
            setPage(pagination.current || 1);
            setLimit(pagination.pageSize || 25);
            setSelectedRowKeys([]);
          } else {
            setPage(1);

            const ord = Array.isArray(sorter) ? sorter[0] : sorter;
            const fieldRaw = ord && typeof ord === "object" ? ord.field : undefined;
            const sortCol =
              fieldRaw == null ? undefined : Array.isArray(fieldRaw) ? String(fieldRaw[0]) : String(fieldRaw);
            const order = ord && typeof ord === "object" ? ord.order : undefined;
            if (sortCol && order) {
              setSortField(sortCol);
              setSortOrder(order === "ascend" ? "ASC" : "DESC");
            } else {
              setSortField("id");
              setSortOrder("DESC");
            }

            setFilters((prev) => {
              const next = { ...prev };
              for (const k of PEDIDO_COLUMN_FILTER_KEYS) {
                const fv = tableFilters?.[k];
                const first = Array.isArray(fv) ? fv[0] : undefined;
                next[k] = first != null && first !== "" ? String(first) : "";
              }
              return next;
            });
            setSelectedRowKeys([]);
          }
        }}
        expandable={{
          expandedRowRender: (record) => {
            const prods = expandedProducts[record.id_dropi];
            if (!prods) return <Text type="secondary">Cargando productos...</Text>;
            if (prods.length === 0) return <Text type="secondary">Sin productos</Text>;
            return (
              <Table
                size="small"
                pagination={false}
                dataSource={prods}
                rowKey="id"
                columns={[
                  { title: "Producto", dataIndex: "producto_nombre", width: 300 },
                  { title: "SKU", dataIndex: "sku", width: 100 },
                  { title: "Variación", dataIndex: "variacion", width: 150 },
                  { title: "Cantidad", dataIndex: "cantidad", width: 80, align: "center" as const },
                  {
                    title: "Precio Prov.",
                    dataIndex: "precio_proveedor",
                    width: 120,
                    align: "right" as const,
                    render: (v: number | null) => `$${Number(v ?? 0).toLocaleString()}`,
                  },
                ]}
              />
            );
          },
          onExpand: (expanded, record) => {
            if (expanded) void loadProducts(record.id_dropi);
          },
        }}
        rowClassName={(record) => {
          const eu = record.estado_unificado ?? "";
          if (eu === "ENTREGADO") return "row-entregado";
          if (eu.includes("DEVOLUCION") || eu.includes("DEVOLUCIÓN")) return "row-devolucion";
          return "";
        }}
      />

      {user?.role !== "LECTOR" && (
        <Card size="small" title="Alta rápida (manual)" style={{ marginTop: 16 }}>
          <Form layout="inline" form={form} onFinish={(v) => void createOrder(v)} style={{ flexWrap: "wrap", rowGap: 8 }}>
            <Form.Item name="externalOrderId" rules={[{ required: true }]}>
              <Input placeholder="ID externo (Dropi)" />
            </Form.Item>
            <Form.Item name="cliente">
              <Input placeholder="Cliente" />
            </Form.Item>
            <Form.Item name="ciudad">
              <Input placeholder="Ciudad" />
            </Form.Item>
            <Form.Item name="estadoOperativo">
              <Input placeholder="Estado operativo" />
            </Form.Item>
            <Form.Item name="venta">
              <Input type="number" step="0.01" placeholder="Venta" style={{ width: 120 }} />
            </Form.Item>
            <Form.Item>
              <Button htmlType="submit" type="primary">
                Guardar
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}
    </div>
  );
}
