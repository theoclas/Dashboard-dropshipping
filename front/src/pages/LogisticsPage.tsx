import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Card,
  DatePicker,
  Empty,
  Flex,
  Input,
  Select,
  Segmented,
  Space,
  Spin,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import { LineChartOutlined, TruckOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import type { AxiosError } from 'axios';
import {
  getCiudadesComparativa,
  getComparativaGeografica,
  getEfectividadTransportadoras,
  isRequestCanceled,
  type ComparativaGeograficaResponse,
  type EfectividadTransportadoraRow,
} from '../api';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

/** Colores alineados a la referencia (leyenda transportadoras). */
const TRANSPORTADORA_COLOR: Record<string, string> = {
  COORDINADORA: '#3B82F6',
  ENVIA: '#EF4444',
  INTERRAPIDISIMO: '#F97316',
  TCC: '#EAB308',
};

const cardSurface = {
  background: "rgba(30, 41, 59, 0.72)",
  border: "1px solid rgba(148, 163, 184, 0.14)",
} as const;

/** Referencia estable para no romper memoización ni disparar updates infinitos en @ant-design/plots. */
const EMPTY_UBICACIONES: string[] = [];

function paletteForCarriers(names: string[]) {
  const order = ['COORDINADORA', 'ENVIA', 'INTERRAPIDISIMO', 'TCC'];
  const domain = [...new Set(names)].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  const range = domain.map((n) => TRANSPORTADORA_COLOR[n] || '#64748b');
  return { domain, range };
}

function colorByCarrier(domain: string[], range: string[], carrier: string): string {
  const i = domain.indexOf(carrier);
  return i >= 0 ? range[i]! : '#64748b';
}

const CHART_INNER_H = 260;
const Y_TICKS = [100, 75, 50, 25, 0];

/** Barras agrupadas sin canvas (evita fallos de @ant-design/charts/G2 en Brave y contenedores flex). */
function ComparativaGeograficaBars(props: {
  ubicaciones: string[];
  puntos: ComparativaGeograficaResponse['puntos'];
  colorDomain: string[];
  colorRange: string[];
  metrica: 'efectividad' | 'devolucion';
}) {
  const { ubicaciones, puntos, colorDomain, colorRange, metrica } = props;
  const byLoc = useMemo(() => {
    const m = new Map<string, typeof puntos>();
    for (const u of ubicaciones) m.set(u, []);
    for (const p of puntos) {
      const list = m.get(p.ubicacion);
      if (list) list.push(p);
    }
    return m;
  }, [ubicaciones, puntos]);

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: CHART_INNER_H + 56, gap: 8 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flexShrink: 0,
          width: 36,
          paddingBottom: 28,
          fontSize: 11,
          color: 'rgba(255,255,255,0.45)',
          textAlign: 'right',
        }}
      >
        {Y_TICKS.map((t) => (
          <span key={t}>{t}%</span>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 6,
          paddingBottom: 4,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {ubicaciones.map((u) => {
          const series = byLoc.get(u) ?? [];
          return (
            <div
              key={u}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: '0 0 auto',
                minWidth: 52,
                maxWidth: 120,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  gap: 3,
                  height: CHART_INNER_H,
                }}
              >
                {series.map((p) => {
                  const h = Math.max(2, (p.valorPct / 100) * CHART_INNER_H);
                  const bg = colorByCarrier(colorDomain, colorRange, p.transportadora);
                  const ratioLine =
                    p.numerador != null && p.denominador != null
                      ? `${p.numerador} / ${p.denominador}`
                      : null;
                  const ratioHint =
                    metrica === 'efectividad'
                      ? 'entregados / enviados'
                      : 'devoluciones / enviados';
                  return (
                    <Tooltip
                      key={`${u}-${p.transportadora}`}
                      mouseEnterDelay={0.1}
                      title={
                        <div style={{ lineHeight: 1.45, maxWidth: 220 }}>
                          <div style={{ fontWeight: 600 }}>{p.transportadora}</div>
                          <div>
                            {p.valorPct}%{' '}
                            {metrica === 'efectividad' ? 'efectividad' : 'devolución'}
                          </div>
                          {ratioLine && (
                            <>
                              <div style={{ marginTop: 4, fontSize: 13 }}>{ratioLine}</div>
                              <div style={{ fontSize: 11, opacity: 0.85 }}>{ratioHint}</div>
                            </>
                          )}
                        </div>
                      }
                    >
                      <div
                        style={{
                          width: Math.min(14, Math.max(8, 40 / Math.max(1, series.length))),
                          height: h,
                          background: bg,
                          borderRadius: 3,
                          cursor: 'default',
                        }}
                      />
                    </Tooltip>
                  );
                })}
              </div>
              <Text
                ellipsis={{ tooltip: u }}
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  lineHeight: 1.2,
                  maxWidth: '100%',
                  textAlign: 'center',
                  color: 'rgba(255,255,255,0.65)',
                }}
              >
                {u}
              </Text>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function errMsg(e: unknown): string {
  const ax = e as AxiosError<{ message?: string | string[] }>;
  if (ax.response?.data?.message) {
    const m = ax.response.data.message;
    return Array.isArray(m) ? m.join(', ') : m;
  }
  if (e instanceof Error) return e.message;
  return 'Error al cargar';
}

export function LogisticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EfectividadTransportadoraRow[]>([]);
  const [comparativa, setComparativa] = useState<ComparativaGeograficaResponse | null>(null);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [dimension, setDimension] = useState<'departamento' | 'ciudad'>('departamento');
  const [metrica, setMetrica] = useState<'efectividad' | 'devolucion'>('efectividad');
  const [empresaFilter, setEmpresaFilter] = useState('');
  const [ciudadComparativa, setCiudadComparativa] = useState<string | undefined>();
  const [ciudadesOptions, setCiudadesOptions] = useState<string[]>([]);
  const [loadingCiudades, setLoadingCiudades] = useState(false);

  const rangeKey =
    range?.[0] && range?.[1]
      ? `${range[0].valueOf()}-${range[1].valueOf()}`
      : 'all';

  useEffect(() => {
    const ac = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const desde = range?.[0]?.format('YYYY-MM-DD');
        const hasta = range?.[1]?.format('YYYY-MM-DD');
        const dateOpts = desde && hasta ? { desde, hasta } : undefined;
        const [ef, cg] = await Promise.all([
          getEfectividadTransportadoras(dateOpts, { signal: ac.signal }),
          getComparativaGeografica(
            {
              ...dateOpts,
              dimension,
              metrica,
              top: 15,
              ...(dimension === 'ciudad' && ciudadComparativa
                ? { ciudad: ciudadComparativa }
                : {}),
            },
            { signal: ac.signal },
          ),
        ]);
        if (!active || ac.signal.aborted) return;
        setRows(ef);
        setComparativa(cg);
      } catch (e: unknown) {
        if (!active || ac.signal.aborted || isRequestCanceled(e)) return;
        setError(errMsg(e));
      } finally {
        if (active && !ac.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      active = false;
      ac.abort();
    };
  }, [rangeKey, dimension, metrica, range, ciudadComparativa]);

  useEffect(() => {
    if (dimension !== 'ciudad') {
      setCiudadesOptions([]);
      setLoadingCiudades(false);
      return;
    }
    const ac = new AbortController();
    setLoadingCiudades(true);
    void (async () => {
      try {
        const desde = range?.[0]?.format('YYYY-MM-DD');
        const hasta = range?.[1]?.format('YYYY-MM-DD');
        const dateOpts = desde && hasta ? { desde, hasta } : {};
        const list = await getCiudadesComparativa(dateOpts, { signal: ac.signal });
        if (!ac.signal.aborted) setCiudadesOptions(list);
      } catch (e: unknown) {
        if (!ac.signal.aborted && !isRequestCanceled(e)) setCiudadesOptions([]);
      } finally {
        if (!ac.signal.aborted) setLoadingCiudades(false);
      }
    })();
    return () => ac.abort();
  }, [dimension, rangeKey, range]);

  const filteredRows = useMemo(() => {
    const q = empresaFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.empresa.toLowerCase().includes(q));
  }, [rows, empresaFilter]);

  /** Suma todas las transportadoras del rango (misma base que el dashboard); no aplica el filtro de búsqueda. */
  const efectividadTotales = useMemo(() => {
    if (rows.length === 0) return null;
    let enviados = 0;
    let transito = 0;
    let devoluciones = 0;
    let entregados = 0;
    for (const r of rows) {
      enviados += r.enviados;
      transito += r.transito;
      devoluciones += r.devoluciones;
      entregados += r.entregados;
    }
    const den = enviados > 0 ? enviados : 1;
    return {
      enviados,
      transito,
      pctTransito: (transito / den) * 100,
      devoluciones,
      pctDevoluciones: (devoluciones / den) * 100,
      entregados,
      pctEntregados: (entregados / den) * 100,
    };
  }, [rows]);

  const chartData = comparativa?.puntos ?? [];
  const carriers = useMemo(
    () => [...new Set(chartData.map((p) => p.transportadora))],
    [chartData],
  );
  const colorScale = useMemo(() => paletteForCarriers(carriers), [carriers]);
  const ubicaciones = comparativa?.ubicaciones ?? EMPTY_UBICACIONES;

  const comparativaMinWidth = useMemo(() => {
    if (!ubicaciones.length) return 400;
    return Math.max(400, Math.min(2400, 44 + ubicaciones.length * 58));
  }, [ubicaciones.length]);

  const columns: ColumnsType<EfectividadTransportadoraRow> = [
    {
      title: 'EMPRESA',
      dataIndex: 'empresa',
      key: 'empresa',
      sorter: (a, b) => a.empresa.localeCompare(b.empresa),
      render: (v: string) => <Text strong>{v}</Text>,
      onHeaderCell: () => ({ style: { textAlign: 'left' } }),
      onCell: () => ({ style: { textAlign: 'left' } }),
    },
    {
      title: 'ENVIADOS',
      dataIndex: 'enviados',
      key: 'enviados',
      sorter: (a, b) => a.enviados - b.enviados,
      onHeaderCell: () => ({
        style: { textAlign: 'right' },
        title: 'Pedidos en tránsito, entregados o devueltos (sin cancelados ni rechazados)',
      }),
      onCell: () => ({ style: { textAlign: 'right', color: 'rgba(255,255,255,0.65)' } }),
    },
    {
      title: 'TRÁNSITO',
      key: 'transito',
      sorter: (a, b) => a.transito - b.transito,
      render: (_, r) => (
        <Text style={{ color: '#3B82F6' }}>
          {r.transito} ({r.pctTransito}%)
        </Text>
      ),
      onHeaderCell: () => ({ style: { textAlign: 'right' } }),
      onCell: () => ({ style: { textAlign: 'right' } }),
    },
    {
      title: 'DEVOLUCIONES',
      key: 'devoluciones',
      sorter: (a, b) => a.devoluciones - b.devoluciones,
      render: (_, r) => (
        <Text style={{ color: '#EF4444' }}>
          {r.devoluciones} ({r.pctDevoluciones}%)
        </Text>
      ),
      onHeaderCell: () => ({ style: { textAlign: 'right' } }),
      onCell: () => ({ style: { textAlign: 'right' } }),
    },
    {
      title: 'ENTREGADOS',
      key: 'entregados',
      sorter: (a, b) => a.entregados - b.entregados,
      render: (_, r) => (
        <Text strong style={{ color: '#10B981' }}>
          {r.entregados} ({r.pctEntregados}%)
        </Text>
      ),
      onHeaderCell: () => ({ style: { textAlign: 'right' } }),
      onCell: () => ({
        style: {
          textAlign: 'right',
          background: 'rgba(16, 185, 129, 0.08)',
        },
      }),
    },
  ];

  return (
    <main aria-labelledby="logistica-page-title" style={{ width: '100%' }}>
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={4} id="logistica-page-title" style={{ margin: 0 }}>
          <TruckOutlined style={{ marginRight: 8 }} aria-hidden />
          Logística y transportadoras
        </Title>
        <Text type="secondary">
          Efectividad por transportadora y comparativa geográfica (Top 15). Datos de la empresa activa en el selector
          superior.
        </Text>
      </div>

      <Card size="small" style={cardSurface} styles={{ body: { padding: '12px 16px' } }}>
        <Space wrap align="center">
          <Text type="secondary">Rango de fechas (opcional):</Text>
          <RangePicker
            value={range}
            onChange={(v) => setRange(v as [Dayjs | null, Dayjs | null] | null)}
            allowEmpty={[true, true]}
            format="DD/MM/YYYY"
          />
        </Space>
      </Card>

      {error && <Alert type="error" message={error} showIcon />}

      <Spin spinning={loading}>
        <Card
          style={cardSurface}
          role="region"
          aria-labelledby="logistica-efectividad-title"
          styles={{ header: { borderBottom: '1px solid rgba(255,255,255,0.06)' } }}
          title={
            <Space>
              <TruckOutlined aria-hidden />
              <span id="logistica-efectividad-title">Efectividad Transportadora</span>
            </Space>
          }
          extra={
            <Input.Search
              allowClear
              placeholder="Filtrar por empresa"
              onChange={(e) => setEmpresaFilter(e.target.value)}
              style={{ width: 220 }}
            />
          }
        >
          <Table<EfectividadTransportadoraRow>
            rowKey={(r) => r.empresa}
            columns={columns}
            dataSource={filteredRows}
            pagination={false}
            size="middle"
            showSorterTooltip
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: <Empty description="Sin datos" /> }}
            summary={() =>
              efectividadTotales ? (
                <Table.Summary fixed="bottom">
                  <Table.Summary.Row style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <Table.Summary.Cell index={0} align="left">
                      <div>
                        <Text strong>TOTAL</Text>
                        {empresaFilter.trim() ? (
                          <Text
                            type="secondary"
                            style={{ display: 'block', fontSize: 11, fontWeight: 400, marginTop: 2 }}
                          >
                            Todas las empresas del rango (el filtro solo oculta filas)
                          </Text>
                        ) : null}
                      </div>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <Text strong style={{ color: 'rgba(255,255,255,0.85)' }}>
                        {efectividadTotales.enviados.toLocaleString('es-CO')}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">
                      <Text strong style={{ color: '#3B82F6' }}>
                        {efectividadTotales.transito.toLocaleString('es-CO')} (
                        {efectividadTotales.pctTransito.toFixed(1)}%)
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                      <Text strong style={{ color: '#EF4444' }}>
                        {efectividadTotales.devoluciones.toLocaleString('es-CO')} (
                        {efectividadTotales.pctDevoluciones.toFixed(1)}%)
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <div
                        style={{
                          background: 'rgba(16, 185, 129, 0.12)',
                          borderRadius: 4,
                          padding: '2px 8px',
                          display: 'inline-block',
                        }}
                      >
                        <Text strong style={{ color: '#10B981' }}>
                          {efectividadTotales.entregados.toLocaleString('es-CO')} (
                          {efectividadTotales.pctEntregados.toFixed(1)}%)
                        </Text>
                      </div>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              ) : null
            }
          />
        </Card>

        <Card
          style={{ ...cardSurface, marginTop: 24 }}
          role="region"
          aria-labelledby="logistica-comparativa-title"
          styles={{ header: { borderBottom: '1px solid rgba(255,255,255,0.06)' } }}
          title={
            <Space direction="vertical" size={0}>
              <Space>
                <LineChartOutlined aria-hidden />
                <span id="logistica-comparativa-title">Comparativa de Transportadoras</span>
              </Space>
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>
                {dimension === 'ciudad' && ciudadComparativa
                  ? `Ciudad: ${ciudadComparativa} · transportadoras en el rango de fechas`
                  : dimension === 'ciudad'
                    ? 'Top 15 ciudades por volumen, o elige una ciudad para detalle'
                    : 'Top 15 departamentos por volumen en el rango de fechas'}
              </Text>
            </Space>
          }
          extra={
            <Flex wrap="wrap" gap={8} justify="flex-end">
              <Segmented
                size="small"
                value={dimension}
                onChange={(v) => {
                  const d = v as 'departamento' | 'ciudad';
                  setDimension(d);
                  if (d !== 'ciudad') setCiudadComparativa(undefined);
                }}
                options={[
                  { label: 'Departamentos', value: 'departamento' },
                  { label: 'Ciudades', value: 'ciudad' },
                ]}
              />
              <Segmented
                size="small"
                value={metrica}
                onChange={(v) => setMetrica(v as 'efectividad' | 'devolucion')}
                options={[
                  { label: '% Efectividad', value: 'efectividad' },
                  { label: '% Devolución', value: 'devolucion' },
                ]}
              />
            </Flex>
          }
        >
          {dimension === 'ciudad' ? (
            <Space wrap align="center" style={{ marginBottom: 12 }}>
              <Text type="secondary">Ciudad (opcional):</Text>
              <Select
                showSearch
                allowClear
                placeholder="Todas — top 15 por volumen"
                options={ciudadesOptions.map((c) => ({ label: c, value: c }))}
                value={ciudadComparativa}
                onChange={(v) => setCiudadComparativa(v ?? undefined)}
                style={{ minWidth: 260, maxWidth: 360 }}
                loading={loadingCiudades}
                filterOption={(input, opt) =>
                  String(opt?.label ?? '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </Space>
          ) : null}
          {chartData.length === 0 ? (
            <Empty description="Sin datos para el gráfico con los filtros actuales" />
          ) : (
            <div
              style={{
                width: '100%',
                minWidth: 0,
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <div
                key={`${dimension}-${metrica}-${rangeKey}-${ciudadComparativa ?? ''}`}
                style={{ minWidth: comparativaMinWidth, paddingTop: 8 }}
              >
                <ComparativaGeograficaBars
                  ubicaciones={ubicaciones}
                  puntos={chartData}
                  colorDomain={colorScale.domain}
                  colorRange={colorScale.range}
                  metrica={metrica}
                />
                <Flex wrap="wrap" gap="12px 20px" justify="center" style={{ marginTop: 20 }}>
                  {colorScale.domain.map((name, i) => (
                    <Space key={name} size={6} align="center">
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: colorScale.range[i],
                          flexShrink: 0,
                        }}
                      />
                      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{name}</Text>
                    </Space>
                  ))}
                </Flex>
              </div>
            </div>
          )}
        </Card>
      </Spin>
    </Space>
    </main>
  );
}
