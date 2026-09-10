import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App as AntdApp, ConfigProvider } from "antd";
import esES from "antd/locale/es_ES";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { slateTheme } from "./theme/antdTheme";
import { AuthProvider } from "./contexts/AuthContext";
import { AppRoutes } from "./router";
import "antd/dist/reset.css";
import "./styles/global.css";

/**
 * Calendarios en español.
 *
 * Hacen falta las dos piezas: `locale` en `ConfigProvider` traduce los textos de Ant Design
 * (botones, «Hoy», los placeholder), pero los nombres de días y meses del calendario los
 * pinta dayjs, y esos solo cambian si se fija su locale global.
 *
 * De paso, la semana pasa a empezar en lunes, que es la convención en español. Se comprobó
 * que nada en la aplicación use `startOf("week")` ni formatee nombres de mes, así que el
 * cambio no mueve ningún rango de fechas.
 */
dayjs.locale("es");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ConfigProvider theme={slateTheme} locale={esES}>
        <AntdApp>
          <AuthProvider>
            <div style={{ minHeight: "100%" }}>
              <AppRoutes />
            </div>
          </AuthProvider>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
