
-- 1. Notifications table for in-app notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'handoff',
  title text NOT NULL,
  body text,
  resource_type text,
  resource_id text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 2. Add SLA columns to handoff_events
ALTER TABLE public.handoff_events
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_deadline_at timestamptz;

-- 3. Add SLA config columns to tenant_configs
ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS sla_response_minutes integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS sla_resolution_minutes integer DEFAULT 60;

-- 4. Function to create notifications for all agents in a tenant when handoff is created
CREATE OR REPLACE FUNCTION public.notify_agents_on_handoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  agent_record RECORD;
  conv_name text;
BEGIN
  SELECT COALESCE(end_user_name, end_user_email, 'Unknown') INTO conv_name
  FROM conversations WHERE id = NEW.conversation_id;

  FOR agent_record IN
    SELECT DISTINCT user_id FROM user_roles
    WHERE tenant_id = NEW.tenant_id
      AND role IN ('support_agent', 'support_lead', 'tenant_admin')
  LOOP
    INSERT INTO notifications (user_id, tenant_id, type, title, body, resource_type, resource_id)
    VALUES (
      agent_record.user_id,
      NEW.tenant_id,
      'handoff',
      'Handoff mới: ' || NEW.priority || ' priority',
      conv_name || ' - ' || NEW.reason,
      'handoff',
      NEW.id
    );
  END LOOP;

  UPDATE handoff_events
  SET sla_deadline_at = NEW.created_at + (
    SELECT COALESCE(sla_response_minutes, 15) * interval '1 minute'
    FROM tenant_configs WHERE tenant_id = NEW.tenant_id
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_handoff_created
  AFTER INSERT ON public.handoff_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_agents_on_handoff();

-- 5. Function to set first_response_at when agent sends first manual reply
CREATE OR REPLACE FUNCTION public.track_first_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.metadata::jsonb->>'manual_reply')::boolean = true THEN
    UPDATE handoff_events
    SET first_response_at = NOW(),
        status = CASE WHEN status = 'pending' THEN 'assigned' ELSE status END,
        assigned_to = auth.uid()
    WHERE conversation_id = NEW.conversation_id
      AND first_response_at IS NULL
      AND status IN ('pending', 'assigned');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_manual_reply
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.track_first_response();
