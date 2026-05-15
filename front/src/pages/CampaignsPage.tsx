import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Col,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { isAxiosError } from "axios";
import {
  deleteAdvertisingCampaign,
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
} from "../types";

const { Title, Text } = Typography;

function parseShopifySessionsJson(raw: string): Record<string, number> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const obj = JSON.parse(trimmed) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).trim().replace(/\s+/g, "");
    const n = Number(v);
    if (key && !Number.isNaN(n)) out[key] = Math.round(n);
  }
  return out;
}

export function CampaignsPage() {
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
  const [applyAccount, setApplyAccount] = useState(false);
  const [importAccountId, setImportAccountId] = useState<string | undefined>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shopifyJson, setShopifyJson] = useState("{}");
  const [previewSummary, setPreviewSummary] = useState<{ totalRows: number; errors: string[] } | null>(null);

  const [newAccountMetaId, setNewAccountMetaId] = useState("");
  const [newAccountName, setNewAccountName] = useState("");

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
    try {
      const list = await fetchMetaCampaignAdvertisingAccounts();
      setAccounts(list);
    } catch {
      setAccounts([]);
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

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ value: a.id, label: `${a.metaAccountId}${a.businessName ? ` — ${a.businessName}` : ""}` })),
    [accounts],
  );

  const handlePreview = async () => {
    if (!productId || !importFile) {
      message.warning("Selecciona producto y archivo Excel.");
      return;
    }
    try {
      const res = await previewAdvertisingCampaignImport(productId, importFile);
      setPreviewSummary({ totalRows: res.totalRows, errors: res.errors });
      const ids = new Set(res.sampleRows.map((r) => String(r.externalCampaignId).trim().replace(/\s+/g, "")));
      const map: Record<string, number> = {};
      ids.forEach((id) => {
        map[id] = 0;
      });
      setShopifyJson(JSON.stringify(map, null, 2));
      setPreviewOpen(true);
      if (res.errors.length) message.warning(`Preview con ${res.errors.length} avisos en filas.`);
    } catch {
      message.error("No se pudo generar la vista previa.");
    }
  };

  const handleImport = async () => {
    if (!productId || !importFile) {
      message.warning("Selecciona producto y archivo.");
      return;
    }
    let shopifyMap: Record<string, number> = {};
    if (useShopify) {
      try {
        shopifyMap = parseShopifySessionsJson(shopifyJson);
      } catch {
        message.error("JSON de sesiones Shopify inválido.");
        return;
      }
    }
    try {
      const res = await importAdvertisingCampaignMetrics(productId, importFile, {
        useShopifySessions: useShopify,
        shopifySessionsByCampaignId: shopifyMap,
        applyAdvertisingAccount: applyAccount,
        advertisingAccountId: applyAccount ? importAccountId ?? null : null,
      });
      message.success(
        `Importación: ${res.imported} campañas nuevas, ${res.campaignsUpdated} actualizadas; métricas +${res.metricsCreated} / ~${res.metricsUpdated} actualizadas.`,
      );
      if (res.errors.length) Modal.warning({ title: "Avisos del import", content: res.errors.slice(0, 30).join("\n") });
      setPreviewOpen(false);
      void loadCampaigns(productId);
      if (selectedCampaign) void loadMetrics(selectedCampaign.id);
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
    } catch {
      message.error("No se pudo crear la cuenta (¿duplicada?).");
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

  const metricColumns: ColumnsType<AdvertisingCampaignMetricRow> = [
    {
      title: "Fecha",
      dataIndex: "recordDate",
      key: "d",
      render: (v: string) => dayjs(v).format("YYYY-MM-DD"),
    },
    {
      title: "Clics",
      dataIndex: "metaLinkClicks",
      key: "cl",
      render: (v, row) =>
        canEditMetrics ? (
          <Input
            key={`${row.id}-cl-${String(row.metaLinkClicks)}-${row.updatedAt ?? ""}`}
            type="number"
            style={{ maxWidth: 120 }}
            defaultValue={v ?? ""}
            onBlur={async (e) => {
              const raw = e.target.value;
              const val = raw === "" ? null : Math.round(Number(raw));
              if (raw !== "" && Number.isNaN(val as number)) return;
              try {
                await patchAdvertisingMetric(row.id, { metaLinkClicks: val });
                message.success("Guardado.");
                if (selectedCampaign) void loadMetrics(selectedCampaign.id);
              } catch {
                message.error("No se pudo guardar.");
              }
            }}
          />
        ) : (
          v ?? "—"
        ),
    },
    {
      title: "Conversaciones",
      dataIndex: "metaConversationsStarted",
      key: "co",
      render: (v, row) =>
        canEditMetrics ? (
          <Input
            key={`${row.id}-co-${String(row.metaConversationsStarted)}-${row.updatedAt ?? ""}`}
            type="number"
            style={{ maxWidth: 120 }}
            defaultValue={v ?? ""}
            onBlur={async (e) => {
              const raw = e.target.value;
              const val = raw === "" ? null : Math.round(Number(raw));
              if (raw !== "" && Number.isNaN(val as number)) return;
              try {
                await patchAdvertisingMetric(row.id, { metaConversationsStarted: val });
                message.success("Guardado.");
                if (selectedCampaign) void loadMetrics(selectedCampaign.id);
              } catch {
                message.error("No se pudo guardar.");
              }
            }}
          />
        ) : (
          v ?? "—"
        ),
    },
    {
      title: "Sesiones Shopify",
      dataIndex: "shopifySessions",
      key: "sh",
      render: (v, row) =>
        canEditMetrics ? (
          <Input
            key={`${row.id}-sh-${String(row.shopifySessions)}-${row.updatedAt ?? ""}`}
            type="number"
            style={{ maxWidth: 120 }}
            defaultValue={v ?? ""}
            onBlur={async (e) => {
              const raw = e.target.value;
              const val = raw === "" ? null : Math.round(Number(raw));
              if (raw !== "" && Number.isNaN(val as number)) return;
              try {
                await patchAdvertisingMetric(row.id, { shopifySessions: val });
                message.success("Guardado.");
                if (selectedCampaign) void loadMetrics(selectedCampaign.id);
              } catch {
                message.error("No se pudo guardar.");
              }
            }}
          />
        ) : (
          v ?? "—"
        ),
    },
  ];

  if (!canModule) {
    return <Typography.Paragraph>No tienes permiso para el módulo de campañas Meta.</Typography.Paragraph>;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Title level={3} style={{ margin: 0 }}>
        Campañas Meta
      </Title>

      <Card title="Producto del catálogo">
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Selecciona un producto"
          style={{ width: "100%", maxWidth: 480 }}
          options={products.map((p) => ({ value: p.id, label: `${p.name}${p.sku ? ` (${p.sku})` : ""}` }))}
          value={productId}
          onChange={setProductId}
        />
      </Card>

      <Card title="Cuenta publicitaria (rápido)">
        <Text type="secondary">Crea una cuenta Meta para vincularla al import o a cada campaña.</Text>
        <Row gutter={12} style={{ marginTop: 12 }}>
          <Col xs={24} md={8}>
            <Input
              placeholder="ID cuenta Meta (numérico)"
              value={newAccountMetaId}
              onChange={(e) => setNewAccountMetaId(e.target.value)}
              disabled={!canAccounts}
            />
          </Col>
          <Col xs={24} md={8}>
            <Input
              placeholder="Nombre negocio (opcional)"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              disabled={!canAccounts}
            />
          </Col>
          <Col xs={24} md={8}>
            <Button type="primary" onClick={handleCreateAccount} disabled={!canAccounts}>
              Crear cuenta
            </Button>
          </Col>
        </Row>
      </Card>

      <Card title="Importar métricas (Excel Meta)">
        <Space wrap align="start">
          <Upload
            maxCount={1}
            beforeUpload={(file) => {
              setImportFile(file);
              return false;
            }}
            onRemove={() => setImportFile(null)}
          >
            <Button icon={<UploadOutlined />}>Elegir Excel</Button>
          </Upload>
          <Checkbox checked={useShopify} onChange={(e) => setUseShopify(e.target.checked)} disabled={!canImport}>
            Aplicar sesiones Shopify manuales (mapa JSON)
          </Checkbox>
          <Checkbox checked={applyAccount} onChange={(e) => setApplyAccount(e.target.checked)} disabled={!canImport}>
            Aplicar cuenta publicitaria al import
          </Checkbox>
          <Select
            allowClear
            placeholder="Cuenta en import"
            style={{ minWidth: 220 }}
            options={accountOptions}
            value={importAccountId}
            onChange={setImportAccountId}
            disabled={!canImport || !applyAccount}
          />
        </Space>
        <Space style={{ marginTop: 16 }}>
          <Button onClick={handlePreview} disabled={!productId || !importFile}>
            Vista previa
          </Button>
          <Button type="primary" onClick={handleImport} disabled={!canImport || !productId || !importFile}>
            Importar
          </Button>
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
            style: { cursor: "pointer", background: selectedCampaign?.id === row.id ? "#f0f5ff" : undefined },
          })}
        />
      </Card>

      {selectedCampaign ? (
        <Card title={`Métricas — ${selectedCampaign.displayName ?? selectedCampaign.externalCampaignId}`}>
          <Table rowKey="id" dataSource={metrics} columns={metricColumns} pagination={{ pageSize: 20 }} />
        </Card>
      ) : null}

      <Modal
        title="Vista previa import"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        width={720}
        footer={[
          <Button key="c" onClick={() => setPreviewOpen(false)}>
            Cerrar
          </Button>,
          <Button key="i" type="primary" disabled={!canImport} onClick={handleImport}>
            Confirmar importación
          </Button>,
        ]}
      >
        {previewSummary ? (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Text>
              Filas detectadas: <strong>{previewSummary.totalRows}</strong>
            </Text>
            {useShopify ? (
              <>
                <Text>Mapa JSON id Meta → sesiones (claves sin espacios):</Text>
                <Input.TextArea rows={10} value={shopifyJson} onChange={(e) => setShopifyJson(e.target.value)} />
              </>
            ) : null}
            {previewSummary.errors.length ? (
              <Typography.Paragraph type="warning">{previewSummary.errors.slice(0, 15).join(" | ")}</Typography.Paragraph>
            ) : null}
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}
