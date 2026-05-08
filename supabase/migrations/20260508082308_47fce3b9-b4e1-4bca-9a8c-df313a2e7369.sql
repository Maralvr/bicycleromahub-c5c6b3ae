
-- Invoices table
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number integer NOT NULL,
  year integer NOT NULL,
  invoice_date date NOT NULL DEFAULT current_date,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  customer jsonb NOT NULL DEFAULT '{}'::jsonb,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 22,
  vat_amount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  drive_url text,
  pdf_filename text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(year, number)
);

CREATE INDEX idx_invoices_year_number ON public.invoices(year DESC, number DESC);
CREATE INDEX idx_invoices_shift_id ON public.invoices(shift_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY invoices_admin_all ON public.invoices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Atomic sequential numbering per year
CREATE OR REPLACE FUNCTION public.next_invoice_number(_year integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_n integer;
BEGIN
  SELECT COALESCE(MAX(number), 0) + 1 INTO next_n
  FROM public.invoices
  WHERE year = _year;
  RETURN next_n;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
