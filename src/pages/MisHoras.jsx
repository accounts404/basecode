
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 pb-24">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Mis Horas de Trabajo</h1>
          <p className="text-slate-600">Revisa y gestiona tus entradas de trabajo</p>
        </div>

        {success && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Global Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-5 w-5" />
            <AlertDescription className="text-base">{error}</AlertDescription>
          </Alert>
        )}

        {/* Filters - Optimizado para móvil */}
        <Card className="mb-6 shadow-md border-0">
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-sm font-semibold mb-2 block">Período</Label>
              <PeriodSelector
                selectedPeriod={selectedPeriod}
                onPeriodChange={setSelectedPeriod}
              />
            </div>

            {showFilters && (
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <div>
                  <Label className="text-sm font-semibold mb-2 block">Estado</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Todos los estados" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="invoiced">Facturados</SelectItem>
                      <SelectItem value="pending">Pendientes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-semibold mb-2 block">Cliente</Label>
                  <Select value={clientFilter} onValueChange={setClientFilter}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Todos los clientes" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      <SelectItem value="all">Todos los clientes</SelectItem>
                      {Array.from(new Set(workEntries.map(we => we.client_name)))
                        .sort()
                        .map(clientName => (
                          <SelectItem key={clientName} value={clientName}>
                            {clientName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="w-full h-12 text-slate-700 border-slate-300 hover:bg-slate-50"
            >
              <Filter className="w-5 h-5 mr-2" />
              {showFilters ? 'Ocultar Filtros' : 'Mostrar Filtros'}
            </Button>
          </CardContent>
        </Card>

        {/* Summary Cards - Apiladas verticalmente */}
        {!loading && filteredEntries.length > 0 && (
          <div className="grid gap-4 mb-6">
            <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg border-0">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm mb-1">Total Horas</p>
                    <p className="text-3xl font-bold">{calculateSummary().totalHours.toFixed(2)}h</p>
                  </div>
                  <Clock className="w-12 h-12 text-blue-300" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-green-600 to-green-700 text-white shadow-lg border-0">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm mb-1">Total a Cobrar</p>
                    <p className="text-3xl font-bold">${calculateSummary().totalAmount.toFixed(2)}</p>
                  </div>
                  <DollarSign className="w-12 h-12 text-green-300" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-0">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-600 text-sm mb-1">Servicios</p>
                    <p className="text-2xl font-bold text-slate-900">{calculateSummary().totalEntries}</p>
                  </div>
                  <FileText className="w-10 h-10 text-blue-600" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Work Entries List - Cards móviles */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600">Cargando entradas de trabajo...</p>
          </div>
        ) : error ? ( // Display general error if any
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-5 w-5" />
            <AlertDescription className="text-base">{error}</AlertDescription>
          </Alert>
        ) : filteredEntries.length === 0 ? (
          <Card className="shadow-md border-0">
            <CardContent className="p-8 text-center">
              <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                No hay entradas de trabajo
              </h3>
              <p className="text-slate-600 mb-6">
                {workEntries.length === 0
                  ? "Aún no tienes entradas de trabajo registradas para este período."
                  : "No se encontraron entradas con los filtros aplicados."}
              </p>
              {workEntries.length === 0 && user?.active !== false && (
                <Button onClick={() => { /* navigate(createPageUrl("RegistrarTrabajo")) */ console.log("Navigate to RegistrarTrabajo"); }}>
                  Registrar Primer Trabajo
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredEntries.map((entry) => (
              <Card 
                key={entry.id}
                className={`shadow-md border-0 ${entry.invoiced ? 'bg-green-50 border-green-200' : 'bg-white'}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 text-lg mb-1">
                        {entry.client_name}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(entry.work_date), 'PPP', { locale: es })}
                      </div>
                    </div>
                    {entry.invoiced ? (
                      <Badge className="bg-green-600 text-white flex-shrink-0 px-3 py-1 text-sm font-medium">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Facturado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="flex-shrink-0 bg-yellow-50 text-yellow-800 border-yellow-200 px-3 py-1 text-sm font-medium">
                        Pendiente
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-slate-600 text-xs mb-1">Actividad</p>
                      <p className="font-semibold text-slate-900">
                        {ACTIVITY_LABELS[entry.activity]}
                        {entry.activity === 'otros' && entry.other_activity && (
                          <span className="block text-xs text-slate-600 mt-1">
                            {entry.other_activity}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-slate-600 text-xs mb-1">Horas</p>
                      <p className="font-semibold text-slate-900">
                        {entry.hours}h
                      </p>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-slate-600 text-xs mb-1">Tarifa</p>
                      <p className="font-semibold text-slate-900">
                        ${entry.hourly_rate.toFixed(2)}/h
                      </p>
                    </div>

                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-blue-600 text-xs mb-1">Total</p>
                      <p className="font-bold text-blue-900 text-lg">
                        ${entry.total_amount.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Action buttons visible only if not invoiced */}
                  {!entry.invoiced && (
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditEntry(entry)}
                        className="flex-1 h-11 border-blue-200 text-blue-600 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteEntry(entry)}
                        className="flex-1 h-11 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Eliminar
                      </Button>
                    </div>
                  )}

                  {entry.modified_by_cleaner && (
                    <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2 text-xs text-amber-700">
                      <AlertCircle className="w-4 h-4" />
                      <span>Modificada por ti</span>
                    </div>
                  )}
                </CardContent>
              </Card>
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
