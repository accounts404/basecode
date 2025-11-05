
import React, { useState, useEffect, useCallback } from "react";
import { User } from "@/entities/User";
import { WorkEntry } from "@/entities/WorkEntry";
import { Invoice } from "@/entities/Invoice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Edit, Eye, AlertCircle, Trash2, Download, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

import InvoiceGenerator from "../components/invoices/InvoiceGenerator";
import InvoiceEditor from "../components/invoices/InvoiceEditor";
import PeriodSelector from "../components/reports/PeriodSelector";
import { downloadInvoicePDF } from "../components/invoices/PDFGenerator";

export default function MisFacturasPage() {
  const [user, setUser] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [workEntries, setWorkEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [error, setError] = useState("");
  const [notification, setNotification] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [downloadLoading, setDownloadLoading] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const filterInvoicesByPeriod = useCallback(() => {
    if (!selectedPeriod) {
      setFilteredInvoices(invoices);
      return;
    }

    const filtered = invoices.filter(invoice => {
      if (!invoice.period_start || !invoice.period_end) return false;
      
      const invoiceStart = new Date(invoice.period_start);
      const invoiceEnd = new Date(invoice.period_end);
      
      return (invoiceStart <= selectedPeriod.end && invoiceEnd >= selectedPeriod.start);
    });

    setFilteredInvoices(filtered);
  }, [selectedPeriod, invoices]);

  useEffect(() => {
    filterInvoicesByPeriod();
  }, [selectedPeriod, invoices, filterInvoicesByPeriod]);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const userData = await User.me();
      setUser(userData);
      
      const [invoicesResult, workEntriesResult] = await Promise.allSettled([
        Invoice.filter({ cleaner_id: userData.id }, "-created_date"),
        WorkEntry.filter({ cleaner_id: userData.id }, "-work_date")
      ]);
      
      if (invoicesResult.status === 'rejected') {
        console.error('Error loading invoices:', invoicesResult.reason);
        throw new Error('Error al cargar tus reportes. Revisa tu conexión e inténtalo de nuevo.');
      }
      if (workEntriesResult.status === 'rejected') {
        console.error('Error loading work entries:', workEntriesResult.reason);
        throw new Error('Error al cargar tus horas de trabajo. Revisa tu conexión e inténtalo de nuevo.');
      }

      const allInvoices = invoicesResult.value || [];
      const allWorkEntries = workEntriesResult.value || [];

      // REMOVIDO EL FILTRO DE EXCLUSIÓN DE AGOSTO 2025 - Mostrar todas las facturas
      // The previous filtering logic for `validInvoices` has been removed.
      // All invoices returned from the API will now be displayed, including drafts and any from the August 2025 test period.
      console.log('Loaded all invoices for user:', userData.id, allInvoices.length);
      console.log('Loaded work entries for user:', userData.id, allWorkEntries.length);

      setInvoices(allInvoices);
      setWorkEntries(allWorkEntries);
    } catch (err) {
      console.error("Error loading data:", err);
      setError(err.message || "Ocurrió un error de red. Por favor, intenta de nuevo.");
      setInvoices([]);
      setWorkEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
  };

  const handleInvoiceGenerated = (newInvoice) => {
    setShowGenerator(false);
    setNotification(`Reporte ${newInvoice.invoice_number} enviado exitosamente.`);
    // If the new invoice is a draft, it won't appear immediately in the filtered list based on current rules.
    // If it's submitted, it will appear after loadData.
    loadData(); // Reload data to ensure the new invoice is included if its status is valid
    setTimeout(() => setNotification(""), 5000);
  };

  const handleEditInvoice = (invoice) => {
    setSelectedInvoice(invoice);
    setShowEditor(true);
  };

  const handleDeleteInvoice = async (invoice) => {
    setDeleteLoading(true);
    setError("");
    try {
      if (invoice.work_entries && invoice.work_entries.length > 0) {
        // Filter work entries that were part of this invoice
        const entriesToUpdate = workEntries.filter(we => invoice.work_entries.includes(we.id));

        await Promise.all(
          entriesToUpdate.map(entry => {
            const { id, created_date, updated_date, created_by, ...updateData } = entry; // Destructure to exclude read-only fields

            if (!updateData.cleaner_name && user) {
              updateData.cleaner_name = user.invoice_name || user.full_name;
            }
            
            updateData.invoiced = false; // Mark work entry as uninvoiced

            return WorkEntry.update(entry.id, updateData);
          })
        );
      }

      await Invoice.delete(invoice.id);
      
      setInvoiceToDelete(null);
      loadData(); // Reload data to reflect the deletion
      setNotification(`Reporte ${invoice.invoice_number} eliminado exitosamente.`);
      setTimeout(() => setNotification(""), 5000);
    } catch (err) {
      console.error("Error deleting invoice:", err);
      setError(err.message || "Error al eliminar el reporte. Por favor, inténtalo de nuevo.");
    } finally {
      setDeleteLoading(false);
    }
  };
  
  const handleViewInvoice = async (invoice) => {
    if (invoice.pdf_url) {
      try {
        const response = await fetch(invoice.pdf_url);
        if (!response.ok) {
          throw new Error('No se pudo cargar el archivo del reporte.');
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/pdf')) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
          if (!newWindow) {
            alert("Por favor, permite las ventanas emergentes para ver el reporte.");
          }
        } else {
          // If it's not PDF, assume it's HTML and open it
          const htmlContent = await response.text();
          const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
          if (!newWindow) {
            alert("Por favor, permite las ventanas emergentes para ver el reporte.");
          }
        }
      } catch (error) {
        console.error("Error viewing invoice:", error);
        alert("Error al cargar el reporte: " + error.message);
      }
    } else {
      alert("Error: El archivo del reporte no está disponible.");
    }
  };

  const handleDownloadInvoice = async (invoice) => {
    setDownloadLoading(invoice.id);
    try {
      if (invoice.pdf_url) {
        const response = await fetch(invoice.pdf_url);
        if (!response.ok) {
          throw new Error('No se pudo cargar el archivo del reporte.');
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/pdf')) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Mi_Factura_${invoice.invoice_number}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } else {
          // Fallback if PDF URL provides HTML or other content
          try {
            const invoiceWorkEntries = workEntries.filter(entry => 
              invoice.work_entries && invoice.work_entries.includes(entry.id)
            );
            
            await downloadInvoicePDF(
              user,
              invoice.invoice_number,
              invoiceWorkEntries,
              invoice.total_amount,
              `Mi_Factura_${invoice.invoice_number}.pdf`,
              invoice.created_date // Pass created_date here
            );
          } catch (pdfError) {
            console.warn("PDF download failed using jsPDF, falling back to HTML method:", pdfError);
            // Attempt to print or download as HTML if PDF generation fails
            const htmlContent = await response.text();
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(htmlContent);
            iframeDoc.close();
            
            setTimeout(() => {
              try {
                iframe.contentWindow.print();
                setTimeout(() => {
                  document.body.removeChild(iframe);
                }, 1000); // Give browser time to open print dialog
              } catch (printError) {
                console.error("Error printing:", printError);
                // If printing fails, offer to download as HTML
                const blob = new Blob([htmlContent], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `Mi_Factura_${invoice.invoice_number}.html`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }
            }, 500); // Give iframe time to load content
          }
        }
      } else {
        alert("Error: El archivo del reporte no está disponible.");
      }
    } catch (error) {
      console.error("Error downloading invoice:", error);
      alert("Error al descargar el reporte: " + error.message);
    } finally {
      setDownloadLoading(null);
    }
  };
  
  const handleInvoiceUpdated = () => {
    setShowEditor(false);
    setSelectedInvoice(null);
    loadData(); // Reload data to reflect the update
    setNotification(`Reporte actualizado exitosamente.`);
    setTimeout(() => setNotification(""), 5000);
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3" />
          <span className="text-slate-600">Cargando tus reportes...</span>
        </div>
      </div>
    </div>
  );

  const isUserActive = user?.active !== false;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="w-full">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-3">
              <FileText className="w-8 h-8 text-blue-600" />
              Mis Reportes de Pago
            </h1>
            <p className="text-slate-600">Consulta tu historial de pagos y genera nuevos reportes quincenales.</p>
            {!isUserActive && (
              <p className="text-amber-600 text-sm mt-1">
                Tu cuenta está inactiva. Solo puedes consultar reportes existentes.
              </p>
            )}
          </div>
          {isUserActive && (
            <Dialog open={showGenerator} onOpenChange={setShowGenerator}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
                  <Plus className="w-4 h-4 mr-2" />
                  Generar Reporte de Pago
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Generar Nuevo Reporte de Pago</DialogTitle>
                  <DialogDescription>
                    Selecciona el rango de fechas para generar tu reporte de pago.
                  </DialogDescription>
                </DialogHeader>
                <InvoiceGenerator
                  user={user}
                  workEntries={workEntries}
                  onInvoiceGenerated={handleInvoiceGenerated}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>

        {notification && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {notification}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {user && !notification && (
          <div className="mb-4 p-2 bg-gray-100 rounded text-xs">
            Debug: User ID: {user.id}, Facturas cargadas: {invoices.length}, Filtradas: {filteredInvoices.length}
          </div>
        )}

        <div className="mb-6 max-w-sm">
          <label className="block text-sm font-medium text-slate-700 mb-2">Filtrar por período:</label>
          <PeriodSelector onPeriodChange={handlePeriodChange} />
          {selectedPeriod && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedPeriod(null)}
              className="mt-2 text-slate-500"
            >
              Ver todos mis reportes
            </Button>
          )}
        </div>

        <Card className="shadow-lg border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              {selectedPeriod ? `Reportes del Período Seleccionado (${filteredInvoices.length})` : `Historial de Reportes (${filteredInvoices.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filteredInvoices.length === 0 && !error ? ( 
              <div className="p-12 text-center">
                <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 mb-4">
                  {selectedPeriod ? 'No tienes reportes para el período seleccionado.' : 'No tienes reportes generados aún.'}
                </p>
                {!selectedPeriod && isUserActive && (
                  <Button onClick={() => setShowGenerator(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Generar Primer Reporte
                  </Button>
                )}
                {!selectedPeriod && !isUserActive && (
                  <p className="text-amber-600 text-sm">
                    Tu cuenta está inactiva. No puedes generar nuevos reportes.
                  </p>
                )}
              </div>
            ) : filteredInvoices.length === 0 && error ? null : ( 
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead># Reporte</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Total a Pagar</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {invoice.period_start && invoice.period_end ? 
                            `${format(new Date(invoice.period_start), "d MMM", { locale: es })} - ${format(new Date(invoice.period_end), "d MMM yyyy", { locale: es })}` : 
                            invoice.period || 'No especificado'
                          }
                        </TableCell>
                        <TableCell className="font-semibold whitespace-nowrap">${invoice.total_amount?.toFixed(2)} AUD</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                            invoice.status === 'submitted' ? 'bg-blue-100 text-blue-800' :
                            invoice.status === 'reviewed' ? 'bg-purple-100 text-purple-800' :
                            invoice.status === 'draft' ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {invoice.status === 'paid' ? 'Pagado' :
                             invoice.status === 'submitted' ? 'Enviado' :
                             invoice.status === 'reviewed' ? 'Revisado' :
                             'Borrador'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleViewInvoice(invoice)}
                              title="Ver Reporte"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleDownloadInvoice(invoice)}
                              title="Descargar PDF"
                              disabled={downloadLoading === invoice.id}
                            >
                              <Download className={`h-4 w-4 ${downloadLoading === invoice.id ? 'animate-spin' : ''}`} />
                            </Button>
                            {/* Edit/Delete buttons for drafts are now explicitly handled here */}
                            {invoice.status === 'draft' && isUserActive && ( 
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => handleEditInvoice(invoice)}
                                  title="Modificar reporte"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Dialog 
                                  open={invoiceToDelete?.id === invoice.id} 
                                  onOpenChange={(isOpen) => {
                                    if (!isOpen) {
                                      setInvoiceToDelete(null);
                                    }
                                  }}
                                >
                                  <DialogTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => setInvoiceToDelete(invoice)}
                                      title="Eliminar reporte"
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Eliminar Reporte</DialogTitle>
                                      <DialogDescription>
                                        ¿Estás seguro de que quieres eliminar el reporte {invoiceToDelete?.invoice_number}? Esta acción es irreversible.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <Alert className="border-amber-200 bg-amber-50">
                                      <AlertCircle className="h-4 w-4 text-amber-600" />
                                      <AlertDescription className="text-amber-800">
                                        <strong>Importante:</strong> Al eliminar este reporte, todas las horas de trabajo incluidas se marcarán como "no facturadas" y podrás incluirlas en un nuevo reporte.
                                      </AlertDescription>
                                    </Alert>
                                    <DialogFooter>
                                      <Button 
                                        variant="outline" 
                                        onClick={() => setInvoiceToDelete(null)}
                                        disabled={deleteLoading}
                                      >
                                        Cancelar
                                      </Button>
                                      <Button 
                                        variant="destructive"
                                        onClick={() => handleDeleteInvoice(invoiceToDelete)}
                                        disabled={deleteLoading}
                                      >
                                        {deleteLoading ? "Eliminando..." : "Eliminar Reporte"}
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {isUserActive && (
          <Dialog open={showEditor} onOpenChange={setShowEditor}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Modificar Reporte {selectedInvoice?.invoice_number}</DialogTitle>
                <DialogDescription>
                  Edita los detalles del reporte y apruébalo para enviarlo.
                </DialogDescription>
              </DialogHeader>
              {selectedInvoice && (
                <InvoiceEditor
                  user={user}
                  invoice={selectedInvoice}
                  workEntries={workEntries}
                  onInvoiceUpdated={handleInvoiceUpdated}
                  onCancel={() => setShowEditor(false)}
                />
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
