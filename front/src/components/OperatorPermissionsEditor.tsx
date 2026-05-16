import { useState } from "react";
import { Alert, Button, Card, Checkbox, Flex, Space, Switch, Tag, Typography } from "antd";
import { actionPermissionHint, actionPermissionLabel } from "../operatorPermissionLabels";
import {
  PERMISSION_MENU_MODULES,
  getPermissionMenuModule,
  isActionCheckboxEnabled,
  isModuleAccessEnabled,
  moduleAccessSummary,
  moduleActionKeys,
  moduleKeyLabel,
  type PermissionMenuModuleId,
} from "../permissionModules";
import type { OperatorPermissionKey, Role } from "../types";

const { Text, Paragraph } = Typography;

type Props = {
  permState: Record<OperatorPermissionKey, boolean>;
  onChange: (next: Record<OperatorPermissionKey, boolean>) => void;
  role: Role;
};

export function OperatorPermissionsEditor({ permState, onChange, role }: Props) {
  const [selectedModuleId, setSelectedModuleId] = useState<PermissionMenuModuleId | null>(null);
  const selected = selectedModuleId ? getPermissionMenuModule(selectedModuleId) : undefined;

  if (role === "ADMIN") {
    return (
      <Text type="secondary">Los administradores tienen acceso completo; no se guardan permisos granulares.</Text>
    );
  }

  const patch = (updates: Partial<Record<OperatorPermissionKey, boolean>>) => {
    onChange({ ...permState, ...updates });
  };

  const setModuleAccess = (mod: (typeof PERMISSION_MENU_MODULES)[number], enabled: boolean) => {
    const updates: Partial<Record<OperatorPermissionKey, boolean>> = {};
    for (const k of mod.moduleKeys) updates[k] = enabled;
    if (!enabled) {
      for (const k of moduleActionKeys(mod)) updates[k] = false;
    }
    patch(updates);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Un ítem por módulo del menú. Pulsa <strong>Ver acciones</strong> para activar acceso y cada permiso
        específico (importar, métricas, CRUD, etc.).
      </Paragraph>

      <Space direction="vertical" size="small" style={{ width: "100%" }}>
        {PERMISSION_MENU_MODULES.map((mod) => {
          const active = isModuleAccessEnabled(permState, mod);
          const summary = moduleAccessSummary(permState, mod);
          const isOpen = selectedModuleId === mod.id;
          return (
            <div key={mod.id}>
              <Flex
                align="center"
                justify="space-between"
                gap={8}
                wrap="wrap"
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${isOpen ? "var(--ant-color-primary-border)" : "var(--ant-color-border)"}`,
                  background: isOpen ? "var(--ant-color-primary-bg)" : undefined,
                }}
              >
                <Space size="small">
                  <Text strong>{mod.label}</Text>
                  <Tag color={active ? "success" : "default"}>{summary}</Tag>
                </Space>
                <Button
                  type={isOpen ? "primary" : "default"}
                  size="small"
                  onClick={() => setSelectedModuleId(isOpen ? null : mod.id)}
                >
                  {isOpen ? "Ocultar" : "Ver acciones"}
                </Button>
              </Flex>

              {isOpen && selected?.id === mod.id ? (
                <Card size="small" style={{ marginTop: 8 }} styles={{ body: { paddingTop: 12 } }}>
                  {mod.sharedWithLabels?.length ? (
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message={`El acceso también controla: ${mod.sharedWithLabels.join(", ")}.`}
                    />
                  ) : null}

                  <Text strong style={{ display: "block", marginBottom: 8 }}>
                    Acceso
                  </Text>
                  <Space direction="vertical" style={{ width: "100%", marginBottom: 12 }}>
                    {mod.moduleKeys.length === 1 ? (
                      <Flex justify="space-between" align="center">
                        <Text>{moduleKeyLabel(mod.moduleKeys[0]!)}</Text>
                        <Switch
                          checked={permState[mod.moduleKeys[0]!]}
                          onChange={(checked) => setModuleAccess(mod, checked)}
                        />
                      </Flex>
                    ) : (
                      mod.moduleKeys.map((key) => (
                        <Flex key={key} justify="space-between" align="center">
                          <Text>{moduleKeyLabel(key)}</Text>
                          <Switch
                            checked={permState[key]}
                            onChange={(checked) => {
                              const updates: Partial<Record<OperatorPermissionKey, boolean>> = {
                                [key]: checked,
                              };
                              if (!checked) {
                                for (const ak of moduleActionKeys(mod)) updates[ak] = false;
                              }
                              patch(updates);
                            }}
                          />
                        </Flex>
                      ))
                    )}
                  </Space>

                  {mod.accessIncludes?.length ? (
                    <>
                      <Text type="secondary" style={{ display: "block", marginBottom: 6, fontSize: 12 }}>
                        Incluido con el acceso al módulo:
                      </Text>
                      <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 12, color: "var(--ant-color-text-secondary)" }}>
                        {mod.accessIncludes.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  <Text strong style={{ display: "block", marginBottom: 8 }}>
                    Acciones
                  </Text>
                  {mod.actions.length === 0 ? (
                    <Text type="secondary">Solo acceso al módulo; no hay permisos adicionales configurables.</Text>
                  ) : (
                    <Space direction="vertical" style={{ paddingLeft: 4, width: "100%" }}>
                      {mod.actions.map((binding) => {
                        const hint = actionPermissionHint(binding.key);
                        const canToggle = isActionCheckboxEnabled(permState, mod, binding);
                        return (
                          <div key={binding.key} style={{ marginBottom: 4 }}>
                            <Checkbox
                              checked={permState[binding.key]}
                              disabled={!canToggle}
                              onChange={(e) => patch({ [binding.key]: e.target.checked })}
                            >
                              <Text>{actionPermissionLabel(binding.key)}</Text>
                            </Checkbox>
                            {binding.sharedWithLabels?.length ? (
                              <Text type="secondary" style={{ display: "block", marginLeft: 24, fontSize: 11 }}>
                                Compartido con: {binding.sharedWithLabels.join(", ")}
                              </Text>
                            ) : null}
                            {hint ? (
                              <Text type="secondary" style={{ display: "block", marginLeft: 24, fontSize: 11 }}>
                                {hint}
                              </Text>
                            ) : null}
                          </div>
                        );
                      })}
                    </Space>
                  )}
                </Card>
              ) : null}
            </div>
          );
        })}
      </Space>
    </Space>
  );
}
