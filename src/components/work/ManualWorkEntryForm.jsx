import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';

export default function ManualWorkEntryForm({ isOpen, onClose, entryData, onSuccess }) {
    const [formData, setFormData] = useState({
        cleaner_id: '',
        cleaner_name: '',
        client_id: '',
        client_name: '',
        work_date: '',
        hours: '',
        activity: 'domestic',
        other_activity: '',
        hourly_rate: '',
        total_amount: ''
    });
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (entryData) {
            setFormData({
                cleaner_id: entryData.cleaner_id || '',
                cleaner_name: entryData.cleaner_name || '',
                client_id: entryData.client_id || '',
                client_name: entryData.client_name || '',
                work_date: entryData.work_date || '',
                hours: entryData.expected_hours || '',
                activity: entryData.activity || 'domestic',
                other_activity: '',
                hourly_rate: entryData.hourly_rate || '',
                total_amount: ((entryData.expected_hours || 0) * (entryData.hourly_rate || 0)).toFixed(2)
            });
        }
    }, [entryData]);

    useEffect(() => {
        if (formData.hours && formData.hourly_rate) {
            const total = parseFloat(formData.hours) * parseFloat(formData.hourly_rate);
            setFormData(prev => ({ ...prev, total_amount: total.toFixed(2) }));
        }
    }, [formData.hours, formData.hourly_rate]);

    const handleCreate = async () => {
        setError('');
        
        // Validaciones
        if (!formData.cleaner_id || !formData.client_id || !formData.work_date || !formData.hours || !formData.hourly_rate) {
            setError('Por favor completa todos los campos requeridos');
            return;
        }

        setCreating(true);
        try {
            const dataToCreate = {
                cleaner_id: formData.cleaner_id,
                cleaner_name: formData.cleaner_name,
                client_id: formData.client_id,
                client_name: formData.client_name,
                work_date: formData.work_date,
                hours: formData.hours,
                activity: formData.activity,
                other_activity: formData.activity === 'otros' ? formData.other_activity : undefined,
                hourly_rate: formData.hourly_rate,
                schedule_id: entryData?.schedule_id
            };

            console.log('[ManualWorkEntryForm] 📤 Enviando a crear:', dataToCreate);

            const { data } = await base44.functions.invoke('createSingleWorkEntry', {
                entry_data: dataToCreate
            });

            console.log('[ManualWorkEntryForm] 📥 Respuesta:', data);

            if (data.success) {
                console.log('[ManualWorkEntryForm] ✅ Entrada creada exitosamente:', data.entry);
                onSuccess();
                onClose();
            } else {
                throw new Error(data.error || 'Error desconocido al crear entrada');
            }
        } catch (error) {
            console.error('[ManualWorkEntryForm] ❌ Error:', error);
            setError('Error al crear entrada: ' + error.message);
        } finally {
            setCreating(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Crear Entrada de Trabajo Manualmente</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Limpiador</Label>
                            <Input value={formData.cleaner_name} readOnly className="bg-slate-50" />
                        </div>
                        <div>
                            <Label>Cliente</Label>
                            <Input value={formData.client_name} readOnly className="bg-slate-50" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Fecha</Label>
                            <Input 
                                type="date" 
                                value={formData.work_date}
                                onChange={(e) => setFormData({...formData, work_date: e.target.value})}
                            />
                        </div>
                        <div>
                            <Label>Horas *</Label>
                            <Input
                                type="number"
                                step="0.25"
                                value={formData.hours}
                                onChange={(e) => setFormData({...formData, hours: e.target.value})}
                                onWheel={(e) => e.target.blur()}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Actividad *</Label>
                            <Select 
                                value={formData.activity} 
                                onValueChange={(value) => setFormData({...formData, activity: value})}
                            >
                                <SelectTrigger>
                                    <SelectValue />
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
                        <div>
                            <Label>Tarifa por Hora (AUD) *</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={formData.hourly_rate}
                                onChange={(e) => setFormData({...formData, hourly_rate: e.target.value})}
                                onWheel={(e) => e.target.blur()}
                            />
                        </div>
                    </div>

                    {formData.activity === 'otros' && (
                        <div>
                            <Label>Especifica la actividad</Label>
                            <Input
                                value={formData.other_activity}
                                onChange={(e) => setFormData({...formData, other_activity: e.target.value})}
                                placeholder="Describe la actividad realizada"
                            />
                        </div>
                    )}

                    <div>
                        <Label>Total (AUD)</Label>
                        <Input
                            type="number"
                            step="0.01"
                            value={formData.total_amount}
                            readOnly
                            className="bg-slate-50 font-bold text-lg"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={creating}>
                        Cancelar
                    </Button>
                    <Button onClick={handleCreate} disabled={creating}>
                        {creating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Creando...
                            </>
                        ) : (
                            'Crear Entrada'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}