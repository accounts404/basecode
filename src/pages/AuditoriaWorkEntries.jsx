import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Calendar,
  RefreshCw,
  FileText,
  Plus,
  Eye,
  Filter,
  Loader2,
  XCircle,
  Zap,
  AlertCircle
} from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import MonthMultiSelector from '../components/work/MonthMultiSelector';

export default function AuditoriaWorkEntriesPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Data
  const [schedules, setSchedules] = useState([]);
  const [workEntries, setWorkEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);

  // Filters
  const [selectedMonthRanges, setSelectedMonthRanges] = useState([]);
  const [selectedCleaner, setSelectedCleaner] = useState("all");
  const [showOnlyMissing, setShowOnlyMissing] = useState(true);

  // Modal
  const [selectedItem, setSelectedItem] = useState(null);
  const [creatingEntry, setCreatingEntry] = useState(false);

  // Batch actions
  const [selectedItems, setSelectedItems] = useState([]);
  const [batchProcessing, setBatchProcessing] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

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

  const loadInitialData = async () => {
    setLoading(true);
    setError("");
    try {
      const currentUser = await base44.auth.me();
      if (currentUser.role !== 'admin') {
        setError("Acceso denegado. Solo administradores.");
        setLoading(false);
        return;
      }
      setUser(currentUser);

      console.log('[AuditoriaWorkEntries] 📊 Cargando todos los datos...');
      
      const [schedulesResult, workEntriesResult, usersResult, clientsResult] = await Promise.all([
        loadAllRecords('Schedule', '-start_time'),
        loadAllRecords('WorkEntry', '-work_date'),
        loadAllRecords('User', '-created_date'),
        loadAllRecords('Client', '-created_date')
      ]);

      console.log('[AuditoriaWorkEntries] ✅ Datos cargados:', {
        schedules: schedulesResult?.length || 0,
        workEntries: workEntriesResult?.length || 0,
        users: usersResult?.length || 0,
        clients: clientsResult?.length || 0
      });

      setSchedules(schedulesResult || []);
      setWorkEntries(workEntriesResult || []);
      setUsers(usersResult || []);
      setClients(clientsResult || []);
    } catch (err) {
      console.error("Error loading data:", err);
      setError("Error al cargar datos: " + (err.message || "Error desconocido"));
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
    setSuccess("Datos actualizados exitosamente");
    setTimeout(() => setSuccess(""), 3000);
  };

  // Get cleaners (non-admin users)
  const cleaners = useMemo(() => {
    return users.filter(u => u.role !== 'admin').sort((a, b) => 
      (a.full_name || '').localeCompare(b.full_name || '')
    );
  }, [users]);

  // Analyze schedules vs work entries
  const auditResults = useMemo(() => {
    if (selectedMonthRanges.length === 0) return [];

    // Filter completed schedules within selected month ranges (comparación de strings, sin timezone)
    const completedSchedules = schedules.filter(schedule => {
      if (schedule.status !== 'completed') return false;
      if (!schedule.start_time) return false;
      
      const scheduleDateStr = schedule.start_time.slice(0, 10); // YYYY-MM-DD
      
      return selectedMonthRanges.some(range => {
        const toLocalDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const rangeStart = toLocalDateStr(range.start);
        const rangeEnd = toLocalDateStr(range.end);
        return scheduleDateStr >= rangeStart && scheduleDateStr <= rangeEnd;
      });
    });

    console.log(`[AuditoriaWorkEntries] 🔍 Servicios completados en rango: ${completedSchedules.length}`);

    // Create a map of work entries by schedule_id and cleaner_id
    const workEntryMap = new Map();
    workEntries.forEach(we => {
      if (we.schedule_id) {
        const key = `${we.schedule_id}_${we.cleaner_id}`;
        if (!workEntryMap.has(key)) {
          workEntryMap.set(key, []);
        }
        workEntryMap.get(key).push(we);
      }
    });

    // Analyze each schedule-cleaner combination
    const results = [];
    
    completedSchedules.forEach(schedule => {
      const cleanerIds = schedule.cleaner_ids || [];
      
      cleanerIds.forEach(cleanerId => {
        // Apply cleaner filter
        if (selectedCleaner !== 'all' && cleanerId !== selectedCleaner) return;

        const cleaner = users.find(u => u.id === cleanerId);
        const cleanerName = cleaner?.invoice_name || cleaner?.full_name || 'Desconocido';
        const client = clients.find(c => c.id === schedule.client_id);

        // Get work entries for this schedule and cleaner
        const key = `${schedule.id}_${cleanerId}`;
        const relatedWorkEntries = workEntryMap.get(key) || [];

        // Calcular horas SOLO desde cleaner_schedules individual — sin redondeo
        const isoToMinutes = (isoStr) => {
          if (!isoStr) return 0;
          return parseInt(isoStr.slice(11, 13)) * 60 + parseInt(isoStr.slice(14, 16));
        };

        let expectedHours = 0;
        let hasIndividualSchedule = false;

        if (schedule.cleaner_schedules && schedule.cleaner_schedules.length > 0) {
          const cleanerSchedule = schedule.cleaner_schedules.find(cs => cs.cleaner_id === cleanerId);
          if (cleanerSchedule && cleanerSchedule.start_time && cleanerSchedule.end_time) {
            expectedHours = (isoToMinutes(cleanerSchedule.end_time) - isoToMinutes(cleanerSchedule.start_time)) / 60;
            hasIndividualSchedule = true;
          }
        }
        // NO usar horario general como fallback — sin horario individual no se puede crear

        // Calculate actual hours from work entries
        const actualHours = relatedWorkEntries.reduce((sum, we) => sum + (we.hours || 0), 0);

        // Determine if WorkEntry is missing
        const isMissing = relatedWorkEntries.length === 0;

        // Get cleaner's rate for the service date (usando comparación de string para evitar timezone)
        let cleanerRate = 0;
        const workDateStr = schedule.start_time.slice(0, 10);
        if (cleaner?.rate_history && cleaner.rate_history.length > 0) {
          const effectiveRate = cleaner.rate_history
            .filter(rh => rh.effective_date <= workDateStr)
            .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
          if (effectiveRate) cleanerRate = effectiveRate.rate;
        }

        // Get client activity type
        const clientActivityType = client?.client_type || 'domestic';

        results.push({
          schedule,
          client,
          cleanerId,
          cleanerName,
          cleanerRate,
          expectedHours,
          actualHours,
          workEntries: relatedWorkEntries,
          isMissing,
          hasIndividualSchedule,
          clientActivityType,
          // canCreate solo si hay horario individual, horas > 0 y tarifa > 0
          canCreate: isMissing && hasIndividualSchedule && expectedHours > 0 && cleanerRate > 0,
          key: `${schedule.id}_${cleanerId}`
        });
      });
    });

    // Sort: missing first, then by date
    results.sort((a, b) => {
      if (a.isMissing !== b.isMissing) return a.isMissing ? -1 : 1;
      return new Date(b.schedule.start_time) - new Date(a.schedule.start_time);
    });

    console.log(`[AuditoriaWorkEntries] ✅ Resultados analizados: ${results.length}`);

    return results;
  }, [schedules, workEntries, users, clients, selectedMonthRanges, selectedCleaner]);

  // Filtered results
  const filteredResults = useMemo(() => {
    if (showOnlyMissing) {
      return auditResults.filter(r => r.isMissing);
    }
    return auditResults;
  }, [auditResults, showOnlyMissing]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: auditResults.length,
      withEntries: auditResults.filter(r => !r.isMissing).length,
      missing: auditResults.filter(r => r.isMissing).length,
      canCreate: auditResults.filter(r => r.canCreate).length
    };
  }, [auditResults]);

  // Create single missing work entry
  const handleCreateSingle = async (result) => {
    setCreatingEntry(true);
    setError("");
    setSuccess("");
    
    try {
      // Extraer solo la fecha sin considerar la hora (zona horaria)
      const workDateStr = result.schedule.start_time.split('T')[0];
      const workDate = new Date(workDateStr + 'T00:00:00');
      
      const workEntryData = {
        cleaner_id: result.cleanerId,
        cleaner_name: result.cleanerName,
        client_id: result.schedule.client_id,
        client_name: result.schedule.client_name,
        work_date: workDateStr,
        hours: result.expectedHours, // Exacto, sin redondeo
        activity: result.clientActivityType || 'domestic',
        hourly_rate: result.cleanerRate,
        total_amount: parseFloat((result.expectedHours * result.cleanerRate).toFixed(2)),
        period: `${format(workDate, 'yyyy-MM')}-${workDate.getDate() <= 15 ? '1st' : '2nd'}`,
        invoiced: false,
        schedule_id: result.schedule.id
      };

      console.log('[AuditoriaWorkEntries] 🔨 Creando WorkEntry:', workEntryData);

      const newEntry = await base44.entities.WorkEntry.create(workEntryData);
      
      setSuccess(`WorkEntry creada: ${result.cleanerName} - ${result.schedule.client_name} (${result.expectedHours}h × $${result.cleanerRate} = $${workEntryData.total_amount.toFixed(2)})`);
      
      await handleRefresh();
      setSelectedItem(null);
    } catch (err) {
      console.error("Error creating work entry:", err);
      setError("Error al crear WorkEntry: " + (err.message || "Error desconocido"));
    } finally {
      setCreatingEntry(false);
    }
  };

  // Batch create missing entries
  const handleBatchCreate = async () => {
    if (selectedItems.length === 0) return;
    
    setBatchProcessing(true);
    setError("");
    setSuccess("");

    const itemsToCreate = filteredResults.filter(r => selectedItems.includes(r.key) && r.canCreate);
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const result of itemsToCreate) {
      try {
        // Extraer solo la fecha sin considerar la hora (zona horaria)
        const workDateStr = result.schedule.start_time.split('T')[0];
        const workDate = new Date(workDateStr + 'T00:00:00');
        
        const workEntryData = {
          cleaner_id: result.cleanerId,
          cleaner_name: result.cleanerName,
          client_id: result.schedule.client_id,
          client_name: result.schedule.client_name,
          work_date: workDateStr,
          hours: result.expectedHours, // Exacto, sin redondeo
          activity: result.clientActivityType || 'domestic',
          hourly_rate: result.cleanerRate,
          total_amount: parseFloat((result.expectedHours * result.cleanerRate).toFixed(2)),
          period: `${format(workDate, 'yyyy-MM')}-${workDate.getDate() <= 15 ? '1st' : '2nd'}`,
          invoiced: false,
          schedule_id: result.schedule.id
        };

        await base44.entities.WorkEntry.create(workEntryData);
        successCount++;
        
      } catch (err) {
        console.error("Error in batch create:", err);
        errorCount++;
        errors.push(`${result.cleanerName} - ${result.schedule.client_name}: ${err.message}`);
      }
    }

    if (successCount > 0) {
      setSuccess(`✅ ${successCount} WorkEntries creadas exitosamente`);
    }
    if (errorCount > 0) {
      setError(`❌ ${errorCount} errores: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`);
    }

    setSelectedItems([]);
    await handleRefresh();
    setBatchProcessing(false);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const creatableKeys = filteredResults
        .filter(r => r.canCreate)
        .map(r => r.key);
      setSelectedItems(creatableKeys);
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (key, checked) => {
    if (checked) {
      setSelectedItems(prev => [...prev, key]);
    } else {
      setSelectedItems(prev => prev.filter(k => k !== key));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-600 mx-auto animate-spin" />
          <p className="text-slate-600">Cargando datos de auditoría...</p>
        </div>
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Acceso denegado. Solo administradores.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl shadow-lg">
                <Search className="w-8 h-8 text-white" />
              </div>
              Auditoría de WorkEntries
            </h1>
            <p className="text-slate-600 mt-2">
              Detecta servicios completados sin entradas de trabajo y créalas automáticamente
            </p>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="lg">
            <RefreshCw className={`w-5 h-5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </div>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-5 w-5" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Filters */}
        <Card className="shadow-lg border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-blue-600" />
              Filtros de Búsqueda
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Selecciona los meses a auditar
              </label>
              <MonthMultiSelector onSelectionChange={setSelectedMonthRanges} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Limpiador</label>
                <Select value={selectedCleaner} onValueChange={setSelectedCleaner}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los limpiadores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los limpiadores</SelectItem>
                    {cleaners.map(cleaner => (
                      <SelectItem key={cleaner.id} value={cleaner.id}>
                        {cleaner.invoice_name || cleaner.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox 
                    checked={showOnlyMissing} 
                    onCheckedChange={setShowOnlyMissing}
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Mostrar solo entradas faltantes
                  </span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        {selectedMonthRanges.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-slate-50 border-slate-200 shadow-md">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
                <p className="text-sm text-slate-600">Total Analizado</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200 shadow-md">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-green-700">{stats.withEntries}</p>
                <p className="text-sm text-green-600">Con WorkEntry</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200 shadow-md">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-red-700">{stats.missing}</p>
                <p className="text-sm text-red-600">Sin WorkEntry</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 border-blue-200 shadow-md">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-blue-700">{stats.canCreate}</p>
                <p className="text-sm text-blue-600">Listas para Crear</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Results Table */}
        <Card className="shadow-lg border-0">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Resultados ({filteredResults.length})
            </CardTitle>
            {selectedItems.length > 0 && (
              <Button 
                onClick={handleBatchCreate} 
                disabled={batchProcessing}
                className="bg-green-600 hover:bg-green-700 shadow-md"
                size="lg"
              >
                {batchProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 mr-2" />
                    Crear {selectedItems.length} WorkEntries
                  </>
                )}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {selectedMonthRanges.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 text-lg font-medium">Selecciona los meses a auditar para comenzar</p>
                <p className="text-slate-500 text-sm mt-2">Usa el selector de meses arriba para filtrar por período</p>
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <p className="text-slate-600 text-lg font-medium">
                  {showOnlyMissing 
                    ? "¡Perfecto! No hay WorkEntries faltantes en los meses seleccionados" 
                    : "No hay servicios completados en los meses seleccionados"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox 
                          checked={selectedItems.length > 0 && selectedItems.length === filteredResults.filter(r => r.canCreate).length}
                          onCheckedChange={handleSelectAll}
                          disabled={filteredResults.filter(r => r.canCreate).length === 0}
                        />
                      </TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Limpiador</TableHead>
                      <TableHead className="text-center">Horas</TableHead>
                      <TableHead className="text-center">Tarifa</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((result) => (
                      <TableRow 
                        key={result.key} 
                        className={result.isMissing ? 'bg-red-50/50' : 'bg-green-50/30'}
                      >
                        <TableCell>
                          {result.canCreate && (
                            <Checkbox 
                              checked={selectedItems.includes(result.key)}
                              onCheckedChange={(checked) => handleSelectItem(result.key, checked)}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {format(new Date(result.schedule.start_time.slice(0, 10) + 'T12:00:00'), "d MMM yyyy", { locale: es })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-semibold">{result.schedule.client_name || 'Sin cliente'}</p>
                            <p className="text-xs text-slate-500">{result.client?.address || ''}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{result.cleanerName}</p>
                            {result.cleanerRate > 0 && (
                              <p className="text-xs text-slate-500">${result.cleanerRate}/h</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          {result.isMissing ? (
                            <span className="text-blue-600">{result.expectedHours}h</span>
                          ) : (
                            <span className="text-green-600">{result.actualHours}h</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {result.cleanerRate > 0 ? (
                            <span className="font-medium">${result.cleanerRate}</span>
                          ) : (
                            <span className="text-red-600 text-xs">Sin tarifa</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-bold">
                          {result.cleanerRate > 0 && result.expectedHours > 0 ? (
                            <span className="text-green-700">
                              ${(result.expectedHours * result.cleanerRate).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {result.isMissing ? (
                            result.canCreate ? (
                              <Badge className="bg-blue-100 text-blue-800">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Lista para Crear
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="w-3 h-3 mr-1" />
                                Falta Datos
                              </Badge>
                            )
                          ) : (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Tiene WorkEntry
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedItem(result)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {result.canCreate && (
                              <Button 
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => handleCreateSingle(result)}
                                disabled={creatingEntry}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Crear
                              </Button>
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

        {/* Detail Modal */}
        <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalles del Servicio</DialogTitle>
              <DialogDescription>
                Información completa del servicio y estado de WorkEntry
              </DialogDescription>
            </DialogHeader>
            {selectedItem && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600 mb-1">Cliente</p>
                    <p className="font-semibold text-lg">{selectedItem.schedule.client_name || 'Sin cliente'}</p>
                    {selectedItem.client?.address && (
                      <p className="text-sm text-slate-500 mt-1">{selectedItem.client.address}</p>
                    )}
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600 mb-1">Fecha del Servicio</p>
                    <p className="font-semibold text-lg">
                      {format(new Date(selectedItem.schedule.start_time.slice(0, 10) + 'T12:00:00'), "d MMMM yyyy", { locale: es })}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {selectedItem.schedule.start_time.slice(11, 16)} - {selectedItem.schedule.end_time.slice(11, 16)}
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-700 mb-1">Limpiador</p>
                    <p className="font-semibold text-lg text-blue-900">{selectedItem.cleanerName}</p>
                    <p className="text-sm text-blue-600 mt-1">Tarifa: ${selectedItem.cleanerRate}/h</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-sm text-green-700 mb-1">Cálculo</p>
                    <p className="font-semibold text-lg text-green-900">
                      {selectedItem.expectedHours}h × ${selectedItem.cleanerRate}
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      Total: ${(selectedItem.expectedHours * selectedItem.cleanerRate).toFixed(2)}
                    </p>
                  </div>
                </div>

                {selectedItem.isMissing ? (
                  <Alert className="bg-amber-50 border-amber-300">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    <AlertDescription className="text-amber-800">
                      <p className="font-semibold mb-1">Este servicio NO tiene WorkEntry registrada</p>
                      {selectedItem.canCreate ? (
                        <p className="text-sm">Todos los datos necesarios están disponibles. Puedes crear la WorkEntry ahora.</p>
                      ) : (
                        <p className="text-sm">Faltan datos necesarios (tarifa del limpiador o horas del servicio).</p>
                      )}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div>
                    <p className="font-semibold mb-2 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      WorkEntries Registradas:
                    </p>
                    <div className="space-y-2">
                      {selectedItem.workEntries.map(we => (
                        <div key={we.id} className="p-3 bg-green-50 rounded-lg border border-green-200 text-sm">
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="font-medium">{we.activity}</span>
                              <span className="text-slate-600 ml-2">• {we.client_name}</span>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-green-700">
                                {we.hours}h × ${we.hourly_rate}/h = ${we.total_amount.toFixed(2)}
                              </p>
                              <p className="text-xs text-slate-500">
                                {we.invoiced ? '✅ Facturada' : '⏳ Pendiente'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedItem(null)}>
                Cerrar
              </Button>
              {selectedItem?.canCreate && (
                <Button 
                  onClick={() => handleCreateSingle(selectedItem)}
                  disabled={creatingEntry}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {creatingEntry ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Crear WorkEntry
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}