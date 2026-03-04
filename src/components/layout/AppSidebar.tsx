import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  Bot,
  Users,
  FileText,
  BarChart3,
  Building2,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tenants", label: "Tenants", icon: Building2 },
  { to: "/conversations", label: "Conversations", icon: MessageSquare, badge: 3 },
  { to: "/knowledge", label: "Knowledge Base", icon: FileText },
  { to: "/agents", label: "Agents", icon: Users },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const AppSidebar = () => {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-sidebar-border bg-sidebar flex flex-col"
      style={{ background: "var(--gradient-sidebar)" }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary glow-primary">
          <Bot className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-sidebar-accent-foreground tracking-tight">AI Support</h1>
          <p className="text-[11px] text-sidebar-muted">Multi-tenant Platform</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
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
              {item.badge && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Tenant selector */}
      <div className="border-t border-sidebar-border p-4">
        <NavLink to="/tenants" className="flex items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-2.5 hover:bg-sidebar-accent/80 transition-colors">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20 text-xs font-bold text-sidebar-primary">
            AC
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-sidebar-accent-foreground truncate">Acme Corp</p>
            <p className="text-[10px] text-sidebar-muted">4 tenants · Manage →</p>
          </div>
        </NavLink>
      </div>
    </aside>
  );
};
