import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Divider, Empty, Input, Space, Spin, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { OrderFacet } from "../api";

const { Text } = Typography;

type Props = {
  /** Clave de filtro de la columna (`ciudad`, `transportadora`, `producto`…). */
  field: string;
  titulo: string;
  seleccion: string[];
  onAplicar: (valores: string[]) => void;
  onCerrar: () => void;
  cargarValores: (field: string, q: string) => Promise<OrderFacet[]>;
  abierto: boolean;
};

/**
 * Desplegable de filtro al estilo de Excel: la lista de valores que hay de verdad en esa
 * columna, con cuántos pedidos tiene cada uno, y casillas para elegir varios.
 *
 * La lista la sirve el backend aplicando los demás filtros activos, así que lo que se ve
 * son valores que devolverán resultados. El buscador filtra contra el servidor y no en
 * memoria: en columnas como Teléfono o Guía hay decenas de miles de valores distintos y
 * traerlos todos para filtrarlos aquí no es viable.
 */
export function ColumnFacetFilter({
  field,
  titulo,
  seleccion,
  onAplicar,
  onCerrar,
  cargarValores,
  abierto,
}: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [valores, setValores] = useState<OrderFacet[]>([]);
  const [cargando, setCargando] = useState(false);
  // Borrador: se marca aquí y solo se aplica al pulsar, para no recargar la tabla en cada clic.
  const [borrador, setBorrador] = useState<string[]>(seleccion);

  const ultimaPeticion = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (abierto) setBorrador(seleccion);
  }, [abierto, seleccion]);

  const traer = useCallback(
    async (q: string) => {
      const marca = ++ultimaPeticion.current;
      setCargando(true);
      try {
        const rows = await cargarValores(field, q);
        if (marca === ultimaPeticion.current) setValores(rows);
      } catch {
        if (marca === ultimaPeticion.current) setValores([]);
      } finally {
        if (marca === ultimaPeticion.current) setCargando(false);
      }
    },
    [cargarValores, field],
  );

  // Se carga al abrir, no al montar: si no, cada tabla dispararía treinta consultas.
  useEffect(() => {
    if (!abierto) return;
    setBusqueda("");
    void traer("");
  }, [abierto, traer]);

  const alBuscar = useCallback(
    (v: string) => {
      setBusqueda(v);
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => void traer(v), 350);
    },
    [traer],
  );

  /** Lo marcado que ya no sale en la lista actual no se pierde al aplicar. */
  const marcadosFueraDeLista = useMemo(
    () => borrador.filter((v) => !valores.some((f) => f.value === v)),
    [borrador, valores],
  );

  const todosVisibles = valores.map((v) => v.value);
  const todosMarcados = todosVisibles.length > 0 && todosVisibles.every((v) => borrador.includes(v));

  const alternar = (valor: string, marcado: boolean) => {
    setBorrador((prev) => (marcado ? [...new Set([...prev, valor])] : prev.filter((v) => v !== valor)));
  };

  return (
    <div style={{ width: 280, padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
      <Input
        allowClear
        autoFocus
        size="small"
        prefix={<SearchOutlined />}
        placeholder={`Buscar en ${titulo}`}
        value={busqueda}
        onChange={(e) => alBuscar(e.target.value)}
      />

      <div style={{ marginTop: 8, marginBottom: 4 }}>
        <Checkbox
          indeterminate={!todosMarcados && todosVisibles.some((v) => borrador.includes(v))}
          checked={todosMarcados}
          disabled={todosVisibles.length === 0}
          onChange={(e) =>
            setBorrador((prev) =>
              e.target.checked
                ? [...new Set([...prev, ...todosVisibles])]
                : prev.filter((v) => !todosVisibles.includes(v)),
            )
          }
        >
          <Text strong>Todos {valores.length > 0 ? `(${valores.length})` : ""}</Text>
        </Checkbox>
      </div>

      <Divider style={{ margin: "4px 0" }} />

      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        {cargando ? (
          <div style={{ padding: 16, textAlign: "center" }}>
            <Spin size="small" />
          </div>
        ) : valores.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin valores" />
        ) : (
          valores.map((f) => (
            <div key={f.value} style={{ padding: "2px 0" }}>
              <Checkbox
                checked={borrador.includes(f.value)}
                onChange={(e) => alternar(f.value, e.target.checked)}
              >
                <span style={{ wordBreak: "break-word" }}>{f.label}</span>
                {f.count !== null ? (
                  <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                    ({f.count})
                  </Text>
                ) : null}
              </Checkbox>
            </div>
          ))
        )}
      </div>

      {marcadosFueraDeLista.length > 0 ? (
        <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
          +{marcadosFueraDeLista.length} marcado(s) fuera de esta búsqueda; se conservan.
        </Text>
      ) : null}

      <Divider style={{ margin: "8px 0" }} />

      <Space style={{ width: "100%", justifyContent: "space-between" }}>
        <Button
          size="small"
          disabled={seleccion.length === 0 && borrador.length === 0}
          onClick={() => {
            setBorrador([]);
            onAplicar([]);
            onCerrar();
          }}
        >
          Limpiar
        </Button>
        <Button
          type="primary"
          size="small"
          onClick={() => {
            onAplicar(borrador);
            onCerrar();
          }}
        >
          Aplicar
        </Button>
      </Space>
    </div>
  );
}
