# Gap Analysis & Todo List (PRD v1.1 vs Current Codebase) — Revised

## Hiện trạng: Đã có gì?

Codebase hiện tại **đã triển khai được rất nhiều** so với PRD v1.0, cụ thể:

### ✅ Database (Supabase PostgreSQL + pgvector)
| Bảng PRD | Trạng thái | Ghi chú |
|---|---|---|
| `tenants` | ✅ Có | Đầy đủ, có RLS |
| `tenant_configs` | ✅ Có | AI provider, widget, security policy |
| `profiles` / `user_roles` | ✅ Có | RBAC theo `app_role` enum, multi-tenant |
| `conversations` / `messages` | ✅ Có | Có intent, confidence, metadata |
| `conversation_labels` | ✅ Có | Auto-label + manual |
| `kb_documents` / `kb_chunks` | ✅ Có | pgvector embedding 1536 |
| `tool_definitions` / `tool_call_logs` | ✅ Có | Schema + logs |
| `handoff_events` | ✅ Có | Priority, status, assigned_to |
| `audit_logs` | ✅ Có | Actor type, resource tracking |
| `flow_definitions` / `flow_versions` | ✅ Có | JSON config, versioning, publish |
| `bot_memory` | ✅ Có | 6 categories (rule, correction, fact, personality, skill, constraint) |
| `notifications` | ✅ Có | — |

### ✅ Frontend (Vite + React + Shadcn/ui + TailwindCSS)
| Module PRD | Trang/Component | Trạng thái |
|---|---|---|
| F-005 Label & Conversation | `Conversations.tsx` | ✅ Có |
| F-006 Tenant Config | `TenantDetail.tsx`, `Settings.tsx` | ✅ Có |
| F-007 Flow Builder | `FlowBuilder.tsx` + `FlowCanvas.tsx` | ✅ Có (ReactFlow visual editor, AI gen, templates, versioning) |
| F-003 Tool Calling | `ToolManager.tsx` | ✅ Có (CRUD + AI generate) |
| F-004 Handoff | `HandoffQueue.tsx` | ✅ Có |
| F-008 Observability | `Analytics.tsx`, `AuditLogs.tsx`, `Dashboard.tsx` | ✅ Có |
| F-009 Memory | `BotMemory.tsx` + `BotMemoryPanel.tsx` | ✅ Có (CRUD 6 categories, enable/disable, priority) |
| Admin: Agents | `Agents.tsx` | ✅ Có |
| KB Management | `KnowledgeBase.tsx` | ✅ Có |
| Widget Demo | `WidgetDemo.tsx` | ✅ Có |

### ✅ Backend (10 Supabase Edge Functions)
`chat`, `chat-stream`, `create-operator`, `extract-file-content`, `fetch-models`, `generate-embeddings`, `generate-flow`, `generate-tools`, `process-document`, `widget-config`

### ✅ Security
- RLS trên **mọi bảng** theo `tenant_id`
- Helper functions: `has_role()`, `is_system_admin()`, `is_tenant_member()`
- Supabase Auth + RBAC enum (`system_admin`, `tenant_admin`, `support_lead`, `support_agent`, `end_user`)

---

## Đánh Giá: Có nên triển khai v1.1 không?

**RẤT NÊN**, nhưng phạm vi thực sự cần làm **nhỏ hơn rất nhiều** so với ban đầu tưởng, vì phần nền tảng (DB core, UI, Auth, RAG) đã xong.

Giá trị lớn nhất của v1.1 nằm ở 2 thứ:
1. **Memory-first pipeline:** Bot tự động trích xuất và nhớ lại thông tin qua từng session (hiện tại `bot_memory` chỉ là CRUD thủ công, chưa có auto-extraction/recall).
2. **MCP Gateway chuẩn hóa:** Thay vì tool gọi trực tiếp endpoint, chuyển qua lớp gateway có health check, circuit breaker, audit.

---

## Gaps thực tế & Todo List

