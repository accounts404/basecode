
import React, { useState, useEffect } from "react";
import { Invoice } from "@/entities/Invoice";
import { WorkEntry } from "@/entities/WorkEntry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, Mail, Check, Edit, Download } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale"; // Import the Spanish locale
import { SendEmail, UploadFile, InvokeLLM } from "@/integrations/Core";

export default function InvoiceEditor({ user, invoice, workEntries, onInvoiceUpdated, onCancel }) {
  const [invoiceData, setInvoiceData] = useState({ ...invoice });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const includedWorkEntries = workEntries.filter(we =>
    invoiceData.work_entries && invoiceData.work_entries.includes(we.id)
  );

  const numberToWords = (num) => {
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');

    // For numbers larger than 999, it just returns the number as a string.
    // In a real-world scenario, you'd want a more robust number to words converter.
    return num.toString();
  };

  const generateInvoiceHTML = () => {
    const get = (obj, path, fallback = '**********') => {
      const value = path.split('.').reduce((acc, part) => acc && acc[part], obj);
      return value || fallback;
    };
    
    const totalInWords = numberToWords(Math.floor(invoiceData.total_amount));

    const dailyTotals = includedWorkEntries.reduce((acc, entry) => {
      const date = entry.work_date;
      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += entry.total_amount;
      return acc;
    }, {});

    const sortedDates = Object.keys(dailyTotals).sort((a, b) => new Date(a) - new Date(b));

    const servicesHTML = sortedDates.map(date => {
      const formattedDate = format(new Date(date), "d 'de' MMMM 'de' yyyy", { locale: es });
      const amount = dailyTotals[date].toFixed(2); // Changed to toFixed(2)
      return `<div class="service-item">${formattedDate}: $${amount}</div>`;
    }).join('');
    
    const fullName = get(user, 'invoice_name', get(user, 'full_name', 'NAME AND LAST NAME'));
    
    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Tax Invoice ${invoiceData.invoice_number}</title>
    <style>
        body { font-family: 'Helvetica', Arial, sans-serif; background: white; color: #000; }
        .pdf-page { padding: 40px; line-height: 1.4; font-size: 11px; }
        .personal-info { margin-bottom: 25px; text-align: right; }
        .name { font-size: 14px; font-weight: bold; margin-bottom: 8px; }
        .personal-line { margin-bottom: 3px; }
        .invoice-to-section { margin: 25px 0; }
        .invoice-to-title { font-size: 12px; font-weight: bold; margin-bottom: 8px; }
        .company-name { font-size: 11px; margin-bottom: 3px; }
        .terms-section { margin: 25px 0; }
        .terms-title { font-size: 12px; font-weight: bold; margin-bottom: 8px; }
        .cleaning-service { margin-bottom: 8px; }
        .service-list { margin: 10px 0 0 0; }
        .service-item { margin-bottom: 3px; position: relative; padding-left: 12px; }
        .service-item::before { content: '•'; position: absolute; left: 0; }
        .total-section { margin: 25px 0; }
        .total-line { font-weight: bold; margin-bottom: 3px; }
        .total-in-words { margin: 8px 0; }
        .banking-section { margin: 25px 0; }
        .banking-title { font-size: 12px; font-weight: bold; margin-bottom: 8px; }
        .banking-line { margin-bottom: 3px; }
        @media print { body { padding: 0; } }
    </style>
</head>
<body>
    <div class="pdf-page">
        <div class="personal-info">
            <div class="name">${fullName}</div>
            <div class="personal-line">ABN: ${get(user, 'abn')}</div>
            <div class="personal-line">Mobile Number: ${get(user, 'mobile_number')}</div>
            <div class="personal-line">Address: ${get(user, 'address')}</div>
            <div class="personal-line">Date: ${format(new Date(), 'd MMMM yyyy', { locale: es })}</div>
            <div class="personal-line">Invoice: ${invoiceData.invoice_number.replace('INV-', '')}</div>
        </div>
        <div class="invoice-to-section">
            <div class="invoice-to-title">TAX INVOICE TO:</div>
            <div class="company-name">RedOak Cleaning Solutions</div>
            <div class="personal-line">Mobile Number: 0491829501</div>
        </div>
        <div class="terms-section">
            <div class="terms-title">TERMS:</div>
            <div class="cleaning-service">1. Cleaning Service:</div>
            <div class="service-list">
                <div class="service-item">Month/day: $value</div>
                ${servicesHTML}
            </div>
            ${invoiceData.notes ? `
            <div style="margin-top: 20px; padding: 10px; background: #f5f5f5; border-left: 3px solid #ccc; font-size: 10px;">
                <strong>Notas Adicionales:</strong><br>${invoiceData.notes.replace(/\n/g, '<br>')}
            </div>` : ''}
        </div>
        <div class="total-section">
            <div class="total-line">Total: $${invoiceData.total_amount.toFixed(2)}</div>
            <div class="total-in-words">${totalInWords} AUD $${invoiceData.total_amount.toFixed(2)}</div>
        </div>
        <div class="banking-section">
            <div class="banking-title">BANKING DETAILS:</div>
            <div class="banking-line">Account Name: ${get(user, 'account_name', '*******')}</div>
            <div class="banking-line">Account Number: ${get(user, 'account_number', '*******')}</div>
            <div class="banking-line">BSB: ${get(user, 'bsb', '*******')}</div>
            <div class="banking-line">Bank: ${get(user, 'bank', '*******')}</div>
        </div>
    </div>
    <script>
        window.onload = function() { window.print(); };
    </script>
</body>
</html>`;
  };

  const handleSaveChanges = async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await Invoice.update(invoice.id, {
        ...invoiceData,
        status: 'generated'
      });

      setSuccess("Cambios guardados exitosamente");
      setTimeout(() => {
        onInvoiceUpdated();
      }, 1500);
    } catch (error) {
      setError("Error guardando los cambios: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAndSend = async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Generate HTML content
      const htmlContent = generateInvoiceHTML();

      // Create a file and upload it to get a URL
      const htmlFile = new File([htmlContent], `invoice-${invoiceData.invoice_number}.html`, { type: 'text/html' });

      const { file_url } = await UploadFile({ file: htmlFile });

      // Update invoice with submitted status and PDF URL
      const finalInvoiceData = {
        ...invoiceData,
        status: 'submitted', // Changed from 'approved' to 'submitted'
        pdf_url: file_url // Storing HTML file URL
      };
      await Invoice.update(invoice.id, finalInvoiceData);

      // Send email with the URL
      const to_emails = `accounts@redoakcleaning.com.au`; // Removed user.email from here
      const emailBody = `
Estimado RedOak Cleaning Solutions,

Se ha enviado la factura ${invoiceData.invoice_number} de ${user.full_name || 'Limpiador'} para su revisión.

Puede ver y descargar la factura desde el siguiente enlace:
${file_url}
(Para guardar como PDF, abra el enlace y use la función de imprimir de su navegador)

Saludos,
${user.full_name || 'CleanTrack Sistema'}`;

      await SendEmail({
        to: to_emails,
        subject: `Factura Enviada para Revisión: ${invoiceData.invoice_number} - ${user.full_name || 'Limpiador'}`, // Changed subject
        body: emailBody,
        from_name: user.full_name || 'CleanTrack Sistema'
      });

      // Removed the second update to 'sent' status, it's now 'submitted'
      setSuccess("¡Factura enviada para revisión exitosamente!"); // Changed success message
      setTimeout(() => {
        onInvoiceUpdated();
      }, 2000);

    } catch (error) {
      setError("Error enviando la factura: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5" />
              Detalles de la Factura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invoice_number">Número de Factura</Label>
              <Input
                id="invoice_number"
                value={invoiceData.invoice_number}
                onChange={(e) => setInvoiceData(prev => ({ ...prev, invoice_number: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="period_start">Fecha Inicio</Label>
                <Input
                  id="period_start"
                  type="date"
                  value={invoiceData.period_start}
                  onChange={(e) => setInvoiceData(prev => ({ ...prev, period_start: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period_end">Fecha Fin</Label>
                <Input
                  id="period_end"
                  type="date"
                  value={invoiceData.period_end}
                  onChange={(e) => setInvoiceData(prev => ({ ...prev, period_end: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="total_amount">Total (AUD)</Label>
              <Input
                id="total_amount"
                type="number"
                step="0.01"
                value={invoiceData.total_amount}
                onChange={(e) => setInvoiceData(prev => ({ ...prev, total_amount: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas Adicionales</Label>
              <Textarea
                id="notes"
                value={invoiceData.notes || ""} // Ensure it's a string for textarea
                onChange={(e) => setInvoiceData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Agregar notas adicionales para la factura..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Servicios Incluidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {includedWorkEntries.map((entry) => (
                <div key={entry.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium">{format(new Date(entry.work_date), "d MMM yyyy")}</p>
                    <p className="text-sm text-slate-600">{entry.client_name}</p>
                    <p className="text-sm text-slate-500">{entry.hours}h × ${entry.hourly_rate}</p>
                  </div>
                  <div className="font-semibold text-green-600">
                    ${entry.total_amount.toFixed(2)}
                  </div>
                </div>
              ))}
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between items-center font-bold text-lg">
                  <span>Total:</span>
                  <span className="text-green-600">${invoiceData.total_amount.toFixed(2)} AUD</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={handleSaveChanges} disabled={loading}>
          {loading ? "Guardando..." : "Guardar Cambios"}
        </Button>
        <Button
          onClick={handleApproveAndSend}
          disabled={loading}
          className="bg-green-600 hover:bg-green-700"
        >
          {loading ? "Enviando..." : (
            <>
              <Check className="w-4 h-4 mr-2" />
              Enviar para Revisión
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
