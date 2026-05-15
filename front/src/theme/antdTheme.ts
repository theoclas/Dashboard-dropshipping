import { theme } from "antd";
import type { ThemeConfig } from "antd";

/** Tema oscuro slate + acento cyan (sin primario morado). */
export const slateTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: "#22d3ee",
    colorInfo: "#38bdf8",
    colorSuccess: "#34d399",
    colorWarning: "#fbbf24",
    colorError: "#f87171",
    colorBgLayout: "#0f172a",
    colorBgContainer: "#1e293b",
    colorBgElevated: "#334155",
    colorBorder: "#334155",
    colorText: "#f1f5f9",
    colorTextSecondary: "#94a3b8",
    borderRadius: 10,
    fontFamily: "'DM Sans', system-ui, -apple-system, Segoe UI, sans-serif",
    wireframe: false,
  },
  components: {
    Layout: {
      siderBg: "#0f172a",
      headerBg: "#1e293b",
      bodyBg: "#0f172a",
      triggerBg: "#334155",
    },
    Menu: {
      darkItemBg: "#0f172a",
      darkItemSelectedBg: "rgba(34, 211, 238, 0.12)",
      darkItemSelectedColor: "#22d3ee",
      itemMarginInline: 8,
      itemBorderRadius: 8,
      iconMarginInlineEnd: 10,
    },
    Card: {
      headerBg: "transparent",
    },
    Table: {
      headerBg: "#1e293b",
      rowHoverBg: "rgba(148, 163, 184, 0.08)",
    },
  },
};
