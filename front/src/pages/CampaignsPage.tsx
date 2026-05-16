import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Typography,
  Upload,
  message,
  theme,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ClearOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { isAxiosError } from "axios";
import { Link } from "react-router-dom";
import { fmtApiDateIsoYmd } from "../utils/calendarDateLocal";
import {
  deleteAdvertisingCampaign,
  deleteAdvertisingMetric,
  fetchAdvertisingCampaigns,
  fetchAdvertisingMetrics,
  fetchCatalogProducts,
  fetchMetaCampaignAdvertisingAccounts,
  importAdvertisingCampaignMetrics,
  patchAdvertisingCampaign,
  patchAdvertisingMetric,
  postMetaCampaignAdvertisingAccount,
  previewAdvertisingCampaignImport,
} from "../api";
import { usePermission } from "../hooks/usePermission";
import type {
  AdvertisingAccount,
  AdvertisingCampaignMetricRow,
  AdvertisingCampaignRow,
  CatalogProduct,
  ImportAdvertisingPreviewResponse,
} from "../types";

const { Title, Text } = Typography;

function formatMetricSnapshotValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function metricSnapshotEntries(snapshot: unknown): { key: string; value: string }[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  return Object.entries(snapshot as Record<string, unknown>)
    .map(([k, v]) => ({
      key: k,
      value: formatMetricSnapshotValue(v),
    }))
    .sort((a, b) => a.key.localeCompare(b.key, "es"));
}

function buildShopifySessionsMapFromInputs(input: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(input)) {
    const t = String(raw).trim();
    if (t === "") continue;
    const n = Math.round(Number(t));
    if (!Number.isNaN(n)) out[k] = n;
  }
  return out;
}

/** Misma normalización que el backend para mapas Shopify por ID de campaña. */
function normalizeMetaCampaignKey(id: string): string {
  return String(id).trim().replace(/\s+/g, "");
}

