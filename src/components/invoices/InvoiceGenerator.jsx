import React, { useState, useEffect } from "react";
import { WorkEntry } from "@/entities/WorkEntry";
import { Invoice } from "@/entities/Invoice";
import { User } from "@/entities/User";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarDays, FileText, CheckCircle, AlertCircle, Download, Send } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { UploadFile } from "@/integrations/Core";
import PeriodSelector from "../reports/PeriodSelector";
import { generateInvoicePDF, downloadInvoicePDF } from "./PDFGenerator";

const activityLabels = {
  domestic: "Doméstico",
  commercial: "Comercial", 
  windows: "Ventanas",
  steam_vacuum: "Vapor/Aspirado",
  entrenamiento: "Entrenamiento",
  otros: "Otros"
};

const numberToWords = (num) => {
  const a = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'
  ];
  const b = [
    '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'
  ];

  const inWords = (n) => {
    if (n < 20) return a[n];
    let digit = n % 10;
    if (n < 100) return b[Math.floor(n / 10)] + (digit ? '-' + a[digit] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' hundred' + (n % 100 === 0 ? '' : ' ' + inWords(n % 100));
    if (n < 1000000) return inWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    return 'Number too large';
  };

  if (num === 0) return 'zero';
  let words = inWords(Math.floor(num));
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const generateInvoiceHTML = (user, invoiceNumber, workEntries, totalAmount) => {
  const get = (obj, path, fallback = '**********') => {
    const value = path.split('.').reduce((acc, part) => acc && acc[part], obj);
    return value || fallback;
  };
  
  const fullName = user.invoice_name || user.full_name || 'NAME AND LAST NAME';
  const totalInWords = numberToWords(totalAmount);
  
  const dailyTotals = workEntries.reduce((acc, entry) => {
    const date = entry.work_date;
    if (!acc[date]) {
      acc[date] = 0;
    }
    acc[date] += entry.total_amount;
    return acc;
  }, {});

  const sortedDates = Object.keys(dailyTotals).sort((a, b) => new Date(a) - new Date(b));

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Invoice ${invoiceNumber}</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .header { text-align: right; margin-bottom: 30px; }
        .invoice-to { margin-bottom: 30px; }
        .terms { margin-bottom: 20px; }
        .banking { margin-top: 30px; }
        .total { font-weight: bold; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h2>${fullName}</h2>
        <p>ABN: ${get(user, 'abn')}</p>
        <p>Mobile Number: ${get(user, 'mobile_number')}</p>
        <p>Address: ${get(user, 'address')}</p>
        <p>Date: ${format(new Date(), 'd MMMM yyyy', { locale: es })}</p>
        <p>Invoice: ${invoiceNumber.replace('INV-', '')}</p>
    </div>
    
    <div class="invoice-to">
        <h3>TAX INVOICE TO:</h3>
        <p>RedOak Cleaning Solutions</p>
        <p>Mobile Number: 0491829501</p>
    </div>
    
    <div class="terms">
        <h3>TERMS:</h3>
        <p>1. Cleaning Service:</p>
        <ul style="margin-left: 40px;">
            ${sortedDates.map(date => {
              const formattedDate = format(new Date(date), "d 'de' MMMM 'de' yyyy", { locale: es });
              const amount = dailyTotals[date].toFixed(2);
              return `<li>${formattedDate}: $${amount}</li>`;
            }).join('')}
        </ul>
    </div>
    
    <div class="total">
        <p>Total: $${totalAmount.toFixed(2)}</p>
        <p>${totalInWords} AUD $${totalAmount.toFixed(2)}</p>
    </div>
    
    <div class="banking">
        <h3>BANKING DETAILS:</h3>
        <p>Account Name: ${get(user, 'account_name', '*******')}</p>
        <p>Account Number: ${get(user, 'account_number', '*******')}</p>
        <p>BSB: ${get(user, 'bsb', '*******')}</p>
        <p>Bank: ${get(user, 'bank', '*******')}</p>
    </div>
</body>
</html>`;
};

export default function InvoiceGenerator({ user, workEntries, onInvoiceGenerated }) {
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedEntries, setSelectedEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const availableEntries = workEntries.filter(entry => {
    if (entry.invoiced) return false;
    if (!selectedPeriod) return false;
    
    const workDate = new Date(entry.work_date);
    return workDate >= selectedPeriod.start && workDate <= selectedPeriod.end;
  });

  useEffect(() => {
    if (selectedPeriod) {
      setSelectedEntries(availableEntries);
    } else {
      setSelectedEntries([]);
    }
  }, [selectedPeriod, workEntries]);

  const calculateTotal = () => {
    return selectedEntries.reduce((sum, entry) => sum + (entry.total_amount || 0), 0);
  };

  const handleGenerateInvoice = async () => {
    if (selectedEntries.length === 0) {
      setError("Selecciona al menos una entrada de trabajo.");
      return;
    }

    if (!selectedPeriod) {
      setError("Selecciona un período para generar el reporte.");
      return;
    }

    // Prevenir doble envío
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const nextInvoiceNum = user.next_invoice_number || 1;
      const invoiceNumber = `INV-${String(nextInvoiceNum).padStart(4, '0')}`;
      const totalAmount = calculateTotal();

      // Generar archivo (PDF o HTML como fallback)
      let pdfUrl = null;
      try {
        const pdfBlob = await generateInvoicePDF(user, invoiceNumber, selectedEntries, totalAmount);
        const pdfFile = new File([pdfBlob], `invoice-${invoiceNumber}.pdf`, { type: 'application/pdf' });
        const uploadResult = await UploadFile({ file: pdfFile });
        pdfUrl = uploadResult.file_url;
      } catch (pdfError) {
        console.warn("PDF generation failed, using HTML fallback:", pdfError);
        const htmlContent = generateInvoiceHTML(user, invoiceNumber, selectedEntries, totalAmount);
        const htmlFile = new File([htmlContent], `invoice-${invoiceNumber}.html`, { type: 'text/html' });
        const uploadResult = await UploadFile({ file: htmlFile });
        pdfUrl = uploadResult.file_url;
      }

      // Preparar datos de la factura
      const newInvoiceData = {
        cleaner_id: user.id,
        cleaner_name: user.invoice_name || user.full_name,
        invoice_number: invoiceNumber,
        period: selectedPeriod.label,
        period_start: format(selectedPeriod.start, 'yyyy-MM-dd'),
        period_end: format(selectedPeriod.end, 'yyyy-MM-dd'),
        total_amount: totalAmount,
        work_entries: selectedEntries.map(entry => entry.id),
        pdf_url: pdfUrl,
        status: 'submitted'
      };

      // === PASO 1: CREAR LA FACTURA (CRÍTICO) ===
      let newInvoice;
      try {
        newInvoice = await Invoice.create(newInvoiceData);
      } catch (invoiceError) {
        console.error("Critical error creating invoice:", invoiceError);
        throw new Error("No se pudo crear la factura. Por favor, inténtalo de nuevo.");
      }

      // === PASO 2: ACTUALIZAR WORK ENTRIES (IMPORTANTE PERO NO CRÍTICO) ===
      let workEntriesUpdated = false;
      try {
        await Promise.all(
          selectedEntries.map(entry => WorkEntry.update(entry.id, { invoiced: true }))
        );
        workEntriesUpdated = true;
      } catch (workEntryError) {
        console.warn("Failed to update work entries, but invoice was created:", workEntryError);
        // Continuamos, el invoice ya se creó
      }

      // === PASO 3: ACTUALIZAR NÚMERO DE FACTURA (IMPORTANTE PERO NO CRÍTICO) ===
      try {
        await User.updateMyUserData({ next_invoice_number: nextInvoiceNum + 1 });
      } catch (userUpdateError) {
        console.warn("Failed to update user invoice number, but invoice was created:", userUpdateError);
        // Continuamos, el invoice ya se creó
      }

      // === PASO 4: NOTIFICAR AL ADMIN (OPCIONAL) ===
      // Este paso se hace en background y no debe afectar la experiencia del usuario
      setTimeout(async () => {
        try {
          // Usar fetch directo para evitar problemas de permisos del SDK
          const response = await fetch('/functions/notifyAdminOfNewInvoice', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              invoiceNumber: newInvoice.invoice_number,
              cleanerName: newInvoice.cleaner_name,
              pdfUrl: newInvoice.pdf_url
            })
          });
          
          if (!response.ok) {
            console.warn("Admin notification failed, but it's not critical");
          }
        } catch (notificationError) {
          console.warn("Background notification failed:", notificationError);
        }
      }, 100); // Ejecutar en background después de 100ms

      // === ÉXITO GARANTIZADO ===
      // Si llegamos aquí, la factura se creó exitosamente
      if (onInvoiceGenerated) {
        onInvoiceGenerated(newInvoice);
      }
      
    } catch (err) {
      console.error("Error in invoice generation:", err);
      setError(err.message || "Error desconocido al generar la factura. Por favor, inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewPDF = async () => {
    if (selectedEntries.length === 0) {
      setError("Selecciona al menos una entrada de trabajo para previsualizar.");
      return;
    }

    if (loading) {
      return;
    }

    try {
      setLoading(true);
      const nextInvoiceNum = user.next_invoice_number || 1;
      const invoiceNumber = `INV-${String(nextInvoiceNum).padStart(4, '0')}`;
      const totalAmount = calculateTotal();

      await downloadInvoicePDF(
        user,
        invoiceNumber,
        selectedEntries,
        totalAmount,
        `Preview_${invoiceNumber}.pdf`
      );
      setError("");
    } catch (err) {
      console.error("Error previewing PDF:", err);
      setError("Error al generar la previsualización: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (checked) => {
    setSelectedEntries(checked ? availableEntries : []);
  };

  const handleSelectEntry = (entry, checked) => {
    if (checked) {
      setSelectedEntries(prev => [...prev, entry]);
    } else {
      setSelectedEntries(prev => prev.filter(e => e.id !== entry.id));
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-blue-600" />
            Seleccionar Período de Facturación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PeriodSelector onPeriodChange={setSelectedPeriod} />
        </CardContent>
      </Card>

      {selectedPeriod && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-600" />
                Horas de Trabajo Disponibles ({availableEntries.length})
              </div>
              {availableEntries.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSelectAll(selectedEntries.length !== availableEntries.length)}
                >
                  {selectedEntries.length === availableEntries.length ? "Deseleccionar Todo" : "Seleccionar Todo"}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {availableEntries.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No hay horas de trabajo disponibles para este período.</p>
                <p className="text-sm text-slate-400 mt-2">
                  Las horas pueden estar ya facturadas o no existir para las fechas seleccionadas.
                </p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Actividad</TableHead>
                      <TableHead>Horas</TableHead>
                      <TableHead>Tarifa</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedEntries.some(e => e.id === entry.id)}
                            onCheckedChange={(checked) => handleSelectEntry(entry, checked)}
                          />
                        </TableCell>
                        <TableCell>{format(new Date(entry.work_date), "d MMM yyyy", { locale: es })}</TableCell>
                        <TableCell>{entry.client_name}</TableCell>
                        <TableCell>
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                            {activityLabels[entry.activity] || entry.activity}
                          </span>
                          {entry.activity === 'otros' && entry.other_activity && (
                            <div className="text-xs text-slate-600 mt-1">{entry.other_activity}</div>
                          )}
                        </TableCell>
                        <TableCell>{entry.hours}h</TableCell>
                        <TableCell>${entry.hourly_rate?.toFixed(2)}</TableCell>
                        <TableCell className="font-semibold">${entry.total_amount?.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {selectedEntries.length > 0 && (
                  <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-green-700">
                          {selectedEntries.length} entradas seleccionadas
                        </p>
                        <p className="text-sm text-green-600">
                          Total de horas: {selectedEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-800">
                          ${calculateTotal().toFixed(2)} AUD
                        </p>
                        <p className="text-sm text-green-600">Total a facturar</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handlePreviewPDF}
                    variant="outline"
                    disabled={loading || selectedEntries.length === 0}
                    className="flex-1"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {loading ? "Generando..." : "Previsualizar PDF"}
                  </Button>
                  <Button
                    onClick={handleGenerateInvoice}
                    disabled={loading || selectedEntries.length === 0}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {loading ? "⏳ Enviando Reporte..." : "Generar y Enviar Reporte"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}