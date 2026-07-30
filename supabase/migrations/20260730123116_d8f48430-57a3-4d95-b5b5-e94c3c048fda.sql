CREATE POLICY "notif_attachments_read_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'notification-attachments');

CREATE POLICY "notif_attachments_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'notification-attachments');

CREATE POLICY "notif_attachments_delete_admin"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'notification-attachments' AND public.has_role(auth.uid(), 'admin'::app_role));