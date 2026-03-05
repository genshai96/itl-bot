import { useCallback, useRef, useState, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  MarkerType,
  Handle,
  Position,
  NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  MessageSquare, Bot, ArrowUpRight, Zap, GitBranch, Wrench,
  Plus, Trash2, Settings2, Play, AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";
import { validateFlow, type ValidationError } from "@/lib/flow-validation";
import { toast } from "sonner";

// ===================== CUSTOM NODE TYPES =====================

type FlowNodeData = {
  label: string;
  type: string;
  message?: string;
  condition?: string;
  toolId?: string;
  intent?: string;
  priority?: string;
};

function TriggerNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className={`rounded-xl border-2 px-4 py-3 min-w-[180px] shadow-md transition-shadow ${
      selected ? "border-primary shadow-lg shadow-primary/20" : "border-info/50"
    } bg-card`}>
      <div className="flex items-center gap-2 mb-1">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-info/10">
          <Zap className="h-3.5 w-3.5 text-info" />
        </div>
        <span className="text-[10px] font-semibold text-info uppercase tracking-wider">Trigger</span>
      </div>
      <p className="text-xs font-medium truncate">{data.label}</p>
      {data.intent && <p className="text-[10px] text-muted-foreground mt-0.5">Intent: {data.intent}</p>}
      <Handle type="source" position={Position.Bottom} className="!bg-info !w-3 !h-3 !border-2 !border-card" />
    </div>
  );
}

function MessageNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className={`rounded-xl border-2 px-4 py-3 min-w-[180px] max-w-[260px] shadow-md transition-shadow ${
      selected ? "border-primary shadow-lg shadow-primary/20" : "border-primary/30"
    } bg-card`}>
      <Handle type="target" position={Position.Top} className="!bg-primary !w-3 !h-3 !border-2 !border-card" />
      <div className="flex items-center gap-2 mb-1">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
          <MessageSquare className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Message</span>
      </div>
      <p className="text-xs font-medium truncate">{data.label}</p>
      {data.message && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{data.message}</p>}
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3 !border-2 !border-card" />
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className={`rounded-xl border-2 px-4 py-3 min-w-[180px] shadow-md transition-shadow ${
      selected ? "border-primary shadow-lg shadow-warning/20" : "border-warning/50"
    } bg-card`}>
      <Handle type="target" position={Position.Top} className="!bg-warning !w-3 !h-3 !border-2 !border-card" />
      <div className="flex items-center gap-2 mb-1">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-warning/10">
          <GitBranch className="h-3.5 w-3.5 text-warning" />
        </div>
        <span className="text-[10px] font-semibold text-warning uppercase tracking-wider">Condition</span>
      </div>
      <p className="text-xs font-medium truncate">{data.label}</p>
      {data.condition && <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{data.condition}</p>}
      <div className="flex justify-between mt-2 px-2">
        <span className="text-[8px] font-bold text-success">YES</span>
        <span className="text-[8px] font-bold text-destructive">NO</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="yes" className="!bg-success !w-3 !h-3 !border-2 !border-card !left-[30%]" />
      <Handle type="source" position={Position.Bottom} id="no" className="!bg-destructive !w-3 !h-3 !border-2 !border-card !left-[70%]" />
    </div>
  );
}

function ToolNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className={`rounded-xl border-2 px-4 py-3 min-w-[180px] shadow-md transition-shadow ${
      selected ? "border-primary shadow-lg shadow-primary/20" : "border-accent/50"
    } bg-card`}>
      <Handle type="target" position={Position.Top} className="!bg-accent !w-3 !h-3 !border-2 !border-card" />
      <div className="flex items-center gap-2 mb-1">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10">
          <Wrench className="h-3.5 w-3.5 text-accent" />
        </div>
        <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">Tool Call</span>
      </div>
      <p className="text-xs font-medium truncate">{data.label}</p>
      {data.toolId && <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{data.toolId}</p>}
      <Handle type="source" position={Position.Bottom} className="!bg-accent !w-3 !h-3 !border-2 !border-card" />
    </div>
  );
}

function HandoffNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className={`rounded-xl border-2 px-4 py-3 min-w-[180px] shadow-md transition-shadow ${
      selected ? "border-primary shadow-lg shadow-destructive/20" : "border-destructive/50"
    } bg-card`}>
      <Handle type="target" position={Position.Top} className="!bg-destructive !w-3 !h-3 !border-2 !border-card" />
      <div className="flex items-center gap-2 mb-1">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-destructive/10">
          <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
        </div>
        <span className="text-[10px] font-semibold text-destructive uppercase tracking-wider">Handoff</span>
      </div>
      <p className="text-xs font-medium truncate">{data.label}</p>
      {data.priority && (
        <Badge variant="secondary" className="text-[9px] mt-1">{data.priority} priority</Badge>
      )}
    </div>
  );
}

function BotResponseNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  return (
    <div className={`rounded-xl border-2 px-4 py-3 min-w-[180px] max-w-[260px] shadow-md transition-shadow ${
      selected ? "border-primary shadow-lg shadow-primary/20" : "border-success/50"
    } bg-card`}>
      <Handle type="target" position={Position.Top} className="!bg-success !w-3 !h-3 !border-2 !border-card" />
      <div className="flex items-center gap-2 mb-1">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-success/10">
          <Bot className="h-3.5 w-3.5 text-success" />
        </div>
        <span className="text-[10px] font-semibold text-success uppercase tracking-wider">AI Response</span>
      </div>
      <p className="text-xs font-medium truncate">{data.label}</p>
      {data.message && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{data.message}</p>}
      <Handle type="source" position={Position.Bottom} className="!bg-success !w-3 !h-3 !border-2 !border-card" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  condition: ConditionNode,
  tool: ToolNode,
  handoff: HandoffNode,
  botResponse: BotResponseNode,
};

const NODE_PALETTE = [
  { type: "trigger", label: "Trigger", icon: Zap, color: "text-info bg-info/10 border-info/30" },
  { type: "message", label: "Message", icon: MessageSquare, color: "text-primary bg-primary/10 border-primary/30" },
  { type: "condition", label: "Condition", icon: GitBranch, color: "text-warning bg-warning/10 border-warning/30" },
  { type: "botResponse", label: "AI Response", icon: Bot, color: "text-success bg-success/10 border-success/30" },
  { type: "tool", label: "Tool Call", icon: Wrench, color: "text-accent bg-accent/10 border-accent/30" },
  { type: "handoff", label: "Handoff", icon: ArrowUpRight, color: "text-destructive bg-destructive/10 border-destructive/30" },
];

// ===================== MAIN COMPONENT =====================

interface FlowCanvasProps {
  initialConfig: { nodes?: any[]; edges?: any[] };
  onConfigChange: (config: { nodes: any[]; edges: any[] }) => void;
  onValidate?: (errors: ValidationError[]) => void;
}

