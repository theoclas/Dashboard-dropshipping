import { BRANDING_LOGO_SRC } from "../branding";

type LogoMarkCropProps = {
  /** Login: bloque grande; sider: franja compacta bajo el menú. */
  variant: "login" | "sider";
  className?: string;
};

/**
 * Login: muestra el PNG con más altura para que se vea también la franja inferior (p. ej. ANALYTICS).
 * Sider: recorte compacto.
 */
export function LogoMarkCrop({ variant, className }: LogoMarkCropProps) {
  const isLogin = variant === "login";

  if (isLogin) {
    return (
      <div
        role="img"
        aria-label="Fersua Analytics (FSA)"
        className={className}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 520,
          marginInline: "auto",
          /* Más alto + centrado vertical del arte: se ve más la parte de abajo sin perder tanto el FSA. */
          height: "clamp(360px, 54vh, 620px)",
          overflow: "hidden",
          borderRadius: 22,
          flexShrink: 0,
          boxShadow:
            "0 0 0 1px rgba(148,163,184,0.1), 0 28px 56px -18px rgba(0,0,0,0.65), 0 0 100px -24px rgba(34,211,238,0.2)",
        }}
      >
        <img
          src={BRANDING_LOGO_SRC}
          alt=""
          decoding="async"
          draggable={false}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "100%",
            height: "auto",
            minWidth: "100%",
            display: "block",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label="Fersua Analytics (FSA)"
      className={className}
      style={{
        width: "100%",
        maxWidth: "100%",
        marginInline: "auto",
        height: 56,
        overflow: "hidden",
        borderRadius: 6,
        backgroundColor: "rgba(0,0,0,0.18)",
        backgroundImage: `url(${BRANDING_LOGO_SRC})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        backgroundPosition: "50% 0%",
        flexShrink: 0,
      }}
    />
  );
}
