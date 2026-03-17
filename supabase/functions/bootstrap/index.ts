import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BootstrapMode = "validate" | "bootstrap";

type BootstrapRequest = {
  mode?: BootstrapMode;
  tenant_id: string;
  rollback_on_error?: boolean;
  memory?: {
    enable_v2?: boolean;
    decay_days?: number;
    min_confidence?: number;
  };
  skills?: {
    enable_runtime?: boolean;
    packs?: Array<{
      skill_id: string;
      name: string;
      description?: string;
      version?: string;
      category?: string;
      status?: "active" | "deprecated" | "disabled";
      binding_status?: "disabled" | "test" | "active";
      pinned_version?: string;
      manifest?: Record<string, any>;
      config?: Record<string, any>;
    }>;
  };
  mcp?: {
    enable_gateway?: boolean;
    servers?: Array<{
      server_key: string;
      name: string;
      endpoint: string;
      transport?: "http" | "https" | "stdio" | "sse";
      auth_type?: "none" | "oauth" | "bearer" | "header" | "basic";
      healthcheck_path?: string;
      status?: "active" | "degraded" | "disabled";
      metadata?: Record<string, any>;
      binding?: {
        enabled?: boolean;
        priority?: number;
        timeout_ms?: number;
        retry_max?: number;
        circuit_breaker_threshold?: number;
        config?: Record<string, any>;
      };
      tool_policies?: Array<{
        tool_id: string;
        enabled?: boolean;
        pii_scope?: "none" | "masked" | "full";
        max_calls_per_minute?: number | null;
        required_roles?: string[];
        config?: Record<string, any>;
      }>;
    }>;
  };
  governance?: {
    confidence_threshold?: number;
    max_tool_retries?: number;
    prompt_injection_defense?: boolean;
    pii_masking?: boolean;
    sla_response_minutes?: number;
    sla_resolution_minutes?: number;
  };
};

class HttpError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function assertNoError(error: unknown, message: string, code: string) {
  if (error) throw new HttpError(500, message, code, error);
}

async function updateRunStatus(
  supabase: ReturnType<typeof createClient>,
  runId: string | null,
  patch: Record<string, unknown>,
) {
  if (!runId) return;
  const { error } = await supabase
    .from("tenant_bootstrap_runs")
    .update(patch)
    .eq("id", runId);

  if (error) {
    console.error("bootstrap run update error:", error);
  }
}

function normalizeRequest(input: BootstrapRequest): BootstrapRequest {
  return {
    ...input,
    mode: input.mode || "bootstrap",
    rollback_on_error: input.rollback_on_error !== false,
    memory: {
      enable_v2: input.memory?.enable_v2 ?? true,
      decay_days: input.memory?.decay_days ?? 30,
      min_confidence: input.memory?.min_confidence ?? 0.55,
    },
    skills: {
      enable_runtime: input.skills?.enable_runtime ?? true,
      packs: input.skills?.packs || [],
    },
    mcp: {
      enable_gateway: input.mcp?.enable_gateway ?? true,
      servers: input.mcp?.servers || [],
    },
    governance: {
      confidence_threshold: input.governance?.confidence_threshold ?? 0.6,
      max_tool_retries: input.governance?.max_tool_retries ?? 2,
      prompt_injection_defense: input.governance?.prompt_injection_defense ?? true,
      pii_masking: input.governance?.pii_masking ?? true,
      sla_response_minutes: input.governance?.sla_response_minutes ?? 15,
      sla_resolution_minutes: input.governance?.sla_resolution_minutes ?? 60,
    },
  };
}

