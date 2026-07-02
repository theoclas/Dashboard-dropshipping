import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAdvertisingAccountCampaigns,
  fetchAdvertisingCampaigns,
  fetchMetaCampaignAdvertisingAccounts,
  fetchProductAdvertisingAccounts,
  postAdvertisingAccountCampaign,
  postAdvertisingCampaign,
  putProductAdvertisingAccounts,
  unlinkAdvertisingCampaignFromProduct,
} from "../api";
import { usePermission } from "../hooks/usePermission";
import type { AdvertisingAccount, AdvertisingCampaignRow, CatalogProduct } from "../types";

const { Text } = Typography;

type Props = {
  /** Producto fijo (vista desde Productos). */
  catalogProduct?: CatalogProduct;
  /** Cuenta fija (vista desde Cuentas publicitarias). */
  fixedAccountId?: string;
  fixedAccountLabel?: string;
  /** Lista de productos para selector multi (vista desde cuenta). */
  allProducts?: CatalogProduct[];
  onChanged?: () => void;
};

export function ProductMetaMappingPanel({
  catalogProduct,
  fixedAccountId,
  fixedAccountLabel,
  allProducts = [],
  onChanged,
}: Props) {
  const canCrud =
    usePermission("actionCampanasMetaCrud") || usePermission("actionCuentasPublicitariasCrud");

  const [accounts, setAccounts] = useState<AdvertisingAccount[]>([]);
  const [linkedAccountIds, setLinkedAccountIds] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<AdvertisingCampaignRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingAccounts, setSavingAccounts] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm();

  const productId = catalogProduct?.id;
  const isProductView = Boolean(productId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const accList = await fetchMetaCampaignAdvertisingAccounts();
      setAccounts(accList);

      if (isProductView && productId) {
        const [linked, camps] = await Promise.all([
          fetchProductAdvertisingAccounts(productId),
          fetchAdvertisingCampaigns(productId),
        ]);
        setLinkedAccountIds(linked.map((a) => a.id));
        setCampaigns(camps);
      } else if (fixedAccountId) {
        const camps = await fetchAdvertisingAccountCampaigns(fixedAccountId);
        setCampaigns(camps);
      }
    } catch {
      message.error("No se pudo cargar la configuración Meta.");
    } finally {
      setLoading(false);
    }
  }, [fixedAccountId, isProductView, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: `${a.metaAccountId}${a.businessName ? ` — ${a.businessName}` : ""}`,
      })),
    [accounts],
  );

  const productOptions = useMemo(
    () =>
      allProducts
        .filter((p) => p.isActive)
        .map((p) => ({ value: p.id, label: p.name })),
    [allProducts],
  );

  const saveLinkedAccounts = async (ids: string[]) => {
    if (!productId) return;
    setSavingAccounts(true);
    try {
      const saved = await putProductAdvertisingAccounts(productId, ids);
      setLinkedAccountIds(saved.map((a) => a.id));
      message.success("Cuentas actualizadas.");
      onChanged?.();
    } catch {
      message.error("No se pudieron guardar las cuentas.");
    } finally {
      setSavingAccounts(false);
    }
  };

  const handleAddCampaign = async (vals: {
    externalCampaignId: string;
    displayName?: string;
    advertisingAccountId?: string;
    catalogProductIds?: string[];
  }) => {
    try {
      if (isProductView && productId) {
        await postAdvertisingCampaign(productId, {
          externalCampaignId: vals.externalCampaignId.trim(),
          displayName: vals.displayName?.trim(),
          advertisingAccountId: vals.advertisingAccountId ?? null,
        });
      } else if (fixedAccountId) {
        const pids = vals.catalogProductIds ?? [];
        if (pids.length === 0) {
          message.warning("Selecciona al menos un producto.");
          return;
        }
        await postAdvertisingAccountCampaign(fixedAccountId, {
          externalCampaignId: vals.externalCampaignId.trim(),
          displayName: vals.displayName?.trim(),
          catalogProductIds: pids,
        });
      }
      message.success("Campaña agregada.");
      form.resetFields();
      setAddOpen(false);
      await load();
      onChanged?.();
    } catch {
      message.error("No se pudo agregar la campaña.");
    }
  };

  const handleUnlink = async (campaignId: string) => {
    if (!productId) return;
    try {
      await unlinkAdvertisingCampaignFromProduct(productId, campaignId);
      message.success("Campaña desvinculada del producto.");
      await load();
      onChanged?.();
    } catch {
      message.error("No se pudo desvincular.");
    }
  };

  const columns: ColumnsType<AdvertisingCampaignRow> = [
    { title: "ID Meta", dataIndex: "externalCampaignId", key: "ext", width: 160 },
    {
      title: "Nombre",
      dataIndex: "displayName",
      key: "name",
      ellipsis: true,
      render: (v) => v ?? "—",
    },
    {
      title: "Cuenta",
      key: "acc",
      width: 180,
      render: (_, r) =>
        r.advertisingAccount
          ? `${r.advertisingAccount.metaAccountId}${r.advertisingAccount.businessName ? ` — ${r.advertisingAccount.businessName}` : ""}`
          : "—",
    },
    ...(isProductView
      ? []
      : [
          {
            title: "Productos",
            key: "prods",
            render: (_: unknown, r: AdvertisingCampaignRow) =>
              r.productLinks?.length ? (
                <Space size={[4, 4]} wrap>
                  {r.productLinks.map((pl) => (
                    <Tag key={pl.catalogProduct.id}>{pl.catalogProduct.name}</Tag>
                  ))}
                </Space>
              ) : (
                "—"
              ),
          } as ColumnsType<AdvertisingCampaignRow>[number],
        ]),
    ...(isProductView && canCrud
      ? [
          {
            title: "",
            key: "act",
            width: 56,
            render: (_: unknown, r: AdvertisingCampaignRow) => (
              <Popconfirm title="¿Desvincular del producto?" onConfirm={() => void handleUnlink(r.id)}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Desvincular" />
              </Popconfirm>
            ),
          } as ColumnsType<AdvertisingCampaignRow>[number],
        ]
      : []),
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {isProductView ? (
        <>
          <Text type="secondary">
            Asigna las cuentas publicitarias Meta que usa este producto. Al importar en Campañas Meta se filtrarán
            esas cuentas y se preseleccionarán las campañas vinculadas.
          </Text>
          <div>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              Cuentas publicitarias
            </Text>
            <Select
              mode="multiple"
              allowClear
              style={{ width: "100%", maxWidth: 560 }}
              placeholder="Selecciona cuentas Meta"
              options={accountOptions}
              value={linkedAccountIds}
              disabled={!canCrud || savingAccounts}
              loading={savingAccounts}
              onChange={(v) => void saveLinkedAccounts(v)}
            />
          </div>
        </>
      ) : (
        <Text type="secondary">
          Campañas de la cuenta {fixedAccountLabel ?? fixedAccountId}. Vincúlalas a uno o varios productos del catálogo.
        </Text>
      )}

      <div>
        <Space style={{ marginBottom: 8 }} wrap>
          <Text strong>Campañas Meta</Text>
          {canCrud ? (
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen((o) => !o)}>
              {addOpen ? "Cerrar" : "Agregar campaña"}
            </Button>
          ) : null}
        </Space>

        {addOpen && canCrud ? (
          <Form
            form={form}
            layout="vertical"
            style={{ maxWidth: 480, marginBottom: 16 }}
            onFinish={(vals) => void handleAddCampaign(vals)}
            initialValues={
              fixedAccountId
                ? { catalogProductIds: [] }
                : { advertisingAccountId: linkedAccountIds[0] ?? undefined }
            }
          >
            <Form.Item
              name="externalCampaignId"
              label="ID campaña Meta"
              rules={[{ required: true, message: "Indica el ID." }]}
            >
              <Input placeholder="Ej. 52522857115331" />
            </Form.Item>
            <Form.Item name="displayName" label="Nombre (opcional)">
              <Input placeholder="Nombre descriptivo" allowClear />
            </Form.Item>
            {isProductView ? (
              <Form.Item name="advertisingAccountId" label="Cuenta publicitaria (opcional)">
                <Select allowClear placeholder="Cuenta" options={accountOptions} />
              </Form.Item>
            ) : (
              <Form.Item
                name="catalogProductIds"
                label="Productos del catálogo"
                rules={[{ required: true, message: "Selecciona al menos un producto." }]}
              >
                <Select mode="multiple" placeholder="Productos" options={productOptions} />
              </Form.Item>
            )}
            <Button type="primary" htmlType="submit">
              Guardar campaña
            </Button>
          </Form>
        ) : null}

        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={campaigns}
          columns={columns}
          pagination={{ pageSize: 8 }}
        />
      </div>
    </Space>
  );
}
