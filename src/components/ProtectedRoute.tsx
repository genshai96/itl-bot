import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useHighestRole } from "@/hooks/use-current-roles";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const highestRole = useHighestRole();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-sm text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Role-based route protection
  if (highestRole) {
    const restrictedRoutes: Record<string, string[]> = {
      support_agent: ["/conversations", "/handoff"],
      support_lead: ["/", "/conversations", "/handoff", "/knowledge", "/agents", "/analytics", "/bot-memory"],
    };

    const allowedPaths = restrictedRoutes[highestRole];
    if (allowedPaths) {
      const currentPath = location.pathname;
      const isAllowed = allowedPaths.some(
        (p) => currentPath === p || (p !== "/" && currentPath.startsWith(p))
      );
      if (!isAllowed) {
        const defaultPath = highestRole === "support_agent" ? "/handoff" : "/";
        return <Navigate to={defaultPath} replace />;
      }
    }
  }

  return <>{children}</>;
}
