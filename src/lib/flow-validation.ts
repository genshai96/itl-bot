import type { Node, Edge } from "@xyflow/react";

export interface ValidationError {
  nodeId?: string;
  type: "error" | "warning";
  message: string;
}

export function validateFlow(nodes: Node[], edges: Edge[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Must have at least 1 trigger
  const triggers = nodes.filter((n) => n.type === "trigger");
  if (triggers.length === 0) {
    errors.push({ type: "error", message: "Flow phải có ít nhất 1 node Trigger" });
  }

  // 2. All non-trigger nodes must have at least 1 incoming edge
  const targetIds = new Set(edges.map((e) => e.target));
  for (const node of nodes) {
    if (node.type === "trigger") continue;
    if (!targetIds.has(node.id)) {
      errors.push({
        nodeId: node.id,
        type: "error",
        message: `"${node.data?.label || node.id}" không được kết nối (thiếu incoming edge)`,
      });
    }
  }

  // 3. All non-terminal nodes should have at least 1 outgoing edge
  const sourceIds = new Set(edges.map((e) => e.source));
  const terminalTypes = new Set(["handoff"]);
  for (const node of nodes) {
    if (terminalTypes.has(node.type || "")) continue;
    if (!sourceIds.has(node.id)) {
      errors.push({
        nodeId: node.id,
        type: "warning",
        message: `"${node.data?.label || node.id}" không có outgoing edge (dead end)`,
      });
    }
  }

  // 4. Condition nodes must have both "yes" and "no" outputs
  const conditionNodes = nodes.filter((n) => n.type === "condition");
  for (const cond of conditionNodes) {
    const outEdges = edges.filter((e) => e.source === cond.id);
    const hasYes = outEdges.some((e) => e.sourceHandle === "yes");
    const hasNo = outEdges.some((e) => e.sourceHandle === "no");
    if (!hasYes || !hasNo) {
      const missing = !hasYes && !hasNo ? "Yes và No" : !hasYes ? "Yes" : "No";
      errors.push({
        nodeId: cond.id,
        type: "error",
        message: `Condition "${cond.data?.label || cond.id}" thiếu output: ${missing}`,
      });
    }
  }

  // 5. Check for isolated subgraphs (nodes not reachable from any trigger)
  if (triggers.length > 0 && nodes.length > 1) {
    const reachable = new Set<string>();
    const queue = triggers.map((t) => t.id);
    reachable.add(...queue);
    while (queue.length > 0) {
      const current = queue.shift()!;
      reachable.add(current);
      for (const edge of edges) {
        if (edge.source === current && !reachable.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }
    for (const node of nodes) {
      if (!reachable.has(node.id) && node.type !== "trigger") {
        // Already covered by "no incoming edge" check, skip duplicate
      }
    }
  }

  return errors;
}

// AI Flow generation templates
export const FLOW_TEMPLATES = [
  {
    id: "customer-support",
    name: "Customer Support",
    description: "Luồng hỗ trợ khách hàng cơ bản: chào hỏi → phân loại intent → tra cứu KB → trả lời hoặc chuyển agent",
    config: {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 300, y: 30 }, data: { label: "Khách hàng gửi tin", type: "trigger", intent: "any" } },
        { id: "m1", type: "message", position: { x: 300, y: 150 }, data: { label: "Chào mừng", type: "message", message: "Xin chào! Tôi có thể giúp gì cho bạn?" } },
        { id: "b1", type: "botResponse", position: { x: 300, y: 280 }, data: { label: "Phân tích intent", type: "botResponse", message: "Phân tích câu hỏi và tra cứu Knowledge Base" } },
        { id: "c1", type: "condition", position: { x: 300, y: 420 }, data: { label: "Confidence đủ?", type: "condition", condition: "confidence > 0.7" } },
        { id: "b2", type: "botResponse", position: { x: 100, y: 570 }, data: { label: "Trả lời từ KB", type: "botResponse", message: "Trả lời dựa trên dữ liệu Knowledge Base" } },
        { id: "h1", type: "handoff", position: { x: 500, y: 570 }, data: { label: "Chuyển Agent", type: "handoff", priority: "normal" } },
      ],
      edges: [
        { id: "e1", source: "t1", target: "m1" },
        { id: "e2", source: "m1", target: "b1" },
        { id: "e3", source: "b1", target: "c1" },
        { id: "e4", source: "c1", target: "b2", sourceHandle: "yes" },
        { id: "e5", source: "c1", target: "h1", sourceHandle: "no" },
      ],
    },
  },
  {
    id: "order-lookup",
    name: "Order Lookup",
    description: "Tra cứu đơn hàng: trigger → hỏi mã đơn → gọi tool lookup → hiển thị kết quả hoặc escalate",
    config: {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 300, y: 30 }, data: { label: "Intent: tra cứu đơn", type: "trigger", intent: "order_lookup" } },
        { id: "m1", type: "message", position: { x: 300, y: 150 }, data: { label: "Hỏi mã đơn hàng", type: "message", message: "Vui lòng cho tôi biết mã đơn hàng của bạn" } },
        { id: "tool1", type: "tool", position: { x: 300, y: 280 }, data: { label: "Tra cứu đơn hàng", type: "tool", toolId: "lookup_order" } },
        { id: "c1", type: "condition", position: { x: 300, y: 420 }, data: { label: "Tìm thấy?", type: "condition", condition: "tool_result.found === true" } },
        { id: "b1", type: "botResponse", position: { x: 100, y: 570 }, data: { label: "Hiển thị thông tin", type: "botResponse", message: "Đây là thông tin đơn hàng của bạn..." } },
        { id: "h1", type: "handoff", position: { x: 500, y: 570 }, data: { label: "Chuyển hỗ trợ", type: "handoff", priority: "high" } },
      ],
      edges: [
        { id: "e1", source: "t1", target: "m1" },
        { id: "e2", source: "m1", target: "tool1" },
        { id: "e3", source: "tool1", target: "c1" },
        { id: "e4", source: "c1", target: "b1", sourceHandle: "yes" },
        { id: "e5", source: "c1", target: "h1", sourceHandle: "no" },
      ],
    },
  },
  {
    id: "lead-qualification",
    name: "Lead Qualification",
    description: "Đánh giá lead: thu thập thông tin → phân loại → chuyển sales hoặc gửi tài liệu",
    config: {
      nodes: [
        { id: "t1", type: "trigger", position: { x: 300, y: 30 }, data: { label: "Khách mới truy cập", type: "trigger", intent: "any" } },
        { id: "m1", type: "message", position: { x: 300, y: 150 }, data: { label: "Chào & hỏi nhu cầu", type: "message", message: "Chào bạn! Bạn đang quan tâm đến sản phẩm/dịch vụ nào?" } },
        { id: "b1", type: "botResponse", position: { x: 300, y: 280 }, data: { label: "Phân tích nhu cầu", type: "botResponse", message: "Đánh giá mức độ quan tâm và nhu cầu của khách" } },
        { id: "c1", type: "condition", position: { x: 300, y: 420 }, data: { label: "Lead nóng?", type: "condition", condition: "lead_score > 70" } },
        { id: "h1", type: "handoff", position: { x: 100, y: 570 }, data: { label: "Chuyển Sales", type: "handoff", priority: "high" } },
        { id: "b2", type: "botResponse", position: { x: 500, y: 570 }, data: { label: "Gửi tài liệu", type: "botResponse", message: "Gửi brochure và lịch hẹn demo tự động" } },
      ],
      edges: [
        { id: "e1", source: "t1", target: "m1" },
        { id: "e2", source: "m1", target: "b1" },
        { id: "e3", source: "b1", target: "c1" },
        { id: "e4", source: "c1", target: "h1", sourceHandle: "yes" },
        { id: "e5", source: "c1", target: "b2", sourceHandle: "no" },
      ],
    },
  },
];
