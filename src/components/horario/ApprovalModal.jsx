import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, Clock, DollarSign, AlertCircle, Edit } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function ApprovalModal({ 
    isOpen, 
    onClose, 
    previewData, 
    onApprove, 
    loading = false,
    error = null 
}) {
    const [editableEntries, setEditableEntries] = useState([]);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        if (previewData && previewData.preview_entries) {
            setEditableEntries(previewData.preview_entries.map(entry => ({
                ...entry,
                original_rate: entry.hourly_rate
            })));
            setHasChanges(false);
        }
    }, [previewData]);

    const handleEntryChange = (index, field, value) => {
        const updatedEntries = [...editableEntries];
        const numValue = parseFloat(value) || 0;
        
        // Solo se puede editar 'hourly_rate'
        if (field === 'hourly_rate') {
            updatedEntries[index] = {
                ...updatedEntries[index],
                hourly_rate: numValue,
                total_amount: updatedEntries[index].hours * numValue // Recalcular total
            };
        }

        setEditableEntries(updatedEntries);
        
        // Verificar si hay cambios respecto a los valores originales
        const hasAnyChanges = updatedEntries.some(entry => 
             entry.hourly_rate !== entry.original_rate
        );
        setHasChanges(hasAnyChanges);
    };

    const handleApprove = () => {
        onApprove(editableEntries);
    };

    const totalHours = editableEntries.reduce((sum, entry) => sum + entry.hours, 0);
    const totalAmount = editableEntries.reduce((sum, entry) => sum + entry.total_amount, 0);

    if (!previewData) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <CheckCircle className="w-6 h-6 text-green-600" />
                        Revisar y Aprobar Horas Generadas
                    </DialogTitle>
                </DialogHeader>

                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {/* Información del Servicio */}
                <Card className="bg-blue-50 border-blue-200">
                    <CardHeader>
                        <CardTitle className="text-lg text-blue-900">Información del Servicio Completado</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-blue-700"><strong>Cliente:</strong> {previewData.schedule.client_name}</p>
                                <p className="text-sm text-blue-700"><strong>Fecha:</strong> {previewData.schedule.service_date}</p>
                            </div>
                            <div>
                                <p className="text-sm text-blue-700"><strong>Horario:</strong> {previewData.schedule.start_time} - {previewData.schedule.end_time}</p>
                                <p className="text-sm text-blue-700"><strong>Limpiadores:</strong> {editableEntries.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Tabla de Horas con Solo Tarifa Editable */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Edit className="w-5 h-5 text-orange-600" />
                            Ajustar Tarifa por Hora (si es necesario)
                            {hasChanges && <Badge className="bg-orange-100 text-orange-800 ml-2">Tarifa Modificada</Badge>}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50">
                                    <TableHead>Limpiador</TableHead>
                                    <TableHead className="text-center">Horas Programadas</TableHead>
                                    <TableHead className="text-center">Tarifa/Hora (AUD)</TableHead>
                                    <TableHead className="text-center">Total (AUD)</TableHead>
                                    <TableHead className="text-center">Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {editableEntries.map((entry, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-medium">{entry.cleaner_name}</TableCell>
                                        <TableCell className="text-center">
                                            {/* Horas no editables - Solo lectura */}
                                            <div className="w-24 mx-auto text-center font-semibold text-slate-800 py-2 px-3 bg-slate-100 border border-slate-200 rounded-md">
                                                {entry.hours.toFixed(2)}
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">Programado por admin</p>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {/* Tarifa editable */}
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={entry.hourly_rate}
                                                onChange={(e) => handleEntryChange(index, 'hourly_rate', e.target.value)}
                                                className="w-24 text-center mx-auto"
                                                placeholder="0.00"
                                            />
                                            <p className="text-xs text-slate-500 mt-1">Editable</p>
                                        </TableCell>
                                        <TableCell className="text-center font-bold text-green-700 text-lg">
                                            ${entry.total_amount.toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {(entry.hourly_rate !== entry.original_rate) ? (
                                                <Badge className="bg-orange-100 text-orange-800">Tarifa Ajustada</Badge>
                                            ) : (
                                                <Badge className="bg-gray-100 text-gray-600">Tarifa Original</Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Resumen Final */}
                <Card className="bg-green-50 border-green-200">
                    <CardContent className="p-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Clock className="w-5 h-5 text-green-600" />
                                <span className="text-green-900 font-semibold">Total Horas: {totalHours.toFixed(2)}h</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <DollarSign className="w-5 h-5 text-green-600" />
                                <span className="text-green-900 font-semibold text-lg">Total: ${totalAmount.toFixed(2)} AUD</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Alert className="border-blue-200 bg-blue-50">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                        <strong>Importante:</strong> Las horas están basadas en el horario programado y no son editables. 
                        Solo puedes ajustar la tarifa por hora para casos especiales. Una vez que apruebes, estas horas 
                        aparecerán en tu sección "Mis Horas" listas para ser facturadas.
                    </AlertDescription>
                </Alert>

                <DialogFooter className="flex justify-between">
                    <Button 
                        variant="outline" 
                        onClick={onClose}
                        disabled={loading}
                    >
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleApprove}
                        disabled={loading || editableEntries.length === 0}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        {loading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                Procesando...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Aprobar y Crear Entradas ({editableEntries.length})
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}