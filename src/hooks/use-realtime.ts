import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to realtime changes on conversations table
 */
export function useRealtimeConversations(tenantId?: string) {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("rt-conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          qc.invalidateQueries({ queryKey: ["conversations"] });
          qc.invalidateQueries({ queryKey: ["conversation_stats"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, tenantId]);
}

/**
 * Subscribe to realtime changes on messages for a specific conversation
 */
export function useRealtimeMessages(conversationId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`rt-msgs-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["messages", conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, conversationId]);
}

/**
 * Subscribe to realtime handoff events
 */
export function useRealtimeHandoffs() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("rt-handoffs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "handoff_events" },
        () => {
          qc.invalidateQueries({ queryKey: ["handoff_events"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
