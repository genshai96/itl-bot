import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useHighestRole } from "@/hooks/use-current-roles";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  Bot,
  Users,
  FileText,
  BarChart3,
  Building2,
  AlertTriangle,
  LogOut,
  GitBranch,
  ScrollText,
  Headset,
} from "lucide-react";

const allNavItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, minRole: "support_lead" as const },
  { to: "/tenants", label: "Tenants", icon: Building2, minRole: "tenant_admin" as const },
  { to: "/conversations", label: "Conversations", icon: MessageSquare, minRole: "support_agent" as const },
  { to: "/handoff", label: "Handoff Queue", icon: AlertTriangle, minRole: "support_agent" as const },
  { to: "/knowledge", label: "Knowledge Base", icon: FileText, minRole: "support_lead" as const },
  { to: "/flows", label: "Flow Builder", icon: GitBranch, minRole: "tenant_admin" as const },
  { to: "/agents", label: "Operators", icon: Users, minRole: "support_lead" as const },
  { to: "/analytics", label: "Analytics", icon: BarChart3, minRole: "support_lead" as const },
  { to: "/audit-logs", label: "Audit Logs", icon: ScrollText, minRole: "tenant_admin" as const },
  { to: "/settings", label: "Settings", icon: Settings, minRole: "tenant_admin" as const },
];

const rolePriority: Record<string, number> = {
  system_admin: 0,
  tenant_admin: 1,
  support_lead: 2,
  support_agent: 3,
  end_user: 4,
};

export const AppSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const highestRole = useHighestRole();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const userLevel = highestRole ? rolePriority[highestRole] ?? 4 : 4;
  const navItems = allNavItems.filter((item) => userLevel <= rolePriority[item.minRole]);

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-sidebar-border bg-sidebar flex flex-col"
      style={{ background: "var(--gradient-sidebar)" }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary glow-primary">
          <Bot className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-bold text-sidebar-accent-foreground tracking-tight">AI Support</h1>
          <p className="text-[11px] text-sidebar-muted">Multi-tenant Platform</p>
        </div>
        <NotificationBell />
      </div>

      {/* Role badge */}
      {highestRole && (
        <div className="px-6 py-2 border-b border-sidebar-border">
          <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
            {highestRole === "system_admin" ? "System Admin" :
             highestRole === "tenant_admin" ? "Tenant Admin" :
             highestRole === "support_lead" ? "Support Lead" :
             highestRole === "support_agent" ? "Operator" : "User"}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to || 
            (item.to !== "/" && location.pathname.startsWith(item.to));
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* User + sign out */}
      <div className="border-t border-sidebar-border p-4 space-y-2">
        {user && (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20 text-xs font-bold text-sidebar-primary">
              {(user.email || "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-accent-foreground truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
};