function validateBootstrapPayload(payload: BootstrapRequest): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload.tenant_id) errors.push("tenant_id is required");

  if (payload.memory?.decay_days != null && payload.memory.decay_days <= 0) {
    errors.push("memory.decay_days must be > 0");
  }
  if (payload.memory?.min_confidence != null && (payload.memory.min_confidence < 0 || payload.memory.min_confidence > 1)) {
    errors.push("memory.min_confidence must be between 0 and 1");
  }

  for (const pack of payload.skills?.packs || []) {
    if (!pack.skill_id) errors.push("skills.packs[].skill_id is required");
    if (!pack.name) warnings.push(`skills pack ${pack.skill_id || "<unknown>"} missing name`);
  }

  for (const server of payload.mcp?.servers || []) {
    if (!server.server_key) errors.push("mcp.servers[].server_key is required");
    if (!server.endpoint) errors.push(`mcp server ${server.server_key || "<unknown>"} missing endpoint`);
    if (server.binding?.timeout_ms != null && server.binding.timeout_ms < 1000) {
      warnings.push(`mcp server ${server.server_key}: timeout_ms too low, recommended >= 1000`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let runId: string | null = null;
  let normalized: BootstrapRequest | null = null;

  const created = {
    skillsRegistryIds: [] as string[],
    skillBindingIds: [] as string[],
    mcpServerIds: [] as string[],
    mcpBindingIds: [] as string[],
    mcpPolicyIds: [] as string[],
  };

  let previousTenantConfig: Record<string, any> | null = null;

  try {
    const body = (await req.json()) as BootstrapRequest;
    normalized = normalizeRequest(body);

    const validation = validateBootstrapPayload(normalized);
    if (!validation.ok) {
      return jsonResponse(400, { ...validation, ok: false, error: validation.errors.join("; ") });
    }

    const mode = normalized.mode || "bootstrap";

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, slug, status")
      .eq("id", normalized.tenant_id)
      .maybeSingle();

    assertNoError(tenantError, "Failed to load tenant", "tenant_lookup_failed");
    if (!tenant) {
      return jsonResponse(404, { ok: false, error: "tenant not found", code: "tenant_not_found", errors: ["tenant not found"], warnings: [] });
    }

    const { data: run, error: runInsertError } = await supabase
      .from("tenant_bootstrap_runs")
      .insert({
        tenant_id: normalized.tenant_id,
        mode,
        status: "started",
        request: normalized,
      })
      .select("id")
      .single();

    assertNoError(runInsertError, "Failed to create bootstrap run record", "bootstrap_run_insert_failed");
    runId = run?.id || null;

    if (mode === "validate") {
      const { data: existingSkillBindings, error: skillBindingsError } = await supabase
        .from("tenant_skill_bindings")
        .select("id")
        .eq("tenant_id", normalized.tenant_id);
      assertNoError(skillBindingsError, "Failed to inspect existing tenant skill bindings", "skill_bindings_lookup_failed");

      const { data: existingMcpBindings, error: mcpBindingsError } = await supabase
        .from("tenant_mcp_bindings")
        .select("id")
        .eq("tenant_id", normalized.tenant_id);
      assertNoError(mcpBindingsError, "Failed to inspect existing tenant MCP bindings", "mcp_bindings_lookup_failed");

      const plan = {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status },
        memory: {
          enable_v2: normalized.memory?.enable_v2,
          decay_days: normalized.memory?.decay_days,
          min_confidence: normalized.memory?.min_confidence,
        },
        skills: {
          runtime_enabled: normalized.skills?.enable_runtime,
          incoming_packs: normalized.skills?.packs?.length || 0,
          existing_bindings: existingSkillBindings?.length || 0,
        },
        mcp: {
          gateway_enabled: normalized.mcp?.enable_gateway,
          incoming_servers: normalized.mcp?.servers?.length || 0,
          existing_bindings: existingMcpBindings?.length || 0,
        },
        governance: normalized.governance,
      };

      await updateRunStatus(supabase, runId, {
        status: "validated",
        result: { validation, plan },
        finished_at: new Date().toISOString(),
      });

      return jsonResponse(200, { ...validation, ok: true, plan });
    }

    const { data: existingConfig, error: configError } = await supabase
      .from("tenant_configs")
      .select("*")
      .eq("tenant_id", normalized.tenant_id)
      .maybeSingle();
    assertNoError(configError, "Failed to load tenant config", "tenant_config_lookup_failed");

    previousTenantConfig = existingConfig || null;

    const configPatch = {
      memory_v2_enabled: normalized.memory?.enable_v2,
      memory_decay_days: normalized.memory?.decay_days,
      memory_min_confidence: normalized.memory?.min_confidence,
      skills_runtime_enabled: normalized.skills?.enable_runtime,
      mcp_gateway_enabled: normalized.mcp?.enable_gateway,
      confidence_threshold: normalized.governance?.confidence_threshold,
      max_tool_retries: normalized.governance?.max_tool_retries,
      prompt_injection_defense: normalized.governance?.prompt_injection_defense,
      pii_masking: normalized.governance?.pii_masking,
      sla_response_minutes: normalized.governance?.sla_response_minutes,
      sla_resolution_minutes: normalized.governance?.sla_resolution_minutes,
    };

    if (existingConfig) {
      const { error } = await supabase.from("tenant_configs").update(configPatch).eq("tenant_id", normalized.tenant_id);
      assertNoError(error, "Failed to update tenant config", "tenant_config_update_failed");
    } else {
      const { error } = await supabase.from("tenant_configs").insert({ tenant_id: normalized.tenant_id, ...configPatch });
      assertNoError(error, "Failed to create tenant config", "tenant_config_insert_failed");
    }

    for (const pack of normalized.skills?.packs || []) {
      const { data: existingRegistry, error: existingRegistryError } = await supabase
        .from("skills_registry")
        .select("id, version")
        .eq("skill_id", pack.skill_id)
        .maybeSingle();
      assertNoError(existingRegistryError, `Failed to inspect skill registry for ${pack.skill_id}`, "skill_registry_lookup_failed");

      let skillRegistryId = existingRegistry?.id || null;
      if (!skillRegistryId) {
        const { data: insertedRegistry, error } = await supabase
          .from("skills_registry")
          .insert({
            skill_id: pack.skill_id,
            name: pack.name || pack.skill_id,
            description: pack.description || null,
            version: pack.version || "1.0.0",
            category: pack.category || null,
            status: pack.status || "active",
            manifest: pack.manifest || {},
          })
          .select("id")
          .single();
        assertNoError(error, `Failed to create skill registry for ${pack.skill_id}`, "skill_registry_insert_failed");
        skillRegistryId = insertedRegistry?.id || null;
        if (skillRegistryId) created.skillsRegistryIds.push(skillRegistryId);
      }

      if (!skillRegistryId) throw new HttpError(500, `Failed to resolve skills_registry for ${pack.skill_id}`, "skill_registry_missing");

      const { data: existingBinding, error: existingBindingError } = await supabase
        .from("tenant_skill_bindings")
        .select("id")
        .eq("tenant_id", normalized.tenant_id)
        .eq("skill_registry_id", skillRegistryId)
        .maybeSingle();
      assertNoError(existingBindingError, `Failed to inspect skill binding for ${pack.skill_id}`, "skill_binding_lookup_failed");

      const { data: skillBinding, error: bindError } = await supabase
        .from("tenant_skill_bindings")
        .upsert({
          tenant_id: normalized.tenant_id,
          skill_registry_id: skillRegistryId,
          status: pack.binding_status || "test",
          pinned_version: pack.pinned_version || pack.version || existingRegistry?.version || "1.0.0",
          config: pack.config || {},
        }, { onConflict: "tenant_id,skill_registry_id" })
        .select("id")
        .single();
      assertNoError(bindError, `Failed to upsert skill binding for ${pack.skill_id}`, "skill_binding_upsert_failed");
      if (!existingBinding?.id && skillBinding?.id) created.skillBindingIds.push(skillBinding.id);
    }

    for (const server of normalized.mcp?.servers || []) {
      const { data: existingServer, error: existingServerError } = await supabase
        .from("mcp_servers")
        .select("id")
        .eq("server_key", server.server_key)
        .maybeSingle();
      assertNoError(existingServerError, `Failed to inspect MCP server ${server.server_key}`, "mcp_server_lookup_failed");

      let serverId = existingServer?.id || null;
      if (!serverId) {
        const { data: insertedServer, error } = await supabase
          .from("mcp_servers")
          .insert({
            server_key: server.server_key,
            name: server.name,
            endpoint: server.endpoint,
            transport: server.transport || "http",
            auth_type: server.auth_type || "none",
            healthcheck_path: server.healthcheck_path || null,
            status: server.status || "active",
            metadata: server.metadata || {},
          })
          .select("id")
          .single();
        assertNoError(error, `Failed to create MCP server ${server.server_key}`, "mcp_server_insert_failed");
        serverId = insertedServer?.id || null;
        if (serverId) created.mcpServerIds.push(serverId);
      }

      if (!serverId) throw new HttpError(500, `Failed to resolve mcp_server ${server.server_key}`, "mcp_server_missing");

      const { data: existingBinding, error: existingMcpBindingError } = await supabase
        .from("tenant_mcp_bindings")
        .select("id")
        .eq("tenant_id", normalized.tenant_id)
        .eq("mcp_server_id", serverId)
        .maybeSingle();
      assertNoError(existingMcpBindingError, `Failed to inspect MCP binding for ${server.server_key}`, "mcp_binding_lookup_failed");

      const { data: binding, error: bindingError } = await supabase
        .from("tenant_mcp_bindings")
        .upsert({
          tenant_id: normalized.tenant_id,
          mcp_server_id: serverId,
          enabled: server.binding?.enabled ?? true,
          priority: server.binding?.priority ?? 100,
          timeout_ms: server.binding?.timeout_ms ?? 15000,
          retry_max: server.binding?.retry_max ?? 1,
          circuit_breaker_threshold: server.binding?.circuit_breaker_threshold ?? 5,
          config: server.binding?.config || {},
        }, { onConflict: "tenant_id,mcp_server_id" })
        .select("id")
        .single();
      assertNoError(bindingError, `Failed to upsert MCP binding for ${server.server_key}`, "mcp_binding_upsert_failed");
      if (!existingBinding?.id && binding?.id) created.mcpBindingIds.push(binding.id);

      for (const policy of server.tool_policies || []) {
        const { data: existingPolicy, error: existingPolicyError } = await supabase
          .from("mcp_tool_policies")
          .select("id")
          .eq("tenant_id", normalized.tenant_id)
          .eq("tool_id", policy.tool_id)
          .maybeSingle();
        assertNoError(existingPolicyError, `Failed to inspect MCP tool policy ${policy.tool_id}`, "mcp_policy_lookup_failed");

        const { data: policyRow, error: policyError } = await supabase
          .from("mcp_tool_policies")
          .upsert({
            tenant_id: normalized.tenant_id,
            tenant_mcp_binding_id: binding?.id || null,
            tool_id: policy.tool_id,
            enabled: policy.enabled ?? true,
            pii_scope: policy.pii_scope || "masked",
            max_calls_per_minute: policy.max_calls_per_minute ?? null,
            required_roles: (policy.required_roles || []) as any,
            config: policy.config || {},
          }, { onConflict: "tenant_id,tool_id" })
          .select("id")
          .single();
        assertNoError(policyError, `Failed to upsert MCP tool policy ${policy.tool_id}`, "mcp_policy_upsert_failed");
        if (!existingPolicy?.id && policyRow?.id) created.mcpPolicyIds.push(policyRow.id);
      }
    }

    const result = {
      tenant_id: normalized.tenant_id,
      configured: {
        memory_v2_enabled: normalized.memory?.enable_v2,
        skills_runtime_enabled: normalized.skills?.enable_runtime,
        mcp_gateway_enabled: normalized.mcp?.enable_gateway,
      },
      created,
      warnings: validation.warnings,
    };

    await updateRunStatus(supabase, runId, {
      status: "completed",
      result,
      finished_at: new Date().toISOString(),
    });

    return jsonResponse(200, { ok: true, result });
  } catch (error) {
    console.error("bootstrap error:", error);

    const appError = error instanceof HttpError
      ? error
      : new HttpError(500, error instanceof Error ? error.message : "Unknown error", "bootstrap_failed", error);

    if (normalized?.rollback_on_error) {
      try {
        if (created.mcpPolicyIds.length) {
          const { error } = await supabase.from("mcp_tool_policies").delete().in("id", created.mcpPolicyIds);
          assertNoError(error, "Failed to rollback MCP tool policies", "rollback_mcp_policies_failed");
        }
        if (created.mcpBindingIds.length) {
          const { error } = await supabase.from("tenant_mcp_bindings").delete().in("id", created.mcpBindingIds);
          assertNoError(error, "Failed to rollback MCP bindings", "rollback_mcp_bindings_failed");
        }
        if (created.mcpServerIds.length) {
          const { error } = await supabase.from("mcp_servers").delete().in("id", created.mcpServerIds);
          assertNoError(error, "Failed to rollback MCP servers", "rollback_mcp_servers_failed");
        }
        if (created.skillBindingIds.length) {
          const { error } = await supabase.from("tenant_skill_bindings").delete().in("id", created.skillBindingIds);
          assertNoError(error, "Failed to rollback skill bindings", "rollback_skill_bindings_failed");
        }
        if (created.skillsRegistryIds.length) {
          const { error } = await supabase.from("skills_registry").delete().in("id", created.skillsRegistryIds);
          assertNoError(error, "Failed to rollback skills registry rows", "rollback_skill_registry_failed");
        }

        if (normalized?.tenant_id && previousTenantConfig) {
          const { error } = await supabase.from("tenant_configs").update(previousTenantConfig).eq("tenant_id", normalized.tenant_id);
          assertNoError(error, "Failed to rollback tenant config", "rollback_tenant_config_failed");
        }

        await updateRunStatus(supabase, runId, {
          status: "rolled_back",
          error_message: appError.message,
          result: { rollback: true, created },
          finished_at: new Date().toISOString(),
        });
      } catch (rollbackError) {
        console.error("bootstrap rollback error:", rollbackError);
      }
    }

    await updateRunStatus(supabase, runId, {
      status: "failed",
      error_message: appError.message,
      result: { rollback_attempted: normalized?.rollback_on_error !== false, created },
      finished_at: new Date().toISOString(),
    });

    return jsonResponse(appError.status, {
      ok: false,
      error: appError.message,
      code: appError.code,
      details: appError.details,
      rollback_attempted: normalized?.rollback_on_error !== false,
      created,
    });
  }
});
