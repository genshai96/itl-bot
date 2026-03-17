import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function toHttpError(error: unknown, fallbackStatus = 500): HttpError {
  if (error instanceof HttpError) return error;

  if (error && typeof error === "object") {
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : fallbackStatus;
    const message = typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "Unknown error";
    const code = typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : undefined;

    return new HttpError(status, message, code, error);
  }

  return new HttpError(fallbackStatus, error instanceof Error ? error.message : "Unknown error");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function ensureProfile(adminClient: ReturnType<typeof createClient>, userId: string, displayName: string, email: string) {
  const { error } = await adminClient
    .from("profiles")
    .upsert({
      user_id: userId,
      display_name: displayName || email.split("@")[0],
    }, { onConflict: "user_id" });

  if (error) {
    throw new HttpError(500, "Failed to ensure profile for operator", "profile_upsert_failed", error);
  }
}

async function upsertUserRole(adminClient: ReturnType<typeof createClient>, userId: string, role: string, tenantId: string) {
  const { data: existingRole, error: existingRoleError } = await adminClient
    .from("user_roles")
    .select("id, role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existingRoleError) {
    throw new HttpError(500, "Failed to inspect existing tenant role", "role_lookup_failed", existingRoleError);
  }

  if (existingRole?.id) {
    const { error: updateError } = await adminClient
      .from("user_roles")
      .update({ role })
      .eq("id", existingRole.id);

    if (updateError) {
      throw new HttpError(500, "Failed to update operator role", "role_update_failed", updateError);
    }

    return { roleId: existingRole.id, operation: "updated" as const };
  }

  const { data: insertedRole, error: insertError } = await adminClient
    .from("user_roles")
    .insert({ user_id: userId, role, tenant_id: tenantId })
    .select("id")
    .single();

  if (insertError) {
    throw new HttpError(500, "Failed to assign operator role", "role_insert_failed", insertError);
  }

  return { roleId: insertedRole?.id ?? null, operation: "created" as const };
}

async function findAuthUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  let page = 1;
  const normalizedEmail = normalizeEmail(email);

  while (page <= 10) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      throw new HttpError(500, "Failed to search existing auth users", "auth_user_lookup_failed", error);
    }

    const found = data?.users?.find((user) => normalizeEmail(user.email || "") === normalizedEmail) || null;
    if (found) return found;

    if (!data?.users?.length || data.users.length < 1000) break;
    page += 1;
  }

  return null;
}

async function getOrCreateAuthUser({
  adminClient,
  email,
  password,
  displayName,
  emailConfirm,
}: {
  adminClient: ReturnType<typeof createClient>;
  email: string;
  password?: string;
  displayName: string;
  emailConfirm: boolean;
}) {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: emailConfirm,
    user_metadata: { display_name: displayName || email.split("@")[0] },
  });

  if (!error && data?.user) {
    return { user: data.user, created: true };
  }

  const message = error?.message || "";
  const alreadyExists = /already.*registered|already.*exists|user.*exists/i.test(message);

  if (!alreadyExists) {
    throw new HttpError(400, message || "Failed to create operator", error?.code, error);
  }

  const existingUser = await findAuthUserByEmail(adminClient, email);
  if (!existingUser) {
    throw new HttpError(409, "Operator already exists but could not be resolved", "user_exists_unresolved", error);
  }

  return { user: existingUser, created: false };
}

