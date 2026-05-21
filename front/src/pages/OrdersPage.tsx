import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Select,
  Space,
  Table,
  Typography,
  message,
} from "antd";
import {
  DownloadOutlined,
  ReloadOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { isAxiosError } from "axios";
import {
  api,
  downloadOrdersExport,
  fetchCatalogProducts,
  fetchOrdersPage,
  fetchProductosDetalle,
  patchOrdersTableConfig,
  remapearEstados,
  updateOrder,
} from "../api";
import { useAuth } from "../contexts/AuthContext";
import { usePermission } from "../hooks/usePermission";
import { OrdersColumnsDrawer } from "../orders/OrdersColumnsDrawer";
import {
  createOrdersColumnDefs,
  type OrdersColumnContext,
} from "../orders/ordersColumnRegistry";
import {
  buildVisibleColumns,
  DEFAULT_ORDERS_TABLE_CONFIG,
  mergeOrdersTableConfig,
} from "../orders/ordersTableConfig";
import {
  initialColumnFilters,
  PEDIDO_COLUMN_FILTER_KEYS,
  type Pedido,
  type ProductoDetalle,
} from "../orders/ordersTypes";
import type { CatalogProduct, OrdersTableConfig } from "../types";
import { dayjsFromYmdFilterString } from "../utils/calendarDateLocal";

const { Title, Text } = Typography;

function pedidoMapeoPrefillPath(p: Pedido): string {
  const q = new URLSearchParams();
  const tr = (p.transportadora ?? "").trim();
  const eo = (p.estatus_original ?? "").trim();
  const um = (p.ultimo_mov ?? "").trim();
  if (tr) q.set("transportadora", tr);
  if (eo) q.set("estatusOriginal", eo);
  if (um) q.set("ultimoMovimiento", um);
  const s = q.toString();
  return s ? `/app/mapeo?${s}` : "/app/mapeo";
}

function isSinMapearUnificado(v: string | null | undefined): boolean {
  return (v ?? "").trim().toUpperCase() === "SIN MAPEAR";
}

function isPedidoCarteraOk(estado: string | null | undefined): boolean {
  return String(estado ?? "").trim().toUpperCase() === "OK";
}

export function OrdersPage() {
  const { user, refresh: refreshAuth } = useAuth();
  const canEditPedidos = usePermission("actionPedidosEditar");
  const canExportPedidos = usePermission("actionPedidosExportar");
  const canRemapear = usePermission("actionMapeoEstadosCrud");
  const activeCompanyId = localStorage.getItem("fersua_company_id");
  const [form] = Form.useForm();
  const [data, setData] = useState<Pedido[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [filters, setFilters] = useState({
    ...initialColumnFilters,
    startDate: "",
    endDate: "",
    cartera_ok: "" as "" | "ok" | "no",
    catalog_product_id: "",
  });
  const [sortField, setSortField] = useState<string>("id");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("DESC");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Pedido>>({});
  const [expandedProducts, setExpandedProducts] = useState<Record<string, ProductoDetalle[]>>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);
  const [columnsDrawerOpen, setColumnsDrawerOpen] = useState(false);

  const tableConfig = useMemo(
    () => mergeOrdersTableConfig(user?.ordersTableConfig ?? null),
    [user?.ordersTableConfig],
  );

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
    if (filters.cartera_ok === "ok") params.cartera_ok = true;
    else if (filters.cartera_ok === "no") params.cartera_ok = false;
    if (filters.catalog_product_id.trim()) {
      params.catalog_product_id = filters.catalog_product_id.trim();
    }
    return params;
  }, [filters, sortField, sortOrder]);

  const productFilterOptions = useMemo(
    () =>
      catalogProducts.map((p) => ({
        value: p.id,
        label: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
      })),
    [catalogProducts],
  );

  useEffect(() => {
    void (async () => {
      try {
        const list = await fetchCatalogProducts();
        setCatalogProducts(list.filter((p) => p.isActive));
      } catch {
        /* sin catálogo */
      }
    })();
  }, [activeCompanyId, user?.activeCompany]);

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

  const handleEdit = useCallback((record: Pedido) => {
    setEditingId(record.id);
    setEditData({ ...record });
  }, []);

  const handleSave = useCallback(async () => {
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
  }, [editingId, editData, fetchData]);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditData({});
  }, []);

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

  const columnCtx: OrdersColumnContext = useMemo(
    () => ({
      filters: filters as OrdersColumnContext["filters"],
      setFilters: setFilters as OrdersColumnContext["setFilters"],
      setPage,
      editingId,
      editData,
      setEditData,
      userRole: user?.role,
      canEditPedidos,
      renderEditable,
      pedidoMapeoPrefillPath,
      isSinMapearUnificado,
      isPedidoCarteraOk,
      onSave: () => void handleSave(),
      onCancel: handleCancel,
      onEdit: handleEdit,
    }),
    [
      filters,
      editingId,
      editData,
      user?.role,
      canEditPedidos,
      handleSave,
      handleCancel,
      handleEdit,
    ],
  );

  const columnDefs = useMemo(() => createOrdersColumnDefs(columnCtx), [columnCtx]);

  const columns = useMemo(
    () => buildVisibleColumns(tableConfig, columnDefs),
    [tableConfig, columnDefs],
  );

  const handleSaveColumnsConfig = async (config: OrdersTableConfig) => {
    await patchOrdersTableConfig(config);
    await refreshAuth();
    message.success("Configuración de columnas guardada");
  };

  const selectedRows = data.filter((r) => selectedRowKeys.includes(r.id));
  const sumVenta = selectedRows.reduce((s, r) => s + Number(r.venta ?? 0), 0);
  const sumGanancia = selectedRows.reduce((s, r) => s + Number(r.ganancia_calc ?? 0), 0);
  const sumFlete = selectedRows.reduce((s, r) => s + Number(r.flete ?? 0), 0);
  const sumCartera = selectedRows.reduce((s, r) => s + Number(r.cartera ?? 0), 0);

  const idxColVenta = columns.findIndex(
    (c) => typeof c === "object" && c !== null && "dataIndex" in c && c.dataIndex === "venta",
  );
  const tableLeadingExtraCols = 2;
  const summaryColSpanLabel = (idxColVenta >= 0 ? idxColVenta : 10) + tableLeadingExtraCols;
  const summaryColSpanTail =
    idxColVenta >= 0 ? Math.max(1, columns.length - idxColVenta - 4) : 7;

  const scrollX = Math.max(
    1200,
    columns.reduce((s, c) => {
      if (typeof c !== "object" || c === null) return s;
      const w = c.width;
      return s + (typeof w === "number" ? w : 120);
    }, 0),
  );

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
          <Select
            showSearch
            allowClear
            placeholder="Producto (catálogo)"
            optionFilterProp="label"
            style={{ minWidth: 220 }}
            options={productFilterOptions}
            value={filters.catalog_product_id || undefined}
            onChange={(v) => {
              setFilters((prev) => ({ ...prev, catalog_product_id: v ?? "" }));
              setPage(1);
            }}
          />
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
          <Button icon={<SettingOutlined />} onClick={() => setColumnsDrawerOpen(true)}>
            Columnas
          </Button>
          {canRemapear ? (
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
          ) : null}
          <Button
            icon={<DownloadOutlined />}
            onClick={() => void handleExportExcel()}
            loading={exporting}
            disabled={!canExportPedidos}
          >
            Exportar Excel
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchData()}>
            Recargar
          </Button>
          <Text type="secondary">{total.toLocaleString()} resultados</Text>
        </Space>
      </div>

      <OrdersColumnsDrawer
        open={columnsDrawerOpen}
        savedConfig={user?.ordersTableConfig ?? DEFAULT_ORDERS_TABLE_CONFIG}
        onClose={() => setColumnsDrawerOpen(false)}
        onSave={handleSaveColumnsConfig}
      />

      <Table<Pedido>
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: scrollX }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        summary={() =>
          selectedRowKeys.length > 0 ? (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={summaryColSpanLabel}>
                  <Text strong>
                    Total ({selectedRowKeys.length} fila{selectedRowKeys.length !== 1 ? "s" : ""} seleccionada
                    {selectedRowKeys.length !== 1 ? "s" : ""})
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong>${sumVenta.toLocaleString()}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <Text strong type={sumGanancia >= 0 ? "success" : "danger"}>
                    ${sumGanancia.toLocaleString()}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <Text strong>${sumFlete.toLocaleString()}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <Text strong type={sumCartera >= 0 ? "success" : "danger"}>
                    ${sumCartera.toLocaleString()}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} colSpan={summaryColSpanTail} />
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
              const fvOk = tableFilters?.cartera_ok;
              const firstOk = Array.isArray(fvOk) ? fvOk[0] : undefined;
              next.cartera_ok =
                firstOk === "ok" || firstOk === "no" ? (firstOk as "ok" | "no") : "";
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
