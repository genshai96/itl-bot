import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCircle } from "lucide-react";
import { toast } from "sonner";

interface AgentAssignSelectProps {
  handoffId: string;
  tenantId: string;
  currentAssignee?: string | null;
  onAssigned?: () => void;
}

export const AgentAssignSelect = ({ handoffId, tenantId, currentAssignee, onAssigned }: AgentAssignSelectProps) => {
  const [assigning, setAssigning] = useState(false);

  // Get all agents/leads for this tenant
  const { data: agents } = useQuery({
    queryKey: ["tenant_agents", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role, profiles(display_name, user_id)")
        .eq("tenant_id", tenantId)
        .in("role", ["support_agent", "support_lead", "tenant_admin"]);
      if (error) throw error;
      // Deduplicate by user_id
      const uniqueAgents = new Map<string, { user_id: string; role: string; display_name: string }>();
      for (const r of data || []) {
        const profile = r.profiles as any;
        if (!uniqueAgents.has(r.user_id)) {
          uniqueAgents.set(r.user_id, {
            user_id: r.user_id,
            role: r.role,
            display_name: profile?.display_name || r.user_id.slice(0, 8),
          });
        }
      }
      return Array.from(uniqueAgents.values());
    },
    enabled: !!tenantId,
  });

  const handleAssign = async (agentId: string) => {
    setAssigning(true);
    try {
      const { error } = await supabase
        .from("handoff_events")
        .update({
          assigned_to: agentId,
          status: "assigned",
        })
        .eq("id", handoffId);
      if (error) throw error;
      toast.success("Đã assign agent");
      onAssigned?.();
    } catch (err: any) {
      toast.error("Assign thất bại: " + err.message);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Select
      value={currentAssignee || ""}
      onValueChange={handleAssign}
      disabled={assigning}
    >
      <SelectTrigger className="h-8 text-xs w-44 gap-1.5">
        <UserCircle className="h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue placeholder="Assign agent..." />
      </SelectTrigger>
      <SelectContent>
        {(!agents || agents.length === 0) && (
          <div className="px-3 py-2 text-xs text-muted-foreground">Chưa có agent nào</div>
        )}
        {agents?.map((agent) => (
          <SelectItem key={agent.user_id} value={agent.user_id} className="text-xs">
            <div className="flex items-center gap-2">
              <span>{agent.display_name}</span>
              <span className="text-[10px] text-muted-foreground">({agent.role})</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
