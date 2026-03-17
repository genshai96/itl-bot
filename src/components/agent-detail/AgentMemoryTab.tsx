import { BotMemoryCategoryManager } from "./BotMemoryCategoryManager";

interface AgentMemoryTabProps {
  tenantId: string;
}

export const AgentMemoryTab = ({ tenantId }: AgentMemoryTabProps) => {
  return (
    <BotMemoryCategoryManager
      tenantId={tenantId}
      title="Agent Memory"
      description="Tách riêng memory semantics khỏi skills: rules, corrections, facts, personality, constraints."
      categories={["rule", "correction", "fact", "personality", "constraint"]}
      defaultCategory="rule"
      compact
    />
  );
};