async function verifyAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "Missing authorization", "missing_authorization");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    throw new HttpError(500, "Supabase environment is not configured correctly", "missing_env");
  }

  const adminClient = createClient(supabaseUrl, serviceKey);

  // Extract JWT from "Bearer <token>" and verify it directly via admin client.
  // This is more reliable than creating a callerClient with global headers, which
  // can fail if the session is not found in storage (server-side has no storage).
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: authData, error: authError } = await adminClient.auth.getUser(jwt);
  if (authError) {
    throw new HttpError(401, authError.message || "Invalid session", "invalid_jwt", authError);
  }

  const caller = authData?.user;
  if (!caller) throw new HttpError(401, "Unauthorized", "unauthorized");

  const { data: callerRoles, error: rolesError } = await adminClient
    .from("user_roles")
    .select("role, tenant_id")
    .eq("user_id", caller.id);

  if (rolesError) {
    throw new HttpError(500, "Failed to load caller roles", "caller_roles_failed", rolesError);
  }

  const isSystemAdmin = callerRoles?.some((r: any) => r.role === "system_admin") ?? false;
  const adminTenantIds = callerRoles
    ?.filter((r: any) => r.role === "tenant_admin")
    .map((r: any) => r.tenant_id)
    .filter(Boolean) || [];

  if (!isSystemAdmin && adminTenantIds.length === 0) {
    throw new HttpError(403, "Insufficient permissions", "insufficient_permissions");
  }

  return { caller, adminClient, isSystemAdmin, adminTenantIds, supabaseUrl };
}

