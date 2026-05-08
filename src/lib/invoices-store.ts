import { supabase } from "@/integrations/supabase/client";
import type { Shift } from "./mock-data";
import type { InvoiceCustomer, InvoiceLine, InvoiceData } from "./invoice-pdf";

export type InvoiceRow = {
  id: string;
  number: number;
  year: number;
  invoice_date: string;
  shift_id: string | null;
  customer: InvoiceCustomer;
  lines: InvoiceLine[];
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  notes: string | null;
  drive_url: string | null;
  pdf_filename: string | null;
  created_at: string;
};

export async function fetchInvoices(): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("year", { ascending: false })
    .order("number", { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any as InvoiceRow[];
}

export async function fetchInvoicesForShift(shiftId: string): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("shift_id", shiftId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any as InvoiceRow[];
}

/**
 * Allocate the next invoice number for a year and insert the invoice.
 * Retries once on unique-constraint conflict (race condition).
 */
export async function createInvoice(input: {
  shift: Shift | null;
  customer: InvoiceCustomer;
  lines: InvoiceLine[];
  vatRate: number;
  notes?: string;
  pdfFilename?: string;
}): Promise<InvoiceData & { id: string }> {
  const year = new Date().getFullYear();
  const grossTotal = input.lines.reduce((s, l) => s + l.price, 0);
  const subtotal = +(grossTotal / (1 + input.vatRate / 100)).toFixed(2);
  const vatAmount = +(grossTotal - subtotal).toFixed(2);

  for (let attempt = 0; attempt < 3; attempt++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nextN, error: rpcErr } = await (supabase.rpc as any)("next_invoice_number", { _year: year });
    if (rpcErr) throw rpcErr;
    const number = nextN as number;

    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("invoices")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        number,
        year,
        invoice_date: today,
        shift_id: input.shift?.id ?? null,
        customer: input.customer as never,
        lines: input.lines as never,
        subtotal,
        vat_rate: input.vatRate,
        vat_amount: vatAmount,
        total: grossTotal,
        notes: input.notes ?? null,
        pdf_filename: input.pdfFilename ?? null,
      } as never)
      .select()
      .single();

    if (!error && data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = data as any as InvoiceRow;
      const [y, m, d] = today.split("-");
      return {
        id: row.id,
        number: row.number,
        year: row.year,
        date: `${d}/${m}/${y}`,
        customer: row.customer,
        lines: row.lines,
        vatRate: Number(row.vat_rate),
      };
    }
    // 23505 = unique violation → race, retry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.code !== "23505") throw error;
  }
  throw new Error("Could not allocate an invoice number after several retries.");
}
