import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Globe, Key, Loader2, Save, TestTube } from "lucide-react";
import type { ModelInfo } from "@/lib/api";

interface ProviderState {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: string;
  maxTokens: string;
}

interface AgentCoreTabProps {
  tenantName: string;
  provider: ProviderState;
  setProvider: (value: ProviderState) => void;
  connectionOk: boolean;
  loadingModels: boolean;
  models: ModelInfo[];
  searchModel: string;
  setSearchModel: (value: string) => void;
  saving: boolean;
  onFetchModels: () => void;
  onSave: () => void;
}

export const AgentCoreTab = ({
  tenantName,
  provider,
  setProvider,
  connectionOk,
  loadingModels,
  models,
  searchModel,
  setSearchModel,
  saving,
  onFetchModels,
  onSave,
}: AgentCoreTabProps) => {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Globe className="h-5 w-5 text-primary" /></div>
          <div>
            <h3 className="text-sm font-semibold">API Configuration — {tenantName}</h3>
            <p className="text-xs text-muted-foreground">OpenAI-compatible endpoint</p>
          </div>
          {connectionOk && <span className="ml-auto flex items-center gap-1.5 text-xs text-success font-medium"><CheckCircle2 className="h-3.5 w-3.5" />Connected</span>}
        </div>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">API Endpoint</Label>
            <Input value={provider.endpoint} onChange={(e) => setProvider({ ...provider, endpoint: e.target.value })} placeholder="https://api.openai.com/v1" className="font-mono text-sm h-10" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-2"><Key className="h-3.5 w-3.5" />API Key</Label>
            <Input type="password" value={provider.apiKey} onChange={(e) => setProvider({ ...provider, apiKey: e.target.value })} placeholder="sk-..." className="font-mono text-sm h-10" />
          </div>
          <div className="flex gap-3">
            <Button onClick={onFetchModels} variant="outline" size="sm" className="gap-2 text-xs" disabled={loadingModels}>
              <TestTube className="h-3.5 w-3.5" />
              {loadingModels ? "Đang tải..." : "Test & Fetch Models"}
            </Button>
          </div>
          {models.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Model ({models.length})</Label>
                <Input value={searchModel} onChange={(e) => setSearchModel(e.target.value)} placeholder="Tìm model..." className="h-8 w-48 text-xs" />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {models.filter((m) => m.id.toLowerCase().includes(searchModel.toLowerCase())).map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setProvider({ ...provider, model: model.id })}
                    className={`rounded-lg border px-3 py-2 text-left transition-all ${provider.model === model.id ? "border-primary bg-primary/5 text-primary" : "hover:border-primary/30 hover:bg-muted/50"}`}
                  >
                    <p className="text-xs font-mono truncate">{model.id}</p>
                    {model.owned_by && <p className="text-[10px] text-muted-foreground mt-0.5">{model.owned_by}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Temperature</Label>
              <Input type="number" step="0.1" min="0" max="2" value={provider.temperature} onChange={(e) => setProvider({ ...provider, temperature: e.target.value })} className="font-mono text-sm h-10" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Max Tokens</Label>
              <Input type="number" value={provider.maxTokens} onChange={(e) => setProvider({ ...provider, maxTokens: e.target.value })} className="font-mono text-sm h-10" />
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" className="gap-2 glow-primary" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Lưu cấu hình
          </Button>
        </div>
      </div>
    </div>
  );
};
