import { BRAND_NAME, BRANDING_LOGO_SRC } from "../branding";

type FsaMarkProps = {
  size?: number;
  /** Radio del recorte; el PNG puede traer fondo propio. */
  rounded?: boolean;
};

/** Marca compacta (login móvil / sidebar colapsado). */
export function FsaMark({ size = 40, rounded = true }: FsaMarkProps) {
  const radius = rounded ? Math.max(6, Math.round(size * 0.2)) : 0;

  return (
    <img
      src={BRANDING_LOGO_SRC}
      alt={BRAND_NAME}
      width={size}
      height={size}
      decoding="async"
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        objectPosition: "left center",
        display: "block",
        flexShrink: 0,
        borderRadius: radius,
        backgroundColor: "#000000",
      }}
    />
  );
}