function checkTenantAccess(isSystemAdmin: boolean, adminTenantIds: string[], tenantId: string | null | undefined) {
  if (!tenantId) return;
  if (!isSystemAdmin && !adminTenantIds.includes(tenantId)) {
    throw new HttpError(403, "No access to this tenant", "tenant_access_denied", { tenantId });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { adminClient, isSystemAdmin, adminTenantIds, supabaseUrl } = await verifyAdmin(req);
    const body = await req.json();
    const { action = "create" } = body;

    if (action === "create") {
      const email = normalizeEmail(body.email || "");
      const password = typeof body.password === "string" ? body.password : undefined;
      const displayName = (body.displayName || email.split("@")[0] || "").trim();
      const role = body.role;
      const tenantId = body.tenantId;
      const mode = body.mode === "invite" ? "invite" : "direct";

      if (!email || !role || !tenantId) {
        throw new HttpError(400, "Missing required fields", "missing_required_fields");
      }

      checkTenantAccess(isSystemAdmin, adminTenantIds, tenantId);

      if (mode === "direct" && (!password || password.length < 6)) {
        throw new HttpError(400, "Password must be at least 6 characters", "invalid_password");
      }

      const { user, created } = await getOrCreateAuthUser({
        adminClient,
        email,
        password,
        displayName,
        emailConfirm: mode === "direct",
      });

      await ensureProfile(adminClient, user.id, displayName, email);
      const roleResult = await upsertUserRole(adminClient, user.id, role, tenantId);

      if (mode === "invite") {
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo: `${req.headers.get("origin") || supabaseUrl}/reset-password` },
        });

        if (linkError) {
          throw new HttpError(500, `Operator ${created ? "created" : "updated"}, but invite link generation failed: ${linkError.message}`, "invite_link_failed", linkError);
        }

        return jsonResponse(created ? 200 : 200, {
          ok: true,
          success: true,
          mode: "invite",
          created,
          userId: user.id,
          roleAssignment: roleResult.operation,
          inviteLink: linkData?.properties?.action_link || null,
          message: created ? "Operator invited successfully" : "Existing operator linked to tenant and invite regenerated",
        });
      }

      return jsonResponse(200, {
        ok: true,
        success: true,
        mode: "direct",
        created,
        userId: user.id,
        roleAssignment: roleResult.operation,
        message: created ? "Operator created successfully" : "Existing operator linked to tenant successfully",
      });
    }

    if (action === "update_role") {
      const { roleId, newRole, tenantId } = body;
      if (!roleId || !newRole) throw new HttpError(400, "Missing roleId or newRole", "missing_required_fields");
      if (tenantId) checkTenantAccess(isSystemAdmin, adminTenantIds, tenantId);

      const { error } = await adminClient
        .from("user_roles")
        .update({ role: newRole })
        .eq("id", roleId);

      if (error) throw new HttpError(500, "Failed to update operator role", "role_update_failed", error);

      return jsonResponse(200, { ok: true, success: true, message: "Role updated successfully" });
    }

    if (action === "resend_invite") {
      const { userId, tenantId } = body;
      if (!userId) throw new HttpError(400, "Missing userId", "missing_required_fields");
      if (tenantId) checkTenantAccess(isSystemAdmin, adminTenantIds, tenantId);

      const { data: userData, error: userErr } = await adminClient.auth.admin.getUserById(userId);
      if (userErr || !userData?.user) {
        throw new HttpError(404, "User not found", "user_not_found", userErr);
      }

      const email = userData.user.email;
      if (!email) throw new HttpError(400, "User email is missing", "missing_user_email");

      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: `${req.headers.get("origin") || supabaseUrl}/reset-password` },
      });
      if (linkErr) throw new HttpError(500, "Failed to generate invite link", "invite_link_failed", linkErr);

      return jsonResponse(200, {
        ok: true,
        success: true,
        inviteLink: linkData?.properties?.action_link || null,
        message: "Invite link regenerated successfully",
      });
    }

    if (action === "reset_password") {
      const { userId, tenantId } = body;
      if (!userId) throw new HttpError(400, "Missing userId", "missing_required_fields");
      if (tenantId) checkTenantAccess(isSystemAdmin, adminTenantIds, tenantId);

      const { data: userData, error: userErr } = await adminClient.auth.admin.getUserById(userId);
      if (userErr || !userData?.user) {
        throw new HttpError(404, "User not found", "user_not_found", userErr);
      }

      const email = userData.user.email;
      if (!email) throw new HttpError(400, "User email is missing", "missing_user_email");

      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${req.headers.get("origin") || supabaseUrl}/reset-password` },
      });

      if (linkErr) {
        throw new HttpError(500, "Failed to generate password reset link", "reset_password_failed", linkErr);
      }

      return jsonResponse(200, {
        ok: true,
        success: true,
        resetLink: linkData?.properties?.action_link || null,
        message: "Password reset email prepared successfully",
      });
    }

    if (action === "delete") {
      const { roleId, userId, deleteUser, tenantId } = body;
      if (!roleId) throw new HttpError(400, "Missing roleId", "missing_required_fields");
      if (tenantId) checkTenantAccess(isSystemAdmin, adminTenantIds, tenantId);

      const { error: roleErr } = await adminClient.from("user_roles").delete().eq("id", roleId);
      if (roleErr) throw new HttpError(500, "Failed to delete operator role", "role_delete_failed", roleErr);

      if (deleteUser && userId) {
        const { data: remainingRoles, error: remainingRolesError } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", userId);

        if (remainingRolesError) {
          throw new HttpError(500, "Failed to verify remaining user roles", "remaining_roles_failed", remainingRolesError);
        }

        if (!remainingRoles || remainingRoles.length === 0) {
          const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
          if (deleteUserError) {
            throw new HttpError(500, "Failed to delete auth user", "auth_user_delete_failed", deleteUserError);
          }

          const { error: profileDeleteError } = await adminClient.from("profiles").delete().eq("user_id", userId);
          if (profileDeleteError) {
            throw new HttpError(500, "Auth user deleted but profile cleanup failed", "profile_delete_failed", profileDeleteError);
          }
        }
      }

      return jsonResponse(200, { ok: true, success: true, message: "Operator deleted successfully" });
    }

    throw new HttpError(400, `Unknown action: ${action}`, "unknown_action");
  } catch (error: unknown) {
    const appError = toHttpError(error, 400);
    console.error("create-operator error:", {
      message: appError.message,
      status: appError.status,
      code: appError.code,
      details: appError.details,
    });

    return jsonResponse(appError.status, {
      ok: false,
      error: appError.message,
      code: appError.code,
      details: appError.details,
    });
  }
});
