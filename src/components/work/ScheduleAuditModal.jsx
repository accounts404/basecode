import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, AlertTriangle, CheckCircle, XCircle, Plus, Eye, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';
import { processScheduleForWorkEntries } from '@/functions/processScheduleForWorkEntries';

export default function ScheduleAuditModal({ isOpen, onClose, auditData, onRefresh }) {
    const [selectedItems, setSelectedItems] = useState([]);
    const [batchProcessing, setBatchProcessing] = useState(false);
    const [creatingEntry, setCreatingEntry] = useState(null);
    const [selectedResult, setSelectedResult] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    if (!auditData) return null;

    const handleSelectAll = (checked) => {
        if (checked) {
            const missingKeys = auditData.results
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

    const handleCreateWorkEntry = async (result) => {
        setCreatingEntry(result.key);
        setError('');
        setSuccess('');
        try {
            const response = await processScheduleForWorkEntries({
                scheduleId: result.schedule_id,
                mode: 'create'
            });

            if (response.data.success) {
                setSuccess(`WorkEntry creada exitosamente para ${result.cleaner_name}`);
                await onRefresh();
                setSelectedResult(null);
            } else {
                throw new Error(response.data.error || 'Error al crear WorkEntry');
            }
        } catch (err) {
            console.error('Error creating work entry:', err);
            setError('Error al crear WorkEntry: ' + (err.message || 'Error desconocido'));
        } finally {
            setCreatingEntry(null);
        }
    };

    const handleBatchCreate = async () => {
        if (selectedItems.length === 0) return;
        
        setBatchProcessing(true);
        setError('');
        setSuccess('');

        let successCount = 0;
        let errorCount = 0;

        // Obtener schedule IDs únicos de los items seleccionados
        const uniqueScheduleIds = [...new Set(selectedItems.map(key => key.split('_')[0]))];

        for (const scheduleId of uniqueScheduleIds) {
            try {
                const response = await processScheduleForWorkEntries({
                    scheduleId,
                    mode: 'create'
                });
                
                if (response.data.success) {
                    successCount += response.data.created_entries || 1;
                } else {
                    errorCount++;
                }
            } catch (err) {
                console.error('Error in batch create:', err);
                errorCount++;
            }
        }

        if (successCount > 0) {
            setSuccess(`${successCount} WorkEntries creadas exitosamente`);
        }
        if (errorCount > 0) {
            setError(`${errorCount} errores al crear WorkEntries`);
        }

        setSelectedItems([]);
        await onRefresh();
        setBatchProcessing(false);
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

    const missingResults = auditData.results?.filter(r => r.status === 'missing') || [];
    const allMissingSelected = missingResults.length > 0 && selectedItems.length === missingResults.length;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-purple-600" />
                        Auditoría: Schedules vs WorkEntries
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Alerts */}
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {success && (
                        <Alert className="bg-green-50 border-green-200">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-800">{success}</AlertDescription>
                        </Alert>
                    )}

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="bg-slate-50 border-slate-200">
                            <CardContent className="p-4 text-center">
                                <p className="text-3xl font-bold text-slate-900">{auditData.stats?.total || 0}</p>
                                <p className="text-sm text-slate-600">Total Servicios</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-green-50 border-green-200">
                            <CardContent className="p-4 text-center">
                                <p className="text-3xl font-bold text-green-700">{auditData.stats?.ok || 0}</p>
                                <p className="text-sm text-green-600">Correctos</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-red-50 border-red-200">
                            <CardContent className="p-4 text-center">
                                <p className="text-3xl font-bold text-red-700">{auditData.stats?.missing || 0}</p>
                                <p className="text-sm text-red-600">Falta WorkEntry</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-amber-50 border-amber-200">
                            <CardContent className="p-4 text-center">
                                <p className="text-3xl font-bold text-amber-700">{auditData.stats?.mismatch || 0}</p>
                                <p className="text-sm text-amber-600">Diferencia Horas</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Batch Actions */}
                    {selectedItems.length > 0 && (
                        <Alert className="bg-blue-50 border-blue-200">
                            <AlertDescription className="flex items-center justify-between">
                                <span className="text-blue-900 font-medium">
                                    {selectedItems.length} servicio{selectedItems.length !== 1 ? 's' : ''} seleccionado{selectedItems.length !== 1 ? 's' : ''}
                                </span>
                                <Button 
                                    onClick={handleBatchCreate} 
                                    disabled={batchProcessing}
                                    className="bg-green-600 hover:bg-green-700"
                                    size="sm"
                                >
                                    {batchProcessing ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Creando...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="w-4 h-4 mr-2" />
                                            Crear {selectedItems.length} WorkEntries
                                        </>
                                    )}
                                </Button>
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Results Table */}
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-12">
                                        <Checkbox 
                                            checked={allMissingSelected}
                                            onCheckedChange={handleSelectAll}
                                            disabled={missingResults.length === 0}
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
                                {auditData.results && auditData.results.length > 0 ? (
                                    auditData.results.map((result) => (
                                        <TableRow 
                                            key={result.key} 
                                            className={
                                                result.status === 'missing' ? 'bg-red-50/50' : 
                                                result.status === 'mismatch' ? 'bg-amber-50/50' : ''
                                            }
                                        >
                                            <TableCell>
                                                {result.status === 'missing' && (
                                                    <Checkbox 
                                                        checked={selectedItems.includes(result.key)}
                                                        onCheckedChange={(checked) => handleSelectItem(result.key, checked)}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {format(new Date(result.schedule_date), "d MMM yyyy", { locale: es })}
                                            </TableCell>
                                            <TableCell>{result.client_name}</TableCell>
                                            <TableCell>{result.cleaner_name}</TableCell>
                                            <TableCell className="text-center font-semibold">
                                                {result.expected_hours}h
                                            </TableCell>
                                            <TableCell className="text-center font-semibold">
                                                {result.status === 'missing' ? (
                                                    <span className="text-red-600">—</span>
                                                ) : (
                                                    <span className={result.status === 'mismatch' ? 'text-amber-600' : ''}>
                                                        {result.actual_hours}h
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>{getStatusBadge(result.status, result.status_label)}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm"
                                                        onClick={() => setSelectedResult(result)}
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                    {result.status === 'missing' && (
                                                        <Button 
                                                            size="sm"
                                                            className="bg-green-600 hover:bg-green-700"
                                                            onClick={() => handleCreateWorkEntry(result)}
                                                            disabled={creatingEntry === result.key}
                                                        >
                                                            {creatingEntry === result.key ? (
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                            ) : (
                                                                <>
                                                                    <Plus className="w-4 h-4 mr-1" />
                                                                    Crear
                                                                </>
                                                            )}
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan="8" className="text-center py-8 text-slate-500">
                                            No hay resultados para mostrar
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <DialogFooter>
                    <Button onClick={onClose}>Cerrar</Button>
                </DialogFooter>

                {/* Detail View Dialog */}
                <Dialog open={!!selectedResult} onOpenChange={() => setSelectedResult(null)}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Detalles del Servicio</DialogTitle>
                        </DialogHeader>
                        {selectedResult && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-slate-50 rounded-lg">
                                        <p className="text-sm text-slate-600">Cliente</p>
                                        <p className="font-semibold">{selectedResult.client_name}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-lg">
                                        <p className="text-sm text-slate-600">Fecha</p>
                                        <p className="font-semibold">
                                            {format(new Date(selectedResult.schedule_date), "d MMMM yyyy", { locale: es })}
                                        </p>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-lg">
                                        <p className="text-sm text-slate-600">Limpiador</p>
                                        <p className="font-semibold">{selectedResult.cleaner_name}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-lg">
                                        <p className="text-sm text-slate-600">Estado</p>
                                        {getStatusBadge(selectedResult.status, selectedResult.status_label)}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                        <p className="text-sm text-blue-700">Horas Esperadas (Schedule)</p>
                                        <p className="text-2xl font-bold text-blue-900">{selectedResult.expected_hours}h</p>
                                    </div>
                                    <div className={`p-4 rounded-lg border ${
                                        selectedResult.status === 'ok' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                                    }`}>
                                        <p className={`text-sm ${
                                            selectedResult.status === 'ok' ? 'text-green-700' : 'text-red-700'
                                        }`}>
                                            Horas Registradas (WorkEntry)
                                        </p>
                                        <p className={`text-2xl font-bold ${
                                            selectedResult.status === 'ok' ? 'text-green-900' : 'text-red-900'
                                        }`}>
                                            {selectedResult.status === 'missing' ? '—' : `${selectedResult.actual_hours}h`}
                                        </p>
                                    </div>
                                </div>

                                {selectedResult.work_entries_count > 0 && (
                                    <Alert>
                                        <AlertDescription>
                                            Este servicio tiene {selectedResult.work_entries_count} WorkEntry(s) asociada(s).
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        )}
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setSelectedResult(null)}>
                                Cerrar
                            </Button>
                            {selectedResult?.status === 'missing' && (
                                <Button 
                                    onClick={() => handleCreateWorkEntry(selectedResult)}
                                    disabled={creatingEntry === selectedResult.key}
                                    className="bg-green-600 hover:bg-green-700"
                                >
                                    {creatingEntry === selectedResult.key ? (
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
            </DialogContent>
        </Dialog>
    );
}