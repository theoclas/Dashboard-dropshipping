import { BRAND_NAME, BRANDING_LOGO_SRC } from "../branding";

type LogoMarkCropProps = {
  /** Login: bloque grande; sider: franja compacta bajo el menú. */
  variant: "login" | "sider";
  className?: string;
};

/**
 * Login: logo Allset E-Group a tamaño legible.
 * Sider: versión compacta.
 */
export function LogoMarkCrop({ variant, className }: LogoMarkCropProps) {
  const isLogin = variant === "login";

  if (isLogin) {
    return (
      <div
        role="img"
        aria-label={BRAND_NAME}
        className={className}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 620,
          marginInline: "auto",
          overflow: "hidden",
          borderRadius: 22,
          flexShrink: 0,
          boxShadow:
            "0 0 0 1px rgba(148,163,184,0.12), 0 28px 56px -18px rgba(0,0,0,0.65), 0 0 100px -24px rgba(34,211,238,0.22)",
        }}
      >
        <img
          src={BRANDING_LOGO_SRC}
          alt={BRAND_NAME}
          decoding="async"
          draggable={false}
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            maxHeight: "min(58vh, 460px)",
            objectFit: "contain",
            objectPosition: "center",
            backgroundColor: "#1a1a1a",
            pointerEvents: "none",
          }}
        />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={BRAND_NAME}
      className={className}
      style={{
        width: "100%",
        maxWidth: "100%",
        marginInline: "auto",
        height: 56,
        overflow: "hidden",
        borderRadius: 6,
        backgroundColor: "#111827",
        backgroundImage: `url(${BRANDING_LOGO_SRC})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        backgroundPosition: "center",
        flexShrink: 0,
      }}
    />
  );
}
