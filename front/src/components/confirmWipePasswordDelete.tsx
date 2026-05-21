import { Input, Modal, Typography, message } from "antd";

const { Text, Paragraph } = Typography;

/**
 * Pide IMPORT_WIPE_SECRET antes de ejecutar un borrado destructivo (mismo criterio que limpieza de importaciones).
 */
export function confirmWipePasswordDelete(options: {
  title: string;
  description?: string;
  onDelete: (password: string) => Promise<void>;
}): void {
  const passwordRef = { current: "" };

  Modal.confirm({
    title: options.title,
    okText: "Eliminar",
    cancelText: "Cancelar",
    okButtonProps: { danger: true },
    content: (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
        {options.description ? <Paragraph style={{ margin: 0 }}>{options.description}</Paragraph> : null}
        <Text type="secondary">
          Escribe la contraseña de limpieza del servidor (<Text code>IMPORT_WIPE_SECRET</Text>) para confirmar.
        </Text>
        <Input.Password
          autoFocus
          placeholder="Contraseña de limpieza"
          onChange={(e) => {
            passwordRef.current = e.target.value;
          }}
          onPressEnter={() => {
            const btn = document.querySelector(".ant-modal-confirm .ant-btn-primary") as HTMLButtonElement | null;
            btn?.click();
          }}
        />
      </div>
    ),
    onOk: async () => {
      const pwd = passwordRef.current.trim();
      if (!pwd) {
        message.warning("Escribe la contraseña de limpieza.");
        return Promise.reject(new Error("missing password"));
      }
      try {
        await options.onDelete(pwd);
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "No se pudo eliminar (revisa la contraseña y IMPORT_WIPE_SECRET en el servidor).";
        message.error(msg);
        return Promise.reject(e);
      }
    },
  });
}
