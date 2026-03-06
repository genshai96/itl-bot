import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verify caller is authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller has admin role
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Check caller is system_admin or tenant_admin
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", caller.id);

    const isSystemAdmin = callerRoles?.some((r) => r.role === "system_admin");
    const adminTenantIds = callerRoles
      ?.filter((r) => r.role === "tenant_admin")
      .map((r) => r.tenant_id) || [];

    if (!isSystemAdmin && adminTenantIds.length === 0) {
      throw new Error("Insufficient permissions");
    }

    const { email, password, displayName, role, tenantId, mode } = await req.json();

    if (!email || !role || !tenantId) {
      throw new Error("Missing required fields: email, role, tenantId");
    }

    // Verify admin has access to this tenant
    if (!isSystemAdmin && !adminTenantIds.includes(tenantId)) {
      throw new Error("No access to this tenant");
    }

    if (mode === "invite") {
      // Send invite email - create user with auto-generated password
      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: { display_name: displayName || email.split("@")[0] },
      });
      if (createErr) throw createErr;

      // Assign role
      await adminClient.from("user_roles").insert({
        user_id: newUser.user.id,
        role,
        tenant_id: tenantId,
      });

      // Send password reset email so they can set their password
      await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${req.headers.get("origin") || supabaseUrl}/reset-password` },
      });

      return new Response(JSON.stringify({ success: true, mode: "invite", userId: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Direct create with password
      if (!password || password.length < 6) {
        throw new Error("Password must be at least 6 characters");
      }

      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName || email.split("@")[0] },
      });
      if (createErr) throw createErr;

      // Assign role
      await adminClient.from("user_roles").insert({
        user_id: newUser.user.id,
        role,
        tenant_id: tenantId,
      });

      return new Response(JSON.stringify({ success: true, mode: "direct", userId: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
