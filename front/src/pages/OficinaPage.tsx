import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction, type ThHTMLAttributes } from "react";
import {
  Button,
  DatePicker,
  Input,
  Space,
  Table,
  Tabs,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
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
/** Cuánto puede crecer una columna respecto a su ancho base. */
const COL_RESIZE_MAX_EXTRA = 100;
/** Cuánto puede encogerse respecto al base. */
const COL_RESIZE_MAX_SHRINK = 40;

type ResizableThProps = ThHTMLAttributes<HTMLTableCellElement> & {
  width?: number;
  onResize?: (width: number) => void;
};

function OficinaResizableTitle({ width, onResize, children, style, ...rest }: ResizableThProps) {
  if (width == null || !onResize) {
    return (
      <th {...rest} style={style}>
        {children}
      </th>
    );
  }

  return (
    <th {...rest} style={{ ...style, position: "relative", overflow: "visible" }}>
      {children}
      <span
        role="separator"
        aria-orientation="vertical"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const startX = e.clientX;
          const startW = width;
          const onMove = (ev: MouseEvent) => {
            onResize(startW + (ev.clientX - startX));
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }}
        style={{
          position: "absolute",
          right: -2,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: "col-resize",
          userSelect: "none",
          zIndex: 2,
        }}
      />
    </th>
  );
}

function clampColumnWidth(base: number, next: number): number {
  const min = Math.max(64, base - COL_RESIZE_MAX_SHRINK);
  const max = base + COL_RESIZE_MAX_EXTRA;
  return Math.min(max, Math.max(min, Math.round(next)));
}

function withOficinaResizableColumns(
  columns: ColumnsType<Pedido>,
  widths: Record<string, number>,
  setWidths: Dispatch<SetStateAction<Record<string, number>>>,
): ColumnsType<Pedido> {
  return columns.map((col) => {
    if (!col || typeof col !== "object") return col;
    const key = "key" in col && typeof col.key === "string" ? col.key : null;
    if (!key || key === "acciones") return col;

    const base = typeof col.width === "number" ? col.width : 120;
    const width = widths[key] ?? base;
    const prevOnHeaderCell = col.onHeaderCell;

    return {
      ...col,
      width,
      onHeaderCell: (c) => {
        const prev =
          typeof prevOnHeaderCell === "function"
            ? (prevOnHeaderCell(c) as ResizableThProps)
            : ((prevOnHeaderCell ?? {}) as ResizableThProps);
        return {
          ...prev,
          width,
          onResize: (next: number) => {
            const clamped = clampColumnWidth(base, next);
            setWidths((prevMap) =>
              prevMap[key] === clamped ? prevMap : { ...prevMap, [key]: clamped },
            );
          },
        };
      },
    };
  });
}

/** Previsualiza el valor completo al hover (celdas truncadas). */
function withOficinaCellPreview(
  columns: ColumnsType<Pedido>,
  editingId: string | null,
): ColumnsType<Pedido> {
  return columns.map((col) => {
    if (!col || typeof col !== "object") return col;
    const key = "key" in col && typeof col.key === "string" ? col.key : null;
    if (!key || key === "acciones") return col;

    const dataIndex =
      "dataIndex" in col && typeof col.dataIndex === "string" ? col.dataIndex : null;
    const prevRender = "render" in col ? col.render : undefined;

    return {
      ...col,
      ellipsis: { showTitle: false },
      render: (value: unknown, record: Pedido, index: number) => {
        const content = prevRender
          ? (prevRender as (v: unknown, r: Pedido, i: number) => ReactNode)(value, record, index)
          : (value as ReactNode);

        // Mientras se edita la fila, no envolver (evita cortar el Input).
        if (editingId && record.id === editingId) return content;

        let tip = "";
        if (dataIndex) {
          const raw = record[dataIndex as keyof Pedido];
          if (raw != null && String(raw).trim() !== "") tip = String(raw);
        } else if (typeof value === "string" || typeof value === "number") {
          tip = String(value);
        }

        if (!tip || tip === "-" || tip === "—") return content;

        return (
          <Tooltip title={<span style={{ whiteSpace: "pre-wrap" }}>{tip}</span>} placement="topLeft" mouseEnterDelay={0.25}>
            <span
              style={{
                display: "inline-block",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                verticalAlign: "bottom",
              }}
            >
              {content}
            </span>
          </Tooltip>
        );
      },
    };
  });
}

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
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
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
    () =>
      withOficinaResizableColumns(
        withOficinaCellPreview(buildVisibleOficinaColumns(tableConfig, columnDefs), editingId),
        columnWidths,
        setColumnWidths,
      ),
    [tableConfig, columnDefs, editingId, columnWidths],
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
            Pedidos cuya dirección contiene «oficina», segmentados por transportadora. Arrastra el borde
            derecho del encabezado para ensanchar un poco la columna (máx. +{COL_RESIZE_MAX_EXTRA}px).
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
        components={{
          header: {
            cell: OficinaResizableTitle,
          },
        }}
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