### Gap 1: Memory Schema thiếu các trường v1.1
Bảng `bot_memory` hiện tại là **flat CRUD** (title + content + category), chưa có:
- [ ] `confidence`, `importance`, `pii_level` trên từng item
- [ ] `valid_from`, `valid_to` (hỗ trợ memory decay)
- [ ] `user_id` (memory hiện tại chỉ theo tenant, chưa theo từng end-user)
- [ ] Bảng `memory_summaries` (tóm tắt memory tự động)
- [ ] Bảng `memory_conflicts` (xử lý fact mâu thuẫn)
- [ ] Bảng `memory_access_logs` (audit riêng cho memory read/write)

**Hành động:** Viết migration ALTER `bot_memory` thêm cột + tạo các bảng phụ.

### Gap 2: Memory Extraction & Recall (Backend Logic)
Hiện tại bot `chat` Edge Function chưa có pipeline:
- [ ] **Auto-extract memory** sau mỗi lượt chat (trích xuất fact/preference từ hội thoại)
- [ ] **Memory recall** trước khi prompt LLM (ranking: relevance × recency × importance × confidence)
- [ ] **Memory decay** worker (TTL cho episodic, slow decay cho semantic)
- [ ] **Conflict resolution** logic (khi fact mới mâu thuẫn fact cũ)

**Hành động:** Cập nhật `chat` / `chat-stream` Edge Function để tích hợp recall → generate → extract pipeline.

### Gap 3: MCP Gateway & Skill Registry (thiếu hoàn toàn)
Hiện tại `tool_definitions` gọi trực tiếp endpoint, chưa có lớp MCP:
- [ ] Bảng `mcp_servers`, `tenant_mcp_bindings`, `mcp_tool_policies`
- [ ] Bảng `skills_registry`, `tenant_skill_bindings`
- [ ] Edge Function/Service: MCP Gateway (route, health check, circuit breaker)
- [ ] Edge Function/Service: Skill Runtime (execute skill theo tenant config)

**Hành động:** Tạo migration + Edge Functions mới.

### Gap 4: Tenant Bootstrap Automation
Hiện tại tạo tenant manual, chưa có:
- [ ] `POST /bootstrap` API tự động khởi tạo (memory policy, skill pack, MCP binding, RBAC defaults)
- [ ] Validation endpoint `/bootstrap/validate`

**Hành động:** Viết Edge Function `bootstrap-tenant`.

### Gap 5: Memory & MCP Admin UI
Frontend đang thiếu UI cho:
- [ ] Xem/quản lý Memory per User (hiện chỉ per Tenant)
- [ ] Dashboard Memory Metrics (consistency rate, precision@k, drift rate)
- [ ] MCP Connection Manager (bind/unbind MCP servers, health status)
- [ ] Skill Registry browser (bật/tắt skill, version pinning)

**Hành động:** Thêm components mới vào `src/components/` và trang mới hoặc tab mới.

### Gap 6: Handoff Logic Backend
Bảng + UI có rồi, nhưng thiếu:
- [ ] Auto-trigger logic trong `chat` Edge Function (low confidence → create handoff)
- [ ] SLA tracking (thời gian phản hồi)

---

## Lộ Trình Ưu Tiên

| Ưu tiên | Việc | Giá trị | Effort |
|---|---|---|---|
| 🔴 P0 | **Gap 1 + Gap 2:** Nâng cấp Memory schema + tích hợp extraction/recall vào chat pipeline | Bot thông minh hơn ngay lập tức, nhớ context cross-session | Medium |
| 🟠 P1 | **Gap 6:** Auto-trigger handoff trong chat | Giảm case bot trả lời sai khi không tự tin | Low |
| 🟡 P2 | **Gap 3:** MCP Gateway + Skill Registry | Chuẩn hóa tool calling, an toàn hơn | High |
| 🟢 P3 | **Gap 4:** Tenant Bootstrap | Tự động hóa onboarding tenant mới | Medium |
| 🔵 P4 | **Gap 5:** Admin UI cho Memory/MCP | Quản trị tốt hơn, nhưng chưa cần ngay | Medium |
