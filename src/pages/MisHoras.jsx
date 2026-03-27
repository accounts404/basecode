import React, { useState, useEffect } from "react";
import { User } from "@/entities/User";
import { WorkEntry } from "@/entities/WorkEntry";
import { Client } from "@/entities/Client";
import { Invoice } from "@/entities/Invoice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, Edit, Calendar, DollarSign, AlertCircle, CheckCircle, Trash2, X, Filter, FileText } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import ClientSearchCombobox from "../components/work/ClientSearchCombobox";
import PeriodSelector from "../components/reports/PeriodSelector";

const ACTIVITIES = [
  { value: "domestic", label: "Doméstico" },
  { value: "commercial", label: "Comercial" },
  { value: "windows", label: "Ventanas" },
  { value: "steam_vacuum", label: "Vapor/Aspirado" },
  { value: "entrenamiento", label: "Entrenamiento" },
  { value: "otros", label: "Otros" }
];

// Helper for activity labels map
const ACTIVITY_LABELS = ACTIVITIES.reduce((acc, curr) => {
  acc[curr.value] = curr.label;
  return acc;
}, {});

const VALID_HOUR_DECIMALS = [0, 0.25, 0.5, 0.75];

// Placeholder for createPageUrl if not globally defined. Adjust as per actual routing setup.
const createPageUrl = (pageName) => `/app/${pageName}`;

