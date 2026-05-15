import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App as AntdApp, ConfigProvider } from "antd";
import { slateTheme } from "./theme/antdTheme";
import { AuthProvider } from "./contexts/AuthContext";
import { AppRoutes } from "./router";
import "antd/dist/reset.css";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ConfigProvider theme={slateTheme}>
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
