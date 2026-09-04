import type { ReactNode } from "react";
import { Button, Divider, Space } from "antd";

type Opcion = { value: string };

/**
 * Añade «Seleccionar todas / Quitar todas» a la cabecera del desplegable de un `Select`
 * múltiple.
 *
 * Se usa como `dropdownRender`. Los botones llevan `onMouseDown` con `preventDefault`
 * porque sin eso el desplegable pierde el foco y se cierra antes de que llegue el clic.
 */
export function selectAllDropdown(params: {
  options: Opcion[];
  value: string[];
  onChange: (v: string[]) => void;
  /** Concuerda en género con lo que se lista: «todas» las cuentas, «todos» los conjuntos. */
  etiqueta?: string;
}) {
  const { options, value, onChange, etiqueta = "todas" } = params;
  const todos = options.map((o) => o.value);
  const yaEstanTodas = todos.length > 0 && todos.every((v) => value.includes(v));

  return (menu: ReactNode) => (
    <>
      <Space size={0} style={{ padding: "4px 4px 0" }}>
        <Button
          type="link"
          size="small"
          disabled={todos.length === 0 || yaEstanTodas}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(todos)}
        >
          Seleccionar {etiqueta} ({todos.length})
        </Button>
        <Button
          type="link"
          size="small"
          disabled={value.length === 0}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange([])}
        >
          Quitar {etiqueta}
        </Button>
      </Space>
      <Divider style={{ margin: "4px 0" }} />
      {menu}
    </>
  );
}
