import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle, Copy, Edit, Trash2, Sparkles, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';

export default function WorkEntryAuditModal({ isOpen, onClose, auditData, onRefresh }) {
    const [analyzing, setAnalyzing] = useState(null);
    const [aiAnalysis, setAiAnalysis] = useState({});
    const [deleting, setDeleting] = useState(null);
    const [selectedMissing, setSelectedMissing] = useState(new Set());
    const [creating, setCreating] = useState(false);

    if (!auditData) return null;

    const handleToggleMissingEntry = (index) => {
        const newSelected = new Set(selectedMissing);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
        }
        setSelectedMissing(newSelected);
    };

    const handleSelectAllMissing = () => {
        if (selectedMissing.size === auditData.missing_entries.length) {
            setSelectedMissing(new Set());
        } else {
            setSelectedMissing(new Set(auditData.missing_entries.map((_, idx) => idx)));
        }
    };

    const handleCreateMissingEntries = async () => {
        if (selectedMissing.size === 0) {
            alert('Por favor selecciona al menos una entrada para crear');
            return;
        }

        if (!confirm(`¿Estás seguro de crear ${selectedMissing.size} entradas de trabajo?`)) {
            return;
        }

        setCreating(true);
        try {
            const entriesToCreate = Array.from(selectedMissing).map(idx => auditData.missing_entries[idx]);
            
            const { data } = await base44.functions.invoke('createMissingWorkEntries', {
                entries_to_create: entriesToCreate
            });
            
            if (data.success) {
                alert(`✅ ${data.created_count} entradas creadas exitosamente${data.failed_count > 0 ? `. ${data.failed_count} fallaron.` : ''}`);
                setSelectedMissing(new Set());
                onRefresh();
            }
        } catch (error) {
            console.error('Error creating entries:', error);
            alert('Error al crear entradas: ' + error.message);
        } finally {
            setCreating(false);
        }
    };

    const handleAnalyzeWithAI = async (entryId) => {
        setAnalyzing(entryId);
        try {
            const { data } = await base44.functions.invoke('analyzeWorkEntryWithAI', {
                work_entry_id: entryId
            });
            
            if (data.success) {
                setAiAnalysis(prev => ({ ...prev, [entryId]: data.analysis }));
            }
        } catch (error) {
            console.error('Error analyzing with AI:', error);
            alert('Error al analizar con IA: ' + error.message);
        } finally {
            setAnalyzing(null);
        }
    };

    const handleDeleteEntry = async (entryId, reason) => {
        if (!confirm('¿Estás seguro de que deseas eliminar esta entrada? Esta acción no se puede deshacer.')) {
            return;
        }

        setDeleting(entryId);
        try {
            const { data } = await base44.functions.invoke('deleteWorkEntry', {
                work_entry_id: entryId,
                reason: reason || 'Duplicado detectado en auditoría'
            });
            
            if (data.success) {
                alert('Entrada eliminada exitosamente');
                onRefresh(); // Recargar datos
                // Si quieres cerrar el modal después de eliminar:
                // onClose();
            }
        } catch (error) {
            console.error('Error deleting entry:', error);
            alert('Error al eliminar entrada: ' + error.message);
        } finally {
            setDeleting(null);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                        Auditoría de Entradas de Trabajo
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Resumen */}
                    <div className="grid grid-cols-5 gap-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-gray-600">Total Entradas</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-bold">{auditData.summary.total_entries}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-red-600">Duplicados</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-bold text-red-600">{auditData.summary.duplicates_found}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-orange-600">Modificadas</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-bold text-orange-600">{auditData.summary.modified_entries}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-yellow-600">Irregularidades</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-bold text-yellow-600">{auditData.summary.irregularities_found}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-purple-600">Faltantes</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-bold text-purple-600">{auditData.summary.missing_entries || 0}</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Tabs con detalles */}
                    <Tabs defaultValue="missing" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="missing">
                                Faltantes ({auditData.missing_entries?.length || 0})
                            </TabsTrigger>
                            <TabsTrigger value="duplicates">
                                Duplicados ({auditData.duplicates.length})
                            </TabsTrigger>
                            <TabsTrigger value="modified">
                                Modificadas ({auditData.modified_entries.length})
                            </TabsTrigger>
                            <TabsTrigger value="irregularities">
                                Irregularidades ({auditData.irregularities.length})
                            </TabsTrigger>
                        </TabsList>

                        {/* TAB: FALTANTES */}
                        <TabsContent value="missing" className="space-y-4">
                            {!auditData.missing_entries || auditData.missing_entries.length === 0 ? (
                                <Alert>
                                    <AlertDescription>
                                        ✅ No se encontraron entradas faltantes. Todos los servicios completados tienen sus work entries.
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                <>
                                    <div className="flex justify-between items-center bg-purple-50 p-4 rounded border border-purple-200">
                                        <div>
                                            <p className="font-semibold text-purple-900">
                                                {selectedMissing.size} de {auditData.missing_entries.length} seleccionadas
                                            </p>
                                            <p className="text-sm text-purple-700">
                                                Estas entradas se crearán automáticamente sin datos de clock in/out
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleSelectAllMissing}
                                            >
                                                {selectedMissing.size === auditData.missing_entries.length ? 'Deseleccionar' : 'Seleccionar'} Todas
                                            </Button>
                                            <Button
                                                variant="default"
                                                size="sm"
                                                onClick={handleCreateMissingEntries}
                                                disabled={creating || selectedMissing.size === 0}
                                                className="bg-purple-600 hover:bg-purple-700"
                                            >
                                                {creating ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                        Creando...
                                                    </>
                                                ) : (
                                                    `Crear ${selectedMissing.size} Entradas`
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                    
                                    {auditData.missing_entries.map((entry, idx) => (
                                        <Card 
                                            key={idx} 
                                            className={`border-purple-200 cursor-pointer transition-all ${
                                                selectedMissing.has(idx) ? 'bg-purple-50 border-purple-400' : ''
                                            }`}
                                            onClick={() => handleToggleMissingEntry(idx)}
                                        >
                                            <CardContent className="p-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedMissing.has(idx)}
                                                                onChange={() => handleToggleMissingEntry(idx)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="w-4 h-4"
                                                            />
                                                            <p className="font-semibold text-purple-900">{entry.cleaner_name}</p>
                                                        </div>
                                                        <p className="text-sm text-gray-700">
                                                            <span className="font-medium">Cliente:</span> {entry.client_name}
                                                        </p>
                                                        <p className="text-sm text-gray-700">
                                                            <span className="font-medium">Fecha:</span> {format(new Date(entry.work_date), 'dd MMM yyyy', { locale: es })}
                                                        </p>
                                                        <div className="flex gap-4 mt-2">
                                                            <p className="text-sm">
                                                                <span className="font-medium">Horas:</span> {entry.expected_hours}h
                                                            </p>
                                                            <p className="text-sm">
                                                                <span className="font-medium">Tarifa:</span> ${entry.hourly_rate}/h
                                                            </p>
                                                            <p className="text-sm">
                                                                <span className="font-medium">Total:</span> ${(entry.expected_hours * entry.hourly_rate).toFixed(2)}
                                                            </p>
                                                            <Badge variant="secondary">{entry.activity}</Badge>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </>
                            )}
                        </TabsContent>

                        {/* TAB: DUPLICADOS */}
                        <TabsContent value="duplicates" className="space-y-4">
                            {auditData.duplicates.length === 0 ? (
                                <Alert>
                                    <AlertDescription>
                                        ✅ No se encontraron entradas duplicadas en el período analizado.
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                auditData.duplicates.map((group, idx) => (
                                    <Card key={idx} className="border-red-200">
                                        <CardHeader>
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <Copy className="w-4 h-4 text-red-600" />
                                                Grupo de {group.count} duplicados
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2">
                                                {group.entries.map((entry) => (
                                                    <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                                                        <div className="flex-1">
                                                            <p className="font-semibold">{entry.cleaner_name}</p>
                                                            <p className="text-sm text-gray-600">
                                                                {entry.client_name} • {format(new Date(entry.work_date), 'dd MMM yyyy', { locale: es })}
                                                            </p>
                                                            <p className="text-sm">
                                                                {entry.hours}h • ${entry.total_amount} • {entry.activity}
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                Creada: {format(new Date(entry.created_date), 'dd MMM yyyy HH:mm', { locale: es })}
                                                            </p>
                                                            {entry.invoiced && (
                                                                <Badge variant="secondary" className="mt-1">Facturada</Badge>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleAnalyzeWithAI(entry.id)}
                                                                disabled={analyzing === entry.id || entry.invoiced}
                                                            >
                                                                {analyzing === entry.id ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <Sparkles className="w-4 h-4" />
                                                                )}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                onClick={() => handleDeleteEntry(entry.id, 'Duplicado')}
                                                                disabled={deleting === entry.id || entry.invoiced}
                                                                title={entry.invoiced ? 'No se puede eliminar una entrada facturada' : 'Eliminar entrada duplicada'}
                                                            >
                                                                {deleting === entry.id ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <Trash2 className="w-4 h-4" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            {group.entries.some(e => aiAnalysis[e.id]) && (
                                                <div className="mt-4 p-4 bg-blue-50 rounded border border-blue-200">
                                                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                                                        <Sparkles className="w-4 h-4 text-blue-600" />
                                                        Análisis con IA
                                                    </h4>
                                                    {group.entries.map(e => aiAnalysis[e.id] && (
                                                        <div key={e.id} className="mb-2">
                                                            <p className="text-xs text-gray-600 mb-1">Entrada {e.id}:</p>
                                                            <p className="text-sm whitespace-pre-wrap">{aiAnalysis[e.id]}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </TabsContent>

                        {/* TAB: MODIFICADAS */}
                        <TabsContent value="modified" className="space-y-4">
                            {auditData.modified_entries.length === 0 ? (
                                <Alert>
                                    <AlertDescription>
                                        ✅ No se encontraron entradas modificadas por limpiadores en el período analizado.
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                auditData.modified_entries.map((entry) => (
                                    <Card key={entry.id} className="border-orange-200">
                                        <CardHeader>
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <Edit className="w-4 h-4 text-orange-600" />
                                                {entry.cleaner_name} - {entry.client_name}
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2">
                                                <p className="text-sm">
                                                    <span className="font-semibold">Fecha:</span> {format(new Date(entry.work_date), 'dd MMM yyyy', { locale: es })}
                                                </p>
                                                <p className="text-sm">
                                                    <span className="font-semibold">Modificada:</span> {format(new Date(entry.last_modified_at), 'dd MMM yyyy HH:mm', { locale: es })}
                                                </p>
                                                {entry.invoiced && (
                                                    <Badge variant="secondary">Facturada</Badge>
                                                )}
                                                
                                                {/* Comparación de valores */}
                                                <div className="mt-4 grid grid-cols-2 gap-4">
                                                    <div className="p-3 bg-red-50 rounded border border-red-200">
                                                        <h5 className="font-semibold text-sm mb-2">Valores Originales</h5>
                                                        <p className="text-sm">Horas: {entry.original_values.hours || 'N/A'}</p>
                                                        <p className="text-sm">Tarifa: ${entry.original_values.hourly_rate || 'N/A'}</p>
                                                        <p className="text-sm">Total: ${entry.original_values.total_amount || 'N/A'}</p>
                                                        <p className="text-sm">Actividad: {entry.original_values.activity || 'N/A'}</p>
                                                    </div>
                                                    <div className="p-3 bg-green-50 rounded border border-green-200">
                                                        <h5 className="font-semibold text-sm mb-2">Valores Actuales</h5>
                                                        <p className="text-sm">Horas: {entry.current_values.hours}</p>
                                                        <p className="text-sm">Tarifa: ${entry.current_values.hourly_rate}</p>
                                                        <p className="text-sm">Total: ${entry.current_values.total_amount}</p>
                                                        <p className="text-sm">Actividad: {entry.current_values.activity}</p>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 mt-4">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleAnalyzeWithAI(entry.id)}
                                                        disabled={analyzing === entry.id}
                                                    >
                                                        {analyzing === entry.id ? (
                                                            <>
                                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                                Analizando...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Sparkles className="w-4 h-4 mr-2" />
                                                                Analizar con IA
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>

                                                {aiAnalysis[entry.id] && (
                                                    <div className="mt-4 p-4 bg-blue-50 rounded border border-blue-200">
                                                        <h4 className="font-semibold mb-2 flex items-center gap-2">
                                                            <Sparkles className="w-4 h-4 text-blue-600" />
                                                            Análisis con IA
                                                        </h4>
                                                        <p className="text-sm whitespace-pre-wrap">{aiAnalysis[entry.id]}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </TabsContent>

                        {/* TAB: IRREGULARIDADES */}
                        <TabsContent value="irregularities" className="space-y-4">
                            {auditData.irregularities.length === 0 ? (
                                <Alert>
                                    <AlertDescription>
                                        ✅ No se encontraron irregularidades en las entradas del período analizado.
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                auditData.irregularities.map((entry) => (
                                    <Card key={entry.id} className="border-yellow-200">
                                        <CardHeader>
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                                {entry.cleaner_name} - {entry.client_name}
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2">
                                                <p className="text-sm">
                                                    <span className="font-semibold">Fecha:</span> {format(new Date(entry.work_date), 'dd MMM yyyy', { locale: es })}
                                                </p>
                                                <p className="text-sm">
                                                    <span className="font-semibold">Actividad:</span> {entry.activity} • {entry.hours}h • ${entry.total_amount}
                                                </p>
                                                {entry.invoiced && (
                                                    <Badge variant="secondary">Facturada</Badge>
                                                )}
                                                
                                                <div className="mt-3 p-3 bg-yellow-50 rounded">
                                                    <h5 className="font-semibold text-sm mb-2">Problemas detectados:</h5>
                                                    <ul className="list-disc list-inside space-y-1">
                                                        {entry.issues.map((issue, idx) => (
                                                            <li key={idx} className="text-sm text-yellow-800">{issue}</li>
                                                        ))}
                                                    </ul>
                                                </div>

                                                <div className="flex gap-2 mt-4">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleAnalyzeWithAI(entry.id)}
                                                        disabled={analyzing === entry.id}
                                                    >
                                                        {analyzing === entry.id ? (
                                                            <>
                                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                                Analizando...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Sparkles className="w-4 h-4 mr-2" />
                                                                Analizar con IA
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>

                                                {aiAnalysis[entry.id] && (
                                                    <div className="mt-4 p-4 bg-blue-50 rounded border border-blue-200">
                                                        <h4 className="font-semibold mb-2 flex items-center gap-2">
                                                            <Sparkles className="w-4 h-4 text-blue-600" />
                                                            Análisis con IA
                                                        </h4>
                                                        <p className="text-sm whitespace-pre-wrap">{aiAnalysis[entry.id]}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </TabsContent>
                    </Tabs>
                </div>

                <div className="flex justify-end">
                    <Button onClick={onClose}>Cerrar</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}