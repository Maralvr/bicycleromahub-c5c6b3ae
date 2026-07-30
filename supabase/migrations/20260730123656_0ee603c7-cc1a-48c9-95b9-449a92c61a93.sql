ALTER TABLE public.guide_notifications DROP COLUMN attachment_count;
ALTER TABLE public.guide_notifications ALTER COLUMN attachments TYPE jsonb USING attachments;
ALTER TABLE public.guide_notifications
  ADD COLUMN attachment_count integer GENERATED ALWAYS AS (
    CASE WHEN jsonb_typeof(attachments) = 'array' THEN jsonb_array_length(attachments) ELSE 0 END
  ) STORED;