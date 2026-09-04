import type { ReactNode } from "react";
import { Flex, Typography } from "antd";

const { Title, Text } = Typography;

type Props = {
  title: string;
  subtitle?: ReactNode;
  /** Controles de la cabecera: selectores, botones. Se van a la derecha. */
  extra?: ReactNode;
};

/**
 * Cabecera común de las pantallas de administración.
 *
 * Existe para que las cinco páginas se vean como una sola cosa: antes cada una apilaba
 * su propio `Title` y su propio párrafo con márgenes distintos, y los controles quedaban
 * en tarjetas sueltas que empujaban la tabla hacia abajo.
 */
export function AdminPageHeader({ title, subtitle, extra }: Props) {
  return (
    <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap">
      <div style={{ minWidth: 240, flex: "1 1 320px" }}>
        <Title level={3} style={{ margin: 0 }}>
          {title}
        </Title>
        {subtitle ? (
          <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
            {subtitle}
          </Text>
        ) : null}
      </div>
      {extra ? <div style={{ flexShrink: 0 }}>{extra}</div> : null}
    </Flex>
  );
}
