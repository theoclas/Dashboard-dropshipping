import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Spin,
  Table,
  Typography,
  message,
  theme,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { InboxOutlined, DeleteOutlined, MergeCellsOutlined, PlusOutlined, SettingOutlined } from "@ant-design/icons";
import { isAxiosError } from "axios";
import { Link } from "react-router-dom";
import {
  deleteCatalogProduct,
  deleteCatalogProductDropiLink,
  fetchCatalogProducts,
  fetchOrderProductLines,
  mergeCatalogProducts,
  postCatalogProduct,
  upsertCatalogProductDropiLink,
  upsertCatalogProductDropiLinksBulk,
  type OrderProductGroup,
  type OrderProductLine,
} from "../api";
import { usePermission } from "../hooks/usePermission";
import { ProductMetaMappingPanel } from "../components/ProductMetaMappingPanel";
import type { CatalogProduct } from "../types";

const { Title, Text } = Typography;

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function isGroupRow(r: OrderProductLine | OrderProductGroup): r is OrderProductGroup {
  return "line_count" in r;
}

export function ProductosPedidosPage() {
  const { token } = theme.useToken();
  const canPedidos = usePermission("modulePedidos");
  const canCatalog = usePermission("moduleCatalogoProductos");
  const canCatalogCrud = usePermission("actionCatalogoProductosCrud");

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [groupedView, setGroupedView] = useState(true);
  const [rows, setRows] = useState<(OrderProductLine | OrderProductGroup)[]>([]);
  const [loading, setLoading] = useState(true);

  const [linkRow, setLinkRow] = useState<OrderProductLine | null>(null);
  /** Si no es null, el modal se abrió desde vista agrupada y hay que elegir variante. */
  const [linkGroupLines, setLinkGroupLines] = useState<OrderProductLine[] | null>(null);
  const [linkGroupLoading, setLinkGroupLoading] = useState(false);
  const [catalogPick, setCatalogPick] = useState<string | undefined>();
  const [catalogList, setCatalogList] = useState<CatalogProduct[]>([]);
  const [linkSaving, setLinkSaving] = useState(false);
  /** En vista agrupada con varias huellas: por defecto vincular todas a la vez. */
  const [linkScope, setLinkScope] = useState<"all" | "one">("all");
  const [createForm] = Form.useForm<{ name: string; sku?: string; notes?: string }>();
  const [catalogCreateOpen, setCatalogCreateOpen] = useState(false);
  const [metaConfigProduct, setMetaConfigProduct] = useState<CatalogProduct | null>(null);
  const [mergeSource, setMergeSource] = useState<CatalogProduct | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | undefined>();
  const [mergeLoading, setMergeLoading] = useState(false);

  const canMetaConfig =
    usePermission("moduleCampanasMeta") || usePermission("moduleCuentasPublicitarias");

  const loadCatalog = useCallback(async () => {
    if (!canCatalog && !canMetaConfig && !canCatalogCrud) return;
    try {
      const list = await fetchCatalogProducts();
      setCatalogList(list.filter((p) => p.isActive));
    } catch {
      message.error("No se pudo cargar el catálogo.");
      setCatalogList([]);
    }
  }, [canCatalog, canMetaConfig, canCatalogCrud]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    if (!canPedidos) return;
    setLoading(true);
    try {
      const res = await fetchOrderProductLines({
        page,
        limit,
        q: debouncedQ || undefined,
        grouped: groupedView,
      });
      setRows(res.items as (OrderProductLine | OrderProductGroup)[]);
      setTotal(res.total);
    } catch {
      message.error("No se pudieron cargar los productos de pedidos.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedQ, groupedView, canPedidos]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, groupedView]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!linkRow || !canCatalog) return;
    setCatalogPick(undefined);
    void loadCatalog();
  }, [linkRow, canCatalog, loadCatalog]);

  const handleDeleteCatalogProduct = useCallback(
    async (p: CatalogProduct) => {
      try {
        await deleteCatalogProduct(p.id);
        message.success(`«${p.name}» eliminado del catálogo.`);
        if (metaConfigProduct?.id === p.id) setMetaConfigProduct(null);
        void loadCatalog();
      } catch {
        message.error("No se pudo eliminar el producto.");
      }
    },
    [loadCatalog, metaConfigProduct?.id],
  );

  const handleMergeCatalog = useCallback(async () => {
    if (!mergeSource || !mergeTargetId) return;
    setMergeLoading(true);
    try {
      const res = await mergeCatalogProducts({ targetId: mergeTargetId, sourceIds: [mergeSource.id] });
      message.success(
        res.skipped_dropi_links > 0
          ? `Unido en «${res.product.name}». ${res.skipped_dropi_links} variante(s) ya existían en el destino.`
          : `Unido en «${res.product.name}».`,
      );
      setMergeSource(null);
      setMergeTargetId(undefined);
      void loadCatalog();
    } catch (e) {
      const msg =
        isAxiosError(e) && typeof e.response?.data === "object" && e.response?.data && "message" in e.response.data
          ? String((e.response.data as { message?: string }).message)
          : "No se pudo unir el producto.";
      message.error(msg);
    } finally {
      setMergeLoading(false);
    }
  }, [mergeSource, mergeTargetId, loadCatalog]);

  const catalogTableColumns = useMemo(() => {
    const cols: ColumnsType<CatalogProduct> = [
      { title: "Producto", dataIndex: "name", key: "name" },
      { title: "SKU", dataIndex: "sku", key: "sku", render: (v) => v ?? "—" },
    ];
    if (canMetaConfig || canCatalogCrud) {
      cols.push({
        title: "",
        key: "actions",
        width: canCatalogCrud ? 320 : 160,
        render: (_, p) => (
          <Space wrap size="small">
            {canMetaConfig ? (
              <Button size="small" icon={<SettingOutlined />} onClick={() => setMetaConfigProduct(p)}>
                Configurar Meta
              </Button>
            ) : null}
            {canCatalogCrud ? (
              <>
                <Button
                  size="small"
                  icon={<MergeCellsOutlined />}
                  onClick={() => {
                    setMergeSource(p);
                    setMergeTargetId(undefined);
                  }}
                >
                  Juntar
                </Button>
                <Popconfirm
                  title={`¿Eliminar «${p.name}»?`}
                  description="Se quitan vínculos Dropi, Meta y CPA de este producto. No borra pedidos Dropi."
                  okText="Eliminar"
                  cancelText="Cancelar"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void handleDeleteCatalogProduct(p)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Eliminar
                  </Button>
                </Popconfirm>
              </>
            ) : null}
          </Space>
        ),
      });
    }
    return cols;
  }, [canMetaConfig, canCatalogCrud, handleDeleteCatalogProduct]);

  const handleUnlink = useCallback(
    async (r: OrderProductLine) => {
      if (!r.catalog_product_id || !r.catalog_dropi_link_id) return;
      try {
        await deleteCatalogProductDropiLink(r.catalog_product_id, r.catalog_dropi_link_id);
        message.success("Vínculo quitado.");
        void load();
      } catch {
        message.error("No se pudo quitar el vínculo.");
      }
    },
    [load],
  );

  const closeLinkModal = () => {
    setLinkRow(null);
    setLinkGroupLines(null);
    setLinkGroupLoading(false);
    setCatalogPick(undefined);
    setLinkScope("all");
  };

  const openLinkGroup = useCallback(async (productoId: string) => {
    setLinkGroupLoading(true);
    setLinkRow(null);
    setLinkGroupLines(null);
    try {
      const res = await fetchOrderProductLines({
        grouped: false,
        productoId,
        limit: 500,
        page: 1,
      });
      const lines = res.items as OrderProductLine[];
      if (lines.length === 0) {
        message.info("No hay líneas importadas para este id de producto.");
        return;
      }
      setLinkGroupLines(lines);
      const firstByKey = new Map<string, OrderProductLine>();
      for (const ln of lines) {
        if (!firstByKey.has(ln.variant_key)) firstByKey.set(ln.variant_key, ln);
      }
      setLinkRow(firstByKey.values().next().value ?? lines[0]!);
      setLinkScope("all");
    } catch {
      message.error("No se pudieron cargar las variantes.");
    } finally {
      setLinkGroupLoading(false);
    }
  }, []);

  const linkVariantOptions = useMemo(() => {
    if (!linkGroupLines?.length) return [] as { value: string; label: string; line: OrderProductLine }[];
    const m = new Map<string, { line: OrderProductLine; n: number }>();
    for (const ln of linkGroupLines) {
      const cur = m.get(ln.variant_key);
      if (!cur) m.set(ln.variant_key, { line: ln, n: 1 });
      else cur.n += 1;
    }
    return [...m.entries()].map(([value, { line, n }]) => ({
      value,
      line,
      label: `${line.sku ?? "—"} · ${line.variacion ?? "—"}${n > 1 ? ` (${n} líneas)` : ""}`,
    }));
  }, [linkGroupLines]);

  const submitLink = async () => {
    if (!linkRow || !catalogPick) {
      message.warning("Elige un producto del catálogo.");
      return;
    }
    const shouldBulk =
      linkScope === "all" && linkGroupLines != null && linkVariantOptions.length > 0;

    setLinkSaving(true);
    try {
      if (shouldBulk) {
        const variants = linkVariantOptions.map((o) => ({
          productoId: o.line.producto_id,
          sku: o.line.sku,
          variacionId: o.line.variacion_id,
          variacion: o.line.variacion,
          productoNombre: o.line.producto_nombre,
        }));
        const res = await upsertCatalogProductDropiLinksBulk(catalogPick, variants);
        if (res.applied === 0 && res.skipped_conflict > 0) {
          message.error("Ninguna variante se pudo vincular: todas están asignadas a otro producto del catálogo.");
        } else {
          if (res.applied > 0) {
            message.success(`Vinculadas ${res.applied} variante(s) al catálogo.`);
          }
          if (res.skipped_conflict > 0) {
            message.warning(
              `Omitidas ${res.skipped_conflict} variante(s): ya estaban asignadas a otro producto del catálogo.`,
            );
          }
        }
      } else {
        await upsertCatalogProductDropiLink(catalogPick, {
          productoId: linkRow.producto_id,
          sku: linkRow.sku,
          variacionId: linkRow.variacion_id,
          variacion: linkRow.variacion,
          productoNombre: linkRow.producto_nombre,
        });
        message.success("Variante vinculada al catálogo.");
      }
      closeLinkModal();
      void load();
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 409) {
        message.error("Esa variante Dropi ya está asignada a otro producto del catálogo.");
      } else {
        message.error("No se pudo vincular.");
      }
    } finally {
      setLinkSaving(false);
    }
  };

  const columns = useMemo((): ColumnsType<OrderProductLine | OrderProductGroup> => {
    if (groupedView) {
      const base: ColumnsType<OrderProductGroup> = [
        {
          title: "Pedidos",
          dataIndex: "pedidos_distinct",
          key: "pedidos_distinct",
          width: 88,
          align: "right",
          render: (v: number) => v.toLocaleString(),
        },
        {
          title: "Líneas",
          dataIndex: "line_count",
          key: "line_count",
          width: 80,
          align: "right",
          render: (v: number) => v.toLocaleString(),
        },
        {
          title: "ID producto Dropi",
          dataIndex: "producto_id",
          key: "producto_id",
          width: 120,
          ellipsis: true,
        },
        {
          title: "Producto",
          dataIndex: "producto_nombre",
          key: "producto_nombre",
          ellipsis: true,
          width: 220,
        },
        {
          title: "SKU / Variación",
          dataIndex: "sku_variacion_resumen",
          key: "sku_variacion_resumen",
          ellipsis: true,
          width: 260,
          render: (v: string) => v || "—",
        },
        {
          title: "Variantes",
          dataIndex: "variant_count",
          key: "variant_count",
          width: 92,
          align: "right",
        },
        {
          title: "Cant.",
          dataIndex: "cantidad",
          key: "cantidad",
          width: 80,
          align: "right",
          render: (v: number) => v.toLocaleString(),
        },
        {
          title: "P. proveedor",
          key: "precio_proveedor",
          width: 130,
          align: "right",
          render: (_, r) => {
            if (
              r.precio_proveedor_min != null &&
              r.precio_proveedor_max != null &&
              r.precio_proveedor_min !== r.precio_proveedor_max
            ) {
              return `$${fmtMoney(r.precio_proveedor_min)} – $${fmtMoney(r.precio_proveedor_max)}`;
            }
            const v = r.precio_proveedor_min ?? r.precio_proveedor_max;
            return v != null ? `$${fmtMoney(v)}` : "—";
          },
        },
        {
          title: "P. prov. × cant.",
          dataIndex: "precio_proveedor_x_cantidad",
          key: "precio_proveedor_x_cantidad",
          width: 130,
          align: "right",
          render: (v: number | null) => (v != null ? `$${fmtMoney(v)}` : "—"),
        },
      ];
      if (canCatalog) {
        base.push({
          title: "Producto catálogo",
          key: "catalog",
          width: 200,
          ellipsis: true,
          render: (_, r) => {
            if (r.catalog_link_status === "full" && r.catalog_product_name) {
              return <Text>{r.catalog_product_name}</Text>;
            }
            if (r.catalog_link_status === "partial") {
              return (
                <Text type="secondary">
                  Parcial ({r.linked_variant_count}/{r.variant_count})
                </Text>
              );
            }
            return <Text type="secondary">Sin vincular</Text>;
          },
        });
      }
      if (canCatalog && canCatalogCrud) {
        base.push({
          title: "",
          key: "acciones",
          width: 200,
          fixed: "right",
          render: (_, r) => (
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => void openLinkGroup(r.producto_id)}>
              Vincular variantes
            </Button>
          ),
        });
      }
      return base as ColumnsType<OrderProductLine | OrderProductGroup>;
    }

    const base: ColumnsType<OrderProductLine> = [
      {
        title: "ID pedido (Dropi)",
        dataIndex: "pedido_id_dropi",
        key: "pedido_id_dropi",
        width: 130,
        render: (v: string) => (
          <Link to="/app/pedidos" title="Abrir pedidos y buscar por ID Dropi">
            {v}
          </Link>
        ),
      },
      {
        title: "ID producto Dropi",
        dataIndex: "producto_id",
        key: "producto_id",
        width: 120,
        ellipsis: true,
        render: (v: string | null) => v ?? "—",
      },
      { title: "Producto", dataIndex: "producto_nombre", key: "producto_nombre", ellipsis: true, width: 240 },
      { title: "SKU", dataIndex: "sku", key: "sku", width: 110, ellipsis: true },
      { title: "Variación", dataIndex: "variacion", key: "variacion", width: 140, ellipsis: true },
      {
        title: "Cant.",
        dataIndex: "cantidad",
        key: "cantidad",
        width: 72,
        align: "right",
        render: (v: number | null) => (v != null ? v : "—"),
      },
      {
        title: "P. proveedor",
        dataIndex: "precio_proveedor",
        key: "precio_proveedor",
        width: 110,
        align: "right",
        render: (v: number | null) => (v != null ? `$${fmtMoney(v)}` : "—"),
      },
      {
        title: "P. prov. × cant.",
        dataIndex: "precio_proveedor_x_cantidad",
        key: "precio_proveedor_x_cantidad",
        width: 120,
        align: "right",
        render: (v: number | null) => (v != null ? `$${fmtMoney(v)}` : "—"),
      },
    ];
    if (canCatalog) {
      base.push({
        title: "Producto catálogo",
        key: "catalog",
        width: 220,
        ellipsis: true,
        render: (_, r) =>
          r.catalog_product_name ? (
            <Text>{r.catalog_product_name}</Text>
          ) : (
            <Text type="secondary">Sin vincular</Text>
          ),
      });
    }
    if (canCatalog && canCatalogCrud) {
      base.push({
        title: "",
        key: "acciones",
        width: 200,
        fixed: "right",
        render: (_, r) => (
          <Space size="small" wrap>
            <Button
              type="link"
              size="small"
              style={{ padding: 0 }}
              onClick={() => {
                setLinkGroupLines(null);
                setLinkScope("all");
                setLinkRow(r);
              }}
            >
              {r.catalog_product_id ? "Cambiar vínculo" : "Vincular al catálogo"}
            </Button>
            {r.catalog_dropi_link_id && r.catalog_product_id ? (
              <Popconfirm title="¿Quitar vínculo con el catálogo?" onConfirm={() => void handleUnlink(r)}>
                <Button type="link" size="small" danger style={{ padding: 0 }}>
                  Quitar
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ),
      });
    }
    return base as ColumnsType<OrderProductLine | OrderProductGroup>;
  }, [groupedView, canCatalog, canCatalogCrud, handleUnlink, openLinkGroup]);

  if (!canPedidos) {
    return <Text type="secondary">No tienes permiso para el módulo de pedidos (incluye productos por pedido).</Text>;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Space align="center" size={12}>
        <InboxOutlined style={{ fontSize: 22, color: token.colorTextSecondary }} />
        <Title level={3} style={{ margin: 0 }}>
          Productos de pedidos
        </Title>
      </Space>
      <Text type="secondary" style={{ display: "block", maxWidth: 900 }}>
        Líneas del import Dropi (<code>productos_detalle</code>), las mismas que al expandir un pedido en{" "}
        <Link to="/app/pedidos">Pedidos</Link>. En <strong>Campañas Meta</strong> eliges un producto del{" "}
        <em>catálogo administrativo</em>; aquí enlazas las huellas Dropi (id de producto + SKU + variación) a ese
        producto. Desde la vista agrupada puedes vincular <strong>todas las variantes</strong> del mismo id de producto
        de una vez. Por defecto se
        agrupa por <strong>id de producto Dropi</strong> para ver menos filas; al vincular puedes asignar{" "}
        <strong>todas las variantes</strong> de ese producto al mismo ítem del catálogo en un solo paso. Cambia a
        «Todas las líneas» para el detalle pedido a pedido. La vista agrupada no incluye filas sin id de producto
        (siguen en «Todas las líneas»).
      </Text>
      {!canCatalog ? (
        <Text type="warning">
          Sin permiso de catálogo no verás la columna de vínculo. Pide acceso a «Catálogo de productos» o que un admin
          vincule las variantes.
        </Text>
      ) : null}
      {(canCatalog && canCatalogCrud) || canMetaConfig ? (
        <Card size="small" title="Catálogo administrativo">
          {canCatalog && canCatalogCrud ? (
            !catalogCreateOpen ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCatalogCreateOpen(true)}>
                Crear producto del catálogo
              </Button>
            ) : (
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => {
                setCatalogCreateOpen(false);
                createForm.resetFields();
              }}>
                Cerrar formulario
              </Button>
              <Text type="secondary" style={{ display: "block", maxWidth: 640 }}>
                Estos productos son el catálogo administrativo de la empresa (Campañas Meta, vínculos Dropi). El SKU es
                opcional y es solo referencia interna.
              </Text>
              <Form
                form={createForm}
                layout="vertical"
                style={{ maxWidth: 480 }}
                onFinish={async (vals) => {
                  try {
                    await postCatalogProduct({
                      name: vals.name.trim(),
                      sku: vals.sku?.trim() || undefined,
                      notes: vals.notes?.trim() || undefined,
                    });
                    message.success("Producto creado.");
                    createForm.resetFields();
                    setCatalogCreateOpen(false);
                    void loadCatalog();
                  } catch {
                    message.error("No se pudo crear el producto.");
                  }
                }}
              >
                <Form.Item name="name" label="Nombre" rules={[{ required: true, message: "Indica el nombre." }]}>
                  <Input placeholder='Ej. "Shampoo en barra"' />
                </Form.Item>
                <Form.Item name="sku" label="SKU interno (opcional)">
                  <Input placeholder="Referencia o SKU propio" allowClear />
                </Form.Item>
                <Form.Item name="notes" label="Notas (opcional)">
                  <Input.TextArea rows={2} placeholder="Observaciones" allowClear />
                </Form.Item>
                <Space wrap>
                  <Button type="primary" htmlType="submit">
                    Crear producto
                  </Button>
                  <Button
                    onClick={() => {
                      setCatalogCreateOpen(false);
                      createForm.resetFields();
                    }}
                  >
                    Cancelar
                  </Button>
                </Space>
              </Form>
            </Space>
          )
          ) : null}
          {catalogList.length > 0 && (canMetaConfig || canCatalogCrud) ? (
            <Table
              style={{ marginTop: 16 }}
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={catalogList}
              columns={catalogTableColumns}
            />
          ) : null}
        </Card>
      ) : null}
      <Space wrap align="center" size="middle">
        <Radio.Group
          optionType="button"
          value={groupedView ? "g" : "l"}
          onChange={(e) => setGroupedView(e.target.value === "g")}
        >
          <Radio.Button value="g">Por id de producto</Radio.Button>
          <Radio.Button value="l">Todas las líneas</Radio.Button>
        </Radio.Group>
        <Input.Search
          allowClear
          placeholder="ID pedido o producto, nombre, SKU, variación…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 420 }}
        />
      </Space>
      <Table<OrderProductLine | OrderProductGroup>
        rowKey={(r) => (groupedView && isGroupRow(r) ? `g-${r.producto_id}` : (r as OrderProductLine).id)}
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: groupedView ? (canCatalog ? 1320 : 1100) : canCatalog ? 1280 : 900 }}
        pagination={{
          current: page,
          pageSize: limit,
          total,
          showSizeChanger: true,
          pageSizeOptions: ["25", "50", "100", "200"],
          showTotal: (t) =>
            groupedView ? `${t.toLocaleString()} productos (agrupados)` : `${t.toLocaleString()} líneas`,
          onChange: (p, ps) => {
            setPage(p);
            setLimit(ps ?? 50);
          },
        }}
      />

      <Modal
        title={
          linkVariantOptions.length > 1
            ? "Vincular producto Dropi al catálogo"
            : "Vincular variante Dropi al catálogo"
        }
        open={Boolean(linkRow || linkGroupLoading)}
        onCancel={closeLinkModal}
        okText={linkScope === "all" && linkGroupLines != null && linkVariantOptions.length > 0 ? "Guardar todas" : "Guardar vínculo"}
        confirmLoading={linkSaving}
        okButtonProps={{ disabled: linkGroupLoading || !linkRow }}
        onOk={() => void submitLink()}
        destroyOnClose
      >
        {linkGroupLoading ? (
          <div style={{ textAlign: "center", padding: 32 }}>
            <Spin />
          </div>
        ) : linkRow ? (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            {linkVariantOptions.length > 1 ? (
              <div>
                <Text strong>Alcance</Text>
                <Radio.Group
                  style={{ display: "block", marginTop: 8 }}
                  value={linkScope}
                  onChange={(e) => setLinkScope(e.target.value)}
                >
                  <Space direction="vertical">
                    <Radio value="all">
                      Todas las variantes distintas ({linkVariantOptions.length}) → un solo producto del catálogo
                    </Radio>
                    <Radio value="one">Solo la variante que elijas abajo</Radio>
                  </Space>
                </Radio.Group>
              </div>
            ) : null}
            {linkScope === "one" && linkVariantOptions.length > 0 ? (
              <div>
                <Text strong>Variante Dropi</Text>
                <Select
                  style={{ width: "100%", marginTop: 8 }}
                  value={linkRow.variant_key}
                  options={linkVariantOptions.map((o) => ({ value: o.value, label: o.label }))}
                  onChange={(vk) => {
                    const opt = linkVariantOptions.find((o) => o.value === vk);
                    if (opt) setLinkRow(opt.line);
                  }}
                />
              </div>
            ) : null}
            <div>
              <Text type="secondary">
                {linkScope === "all" && linkVariantOptions.length > 1
                  ? "Se crearán o actualizarán las huellas internas (hash) de cada SKU + variación de este id de producto Dropi. "
                  : "Se usará la huella interna (hash) de: "}
              </Text>
              {linkScope === "one" || linkVariantOptions.length <= 1 ? (
                <Text code>
                  producto_id={linkRow.producto_id ?? "—"} · sku={linkRow.sku ?? "—"} · variación=
                  {linkRow.variacion ?? "—"}
                </Text>
              ) : (
                <Text code>producto_id={linkRow.producto_id ?? "—"}</Text>
              )}
            </div>
            <div>
              <Text strong>Producto del catálogo</Text>
              <Select
                showSearch
                optionFilterProp="label"
                style={{ width: "100%", marginTop: 8 }}
                placeholder="Ej. SHAMPOO EN BARRA…"
                value={catalogPick}
                onChange={setCatalogPick}
                options={catalogList.map((p) => ({
                  value: p.id,
                  label: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
                }))}
              />
            </div>
          </Space>
        ) : null}
      </Modal>

      <Drawer
        title={metaConfigProduct ? `Meta — ${metaConfigProduct.name}` : "Configuración Meta"}
        open={metaConfigProduct != null}
        onClose={() => setMetaConfigProduct(null)}
        width={720}
        destroyOnClose
      >
        {metaConfigProduct ? <ProductMetaMappingPanel catalogProduct={metaConfigProduct} /> : null}
      </Drawer>

      <Modal
        title="Juntar producto del catálogo"
        open={mergeSource != null}
        onCancel={() => {
          setMergeSource(null);
          setMergeTargetId(undefined);
        }}
        onOk={() => void handleMergeCatalog()}
        okText="Juntar"
        confirmLoading={mergeLoading}
        okButtonProps={{ disabled: !mergeTargetId }}
        destroyOnClose
      >
        {mergeSource ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Text>
              Mover vínculos Dropi, campañas Meta, cuentas y CPA de{" "}
              <Text strong>«{mergeSource.name}»</Text> hacia otro producto. El duplicado se elimina al finalizar.
            </Text>
            <div>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                Producto que se conserva
              </Text>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Elige el producto destino"
                style={{ width: "100%" }}
                value={mergeTargetId}
                onChange={setMergeTargetId}
                options={catalogList
                  .filter((p) => p.id !== mergeSource.id)
                  .map((p) => ({
                    value: p.id,
                    label: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
                  }))}
              />
            </div>
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}
