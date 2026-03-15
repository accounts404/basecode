import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client"; // Corrected import for base44
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea"; // Unused but keeping for now if not explicitly removed
import { Clock, User as UserIcon, Calendar, DollarSign, Edit, Trash2, AlertCircle, CheckCircle, Save, TrendingUp, Briefcase, ClipboardCheck, ChevronDown, ChevronUp, Search, X, AlertTriangle, Loader2, Lock } from "lucide-react";
import { format } from "date-fns"; // Removed startOfMonth, endOfMonth, startOfDay, endOfDay as they are unused
import { es } from "date-fns/locale";
import PeriodSelector from "../components/reports/PeriodSelector";
import ClientSearchDropdown from "../components/work/ClientSearchDropdown"; // Unused but keeping for now if not explicitly removed
import SimpleClientSearch from "../components/work/SimpleClientSearch";
import ClientMultiSelect from "../components/work/ClientMultiSelect";
import WorkEntryAuditModal from '../components/work/WorkEntryAuditModal';
import MonthMultiSelector from '../components/work/MonthMultiSelector';

const activityLabels = {
  domestic: "Doméstico", commercial: "Comercial", windows: "Ventanas",
  steam_vacuum: "Vapor/Aspirado", entrenamiento: "Entrenamiento", otros: "Otros"
};

const activityColors = {
  domestic: "bg-blue-100 text-blue-800",
  commercial: "bg-green-100 text-green-800",
  windows: "bg-purple-100 text-purple-800",
  steam_vacuum: "bg-orange-100 text-orange-800",
  entrenamiento: "bg-pink-100 text-pink-800",
  otros: "bg-gray-100 text-gray-800"
};

// --- Helper function to convert number to words ---
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


