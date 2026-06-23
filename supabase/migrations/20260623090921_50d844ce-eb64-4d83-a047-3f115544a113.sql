CREATE INDEX IF NOT EXISTS idx_guide_notifications_staff_created
  ON public.guide_notifications (staff_id, created_at DESC);