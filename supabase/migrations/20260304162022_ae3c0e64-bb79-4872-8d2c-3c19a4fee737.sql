-- Create storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload to chat-attachments (end users are anonymous)
CREATE POLICY "Anyone can upload chat attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-attachments');

-- Allow anyone to read chat attachments
CREATE POLICY "Anyone can read chat attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-attachments');