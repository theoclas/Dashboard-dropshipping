import { ImportWizardView } from "../ImportWizardView";
import { useAuth } from "../contexts/AuthContext";

export function ImportPage() {
  const { user } = useAuth();
  const canAdmin = user?.role === "ADMIN";
  return <ImportWizardView canAdmin={!!canAdmin} />;
}
