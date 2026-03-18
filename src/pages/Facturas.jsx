import React, { useState, useEffect, useCallback } from "react";
import { User } from "@/entities/User";
import { Invoice } from "@/entities/Invoice";
import { WorkEntry } from "@/entities/WorkEntry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Download, Eye, Check, DollarSign, Calendar, AlertCircle, Trash2, Clock, Users, AlertTriangle, RefreshCw, CheckCircle, Settings, Mail, CreditCard, TrendingUp, Activity, User as UserIcon, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import PeriodSelector from "../components/reports/PeriodSelector";
import { downloadInvoicePDF } from "../components/invoices/PDFGenerator";
import { sendPaymentConfirmation } from "../functions/sendPaymentConfirmation";
import { sendManualReminder } from "../functions/sendManualReminder";
import { sendPaymentReminders } from "../functions/sendPaymentReminders";

export default function FacturasPage() {
  const [user, setUser] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [workEntries, setWorkEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [error, setError] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(null);

  // New state variables
  const [pendingCleaners, setPendingCleaners] = useState([]);
  const [reminderMessage, setReminderMessage] = useState('');
  const [selectedCleaners, setSelectedCleaners] = useState([]);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [emailConfig, setEmailConfig] = useState({
    reminder_template: '',
    payment_confirmation_template: ''
  });
  const [notification, setNotification] = useState(null); // For success/info messages
  const [emailConfigOpen, setEmailConfigOpen] = useState(false);
  const [savingEmailConfig, setSavingEmailConfig] = useState(false);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const filterInvoicesByPeriod = useCallback(() => {
    let invoicesToFilter = invoices || []; // Start with all invoices (or empty array)

    if (selectedPeriod) {
      invoicesToFilter = invoicesToFilter.filter(invoice => {
        if (!invoice.period_start || !invoice.period_end) return false;
      
        const invoiceStart = new Date(invoice.period_start);
        const invoiceEnd = new Date(invoice.period_end);
        
        // Check for overlap: [start1, end1] overlaps with [start2, end2] if start1 <= end2 and end1 >= start2
        return (invoiceStart <= selectedPeriod.end && invoiceEnd >= selectedPeriod.start);
      });
    }

    // Ordenar: pendientes (submitted) primero, pagadas al final, luego por fecha de creación descendente
    const sorted = invoicesToFilter.sort((a, b) => {
      // 'submitted' invoices come first
      if (a.status === 'submitted' && b.status !== 'submitted') return -1;
      if (a.status !== 'submitted' && b.status === 'submitted') return 1;

      // 'paid' invoices come last
      if (a.status === 'paid' && b.status !== 'paid') return 1;
      if (a.status !== 'paid' && b.status === 'paid') return -1;

      // For all other cases (e.g., both submitted, both paid, or both other/draft),
      // or if the statuses are not 'submitted' or 'paid' in a way that differentiates them by the above rules,
      // sort by created_date (descending)
      return new Date(b.created_date).getTime() - new Date(a.created_date).getTime();
    });

    setFilteredInvoices(sorted);
  }, [selectedPeriod, invoices]);

  // Apply filter when selectedPeriod or invoices change
  useEffect(() => {
    filterInvoicesByPeriod();
  }, [filterInvoicesByPeriod]); // Dependencies are correctly handled by useCallback

  const loadPendingCleaners = useCallback(async () => {
    if (!selectedPeriod) {
        setPendingCleaners([]);
        return;
    }

    try {
        // 1. Filter WorkEntry for the selected period.
        const periodWorkEntries = (workEntries || []).filter(entry => {
            try {
                const workDate = new Date(entry.work_date);
                return workDate >= selectedPeriod.start && workDate <= selectedPeriod.end;
            } catch { return false; }
        });

        // 2. Aggregate WorkEntry by cleaner to get total hours and amounts.
        const workDataByCleanerId = new Map();
        periodWorkEntries.forEach(entry => {
            if (!workDataByCleanerId.has(entry.cleaner_id)) {
                workDataByCleanerId.set(entry.cleaner_id, { total_hours: 0, total_amount: 0, work_count: 0 });
            }
            const data = workDataByCleanerId.get(entry.cleaner_id);
            data.total_hours += entry.hours || 0;
            data.total_amount += entry.total_amount || 0;
            data.work_count += 1;
        });

        // 3. Get IDs of cleaners who already have an invoice for this period.
        const cleanersWithInvoices = new Set((filteredInvoices || []).map(inv => inv.cleaner_id));

        // 4. Build the list of pending cleaners: those who worked but haven't invoiced.
        const pending = [];
        const allUsersMap = new Map((users || []).map(u => [u.id, u]));

        for (const [cleanerId, workData] of workDataByCleanerId.entries()) {
            if (!cleanersWithInvoices.has(cleanerId)) {
                const cleaner = allUsersMap.get(cleanerId);
                if (cleaner) { // Ensure cleaner details are available
                    pending.push({
                        cleaner_id: cleaner.id,
                        cleaner_name: cleaner.invoice_name || cleaner.full_name,
                        full_name: cleaner.full_name,
                        invoice_name: cleaner.invoice_name,
                        employee_type: cleaner.employee_type || 'casual', // Keep employee_type for display/info if needed
                        email: cleaner.email,
                        active: cleaner.active !== false,
                        ...workData // Include aggregated work data
                    });
                }
            }
        }
      
      pending.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
      setPendingCleaners(pending);

    } catch (error) {
      console.error("Error loading pending cleaners:", error);
      setError("Error al procesar los limpiadores pendientes: " + error.message);
      setPendingCleaners([]);
    }
  }, [selectedPeriod, filteredInvoices, users, workEntries]);

  // New useEffect for pending cleaners
  useEffect(() => {
    if (selectedPeriod) { // Only load if a period is selected
      loadPendingCleaners();
    } else {
      setPendingCleaners([]); // Clear if no period selected
    }
  }, [selectedPeriod, filteredInvoices, users, workEntries, loadPendingCleaners]); // Dependencies updated

  // Load email config when component mounts or user changes
  useEffect(() => {
    if (user?.role === 'admin') {
      loadEmailConfig();
    }
  }, [user]);

  const loadAllRecords = async (entityName, sortField = '-created_date') => {
    const { base44 } = await import('@/api/base44Client');
    const BATCH_SIZE = 5000;
    let allRecords = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await base44.entities[entityName].list(sortField, BATCH_SIZE, skip);
      const batchArray = Array.isArray(batch) ? batch : [];
      
      allRecords = [...allRecords, ...batchArray];
      
      if (batchArray.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        skip += BATCH_SIZE;
      }
    }

    return allRecords;
  };

  const loadData = async () => {
    setLoading(true);
    setError(""); // Reset error
    try {
      const userData = await User.me();
      setUser(userData);
      if (userData.role === 'admin') {
        console.log('[Facturas] 📊 Cargando TODOS los registros con paginación...');
        
        const [invoicesData, workEntriesData, usersData] = await Promise.all([
          loadAllRecords('Invoice', '-created_date'),
          loadAllRecords('WorkEntry', '-work_date'),
          loadAllRecords('User', '-created_date'),
        ]);
        
        console.log('[Facturas] ✅ Registros cargados:', {
          invoices: invoicesData?.length || 0,
          workEntries: workEntriesData?.length || 0,
          users: usersData?.length || 0
        });

        setInvoices(invoicesData || []);
        setWorkEntries(workEntriesData || []);
        setUsers(usersData || []);
      }
    } catch (err) {
      console.error("Error loading data:", err);
      setError(err.message || "Ocurrió un error de red. Por favor, intenta de nuevo.");
      setInvoices([]);
      setWorkEntries([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
    setSelectedCleaners([]); // Clear selected cleaners when period changes
    setReminderMessage(''); // Clear custom message
  };

  const handleMarkAsPaid = async (invoice) => {
    setActionLoading(true);
    const currentPeriod = selectedPeriod; // Guardar período actual
    try {
      await Invoice.update(invoice.id, {
        status: 'paid',
        payment_date: format(paymentDate, 'yyyy-MM-dd'),
        admin_notes: adminNotes
      });
      
      // Enviar confirmación de pago por email
      try {
        const cleaner = users.find(u => u.id === invoice.cleaner_id);
        if (cleaner && cleaner.email) {
          await sendPaymentConfirmation({
            invoice_id: invoice.id,
            cleaner_email: cleaner.email,
            cleaner_name: cleaner.full_name || invoice.cleaner_name,
            total_amount: invoice.total_amount,
            period_label: invoice.period_start && invoice.period_end ? 
              `${format(new Date(invoice.period_start), "d MMM", { locale: es })} - ${format(new Date(invoice.period_end), "d MMM yyyy", { locale: es })}` :
              invoice.period // Fallback to period string if dates not available
          });
        }
      } catch (emailError) {
        console.error("Error enviando confirmación:", emailError);
        // No fallar toda la operación por un error de email
      }
      
      setSelectedInvoice(null);
      setAdminNotes("");
      setPaymentDate(new Date()); // Reset date
      await loadData(); // Refresh the list
      setSelectedPeriod(currentPeriod); // Restaurar período
      setNotification({ type: "success", message: `Reporte ${invoice.invoice_number} marcado como pagado.` });
    } catch (error) {
      console.error("Error marking invoice as paid:", error);
      setError(error.message || "Error al marcar el reporte como pagado.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteInvoice = async (invoice) => {
    setDeleteLoading(true);
    setError("");
    const currentPeriod = selectedPeriod; // Guardar período actual
    try {
      if (invoice.work_entries && invoice.work_entries.length > 0) {
        // Find the full work entry objects from the state
        const entriesToUpdate = workEntries.filter(we => invoice.work_entries.includes(we.id));

        await Promise.all(
          entriesToUpdate.map(entry => {
            // Destructure to remove read-only fields and get data for update
            const { id, created_date, updated_date, created_by, ...updateData } = entry;

            // FIX: Ensure cleaner_name is present for the update, patching if necessary.
            // cleaner_name is derived from the cleaner user, prefer invoice_name then full_name
            if (!updateData.cleaner_name) {
              const cleaner = users.find(u => u.id === entry.cleaner_id);
              updateData.cleaner_name = cleaner ? (cleaner.invoice_name || cleaner.full_name) : `Limpiador ID ${entry.cleaner_id}`;
            }
            
            updateData.invoiced = false;
            
            return WorkEntry.update(entry.id, updateData);
          })
        );
      }
      await Invoice.delete(invoice.id);
      setInvoiceToDelete(null);
      await loadData();
      setSelectedPeriod(currentPeriod); // Restaurar período
      setNotification({ type: "success", message: `Reporte ${invoice.invoice_number} eliminado exitosamente.` });
    } catch (err) {
      console.error("Error deleting invoice:", err);
      setError(err.message || "Error al eliminar el reporte.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSendReminders = async () => {
    if (selectedCleaners.length === 0) {
      setError("Por favor selecciona al menos un limpiador.");
      return;
    }
    if (!selectedPeriod) {
      setError("Por favor selecciona un período para enviar recordatorios.");
      return;
    }

    setReminderLoading(true);
    setError("");
    setNotification(null); // Clear previous notification

    try {
      const response = await sendManualReminder({
        cleaner_ids: selectedCleaners,
        period_label: selectedPeriod ? 
          `${format(selectedPeriod.start, "d MMM", { locale: es })} - ${format(selectedPeriod.end, "d MMM yyyy", { locale: es })}` :
          'Período Actual',
        custom_message: reminderMessage.trim() || undefined
      });

      const { data } = response;
      if (data.success) {
        setNotification({
          type: "success",
          message: `Recordatorios enviados exitosamente a ${data.reminders_sent} limpiadores.`
        });
        setSelectedCleaners([]);
        setReminderMessage('');
      } else {
        throw new Error(data.error || 'Error enviando recordatorios');
      }
    } catch (error) {
      console.error("Error sending reminders:", error);
      setError(error.message || "Error enviando recordatorios.");
    } finally {
      setReminderLoading(false);
    }
  };

  const handleTestAutomaticReminders = async () => {
    setReminderLoading(true);
    setError("");
    setNotification(null); // Clear previous notification

    try {
      const response = await sendPaymentReminders({});
      const { data } = response;
      
      setNotification({
        type: "success",
        message: `Prueba completada. Se habrían enviado ${data.reminders_sent || 0} recordatorios automáticos.`
      });
    } catch (error) {
      setError("Error probando recordatorios automáticos: " + (error.response?.data?.message || error.message));
    } finally {
      setReminderLoading(false);
    }
  };

  const loadEmailConfig = async () => {
    try {
      const userData = await User.me();
      const config = userData.email_config || {};
      
      const defaultReminderTemplate = `¡Hola {cleaner_name}!

El período de {period_label} ha terminado y detectamos que tienes {total_hours} horas de trabajo registradas que aún no han sido incluidas en un reporte de pago.

📊 Resumen de tu trabajo pendiente:
• Total de horas: {total_hours}h
• Valor estimado: ${'{total_amount}'} AUD
• Trabajos realizados: {work_count}

Por favor, ingresa a la aplicación y genera tu reporte de pago lo antes posible para procesar tu pago.

Si tienes alguna pregunta, no dudes en contactarnos.

¡Gracias por tu excelente trabajo!

RedOak Cleaning Solutions`;

      const defaultPaymentTemplate = `¡Hola {cleaner_name}!

Nos complace informarte que tu pago ha sido procesado exitosamente.

💰 Detalles del pago:
• Período: {period_label}
• Monto: ${'{total_amount}'} AUD
• Fecha de procesamiento: {payment_date}

El pago debería reflejarse en tu cuenta bancaria en 1-2 días hábiles.

Si tienes alguna pregunta sobre este pago, no dudes en contactarnos.

¡Gracias por ser parte del equipo RedOak!

RedOak Cleaning Solutions`;

      setEmailConfig({
        reminder_template: config.reminder_template || defaultReminderTemplate,
        payment_confirmation_template: config.payment_confirmation_template || defaultPaymentTemplate
      });
    } catch (error) {
      console.error("Error loading email config:", error);
    }
  };

  const saveEmailConfig = async () => {
    setSavingEmailConfig(true);
    setError("");
    setNotification(null);

    try {
      await User.updateMyUserData({
        email_config: emailConfig
      });
      
      setNotification({
        type: "success",
        message: "Configuración de emails guardada exitosamente."
      });
      
      setTimeout(() => {
        setEmailConfigOpen(false);
        setNotification(null);
      }, 2000);
    } catch (error) {
      setError("Error guardando configuración: " + error.message);
    } finally {
      setSavingEmailConfig(false);
    }
  };

  const handleSelectAllPending = (checked) => {
    if (checked) {
      // Select only active cleaners with an email
      setSelectedCleaners(pendingCleaners.filter(c => c.active && c.email).map(c => c.cleaner_id));
    } else {
      setSelectedCleaners([]);
    }
  };

  const handleSelectCleaner = (cleanerId, checked) => {
    if (checked) {
      setSelectedCleaners(prev => [...prev, cleanerId]);
    } else {
      setSelectedCleaners(prev => prev.filter(id => id !== cleanerId));
    }
  };

  // Leer fecha YYYY-MM-DD como local (sin timezone) para evitar el desfase UTC
  const formatLocalDate = (dateStr, formatStr = "d MMM yyyy") => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
    return format(new Date(year, month - 1, day), formatStr, { locale: es });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary" className="px-3 py-1 text-sm rounded-full bg-slate-100 text-slate-700">Borrador</Badge>;
      case 'submitted':
        return <Badge className="px-3 py-1 text-sm rounded-full bg-amber-100 text-amber-800">Pendiente Revisión</Badge>;
      case 'paid':
        return <Badge className="px-3 py-1 text-sm rounded-full bg-green-100 text-green-800">Pagada</Badge>;
      default:
        return <Badge variant="secondary" className="px-3 py-1 text-sm rounded-full">{(status || 'desconocido').charAt(0).toUpperCase() + (status || 'desconocido').slice(1)}</Badge>;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'submitted': return 'border-amber-400';
      case 'paid': return 'border-green-400';
      default: return 'border-slate-400';
    }
  };

  const handleViewInvoice = async (invoice) => {
    if (invoice.pdf_url) {
      try {
        const response = await fetch(invoice.pdf_url);
        if (!response.ok) {
          throw new Error('No se pudo cargar el archivo del reporte.');
        }
        
        // Check if it's a PDF or HTML
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/pdf')) {
          // It's a PDF, open directly
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
          if (!newWindow) {
            alert("Por favor, permite las ventanas emergentes para ver el reporte.");
          }
        } else {
          // It's HTML, handle as before
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
      alert("Error: El archivo del reporte no está disponible. Contacta al soporte si el problema persiste.");
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
        
        // Check if it's a PDF or HTML  
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/pdf')) {
          // It's already a PDF, download directly
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Factura_${invoice.invoice_number}_${invoice.cleaner_name.replace(/\s+/g, '_')}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } else {
          // It's HTML, try to generate PDF, fallback to HTML download/print
          try {
            // Get work entries for this invoice
            const invoiceWorkEntries = workEntries.filter(entry => 
              invoice.work_entries && invoice.work_entries.includes(entry.id)
            );
            
            // Find the cleaner user
            const cleaner = users.find(u => u.id === invoice.cleaner_id);
            
            if (cleaner) {
              await downloadInvoicePDF(
                cleaner,
                invoice.invoice_number,
                invoiceWorkEntries,
                invoice.total_amount,
                `Factura_${invoice.invoice_number}_${invoice.cleaner_name.replace(/\s+/g, '_')}.pdf`,
                invoice.created_date // Pass the invoice creation date
              );
            } else {
              throw new Error('No se encontró la información del limpiador para generar el PDF. Cayendo a descarga HTML.');
            }
          } catch (pdfGenerationError) {
            console.warn("PDF generation failed, falling back to HTML method:", pdfGenerationError);
            // Fallback to HTML method
            const htmlContent = await response.text();
            
            // Create a temporary iframe to render the HTML
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(htmlContent);
            iframeDoc.close();
            
            setTimeout(() => {
              try {
                // Trigger print dialog which allows saving as PDF
                iframe.contentWindow.print();
                
                // Clean up after a delay
                setTimeout(() => {
                  document.body.removeChild(iframe);
                }, 1000);
              } catch (printError) {
                console.error("Error printing or saving as PDF from HTML:", printError);
                // Fallback: download HTML file
                const blob = new Blob([htmlContent], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `Factura_${invoice.invoice_number}_${invoice.cleaner_name.replace(/\s+/g, '_')}.html`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }
            }, 500);
          }
        }
      } else {
        alert("Error: El archivo del reporte no está disponible. Contacta al soporte si el problema persiste.");
      }
    } catch (error) {
      console.error("Error downloading invoice:", error);
      setError(error.message || "Error al descargar el reporte.");
    } finally {
      setDownloadLoading(null);
    }
  };
  
  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6 md:p-8">
      <div className="w-full">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <span className="text-slate-600 text-lg">Cargando información financiera...</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (user?.role !== 'admin') return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6 md:p-8">
      <div className="w-full">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Acceso Restringido</h2>
            <p className="text-slate-600">Solo los administradores pueden acceder a esta sección.</p>
          </div>
        </div>
      </div>
    </div>
  );

  const stats = {
    pending: filteredInvoices.filter(inv => inv.status === 'submitted').length,
    paid: filteredInvoices.filter(inv => inv.status === 'paid').length,
    total: filteredInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 sm:p-6 md:p-8">
      <div className="w-full">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2">
              <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-lg">
                  <CreditCard className="w-8 h-8 text-white" />
                </div>
                Gestión de Pagos
              </h1>
              <p className="text-slate-600 text-lg">
                Sistema integral de seguimiento y procesamiento de pagos para limpiadores
              </p>
            </div>
            <Dialog open={emailConfigOpen} onOpenChange={setEmailConfigOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="flex items-center gap-2 h-12 px-6 bg-white/80 backdrop-blur-sm border-slate-200 hover:bg-white hover:border-blue-300 shadow-sm"
                >
                  <Settings className="w-5 h-5" />
                  Configurar Emails
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Configuración de Emails Automáticos</DialogTitle>
                  <DialogDescription>
                    Personaliza los mensajes que se envían automáticamente a los limpiadores.
                    Puedes usar las siguientes variables que se reemplazarán automáticamente:
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-6 py-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Variables disponibles:</strong> {'{cleaner_name}'}, {'{period_label}'}, {'{total_hours}'}, {'{total_amount}'}, {'{work_count}'}, {'{payment_date}'}
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <Label htmlFor="reminder_template">Plantilla de Recordatorio de Reporte</Label>
                    <p className="text-sm text-slate-600">Este mensaje se envía automáticamente los días 1 y 16 a limpiadores con horas pendientes de facturar.</p>
                    <Textarea
                      id="reminder_template"
                      value={emailConfig.reminder_template}
                      onChange={(e) => setEmailConfig(prev => ({ ...prev, reminder_template: e.target.value }))}
                      rows={12}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="payment_template">Plantilla de Confirmación de Pago</Label>
                    <p className="text-sm text-slate-600">Este mensaje se envía cuando marcas una factura como "Pagada".</p>
                    <Textarea
                      id="payment_template"
                      value={emailConfig.payment_confirmation_template}
                      onChange={(e) => setEmailConfig(prev => ({ ...prev, payment_confirmation_template: e.target.value }))}
                      rows={12}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setEmailConfigOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={saveEmailConfig} disabled={savingEmailConfig}>
                    {savingEmailConfig ? "Guardando..." : "Guardar Configuración"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Alerts Section */}
        {error && (
          <Alert variant="destructive" className="mb-6 shadow-lg border-0">
            <AlertCircle className="h-5 w-5" />
            <AlertDescription className="text-base">{error}</AlertDescription>
          </Alert>
        )}

        {notification && (
          <Alert variant={notification.type === "success" ? "default" : "destructive"} className="mb-6 shadow-lg border-0 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
            {notification.type === "success" ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5" />}
            <AlertDescription className="text-green-800 font-medium text-base">{notification.message}</AlertDescription>
          </Alert>
        )}

        {/* Period Filter */}
        <Card className="mb-8 shadow-xl border-0 bg-white/70 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <label className="text-lg font-semibold text-slate-700">Filtrar por período:</label>
            </div>
            <div className="max-w-sm">
              <PeriodSelector onPeriodChange={handlePeriodChange} />
            </div>
            {selectedPeriod && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => handlePeriodChange(null)}
                className="mt-3 text-slate-500 hover:text-slate-700"
              >
                <X className="w-4 h-4 mr-2" />
                Ver todos los reportes
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Enhanced Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card className="shadow-xl border-0 bg-gradient-to-br from-amber-500 to-orange-600 text-white overflow-hidden relative group hover:shadow-2xl transition-all duration-300">
            <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full"></div>
            <CardContent className="p-6 relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-sm font-medium mb-1">Pendientes de Revisión</p>
                  <p className="text-4xl font-bold mb-1">{stats.pending}</p>
                  <p className="text-amber-200 text-xs">Reportes enviados</p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <FileText className="w-8 h-8 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl border-0 bg-gradient-to-br from-emerald-500 to-green-600 text-white overflow-hidden relative group hover:shadow-2xl transition-all duration-300">
            <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full"></div>
            <CardContent className="p-6 relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium mb-1">Pagados</p>
                  <p className="text-4xl font-bold mb-1">{stats.paid}</p>
                  <p className="text-green-200 text-xs">Completados</p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl border-0 bg-gradient-to-br from-purple-500 to-indigo-600 text-white overflow-hidden relative group hover:shadow-2xl transition-all duration-300">
            <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full"></div>
            <CardContent className="p-6 relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium mb-1">
                    {selectedPeriod ? 'Total Período' : 'Total General'}
                  </p>
                  <p className="text-4xl font-bold mb-1">
                    ${stats.total.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-purple-200 text-xs">AUD procesados</p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Tabs */}
        <Tabs defaultValue="invoices" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8 bg-white/70 backdrop-blur-sm p-1 rounded-xl shadow-lg h-14">
            <TabsTrigger 
              value="invoices" 
              className="flex items-center gap-2 text-base font-medium data-[state=active]:bg-white data-[state=active]:shadow-md rounded-lg transition-all duration-200"
            >
              <FileText className="w-5 h-5" />
              Facturas Generadas
            </TabsTrigger>
            <TabsTrigger 
              value="pending" 
              className="flex items-center gap-2 text-base font-medium data-[state=active]:bg-white data-[state=active]:shadow-md rounded-lg transition-all duration-200"
            >
              <Activity className="w-5 h-5" />
              Control de Reportes
            </TabsTrigger>
            <TabsTrigger 
              value="notifications" 
              className="flex items-center gap-2 text-base font-medium data-[state=active]:bg-white data-[state=active]:shadow-md rounded-lg transition-all duration-200"
            >
              <Mail className="w-5 h-5" />
              Notificaciones
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="invoices" className="mt-6">
            <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-t-lg border-b">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                  {selectedPeriod ? `Reportes del Período (${filteredInvoices.length})` : `Todos los Reportes (${filteredInvoices.length})`}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {filteredInvoices.length === 0 ? (
                  <div className="p-16 text-center">
                    <div className="p-6 bg-slate-100 rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                      <FileText className="w-12 h-12 text-slate-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-2">
                      {selectedPeriod ? 'No hay reportes para este período' : 'No hay reportes generados'}
                    </h3>
                    <p className="text-slate-500 text-lg">
                      {selectedPeriod ? 'Intenta seleccionar un período diferente.' : 'Los reportes aparecerán aquí cuando los limpiadores los envíen.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredInvoices.map((invoice) => {
                      const invoiceWorkEntries = workEntries.filter(entry => 
                        invoice.work_entries && invoice.work_entries.includes(entry.id)
                      );
                      const totalHours = invoiceWorkEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
                      
                      // Find the cleaner user for photo
                      const cleaner = users.find(u => u.id === invoice.cleaner_id);

                      return (
                        <div key={invoice.id} className={`p-6 hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50/30 transition-all duration-200 border-l-4 ${getStatusColor(invoice.status)}`}>
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                            <div className="flex-1 space-y-4">
                              {/* Header with Photo */}
                              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                <div className="flex items-center gap-4">
                                  {/* Cleaner Photo */}
                                  <Avatar className="w-12 h-12 border-2 border-slate-200 shadow-sm">
                                    <AvatarImage 
                                      src={cleaner?.profile_photo_url} 
                                      alt={invoice.cleaner_name} 
                                    />
                                    <AvatarFallback className="bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 font-semibold">
                                      {invoice.cleaner_name?.charAt(0)?.toUpperCase() || 'L'}
                                    </AvatarFallback>
                                  </Avatar>
                                  
                                  <div>
                                    <h3 className="text-xl font-bold text-slate-900">
                                      {invoice.invoice_number}
                                    </h3>
                                    <p className="text-slate-600 font-medium">{invoice.cleaner_name}</p>
                                  </div>
                                </div>
                                {getStatusBadge(invoice.status)}
                              </div>
                              
                              {/* Details Grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Calendar className="w-4 h-4 text-blue-500" />
                                    <p className="font-medium text-slate-600 text-sm">Período</p>
                                  </div>
                                  <p className="text-slate-900 font-semibold">
                                    {invoice.period_start && invoice.period_end ? 
                                       `${formatLocalDate(invoice.period_start, "d MMM")} - ${formatLocalDate(invoice.period_end, "d MMM yyyy")}` : 
                                       invoice.period || 'No especificado'
                                     }
                                  </p>
                                </div>

                                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Clock className="w-4 h-4 text-purple-500" />
                                    <p className="font-medium text-slate-600 text-sm">Horas Totales</p>
                                  </div>
                                  <p className="text-slate-900 font-semibold text-lg">
                                    {totalHours.toFixed(1)}h
                                  </p>
                                </div>

                                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                  <div className="flex items-center gap-2 mb-2">
                                    <TrendingUp className="w-4 h-4 text-green-500" />
                                    <p className="font-medium text-slate-600 text-sm">Total a Pagar</p>
                                  </div>
                                  <p className="text-2xl font-bold text-green-600">
                                    ${invoice.total_amount?.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                  </p>
                                  <p className="text-xs text-slate-500">AUD</p>
                                </div>

                                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                  <div className="flex items-center gap-2 mb-2">
                                    <AlertCircle className="w-4 h-4 text-slate-500" />
                                    <p className="font-medium text-slate-600 text-sm">Fechas</p>
                                  </div>
                                  <p className="text-xs text-slate-600">
                                    <span className="font-medium">Creado:</span> {formatLocalDate(invoice.created_date, "d MMM yyyy")}
                                  </p>
                                  {invoice.payment_date && (
                                    <p className="text-xs text-green-600 mt-1">
                                      <span className="font-medium">Pagado:</span> {format(new Date(invoice.payment_date), "d MMM yyyy", { locale: es })}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Admin Notes */}
                              {invoice.admin_notes && (
                                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                                  <div className="flex items-center gap-2 mb-2">
                                    <FileText className="w-4 h-4 text-blue-600" />
                                    <p className="text-sm font-semibold text-blue-800">Notas del Administrador</p>
                                  </div>
                                  <p className="text-sm text-blue-700">{invoice.admin_notes}</p>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 lg:w-48">
                              <div className="flex sm:flex-col lg:flex-col gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleDownloadInvoice(invoice)}
                                  disabled={downloadLoading === invoice.id}
                                  className="flex-1 lg:w-full hover:bg-green-50 hover:border-green-300"
                                >
                                  <Download className={`h-4 w-4 mr-2 ${downloadLoading === invoice.id ? 'animate-spin' : ''}`} />
                                  Descargar
                                </Button>
                                
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setInvoiceToDelete(invoice)}
                                  disabled={invoice.status === 'paid'}
                                  className={`flex-1 lg:w-full ${invoice.status !== 'paid' ? 'hover:bg-red-50 hover:border-red-300 text-red-600' : 'opacity-50 cursor-not-allowed'}`}
                                  title={invoice.status === 'paid' ? 'No se pueden eliminar reportes pagados' : 'Eliminar Reporte'}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Eliminar
                                </Button>
                              </div>
                              
                              <div className="flex sm:flex-col lg:flex-col gap-2">
                                {invoice.status !== 'paid' && (
                                  <Dialog open={selectedInvoice?.id === invoice.id} onOpenChange={(isOpen) => !isOpen && setSelectedInvoice(null)}>
                                    <DialogTrigger asChild>
                                      <Button 
                                        size="sm"
                                        className="flex-1 lg:w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-md"
                                        onClick={() => {
                                          setSelectedInvoice(invoice);
                                          setAdminNotes(invoice.admin_notes || "");
                                          setPaymentDate(new Date());
                                        }}
                                      >
                                        <Check className="h-4 w-4 mr-2" />
                                        Marcar Pagado
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle>Confirmar Pago de Reporte</DialogTitle>
                                      </DialogHeader>
                                      <div className="space-y-4 py-4">
                                        <Alert>
                                          <FileText className="h-4 w-4" />
                                          <AlertDescription>
                                            Reporte: <strong>{selectedInvoice?.invoice_number}</strong> - <strong>${selectedInvoice?.total_amount?.toFixed(2)} AUD</strong>
                                          </AlertDescription>
                                        </Alert>
                                        
                                        <div className="space-y-2">
                                          <Label htmlFor="payment_date">Fecha de Pago *</Label>
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                <Calendar className="mr-2 h-4 w-4" />
                                                {paymentDate ? format(paymentDate, "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                                              </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                              <CalendarPicker
                                                                                                mode="single"
                                                                                                selected={paymentDate}
                                                                                                onSelect={setPaymentDate}
                                                                                                initialFocus
                                              />
                                            </PopoverContent>
                                          </Popover>
                                        </div>

                                        <div className="space-y-2">
                                          <Label htmlFor="admin_notes">Notas del pago (opcional):</Label>
                                          <Textarea
                                            id="admin_notes"
                                            value={adminNotes}
                                            onChange={(e) => setAdminNotes(e.target.value)}
                                            placeholder="Ej: Pago realizado via transferencia bancaria."
                                            rows={3}
                                          />
                                        </div>
                                      </div>
                                      <DialogFooter>
                                        <Button variant="outline" onClick={() => setSelectedInvoice(null)}>
                                          Cancelar
                                        </Button>
                                        <Button 
                                          onClick={() => handleMarkAsPaid(selectedInvoice)}
                                          disabled={actionLoading || !paymentDate}
                                          className="bg-green-600 hover:bg-green-700"
                                        >
                                          {actionLoading ? "Procesando..." : "Confirmar Pago"}
                                        </Button>
                                      </DialogFooter>
                                    </DialogContent>
                                  </Dialog>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending" className="mt-6">
            <div className="space-y-6">
              {/* Resumen del Estado */}
              <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
                <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-t-lg border-b">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Users className="w-6 h-6 text-orange-600" />
                    </div>
                    Estado de Reportes - {selectedPeriod ? 
                      `${format(selectedPeriod.start, "d MMM", { locale: es })} - ${format(selectedPeriod.end, "d MMM yyyy", { locale: es })}` : 
                      'Selecciona un período'
                    }
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {!selectedPeriod ? (
                    <Alert className="shadow-sm border-orange-200 bg-orange-50 text-orange-800">
                      <AlertCircle className="h-5 w-5 text-orange-600" />
                      <AlertDescription className="text-base">
                        Por favor selecciona un período arriba para ver el estado de los reportes.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                        <div className="text-3xl font-bold text-green-800">{filteredInvoices.length}</div>
                        <div className="text-sm text-green-600 mt-1">Reportes Recibidos</div>
                      </div>
                      <div className="text-center p-4 bg-amber-50 rounded-lg border border-amber-200">
                        <div className="text-3xl font-bold text-amber-800">{pendingCleaners.length}</div>
                        <div className="text-sm text-amber-600 mt-1">Pendientes de Reporte</div>
                      </div>
                      <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-3xl font-bold text-blue-800">
                          ${pendingCleaners.reduce((sum, c) => sum + c.total_amount, 0).toFixed(2)}
                        </div>
                        <div className="text-sm text-blue-600 mt-1">Valor Pendiente AUD</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Lista de Pendientes */}
              {selectedPeriod && (
                <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
                  <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-t-lg border-b">
                    <div className="flex justify-between items-center">
                      <CardTitle className="flex items-center gap-3 text-xl">
                        <div className="p-2 bg-amber-100 rounded-lg">
                          <AlertTriangle className="w-6 h-6 text-orange-600" />
                        </div>
                        Limpiadores Pendientes de Generar Reporte
                      </CardTitle>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleTestAutomaticReminders}
                          disabled={reminderLoading}
                          className="bg-white/80 hover:bg-slate-50 shadow-sm"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Probar Recordatorios Auto
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    {pendingCleaners.length === 0 ? (
                      <div className="p-8 text-center">
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-slate-900 mb-2">
                          ¡Excelente! Todos los reportes están completos
                        </h3>
                        <p className="text-slate-600 text-lg">
                          Todos los limpiadores que trabajaron en este período ya han generado sus reportes de pago.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Selector de todos */}
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <Checkbox
                            checked={selectedCleaners.length > 0 && selectedCleaners.length === pendingCleaners.filter(c => c.active && c.email).length}
                            onCheckedChange={handleSelectAllPending}
                          />
                          <label className="text-base font-medium text-slate-700">
                            Seleccionar todos los disponibles ({pendingCleaners.filter(c => c.active && c.email).length})
                          </label>
                        </div>

                        {/* Lista de limpiadores */}
                        <div className="space-y-3">
                          {pendingCleaners.map((cleaner) => (
                            <div key={cleaner.cleaner_id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={selectedCleaners.includes(cleaner.cleaner_id)}
                                  onCheckedChange={(checked) => handleSelectCleaner(cleaner.cleaner_id, checked)}
                                  disabled={!cleaner.active || !cleaner.email}
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-lg text-slate-900">{cleaner.full_name}</h4>
                                    {cleaner.employee_type === 'permanent' && <Badge variant="default" className="bg-blue-100 text-blue-700">Planta</Badge>}
                                    {cleaner.employee_type === 'casual' && <Badge variant="secondary" className="bg-purple-100 text-purple-700">Casual</Badge>}
                                    {cleaner.invoice_name && cleaner.invoice_name !== cleaner.full_name && (
                                      <span className="text-sm text-slate-500">({cleaner.invoice_name})</span>
                                    )}
                                    {!cleaner.active && <Badge variant="destructive" className="bg-red-50 text-red-700">Inactivo</Badge>}
                                    {!cleaner.email && <Badge variant="destructive" className="bg-purple-50 text-purple-700">Sin Email</Badge>}
                                  </div>
                                  <p className="text-sm text-slate-600 mt-1">
                                    <span className="font-semibold">{cleaner.total_hours.toFixed(1)}h</span> trabajadas • <span className="font-semibold">${cleaner.total_amount.toFixed(2)} AUD</span> • <span className="font-semibold">{cleaner.work_count}</span> trabajos
                                  </p>
                                  {cleaner.email && (
                                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                      <Mail className="w-3 h-3"/> {cleaner.email}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Sección de envío de recordatorios */}
                        {selectedCleaners.length > 0 && (
                          <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200 shadow-md">
                            <h4 className="font-medium text-lg text-blue-900">
                              Enviar Recordatorio a {selectedCleaners.length} limpiador{selectedCleaners.length > 1 ? 'es' : ''}
                            </h4>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-blue-800">
                                Mensaje personalizado (opcional):
                              </label>
                              <Textarea
                                value={reminderMessage}
                                onChange={(e) => setReminderMessage(e.target.value)}
                                placeholder="Deja vacío para usar el mensaje automático..."
                                rows={4}
                                className="bg-white border-blue-300 focus:ring-blue-500"
                              />
                            </div>
                            <Button
                              onClick={handleSendReminders}
                              disabled={reminderLoading}
                              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md"
                            >
                              {reminderLoading ? "Enviando..." : "Enviar Recordatorios"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-6">
            <div className="space-y-6">
              <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
                <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-t-lg border-b">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Mail className="w-6 h-6 text-blue-600" />
                    </div>
                    Sistema de Notificaciones Automáticas
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-blue-500" />
                          Recordatorios Automáticos
                        </h3>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-sm">
                          <p className="text-sm text-blue-800 mb-2">
                            <strong>Cuándo se envían:</strong> Los días 1 y 16 de cada mes automáticamente
                          </p>
                          <p className="text-sm text-blue-700">
                            <strong>A quién:</strong> Solo a limpiadores que tienen horas registradas pero no han generado su reporte del período anterior
                          </p>
                        </div>
                        <Button 
                          onClick={handleTestAutomaticReminders}
                          disabled={reminderLoading}
                          variant="outline"
                          className="w-full bg-white/80 hover:bg-slate-50 shadow-sm"
                        >
                          {reminderLoading ? "Probando..." : "Probar Recordatorios Automáticos"}
                        </Button>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                          <DollarSign className="w-5 h-5 text-green-500" />
                          Confirmaciones de Pago
                        </h3>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 shadow-sm">
                          <p className="text-sm text-green-800 mb-2">
                            <strong>Cuándo se envían:</strong> Automáticamente cuando marcas una factura como "Pagada"
                          </p>
                          <p className="text-sm text-green-700">
                            <strong>A quién:</strong> Al limpiador cuya factura fue pagada
                          </p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-700 shadow-sm">
                          <p className="text-sm ">
                            Las confirmaciones de pago se envían automáticamente. No requieren configuración adicional.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-6 mt-6 border-slate-200">
                      <h3 className="text-lg font-semibold text-slate-900 mb-4">
                        <Settings className="w-5 h-5 inline-block mr-2 text-slate-500" />
                        Personalización
                      </h3>
                      <p className="text-slate-600 mb-4">
                        Puedes personalizar los mensajes de email usando el botón "Configurar Emails" en la parte superior de la página.
                      </p>
                      <Button 
                        onClick={() => setEmailConfigOpen(true)}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Abrir Configuración de Emails
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!invoiceToDelete} onOpenChange={(isOpen) => !isOpen && setInvoiceToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Eliminación</DialogTitle>
              <DialogDescription>
                ¿Estás seguro de que quieres eliminar el reporte <strong>{invoiceToDelete?.invoice_number}</strong>?
              </DialogDescription>
            </DialogHeader>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Esta acción no se puede deshacer. Todas las entradas de trabajo asociadas (si existen) se marcarán como "no facturadas".
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInvoiceToDelete(null)} disabled={deleteLoading}>
                Cancelar
              </Button>
              <Button 
                variant="destructive"
                onClick={() => handleDeleteInvoice(invoiceToDelete)}
                disabled={deleteLoading}
              >
                {deleteLoading ? "Eliminando..." : "Sí, eliminar reporte"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}