export function CampaignsPage() {
  const { token } = theme.useToken();
  const canModule = usePermission("moduleCampanasMeta");
  const canCrud = usePermission("actionCampanasMetaCrud");
  const canImport = usePermission("actionImportarAdvertisingCampaigns");
  const canEditMetrics = usePermission("actionEditarMetricasAdvertising");
  const canCuentasCrud = usePermission("actionCuentasPublicitariasCrud");
  const canCampCrud = usePermission("actionCampanasMetaCrud");
  const canAccounts = canCuentasCrud || canCampCrud;

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [accounts, setAccounts] = useState<AdvertisingAccount[]>([]);
  const [productId, setProductId] = useState<string | undefined>();
  const [campaigns, setCampaigns] = useState<AdvertisingCampaignRow[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<AdvertisingCampaignRow | null>(null);
  const [metrics, setMetrics] = useState<AdvertisingCampaignMetricRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [useShopify, setUseShopify] = useState(false);
  const [importAccountId, setImportAccountId] = useState<string | undefined>();
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [importAccountCreateOpen, setImportAccountCreateOpen] = useState(false);
  const [importCreateMetaId, setImportCreateMetaId] = useState("");
  const [importCreateName, setImportCreateName] = useState("");
  const [importPreview, setImportPreview] = useState<ImportAdvertisingPreviewResponse | null>(null);
  const [importPreviewLoading, setImportPreviewLoading] = useState(false);
  const [importPreviewError, setImportPreviewError] = useState<string | null>(null);
  const [metricDetail, setMetricDetail] = useState<AdvertisingCampaignMetricRow | null>(null);
  const [metricEditingKey, setMetricEditingKey] = useState<string | null>(null);
  const [shopifyCampaignIds, setShopifyCampaignIds] = useState<string[]>([]);
  const [campaignDisplayNames, setCampaignDisplayNames] = useState<Record<string, string>>({});
  const [shopifySessionsInput, setShopifySessionsInput] = useState<Record<string, string>>({});
  const [importUploadKey, setImportUploadKey] = useState(0);
  /** IDs normalizados del archivo a importar para el producto (si hay varias campañas en el archivo). */
  const [importSelectedCampaignIds, setImportSelectedCampaignIds] = useState<string[]>([]);

  const [newAccountMetaId, setNewAccountMetaId] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [quickAccountOpen, setQuickAccountOpen] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      const list = await fetchCatalogProducts();
      setProducts(list.filter((p) => p.isActive));
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 403) {
        message.error("No tienes permiso para ver el catálogo.");
      } else {
        message.error("No se pudo cargar el catálogo.");
      }
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const list = await fetchMetaCampaignAdvertisingAccounts();
      setAccounts(list);
    } catch {
      setAccounts([]);
      setAccountsError("No se pudieron cargar las cuentas publicitarias. Pulsa Reintentar.");
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const loadCampaigns = useCallback(async (pid: string) => {
    setLoading(true);
    try {
      const list = await fetchAdvertisingCampaigns(pid);
      setCampaigns(list);
    } catch {
      message.error("No se pudieron cargar las campañas.");
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMetrics = useCallback(async (cid: string) => {
    try {
      const list = await fetchAdvertisingMetrics(cid);
      setMetrics(list);
    } catch {
      setMetrics([]);
    }
  }, []);

  useEffect(() => {
    if (canModule) void loadProducts();
  }, [canModule, loadProducts]);

  useEffect(() => {
    if (canModule) void loadAccounts();
  }, [canModule, loadAccounts]);

  useEffect(() => {
    if (productId) void loadCampaigns(productId);
    else {
      setCampaigns([]);
      setSelectedCampaign(null);
      setMetrics([]);
    }
  }, [productId, loadCampaigns]);

  useEffect(() => {
    if (selectedCampaign) void loadMetrics(selectedCampaign.id);
    else setMetrics([]);
  }, [selectedCampaign, loadMetrics]);

  useEffect(() => {
    setMetricEditingKey(null);
  }, [selectedCampaign]);

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ value: a.id, label: `${a.metaAccountId}${a.businessName ? ` — ${a.businessName}` : ""}` })),
    [accounts],
  );

  const mergeShopifyPreview = useCallback((res: ImportAdvertisingPreviewResponse) => {
    const ids = res.uniqueCampaignIds ?? [];
    const names = res.campaignDisplayNames ?? {};
    setShopifyCampaignIds(ids);
    setCampaignDisplayNames(names);
    setShopifySessionsInput((prev) => {
      const next: Record<string, string> = {};
      for (const id of ids) {
        next[id] = prev[id] ?? "";
      }
      return next;
    });
    setImportSelectedCampaignIds([...ids]);
  }, []);

  const fetchImportPreview = useCallback(async (): Promise<boolean> => {
    if (!productId || !importFile) return false;
    setImportPreviewLoading(true);
    setImportPreviewError(null);
    try {
      const res = await previewAdvertisingCampaignImport(productId, importFile);
      setImportPreview(res);
      mergeShopifyPreview(res);
      return true;
    } catch {
      setImportPreview(null);
      setImportPreviewError("No se pudo leer el archivo. Comprueba el formato (CSV con coma o ;, o Excel), la primera hoja y tus permisos.");
      return false;
    } finally {
      setImportPreviewLoading(false);
    }
  }, [productId, importFile, mergeShopifyPreview]);

  useEffect(() => {
    if (!importFile) {
      setImportPreview(null);
      setImportPreviewError(null);
      setImportPreviewLoading(false);
      setShopifyCampaignIds([]);
      setCampaignDisplayNames({});
      setShopifySessionsInput({});
      setImportSelectedCampaignIds([]);
      return;
    }
    if (!productId) {
      setImportPreview(null);
      setImportPreviewError(null);
      setImportPreviewLoading(false);
      return;
    }
    void fetchImportPreview();
  }, [importFile, productId, fetchImportPreview]);

  const importPreviewColumns: ColumnsType<ImportAdvertisingPreviewResponse["sampleRows"][number]> = useMemo(
    () => [
      {
        title: "Fecha",
        dataIndex: "recordDate",
        key: "d",
        width: 118,
        render: (v: string) => fmtApiDateIsoYmd(v),
      },
      { title: "ID campaña Meta", dataIndex: "externalCampaignId", key: "ext", ellipsis: true },
      { title: "ID anuncio", dataIndex: "externalAdId", key: "ad", width: 120, ellipsis: true, render: (v) => v ?? "—" },
      {
        title: "Nombre",
        dataIndex: "displayName",
        key: "name",
        ellipsis: true,
        render: (v: string | undefined) => v ?? "—",
      },
      {
        title: "Clics",
        dataIndex: "metaLinkClicks",
        key: "cl",
        width: 80,
        render: (v: number | undefined) => (v != null ? String(v) : "—"),
      },
      {
        title: "Conv.",
        dataIndex: "metaConversationsStarted",
        key: "co",
        width: 80,
        render: (v: number | undefined) => (v != null ? String(v) : "—"),
      },
      {
        title: useShopify ? "Shopify (editable)" : "Shopify",
        dataIndex: "shopifySessions",
        key: "sh",
        width: 130,
        render: (_: unknown, row: ImportAdvertisingPreviewResponse["sampleRows"][number]) => {
          if (!useShopify) {
            const v = row.shopifySessions;
            return v != null ? String(v) : "—";
          }
          const ck = normalizeMetaCampaignKey(row.externalCampaignId);
          const fromExcel = row.shopifySessions;
          return (
            <Input
              type="number"
              min={0}
              placeholder={fromExcel != null ? String(fromExcel) : "—"}
              style={{ maxWidth: 118 }}
              value={shopifySessionsInput[ck] ?? ""}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const v = e.target.value;
                setShopifySessionsInput((prev) => ({ ...prev, [ck]: v }));
              }}
            />
          );
        },
      },
    ],
    [useShopify, shopifySessionsInput],
  );

  const shopifyCampaignIdsOutsideSample = useMemo(() => {
    if (!importPreview?.sampleRows?.length) return [];
    const inSample = new Set(
      importPreview.sampleRows.map((r) => normalizeMetaCampaignKey(String(r.externalCampaignId))),
    );
    return shopifyCampaignIds.filter((id) => !inSample.has(id));
  }, [importPreview, shopifyCampaignIds]);

  const shopifyOutsideSampleRows = useMemo(
    () =>
      shopifyCampaignIdsOutsideSample.map((id) => ({
        id,
        name: campaignDisplayNames[id] ?? "",
      })),
    [shopifyCampaignIdsOutsideSample, campaignDisplayNames],
  );

  const shopifyTableColumns: ColumnsType<{ id: string; name: string }> = useMemo(
    () => [
      { title: "ID campaña Meta", dataIndex: "id", key: "id", width: 200, ellipsis: true },
      { title: "Nombre (Excel)", dataIndex: "name", key: "name", ellipsis: true, render: (v: string) => v || "—" },
      {
        title: "Sesiones Shopify",
        key: "sess",
        width: 160,
        render: (_: unknown, row: { id: string }) => (
          <Input
            type="number"
            min={0}
            placeholder="—"
            style={{ maxWidth: 140 }}
            value={shopifySessionsInput[row.id] ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setShopifySessionsInput((prev) => ({ ...prev, [row.id]: v }));
            }}
          />
        ),
      },
    ],
    [shopifySessionsInput],
  );

  const displayedSampleRows = useMemo(() => {
    const raw = importPreview?.sampleRows ?? [];
    const uids = importPreview?.uniqueCampaignIds ?? [];
    if (uids.length <= 1) return raw;
    if (importSelectedCampaignIds.length === 0) return [];
    const sel = new Set(importSelectedCampaignIds.map((id) => normalizeMetaCampaignKey(id)));
    return raw.filter((r) => sel.has(normalizeMetaCampaignKey(String(r.externalCampaignId))));
  }, [importPreview, importSelectedCampaignIds]);

  const selectedAggregatedRowCount = useMemo(() => {
    if (!importPreview) return 0;
    const uids = importPreview.uniqueCampaignIds;
    if (uids.length <= 1) return importPreview.totalRows;
    const counts = importPreview.campaignAggregatedRowCounts ?? {};
    let n = 0;
    for (const id of importSelectedCampaignIds) {
      n += counts[id] ?? 0;
    }
    return n;
  }, [importPreview, importSelectedCampaignIds]);

  const importPreviewReady = useMemo(() => {
    if (!importFile || !productId) return true;
    if (importPreviewLoading || importPreviewError) return false;
    if (!importPreview) return false;
    if (importPreview.uniqueCampaignIds.length > 1 && importSelectedCampaignIds.length === 0) return false;
    return true;
  }, [
    importFile,
    productId,
    importPreviewLoading,
    importPreviewError,
    importPreview,
    importSelectedCampaignIds,
  ]);

  const handleRefreshImportPreview = async () => {
    if (!productId || !importFile) {
      message.warning("Selecciona producto y archivo (Excel o CSV).");
      return;
    }
    const ok = await fetchImportPreview();
    if (ok) message.success("Vista previa actualizada.");
  };

  const clearImportForm = useCallback((notify: boolean) => {
    setImportFile(null);
    setImportUploadKey((k) => k + 1);
    setImportPreview(null);
    setImportPreviewError(null);
    setImportPreviewLoading(false);
    setShopifyCampaignIds([]);
    setCampaignDisplayNames({});
    setShopifySessionsInput({});
    setUseShopify(false);
    setImportAccountId(undefined);
    setImportAccountCreateOpen(false);
    setImportCreateMetaId("");
    setImportCreateName("");
    setImportSelectedCampaignIds([]);
    if (notify) message.success("Formulario de import listo para un archivo nuevo.");
  }, []);

  const handleImport = async () => {
    if (!productId || !importFile) {
      message.warning("Selecciona producto y archivo.");
      return;
    }
    const previewIds = importPreview?.uniqueCampaignIds ?? [];
    if (previewIds.length > 1 && importSelectedCampaignIds.length === 0) {
      message.warning("Marca al menos una campaña del archivo para importar a este producto.");
      return;
    }
    let shopifyMap: Record<string, number> = {};
    if (useShopify) {
      shopifyMap = buildShopifySessionsMapFromInputs(shopifySessionsInput);
    }
    try {
      const res = await importAdvertisingCampaignMetrics(productId, importFile, {
        useShopifySessions: useShopify,
        shopifySessionsByCampaignId: shopifyMap,
        applyAdvertisingAccount: !!importAccountId,
        advertisingAccountId: importAccountId ?? null,
        ...(previewIds.length > 1
          ? { allowedCampaignIds: importSelectedCampaignIds.map((id) => normalizeMetaCampaignKey(id)) }
          : {}),
      });
      message.success(
        `Importación: ${res.imported} campañas nuevas, ${res.campaignsUpdated} actualizadas; métricas +${res.metricsCreated} / ~${res.metricsUpdated} actualizadas.`,
      );
      if (res.errors.length) Modal.warning({ title: "Avisos del import", content: res.errors.slice(0, 30).join("\n") });
      void loadCampaigns(productId);
      if (selectedCampaign) void loadMetrics(selectedCampaign.id);
      clearImportForm(false);
    } catch {
      message.error("Error al importar.");
    }
  };

  const handleCreateAccount = async () => {
    if (!newAccountMetaId.trim()) {
      message.warning("Indica el ID numérico de la cuenta Meta.");
      return;
    }
    try {
      const row = await postMetaCampaignAdvertisingAccount({
        metaAccountId: newAccountMetaId.trim(),
        businessName: newAccountName.trim() || undefined,
      });
      message.success("Cuenta creada.");
      setAccounts((prev) => [...prev, row]);
      setNewAccountMetaId("");
      setNewAccountName("");
      setQuickAccountOpen(false);
    } catch {
      message.error("No se pudo crear la cuenta (¿duplicada?).");
    }
  };

  const handleCreateAccountForImport = async () => {
    if (!importCreateMetaId.trim()) {
      message.warning("Indica el ID numérico de la cuenta Meta.");
      return;
    }
    try {
      const row = await postMetaCampaignAdvertisingAccount({
        metaAccountId: importCreateMetaId.trim(),
        businessName: importCreateName.trim() || undefined,
      });
      message.success("Cuenta creada y seleccionada para este import.");
      setImportAccountId(row.id);
      setImportCreateMetaId("");
      setImportCreateName("");
      setImportAccountCreateOpen(false);
      void loadAccounts();
    } catch {
      message.error("No se pudo crear la cuenta (¿duplicada o sin permiso?).");
    }
  };

  const campaignColumns: ColumnsType<AdvertisingCampaignRow> = [
    { title: "ID Meta", dataIndex: "externalCampaignId", key: "ext" },
    { title: "Nombre", dataIndex: "displayName", key: "name", render: (v) => v ?? "—" },
    {
      title: "Cuenta publicitaria",
      key: "acc",
      render: (_, row) =>
        canCrud ? (
          <Select
            allowClear
            placeholder="Sin cuenta"
            style={{ minWidth: 200 }}
            options={accountOptions}
            value={row.advertisingAccountId ?? undefined}
            onChange={async (v) => {
              try {
                await patchAdvertisingCampaign(row.id, { advertisingAccountId: v ?? null });
                message.success("Cuenta actualizada.");
                if (productId) void loadCampaigns(productId);
              } catch {
                message.error("No se pudo actualizar.");
              }
            }}
          />
        ) : (
          <Text type="secondary">{row.advertisingAccount?.metaAccountId ?? "—"}</Text>
        ),
    },
    ...(canCrud
      ? [
          {
            title: "",
            key: "del",
            width: 90,
            render: (_: unknown, row: AdvertisingCampaignRow) => (
              <Button
                danger
                size="small"
                onClick={async () => {
                  Modal.confirm({
                    title: "¿Eliminar campaña?",
                    content: "Se eliminarán también sus métricas.",
                    onOk: async () => {
                      await deleteAdvertisingCampaign(row.id);
                      message.success("Eliminada.");
                      if (productId) void loadCampaigns(productId);
                      if (selectedCampaign?.id === row.id) setSelectedCampaign(null);
                    },
                  });
                }}
              >
                Eliminar
              </Button>
            ),
          } as const,
        ]
      : []),
  ];

  const renderMetricNumberCell = (
    field: "metaLinkClicks" | "metaConversationsStarted" | "shopifySessions",
    short: "cl" | "co" | "sh",
    v: number | null | undefined,
    row: AdvertisingCampaignMetricRow,
  ) => {
    if (!canEditMetrics) {
      return <Text type="secondary">{v != null ? String(v) : "—"}</Text>;
    }
    const k = `${row.id}:${short}`;
    const display = v != null ? String(v) : "—";
    if (metricEditingKey !== k) {
      return (
        <Button
          type="default"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setMetricEditingKey(k);
          }}
          style={{
            minWidth: 72,
            maxWidth: 120,
            textAlign: "left",
            fontWeight: "normal",
            borderColor: token.colorBorder,
          }}
        >
          {display}
        </Button>
      );
    }
    return (
      <Input
        key={`${row.id}-${short}-edit-${String(row[field])}-${row.updatedAt ?? ""}`}
        autoFocus
        type="number"
        style={{ maxWidth: 120 }}
        defaultValue={v ?? ""}
        onClick={(e) => e.stopPropagation()}
        onBlur={async (e) => {
          const raw = e.target.value;
          const val = raw === "" ? null : Math.round(Number(raw));
          if (raw !== "" && Number.isNaN(val as number)) return;
          const prev = row[field];
          const prevNum = prev != null && !Number.isNaN(Number(prev)) ? Math.round(Number(prev)) : null;
          if (val === prevNum) {
            setMetricEditingKey(null);
            return;
          }
          const patchBody =
            field === "metaLinkClicks"
              ? { metaLinkClicks: val }
              : field === "metaConversationsStarted"
                ? { metaConversationsStarted: val }
                : { shopifySessions: val };
          try {
            await patchAdvertisingMetric(row.id, patchBody);
            message.success("Guardado.");
            if (selectedCampaign) void loadMetrics(selectedCampaign.id);
          } catch {
            message.error("No se pudo guardar.");
          } finally {
            setMetricEditingKey(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setMetricEditingKey(null);
        }}
      />
    );
  };

  const metricColumns: ColumnsType<AdvertisingCampaignMetricRow> = [
    {
      title: "Fecha",
      dataIndex: "recordDate",
      key: "d",
      render: (v: string) => fmtApiDateIsoYmd(v),
    },
    {
      title: "Clics",
      dataIndex: "metaLinkClicks",
      key: "cl",
      render: (v, row) => renderMetricNumberCell("metaLinkClicks", "cl", v as number | null | undefined, row),
    },
    {
      title: "Conversaciones",
      dataIndex: "metaConversationsStarted",
      key: "co",
      render: (v, row) => renderMetricNumberCell("metaConversationsStarted", "co", v as number | null | undefined, row),
    },
    {
      title: "Sesiones Shopify",
      dataIndex: "shopifySessions",
      key: "sh",
      render: (v, row) => renderMetricNumberCell("shopifySessions", "sh", v as number | null | undefined, row),
    },
    ...(canEditMetrics
      ? [
          {
            title: "",
            key: "met-del",
            width: 110,
            align: "right" as const,
            render: (_: unknown, row: AdvertisingCampaignMetricRow) => (
              <span onClick={(e) => e.stopPropagation()}>
                <Popconfirm
                  title="¿Eliminar esta fila de métricas?"
                  description="Podrás volver a importarla desde el Excel para ese día."
                  okText="Eliminar"
                  cancelText="Cancelar"
                  okButtonProps={{ danger: true }}
                  onConfirm={async () => {
                    try {
                      await deleteAdvertisingMetric(row.id);
                      message.success("Métrica eliminada.");
                      setMetricDetail((d) => (d?.id === row.id ? null : d));
                      if (selectedCampaign) void loadMetrics(selectedCampaign.id);
                    } catch {
                      message.error("No se pudo eliminar.");
                    }
                  }}
                >
                  <Button danger size="small">
                    Eliminar
                  </Button>
                </Popconfirm>
              </span>
            ),
          } as const,
        ]
      : []),
  ];

  if (!canModule) {
    return <Typography.Paragraph>No tienes permiso para el módulo de campañas Meta.</Typography.Paragraph>;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Title level={3} style={{ margin: 0 }}>
        Campañas Meta
      </Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Producto del catálogo">
            <Text type="secondary" style={{ display: "block", marginBottom: 10, maxWidth: 640 }}>
              Producto del <strong>catálogo interno</strong> (no es la fila suelta del Excel de pedidos). Las variantes
              Dropi se asocian a este registro en{" "}
              <Link to="/app/productos">Productos de pedidos</Link> para reutilizar la misma huella en importaciones.
            </Text>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Selecciona un producto"
              style={{ width: "100%" }}
              options={products.map((p) => ({ value: p.id, label: `${p.name}${p.sku ? ` (${p.sku})` : ""}` }))}
              value={productId}
              onChange={setProductId}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Cuenta publicitaria (rápido)">
            {!canAccounts ? (
              <Text type="secondary">Sin permiso para crear cuentas aquí (necesitas permiso de cuentas o campañas).</Text>
            ) : !quickAccountOpen ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setQuickAccountOpen(true)}>
                Nueva cuenta Meta
              </Button>
            ) : (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0 }}
                  onClick={() => {
                    setQuickAccountOpen(false);
                    setNewAccountMetaId("");
                    setNewAccountName("");
                  }}
                >
                  Cerrar formulario
                </Button>
                <Text type="secondary" style={{ display: "block" }}>
                  Crea una cuenta Meta para vincularla al import o a cada campaña.
                </Text>
                <Input
                  placeholder="ID cuenta Meta (numérico)"
                  value={newAccountMetaId}
                  onChange={(e) => setNewAccountMetaId(e.target.value)}
                />
                <Input
                  placeholder="Nombre negocio (opcional)"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                />
                <Space wrap>
                  <Button type="primary" onClick={() => void handleCreateAccount()}>
                    Crear cuenta
                  </Button>
                  <Button
                    onClick={() => {
                      setQuickAccountOpen(false);
                      setNewAccountMetaId("");
                      setNewAccountName("");
                    }}
                  >
                    Cancelar
                  </Button>
                </Space>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Importar métricas (Excel / CSV Meta)">
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Space wrap align="start">
            <Upload
              key={importUploadKey}
              maxCount={1}
              accept=".csv,.xlsx,.xls,.xlsm"
              beforeUpload={(file) => {
                setImportFile(file);
                return false;
              }}
              onRemove={() => setImportFile(null)}
            >
              <Button icon={<UploadOutlined />}>Elegir archivo</Button>
            </Upload>
            <Checkbox checked={useShopify} onChange={(e) => setUseShopify(e.target.checked)} disabled={!canImport}>
              Aplicar sesiones Shopify manuales (editable en la vista previa)
            </Checkbox>
          </Space>

          {importFile && !productId ? (
            <Alert
              type="info"
              showIcon
              message="Selecciona el producto del catálogo (arriba) para ver la vista previa de lo que se importará."
            />
          ) : null}

          {importFile && productId ? (
            <div style={{ width: "100%" }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                Vista previa del import
              </Text>
              {importPreviewLoading ? (
                <Spin tip="Analizando archivo…" />
              ) : importPreviewError ? (
                <Alert
                  type="error"
                  showIcon
                  message={importPreviewError}
                  action={
                    <Button size="small" onClick={() => void fetchImportPreview()}>
                      Reintentar
                    </Button>
                  }
                />
              ) : importPreview ? (
                <>
                  <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                    <strong>{importPreview.totalRows}</strong> fila(s) en el archivo (agrupadas por campaña y día si hay
                    varios anuncios).
                    {importPreview.uniqueCampaignIds.length > 1 ? (
                      <>
                        {" "}
                        Con las campañas marcadas abajo se importarán{" "}
                        <strong>{selectedAggregatedRowCount}</strong> de esas filas para el producto elegido.
                      </>
                    ) : null}{" "}
                    Muestra de las primeras <strong>{displayedSampleRows.length}</strong> visibles (fecha, ID campaña, ID
                    anuncio si existe, y métricas; las demás columnas pueden faltar salvo una fecha reconocida).
                    {useShopify ? (
                      <>
                        {" "}
                        Con sesiones Shopify manuales, la columna <strong>Shopify</strong> se edita aquí; vacío = se usa
                        el valor del Excel si existe esa columna.
                      </>
                    ) : null}
                  </Text>
                  {importPreview.uniqueCampaignIds.length > 1 ? (
                    <div style={{ marginBottom: 14 }}>
                      <Text strong style={{ display: "block", marginBottom: 6 }}>
                        Campañas a importar para este producto
                      </Text>
                      <Text type="secondary" style={{ display: "block", marginBottom: 10, maxWidth: 720 }}>
                        El archivo incluye varias campañas en la misma cuenta. Desmarca las que no correspondan al
                        producto del catálogo seleccionado arriba; el resto no se creará ni actualizará en este import.
                      </Text>
                      <Space wrap style={{ marginBottom: 10 }}>
                        <Button
                          size="small"
                          onClick={() => setImportSelectedCampaignIds([...importPreview.uniqueCampaignIds])}
                        >
                          Marcar todas
                        </Button>
                        <Button size="small" onClick={() => setImportSelectedCampaignIds([])}>
                          Quitar todas
                        </Button>
                      </Space>
                      <Checkbox.Group
                        style={{ display: "flex", flexDirection: "column", gap: 8 }}
                        value={importSelectedCampaignIds}
                        onChange={(v) => setImportSelectedCampaignIds(v as string[])}
                        options={importPreview.uniqueCampaignIds.map((id) => {
                          const n = importPreview.campaignAggregatedRowCounts?.[id];
                          const label = `${id}${campaignDisplayNames[id] ? ` — ${campaignDisplayNames[id]}` : ""}${
                            n != null ? ` (${n} fila(s) agrupadas)` : ""
                          }`;
                          return { label, value: id };
                        })}
                      />
                    </div>
                  ) : null}
                  {importPreview.errors.length ? (
                    <Typography.Paragraph type="warning" style={{ marginBottom: 8 }}>
                      {importPreview.errors.slice(0, 12).join(" | ")}
                      {importPreview.errors.length > 12 ? " …" : ""}
                    </Typography.Paragraph>
                  ) : null}
                  <Table
                    size="small"
                    rowKey={(r, i) => `${r.externalCampaignId}-${r.recordDate}-${String(i)}`}
                    dataSource={displayedSampleRows}
                    columns={importPreviewColumns}
                    pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [5, 10, 20, 50] }}
                    scroll={{ x: "max-content" }}
                  />
                </>
              ) : null}
            </div>
          ) : null}

          {useShopify && shopifyOutsideSampleRows.length > 0 ? (
            <div style={{ width: "100%" }}>
              <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                Campañas que no aparecen en la muestra anterior (mismo criterio de sesiones Shopify):
              </Text>
              <Table
                size="small"
                rowKey="id"
                dataSource={shopifyOutsideSampleRows}
                columns={shopifyTableColumns}
                pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: [10, 15, 25, 50] }}
                scroll={{ x: "max-content", y: 280 }}
              />
            </div>
          ) : null}

          <div style={{ maxWidth: 560 }}>
            <Text strong style={{ display: "block", marginBottom: 6 }}>
              Cuenta publicitaria en este import
            </Text>
            <Text type="secondary" style={{ display: "block", marginBottom: 10 }}>
              Si eliges una cuenta, se vinculará a las campañas tocadas por este import. Déjalo vacío si no quieres
              cambiar la cuenta en las campañas.
            </Text>
            {accountsError ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 10 }}
                message={accountsError}
                action={
                  <Button size="small" onClick={() => void loadAccounts()}>
                    Reintentar
                  </Button>
                }
              />
            ) : null}
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Selecciona cuenta Meta (opcional)"
              style={{ width: "100%", maxWidth: 480 }}
              options={accountOptions}
              value={importAccountId}
              onChange={setImportAccountId}
              loading={accountsLoading}
              notFoundContent={accountsLoading ? "Cargando…" : "Sin cuentas"}
            />
            {canAccounts ? (
              importAccountCreateOpen ? (
                <Space direction="vertical" size="small" style={{ width: "100%", marginTop: 12 }}>
                  <Input
                    placeholder="ID cuenta Meta (numérico)"
                    value={importCreateMetaId}
                    onChange={(e) => setImportCreateMetaId(e.target.value)}
                  />
                  <Input
                    placeholder="Nombre negocio (opcional)"
                    value={importCreateName}
                    onChange={(e) => setImportCreateName(e.target.value)}
                  />
                  <Space wrap>
                    <Button type="primary" onClick={() => void handleCreateAccountForImport()}>
                      Crear y usar en import
                    </Button>
                    <Button
                      onClick={() => {
                        setImportAccountCreateOpen(false);
                        setImportCreateMetaId("");
                        setImportCreateName("");
                      }}
                    >
                      Cancelar
                    </Button>
                  </Space>
                </Space>
              ) : (
                <Button type="link" size="small" style={{ paddingLeft: 0, marginTop: 4 }} onClick={() => setImportAccountCreateOpen(true)}>
                  La cuenta no está en la lista: crear nueva
                </Button>
              )
            ) : (
              <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
                Para registrar una cuenta Meta aquí necesitas permiso de cuentas o de campañas (CRUD).
              </Text>
            )}
          </div>

          <Space wrap style={{ marginTop: 4 }}>
            <Button
              icon={<ClearOutlined />}
              onClick={() => clearImportForm(true)}
              disabled={!importFile && !importAccountId && !useShopify}
            >
              Limpiar import
            </Button>
            <Button
              onClick={() => void handleRefreshImportPreview()}
              disabled={!productId || !importFile || importPreviewLoading}
            >
              Actualizar vista previa
            </Button>
            <Button type="primary" onClick={handleImport} disabled={!canImport || !productId || !importFile || !importPreviewReady}>
              Importar
            </Button>
          </Space>
        </Space>
      </Card>

      <Card title="Campañas">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={campaigns}
          columns={campaignColumns}
          pagination={{ pageSize: 12 }}
          onRow={(row) => ({
            onClick: () => setSelectedCampaign(row),
            style: { cursor: "pointer" },
          })}
          rowClassName={(record) =>
            selectedCampaign?.id === record.id ? "fs-campaign-row-selected" : ""
          }
        />
        <style>{`
          .fs-campaign-row-selected > td {
            background: ${token.colorPrimaryBg} !important;
          }
          .fs-campaign-row-selected:hover > td {
            background: ${token.colorPrimaryBgHover} !important;
          }
        `}</style>
      </Card>

      {selectedCampaign ? (
        <Card title={`Métricas — ${selectedCampaign.displayName ?? selectedCampaign.externalCampaignId}`}>
          <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
            Haz clic en una fila para ver el detalle del día (incluye columnas del Excel Meta si existen).
            {canEditMetrics
              ? " Haz clic en un número (Clics, Conversaciones, Shopify) para editarlo; al salir del campo se guarda. Escape cancela. Usa «Eliminar» para quitar un día y volver a importarlo con el Excel."
              : ""}
          </Text>
          <Table
            rowKey="id"
            dataSource={metrics}
            columns={metricColumns}
            pagination={{ pageSize: 20 }}
            onRow={(row) => ({
              onClick: () => setMetricDetail(row),
              style: { cursor: "pointer" },
            })}
          />
        </Card>
      ) : null}

      <Modal
        title={
          metricDetail
            ? `Métrica — ${fmtApiDateIsoYmd(metricDetail.recordDate)}`
            : "Métrica"
        }
        open={metricDetail != null}
        onCancel={() => setMetricDetail(null)}
        footer={[
          <Button key="c" type="primary" onClick={() => setMetricDetail(null)}>
            Cerrar
          </Button>,
        ]}
        width={880}
        styles={{ body: { maxHeight: "min(70vh, 640px)", overflowY: "auto" } }}
      >
        {metricDetail ? (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="Fecha">{fmtApiDateIsoYmd(metricDetail.recordDate)}</Descriptions.Item>
              <Descriptions.Item label="Clics (Meta)">{metricDetail.metaLinkClicks ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Conversaciones iniciadas">
                {metricDetail.metaConversationsStarted ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Sesiones Shopify">{metricDetail.shopifySessions ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Actualizado">
                {metricDetail.updatedAt ? dayjs(metricDetail.updatedAt).format("YYYY-MM-DD HH:mm") : "—"}
              </Descriptions.Item>
            </Descriptions>
            {metricSnapshotEntries(metricDetail.metaExcelSnapshot).length ? (
              <>
                <Text strong>Columnas importadas (Excel Meta)</Text>
                <Table
                  size="small"
                  pagination={{ pageSize: 12, showSizeChanger: true, pageSizeOptions: [12, 24, 48] }}
                  rowKey="key"
                  dataSource={metricSnapshotEntries(metricDetail.metaExcelSnapshot)}
                  columns={[
                    { title: "Columna", dataIndex: "key", width: "42%", ellipsis: true },
                    { title: "Valor", dataIndex: "value", ellipsis: true },
                  ]}
                />
              </>
            ) : (
              <Text type="secondary">
                No hay copia de fila del Excel para este día (registro manual, edición solo de los tres campos o import
                anterior sin snapshot).
              </Text>
            )}
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}
