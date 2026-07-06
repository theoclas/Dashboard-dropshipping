import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Segmented,
  Table,
  Tag,
  Typography,
  Upload,
  message,
  theme,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ClearOutlined, LinkOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { isAxiosError } from "axios";
import { Link } from "react-router-dom";
import { fmtApiDateIsoYmd, dayjsYesterday } from "../utils/calendarDateLocal";
import {
  META_API_DAY_DELAY_MS,
  META_API_MAX_RANGE_DAYS,
  countInclusiveDays,
  enumerateYmdDays,
  sleep,
} from "../utils/metaApiRange";
import {
  applySessionsToBatchDays,
  parseShopifySessionsJsonl,
  shopifySessionsInputForDay,
} from "../utils/parseShopifySessionsJsonl";
import { metaApiAccountAccessHint } from "../utils/metaApiErrorHint";
import {
  deleteAdvertisingCampaign,
  deleteAdvertisingMetric,
  fetchAdvertisingCampaigns,
  fetchAdvertisingMetrics,
  fetchCatalogProducts,
  fetchMetaCampaignAdvertisingAccounts,
  fetchMetaAdsAppOptions,
  fetchMetaAdsSystemUserOptions,
  fetchProductAdvertisingAccounts,
  importAdvertisingCampaignMetrics,
  importMetaApiCampaignMetrics,
  patchAdvertisingCampaign,
  patchAdvertisingMetric,
  postAdvertisingCampaign,
  postMetaCampaignAdvertisingAccount,
  previewAdvertisingCampaignImport,
  previewMetaApiCampaignImport,
} from "../api";
import { usePermission } from "../hooks/usePermission";
import type {
  AdvertisingAccount,
  AdvertisingCampaignMetricRow,
  AdvertisingCampaignRow,
  CatalogProduct,
  ImportAdvertisingPreviewResponse,
  MetaAdsAppOption,
  MetaAdsSystemUserOption,
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

type MetaApiBatchDayStatus = "pending" | "loading" | "ok" | "error" | "importing" | "imported";

type MetaApiBatchDay = {
  reportDate: string;
  status: MetaApiBatchDayStatus;
  preview: ImportAdvertisingPreviewResponse | null;
  error: string | null;
  selectedCampaignIds: string[];
  shopifySessionsInput: Record<string, string>;
};

function shopifyInputFromPreview(preview: ImportAdvertisingPreviewResponse): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of preview.uniqueCampaignIds ?? []) {
    out[id] = "";
  }
  return out;
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
  const [importSource, setImportSource] = useState<"file" | "meta-api">("file");
  const [useShopify, setUseShopify] = useState(false);
  const [importAccountId, setImportAccountId] = useState<string | undefined>();
  const [metaApiDateRange, setMetaApiDateRange] = useState<[Dayjs, Dayjs]>(() => {
    const y = dayjsYesterday();
    return [y, y];
  });
  const [metaApiBatchDays, setMetaApiBatchDays] = useState<MetaApiBatchDay[]>([]);
  const [activeBatchDate, setActiveBatchDate] = useState<string | null>(null);
  const [metaApiBatchProgress, setMetaApiBatchProgress] = useState<string | null>(null);
  const [metaApiBatchImporting, setMetaApiBatchImporting] = useState(false);
  const [metaAdsAppId, setMetaAdsAppId] = useState<string | undefined>();
  const [metaAdsSystemUserId, setMetaAdsSystemUserId] = useState<string | undefined>();
  const [metaAppOptions, setMetaAppOptions] = useState<MetaAdsAppOption[]>([]);
  const [metaSystemUserOptions, setMetaSystemUserOptions] = useState<MetaAdsSystemUserOption[]>([]);
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
  const [shopifySessionsByDate, setShopifySessionsByDate] = useState<Record<string, number>>({});
  const [shopifyJsonPasteOpen, setShopifyJsonPasteOpen] = useState(false);
  const [shopifyJsonPasteText, setShopifyJsonPasteText] = useState("");
  const [importUploadKey, setImportUploadKey] = useState(0);
  /** IDs normalizados del archivo a importar para el producto (si hay varias campañas en el archivo). */
  const [importSelectedCampaignIds, setImportSelectedCampaignIds] = useState<string[]>([]);
  const [productLinkedAccountIds, setProductLinkedAccountIds] = useState<string[]>([]);
  const [manualCampaignOpen, setManualCampaignOpen] = useState(false);
  const [manualCampaignForm] = Form.useForm<{ externalCampaignId: string; displayName?: string; advertisingAccountId?: string }>();
  const [linkingCampaignId, setLinkingCampaignId] = useState<string | null>(null);

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

  const loadMetaApps = useCallback(async () => {
    try {
      const list = await fetchMetaAdsAppOptions();
      setMetaAppOptions(list);
      setMetaAdsAppId((prev) => prev ?? list[0]?.id);
    } catch {
      setMetaAppOptions([]);
    }
  }, []);

  const loadMetaSystemUsers = useCallback(async (appId?: string) => {
    try {
      const list = await fetchMetaAdsSystemUserOptions(appId);
      setMetaSystemUserOptions(list);
      const def = list.find((u) => u.isDefault) ?? list[0];
      setMetaAdsSystemUserId((prev) => (prev && list.some((u) => u.id === prev) ? prev : def?.id));
    } catch {
      setMetaSystemUserOptions([]);
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
    if (canModule) void loadMetaApps();
  }, [canModule, loadMetaApps]);

  useEffect(() => {
    if (!canModule) return;
    void loadMetaSystemUsers(metaAdsAppId);
  }, [canModule, metaAdsAppId, loadMetaSystemUsers]);

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

  useEffect(() => {
    if (!productId) {
      setProductLinkedAccountIds([]);
      return;
    }
    void fetchProductAdvertisingAccounts(productId)
      .then((list) => setProductLinkedAccountIds(list.map((a) => a.id)))
      .catch(() => setProductLinkedAccountIds([]));
  }, [productId]);

  const filteredAccounts = useMemo(() => {
    if (productLinkedAccountIds.length === 0) return accounts;
    const set = new Set(productLinkedAccountIds);
    return accounts.filter((a) => set.has(a.id));
  }, [accounts, productLinkedAccountIds]);

  const accountOptions = useMemo(
    () =>
      filteredAccounts.map((a) => ({
        value: a.id,
        label: `${a.metaAccountId}${a.businessName ? ` — ${a.businessName}` : ""}`,
      })),
    [filteredAccounts],
  );

  useEffect(() => {
    if (productLinkedAccountIds.length === 0) return;
    if (importAccountId && productLinkedAccountIds.includes(importAccountId)) return;
    setImportAccountId(productLinkedAccountIds[0]);
  }, [productLinkedAccountIds, importAccountId]);

  const mergeShopifyPreview = useCallback((res: ImportAdvertisingPreviewResponse) => {
    const ids = res.uniqueCampaignIds ?? [];
    const names = res.campaignDisplayNames ?? {};
    const defaultSelected = res.defaultSelectedCampaignIds ?? [...ids];
    setShopifyCampaignIds(ids);
    setCampaignDisplayNames(names);
    setShopifySessionsInput((prev) => {
      const next: Record<string, string> = {};
      for (const id of ids) {
        next[id] = prev[id] ?? "";
      }
      return next;
    });
    setImportSelectedCampaignIds([...defaultSelected]);
  }, []);

  const linkedExternalCampaignIds = useMemo(
    () => new Set(campaigns.map((c) => normalizeMetaCampaignKey(c.externalCampaignId))),
    [campaigns],
  );

  const linkPreviewCampaignToProduct = useCallback(
    async (externalId: string) => {
      if (!productId || !canCrud) return;
      setLinkingCampaignId(externalId);
      try {
        await postAdvertisingCampaign(productId, {
          externalCampaignId: externalId,
          displayName: campaignDisplayNames[externalId]?.trim() || undefined,
          advertisingAccountId: importAccountId ?? null,
        });
        message.success("Campaña vinculada al producto.");
        await loadCampaigns(productId);
        setImportSelectedCampaignIds((prev) =>
          prev.some((id) => normalizeMetaCampaignKey(id) === normalizeMetaCampaignKey(externalId))
            ? prev
            : [...prev, externalId],
        );
      } catch {
        message.error("No se pudo vincular la campaña al producto.");
      } finally {
        setLinkingCampaignId(null);
      }
    },
    [productId, canCrud, campaignDisplayNames, importAccountId, loadCampaigns],
  );

  const toggleImportCampaignSelection = useCallback((externalId: string, checked: boolean) => {
    setImportSelectedCampaignIds((prev) => {
      const key = normalizeMetaCampaignKey(externalId);
      if (checked) {
        return prev.some((id) => normalizeMetaCampaignKey(id) === key) ? prev : [...prev, externalId];
      }
      return prev.filter((id) => normalizeMetaCampaignKey(id) !== key);
    });
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

  const fetchMetaApiPreview = useCallback(async (): Promise<boolean> => {
    if (!productId || !importAccountId) return false;
    const [desde, hasta] = metaApiDateRange;
    const dates = enumerateYmdDays(desde, hasta);
    if (dates.length === 0) {
      setImportPreviewError("Rango de fechas inválido.");
      return false;
    }
    if (countInclusiveDays(desde, hasta) > META_API_MAX_RANGE_DAYS) {
      setImportPreviewError(`Máximo ${META_API_MAX_RANGE_DAYS} días por consulta.`);
      return false;
    }

    setImportPreviewLoading(true);
    setImportPreviewError(null);
    setMetaApiBatchProgress(null);
    setImportPreview(null);
    setMetaApiBatchDays(
      dates.map((reportDate) => ({
        reportDate,
        status: "pending",
        preview: null,
        error: null,
        selectedCampaignIds: [],
        shopifySessionsInput: {},
      })),
    );
    setActiveBatchDate(null);

    let firstOk: MetaApiBatchDay | null = null;

    for (let i = 0; i < dates.length; i++) {
      const reportDate = dates[i]!;
      setMetaApiBatchProgress(`Consultando Meta API: día ${i + 1} de ${dates.length} (${reportDate})…`);
      setMetaApiBatchDays((prev) =>
        prev.map((d) => (d.reportDate === reportDate ? { ...d, status: "loading" } : d)),
      );
      if (i > 0) await sleep(META_API_DAY_DELAY_MS);
      try {
        const res = await previewMetaApiCampaignImport(productId, {
          advertisingAccountId: importAccountId,
          metaAdsAppId: metaAdsAppId ?? null,
          metaAdsSystemUserId: metaAdsSystemUserId ?? null,
          reportDate,
        });
        const defaultSelected = res.defaultSelectedCampaignIds ?? res.uniqueCampaignIds ?? [];
        const sessionsForDay = shopifySessionsByDate[reportDate];
        const dayRow: MetaApiBatchDay = {
          reportDate,
          status: "ok",
          preview: res,
          error: null,
          selectedCampaignIds: [...defaultSelected],
          shopifySessionsInput:
            sessionsForDay != null
              ? shopifySessionsInputForDay(res, defaultSelected, sessionsForDay)
              : shopifyInputFromPreview(res),
        };
        if (sessionsForDay != null) setUseShopify(true);
        setMetaApiBatchDays((prev) => prev.map((d) => (d.reportDate === reportDate ? dayRow : d)));
        if (!firstOk) firstOk = dayRow;
      } catch (e) {
        const msg =
          isAxiosError(e) && typeof e.response?.data === "object" && e.response?.data && "message" in e.response.data
            ? String((e.response.data as { message?: string }).message)
            : "No se pudo consultar Meta API.";
        setMetaApiBatchDays((prev) =>
          prev.map((d) =>
            d.reportDate === reportDate ? { ...d, status: "error", error: msg, preview: null } : d,
          ),
        );
      }
    }

    setMetaApiBatchProgress(null);
    setImportPreviewLoading(false);

    if (firstOk) {
      setActiveBatchDate(firstOk.reportDate);
      setImportPreview(firstOk.preview);
      setShopifyCampaignIds(firstOk.preview?.uniqueCampaignIds ?? []);
      setCampaignDisplayNames(firstOk.preview?.campaignDisplayNames ?? {});
      setImportSelectedCampaignIds(firstOk.selectedCampaignIds);
      setShopifySessionsInput(firstOk.shopifySessionsInput);
      return true;
    }
    setImportPreviewError("No se pudo consultar ningún día del rango.");
    return false;
  }, [productId, importAccountId, metaAdsAppId, metaAdsSystemUserId, metaApiDateRange, shopifySessionsByDate]);

  const getBatchDaysWithActivePersisted = useCallback((): MetaApiBatchDay[] => {
    if (!activeBatchDate) return metaApiBatchDays;
    return metaApiBatchDays.map((d) =>
      d.reportDate === activeBatchDate
        ? {
            ...d,
            selectedCampaignIds: [...importSelectedCampaignIds],
            shopifySessionsInput: { ...shopifySessionsInput },
          }
        : d,
    );
  }, [activeBatchDate, metaApiBatchDays, importSelectedCampaignIds, shopifySessionsInput]);

  const selectBatchDay = useCallback(
    (reportDate: string) => {
      const days = getBatchDaysWithActivePersisted();
      const day = days.find((d) => d.reportDate === reportDate);
      if (!day || day.status !== "ok" || !day.preview) return;
      setMetaApiBatchDays(days);
      setActiveBatchDate(reportDate);
      setImportPreview(day.preview);
      setShopifyCampaignIds(day.preview.uniqueCampaignIds ?? []);
      setCampaignDisplayNames(day.preview.campaignDisplayNames ?? {});
      setImportSelectedCampaignIds([...day.selectedCampaignIds]);
      setShopifySessionsInput({ ...day.shopifySessionsInput });
    },
    [getBatchDaysWithActivePersisted],
  );

  const applyShopifySessionsByDate = useCallback(
    (byDate: Map<string, number>) => {
      const recordPatch: Record<string, number> = {};
      for (const [k, v] of byDate) recordPatch[k] = v;
      setShopifySessionsByDate((prev) => ({ ...prev, ...recordPatch }));
      setUseShopify(true);

      const persisted = getBatchDaysWithActivePersisted();
      const { updated, applied, batchWithoutJson, jsonWithoutBatch } = applySessionsToBatchDays(
        persisted,
        byDate,
      );
      setMetaApiBatchDays(updated);

      const active = activeBatchDate ? updated.find((d) => d.reportDate === activeBatchDate) : null;
      if (active?.preview) {
        setShopifySessionsInput({ ...active.shopifySessionsInput });
      }

      return { applied, batchWithoutJson, jsonWithoutBatch };
    },
    [getBatchDaysWithActivePersisted, activeBatchDate],
  );

  const handleApplyShopifyJsonPaste = useCallback(() => {
    const result = parseShopifySessionsJsonl(shopifyJsonPasteText);
    if (!result.ok) {
      message.error(result.message);
      return;
    }
    const { applied, batchWithoutJson, jsonWithoutBatch } = applyShopifySessionsByDate(result.byDate);
    const parts: string[] = [];
    if (applied > 0) parts.push(`${applied} día(s) con sesiones aplicadas`);
    if (jsonWithoutBatch > 0) parts.push(`${jsonWithoutBatch} fecha(s) del JSON sin día en el glosario`);
    if (batchWithoutJson > 0) parts.push(`${batchWithoutJson} día(s) del glosario sin sesión en el JSON`);
    if (result.invalidLines.length > 0) parts.push(`${result.invalidLines.length} fila(s) ignoradas`);
    if (applied === 0 && metaApiBatchDays.length === 0) {
      parts.push("sesiones guardadas; al traer desde API se aplicarán automáticamente");
    }
    message.success(parts.length ? `${parts.join("; ")}.` : "Sesiones Shopify aplicadas.");
    setShopifyJsonPasteOpen(false);
  }, [shopifyJsonPasteText, applyShopifySessionsByDate, metaApiBatchDays.length]);

  const runMetaApiDayImport = useCallback(
    async (day: MetaApiBatchDay): Promise<boolean> => {
      if (!productId || !importAccountId || !day.preview || day.status === "imported") return false;
      const previewIds = day.preview.uniqueCampaignIds ?? [];
      if (previewIds.length > 1 && day.selectedCampaignIds.length === 0) {
        message.warning(`Marca al menos una campaña para importar el día ${day.reportDate}.`);
        return false;
      }
      let shopifyMap: Record<string, number> = {};
      if (useShopify) {
        shopifyMap = buildShopifySessionsMapFromInputs(day.shopifySessionsInput);
      }
      const allowedOpts =
        previewIds.length > 1
          ? { allowedCampaignIds: day.selectedCampaignIds.map((id) => normalizeMetaCampaignKey(id)) }
          : {};

      setMetaApiBatchDays((prev) =>
        prev.map((d) => (d.reportDate === day.reportDate ? { ...d, status: "importing" } : d)),
      );

      try {
        const res = await importMetaApiCampaignMetrics(productId, {
          advertisingAccountId: importAccountId,
          metaAdsAppId: metaAdsAppId ?? null,
          metaAdsSystemUserId: metaAdsSystemUserId ?? null,
          reportDate: day.reportDate,
          useShopifySessions: useShopify,
          shopifySessionsByCampaignId: shopifyMap,
          applyAdvertisingAccount: true,
          ...allowedOpts,
        });
        setMetaApiBatchDays((prev) =>
          prev.map((d) => (d.reportDate === day.reportDate ? { ...d, status: "imported" } : d)),
        );
        message.success(
          `${day.reportDate}: ${res.imported} campañas nuevas, ${res.campaignsUpdated} actualizadas; métricas +${res.metricsCreated} / ~${res.metricsUpdated}.`,
        );
        if (res.errors.length) {
          Modal.warning({
            title: `Avisos del import (${day.reportDate})`,
            content: res.errors.slice(0, 30).join("\n"),
          });
        }
        void loadCampaigns(productId);
        if (selectedCampaign) void loadMetrics(selectedCampaign.id);
        return true;
      } catch (e) {
        setMetaApiBatchDays((prev) =>
          prev.map((d) => (d.reportDate === day.reportDate ? { ...d, status: "ok" } : d)),
        );
        const msg =
          isAxiosError(e) && typeof e.response?.data === "object" && e.response?.data && "message" in e.response.data
            ? String((e.response.data as { message?: string }).message)
            : "Error al importar.";
        message.error(`${day.reportDate}: ${msg}`);
        return false;
      }
    },
    [productId, importAccountId, metaAdsAppId, metaAdsSystemUserId, useShopify, loadCampaigns, selectedCampaign, loadMetrics],
  );

  const handleImportAllBatchDays = useCallback(async () => {
    const days = getBatchDaysWithActivePersisted().filter((d) => d.status === "ok" && d.preview);
    if (days.length === 0) {
      message.warning("No hay días listos para importar.");
      return;
    }
    setMetaApiBatchImporting(true);
    setMetaApiBatchDays(getBatchDaysWithActivePersisted());
    let ok = 0;
    for (let i = 0; i < days.length; i++) {
      const day = days[i]!;
      setMetaApiBatchProgress(`Importando día ${i + 1} de ${days.length} (${day.reportDate})…`);
      if (i > 0) await sleep(META_API_DAY_DELAY_MS);
      const imported = await runMetaApiDayImport(day);
      if (imported) ok += 1;
    }
    setMetaApiBatchProgress(null);
    setMetaApiBatchImporting(false);
    if (ok > 0) message.success(`Importación masiva: ${ok} de ${days.length} día(s) importados.`);
  }, [getBatchDaysWithActivePersisted, runMetaApiDayImport]);

  const activeBatchDay = useMemo(
    () => (activeBatchDate ? metaApiBatchDays.find((d) => d.reportDate === activeBatchDate) ?? null : null),
    [activeBatchDate, metaApiBatchDays],
  );

  const metaApiImportableCount = useMemo(
    () => metaApiBatchDays.filter((d) => d.status === "ok" && d.preview).length,
    [metaApiBatchDays],
  );

  const metaApiBatchDayStatusTag = (status: MetaApiBatchDayStatus) => {
    switch (status) {
      case "pending":
        return <Tag>Pendiente</Tag>;
      case "loading":
        return <Tag color="processing">Consultando…</Tag>;
      case "ok":
        return <Tag color="success">Listo</Tag>;
      case "error":
        return <Tag color="error">Error</Tag>;
      case "importing":
        return <Tag color="processing">Importando…</Tag>;
      case "imported":
        return <Tag color="cyan">Importado</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const metaApiBatchColumns: ColumnsType<MetaApiBatchDay> = useMemo(
    () => [
      {
        title: "Día",
        dataIndex: "reportDate",
        key: "date",
        width: 120,
        render: (v: string) => fmtApiDateIsoYmd(v),
      },
      {
        title: "Estado",
        dataIndex: "status",
        key: "status",
        width: 130,
        render: (_: unknown, row) => metaApiBatchDayStatusTag(row.status),
      },
      {
        title: "Resumen",
        key: "summary",
        render: (_: unknown, row) => {
          if (row.status === "error") return <Text type="danger">{row.error ?? "Error"}</Text>;
          if (!row.preview) return "—";
          const n = row.preview.uniqueCampaignIds?.length ?? 0;
          return (
            <Text type="secondary">
              {row.preview.totalRows} fila(s), {n} campaña(s)
            </Text>
          );
        },
      },
      {
        title: "Acciones",
        key: "actions",
        width: 200,
        render: (_: unknown, row) => (
          <Space size="small">
            <Button
              size="small"
              type={activeBatchDate === row.reportDate ? "primary" : "default"}
              disabled={row.status !== "ok" || !row.preview}
              onClick={() => selectBatchDay(row.reportDate)}
            >
              Ver
            </Button>
            <Button
              size="small"
              disabled={
                row.status !== "ok" ||
                !row.preview ||
                metaApiBatchImporting ||
                importPreviewLoading
              }
              loading={row.status === "importing"}
              onClick={() => {
                const days = getBatchDaysWithActivePersisted();
                const day = days.find((d) => d.reportDate === row.reportDate);
                if (!day) return;
                setMetaApiBatchDays(days);
                void runMetaApiDayImport(day);
              }}
            >
              Importar
            </Button>
          </Space>
        ),
      },
    ],
    [
      activeBatchDate,
      selectBatchDay,
      getBatchDaysWithActivePersisted,
      runMetaApiDayImport,
      metaApiBatchImporting,
      importPreviewLoading,
    ],
  );

  useEffect(() => {
    if (importSource !== "file") return;
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
  }, [importFile, productId, importSource, fetchImportPreview]);

  useEffect(() => {
    if (importSource !== "meta-api") return;
    setImportPreview(null);
    setImportPreviewError(null);
    setImportPreviewLoading(false);
    setMetaApiBatchDays([]);
    setActiveBatchDate(null);
    setMetaApiBatchProgress(null);
    setShopifyCampaignIds([]);
    setCampaignDisplayNames({});
    setShopifySessionsInput({});
    setImportSelectedCampaignIds([]);
  }, [importSource, importAccountId, productId, metaApiDateRange]);

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
    if (!productId) return false;
    if (importSource === "file" && !importFile) return true;
    if (importSource === "meta-api" && !importAccountId) return false;
    if (importPreviewLoading || importPreviewError || metaApiBatchImporting) return false;
    if (!importPreview) return false;
    if (importSource === "meta-api" && activeBatchDay?.status === "imported") return false;
    if (importPreview.uniqueCampaignIds.length > 1 && importSelectedCampaignIds.length === 0) return false;
    return true;
  }, [
    importSource,
    importFile,
    importAccountId,
    productId,
    importPreviewLoading,
    importPreviewError,
    metaApiBatchImporting,
    importPreview,
    importSelectedCampaignIds,
    activeBatchDay,
  ]);

  const handleRefreshImportPreview = async () => {
    if (!productId) {
      message.warning("Selecciona producto del catálogo.");
      return;
    }
    if (importSource === "file") {
      if (!importFile) {
        message.warning("Selecciona producto y archivo (Excel o CSV).");
        return;
      }
      const ok = await fetchImportPreview();
      if (ok) message.success("Vista previa actualizada.");
      return;
    }
    if (!importAccountId) {
      message.warning("Selecciona cuenta publicitaria para consultar Meta API.");
      return;
    }
    const ok = await fetchMetaApiPreview();
    if (ok) message.success("Vista previa desde Meta API actualizada.");
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
    setMetaApiBatchDays([]);
    setActiveBatchDate(null);
    setMetaApiBatchProgress(null);
    setMetaApiBatchImporting(false);
    setShopifySessionsByDate({});
    setShopifyJsonPasteText("");
    setShopifyJsonPasteOpen(false);
    setMetaApiDateRange(() => {
      const y = dayjsYesterday();
      return [y, y];
    });
    if (notify) message.success("Formulario de import listo para un archivo nuevo.");
  }, []);

  const handleImport = async () => {
    if (!productId) {
      message.warning("Selecciona producto del catálogo.");
      return;
    }
    if (importSource === "meta-api") {
      const days = getBatchDaysWithActivePersisted();
      const day =
        (activeBatchDate ? days.find((d) => d.reportDate === activeBatchDate) : null) ??
        days.find((d) => d.status === "ok" && d.preview);
      if (!day?.preview) {
        message.warning("Consulta primero el rango con «Traer desde API».");
        return;
      }
      setMetaApiBatchDays(days);
      await runMetaApiDayImport(day);
      return;
    }
    const previewIds = importPreview?.uniqueCampaignIds ?? [];
    if (previewIds.length > 1 && importSelectedCampaignIds.length === 0) {
      message.warning("Marca al menos una campaña para importar a este producto.");
      return;
    }
    let shopifyMap: Record<string, number> = {};
    if (useShopify) {
      shopifyMap = buildShopifySessionsMapFromInputs(shopifySessionsInput);
    }
    const allowedOpts =
      previewIds.length > 1
        ? { allowedCampaignIds: importSelectedCampaignIds.map((id) => normalizeMetaCampaignKey(id)) }
        : {};

    try {
      const res = await importAdvertisingCampaignMetrics(productId, importFile!, {
        useShopifySessions: useShopify,
        shopifySessionsByCampaignId: shopifyMap,
        applyAdvertisingAccount: !!importAccountId,
        advertisingAccountId: importAccountId ?? null,
        ...allowedOpts,
      });
      message.success(
        `Importación: ${res.imported} campañas nuevas, ${res.campaignsUpdated} actualizadas; métricas +${res.metricsCreated} / ~${res.metricsUpdated} actualizadas.`,
      );
      if (res.errors.length) Modal.warning({ title: "Avisos del import", content: res.errors.slice(0, 30).join("\n") });
      void loadCampaigns(productId);
      if (selectedCampaign) void loadMetrics(selectedCampaign.id);
      clearImportForm(false);
    } catch (e) {
      const msg =
        isAxiosError(e) && typeof e.response?.data === "object" && e.response?.data && "message" in e.response.data
          ? String((e.response.data as { message?: string }).message)
          : "Error al importar.";
      message.error(msg);
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

  const sortMetricNullableNumber = (
    a: number | null | undefined,
    b: number | null | undefined,
  ): number => {
    const toN = (v: number | null | undefined) =>
      v != null && !Number.isNaN(Number(v)) ? Number(v) : null;
    const na = toN(a);
    const nb = toN(b);
    if (na === null && nb === null) return 0;
    if (na === null) return -1;
    if (nb === null) return 1;
    return na - nb;
  };

  const metricColumns: ColumnsType<AdvertisingCampaignMetricRow> = [
    {
      title: "Fecha",
      dataIndex: "recordDate",
      key: "d",
      sorter: (a, b) => dayjs(a.recordDate).valueOf() - dayjs(b.recordDate).valueOf(),
      sortDirections: ["descend", "ascend"],
      defaultSortOrder: "descend",
      render: (v: string) => fmtApiDateIsoYmd(v),
    },
    {
      title: "Clics",
      dataIndex: "metaLinkClicks",
      key: "cl",
      sorter: (a, b) => sortMetricNullableNumber(a.metaLinkClicks, b.metaLinkClicks),
      sortDirections: ["descend", "ascend"],
      render: (v, row) => renderMetricNumberCell("metaLinkClicks", "cl", v as number | null | undefined, row),
    },
    {
      title: "Conversaciones",
      dataIndex: "metaConversationsStarted",
      key: "co",
      sorter: (a, b) => sortMetricNullableNumber(a.metaConversationsStarted, b.metaConversationsStarted),
      sortDirections: ["descend", "ascend"],
      render: (v, row) => renderMetricNumberCell("metaConversationsStarted", "co", v as number | null | undefined, row),
    },
    {
      title: "Sesiones Shopify",
      dataIndex: "shopifySessions",
      key: "sh",
      sorter: (a, b) => sortMetricNullableNumber(a.shopifySessions, b.shopifySessions),
      sortDirections: ["descend", "ascend"],
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

      <Card title="Importar métricas (Excel / CSV Meta o API)">
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Segmented
            value={importSource}
            onChange={(v) => setImportSource(v as "file" | "meta-api")}
            options={[
              { label: "Archivo Excel / CSV", value: "file" },
              { label: "API Meta", value: "meta-api" },
            ]}
          />

          {importSource === "file" ? (
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
          ) : (
            <>
            <Alert
              type="info"
              showIcon
              message="Consulta por rango desde Meta Insights API"
              description={`Elige un rango de hasta ${META_API_MAX_RANGE_DAYS} días (máx.). El sistema consulta día a día con pausa entre llamadas para no saturar la API. Tras «Traer desde API» verás un resumen por día; puedes importar cada uno o todos a la vez.`}
            />
            <Checkbox checked={useShopify} onChange={(e) => setUseShopify(e.target.checked)} disabled={!canImport}>
              Aplicar sesiones Shopify manuales (editable en la vista previa)
            </Checkbox>
            <Button
              type="default"
              disabled={!canImport}
              onClick={() => setShopifyJsonPasteOpen(true)}
            >
              Pegar sesiones Shopify (JSON)
            </Button>
            </>
          )}

          {importSource === "file" && importFile && !productId ? (
            <Alert
              type="info"
              showIcon
              message="Selecciona el producto del catálogo (arriba) para ver la vista previa de lo que se importará."
            />
          ) : null}

          {importSource === "meta-api" && !productId ? (
            <Alert
              type="info"
              showIcon
              message="Selecciona el producto del catálogo (arriba) para importar métricas desde la API."
            />
          ) : null}

          {importSource === "meta-api" && productId && !importAccountId ? (
            <Alert type="warning" showIcon message="Selecciona una cuenta publicitaria para consultar Meta API." />
          ) : null}

          {(importSource === "file" && importFile && productId) ||
          (importSource === "meta-api" &&
            productId &&
            importAccountId &&
            (importPreview || importPreviewLoading || importPreviewError || metaApiBatchDays.length > 0)) ? (
            <div style={{ width: "100%" }}>
              {importSource === "meta-api" && metaApiBatchDays.length > 0 ? (
                <div style={{ marginBottom: 16 }}>
                  <Text strong style={{ display: "block", marginBottom: 8 }}>
                    Resumen por día (glosario)
                  </Text>
                  {metaApiBatchProgress ? (
                    <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                      {metaApiBatchProgress}
                    </Text>
                  ) : null}
                  <Table
                    size="small"
                    rowKey="reportDate"
                    dataSource={metaApiBatchDays}
                    columns={metaApiBatchColumns}
                    pagination={false}
                    scroll={{ x: "max-content" }}
                  />
                </div>
              ) : null}
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                Vista previa del import
                {importSource === "meta-api" && activeBatchDate ? (
                  <Text type="secondary" style={{ fontWeight: 400 }}>
                    {" "}
                    — día {fmtApiDateIsoYmd(activeBatchDate)}
                    {activeBatchDay?.status === "imported" ? " (ya importado)" : ""}
                  </Text>
                ) : null}
              </Text>
              {importPreviewLoading ? (
                <Spin
                  tip={
                    importSource === "meta-api"
                      ? metaApiBatchProgress ?? "Consultando Meta API día a día…"
                      : "Analizando archivo…"
                  }
                />
              ) : importPreviewError ? (
                <Alert
                  type="error"
                  showIcon
                  message={importPreviewError}
                  description={metaApiAccountAccessHint(importPreviewError) ?? undefined}
                  action={
                    <Button
                      size="small"
                      onClick={() =>
                        void (importSource === "meta-api" ? fetchMetaApiPreview() : fetchImportPreview())
                      }
                    >
                      Reintentar
                    </Button>
                  }
                />
              ) : importPreview ? (
                <>
                  <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                    <strong>{importPreview.totalRows}</strong> fila(s)
                    {importPreview.source === "meta-api" ? " desde Meta API" : " en el archivo"} (agrupadas por campaña y día si hay
                    varios anuncios).
                    {importPreview.reportDate ? (
                      <>
                        {" "}
                        Fecha consultada: <strong>{importPreview.reportDate}</strong>.
                      </>
                    ) : null}
                    {importPreview.metaAccountId ? (
                      <>
                        {" "}
                        Cuenta Meta: <strong>{importPreview.metaAccountId}</strong>.
                      </>
                    ) : null}
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
                  {importPreview.defaultSelectedCampaignIds &&
                  importPreview.uniqueCampaignIds.length > 1 ? (
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message="Preselección según mapeo del producto"
                      description="Las campañas marcadas coinciden con las vinculadas a este producto. Puedes ajustar la selección antes de importar."
                    />
                  ) : null}
                  {importPreview.uniqueCampaignIds.length >= 1 ? (
                    <div style={{ marginBottom: 14 }}>
                      <Text strong style={{ display: "block", marginBottom: 6 }}>
                        Campañas en la vista previa
                      </Text>
                      <Text type="secondary" style={{ display: "block", marginBottom: 10, maxWidth: 720 }}>
                        Marca las que quieras importar. Si una campaña aún no está configurada para este producto, usa{" "}
                        <strong>Vincular al producto</strong> para guardarla en el mapeo (y que quede preseleccionada en
                        futuros imports).
                      </Text>
                      {importPreview.uniqueCampaignIds.length > 1 ? (
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
                      ) : null}
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {importPreview.uniqueCampaignIds.map((id) => {
                          const n = importPreview.campaignAggregatedRowCounts?.[id];
                          const linked = linkedExternalCampaignIds.has(normalizeMetaCampaignKey(id));
                          const checked = importSelectedCampaignIds.some(
                            (sel) => normalizeMetaCampaignKey(sel) === normalizeMetaCampaignKey(id),
                          );
                          return (
                            <div
                              key={id}
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 0",
                                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                              }}
                            >
                              <Checkbox
                                checked={checked}
                                onChange={(e) => toggleImportCampaignSelection(id, e.target.checked)}
                              />
                              <Text style={{ flex: "1 1 240px", minWidth: 0 }}>
                                {id}
                                {campaignDisplayNames[id] ? ` — ${campaignDisplayNames[id]}` : ""}
                                {n != null ? ` (${n} fila(s) agrupadas)` : ""}
                              </Text>
                              {linked ? (
                                <Tag color="green">Del producto</Tag>
                              ) : canCrud ? (
                                <Button
                                  type="link"
                                  size="small"
                                  icon={<LinkOutlined />}
                                  loading={linkingCampaignId === id}
                                  onClick={() => void linkPreviewCampaignToProduct(id)}
                                  style={{ paddingInline: 4 }}
                                >
                                  Vincular al producto
                                </Button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
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
              Cuenta publicitaria {importSource === "meta-api" ? "(requerida para API)" : "en este import"}
            </Text>
            <Text type="secondary" style={{ display: "block", marginBottom: 10 }}>
              {importSource === "meta-api"
                ? "Se consultan los insights de esta cuenta en Meta. Las campañas importadas quedarán vinculadas a ella."
                : "Si eliges una cuenta, se vinculará a las campañas tocadas por este import. Déjalo vacío si no quieres cambiar la cuenta en las campañas."}
              {productLinkedAccountIds.length > 0 ? (
                <>
                  {" "}
                  Solo se muestran las cuentas asignadas a este producto en Productos → Configurar Meta.
                </>
              ) : null}
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
              placeholder={importSource === "meta-api" ? "Selecciona cuenta Meta" : "Selecciona cuenta Meta (opcional)"}
              style={{ width: "100%", maxWidth: 480 }}
              options={accountOptions}
              value={importAccountId}
              onChange={setImportAccountId}
              loading={accountsLoading}
              notFoundContent={accountsLoading ? "Cargando…" : "Sin cuentas"}
            />
            {importSource === "meta-api" ? (
              <div style={{ maxWidth: 560, marginTop: 12 }}>
                <Text strong style={{ display: "block", marginBottom: 6 }}>
                  Rango a consultar (máx. {META_API_MAX_RANGE_DAYS} días)
                </Text>
                <DatePicker.RangePicker
                  value={metaApiDateRange}
                  onChange={(vals) => {
                    if (!vals?.[0] || !vals[1]) {
                      const y = dayjsYesterday();
                      setMetaApiDateRange([y, y]);
                      return;
                    }
                    const [a, b] = vals;
                    if (countInclusiveDays(a, b) > META_API_MAX_RANGE_DAYS) {
                      message.warning(`Máximo ${META_API_MAX_RANGE_DAYS} días por consulta.`);
                      return;
                    }
                    setMetaApiDateRange([a, b]);
                  }}
                  format="DD/MM/YYYY"
                  allowClear={false}
                  disabledDate={(current) => Boolean(current && current > dayjs().endOf("day"))}
                  style={{ width: "100%", maxWidth: 480, marginBottom: 12 }}
                />
                <Text type="secondary" style={{ display: "block", marginBottom: 12, fontSize: 12 }}>
                  Consulta día a día con pausa de ~{Math.round(META_API_DAY_DELAY_MS / 1000)} s entre llamadas. Por
                  defecto: ayer.
                </Text>
                <Text strong style={{ display: "block", marginBottom: 6 }}>
                  App Meta
                </Text>
                <Select
                  allowClear={metaAppOptions.length === 0}
                  placeholder={metaAppOptions.length ? "Selecciona app Meta" : "Sin apps — crea una en Administración"}
                  style={{ width: "100%", maxWidth: 480, marginBottom: 12 }}
                  value={metaAdsAppId}
                  onChange={(v) => {
                    setMetaAdsAppId(v);
                    setMetaAdsSystemUserId(undefined);
                  }}
                  options={metaAppOptions.map((a) => ({
                    value: a.id,
                    label: a.metaAppId ? `${a.name} (${a.metaAppId})` : a.name,
                  }))}
                />
                <Text strong style={{ display: "block", marginBottom: 6 }}>
                  Usuario del sistema (token)
                </Text>
                <Select
                  allowClear
                  placeholder="Por defecto o .env"
                  style={{ width: "100%", maxWidth: 480 }}
                  value={metaAdsSystemUserId}
                  onChange={setMetaAdsSystemUserId}
                  disabled={!metaAdsAppId && metaAppOptions.length > 0}
                  options={metaSystemUserOptions.map((u) => ({
                    value: u.id,
                    label: `${u.name}${u.isDefault ? " (defecto)" : ""} ${u.tokenMasked ?? ""}`,
                  }))}
                />
                <Text type="secondary" style={{ display: "block", marginTop: 6, fontSize: 12 }}>
                  Gestiona apps en{" "}
                  <Link to="/app/admin/meta-ads-apps">Administración → Apps Meta</Link> y tokens en{" "}
                  <Link to="/app/admin/meta-ads-usuarios">Usuarios Meta Ads</Link>.
                </Text>
              </div>
            ) : null}
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
              disabled={
                importSource === "file"
                  ? !importFile && !importAccountId && !useShopify
                  : !importAccountId && !importPreview
              }
            >
              Limpiar import
            </Button>
            {importSource === "meta-api" ? (
              <Button
                type="default"
                onClick={() => void handleRefreshImportPreview()}
                disabled={!productId || !importAccountId || importPreviewLoading || metaApiBatchImporting}
                loading={importPreviewLoading}
              >
                Traer desde API
              </Button>
            ) : (
              <Button
                onClick={() => void handleRefreshImportPreview()}
                disabled={!productId || !importFile || importPreviewLoading}
              >
                Actualizar vista previa
              </Button>
            )}
            {importSource === "meta-api" && metaApiImportableCount > 0 ? (
              <Button
                onClick={() => void handleImportAllBatchDays()}
                disabled={
                  !canImport ||
                  !productId ||
                  !importAccountId ||
                  importPreviewLoading ||
                  metaApiBatchImporting
                }
                loading={metaApiBatchImporting}
              >
                Importar todos ({metaApiImportableCount})
              </Button>
            ) : null}
            <Button
              type="primary"
              onClick={handleImport}
              disabled={
                !canImport ||
                !productId ||
                !importPreviewReady ||
                (importSource === "file" ? !importFile : !importAccountId) ||
                metaApiBatchImporting
              }
            >
              {importSource === "meta-api" ? "Importar día activo" : "Importar"}
            </Button>
          </Space>
        </Space>
      </Card>

      <Card
        title="Campañas"
        extra={
          canCrud && productId ? (
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setManualCampaignOpen(true)}>
              Agregar campaña
            </Button>
          ) : null
        }
      >
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
            showSorterTooltip={{ title: "Ordenar" }}
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

      <Modal
        title="Pegar sesiones Shopify (JSON / JSONL)"
        open={shopifyJsonPasteOpen}
        onCancel={() => setShopifyJsonPasteOpen(false)}
        onOk={handleApplyShopifyJsonPaste}
        okText="Aplicar"
        cancelText="Cancelar"
        width={640}
        destroyOnClose={false}
      >
        <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
          Pega el informe de Shopify (una línea por día). Ejemplo:{" "}
          <Text code>{'{"day":"2026-06-01","sessions":149}'}</Text>
          . También acepta array JSON o columnas <Text code>fecha</Text> / <Text code>sesiones</Text>.
          Puedes pegar antes o después de «Traer desde API».
        </Text>
        <Input.TextArea
          value={shopifyJsonPasteText}
          onChange={(e) => setShopifyJsonPasteText(e.target.value)}
          rows={10}
          placeholder={'{"day":"2026-06-01","sessions":149}\n{"day":"2026-06-02","sessions":112}'}
          style={{ fontFamily: "monospace", fontSize: 13 }}
        />
      </Modal>

      <Modal
        title="Agregar campaña Meta"
        open={manualCampaignOpen}
        onCancel={() => {
          setManualCampaignOpen(false);
          manualCampaignForm.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={manualCampaignForm}
          layout="vertical"
          onFinish={async (vals) => {
            if (!productId) return;
            try {
              await postAdvertisingCampaign(productId, {
                externalCampaignId: vals.externalCampaignId.trim(),
                displayName: vals.displayName?.trim(),
                advertisingAccountId: vals.advertisingAccountId ?? null,
              });
              message.success("Campaña agregada.");
              setManualCampaignOpen(false);
              manualCampaignForm.resetFields();
              void loadCampaigns(productId);
            } catch {
              message.error("No se pudo agregar la campaña.");
            }
          }}
        >
          <Form.Item
            name="externalCampaignId"
            label="ID campaña Meta"
            rules={[{ required: true, message: "Indica el ID." }]}
          >
            <Input placeholder="Ej. 52522857115331" />
          </Form.Item>
          <Form.Item name="displayName" label="Nombre (opcional)">
            <Input allowClear />
          </Form.Item>
          <Form.Item name="advertisingAccountId" label="Cuenta publicitaria (opcional)">
            <Select allowClear placeholder="Cuenta" options={accountOptions} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            Guardar
          </Button>
        </Form>
      </Modal>
    </Space>
  );
}
