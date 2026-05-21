import { Button, Input, Select, Space, Tag, Tooltip, Typography } from "antd";
import {
  CloseOutlined,
  EditOutlined,
  SaveOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { FilterDropdownProps } from "antd/es/table/interface";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { fmtCalendarDateDdMmYyyy } from "../utils/calendarDateLocal";
import type { Pedido, PedidoColumnFilterKey } from "./ordersTypes";

const { Text } = Typography;

export const estadoColors: Record<string, string> = {
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

function fmtMoney(v: number | null | undefined): string {
  return `$${Number(v ?? 0).toLocaleString()}`;
}

export type OrdersFiltersState = Record<string, string> & {
  cartera_ok: "" | "ok" | "no";
  startDate?: string;
  endDate?: string;
  catalog_product_id?: string;
};

export type OrdersColumnContext = {
  filters: OrdersFiltersState;
  setFilters: React.Dispatch<React.SetStateAction<OrdersFiltersState>>;
  setPage: (p: number) => void;
  editingId: string | null;
  editData: Partial<Pedido>;
  setEditData: React.Dispatch<React.SetStateAction<Partial<Pedido>>>;
  userRole: string | undefined;
  canEditPedidos: boolean;
  renderEditable: (field: keyof Pedido, record: Pedido) => ReactNode;
  pedidoMapeoPrefillPath: (p: Pedido) => string;
  isSinMapearUnificado: (v: string | null | undefined) => boolean;
  isPedidoCarteraOk: (v: string | null | undefined) => boolean;
  onSave: () => void;
  onCancel: () => void;
  onEdit: (record: Pedido) => void;
};

function getColumnSearchProps(
  ctx: OrdersColumnContext,
  title: string,
  filterKey: PedidoColumnFilterKey,
) {
  return {
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: FilterDropdownProps) => (
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
    filteredValue: ctx.filters[filterKey] ? [ctx.filters[filterKey]] : null,
  };
}

export function createOrdersColumnDefs(ctx: OrdersColumnContext): Record<string, ColumnsType<Pedido>[number]> {
  const search = (title: string, key: PedidoColumnFilterKey) => getColumnSearchProps(ctx, title, key);

  return {
    id: {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 88,
      sorter: true,
      ellipsis: true,
      ...search("ID", "id"),
    },
    id_dropi: {
      title: "ID Dropi",
      dataIndex: "id_dropi",
      key: "id_dropi",
      width: 100,
      sorter: true,
      ...search("ID Dropi", "id_dropi"),
    },
    fecha: {
      title: "Fecha",
      dataIndex: "fecha",
      key: "fecha",
      width: 100,
      sorter: true,
      ...search("fecha (texto)", "fecha"),
      render: (v: string | null) => fmtCalendarDateDdMmYyyy(v ?? undefined, "-"),
    },
    cliente: {
      title: "Cliente",
      dataIndex: "cliente",
      key: "cliente",
      width: 180,
      sorter: true,
      ...search("Cliente", "cliente"),
      render: (_: unknown, r) => ctx.renderEditable("cliente", r),
    },
    telefono: {
      title: "Teléfono",
      dataIndex: "telefono",
      key: "telefono",
      width: 120,
      sorter: true,
      ...search("Teléfono", "telefono"),
      render: (_: unknown, r) => ctx.renderEditable("telefono", r),
    },
    ciudad: {
      title: "Ciudad",
      dataIndex: "ciudad",
      key: "ciudad",
      width: 130,
      sorter: true,
      ...search("Ciudad", "ciudad"),
    },
    tipo_tienda: {
      title: "Tipo tienda",
      dataIndex: "tipo_tienda",
      key: "tipo_tienda",
      width: 110,
      sorter: true,
      ...search("Tipo de tienda", "tipo_tienda"),
      render: (v: string | null) => (v ? <Tag>{v}</Tag> : "—"),
    },
    tienda: {
      title: "Tienda",
      dataIndex: "tienda",
      key: "tienda",
      width: 160,
      sorter: true,
      ellipsis: { showTitle: false },
      ...search("Tienda", "tienda"),
      render: (v: string | null) => (
        <Tooltip title={v ?? ""}>
          <span>{v || "—"}</span>
        </Tooltip>
      ),
    },
    vendedor: {
      title: "Vendedor",
      dataIndex: "vendedor",
      key: "vendedor",
      width: 120,
      sorter: true,
      ...search("Vendedor", "vendedor"),
      ellipsis: true,
    },
    tipo_envio: {
      title: "Tipo envío",
      dataIndex: "tipo_envio",
      key: "tipo_envio",
      width: 100,
      sorter: true,
      ...search("Tipo de envío", "tipo_envio"),
    },
    email_cliente: {
      title: "Email",
      dataIndex: "email_cliente",
      key: "email_cliente",
      width: 160,
      ellipsis: true,
      ...search("Email", "email_cliente"),
    },
    departamento: {
      title: "Departamento",
      dataIndex: "departamento",
      key: "departamento",
      width: 130,
      sorter: true,
      ...search("Departamento", "departamento"),
      render: (_: unknown, r) => ctx.renderEditable("departamento", r),
    },
    direccion: {
      title: "Dirección",
      dataIndex: "direccion",
      key: "direccion",
      width: 200,
      sorter: true,
      ellipsis: { showTitle: false },
      ...search("Dirección", "direccion"),
      render: (_: unknown, r) => ctx.renderEditable("direccion", r),
    },
    notas_manuales: {
      title: "Mis Notas",
      dataIndex: "notas_manuales",
      key: "notas_manuales",
      width: 200,
      sorter: true,
      ...search("Mis notas", "notas_manuales"),
      ellipsis: { showTitle: false },
      render: (v: string | null, r: Pedido) => {
        if (ctx.editingId === r.id && ctx.userRole !== "LECTOR") {
          return (
            <Input.TextArea
              size="small"
              value={(ctx.editData.notas_manuales as string) ?? ""}
              onChange={(e) => ctx.setEditData({ ...ctx.editData, notas_manuales: e.target.value })}
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
    transportadora: {
      title: "Transportadora",
      dataIndex: "transportadora",
      key: "transportadora",
      width: 140,
      sorter: true,
      ...search("Transportadora", "transportadora"),
    },
    guia: {
      title: "Guía",
      dataIndex: "guia",
      key: "guia",
      width: 140,
      sorter: true,
      ...search("Guía", "guia"),
    },
    estado_operativo: {
      title: "Operativo",
      dataIndex: "estado_operativo",
      key: "estado_operativo",
      width: 130,
      sorter: true,
      ...search("Operativo", "estado_operativo"),
      render: (v: string | null) => <Tag color={estadoColors[v ?? ""] || "default"}>{v || "-"}</Tag>,
    },
    venta: {
      title: "Venta",
      dataIndex: "venta",
      key: "venta",
      width: 100,
      align: "right",
      sorter: true,
      ...search("Venta", "venta"),
      render: (v: number | null) => fmtMoney(v),
    },
    ganancia_calc: {
      title: "Ganancia",
      dataIndex: "ganancia_calc",
      key: "ganancia_calc",
      width: 100,
      align: "right",
      sorter: true,
      ...search("Ganancia", "ganancia_calc"),
      render: (v: number | null) => {
        const num = Number(v ?? 0);
        return <Text type={num >= 0 ? "success" : "danger"}>{fmtMoney(num)}</Text>;
      },
    },
    flete: {
      title: "Flete",
      dataIndex: "flete",
      key: "flete",
      width: 90,
      align: "right",
      sorter: true,
      ...search("Flete", "flete"),
      render: (v: number | null) => fmtMoney(v),
    },
    cartera: {
      title: "Cartera",
      dataIndex: "cartera",
      key: "cartera",
      width: 100,
      align: "right",
      sorter: true,
      ...search("Cartera", "cartera"),
      render: (v: number | null) => {
        const num = Number(v ?? 0);
        return <Text type={num >= 0 ? "success" : "danger"}>{fmtMoney(num)}</Text>;
      },
    },
    cartera_aplicada: {
      title: "Cartera aplicada",
      dataIndex: "cartera_aplicada",
      key: "cartera_aplicada",
      width: 110,
      align: "right",
      sorter: true,
      ...search("Cartera aplicada", "cartera_aplicada"),
      render: (v: number | null) => fmtMoney(v),
    },
    cartera_ok: {
      title: "Cartera OK",
      dataIndex: "estado_cartera",
      key: "cartera_ok",
      width: 108,
      align: "center",
      sorter: true,
      filteredValue: ctx.filters.cartera_ok ? [ctx.filters.cartera_ok] : null,
      filterDropdown: ({ confirm, clearFilters }) => (
        <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
          <Select
            allowClear
            placeholder="Filtrar"
            style={{ width: 160, marginBottom: 8, display: "block" }}
            value={ctx.filters.cartera_ok || undefined}
            onChange={(v: "" | "ok" | "no" | undefined) => {
              ctx.setFilters((prev) => ({ ...prev, cartera_ok: v ?? "" }));
            }}
            options={[
              { value: "ok", label: "Sí — cartera OK" },
              { value: "no", label: "No — pendiente u otro" },
            ]}
          />
          <Space>
            <Button
              type="primary"
              size="small"
              onClick={() => {
                ctx.setPage(1);
                confirm();
              }}
            >
              Aplicar
            </Button>
            <Button
              size="small"
              onClick={() => {
                ctx.setFilters((prev) => ({ ...prev, cartera_ok: "" }));
                clearFilters?.();
                ctx.setPage(1);
                confirm();
              }}
            >
              Limpiar
            </Button>
          </Space>
        </div>
      ),
      filterIcon: (filtered: boolean) => (
        <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />
      ),
      render: (v: string | null) => {
        if (ctx.isPedidoCarteraOk(v)) return <Tag color="success">OK</Tag>;
        const raw = String(v ?? "").trim();
        if (!raw) return <Tag color="warning">No</Tag>;
        return (
          <Tooltip title={raw}>
            <Tag color="error">No</Tag>
          </Tooltip>
        );
      },
    },
    dias_desde_ult_mov: {
      title: "Días últ. mov",
      dataIndex: "dias_desde_ult_mov",
      key: "dias_desde_ult_mov",
      width: 90,
      align: "center",
      sorter: true,
      ...search("Días últ. mov", "dias_desde_ult_mov"),
      render: (v: number | null) => {
        if (v !== 0 && !v) return "-";
        return <Tag color={v > 5 ? "red" : v > 2 ? "orange" : "green"}>{v}</Tag>;
      },
    },
    notas: {
      title: "Notas Dropi",
      dataIndex: "notas",
      key: "notas",
      width: 200,
      sorter: true,
      ...search("Notas Dropi", "notas"),
      ellipsis: { showTitle: false },
      render: (v: string | null, r: Pedido) => {
        if (ctx.editingId === r.id && ctx.userRole !== "LECTOR") {
          return (
            <Input.TextArea
              size="small"
              value={(ctx.editData.notas as string) ?? ""}
              onChange={(e) => ctx.setEditData({ ...ctx.editData, notas: e.target.value })}
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
    estatus_original: {
      title: "Estado Dropi",
      dataIndex: "estatus_original",
      key: "estatus_original",
      width: 140,
      sorter: true,
      ...search("Estado Dropi", "estatus_original"),
      render: (v: string | null) => <Text type="secondary">{v || "-"}</Text>,
    },
    ultimo_mov: {
      title: "Últ. Mov. Dropi",
      dataIndex: "ultimo_mov",
      key: "ultimo_mov",
      width: 150,
      sorter: true,
      ...search("Últ. mov. Dropi", "ultimo_mov"),
      ellipsis: { showTitle: false },
      render: (v: string | null) => (
        <Tooltip title={v ?? ""}>
          <Text type="secondary">{v || "-"}</Text>
        </Tooltip>
      ),
    },
    estado_unificado: {
      title: "Estado Asignado",
      dataIndex: "estado_unificado",
      key: "estado_unificado",
      width: 200,
      sorter: true,
      ...search("Estado asignado", "estado_unificado"),
      render: (v: string | null, record: Pedido) => (
        <Space size={6} wrap align="center">
          <Tag color={estadoColors[v ?? ""] || "default"}>{v || "-"}</Tag>
          {ctx.userRole !== "LECTOR" && ctx.isSinMapearUnificado(v) ? (
            <Tooltip title="Ir a Mapeo de estados con transportadora, estatus Dropi y último movimiento de esta fila.">
              <Link to={ctx.pedidoMapeoPrefillPath(record)}>Mapear</Link>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    costo_devolucion_estimado: {
      title: "Costo dev. est.",
      dataIndex: "costo_devolucion_estimado",
      key: "costo_devolucion_estimado",
      width: 110,
      align: "right",
      sorter: true,
      ...search("Costo dev. est.", "costo_devolucion_estimado"),
      render: (v: number | null) => fmtMoney(v),
    },
    costo_proveedor: {
      title: "Costo proveedor",
      dataIndex: "costo_proveedor",
      key: "costo_proveedor",
      width: 110,
      align: "right",
      sorter: true,
      ...search("Costo proveedor", "costo_proveedor"),
      render: (v: number | null) => fmtMoney(v),
    },
    fecha_ult_mov: {
      title: "Fecha últ. mov",
      dataIndex: "fecha_ult_mov",
      key: "fecha_ult_mov",
      width: 110,
      sorter: true,
      render: (v: string | null) => fmtCalendarDateDdMmYyyy(v ?? undefined, "-"),
    },
    hora_ult_mov: {
      title: "Hora últ. mov",
      dataIndex: "hora_ult_mov",
      key: "hora_ult_mov",
      width: 90,
      align: "right",
      sorter: true,
      render: (v: number | null) => (v != null ? String(v) : "-"),
    },
    observacion_dropi: {
      title: "Observación",
      dataIndex: "observacion_dropi",
      key: "observacion_dropi",
      width: 180,
      ...search("Observación Dropi", "observacion_dropi"),
      ellipsis: { showTitle: false },
      render: (v: string | null) => (
        <Tooltip title={v ?? ""}>
          <span>{v || "—"}</span>
        </Tooltip>
      ),
    },
    tags: {
      title: "Tags",
      dataIndex: "tags",
      key: "tags",
      width: 120,
      ...search("Tags", "tags"),
      ellipsis: { showTitle: false },
      render: (v: string | null) => (
        <Tooltip title={v ?? ""}>
          <span>{v || "—"}</span>
        </Tooltip>
      ),
    },
    codigo_postal: {
      title: "C.P.",
      dataIndex: "codigo_postal",
      key: "codigo_postal",
      width: 80,
      sorter: true,
      ...search("Código postal", "codigo_postal"),
    },
    id_orden_tienda: {
      title: "ID ord. tienda",
      dataIndex: "id_orden_tienda",
      key: "id_orden_tienda",
      width: 120,
      ...search("ID orden tienda", "id_orden_tienda"),
      ellipsis: true,
    },
    numero_pedido_tienda: {
      title: "Nº ped. tienda",
      dataIndex: "numero_pedido_tienda",
      key: "numero_pedido_tienda",
      width: 120,
      ...search("Nº pedido tienda", "numero_pedido_tienda"),
      ellipsis: true,
    },
    usuario_generacion_guia: {
      title: "Usuario guía",
      dataIndex: "usuario_generacion_guia",
      key: "usuario_generacion_guia",
      width: 120,
      ...search("Usuario gen. guía", "usuario_generacion_guia"),
      ellipsis: true,
    },
    fecha_generacion_guia: {
      title: "Fecha gen. guía",
      dataIndex: "fecha_generacion_guia",
      key: "fecha_generacion_guia",
      width: 110,
      sorter: true,
      render: (v: string | null) => fmtCalendarDateDdMmYyyy(v ?? undefined, "—"),
    },
    created_at: {
      title: "Creado",
      dataIndex: "created_at",
      key: "created_at",
      width: 110,
      sorter: true,
      render: (v: string | null) => fmtCalendarDateDdMmYyyy(v ?? undefined, "-"),
    },
    updated_at: {
      title: "Actualizado",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 110,
      sorter: true,
      render: (v: string | null) => fmtCalendarDateDdMmYyyy(v ?? undefined, "-"),
    },
    acciones: {
      title: "Acciones",
      key: "acciones",
      width: 100,
      render: (_, record) => {
        if (!ctx.canEditPedidos) return null;
        if (ctx.editingId === record.id) {
          return (
            <Space size="small">
              <Button size="small" type="primary" icon={<SaveOutlined />} onClick={ctx.onSave} />
              <Button size="small" icon={<CloseOutlined />} onClick={ctx.onCancel} />
            </Space>
          );
        }
        return <Button size="small" icon={<EditOutlined />} onClick={() => ctx.onEdit(record)} />;
      },
    },
  };
}