export default function TrabajoEntradasPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [workEntries, setWorkEntries] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [paidEntryIds, setPaidEntryIds] = useState(new Set()); // IDs de WorkEntries en facturas PAGADAS
  const [loading, setLoading] = useState(true);
  const [selectedCleaner, setSelectedCleaner] = useState("all");
  const [groupByCleaner, setGroupByCleaner] = useState(true);
  const [deleteEntry, setDeleteEntry] = useState(null);
  const [editEntry, setEditEntry] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [notification, setNotification] = useState({ type: "", message: "" });
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedMonthRanges, setSelectedMonthRanges] = useState([]);
  const [filterMode, setFilterMode] = useState("periods"); // "periods", "current_month", "custom_months"
  const [expandedCleaner, setExpandedCleaner] = useState(null);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClients, setSelectedClients] = useState([]);

  // Audit state
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditData, setAuditData] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // Form data for editing
  const [editFormData, setEditFormData] = useState({
    client_id: "",
    client_name: "",
    work_date: "",
    hours: "",
    activity: "",
    other_activity: "",
    hourly_rate: "",
    total_amount: ""
  });

  // Helper para cargar TODOS los registros con paginación automática
  const loadAllRecords = async (entityName, sortField = '-created_date') => {
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
    try {
      console.log('[TrabajoEntradas] 📊 Iniciando carga paginada de TODAS las entradas...');
      
      const [currentUser, entriesResult, cleanersResult, clientsResult, invoicesResult] = await Promise.all([
        base44.auth.me(),
        loadAllRecords('WorkEntry', '-work_date'),
        loadAllRecords('User', '-created_date'),
        loadAllRecords('Client', '-created_date'),
        loadAllRecords('Invoice', '-created_date')
      ]);
      
      console.log('[TrabajoEntradas] ✅ Entradas cargadas:', entriesResult?.length || 0);

      const isAdminUser = currentUser.role === 'admin';
      setIsAdmin(isAdminUser);
      
      const entries = Array.isArray(entriesResult) ? entriesResult : [];
      const allUsers = Array.isArray(cleanersResult) ? cleanersResult : [];
      const clientsData = Array.isArray(clientsResult) ? clientsResult : [];
      
      const cleanerUsers = allUsers.filter(user => user.role !== 'admin');
      setCleaners(cleanerUsers);
      setAllClients(clientsData.filter(c => c.active !== false));

      // Calcular IDs de WorkEntries en facturas PAGADAS — estas no se pueden tocar
      const paidInvoices = (Array.isArray(invoicesResult) ? invoicesResult : []).filter(inv => inv.status === 'paid');
      const paidIds = new Set();
      paidInvoices.forEach(inv => {
        (inv.work_entries || []).forEach(id => paidIds.add(id));
      });
      setPaidEntryIds(paidIds);
      console.log(`[TrabajoEntradas] 🔒 ${paidIds.size} WorkEntries protegidas (en facturas pagadas)`);

      
      const entriesWithCleanerInfo = entries.map(entry => {
        const cleaner = cleanerUsers.find(c => c.id === entry.cleaner_id);
        return {
          ...entry,
          cleaner_name: cleaner ? (cleaner.invoice_name || cleaner.full_name) : 'Usuario no encontrado',
          cleaner_email: cleaner ? cleaner.email : ''
        };
      });
      
      setWorkEntries(entriesWithCleanerInfo);
    } catch (error) {
      console.error("Error loading data:", error);
      setNotification({ type: "error", message: "Error cargando datos." });
      setWorkEntries([]); // Clear state on error
      setCleaners([]);
      setAllClients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (editEntry) {
      setEditFormData({
        client_id: editEntry.client_id || "",
        client_name: editEntry.client_name || "",
        work_date: editEntry.work_date || "",
        hours: editEntry.hours || "",
        activity: editEntry.activity || "",
        other_activity: editEntry.other_activity || "",
        hourly_rate: editEntry.hourly_rate || "",
        total_amount: editEntry.total_amount || ""
      });
    }
  }, [editEntry]);

  // Calculate total when hours or rate changes
  useEffect(() => {
    if (editFormData.hours && editFormData.hourly_rate) {
      const total = parseFloat(editFormData.hours) * parseFloat(editFormData.hourly_rate);
      setEditFormData(prev => ({ ...prev, total_amount: total.toFixed(2) }));
    }
  }, [editFormData.hours, editFormData.hourly_rate]);

  const updateRelatedInvoice = async (entryId, updatedEntry = null) => {
    try {
      // Find invoices that contain this work entry
      const invoices = await loadAllRecords('Invoice', '-created_date');
      const relatedInvoice = invoices.find(invoice => 
        invoice.work_entries && invoice.work_entries.includes(entryId)
      );

      if (relatedInvoice) {
        let updatedWorkEntriesIds = [...relatedInvoice.work_entries];
        
        if (updatedEntry === null) {
          // Entry was deleted, remove from invoice
          updatedWorkEntriesIds = updatedWorkEntriesIds.filter(id => id !== entryId);
        }

        // Fetch all work entries once to resolve all IDs efficiently
        const allWorkEntries = await loadAllRecords('WorkEntry', '-work_date');
        
        const workEntriesData = updatedWorkEntriesIds.map(id => {
          // If we are updating the current entry, use the new data
          if (updatedEntry && updatedEntry.id === id) return updatedEntry;
          return allWorkEntries.find(e => e.id === id);
        });
        
        const validEntries = workEntriesData.filter(entry => entry);
        const newTotal = validEntries.reduce((sum, entry) => sum + (entry.total_amount || 0), 0);

        // Simple update without PDF regeneration to avoid timeouts
        await base44.entities.Invoice.update(relatedInvoice.id, {
          work_entries: updatedWorkEntriesIds,
          total_amount: newTotal
        });
        
        return `Factura ${relatedInvoice.invoice_number} actualizada.`;
      }
      return ""; // Return empty string if no related invoice found
    } catch (error) {
      console.error("Error updating related invoice:", error);
      // Don't throw error, just log and continue
      return ""; // Return empty string on error
    }
  };

  const generateInvoiceHTML = (user, invoiceNumber, workEntries, totalAmount) => {
    const get = (obj, path, fallback = '**********') => {
      const value = path.split('.').reduce((acc, part) => acc && acc[part], obj);
      return value || fallback;
    };

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

    const servicesHTML = sortedDates.map(date => {
        const formattedDate = format(new Date(date), "d 'de' MMMM 'de' yyyy", { locale: es });
        const amount = dailyTotals[date].toFixed(0);
        return `<div class="service-item">${formattedDate}: $${amount}</div>`;
    }).join('');

    const fullName = get(user, 'invoice_name', get(user, 'full_name', 'NAME AND LAST NAME'));

    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Tax Invoice ${invoiceNumber}</title>
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
        .example-text { margin: 8px 0; }
        .total-section { margin: 25px 0; }
        .total-line { font-weight: bold; margin-bottom: 3px; }
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
            <div class="personal-line">Invoice: ${invoiceNumber.replace('INV-', '')}</div>
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
                ${servicesHTML}
            </div>
        </div>
        <div class="total-section">
            <div class="total-line">Total: $${totalAmount.toFixed(0)}</div>
            <div class="example-text">Ej. ${totalInWords} AUD $${totalAmount.toFixed(0)}</div>
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

  const handleClientSelectForEdit = (client) => {
    setEditFormData(prev => ({
        ...prev,
        client_id: client.id,
        client_name: client.name
    }));
  };

  const handleEditEntry = async () => {
    if (!editEntry) return;
    
    // BLOQUEO: No permitir editar entradas en facturas PAGADAS
    if (paidEntryIds.has(editEntry.id)) {
      setNotification({ type: "error", message: "❌ Esta entrada pertenece a una factura PAGADA y no puede ser modificada." });
      setEditEntry(null);
      return;
    }
    
    setUpdating(true);
    try {
      // Get cleaner information
      const cleaner = cleaners.find(c => c.id === editEntry.cleaner_id);
      
      const updatedData = {
        cleaner_id: editEntry.cleaner_id,
        cleaner_name: cleaner ? (cleaner.invoice_name || cleaner.full_name) : editEntry.cleaner_name,
        client_id: editFormData.client_id,
        client_name: editFormData.client_name,
        work_date: editFormData.work_date,
        hours: parseFloat(editFormData.hours),
        activity: editFormData.activity,
        other_activity: editFormData.other_activity || "",
        hourly_rate: parseFloat(editFormData.hourly_rate),
        total_amount: parseFloat(editFormData.total_amount),
        period: editEntry.period,
        invoiced: editEntry.invoiced
      };

      await base44.entities.WorkEntry.update(editEntry.id, updatedData);
      
      // Update related invoice if exists (simplified version without PDF regeneration)
      let invoiceMessage = "";
      if (editEntry.invoiced) {
        invoiceMessage = await updateRelatedInvoice(editEntry.id, { ...editEntry, ...updatedData });
      }
      
      setNotification({ 
        type: "success", 
        message: `Entrada actualizada exitosamente. ${invoiceMessage}`
      });
      setEditEntry(null);
      loadData();
    } catch (error) {
      console.error("Error updating entry:", error);
      setNotification({ 
        type: "error", 
        message: "Error al actualizar la entrada. Por favor, inténtalo de nuevo."
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!deleteEntry) return;
    
    // BLOQUEO: No permitir eliminar entradas en facturas PAGADAS
    if (paidEntryIds.has(deleteEntry.id)) {
      setNotification({ type: "error", message: "❌ Esta entrada pertenece a una factura PAGADA y no puede ser eliminada." });
      setDeleteEntry(null);
      return;
    }
    
    setDeleting(true);
    try {
      // Update related invoice first (simplified version)
      let invoiceMessage = "";
      if (deleteEntry.invoiced) {
        invoiceMessage = await updateRelatedInvoice(deleteEntry.id, null);
      }
      
      // Then delete the work entry
      await base44.entities.WorkEntry.delete(deleteEntry.id);
      
      setNotification({ 
        type: "success", 
        message: `Entrada de trabajo eliminada exitosamente. ${invoiceMessage || ''}`
      });
      setDeleteEntry(null);
      loadData();
    } catch (error) {
      console.error("Error deleting entry:", error);
      setNotification({ type: "error", message: "Error al eliminar la entrada de trabajo." });
    } finally {
      setDeleting(false);
    }
  };

  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
    setFilterMode("periods");
  };

  const handleMonthRangesChange = (ranges) => {
    setSelectedMonthRanges(ranges);
    setFilterMode("custom_months");
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    setSelectedPeriod({ start, end, label: "Mes Actual" });
    setFilterMode("current_month");
  };

  const clearAllFilters = () => {
    setSelectedPeriod(null);
    setSelectedMonthRanges([]);
    setFilterMode("periods");
  };

  const handleToggleExpand = (cleanerId) => {
    setExpandedCleaner(prevId => (prevId === cleanerId ? null : cleanerId));
  };

  const handleClientSelect = (clientName) => {
    setClientSearch(clientName);
  };

  const handleMultiClientSelect = (clients) => {
    setSelectedClients(clients);
  };

  const handleAuditWorkEntries = async () => {
    setAuditLoading(true);
    setAuditData(null); // Clear previous audit data
    setNotification({ type: "", message: "" }); // Clear previous notification
    try {
        const response = await base44.functions.invoke('auditWorkEntries', {
            period_start: selectedPeriod?.start ? format(selectedPeriod.start, 'yyyy-MM-dd') : null,
            period_end: selectedPeriod?.end ? format(selectedPeriod.end, 'yyyy-MM-dd') : null
        });

        if (response.data && response.data.success) {
            setAuditData(response.data);
            setShowAuditModal(true);
            setNotification({ type: "success", message: "Auditoría completada exitosamente." });
        } else {
            const errorMessage = response.data?.error || 'Error desconocido al ejecutar la auditoría.';
            setNotification({ type: "error", message: `Error en la auditoría: ${errorMessage}` });
        }
    } catch (error) {
        console.error('Error running audit:', error);
        setNotification({ type: "error", message: `Error al ejecutar auditoría: ${error.message}` });
    } finally {
        setAuditLoading(false);
    }
};

  // Apply all filters: period, cleaner, and client search
  const applyAllFilters = () => {
    let entriesToFilter = workEntries; // Start with all fetched entries

    // Filter by date range based on mode
    if (filterMode === "periods" && selectedPeriod) {
      // Usar el período seleccionado de PeriodSelector
      entriesToFilter = entriesToFilter.filter(entry => {
        if (!entry.work_date) return false;
        try {
          const workDate = new Date(entry.work_date);
          return workDate >= selectedPeriod.start && workDate <= selectedPeriod.end;
        } catch {
          return false;
        }
      });
    } else if (filterMode === "current_month" && selectedPeriod) {
      // Usar mes actual
      entriesToFilter = entriesToFilter.filter(entry => {
        if (!entry.work_date) return false;
        try {
          const workDate = new Date(entry.work_date);
          return workDate >= selectedPeriod.start && workDate <= selectedPeriod.end;
        } catch {
          return false;
        }
      });
    } else if (filterMode === "custom_months" && selectedMonthRanges.length > 0) {
      // Filtrar por meses seleccionados (pueden ser no consecutivos)
      entriesToFilter = entriesToFilter.filter(entry => {
        if (!entry.work_date) return false;
        try {
          const workDate = new Date(entry.work_date);
          return selectedMonthRanges.some(range => 
            workDate >= range.start && workDate <= range.end
          );
        } catch {
          return false;
        }
      });
    }

    // Filter by cleaner
    if (selectedCleaner !== "all") {
      entriesToFilter = entriesToFilter.filter(entry => entry.cleaner_id === selectedCleaner);
    }
    
    // Filter by multi-client selection (priority over single search)
    if (selectedClients.length > 0) {
      entriesToFilter = entriesToFilter.filter(entry => 
        selectedClients.includes(entry.client_name)
      );
    } else if (clientSearch.trim() !== "") {
      // Fallback to single client search if no multi-selection
      entriesToFilter = entriesToFilter.filter(entry => 
        entry.client_name?.toLowerCase().includes(clientSearch.toLowerCase())
      );
    }
    
    return entriesToFilter;
  };

  const filteredEntries = applyAllFilters();

  // Get unique client names for the dropdown
  const uniqueClientNames = [...new Set(workEntries.map(entry => entry.client_name).filter(Boolean))];

  const periodStats = {
    totalHours: filteredEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0),
    totalAmount: filteredEntries.reduce((sum, entry) => sum + (entry.total_amount || 0), 0),
    totalJobs: filteredEntries.length,
    averageRate: 0,
    totalServices: 0
  };
  
  if (periodStats.totalHours > 0) {
    periodStats.averageRate = periodStats.totalAmount / periodStats.totalHours;
  } else if (filteredEntries.length > 0) {
    const rateSum = filteredEntries.reduce((sum, entry) => sum + (entry.hourly_rate || 0), 0);
    periodStats.averageRate = rateSum / filteredEntries.length;
  }

  // Calculate unique services (client + date)
  const uniqueServices = new Set();
  filteredEntries.forEach(entry => {
    // Ensure entry.client_id and entry.work_date exist before using them
    if (entry.client_id && entry.work_date) {
      const serviceKey = `${entry.client_id}|${entry.work_date}`;
      uniqueServices.add(serviceKey);
    }
  });
  periodStats.totalServices = uniqueServices.size;


  const groupedEntries = groupByCleaner ? 
    filteredEntries.reduce((groups, entry) => {
      const cleanerId = entry.cleaner_id;
      if (!groups[cleanerId]) {
        groups[cleanerId] = {
          cleaner: {
            id: cleanerId,
            name: entry.cleaner_name,
            email: entry.cleaner_email
          },
          entries: []
        };
      }
      groups[cleanerId].entries.push(entry);
      return groups;
    }, {}) : null;

  const calculateCleanerStats = (entries) => {
    const stats = {
      totalHours: entries.reduce((sum, entry) => sum + (entry.hours || 0), 0),
      totalAmount: entries.reduce((sum, entry) => sum + (entry.total_amount || 0), 0),
      totalEntries: entries.length,
      averageRate: 0
    };
    if (stats.totalHours > 0) {
        stats.averageRate = stats.totalAmount / stats.totalHours;
    } else if (stats.totalEntries > 0) {
        const rateSum = entries.reduce((sum, entry) => sum + (entry.hourly_rate || 0), 0);
        stats.averageRate = rateSum / entries.length;
    }
    return stats;
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 md:p-8">
      <div className="w-full">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-slate-200 rounded w-1/3"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    </div>
  );

  if (!isAdmin) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 md:p-8">
      <div className="w-full">
        <div className="text-center p-12">
          <UserIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 mb-2">Acceso Restringido</h2>
          <p className="text-slate-500">Esta página está disponible solo para administradores.</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 md:p-8">
      <div className="w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Clock className="w-8 h-8 text-blue-600" />
            Entradas de Trabajo
          </h1>
          <div className="flex items-center flex-wrap gap-4">
            <p className="text-slate-600">Registro detallado de todo el trabajo realizado por los limpiadores.</p>
            
            {/* Botón de Auditoría */}
            {isAdmin && (
              <Button 
                onClick={handleAuditWorkEntries}
                disabled={auditLoading}
                variant="outline"
                className="border-purple-600 text-purple-700 hover:bg-purple-50"
              >
                {auditLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analizando...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Auditoría de Entradas
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Notification */}
        {notification.message && (
          <Alert className={`mb-6 ${notification.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            {notification.type === "success" ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600" />
            )}
            <AlertDescription className={notification.type === "success" ? "text-green-800" : "text-red-800"}>
              {notification.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Filter Mode Selector */}
        <Card className="mb-6 shadow-md border-slate-200">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                variant={filterMode === "periods" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilterMode("periods");
                  setSelectedMonthRanges([]);
                }}
                className="flex-1 sm:flex-none"
              >
                Períodos Facturados
              </Button>
              <Button
                variant={filterMode === "current_month" ? "default" : "outline"}
                size="sm"
                onClick={handleCurrentMonth}
                className="flex-1 sm:flex-none"
              >
                Mes Actual
              </Button>
              <Button
                variant={filterMode === "custom_months" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilterMode("custom_months");
                  setSelectedPeriod(null);
                }}
                className="flex-1 sm:flex-none"
              >
                Seleccionar Meses
              </Button>
              {(selectedPeriod || selectedMonthRanges.length > 0) && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearAllFilters}
                  className="text-slate-500 hover:text-slate-700"
                >
                  <X className="h-4 w-4 mr-1" />
                  Limpiar todo
                </Button>
              )}
            </div>

            {/* Period Selector - solo mostrar si el modo es "periods" */}
            {filterMode === "periods" && (
              <PeriodSelector onPeriodChange={handlePeriodChange} />
            )}

            {/* Month Multi Selector - solo mostrar si el modo es "custom_months" */}
            {filterMode === "custom_months" && (
              <MonthMultiSelector onSelectionChange={handleMonthRangesChange} />
            )}

            {/* Current Month Display */}
            {filterMode === "current_month" && selectedPeriod && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-medium text-blue-900">
                  {selectedPeriod.label}
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  {format(selectedPeriod.start, "d 'de' MMMM", { locale: es })} - {format(selectedPeriod.end, "d 'de' MMMM 'de' yyyy", { locale: es })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Filters and Controls */}
        <Card className="mb-6 shadow-lg border-0">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="flex-1 space-y-2">
                  <label className="text-sm font-medium text-slate-700">Filtrar por limpiador:</label>
                  <Select value={selectedCleaner} onValueChange={setSelectedCleaner}>
                    <SelectTrigger className="w-full md:w-56">
                      <SelectValue placeholder="Todos los limpiadores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los limpiadores</SelectItem>
                      {cleaners.map((cleaner) => (
                        <SelectItem key={cleaner.id} value={cleaner.id}>
                          {cleaner.invoice_name || cleaner.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
              </div>

              <div className="flex-1 space-y-2">
                <Label className="text-sm font-medium text-slate-700">Buscar por cliente(s):</Label>
                <ClientMultiSelect
                  clients={uniqueClientNames}
                  selectedClients={selectedClients}
                  onSelectionChange={handleMultiClientSelect}
                  maxSelections={5}
                />
              </div>
              
              <div className="flex-1 space-y-2 self-end">
                <div className="flex items-center gap-2">
                  <Button
                    variant={groupByCleaner ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGroupByCleaner(true)}
                  >
                    Agrupar
                  </Button>
                  <Button
                    variant={!groupByCleaner ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGroupByCleaner(false)}
                  >
                    Vista Lista
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
          <Card className="shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total a Pagar</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${periodStats.totalAmount.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Monto total en el período</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Horas</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{periodStats.totalHours.toFixed(2)}h</div>
              <p className="text-xs text-muted-foreground">Horas trabajadas en el período</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tarifa Promedio</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${periodStats.averageRate.toFixed(2)}/h</div>
              <p className="text-xs text-muted-foreground">Valor promedio por hora</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Servicios Realizados</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{periodStats.totalServices}</div>
              <p className="text-xs text-muted-foreground">Cliente/día únicos en el período</p>
            </CardContent>
          </Card>
          <Card className="shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Entradas</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{periodStats.totalJobs}</div>
              <p className="text-xs text-muted-foreground">Registros en el período</p>
            </CardContent>
          </Card>
        </div>

        {filteredEntries.length === 0 ? (
          <Card className="shadow-lg border-0">
            <CardContent className="p-12 text-center">
              <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No hay entradas de trabajo</h3>
              <p className="text-slate-500">
                No se encontraron trabajos con los filtros seleccionados.
              </p>
            </CardContent>
          </Card>
        ) : groupByCleaner ? (
          /* Vista agrupada por limpiador */
          <div className="space-y-6">
            {Object.values(groupedEntries).map((group) => {
              const stats = calculateCleanerStats(group.entries);
              return (
                <Card key={group.cleaner.id} className="shadow-lg border-0 transition-all duration-300">
                  <CardHeader 
                    className="border-b border-slate-100 cursor-pointer hover:bg-slate-50 p-4"
                    onClick={() => handleToggleExpand(group.cleaner.id)}
                  >
                    <div className="flex flex-wrap justify-between items-center gap-4">
                      {/* Cleaner Info */}
                      <div className="flex items-center gap-4 flex-1 min-w-[200px]">
                        <UserIcon className="w-8 h-8 text-blue-600 flex-shrink-0" />
                        <div>
                          <CardTitle className="text-lg font-semibold text-slate-900">{group.cleaner.name}</CardTitle>
                          <p className="text-sm text-slate-500 truncate">{group.cleaner.email}</p>
                        </div>
                      </div>

                      {/* Stats & Toggle */}
                      <div className="flex items-center gap-4">
                        {/* Desktop Stats */}
                        <div className="hidden sm:flex items-center gap-x-6 bg-slate-50 py-2 px-4 rounded-lg border">
                          <div className="text-center">
                            <p className="text-base font-bold text-slate-800">{stats.totalEntries}</p>
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Trabajos</p>
                          </div>
                          <div className="text-center">
                            <p className="text-base font-bold text-slate-800">{stats.totalHours.toFixed(2)}</p>
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Horas</p>
                          </div>
                          <div className="text-center">
                            <p className="text-base font-bold text-slate-800">${stats.averageRate.toFixed(2)}</p>
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Tarifa Prom.</p>
                          </div>
                          <div className="text-center">
                            <p className="text-base font-bold text-green-600">${stats.totalAmount.toFixed(2)}</p>
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Total</p>
                          </div>
                        </div>

                        {/* Toggle Icon */}
                        <div className="p-2 rounded-full hover:bg-slate-100">
                          {expandedCleaner === group.cleaner.id ? (
                            <ChevronUp className="h-5 w-5 text-slate-600" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-slate-600" />
                          )}
                        </div>
                      </div>
                      
                      {/* Mobile Stats */}
                      <div className="sm:hidden w-full grid grid-cols-2 gap-4 text-center pt-4 border-t mt-2">
                        <div>
                          <p className="text-base font-bold text-slate-800">{stats.totalEntries}</p>
                          <p className="text-xs text-slate-500 uppercase">Trabajos</p>
                        </div>
                        <div>
                          <p className="text-base font-bold text-slate-800">{stats.totalHours.toFixed(2)}</p>
                          <p className="text-xs text-slate-500 uppercase">Horas</p>
                        </div>
                        <div>
                          <p className="text-base font-bold text-slate-800">${stats.averageRate.toFixed(2)}</p>
                          <p className="text-xs text-slate-500 uppercase">Tarifa Prom.</p>
                        </div>
                        <div>
                          <p className="text-base font-bold text-green-600">${stats.totalAmount.toFixed(2)}</p>
                          <p className="text-xs text-slate-500 uppercase">Total</p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  {expandedCleaner === group.cleaner.id && (
                    <CardContent className="p-0">
                      {/* Desktop Table */}
                      <div className="hidden md:block overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fecha</TableHead>
                              <TableHead>Cliente</TableHead>
                              <TableHead>Actividad</TableHead>
                              <TableHead>Horas</TableHead>
                              <TableHead>Tarifa</TableHead>
                              <TableHead>Total</TableHead>
                              <TableHead>Estado</TableHead>
                              <TableHead>Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.entries.map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-slate-400" />
                                    {format(new Date(entry.work_date), "d MMM yyyy", { locale: es })}
                                  </div>
                                </TableCell>
                                <TableCell className="font-medium">{entry.client_name}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Badge className={`${activityColors[entry.activity]} border-0`}>
                                      {activityLabels[entry.activity] || entry.activity}
                                      {entry.activity === 'otros' && entry.other_activity && `: ${entry.other_activity}`}
                                    </Badge>
                                    {/* Indicador de modificación */}
                                    {entry.modified_by_cleaner && (
                                      <div className="relative group">
                                        <AlertTriangle className="w-4 h-4 text-amber-500 cursor-help" />
                                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50">
                                          Modificado por limpiador
                                          {entry.last_modified_at && (
                                            <div className="text-amber-200">
                                              {format(new Date(entry.last_modified_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-4 h-4 text-slate-400" />
                                    {entry.hours}h
                                  </div>
                                </TableCell>
                                <TableCell>${entry.hourly_rate?.toFixed(2)}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 font-semibold text-green-600">
                                    <DollarSign className="w-4 h-4" />
                                    {(entry.total_amount || 0).toFixed(2)}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {entry.invoiced ? (
                                    <Badge className="bg-green-100 text-green-800">Facturado</Badge>
                                  ) : (
                                    <Badge variant="outline">Pendiente</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => setEditEntry(entry)}
                                      title="Editar entrada"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => setDeleteEntry(entry)}
                                      title="Eliminar entrada"
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile Cards */}
                      <div className="md:hidden divide-y divide-slate-100">
                        {group.entries.map((entry) => (
                          <div key={entry.id} className="p-4 space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-medium text-slate-900">{entry.client_name}</h4>
                                <p className="text-sm text-slate-600">
                                  {format(new Date(entry.work_date), "d MMM yyyy", { locale: es })}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge className={`${activityColors[entry.activity]} border-0`}>
                                    {activityLabels[entry.activity] || entry.activity}
                                    {entry.activity === 'otros' && entry.other_activity && `: ${entry.other_activity}`}
                                  </Badge>
                                  {/* Indicador de modificación en móvil */}
                                  {entry.modified_by_cleaner && (
                                    <div className="flex items-center gap-1">
                                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                                      <span className="text-xs text-amber-600">Modificado</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-lg text-green-600">
                                  {(entry.total_amount || 0).toFixed(2)}
                                </p>
                                <p className="text-sm text-slate-500">
                                  {entry.hours}h × ${entry.hourly_rate?.toFixed(2)}
                                </p>
                              </div>
                            </div>
                            <div className="flex justify-between items-center">
                              <div>
                                {entry.invoiced ? (
                                  <Badge className="bg-green-100 text-green-800">Facturado</Badge>
                                ) : (
                                  <Badge variant="outline">Pendiente</Badge>
                                )}
                              </div>
                              <div className="flex gap-2">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => setEditEntry(entry)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => setDeleteEntry(entry)}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                              {/* Información adicional de modificación en móvil */}
                              {entry.modified_by_cleaner && entry.last_modified_at && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                                  <div className="flex items-center gap-2 text-amber-700">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span className="font-medium">Modificado por limpiador</span>
                                  </div>
                                  <p className="text-amber-600 mt-1">
                                    {format(new Date(entry.last_modified_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                                  </p>
                                </div>
                              )}
                            </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          /* Vista de lista tradicional */
          <Card className="shadow-lg border-0">
            <CardContent className="p-0">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Limpiador</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Actividad</TableHead>
                      <TableHead>Horas</TableHead>
                      <TableHead>Tarifa</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            {format(new Date(entry.work_date), "d MMM yyyy", { locale: es })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{entry.cleaner_name}</p>
                            <p className="text-sm text-slate-500">{entry.cleaner_email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{entry.client_name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className={`${activityColors[entry.activity]} border-0`}>
                              {activityLabels[entry.activity] || entry.activity}
                              {entry.activity === 'otros' && entry.other_activity && `: ${entry.other_activity}`}
                            </Badge>
                            {/* Indicador de modificación */}
                            {entry.modified_by_cleaner && (
                              <div className="relative group">
                                <AlertTriangle className="w-4 h-4 text-amber-500 cursor-help" />
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50">
                                  Modificado por limpiador
                                  {entry.last_modified_at && (
                                    <div className="text-amber-200">
                                      {format(new Date(entry.last_modified_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4 text-slate-400" />
                            {entry.hours}h
                          </div>
                        </TableCell>
                        <TableCell>${entry.hourly_rate?.toFixed(2)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 font-semibold text-green-600">
                            <DollarSign className="w-4 h-4" />
                            {(entry.total_amount || 0).toFixed(2)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {entry.invoiced ? (
                            <Badge className="bg-green-100 text-green-800">Facturado</Badge>
                          ) : (
                            <Badge variant="outline">Pendiente</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => setEditEntry(entry)}
                              title="Editar entrada"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => setDeleteEntry(entry)}
                              title="Eliminar entrada"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredEntries.map((entry) => (
                  <div key={entry.id} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-slate-900">{entry.client_name}</h4>
                        <p className="text-sm text-slate-600">{entry.cleaner_name}</p>
                        <p className="text-sm text-slate-500">
                          {format(new Date(entry.work_date), "d MMM yyyy", { locale: es })}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={`${activityColors[entry.activity]} border-0`}>
                            {activityLabels[entry.activity] || entry.activity}
                            {entry.activity === 'otros' && entry.other_activity && `: ${entry.other_activity}`}
                          </Badge>
                          {/* Indicador de modificación en móvil */}
                          {entry.modified_by_cleaner && (
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                              <span className="text-xs text-amber-600">Modificado</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-lg text-green-600">
                          {(entry.total_amount || 0).toFixed(2)}
                        </p>
                        <p className="text-sm text-slate-500">
                          {entry.hours}h × ${entry.hourly_rate?.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        {entry.invoiced ? (
                          <Badge className="bg-green-100 text-green-800">Facturado</Badge>
                        ) : (
                          <Badge variant="outline">Pendiente</Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setEditEntry(entry)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setDeleteEntry(entry)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                    {/* Información adicional de modificación en móvil */}
                    {entry.modified_by_cleaner && entry.last_modified_at && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                        <div className="flex items-center gap-2 text-amber-700">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="font-medium">Modificado por limpiador</span>
                        </div>
                        <p className="text-amber-600 mt-1">
                          {format(new Date(entry.last_modified_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Edit Entry Dialog */}
        <Dialog open={!!editEntry} onOpenChange={(open) => !open && setEditEntry(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Entrada de Trabajo</DialogTitle>
              <DialogDescription>
                Modifica los detalles de la entrada. Si está facturada, la factura se actualizará automáticamente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="client_name">Cliente</Label>
                  <SimpleClientSearch
                    clients={allClients}
                    selectedClient={editFormData.client_name}
                    onClientSelect={handleClientSelectForEdit}
                  />
                </div>
                <div>
                  <Label htmlFor="work_date">Fecha</Label>
                  <Input
                    id="work_date"
                    type="date"
                    value={editFormData.work_date}
                    onChange={(e) => setEditFormData({...editFormData, work_date: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="hours">Horas</Label>
                  <Input
                    id="hours"
                    type="number"
                    step="0.25"
                    value={editFormData.hours}
                    onChange={(e) => setEditFormData({...editFormData, hours: e.target.value})}
                    onWheel={(e) => e.target.blur()}
                  />
                </div>
                <div>
                  <Label htmlFor="hourly_rate">Tarifa por Hora (AUD)</Label>
                  <Input
                    id="hourly_rate"
                    type="number"
                    step="0.01"
                    value={editFormData.hourly_rate}
                    onChange={(e) => setEditFormData({...editFormData, hourly_rate: e.target.value})}
                    onWheel={(e) => e.target.blur()}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="activity">Actividad</Label>
                <Select 
                  value={editFormData.activity} 
                  onValueChange={(value) => setEditFormData({...editFormData, activity: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una actividad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="domestic">Doméstico</SelectItem>
                    <SelectItem value="commercial">Comercial</SelectItem>
                    <SelectItem value="windows">Ventanas</SelectItem>
                    <SelectItem value="steam_vacuum">Vapor/Aspirado</SelectItem>
                    <SelectItem value="entrenamiento">Entrenamiento</SelectItem>
                    <SelectItem value="otros">Otros</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editFormData.activity === 'otros' && (
                <div>
                  <Label htmlFor="other_activity">Especifica la actividad</Label>
                  <Input
                    id="other_activity"
                    value={editFormData.other_activity}
                    onChange={(e) => setEditFormData({...editFormData, other_activity: e.target.value})}
                    placeholder="Describe la actividad realizada"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="total_amount">Total (AUD)</Label>
                <Input
                  id="total_amount"
                  type="number"
                  step="0.01"
                  value={editFormData.total_amount}
                  onChange={(e) => setEditFormData({...editFormData, total_amount: e.target.value})}
                  readOnly
                  className="bg-slate-50"
                />
              </div>

              {editEntry?.invoiced && (
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    <strong>Atención:</strong> Esta entrada está facturada. Al guardarla, la factura correspondiente se actualizará automáticamente. La regeneración del PDF se debe realizar manualmente para evitar timeouts.
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditEntry(null)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleEditEntry}
                disabled={updating}
              >
                {updating ? (
                  <>
                    <Save className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Guardar Cambios
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteEntry} onOpenChange={(open) => !open && setDeleteEntry(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Eliminación</DialogTitle>
              <DialogDescription>
                ¿Estás seguro de que quieres eliminar esta entrada de trabajo? Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            {deleteEntry && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <p><strong>Cliente:</strong> {deleteEntry.client_name}</p>
                <p><strong>Fecha:</strong> {format(new Date(deleteEntry.work_date), "d MMM yyyy", { locale: es })}</p>
                <p><strong>Horas:</strong> {deleteEntry.hours}h</p>
                <p><strong>Total:</strong> ${deleteEntry.total_amount?.toFixed(2)}</p>
                {deleteEntry.invoiced && (
                  <Alert className="mt-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Esta entrada está facturada. Al eliminarla, la factura correspondiente se actualizará automáticamente. La regeneración del PDF se debe realizar manualmente para evitar timeouts.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteEntry(null)}>
                Cancelar
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteEntry}
                disabled={deleting}
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Audit Modal */}
      <WorkEntryAuditModal
          isOpen={showAuditModal}
          onClose={() => {
            setShowAuditModal(false);
            setAuditData(null); // Clear audit data on close
          }}
          auditData={auditData}
          onRefresh={loadData}
      />
    </div>
  );
}