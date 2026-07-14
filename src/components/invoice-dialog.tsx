import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileText, Trash2, Plus, Loader2 } from "lucide-react";
import type { Shift } from "@/lib/mock-data";
import { createInvoice } from "@/lib/invoices-store";
import { generateAndDownloadInvoice, type InvoiceLine, type InvoiceCustomer } from "@/lib/invoice-pdf";

function shortMonthDay(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export function InvoiceDialog({
  shift,
  open,
  onClose,
}: {
  shift: Shift | null;
  open: boolean;
  onClose: () => void;
}) {
  const defaultLines = useMemo<InvoiceLine[]>(() => {
    if (!shift) return [];
    return [
      {
        bookingId: shift.bookingId || "",
        customerName: shift.customer?.name || "",
        date: shortMonthDay(shift.date),
        tourName: shift.tourName,
        price: shift.rate ?? 0,
      },
    ];
  }, [shift]);

  const [customer, setCustomer] = useState<InvoiceCustomer>({ name: "" });
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [vatRate, setVatRate] = useState(22);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && shift) {
      setCustomer({
        name: shift.customer?.name || "",
        address: "",
        city: "",
        country: "",
        codUni: "",
        vat: "",
      });
      setLines(defaultLines);
      setVatRate(22);
      setNotes("");
    }
  }, [open, shift, defaultLines]);

  const grossTotal = lines.reduce((s, l) => s + (Number(l.price) || 0), 0);
  const subtotal = grossTotal / (1 + vatRate / 100);
  const vatAmount = grossTotal - subtotal;

  const updateLine = (i: number, patch: Partial<InvoiceLine>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, { tourName: "", price: 0 }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const handleGenerate = async () => {
    if (!customer.name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (lines.length === 0 || lines.every((l) => !l.tourName.trim())) {
      toast.error("Add at least one line item");
      return;
    }
    setSubmitting(true);
    try {
      // 1. Reserve invoice number + persist
      const invoice = await createInvoice({
        shift,
        customer,
        lines,
        vatRate,
        notes,
      });
      // 2. Generate + download PDF
      await generateAndDownloadInvoice(invoice);
      toast.success(`Fattura ${invoice.number}/${invoice.year} generated`, {
        description: "PDF downloaded. Forward to your accountant or customer.",
      });
      onClose();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error("Could not generate invoice", { description: err?.message ?? String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  if (!shift) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Generate invoice
          </DialogTitle>
          <DialogDescription>
            Pre-filled from this booking. Edit billing details and items, then generate the PDF.
          </DialogDescription>
        </DialogHeader>

        {/* Customer block */}
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Cliente / Bill to</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label htmlFor="cname">Name *</Label>
              <Input id="cname" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} maxLength={200} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="caddr">Address</Label>
              <Input id="caddr" value={customer.address ?? ""} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} maxLength={200} />
            </div>
            <div>
              <Label htmlFor="ccity">City / ZIP</Label>
              <Input id="ccity" value={customer.city ?? ""} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} maxLength={100} />
            </div>
            <div>
              <Label htmlFor="ccountry">Country</Label>
              <Input id="ccountry" value={customer.country ?? ""} onChange={(e) => setCustomer({ ...customer, country: e.target.value })} maxLength={100} />
            </div>
            <div>
              <Label htmlFor="cuni">Cod. Univoco</Label>
              <Input id="cuni" value={customer.codUni ?? ""} onChange={(e) => setCustomer({ ...customer, codUni: e.target.value })} maxLength={20} />
            </div>
            <div>
              <Label htmlFor="cvat">P.IVA / VAT</Label>
              <Input id="cvat" value={customer.vat ?? ""} onChange={(e) => setCustomer({ ...customer, vat: e.target.value })} maxLength={30} />
            </div>
          </div>
        </div>

        <Separator />

        {/* Line items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Articoli / Line items</div>
            <Button size="sm" variant="outline" onClick={addLine}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add line
            </Button>
          </div>
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 p-3 rounded-lg border border-border/60 bg-muted/30">
              <div className="col-span-4">
                <Label className="text-[10px]">Booking ID</Label>
                <Input value={line.bookingId ?? ""} onChange={(e) => updateLine(i, { bookingId: e.target.value })} maxLength={50} />
              </div>
              <div className="col-span-5">
                <Label className="text-[10px]">Customer name</Label>
                <Input value={line.customerName ?? ""} onChange={(e) => updateLine(i, { customerName: e.target.value })} maxLength={100} />
              </div>
              <div className="col-span-3">
                <Label className="text-[10px]">Date label</Label>
                <Input value={line.date ?? ""} onChange={(e) => updateLine(i, { date: e.target.value })} placeholder="Apr 17" maxLength={20} />
              </div>
              <div className="col-span-8">
                <Label className="text-[10px]">Tour / description *</Label>
                <Input value={line.tourName} onChange={(e) => updateLine(i, { tourName: e.target.value })} maxLength={200} />
              </div>
              <div className="col-span-3">
                <Label className="text-[10px]">Price (€, gross)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={line.price}
                  onChange={(e) => updateLine(i, { price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="col-span-1 flex items-end">
                <Button size="icon" variant="ghost" onClick={() => removeLine(i)} disabled={lines.length === 1}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Separator />

        {/* VAT + totals + notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <Label htmlFor="vat">VAT rate (%)</Label>
              <Input
                id="vat"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={vatRate}
                onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                className="w-32"
              />
            </div>
            <div>
              <Label htmlFor="notes">Internal notes (not on PDF)</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
            </div>
          </div>
          <div className="space-y-2 p-4 rounded-lg bg-muted/40 border border-border/60 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Imponibile</span><span className="tabular-nums">{subtotal.toFixed(2)} €</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Iva {vatRate}%</span><span className="tabular-nums">{vatAmount.toFixed(2)} €</span></div>
            <Separator />
            <div className="flex justify-between font-bold text-base"><span>TOTALE</span><span className="tabular-nums">{grossTotal.toFixed(2)} €</span></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={submitting}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating…</> : <><FileText className="h-4 w-4 mr-1" /> Generate & download</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
