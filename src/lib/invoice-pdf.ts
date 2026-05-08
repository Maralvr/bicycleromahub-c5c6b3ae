import jsPDF from "jspdf";
import logoUrl from "@/assets/bicycle-roma-logo.jpg";

export type InvoiceCustomer = {
  name: string;
  address?: string;
  city?: string;
  country?: string;
  codUni?: string;
  vat?: string;
};

export type InvoiceLine = {
  bookingId?: string;
  customerName?: string;
  date?: string; // pre-formatted, e.g. "Apr 17"
  tourName: string;
  price: number; // gross line price (will be split into net+iva)
};

export type InvoiceData = {
  number: number;
  year: number;
  date: string; // dd/mm/yyyy
  customer: InvoiceCustomer;
  lines: InvoiceLine[];
  vatRate: number; // e.g. 22
  notes?: string;
};

const COMPANY = {
  name: "BGP NOLEGGIO SRL",
  address: "via vittore carpaccio 60",
  city: "00147 - Roma",
  vat: "P. iva / Cod. fisc. 17405641006",
  website: "https://www.bicycleroma.com",
  email: "info@bicycleroma.com",
  social: "@bicycle.roma",
  iban: "IT87C0326803211052439930610",
  bank: "BANCA SELLA - INTESTATO A BGP NOLEGGIO SRL",
};

const GREEN: [number, number, number] = [139, 197, 63]; // bicycle roma green

function fmtEur(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildInvoicePdf(data: InvoiceData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 15;

  // ─── HEADER: title left, company right ──────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(28);
  doc.setTextColor(20);
  doc.text("FATTURA", margin, 28);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY.name, pageW - margin, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(COMPANY.address, pageW - margin, 25, { align: "right" });
  doc.text(COMPANY.city, pageW - margin, 30, { align: "right" });
  doc.text(COMPANY.vat, pageW - margin, 35, { align: "right" });

  // ─── GREEN BAND with website / email / social ──────────────────
  doc.setFillColor(...GREEN);
  doc.rect(0, 42, pageW, 9, "F");
  doc.setTextColor(255);
  doc.setFontSize(9);
  doc.text(COMPANY.website, margin, 48);
  doc.text(COMPANY.email, pageW / 2, 48, { align: "center" });
  doc.text(COMPANY.social, pageW - margin, 48, { align: "right" });
  doc.setTextColor(20);

  // ─── LOGO + invoice meta + customer block ──────────────────────
  const logo = await loadLogoDataUrl();
  if (logo) {
    try {
      doc.addImage(logo, "JPEG", margin, 58, 32, 32);
    } catch {
      // ignore logo errors
    }
  }

  // Invoice meta (center-left)
  doc.setFontSize(11);
  doc.text("N° Fattura", margin + 40, 68);
  doc.setFont("helvetica", "italic");
  doc.text(`${data.number}/${data.year}`, margin + 70, 68);
  doc.setFont("helvetica", "normal");
  doc.text("Data", margin + 40, 78);
  doc.setFont("helvetica", "italic");
  doc.text(data.date, margin + 70, 78);
  doc.setFont("helvetica", "normal");

  // Customer block (right, boxed)
  const cx = 120;
  const cy = 58;
  const cw = pageW - margin - cx;
  const ch = 42;
  doc.setDrawColor(60);
  doc.setLineWidth(0.3);
  doc.rect(cx, cy, cw, ch);
  doc.setFontSize(9);
  let cyText = cy + 6;
  doc.text("Cliente:", cx + 3, cyText);
  cyText += 6;
  doc.setFont("helvetica", "bold");
  doc.text(data.customer.name || "—", cx + 3, cyText);
  doc.setFont("helvetica", "normal");
  if (data.customer.address) { cyText += 5; doc.text(data.customer.address, cx + 3, cyText); }
  if (data.customer.city) { cyText += 5; doc.text(data.customer.city, cx + 3, cyText); }
  if (data.customer.country) { cyText += 5; doc.text(data.customer.country, cx + 3, cyText); }
  if (data.customer.codUni) { cyText += 5; doc.text(`Cod. Uni.: ${data.customer.codUni}`, cx + 3, cyText); }
  if (data.customer.vat) { cyText += 5; doc.text(`P.IVA: ${data.customer.vat}`, cx + 3, cyText); }

  // ─── ITEMS TABLE ───────────────────────────────────────────────
  let y = 110;
  doc.setFillColor(...GREEN);
  doc.rect(margin, y, pageW - 2 * margin, 9, "F");
  doc.setTextColor(255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("ARTICOLO", margin + 3, y + 6);
  doc.text("PREZZI SCONTATI", margin + 105, y + 6, { align: "center" });
  doc.text("QUANTITA'", margin + 135, y + 6, { align: "center" });
  doc.text("PREZZO", pageW - margin - 3, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20);

  y += 14;
  for (const line of data.lines) {
    // Booking header
    if (line.bookingId || line.customerName || line.date) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      const header = [line.bookingId, line.customerName, line.date].filter(Boolean).join(" - ");
      doc.text(header, margin + 3, y);
      doc.setFont("helvetica", "normal");
      y += 5;
    }
    // Tour line
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const tourLines = doc.splitTextToSize(line.tourName, 95);
    doc.text(tourLines, margin + 3, y);
    doc.setFont("helvetica", "normal");
    doc.text(fmtEur(line.price), margin + 105, y, { align: "center" });
    doc.text(fmtEur(line.price), pageW - margin - 3, y, { align: "right" });
    y += Math.max(6, tourLines.length * 5) + 4;

    if (y > 230) { doc.addPage(); y = 30; }
  }

  // ─── BANK FOOTER ───────────────────────────────────────────────
  const footerY = 240;
  doc.setFontSize(9);
  doc.text(COMPANY.bank, margin, footerY);
  doc.text(COMPANY.iban, margin, footerY + 5);
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY + 8, pageW - margin, footerY + 8);

  // ─── TOTALS (right side) ───────────────────────────────────────
  const grossTotal = data.lines.reduce((s, l) => s + l.price, 0);
  const subtotal = grossTotal / (1 + data.vatRate / 100);
  const vatAmount = grossTotal - subtotal;

  let ty = footerY + 18;
  doc.setFontSize(10);
  doc.text("Imponibile", 145, ty);
  doc.text(fmtEur(subtotal), pageW - margin, ty, { align: "right" });
  ty += 7;
  doc.text(`Iva ${data.vatRate}%`, 145, ty);
  doc.text(fmtEur(vatAmount), pageW - margin, ty, { align: "right" });
  doc.setDrawColor(...GREEN);
  doc.line(145, ty + 2, pageW - margin, ty + 2);
  ty += 9;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTALE", 145, ty);
  doc.text(`${fmtEur(grossTotal)} €`, pageW - margin, ty, { align: "right" });
  doc.setFont("helvetica", "normal");

  // ─── Tagline + bottom band ─────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("GRAZIE PER AVER SCELTO BICYCL-E", pageW / 2, 285, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFillColor(...GREEN);
  doc.rect(0, 290, pageW, 7, "F");

  return doc;
}

export async function generateAndDownloadInvoice(data: InvoiceData): Promise<string> {
  const doc = await buildInvoicePdf(data);
  const filename = `Fattura_${String(data.number).padStart(3, "0")}_${data.year}_${(data.customer.name || "cliente").replace(/[^a-z0-9]+/gi, "_")}.pdf`;
  doc.save(filename);
  return filename;
}
