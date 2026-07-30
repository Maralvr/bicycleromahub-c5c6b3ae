ALTER TABLE public.guide_notifications
  ADD COLUMN IF NOT EXISTS attachment_count integer
  GENERATED ALWAYS AS (
    CASE WHEN jsonb_typeof(attachments) = 'array' THEN jsonb_array_length(attachments) ELSE 0 END
  ) STORED;