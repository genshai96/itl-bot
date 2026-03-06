import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function verifyAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing authorization");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) throw new Error("Unauthorized");

  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: callerRoles } = await adminClient
    .from("user_roles")
    .select("role, tenant_id")
    .eq("user_id", caller.id);

  const isSystemAdmin = callerRoles?.some((r: any) => r.role === "system_admin");
  const adminTenantIds = callerRoles
    ?.filter((r: any) => r.role === "tenant_admin")
    .map((r: any) => r.tenant_id) || [];

  if (!isSystemAdmin && adminTenantIds.length === 0) {
    throw new Error("Insufficient permissions");
  }

  return { caller, adminClient, isSystemAdmin, adminTenantIds, supabaseUrl };
}

function checkTenantAccess(isSystemAdmin: boolean, adminTenantIds: string[], tenantId: string) {
  if (!isSystemAdmin && !adminTenantIds.includes(tenantId)) {
    throw new Error("No access to this tenant");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { adminClient, isSystemAdmin, adminTenantIds, supabaseUrl } = await verifyAdmin(req);
    const body = await req.json();
    const { action = "create" } = body;

    // ============ CREATE ============
    if (action === "create") {
      const { email, password, displayName, role, tenantId, mode } = body;
      if (!email || !role || !tenantId) throw new Error("Missing required fields");
      checkTenantAccess(isSystemAdmin, adminTenantIds, tenantId);

      if (mode === "invite") {
        const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
          email,
          email_confirm: false,
          user_metadata: { display_name: displayName || email.split("@")[0] },
        });
        if (createErr) throw createErr;

        await adminClient.from("user_roles").insert({
          user_id: newUser.user.id, role, tenant_id: tenantId,
        });

        // Generate invite link (recovery type so user sets password)
        const { data: linkData } = await adminClient.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo: `${req.headers.get("origin") || supabaseUrl}/reset-password` },
        });

        return new Response(JSON.stringify({
          success: true, mode: "invite", userId: newUser.user.id,
          inviteLink: linkData?.properties?.action_link || null,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        if (!password || password.length < 6) throw new Error("Password must be at least 6 characters");

        const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { display_name: displayName || email.split("@")[0] },
        });
        if (createErr) throw createErr;

        await adminClient.from("user_roles").insert({
          user_id: newUser.user.id, role, tenant_id: tenantId,
        });

        return new Response(JSON.stringify({ success: true, mode: "direct", userId: newUser.user.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ============ UPDATE ROLE ============
    if (action === "update_role") {
      const { roleId, newRole, tenantId } = body;
      if (!roleId || !newRole) throw new Error("Missing roleId or newRole");
      if (tenantId) checkTenantAccess(isSystemAdmin, adminTenantIds, tenantId);

      const { error } = await adminClient
        .from("user_roles")
        .update({ role: newRole })
        .eq("id", roleId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ RESEND INVITE ============
    if (action === "resend_invite") {
      const { userId, tenantId } = body;
      if (!userId) throw new Error("Missing userId");
      if (tenantId) checkTenantAccess(isSystemAdmin, adminTenantIds, tenantId);

      // Get user email
      const { data: userData, error: userErr } = await adminClient.auth.admin.getUserById(userId);
      if (userErr || !userData?.user) throw new Error("User not found");

      // Generate new invite link
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "invite",
        email: userData.user.email!,
        options: { redirectTo: `${req.headers.get("origin") || supabaseUrl}/reset-password` },
      });
      if (linkErr) throw linkErr;

      return new Response(JSON.stringify({
        success: true,
        inviteLink: linkData?.properties?.action_link || null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ DELETE ============
    if (action === "delete") {
      const { roleId, userId, deleteUser, tenantId } = body;
      if (!roleId) throw new Error("Missing roleId");
      if (tenantId) checkTenantAccess(isSystemAdmin, adminTenantIds, tenantId);

      // Delete the role
      const { error: roleErr } = await adminClient.from("user_roles").delete().eq("id", roleId);
      if (roleErr) throw roleErr;

      // If deleteUser flag and no other roles remain, delete the auth user too
      if (deleteUser && userId) {
        const { data: remainingRoles } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", userId);
        
        if (!remainingRoles || remainingRoles.length === 0) {
          await adminClient.auth.admin.deleteUser(userId);
          // Also clean up profile
          await adminClient.from("profiles").delete().eq("user_id", userId);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