export default function MisHorasPage() {
  const [user, setUser] = useState(null);
  const [workEntries, setWorkEntries] = useState([]); // This will store all relevant (unfiltered by client/status) work entries
  const [filteredEntries, setFilteredEntries] = useState([]); // This will store entries filtered by period, status, client
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); // General error state for data loading
  const [editingEntry, setEditingEntry] = useState(null);
  const [editFormData, setEditFormData] = useState({
    client_id: "",
    client_name: "",
    work_date: "",
    hours: "",
    activity: "",
    other_activity: "",
    hourly_rate: "",
    fixed_amount: ""
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(""); // Specific error for edit dialog
  const [hoursError, setHoursError] = useState("");
  const [success, setSuccess] = useState("");

  const [deleteEntry, setDeleteEntry] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(null);

  // New states for mobile filters
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all"); // 'all', 'invoiced', 'pending'
  const [clientFilter, setClientFilter] = useState("all"); // 'all' or client_name

  // If using React Router, uncomment and initialize useNavigate
  // const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  // Effect to apply all filters: period, status, client
  useEffect(() => {
    let currentFiltered = workEntries;

    // 1. Filter by Period
    if (selectedPeriod) {
      currentFiltered = currentFiltered.filter(entry => {
        const workDate = new Date(entry.work_date);
        const periodStart = new Date(selectedPeriod.start);
        periodStart.setHours(0, 0, 0, 0); // Normalize to start of day
        const periodEnd = new Date(selectedPeriod.end);
        periodEnd.setHours(23, 59, 59, 999); // Normalize to end of day
        
        return workDate >= periodStart && workDate <= periodEnd;
      });
    }

    // 2. Filter by Status
    if (statusFilter === "invoiced") {
      currentFiltered = currentFiltered.filter(entry => entry.invoiced);
    } else if (statusFilter === "pending") {
      currentFiltered = currentFiltered.filter(entry => !entry.invoiced);
    }

    // 3. Filter by Client
    if (clientFilter !== "all") {
      currentFiltered = currentFiltered.filter(entry => entry.client_name === clientFilter);
    }

    setFilteredEntries(currentFiltered);
  }, [selectedPeriod, statusFilter, clientFilter, workEntries]); // Depend on all filter criteria and raw workEntries

  const loadData = async () => {
    setLoading(true);
    setError(""); // Clear previous general errors
    try {
      const userData = await User.me();
      setUser(userData);
      
      const [workEntriesResult, clientsResult, invoicesResult] = await Promise.allSettled([
        WorkEntry.filter({ cleaner_id: userData.id }, "-work_date"),
        Client.list(),
        Invoice.filter({ cleaner_id: userData.id })
      ]);
      
      const allWorkEntries = workEntriesResult.status === 'fulfilled' ? workEntriesResult.value : [];
      const allClients = clientsResult.status === 'fulfilled' ? clientsResult.value.filter(client => client.active !== false) : [];
      const userInvoices = invoicesResult.status === 'fulfilled' ? invoicesResult.value : [];

      // Get IDs of valid invoices (submitted, reviewed, paid)
      const validInvoices = userInvoices.filter(invoice => {
        return invoice.status && ['submitted', 'reviewed', 'paid'].includes(invoice.status);
      });

      const validInvoiceWorkEntryIds = new Set();
      validInvoices.forEach(invoice => {
        if (invoice.work_entries && Array.isArray(invoice.work_entries)) {
          invoice.work_entries.forEach(entryId => {
            validInvoiceWorkEntryIds.add(entryId);
          });
        }
      });

      // Filter work entries to show:
      // 1. Those linked to a valid invoice (status: submitted, reviewed, paid)
      // 2. Those that are recent (last 30 days) AND not yet invoiced. This allows cleaners to manage their latest pending work.
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0); // Normalize to start of the day

      const relevantWorkEntries = allWorkEntries.filter(entry => {
        const workDate = new Date(entry.work_date);
        workDate.setHours(0, 0, 0, 0); // Normalize to start of the day
        
        if (validInvoiceWorkEntryIds.has(entry.id)) {
          return true;
        }
        
        if (workDate >= thirtyDaysAgo && !entry.invoiced) {
          return true;
        }
        
        return false;
      });

      setWorkEntries(relevantWorkEntries); // Store the *raw* relevant list
      setClients(allClients);
    } catch (err) {
      console.error("Error loading data:", err);
      setError("Error al cargar los datos. Por favor, inténtalo de nuevo.");
      setWorkEntries([]);
      setClients([]);
    }
    setLoading(false);
  };

  const validateHours = (value) => {
    if (!value || value === "") {
      setHoursError("");
      return true;
    }
    
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      setHoursError("Por favor ingresa un número válido de horas");
      return false;
    }
    
    const decimal = Math.round((num % 1) * 100) / 100;
    const isValidDecimal = VALID_HOUR_DECIMALS.includes(decimal);
    
    if (!isValidDecimal) {
      setHoursError("Solo se permiten decimales .00, .25, .50 o .75");
      return false;
    }
    
    setHoursError("");
    return true;
  };

  const handleEditEntry = (entry) => {
    // Only allow editing if NOT invoiced
    if (entry.invoiced) {
      setEditError("No se puede modificar una entrada que ya está incluida en un reporte de pago enviado.");
      return;
    }
    
    setEditingEntry(entry);
    setEditFormData({
      client_id: entry.client_id,
      client_name: entry.client_name,
      work_date: entry.work_date,
      hours: entry.activity === 'otros' ? "1" : entry.hours.toString(),
      activity: entry.activity,
      other_activity: entry.other_activity || "",
      hourly_rate: entry.activity === 'otros' ? "" : entry.hourly_rate.toString(),
      fixed_amount: entry.activity === 'otros' ? entry.total_amount.toString() : ""
    });
    setEditError("");
    setHoursError("");
  };

  const handleEditFormChange = (field, value) => {
    if (field === 'hours') {
      validateHours(value);
    }
    
    if (field === 'activity') {
      // Reset related fields when activity changes
      setEditFormData(prev => ({
        ...prev,
        activity: value,
        hours: value === 'otros' ? "1" : prev.hours,
        fixed_amount: value !== 'otros' ? "" : prev.fixed_amount,
        hourly_rate: value === 'otros' ? "" : prev.hourly_rate,
        other_activity: value !== 'otros' ? "" : prev.other_activity
      }));
      if (value === 'otros') {
        setHoursError(""); // Clear hours error for "otros"
      }
    } else {
      setEditFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleClientSelect = (client) => {
    setEditFormData(prev => ({
      ...prev,
      client_id: client.id,
      client_name: client.name
    }));
  };

  const calculateEditTotal = () => {
    if (editFormData.activity === 'otros') {
      return parseFloat(editFormData.fixed_amount) || 0;
    } else {
      const hours = parseFloat(editFormData.hours) || 0;
      const rate = parseFloat(editFormData.hourly_rate) || 0;
      return hours * rate;
    }
  };

  const isEditFormValid = () => {
    if (editFormData.activity === 'otros') {
      return editFormData.client_id && 
             editFormData.activity && 
             editFormData.other_activity.trim() !== '' &&
             editFormData.fixed_amount &&
             !isNaN(parseFloat(editFormData.fixed_amount)) && parseFloat(editFormData.fixed_amount) >= 0;
    } else {
      return editFormData.client_id && 
             editFormData.hours && 
             editFormData.activity && 
             editFormData.hourly_rate && 
             !hoursError &&
             !isNaN(parseFloat(editFormData.hours)) && parseFloat(editFormData.hours) >= 0 &&
             !isNaN(parseFloat(editFormData.hourly_rate)) && parseFloat(editFormData.hourly_rate) >= 0;
    }
  };

  const handleSaveEdit = async () => {
    if (!isEditFormValid()) {
      setEditError("Por favor completa todos los campos requeridos correctamente.");
      return;
    }

    setEditLoading(true);
    setEditError("");

    try {
      const originalEntry = editingEntry;
      const formValues = editFormData;

      // Calculate new values based on the form
      const newActivity = formValues.activity;
      const newHours = newActivity === 'otros' ? 1 : parseFloat(formValues.hours) || 0;
      const newFixedAmount = parseFloat(formValues.fixed_amount) || 0;
      const newHourlyRate = newActivity === 'otros' ? newFixedAmount : parseFloat(formValues.hourly_rate) || 0;
      const newTotalAmount = newActivity === 'otros' ? newFixedAmount : newHours * newHourlyRate;
      
      // Normalize other_activity
      const normalizeOtherActivity = (value) => {
        return (value === null || value === undefined || value === '') ? '' : String(value).trim();
      };
      
      const newEffectiveOtherActivity = newActivity === 'otros' ? 
        normalizeOtherActivity(formValues.other_activity) : '';

      // If a cleaner is editing, it means they want to make a change.
      // So, `modified_by_cleaner` is set to true.
      const updateData = {
        client_id: formValues.client_id,
        client_name: formValues.client_name,
        work_date: formValues.work_date,
        hours: newHours,
        activity: newActivity,
        other_activity: newEffectiveOtherActivity,
        hourly_rate: newHourlyRate,
        total_amount: newTotalAmount,
        modified_by_cleaner: true, // Mark as modified by cleaner
        last_modified_at: new Date().toISOString(),
        // Store original values if not already stored
        original_values: originalEntry.original_values || {
          hours: originalEntry.hours,
          hourly_rate: originalEntry.hourly_rate,
          total_amount: originalEntry.total_amount,
          activity: originalEntry.activity,
          other_activity: normalizeOtherActivity(originalEntry.other_activity),
          client_id: originalEntry.client_id,
          client_name: originalEntry.client_name
        }
      };

      await WorkEntry.update(originalEntry.id, updateData);
      
      setEditingEntry(null);
      setSuccess("¡Entrada de trabajo actualizada exitosamente!");
      loadData(); // Reload data to see changes and re-filter
      
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error updating work entry:", err);
      setEditError(err.message || "Error al actualizar la entrada de trabajo.");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteEntry = (entry) => {
    // Only allow deletion if NOT invoiced
    if (entry.invoiced) {
      setEditError("No se puede eliminar una entrada que ya está incluida en un reporte de pago enviado.");
      return;
    }
    setDeleteEntry(entry);
    setEditError(""); // Clear any previous edit error
  };

  const confirmDeleteEntry = async () => {
    if (!deleteEntry) return;
    
    setDeleteLoading(true);
    setEditError(""); // Clear any previous error before attempting delete
    try {
      await WorkEntry.delete(deleteEntry.id);
      
      setDeleteEntry(null);
      setSuccess("¡Entrada de trabajo eliminada exitosamente!");
      loadData(); // Reload data and re-filter
      
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error deleting work entry:", err);
      setEditError(err.message || "Error al eliminar la entrada de trabajo.");
    } finally {
      setDeleteLoading(false);
    }
  };

  // New function to calculate summary stats based on `filteredEntries`
  const calculateSummary = () => {
    const totalHours = filteredEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
    const totalAmount = filteredEntries.reduce((sum, entry) => sum + (entry.total_amount || 0), 0);
    const totalEntries = filteredEntries.length;
    return { totalHours, totalAmount, totalEntries };
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-5">

        {success && (
          <div className="mb-4 px-3 py-2.5 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}
        {error && (
          <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border-0 p-4 mb-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Período</p>
            <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} />
          </div>
          {showFilters && (
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Estado</p>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="invoiced">Facturados</SelectItem>
                    <SelectItem value="pending">Pendientes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Cliente</p>
                <Select value={clientFilter} onValueChange={setClientFilter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <SelectItem value="all">Todos</SelectItem>
                    {Array.from(new Set(workEntries.map(we => we.client_name))).sort().map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 py-1 transition-colors"
          >
            <Filter className="w-3.5 h-3.5" />
            {showFilters ? 'Ocultar filtros' : 'Más filtros'}
          </button>
        </div>

        {/* Summary Strip */}
        {!loading && filteredEntries.length > 0 && (() => {
          const s = calculateSummary();
          return (
            <div className="grid grid-cols-3 bg-slate-900 rounded-2xl shadow-sm mb-4 overflow-hidden">
              <div className="text-center py-4 px-2 border-r border-slate-700">
                <p className="text-lg font-bold text-white tabular-nums">{s.totalHours.toFixed(1)}h</p>
                <p className="text-xs text-slate-400 mt-0.5">Horas</p>
              </div>
              <div className="text-center py-4 px-2 border-r border-slate-700">
                <p className="text-lg font-bold text-green-400 tabular-nums">${s.totalAmount.toFixed(0)}</p>
                <p className="text-xs text-slate-400 mt-0.5">Total</p>
              </div>
              <div className="text-center py-4 px-2">
                <p className="text-lg font-bold text-white tabular-nums">{s.totalEntries}</p>
                <p className="text-xs text-slate-400 mt-0.5">Servicios</p>
              </div>
            </div>
          );
        })()}

        {/* Work Entries List */}
        {loading ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm text-slate-500">Cargando...</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="font-semibold text-slate-600">No hay entradas</p>
            <p className="text-sm text-slate-400 mt-1">
              {workEntries.length === 0 ? 'Sin registros para este período.' : 'Sin resultados con los filtros aplicados.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                className={`bg-white rounded-2xl shadow-sm overflow-hidden ${
                  entry.invoiced ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-amber-400'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-900 truncate">{entry.client_name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{format(new Date(entry.work_date), 'd MMM yyyy', { locale: es })}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                      entry.invoiced ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {entry.invoiced ? 'Facturado' : 'Pendiente'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-slate-500 text-xs bg-slate-50 px-2 py-1 rounded-lg">
                      {ACTIVITY_LABELS[entry.activity]}
                      {entry.activity === 'otros' && entry.other_activity ? ` — ${entry.other_activity}` : ''}
                    </span>
                    <span className="text-slate-600 text-xs">{entry.hours}h</span>
                    <span className="text-slate-400 text-xs">${entry.hourly_rate.toFixed(2)}/h</span>
                    <span className="ml-auto font-bold text-slate-900">${entry.total_amount.toFixed(2)}</span>
                  </div>

                  {entry.modified_by_cleaner && (
                    <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Modificada por ti
                    </p>
                  )}

                  {!entry.invoiced && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => handleEditEntry(entry)}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 py-2 rounded-lg transition-colors"
                      >
                        <Edit className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button
                        onClick={() => handleDeleteEntry(entry)}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 py-2 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Eliminar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Modificar Entrada de Trabajo</DialogTitle>
            </DialogHeader>
            
            {editError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <ClientSearchCombobox
                  clients={clients}
                  selectedClient={editFormData.client_name}
                  onClientSelect={handleClientSelect}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_work_date">Fecha del Trabajo *</Label>
                <Input
                  id="edit_work_date"
                  type="date"
                  value={editFormData.work_date}
                  onChange={(e) => handleEditFormChange('work_date', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Actividad *</Label>
                <Select
                  value={editFormData.activity}
                  onValueChange={(value) => handleEditFormChange('activity', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una actividad" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITIES.map((activity) => (
                      <SelectItem key={activity.value} value={activity.value}>
                        {activity.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editFormData.activity === 'otros' && (
                <>
                  <div className="space-y-2">
                    <Label>Descripción de la Actividad *</Label>
                    <Textarea
                      value={editFormData.other_activity}
                      onChange={(e) => handleEditFormChange('other_activity', e.target.value)}
                      placeholder="Describe la actividad realizada..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Monto Fijo (AUD) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editFormData.fixed_amount}
                      onChange={(e) => handleEditFormChange('fixed_amount', e.target.value)}
                      placeholder="50.00"
                      onWheel={(e) => e.currentTarget.blur()}
                    />
                  </div>
                </>
              )}

              {editFormData.activity !== 'otros' && editFormData.activity && (
                <>
                  <div className="space-y-2">
                    <Label>Tarifa por Hora (AUD) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editFormData.hourly_rate}
                      onChange={(e) => handleEditFormChange('hourly_rate', e.target.value)}
                      placeholder="25.00"
                      onWheel={(e) => e.currentTarget.blur()}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Horas Trabajadas *</Label>
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      value={editFormData.hours}
                      onChange={(e) => handleEditFormChange('hours', e.target.value)}
                      placeholder="8.5"
                      onWheel={(e) => e.currentTarget.blur()}
                      className={hoursError ? 'border-red-500' : ''}
                    />
                    {hoursError && (
                      <p className="text-red-500 text-sm">{hoursError}</p>
                    )}
                  </div>
                </>
              )}

              {isEditFormValid() && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="text-center">
                    <p className="text-sm text-green-700 mb-1">Valor Actualizado:</p>
                    <p className="text-2xl font-bold text-green-800">
                      ${calculateEditTotal().toFixed(2)} AUD
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setEditingEntry(null)}
                disabled={editLoading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={editLoading || !isEditFormValid()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {editLoading ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteEntry} onOpenChange={(open) => !open && setDeleteEntry(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Confirmar Eliminación</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {editError && ( // Reusing editError state for delete dialog for consistency
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{editError}</AlertDescription>
                </Alert>
              )}
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  ¿Estás seguro de que quieres eliminar esta entrada de trabajo? Esta acción no se puede deshacer.
                </AlertDescription>
              </Alert>

              {deleteEntry && (
                <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                  <h4 className="font-medium text-slate-900">Detalles de la entrada a eliminar:</h4>
                  <div className="text-sm text-slate-700 space-y-1">
                    <p><strong>Cliente:</strong> {deleteEntry.client_name}</p>
                    <p><strong>Fecha:</strong> {format(new Date(deleteEntry.work_date), "d MMM yyyy", { locale: es })}</p>
                    <p><strong>Actividad:</strong> {ACTIVITY_LABELS[deleteEntry.activity]}</p>
                    {deleteEntry.activity === 'otros' && deleteEntry.other_activity && (
                      <p><strong>Descripción:</strong> {deleteEntry.other_activity}</p>
                    )}
                    <p><strong>Horas:</strong> {deleteEntry.hours}h</p>
                    <p><strong>Total:</strong> ${deleteEntry.total_amount?.toFixed(2)} AUD</p>
                    <p className="text-yellow-700 font-medium">
                      <strong>Estado:</strong> {deleteEntry.invoiced ? 'Incluida en reporte' : 'Pendiente de incluir en reporte'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setDeleteEntry(null)}
                disabled={deleteLoading}
              >
                Cancelar
              </Button>
              <Button 
                variant="destructive"
                onClick={confirmDeleteEntry}
                disabled={deleteLoading}
              >
                {deleteLoading ? "Eliminando..." : "Sí, eliminar entrada"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}