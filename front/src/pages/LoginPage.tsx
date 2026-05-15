import type { CSSProperties } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button, Card, Col, Form, Input, Row, Typography, message, Spin } from "antd";
import { api } from "../api";
import { FERSUA_STORE_SITE_URL } from "../branding";
import { FsaMark } from "../components/FsaMark";
import { LogoMarkCrop } from "../components/LogoMarkCrop";
import { useAuth } from "../contexts/AuthContext";
import type { AuthUser } from "../types";
import loginBackground from "../assets/login-background.png";

export function LoginPage() {
  const navigate = useNavigate();
  const { user, loading, refresh } = useAuth();

  if (loading) {
    return <Spin size="large" style={{ display: "block", margin: "25vh auto" }} />;
  }

  if (user) {
    return <Navigate to="/app/pedidos" replace />;
  }

  async function onFinish(values: { username: string; password: string }) {
    try {
      const response = await api.post<{ accessToken: string; user: AuthUser }>("/auth/login", {
        username: values.username.trim(),
        password: values.password,
      });
      const companyId = response.data.user.activeCompany;
      localStorage.setItem("fersua_token", response.data.accessToken);
      localStorage.setItem("fersua_company_id", companyId);
      await refresh();
      message.success("Sesión iniciada.");
      navigate("/app/pedidos", { replace: true });
    } catch {
      message.error("Credenciales incorrectas.");
    }
  }

  const shellBg: CSSProperties = {
    backgroundColor: "#020617",
    backgroundImage: `radial-gradient(120% 80% at 18% 45%, rgba(34, 211, 238, 0.12) 0%, transparent 52%), radial-gradient(90% 70% at 88% 20%, rgba(99, 102, 241, 0.1) 0%, transparent 50%), linear-gradient(118deg, rgba(15, 23, 42, 0.97) 0%, rgba(15, 23, 42, 0.88) 38%, rgba(15, 23, 42, 0.55) 100%), url(${loginBackground})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",
  };

  return (
    <div className="fs-login-page" style={shellBg}>
      <Row
        className="fs-login-row"
        wrap={false}
        style={{ flex: 1, margin: 0, width: "100%", minHeight: 0, display: "flex", alignItems: "stretch" }}
      >
        <Col
          xs={0}
          md={12}
          className="fs-login-brand-col"
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "stretch",
            padding: "40px 48px 40px 56px",
            position: "relative",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "10% 8% 10% -8%",
              background:
                "radial-gradient(ellipse 70% 55% at 50% 42%, rgba(34, 211, 238, 0.14) 0%, transparent 62%)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", width: "100%", maxWidth: 520, margin: "0 auto" }}>
            <LogoMarkCrop variant="login" />
          </div>
        </Col>
        <Col
          xs={24}
          md={12}
          className="fs-login-form-col"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 28px 40px",
            position: "relative",
          }}
        >
          <div className="fs-login-mobile-mark">
            <FsaMark size={72} rounded />
          </div>
          <Card className="fs-login-card" title="Iniciar sesión" variant="borderless" style={{ width: "100%", maxWidth: 400 }}>
            <Form layout="vertical" onFinish={onFinish} requiredMark="optional">
              <Form.Item
                label="Nombre de usuario"
                name="username"
                rules={[{ required: true, message: "Indica tu usuario." }]}
              >
                <Input size="large" autoComplete="username" placeholder="ej. fercho" />
              </Form.Item>
              <Form.Item label="Contraseña" name="password" rules={[{ required: true }]}>
                <Input.Password size="large" autoComplete="current-password" />
              </Form.Item>
              <Button htmlType="submit" type="primary" size="large" block>
                Entrar
              </Button>
            </Form>
            <div className="fs-login-company-foot">
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 12, lineHeight: 1.55 }}>
                Este panel es uso interno de <Typography.Text strong>Fersua Analytics (FSA)</Typography.Text>, alineado
                con las operaciones de{" "}
                <Typography.Text strong>FersuaStore</Typography.Text>: pago contra entrega y envíos seguros.
              </Typography.Paragraph>
              <Typography.Link
                href={FERSUA_STORE_SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, fontWeight: 500 }}
              >
                fersuastore.fersuastudio.com
              </Typography.Link>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
