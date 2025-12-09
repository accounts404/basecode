import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Users, 
  Calendar,
  RefreshCw,
  FileText,
  Plus,
  Eye,
  Filter,
  TrendingUp,
  XCircle
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import PeriodSelector from "../components/reports/PeriodSelector";
import { processScheduleForWorkEntries } from "@/functions/processScheduleForWorkEntries";

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

  // Filters
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedCleaner, setSelectedCleaner] = useState("all");
  const [showOnlyDiscrepancies, setShowOnlyDiscrepancies] = useState(true);

  // Modal
  const [selectedSchedule, setSelectedSchedule] = useState(null);
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

      console.log('[AuditoriaWorkEntries] 📊 Cargando TODOS los registros con paginación...');
      
      const [schedulesResult, workEntriesResult, usersResult] = await Promise.all([
        loadAllRecords('Schedule', '-start_time'),
        loadAllRecords('WorkEntry', '-work_date'),
        loadAllRecords('User', '-created_date')
      ]);

      console.log('[AuditoriaWorkEntries] ✅ Registros cargados:', {
        schedules: schedulesResult?.length || 0,
        workEntries: workEntriesResult?.length || 0,
        users: usersResult?.length || 0
      });

      setSchedules(schedulesResult || []);
      setWorkEntries(workEntriesResult || []);
      setUsers(usersResult || []);
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
  };

  // Get cleaners (non-admin users)
  const cleaners = useMemo(() => {
    return users.filter(u => u.role !== 'admin').sort((a, b) => 
      (a.full_name || '').localeCompare(b.full_name || '')
    );
  }, [users]);

  // Analyze schedules vs work entries
  const auditResults = useMemo(() => {
    if (!selectedPeriod) return [];

    const startDate = format(selectedPeriod.start, 'yyyy-MM-dd');
    const endDate = format(selectedPeriod.end, 'yyyy-MM-dd');

    // Filter completed schedules in the period
    const completedSchedules = schedules.filter(schedule => {
      if (schedule.status !== 'completed') return false;
      if (!schedule.start_time) return false;
      
      const scheduleDate = schedule.start_time.slice(0, 10);
      return scheduleDate >= startDate && scheduleDate <= endDate;
    });

    // MEJORADO: Crear mapas de work entries tanto por schedule_id como por fecha+cliente+limpiador
    const workEntryByScheduleMap = new Map();
    const workEntryByDateClientCleanerMap = new Map();
    
    workEntries.forEach(we => {
      // Mapa por schedule_id (método principal)
      if (we.schedule_id) {
        const keyBySchedule = `${we.schedule_id}_${we.cleaner_id}`;
        if (!workEntryByScheduleMap.has(keyBySchedule)) {
          workEntryByScheduleMap.set(keyBySchedule, []);
        }
        workEntryByScheduleMap.get(keyBySchedule).push(we);
      }
      
      // Mapa por fecha + cliente + limpiador (método alternativo)
      if (we.work_date && we.client_id && we.cleaner_id) {
        const keyByDetails = `${we.work_date}_${we.client_id}_${we.cleaner_id}`;
        if (!workEntryByDateClientCleanerMap.has(keyByDetails)) {
          workEntryByDateClientCleanerMap.set(keyByDetails, []);
        }
        workEntryByDateClientCleanerMap.get(keyByDetails).push(we);
      }
    });

    // Analyze each schedule
    const results = [];
    
    completedSchedules.forEach(schedule => {
      const cleanerIds = schedule.cleaner_ids || [];
      
      cleanerIds.forEach(cleanerId => {
        // Apply cleaner filter
        if (selectedCleaner !== 'all' && cleanerId !== selectedCleaner) return;

        const cleaner = users.find(u => u.id === cleanerId);
        const cleanerName = cleaner?.invoice_name || cleaner?.full_name || 'Desconocido';

        // MEJORADO: Buscar work entries de tres formas para máxima cobertura
        const keyBySchedule = `${schedule.id}_${cleanerId}`;
        let relatedWorkEntries = workEntryByScheduleMap.get(keyBySchedule) || [];
        let searchMethod = 'schedule_id';
        
        // Si no se encontró por schedule_id, buscar por fecha + cliente + limpiador
        if (relatedWorkEntries.length === 0 && schedule.start_time && schedule.client_id) {
          const scheduleDate = schedule.start_time.slice(0, 10);
          const keyByDetails = `${scheduleDate}_${schedule.client_id}_${cleanerId}`;
          relatedWorkEntries = workEntryByDateClientCleanerMap.get(keyByDetails) || [];
          
          if (relatedWorkEntries.length > 0) {
            searchMethod = 'date_client_cleaner';
            console.log(`[Auditoría] ℹ️ WorkEntry encontrada por fecha+cliente+limpiador para ${cleanerName} en ${scheduleDate}`);
          }
        }
        
        // DEBUGGING: Si aún no se encuentra, buscar manualmente
        if (relatedWorkEntries.length === 0 && schedule.start_time) {
          const scheduleDate = schedule.start_time.slice(0, 10);
          const manualSearch = workEntries.filter(we => {
            const weDate = we.work_date?.slice(0, 10);
            return we.cleaner_id === cleanerId && 
                   weDate === scheduleDate &&
                   (we.client_id === schedule.client_id || we.client_name === schedule.client_name);
          });
          
          if (manualSearch.length > 0) {
            relatedWorkEntries = manualSearch;
            searchMethod = 'manual_fallback';
            console.warn(`[Auditoría] ⚠️ WorkEntry encontrada solo con búsqueda manual para ${cleanerName} en ${scheduleDate}:`, {
              schedule_id: schedule.id,
              we_schedule_id: manualSearch[0].schedule_id,
              we_client_id: manualSearch[0].client_id,
              schedule_client_id: schedule.client_id,
              we_client_name: manualSearch[0].client_name,
              schedule_client_name: schedule.client_name
            });
          }
        }

        // Calculate expected hours from cleaner_schedules or general schedule
        let expectedHours = 0;
        if (schedule.cleaner_schedules && schedule.cleaner_schedules.length > 0) {
          const cleanerSchedule = schedule.cleaner_schedules.find(cs => cs.cleaner_id === cleanerId);
          if (cleanerSchedule && cleanerSchedule.start_time && cleanerSchedule.end_time) {
            const start = new Date(cleanerSchedule.start_time);
            const end = new Date(cleanerSchedule.end_time);
            expectedHours = (end - start) / (1000 * 60 * 60);
          }
        }
        
        if (expectedHours === 0 && schedule.start_time && schedule.end_time) {
          const start = new Date(schedule.start_time);
          const end = new Date(schedule.end_time);
          expectedHours = (end - start) / (1000 * 60 * 60);
        }

        // Calculate actual hours from work entries
        const actualHours = relatedWorkEntries.reduce((sum, we) => sum + (we.hours || 0), 0);

        // Determine status
        let status = 'ok';
        let statusLabel = 'Correcto';
        
        if (relatedWorkEntries.length === 0) {
          status = 'missing';
          statusLabel = 'Falta WorkEntry';
        } else if (Math.abs(expectedHours - actualHours) > 0.25) {
          status = 'mismatch';
          statusLabel = 'Diferencia de horas';
        }

        results.push({
          schedule,
          cleanerId,
          cleanerName,
          expectedHours: Math.round(expectedHours * 4) / 4,
          actualHours: Math.round(actualHours * 4) / 4,
          workEntries: relatedWorkEntries,
          status,
          statusLabel,
          searchMethod,
          key: `${schedule.id}_${cleanerId}`
        });
      });
    });

    // Sort: missing first, then mismatch, then ok
    const statusOrder = { missing: 0, mismatch: 1, ok: 2 };
    results.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return new Date(b.schedule.start_time) - new Date(a.schedule.start_time);
    });

    return results;
  }, [schedules, workEntries, users, selectedPeriod, selectedCleaner]);

  // Filtered results
  const filteredResults = useMemo(() => {
    if (showOnlyDiscrepancies) {
      return auditResults.filter(r => r.status !== 'ok');
    }
    return auditResults;
  }, [auditResults, showOnlyDiscrepancies]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: auditResults.length,
      ok: auditResults.filter(r => r.status === 'ok').length,
      missing: auditResults.filter(r => r.status === 'missing').length,
      mismatch: auditResults.filter(r => r.status === 'mismatch').length
    };
  }, [auditResults]);

  // Create missing work entry
  const handleCreateWorkEntry = async (result) => {
    setCreatingEntry(true);
    setError("");
    setSuccess("");
    try {
      console.log('[CreateWorkEntry] 🚀 Creando entrada para:', result.cleanerName);
      const { data } = await processScheduleForWorkEntries({
        scheduleId: result.schedule.id,
        mode: 'create'
      });

      console.log('[CreateWorkEntry] Respuesta:', data);

      if (data.success) {
        let message = `✅ WorkEntry creada para ${result.cleanerName}`;
        
        if (data.created_entries > 0) {
          message = `✅ ${data.created_entries} WorkEntry(s) creadas`;
        }
        if (data.skipped_entries > 0) {
          message += ` (${data.skipped_entries} ya existían)`;
        }
        if (data.skipped_details && data.skipped_details.length > 0) {
          console.log('[CreateWorkEntry] ⚠️ Entradas omitidas:', data.skipped_details);
          message += '\n\n⚠️ Problemas:\n' + data.skipped_details.map(d => `${d.cleaner_name}: ${d.reason}`).join('\n');
        }
        
        setSuccess(message);
        await handleRefresh();
        setSelectedSchedule(null);
      } else {
        throw new Error(data.error || "Error al crear WorkEntry");
      }
    } catch (err) {
      console.error("[CreateWorkEntry] Error:", err);
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

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let errorDetails = [];

    // Get unique schedule IDs from selected items
    const uniqueScheduleIds = [...new Set(selectedItems.map(key => key.split('_')[0]))];

    console.log('[BatchCreate] 🚀 Procesando', uniqueScheduleIds.length, 'servicios...');

    for (const scheduleId of uniqueScheduleIds) {
      try {
        console.log('[BatchCreate] 📝 Procesando schedule:', scheduleId);
        const { data } = await processScheduleForWorkEntries({
          scheduleId,
          mode: 'create'
        });
        
        console.log('[BatchCreate] Respuesta:', data);
        
        if (data.success) {
          const created = data.created_entries || 0;
          const skipped = data.skipped_entries || 0;
          
          successCount += created;
          skippedCount += skipped;
          
          if (data.skipped_details && data.skipped_details.length > 0) {
            data.skipped_details.forEach(detail => {
              errorDetails.push(`${detail.cleaner_name}: ${detail.reason}`);
            });
          }
        } else {
          errorCount++;
          errorDetails.push(data.error || 'Error desconocido');
        }
      } catch (err) {
        console.error("[BatchCreate] Error:", err);
        errorCount++;
        errorDetails.push(err.message || 'Error desconocido');
      }
    }

    let message = '';
    if (successCount > 0) {
      message += `✅ ${successCount} WorkEntries creadas exitosamente. `;
    }
    if (skippedCount > 0) {
      message += `⚠️ ${skippedCount} ya existían. `;
    }
    if (errorCount > 0) {
      message += `❌ ${errorCount} errores. `;
    }
    
    if (errorDetails.length > 0) {
      console.log('[BatchCreate] ⚠️ Detalles de problemas:', errorDetails);
      message += '\n\nDetalles:\n' + errorDetails.slice(0, 5).join('\n');
    }

    if (successCount > 0) {
      setSuccess(message);
    } else if (skippedCount > 0 && errorCount === 0) {
      setSuccess(message);
    } else {
      setError(message || 'No se pudo crear ninguna entrada');
    }

    setSelectedItems([]);
    await handleRefresh();
    setBatchProcessing(false);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const missingKeys = filteredResults
        .filter(r => r.status === 'missing')
        .map(r => r.key);
      setSelectedItems(missingKeys);
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

  const getStatusBadge = (status, statusLabel) => {
    switch (status) {
      case 'ok':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />{statusLabel}</Badge>;
      case 'missing':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />{statusLabel}</Badge>;
      case 'mismatch':
        return <Badge className="bg-amber-100 text-amber-800"><AlertTriangle className="w-3 h-3 mr-1" />{statusLabel}</Badge>;
      default:
        return <Badge variant="secondary">{statusLabel}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
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
              Compara servicios completados con entradas de trabajo registradas
            </p>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 whitespace-pre-wrap">{success}</AlertDescription>
          </Alert>
        )}

        {/* Filters */}
        <Card className="shadow-lg border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-blue-600" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Período</label>
                <PeriodSelector onPeriodChange={setSelectedPeriod} />
              </div>
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
                    checked={showOnlyDiscrepancies} 
                    onCheckedChange={setShowOnlyDiscrepancies}
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Mostrar solo discrepancias
                  </span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        {selectedPeriod && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-slate-50 border-slate-200">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
                <p className="text-sm text-slate-600">Total Servicios</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-green-700">{stats.ok}</p>
                <p className="text-sm text-green-600">Correctos</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-red-700">{stats.missing}</p>
                <p className="text-sm text-red-600">Falta WorkEntry</p>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-amber-700">{stats.mismatch}</p>
                <p className="text-sm text-amber-600">Diferencia Horas</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Results Table */}
        <Card className="shadow-lg border-0">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Resultados de Auditoría ({filteredResults.length})
            </CardTitle>
            {selectedItems.length > 0 && (
              <Button 
                onClick={handleBatchCreate} 
                disabled={batchProcessing}
                className="bg-green-600 hover:bg-green-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                {batchProcessing ? "Procesando..." : `Crear ${selectedItems.length} WorkEntries`}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!selectedPeriod ? (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 text-lg">Selecciona un período para comenzar la auditoría</p>
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <p className="text-slate-600 text-lg">
                  {showOnlyDiscrepancies 
                    ? "¡Excelente! No hay discrepancias en este período" 
                    : "No hay servicios completados en este período"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox 
                          checked={selectedItems.length > 0 && selectedItems.length === filteredResults.filter(r => r.status === 'missing').length}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Limpiador</TableHead>
                      <TableHead className="text-center">Horas Esperadas</TableHead>
                      <TableHead className="text-center">Horas Registradas</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((result) => (
                      <TableRow key={result.key} className={result.status === 'missing' ? 'bg-red-50/50' : result.status === 'mismatch' ? 'bg-amber-50/50' : ''}>
                        <TableCell>
                          {result.status === 'missing' && (
                            <Checkbox 
                              checked={selectedItems.includes(result.key)}
                              onCheckedChange={(checked) => handleSelectItem(result.key, checked)}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {format(new Date(result.schedule.start_time), "d MMM yyyy", { locale: es })}
                        </TableCell>
                        <TableCell>{result.schedule.client_name || 'Sin cliente'}</TableCell>
                        <TableCell>{result.cleanerName}</TableCell>
                        <TableCell className="text-center font-semibold">{result.expectedHours}h</TableCell>
                        <TableCell className="text-center font-semibold">
                          {result.status === 'missing' ? (
                            <span className="text-red-600">—</span>
                          ) : (
                            <span className={result.status === 'mismatch' ? 'text-amber-600' : ''}>
                              {result.actualHours}h
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(result.status, result.statusLabel)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedSchedule(result)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {result.status === 'missing' && (
                              <Button 
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => handleCreateWorkEntry(result)}
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
        <Dialog open={!!selectedSchedule} onOpenChange={() => setSelectedSchedule(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalles del Servicio</DialogTitle>
            </DialogHeader>
            {selectedSchedule && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600">Cliente</p>
                    <p className="font-semibold">{selectedSchedule.schedule.client_name || 'Sin cliente'}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600">Fecha</p>
                    <p className="font-semibold">
                      {format(new Date(selectedSchedule.schedule.start_time), "d MMMM yyyy", { locale: es })}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600">Limpiador</p>
                    <p className="font-semibold">{selectedSchedule.cleanerName}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600">Estado</p>
                    {getStatusBadge(selectedSchedule.status, selectedSchedule.statusLabel)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-700">Horas Esperadas (Schedule)</p>
                    <p className="text-2xl font-bold text-blue-900">{selectedSchedule.expectedHours}h</p>
                  </div>
                  <div className={`p-4 rounded-lg border ${selectedSchedule.status === 'ok' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className={`text-sm ${selectedSchedule.status === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
                      Horas Registradas (WorkEntry)
                    </p>
                    <p className={`text-2xl font-bold ${selectedSchedule.status === 'ok' ? 'text-green-900' : 'text-red-900'}`}>
                      {selectedSchedule.status === 'missing' ? '—' : `${selectedSchedule.actualHours}h`}
                    </p>
                  </div>
                </div>

                {selectedSchedule.workEntries.length > 0 && (
                  <div>
                    <p className="font-semibold mb-2">WorkEntries Asociadas:</p>
                    <div className="space-y-2">
                      {selectedSchedule.workEntries.map(we => (
                        <div key={we.id} className="p-3 bg-slate-50 rounded-lg text-sm">
                          <div className="flex justify-between">
                            <span>{we.activity} - {we.client_name}</span>
                            <span className="font-semibold">{we.hours}h @ ${we.hourly_rate}/h = ${we.total_amount}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedSchedule.schedule.notes_public && (
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm text-yellow-700 font-semibold">Notas del Servicio:</p>
                    <p className="text-yellow-800 text-sm mt-1">{selectedSchedule.schedule.notes_public}</p>
                  </div>
                )}

                {/* Debugging info para admin */}
                <div className="p-4 bg-slate-100 rounded-lg border border-slate-300 text-xs">
                  <p className="font-semibold mb-1">Información de Debugging:</p>
                  <p>Schedule ID: {selectedSchedule.schedule.id}</p>
                  <p>Método de búsqueda: {selectedSchedule.searchMethod}</p>
                  <p>WorkEntries encontradas: {selectedSchedule.workEntries.length}</p>
                  {selectedSchedule.workEntries.length > 0 && (
                    <div className="mt-2">
                      <p className="font-semibold">Datos de WorkEntry:</p>
                      {selectedSchedule.workEntries.map(we => (
                        <div key={we.id} className="ml-2 mt-1">
                          <p>• ID: {we.id}</p>
                          <p>• schedule_id: {we.schedule_id || 'NO TIENE'}</p>
                          <p>• client_id: {we.client_id}</p>
                          <p>• cleaner_id: {we.cleaner_id}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedSchedule(null)}>
                Cerrar
              </Button>
              {selectedSchedule?.status === 'missing' && (
                <Button 
                  onClick={() => handleCreateWorkEntry(selectedSchedule)}
                  disabled={creatingEntry}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {creatingEntry ? "Creando..." : "Crear WorkEntry"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}