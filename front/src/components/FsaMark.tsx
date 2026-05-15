import { BRANDING_ICON_SRC } from "../branding";

type FsaMarkProps = {
  size?: number;
  /** Radio del recorte; el PNG puede traer fondo propio. */
  rounded?: boolean;
};

/** Icono FSA (`icon.png`) para sidebar colapsado y usos compactos. */
export function FsaMark({ size = 40, rounded = true }: FsaMarkProps) {
  const radius = rounded ? Math.max(6, Math.round(size * 0.2)) : 0;

  return (
    <img
      src={BRANDING_ICON_SRC}
      alt="Fersua Analytics (FSA)"
      width={size}
      height={size}
      decoding="async"
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
        flexShrink: 0,
        borderRadius: radius,
      }}
    />
  );
}
