import { BRAND_NAME, BRAND_TAGLINE, BRANDING_ICON_SRC, BRANDING_LOGO_SIDER_SRC } from "../branding";

type LogoMarkCropProps = {
  /** Login: bloque grande; sider: franja compacta bajo el menú. */
  variant: "login" | "sider";
  className?: string;
};

/**
 * Login: marca compuesta (icono + tipografía) sin marco ni fondo de placa.
 * Sider: PNG compacto.
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
          maxWidth: 480,
          marginInline: "auto",
          display: "flex",
          alignItems: "center",
          gap: 22,
          flexShrink: 0,
        }}
      >
        <img
          src={BRANDING_ICON_SRC}
          alt=""
          decoding="async"
          draggable={false}
          style={{
            width: "clamp(88px, 16vw, 132px)",
            height: "clamp(88px, 16vw, 132px)",
            objectFit: "contain",
            flexShrink: 0,
            filter: "drop-shadow(0 12px 28px rgba(34,211,238,0.28))",
            pointerEvents: "none",
          }}
        />
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            style={{
              fontFamily: '"DM Sans", system-ui, sans-serif',
              fontWeight: 700,
              fontSize: "clamp(2rem, 4.2vw, 3.15rem)",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              color: "#f8fafc",
              textShadow: "0 10px 30px rgba(0,0,0,0.35)",
            }}
          >
            Allset
          </div>
          <div
            style={{
              fontFamily: '"DM Sans", system-ui, sans-serif',
              fontWeight: 600,
              fontSize: "clamp(1.25rem, 2.4vw, 1.85rem)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: "#e2e8f0",
            }}
          >
            E-Group
          </div>
          <div
            style={{
              marginTop: 8,
              fontFamily: '"DM Sans", system-ui, sans-serif',
              fontWeight: 500,
              fontSize: "clamp(0.72rem, 1.15vw, 0.88rem)",
              lineHeight: 1.35,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "rgba(148,163,184,0.95)",
            }}
          >
            {BRAND_TAGLINE}
          </div>
        </div>
      </div>
    );
  }

  return (
    <img
      src={BRANDING_LOGO_SIDER_SRC}
      alt={BRAND_NAME}
      className={className}
      decoding="async"
      draggable={false}
      style={{
        display: "block",
        width: "100%",
        maxWidth: "100%",
        height: "auto",
        maxHeight: 56,
        objectFit: "contain",
        objectPosition: "center",
        marginInline: "auto",
        flexShrink: 0,
      }}
    />
  );
}
