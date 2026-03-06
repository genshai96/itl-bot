import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export const NotificationBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const unreadCount = notifications?.filter((n) => !n.is_read).length || 0;

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications", user.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, qc]);

  const markAllRead = async () => {
    if (!user?.id || !unreadCount) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  };

  const handleClick = async (notif: any) => {
    // Mark as read
    if (!notif.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", notif.id);
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
    }
    setOpen(false);
    if (notif.resource_type === "handoff") {
      navigate("/handoff");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors">
          <Bell className="h-4.5 w-4.5 text-sidebar-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground px-1 animate-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" side="right">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Thông báo</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={markAllRead}>
              Đánh dấu đã đọc
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto divide-y">
          {(!notifications || notifications.length === 0) && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Không có thông báo
            </div>
          )}
          {notifications?.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                !n.is_read ? "bg-primary/5" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                {!n.is_read && (
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{n.title}</p>
                  {n.body && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {format(new Date(n.created_at), "dd/MM HH:mm")}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
