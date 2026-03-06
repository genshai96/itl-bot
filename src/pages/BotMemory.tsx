import AdminLayout from "@/components/layout/AdminLayout";
import { useTenants } from "@/hooks/use-data";
import { Brain } from "lucide-react";
import BotMemoryPanel from "@/components/memory/BotMemoryPanel";

const BotMemory = () => {
  const { data: tenants } = useTenants();
  const firstTenant = tenants?.[0];

  if (!firstTenant) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <p className="text-sm">Chưa có tenant nào</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            Bot Memory & Skills
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quản lý rules, corrections, personality, constraints và skills cho chatbot
          </p>
        </div>
        <BotMemoryPanel tenantId={firstTenant.id} />
      </div>
    </AdminLayout>
  );
};

export default BotMemory;
