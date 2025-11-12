
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle, 
  Copy, 
  Brain, 
  Trash2,
  Loader2,
  Plus,
  Search,
  XCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';

export default function WorkEntryAuditModal({ isOpen, onClose, auditData, onRefresh }) {
  const [activeTab, setActiveTab] = useState('duplicates');
  const [analyzing, setAnalyzing] = useState({}); // To track AI analysis state for multiple entries
  const [deleting, setDeleting] = useState({});   // To track delete state for multiple entries
  const [creating, setCreating] = useState({});   // To track creation state for missing entries
  const [aiAnalysis, setAiAnalysis] = useState({}); // To store AI analysis results
  const [notification, setNotification] = useState({ type: '', message: '' });
  
  // Nuevo estado para auditoría de faltantes
  const [missingEntriesData, setMissingEntriesData] = useState(null);
  const [loadingMissing, setLoadingMissing] = useState(false);

  if (!auditData) return null;

  const handleAnalyzeWithAI = async (entries) => {
    // Use the ID of the first entry in the group for state tracking
    const firstEntryId = entries[0].id; 
    setAnalyzing(prev => ({ ...prev, [firstEntryId]: true }));
    setNotification({ type: '', message: '' }); // Clear previous notification

    try {
      const response = await base44.functions.invoke('analyzeWorkEntryWithAI', {
        entries: entries
      });

      if (response.data?.analysis) {
        setAiAnalysis(prev => ({ ...prev, [firstEntryId]: response.data.analysis }));
        setNotification({ 
          type: 'success', 
          message: 'Análisis completado. Revisa las recomendaciones.' 
        });
      } else {
        setNotification({ 
          type: 'error', 
          message: response.data?.error || 'Error al analizar con IA' 
        });
      }
    } catch (error) {
      console.error('Error analyzing with AI:', error);
      setNotification({ 
        type: 'error', 
        message: 'Error al analizar con IA: ' + error.message 
      });
    } finally {
      setAnalyzing(prev => ({ ...prev, [firstEntryId]: false }));
    }
  };

  const handleDeleteEntry = async (entryId) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta entrada? Esta acción no se puede deshacer.')) {
      return;
    }

    setDeleting(prev => ({ ...prev, [entryId]: true }));
    setNotification({ type: '', message: '' }); // Clear previous notification

    try {
      const response = await base44.functions.invoke('deleteWorkEntry', {
        workEntryId: entryId
      });

      if (response.data?.success) {
        setNotification({ 
          type: 'success', 
          message: 'Entrada eliminada exitosamente' 
        });
        // Optimistically remove the deleted entry from auditData or trigger a refresh
        if (onRefresh) onRefresh(); 
      } else {
        setNotification({ 
          type: 'error', 
          message: response.data?.error || 'Error al eliminar entrada' 
        });
      }
    } catch (error) {
      console.error('Error deleting entry:', error);
      setNotification({ 
        type: 'error', 
        message: 'Error al eliminar: ' + error.message 
      });
    } finally {
      setDeleting(prev => ({ ...prev, [entryId]: false }));
    }
  };

  // NUEVA FUNCIÓN: Buscar WorkEntries faltantes
  const handleSearchMissingEntries = async () => {
    setLoadingMissing(true);
    setNotification({ type: '', message: '' }); // Clear previous notification

    try {
      // Usar los mismos filtros de período que la auditoría principal
      const response = await base44.functions.invoke('auditMissingWorkEntries', {
        period_start: auditData.period_start,
        period_end: auditData.period_end,
        cleaner_id: null // Buscar para todos los limpiadores
      });

      if (response.data?.success) {
        setMissingEntriesData(response.data);
        setActiveTab('missing'); // Cambiar automáticamente a la pestaña de faltantes
        setNotification({ 
          type: response.data.total_missing > 0 ? 'warning' : 'success',
          message: response.data.message
        });
      } else {
        setNotification({ 
          type: 'error', 
          message: response.data?.error || 'Error al buscar entradas faltantes' 
        });
      }
    } catch (error) {
      console.error('Error searching missing entries:', error);
      setNotification({ 
        type: 'error', 
        message: 'Error al buscar entradas faltantes: ' + error.message 
      });
    } finally {
      setLoadingMissing(false);
    }
  };

  // NUEVA FUNCIÓN: Crear WorkEntry faltante
  const handleCreateMissingEntry = async (missingEntry) => {
    const key = `${missingEntry.schedule_id}_${missingEntry.cleaner_id}`;
    setCreating(prev => ({ ...prev, [key]: true }));
    setNotification({ type: '', message: '' }); // Clear previous notification

    try {
      // Crear la WorkEntry usando los datos esperados de la auditoría
      const newEntry = await base44.entities.WorkEntry.create({
        cleaner_id: missingEntry.cleaner_id,
        cleaner_name: missingEntry.cleaner_name,
        client_id: missingEntry.client_id,
        client_name: missingEntry.client_name,
        work_date: missingEntry.work_date,
        hours: missingEntry.expected_hours,
        activity: missingEntry.activity_type,
        hourly_rate: missingEntry.expected_rate,
        total_amount: missingEntry.expected_total,
        period: missingEntry.period,
        invoiced: false,
        schedule_id: missingEntry.schedule_id,
      });

      if (newEntry) {
        setNotification({ 
          type: 'success', 
          message: `✅ WorkEntry creada para ${missingEntry.cleaner_name} (${missingEntry.client_name} - ${format(new Date(missingEntry.work_date), 'd MMM', { locale: es })})` 
        });
        
        // Actualizar los datos de faltantes removiendo el que acabamos de crear
        setMissingEntriesData(prev => ({
          ...prev,
          missing_entries: prev.missing_entries.filter(
            me => !(me.schedule_id === missingEntry.schedule_id && me.cleaner_id === missingEntry.cleaner_id)
          ),
          total_missing: prev.total_missing - 1
        }));

        if (onRefresh) onRefresh();
      }
    } catch (error) {
      console.error('Error creating missing entry:', error);
      setNotification({ 
        type: 'error', 
        message: 'Error al crear entrada: ' + error.message 
      });
    } finally {
      setCreating(prev => ({ ...prev, [key]: false }));
    }
  };

  // NUEVA FUNCIÓN: Crear todas las WorkEntries faltantes de un servicio
  const handleCreateAllForSchedule = async (scheduleId) => {
    setCreating(prev => ({ ...prev, [`schedule_${scheduleId}`]: true }));
    setNotification({ type: '', message: '' }); // Clear previous notification

    try {
      const entriesToCreate = missingEntriesData.missing_entries.filter(
        me => me.schedule_id === scheduleId
      );

      if (entriesToCreate.length === 0) {
        setNotification({ type: 'warning', message: 'No hay entradas para crear en este servicio' });
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const missingEntry of entriesToCreate) {
        try {
          await base44.entities.WorkEntry.create({
            cleaner_id: missingEntry.cleaner_id,
            cleaner_name: missingEntry.cleaner_name,
            client_id: missingEntry.client_id,
            client_name: missingEntry.client_name,
            work_date: missingEntry.work_date,
            hours: missingEntry.expected_hours,
            activity: missingEntry.activity_type,
            hourly_rate: missingEntry.expected_rate,
            total_amount: missingEntry.expected_total,
            period: missingEntry.period,
            invoiced: false,
            schedule_id: missingEntry.schedule_id,
          });
          successCount++;
        } catch (error) {
          console.error('Error creando entrada individual:', error);
          errorCount++;
        }
      }

      setNotification({ 
        type: errorCount === 0 ? 'success' : 'warning',
        message: `✅ ${successCount} entradas creadas${errorCount > 0 ? `, ${errorCount} errores` : ''}`
      });

      // Actualizar datos
      setMissingEntriesData(prev => ({
        ...prev,
        missing_entries: prev.missing_entries.filter(me => me.schedule_id !== scheduleId),
        total_missing: prev.total_missing - successCount
      }));

      if (onRefresh) onRefresh();

    } catch (error) {
      console.error('Error creating missing entries:', error);
      setNotification({ 
        type: 'error', 
        message: 'Error al crear entradas: ' + error.message 
      });
    } finally {
      setCreating(prev => ({ ...prev, [`schedule_${scheduleId}`]: false }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Search className="w-6 h-6 text-purple-600" />
            Auditoría de Entradas de Trabajo
          </DialogTitle>
          <DialogDescription>
            Análisis detallado de irregularidades, duplicados, modificaciones y entradas faltantes
          </DialogDescription>
        </DialogHeader>

        {notification.message && (
          <Alert className={`${
            notification.type === 'success' ? 'bg-green-50 border-green-200' : 
            notification.type === 'warning' ? 'bg-amber-50 border-amber-200' :
            'bg-red-50 border-red-200'
          }`}>
            {notification.type === 'success' ? <CheckCircle className="h-4 w-4 text-green-600" /> : 
             notification.type === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-600" /> :
             <AlertCircle className="h-4 w-4 text-red-600" />}
            <AlertDescription className={
              notification.type === 'success' ? 'text-green-800' : 
              notification.type === 'warning' ? 'text-amber-800' :
              'text-red-800'
            }>
              {notification.message}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="duplicates" className="flex items-center gap-2">
                <Copy className="w-4 h-4" />
                Duplicados
                {auditData.duplicates?.length > 0 && (
                  <Badge variant="destructive" className="ml-1">{auditData.duplicates.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="modified" className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Modificados
                {auditData.modified?.length > 0 && (
                  <Badge className="bg-amber-500 ml-1">{auditData.modified.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="irregularities" className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Irregularidades
                {auditData.irregularities?.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{auditData.irregularities.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="missing" className="flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                Faltantes
                {missingEntriesData?.total_missing > 0 && (
                  <Badge className="bg-red-600 ml-1">{missingEntriesData.total_missing}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Tab: Duplicados */}
            <TabsContent value="duplicates" className="space-y-4">
              {auditData.duplicates && auditData.duplicates.length > 0 ? (
                auditData.duplicates.map((group, index) => (
                  <Card key={index} className="border-red-200">
                    <CardHeader className="bg-red-50">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Copy className="w-5 h-5 text-red-600" />
                        Entrada Duplicada - {group.cleaner_name}
                      </CardTitle>
                      <p className="text-sm text-slate-600 mt-1">
                        Cliente: {group.client_name} | Fecha: {format(new Date(group.work_date), 'd MMM yyyy', { locale: es })}
                      </p>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Horas</TableHead>
                            <TableHead>Tarifa</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Creada</TableHead>
                            <TableHead>Acción</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.entries.map(entry => (
                            <TableRow key={entry.id}>
                              <TableCell className="font-mono text-xs">{entry.id.slice(0, 8)}...</TableCell>
                              <TableCell>{entry.hours}h</TableCell>
                              <TableCell>${entry.hourly_rate}</TableCell>
                              <TableCell className="font-semibold">${entry.total_amount}</TableCell>
                              <TableCell className="text-sm text-slate-600">
                                {format(new Date(entry.created_date), 'd MMM HH:mm', { locale: es })}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteEntry(entry.id)}
                                  disabled={deleting[entry.id]}
                                >
                                  {deleting[entry.id] ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      <div className="mt-4 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAnalyzeWithAI(group.entries)}
                          disabled={analyzing[group.entries[0].id]}
                        >
                          {analyzing[group.entries[0].id] ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Analizando...
                            </>
                          ) : (
                            <>
                              <Brain className="w-4 h-4 mr-2" />
                              Analizar con IA
                            </>
                          )}
                        </Button>
                      </div>

                      {aiAnalysis[group.entries[0].id] && (
                        <Alert className="mt-4 bg-blue-50 border-blue-200">
                          <Brain className="h-4 w-4 text-blue-600" />
                          <AlertDescription className="text-blue-800 whitespace-pre-wrap">
                            {aiAnalysis[group.entries[0].id]}
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <p className="font-medium">No se encontraron entradas duplicadas</p>
                </div>
              )}
            </TabsContent>

            {/* Tab: Modificados */}
            <TabsContent value="modified" className="space-y-4">
              {auditData.modified && auditData.modified.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Limpiador</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Modificado</TableHead>
                      <TableHead>Cambios</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditData.modified.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.cleaner_name}</TableCell>
                        <TableCell>{entry.client_name}</TableCell>
                        <TableCell>{format(new Date(entry.work_date), 'd MMM yyyy', { locale: es })}</TableCell>
                        <TableCell className="text-sm text-amber-600">
                          {format(new Date(entry.last_modified_at), 'd MMM HH:mm', { locale: es })}
                        </TableCell>
                        <TableCell>
                          {entry.original_values && (
                            <div className="text-xs space-y-1">
                              {entry.original_values.hours !== entry.hours && (
                                <div>Horas: {entry.original_values.hours}h → {entry.hours}h</div>
                              )}
                              {entry.original_values.hourly_rate !== entry.hourly_rate && (
                                <div>Tarifa: ${entry.original_values.hourly_rate} → ${entry.hourly_rate}</div>
                              )}
                              {entry.original_values.activity !== entry.activity && (
                                <div>Actividad: {entry.original_values.activity} → {entry.activity}</div>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <p className="font-medium">No se encontraron entradas modificadas</p>
                </div>
              )}
            </TabsContent>

            {/* Tab: Irregularidades */}
            <TabsContent value="irregularities" className="space-y-4">
              {auditData.irregularities && auditData.irregularities.length > 0 ? (
                auditData.irregularities.map((irregularity, index) => (
                  <Card key={index} className="border-orange-200">
                    <CardHeader className="bg-orange-50">
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-orange-600" />
                        {irregularity.issue}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="space-y-2 text-sm">
                        <p><strong>Limpiador:</strong> {irregularity.cleaner_name}</p>
                        <p><strong>Cliente:</strong> {irregularity.client_name}</p>
                        <p><strong>Fecha:</strong> {format(new Date(irregularity.work_date), 'd MMM yyyy', { locale: es })}</p>
                        <p><strong>Detalles:</strong> {irregularity.details}</p>
                        {irregularity.suggestion && (
                          <Alert className="mt-3">
                            <AlertDescription>{irregularity.suggestion}</AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <p className="font-medium">No se detectaron irregularidades</p>
                </div>
              )}
            </TabsContent>

            {/* NUEVA TAB: Faltantes */}
            <TabsContent value="missing" className="space-y-4">
              {!missingEntriesData ? (
                <div className="text-center py-12 space-y-4">
                  <XCircle className="w-16 h-16 mx-auto text-slate-300" />
                  <div>
                    <p className="text-lg font-medium text-slate-700 mb-2">
                      Buscar WorkEntries Faltantes
                    </p>
                    <p className="text-sm text-slate-500 mb-4">
                      Compara los servicios completados con las entradas de trabajo para encontrar las que no fueron creadas
                    </p>
                    <Button
                      onClick={handleSearchMissingEntries}
                      disabled={loadingMissing}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      {loadingMissing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Buscando...
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4 mr-2" />
                          Buscar Faltantes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : missingEntriesData.missing_entries.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <p className="font-medium text-lg">¡Excelente! No hay entradas faltantes</p>
                  <p className="text-sm text-slate-600 mt-2">
                    Todos los servicios completados tienen sus WorkEntries correspondientes
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Alert className="bg-red-50 border-red-200">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      Se encontraron <strong>{missingEntriesData.total_missing}</strong> entradas de trabajo faltantes
                      en {missingEntriesData.schedules_analyzed} servicios completados analizados.
                    </AlertDescription>
                  </Alert>

                  {/* Agrupar por Schedule */}
                  {Object.entries(
                    missingEntriesData.missing_entries.reduce((groups, entry) => {
                      if (!groups[entry.schedule_id]) {
                        groups[entry.schedule_id] = {
                          schedule_id: entry.schedule_id,
                          client_name: entry.client_name,
                          work_date: entry.work_date,
                          schedule_start_time: entry.schedule_start_time,
                          entries: []
                        };
                      }
                      groups[entry.schedule_id].entries.push(entry);
                      return groups;
                    }, {})
                  ).map(([scheduleId, group]) => {
                    const isCreatingAll = creating[`schedule_${scheduleId}`];
                    
                    return (
                      <Card key={scheduleId} className="border-red-200">
                        <CardHeader className="bg-red-50">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-base flex items-center gap-2">
                                <XCircle className="w-5 h-5 text-red-600" />
                                {group.client_name}
                              </CardTitle>
                              <p className="text-sm text-slate-600 mt-1">
                                Fecha: {format(new Date(group.work_date), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                Faltan {group.entries.length} entrada{group.entries.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleCreateAllForSchedule(scheduleId)}
                              disabled={isCreatingAll}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {isCreatingAll ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Creando...
                                </>
                              ) : (
                                <>
                                  <Plus className="w-4 h-4 mr-2" />
                                  Crear Todas ({group.entries.length})
                                </>
                              )}
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Limpiador</TableHead>
                                <TableHead>Horas Esperadas</TableHead>
                                <TableHead>Tarifa</TableHead>
                                <TableHead>Total Esperado</TableHead>
                                <TableHead>Clock In/Out</TableHead>
                                <TableHead>Acción</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.entries.map(entry => {
                                const key = `${entry.schedule_id}_${entry.cleaner_id}`;
                                const isCreating = creating[key];
                                
                                return (
                                  <TableRow key={key}>
                                    <TableCell>
                                      <div>
                                        <p className="font-medium">{entry.cleaner_name}</p>
                                        <p className="text-xs text-slate-500">{entry.cleaner_email}</p>
                                      </div>
                                    </TableCell>
                                    <TableCell>{entry.expected_hours}h</TableCell>
                                    <TableCell>${entry.expected_rate.toFixed(2)}/h</TableCell>
                                    <TableCell className="font-semibold text-green-600">
                                      ${entry.expected_total.toFixed(2)}
                                    </TableCell>
                                    <TableCell>
                                      <div className="text-xs space-y-1">
                                        <div className="text-green-600">
                                          ✓ In: {format(new Date(entry.clock_in_time), 'HH:mm', { locale: es })}
                                        </div>
                                        <div className="text-red-600">
                                          ✓ Out: {format(new Date(entry.clock_out_time), 'HH:mm', { locale: es })}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        size="sm"
                                        onClick={() => handleCreateMissingEntry(entry)}
                                        disabled={isCreating}
                                        className="bg-blue-600 hover:bg-blue-700"
                                      >
                                        {isCreating ? (
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <>
                                            <Plus className="w-4 h-4 mr-1" />
                                            Crear
                                          </>
                                        )}
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="border-t pt-4 flex justify-end">
          <Button onClick={onClose} variant="outline">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