export default function FlowCanvas({ initialConfig, onConfigChange, onValidate }: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showValidation, setShowValidation] = useState(false);

  const initialNodes: Node<FlowNodeData>[] = useMemo(() => {
    if (initialConfig.nodes?.length) {
      return initialConfig.nodes.map((n: any) => ({
        ...n,
        data: n.data || { label: "Node", type: n.type || "message" },
      }));
    }
    return [{
      id: "start",
      type: "trigger",
      position: { x: 250, y: 50 },
      data: { label: "Conversation Start", type: "trigger", intent: "any" },
    }];
  }, [initialConfig.nodes]);

  const initialEdges: Edge[] = useMemo(() => {
    return (initialConfig.edges || []).map((e: any) => ({
      ...e,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 2 },
      animated: true,
    }));
  }, [initialConfig.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({
      ...params,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 2 },
      animated: true,
    }, eds));
  }, [setEdges]);

  const syncConfig = useCallback(() => {
    const cleanNodes = nodes.map(({ id, type, position, data }) => ({ id, type, position, data }));
    const cleanEdges = edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, sourceHandle, targetHandle }));
    onConfigChange({ nodes: cleanNodes, edges: cleanEdges });
  }, [nodes, edges, onConfigChange]);

  const runValidation = useCallback(() => {
    const errors = validateFlow(nodes, edges);
    setValidationErrors(errors);
    setShowValidation(true);
    onValidate?.(errors);

    const errorCount = errors.filter((e) => e.type === "error").length;
    const warnCount = errors.filter((e) => e.type === "warning").length;

    if (errorCount === 0 && warnCount === 0) {
      toast.success("Flow hợp lệ! ✅");
    } else {
      toast.error(`${errorCount} lỗi, ${warnCount} cảnh báo`);
    }
    return errors;
  }, [nodes, edges, onValidate]);

  const addNode = useCallback((type: string) => {
    const id = `${type}-${Date.now()}`;
    const defaults: Record<string, Partial<FlowNodeData>> = {
      trigger: { label: "New Trigger", type: "trigger", intent: "" },
      message: { label: "Send Message", type: "message", message: "" },
      condition: { label: "Check Condition", type: "condition", condition: "" },
      botResponse: { label: "AI Response", type: "botResponse", message: "" },
      tool: { label: "Call Tool", type: "tool", toolId: "" },
      handoff: { label: "Escalate to Agent", type: "handoff", priority: "normal" },
    };
    const newNode: Node<FlowNodeData> = {
      id,
      type,
      position: { x: 250 + Math.random() * 100, y: 200 + nodes.length * 80 },
      data: { ...defaults[type], type } as FlowNodeData,
    };
    setNodes((nds) => [...nds, newNode]);
  }, [nodes, setNodes]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node as Node<FlowNodeData>);
    setSheetOpen(true);
  }, []);

  const updateNodeData = useCallback((field: string, value: string) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? { ...n, data: { ...n.data, [field]: value } }
          : n
      )
    );
    setSelectedNode((prev) =>
      prev ? { ...prev, data: { ...prev.data, [field]: value } } : null
    );
  }, [selectedNode, setNodes]);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
    setSheetOpen(false);
  }, [selectedNode, setNodes, setEdges]);

  // Highlight error nodes
  const errorNodeIds = new Set(validationErrors.filter((e) => e.nodeId).map((e) => e.nodeId));

  return (
    <div ref={reactFlowWrapper} className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onMoveEnd={syncConfig}
        onNodesDelete={syncConfig}
        onEdgesDelete={syncConfig}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        defaultEdgeOptions={{
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { strokeWidth: 2 },
          animated: true,
        }}
        className="bg-muted/20"
      >
        <Background gap={16} size={1} color="hsl(var(--border))" />
        <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground hover:[&>button]:!bg-muted" />
        <MiniMap
          className="!bg-card !border-border"
          nodeColor={(n) => {
            if (errorNodeIds.has(n.id)) return "hsl(0, 72%, 51%)";
            switch (n.type) {
              case "trigger": return "hsl(210, 92%, 55%)";
              case "message": return "hsl(173, 58%, 39%)";
              case "condition": return "hsl(38, 92%, 50%)";
              case "botResponse": return "hsl(152, 60%, 40%)";
              case "tool": return "hsl(173, 58%, 39%)";
              case "handoff": return "hsl(0, 72%, 51%)";
              default: return "hsl(var(--muted-foreground))";
            }
          }}
        />

        {/* Node Palette */}
        <Panel position="top-left" className="!m-3">
          <div className="rounded-xl border bg-card shadow-xl p-3 space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Add Node</p>
            <div className="grid grid-cols-2 gap-1.5">
              {NODE_PALETTE.map((item) => (
                <button
                  key={item.type}
                  onClick={() => addNode(item.type)}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition-all hover:shadow-md ${item.color}`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        {/* Top right: Validate + Apply */}
        <Panel position="top-right" className="!m-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-2 shadow-lg" onClick={runValidation}>
              <AlertTriangle className="h-3.5 w-3.5" />
              Validate
            </Button>
            <Button size="sm" className="gap-2 shadow-lg" onClick={syncConfig}>
              <Play className="h-3.5 w-3.5" />
              Apply
            </Button>
          </div>
        </Panel>

        {/* Validation results panel */}
        {showValidation && validationErrors.length > 0 && (
          <Panel position="bottom-left" className="!m-3">
            <div className="rounded-xl border bg-card shadow-xl p-3 max-w-xs max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Validation</p>
                <button onClick={() => setShowValidation(false)} className="text-muted-foreground hover:text-foreground">
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-1.5">
                {validationErrors.map((err, i) => (
                  <div key={i} className={`flex items-start gap-2 text-[11px] ${
                    err.type === "error" ? "text-destructive" : "text-warning"
                  }`}>
                    {err.type === "error" ? (
                      <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    )}
                    <span>{err.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        )}

        {showValidation && validationErrors.length === 0 && (
          <Panel position="bottom-left" className="!m-3">
            <div className="rounded-xl border bg-card shadow-xl p-3 max-w-xs">
              <div className="flex items-center gap-2 text-success text-xs">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">Flow hợp lệ!</span>
                <button onClick={() => setShowValidation(false)} className="ml-auto text-muted-foreground hover:text-foreground">
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>

      {/* Node properties sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-80 sm:w-96 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Node Properties
            </SheetTitle>
          </SheetHeader>

          {selectedNode && (
            <div className="space-y-5 py-6">
              <div className="space-y-2">
                <Label className="text-xs">Type</Label>
                <Badge variant="secondary" className="text-xs">{selectedNode.type}</Badge>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Label</Label>
                <Input
                  value={selectedNode.data.label}
                  onChange={(e) => updateNodeData("label", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              {(selectedNode.type === "message" || selectedNode.type === "botResponse") && (
                <div className="space-y-2">
                  <Label className="text-xs">Message Content</Label>
                  <Textarea
                    value={selectedNode.data.message || ""}
                    onChange={(e) => updateNodeData("message", e.target.value)}
                    rows={4}
                    className="text-sm"
                    placeholder="Nội dung tin nhắn..."
                  />
                </div>
              )}

              {selectedNode.type === "trigger" && (
                <div className="space-y-2">
                  <Label className="text-xs">Intent Filter</Label>
                  <Input
                    value={selectedNode.data.intent || ""}
                    onChange={(e) => updateNodeData("intent", e.target.value)}
                    className="h-9 text-sm"
                    placeholder="any, billing, support..."
                  />
                </div>
              )}

              {selectedNode.type === "condition" && (
                <div className="space-y-2">
                  <Label className="text-xs">Condition Expression</Label>
                  <Input
                    value={selectedNode.data.condition || ""}
                    onChange={(e) => updateNodeData("condition", e.target.value)}
                    className="h-9 text-sm font-mono"
                    placeholder="confidence > 0.7"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Condition node cần 2 output: kéo từ handle <span className="text-success font-bold">xanh (Yes)</span> và <span className="text-destructive font-bold">đỏ (No)</span>
                  </p>
                </div>
              )}

              {selectedNode.type === "tool" && (
                <div className="space-y-2">
                  <Label className="text-xs">Tool ID</Label>
                  <Input
                    value={selectedNode.data.toolId || ""}
                    onChange={(e) => updateNodeData("toolId", e.target.value)}
                    className="h-9 text-sm font-mono"
                    placeholder="lookup_order"
                  />
                </div>
              )}

              {selectedNode.type === "handoff" && (
                <div className="space-y-2">
                  <Label className="text-xs">Priority</Label>
                  <Select
                    value={selectedNode.data.priority || "normal"}
                    onValueChange={(v) => updateNodeData("priority", v)}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="pt-4 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full gap-2"
                  onClick={deleteSelectedNode}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Node
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
