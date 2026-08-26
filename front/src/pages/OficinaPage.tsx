import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  DatePicker,
  Input,
  Space,
  Table,
  Tabs,
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
  downloadOrdersExport,
  fetchOficinaCarriers,
  fetchOrdersPage,
  fetchProductosDetalle,
  patchOficinaTableConfig,
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
  buildVisibleOficinaColumns,
  DEFAULT_OFICINA_TABLE_CONFIG,
  mergeOficinaTableConfig,
  OFICINA_COLUMN_LABELS,
} from "../orders/oficinaTableConfig";
import {
  initialColumnFilters,
  type Pedido,
  type ProductoDetalle,
} from "../orders/ordersTypes";
import type { OrdersTableConfig } from "../types";
import { dayjsFromYmdFilterString } from "../utils/calendarDateLocal";

const { Title, Text } = Typography;

const OFICINA_DIRECCION = "oficina";
const TAB_TODAS = "__todas__";

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

export function OficinaPage() {
  const { user, refresh: refreshAuth } = useAuth();
  const canEditPedidos = usePermission("actionPedidosEditar");
  const canExportPedidos = usePermission("actionPedidosExportar");
  const activeCompanyId = localStorage.getItem("fersua_company_id");

  const [data, setData] = useState<Pedido[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [carrierTab, setCarrierTab] = useState(TAB_TODAS);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortField, setSortField] = useState<string>("id");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("DESC");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Pedido>>({});
  const [expandedProducts, setExpandedProducts] = useState<Record<string, ProductoDetalle[]>>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [exporting, setExporting] = useState(false);
  const [columnsDrawerOpen, setColumnsDrawerOpen] = useState(false);
  const [filters, setFilters] = useState({
    ...initialColumnFilters,
    cartera_ok: "" as "" | "ok" | "no",
  });

  const tableConfig = useMemo(
    () => mergeOficinaTableConfig(user?.oficinaTableConfig ?? null),
    [user?.oficinaTableConfig],
  );

  const buildListParams = useCallback((): Record<string, unknown> => {
    const params: Record<string, unknown> = {
      sortField,
      sortOrder,
      direccion: OFICINA_DIRECCION,
    };
    if (carrierTab !== TAB_TODAS) params.transportadora = carrierTab;
    if (startDate && endDate) {
      params.startDate = startDate;
      params.endDate = endDate;
    }
    return params;
  }, [sortField, sortOrder, carrierTab, startDate, endDate]);

  const loadCarriers = useCallback(async () => {
    try {
      const res = await fetchOficinaCarriers({
        ...(startDate && endDate ? { startDate, endDate } : {}),
      });
      setCarriers(res.carriers);
      setCarrierTab((prev) =>
        prev === TAB_TODAS || res.carriers.includes(prev) ? prev : TAB_TODAS,
      );
    } catch {
      message.warning("No se pudieron cargar las transportadoras de oficina.");
      setCarriers([]);
    }
  }, [startDate, endDate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchOrdersPage({ page, limit, ...buildListParams() });
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
      message.error(detail ? `Error cargando oficina: ${detail}` : "Error cargando pedidos de oficina");
    }
    setLoading(false);
  }, [page, limit, buildListParams]);

  useEffect(() => {
    void loadCarriers();
  }, [loadCarriers, activeCompanyId, user?.activeCompany]);

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
        if (editData[field] !== undefined) payload[field] = editData[field];
      }
      await updateOrder(editingId, payload);
      message.success("Pedido actualizado");
      setEditingId(null);
      await fetchData();
      await loadCarriers();
    } catch {
      message.error("Error al guardar");
    }
  }, [editingId, editData, fetchData, loadCarriers]);

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
    () => buildVisibleOficinaColumns(tableConfig, columnDefs),
    [tableConfig, columnDefs],
  );

  const handleSaveColumnsConfig = async (config: OrdersTableConfig) => {
    await patchOficinaTableConfig(config);
    await refreshAuth();
    message.success("Configuración de columnas de Oficina guardada");
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

  const tabItems = useMemo(
    () => [
      { key: TAB_TODAS, label: "Todas" },
      ...carriers.map((c) => ({ key: c, label: c })),
    ],
    [carriers],
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Oficina
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Pedidos cuya dirección contiene «oficina», segmentados por transportadora.
          </Text>
        </div>
        <Space wrap>
          <DatePicker.RangePicker
            placeholder={["Desde", "Hasta"]}
            format="DD/MM/YYYY"
            value={
              startDate && endDate
                ? [dayjsFromYmdFilterString(startDate), dayjsFromYmdFilterString(endDate)]
                : null
            }
            onChange={(dates) => {
              const d0 = dates?.[0];
              const d1 = dates?.[1];
              if (!d0 || !d1) {
                setStartDate("");
                setEndDate("");
              } else {
                setStartDate(d0.format("YYYY-MM-DD"));
                setEndDate(d1.format("YYYY-MM-DD"));
              }
              setPage(1);
            }}
          />
          <Button icon={<SettingOutlined />} onClick={() => setColumnsDrawerOpen(true)}>
            Columnas
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => void handleExportExcel()}
            loading={exporting}
            disabled={!canExportPedidos}
          >
            Exportar Excel
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void loadCarriers();
              void fetchData();
            }}
          >
            Recargar
          </Button>
          <Text type="secondary">{total.toLocaleString()} resultados</Text>
        </Space>
      </div>

      <Tabs
        activeKey={carrierTab}
        onChange={(key) => {
          setCarrierTab(key);
          setPage(1);
        }}
        items={tabItems}
        style={{ marginBottom: 8 }}
      />

      <OrdersColumnsDrawer
        open={columnsDrawerOpen}
        savedConfig={user?.oficinaTableConfig ?? DEFAULT_OFICINA_TABLE_CONFIG}
        onClose={() => setColumnsDrawerOpen(false)}
        onSave={handleSaveColumnsConfig}
        title="Columnas — Oficina"
        mergeConfig={mergeOficinaTableConfig}
        labels={OFICINA_COLUMN_LABELS}
        defaultConfig={DEFAULT_OFICINA_TABLE_CONFIG}
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
        expandable={{
          onExpand: (expanded, record) => {
            if (expanded && record.id_dropi) void loadProducts(record.id_dropi);
          },
          expandedRowRender: (record) => {
            const prods = expandedProducts[record.id_dropi] ?? [];
            if (!prods.length) return <Text type="secondary">Sin productos detalle.</Text>;
            return (
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {prods.map((p, i) => (
                  <li key={i}>
                    {p.producto_nombre ?? p.sku ?? "Producto"} × {p.cantidad ?? 1}
                  </li>
                ))}
              </ul>
            );
          },
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
        onChange={(pagination, _tableFilters, sorter, extra) => {
          if (extra.action === "paginate") {
            setPage(pagination.current || 1);
            setLimit(pagination.pageSize || 25);
            setSelectedRowKeys([]);
          } else {
            setPage(1);
            const ord = Array.isArray(sorter) ? sorter[0] : sorter;
            if (ord && "field" in ord && ord.field) {
              setSortField(String(ord.field));
              setSortOrder(ord.order === "ascend" ? "ASC" : "DESC");
            }
          }
        }}
        locale={{ emptyText: "Sin pedidos con «oficina» en la dirección para este filtro." }}
      />
    </div>
  );
}
