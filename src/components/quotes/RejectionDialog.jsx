import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';

const rejectionTypes = [
    { value: 'precio_alto', label: 'Precio muy alto' },
    { value: 'contrató_competencia', label: 'Contrató a la competencia' },
    { value: 'no_interesado', label: 'Ya no está interesado' },
    { value: 'otro', label: 'Otro motivo' }
];

export default function RejectionDialog({ quote, isOpen, onClose, onSubmit }) {
    const [rejectionType, setRejectionType] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');

    const handleSubmit = () => {
        if (!rejectionType) {
            return;
        }
        
        onSubmit({
            rejection_type: rejectionType,
            rejection_reason: rejectionReason.trim()
        });
        
        // Resetear el formulario
        setRejectionType('');
        setRejectionReason('');
    };

    const handleClose = () => {
        setRejectionType('');
        setRejectionReason('');
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-700">
                        <AlertTriangle className="w-5 h-5" />
                        Rechazar Cotización
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {quote && (
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <p className="text-sm font-semibold text-slate-900">{quote.client_name}</p>
                            <p className="text-xs text-slate-600">{quote.service_address}</p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="rejection-type">Tipo de rechazo *</Label>
                        <Select value={rejectionType} onValueChange={setRejectionType}>
                            <SelectTrigger id="rejection-type">
                                <SelectValue placeholder="Selecciona el tipo de rechazo" />
                            </SelectTrigger>
                            <SelectContent>
                                {rejectionTypes.map(type => (
                                    <SelectItem key={type.value} value={type.value}>
                                        {type.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="rejection-reason">Detalles adicionales (opcional)</Label>
                        <Textarea
                            id="rejection-reason"
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Agrega información adicional sobre el rechazo..."
                            rows={3}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        Cancelar
                    </Button>
                    <Button 
                        variant="destructive" 
                        onClick={handleSubmit}
                        disabled={!rejectionType}
                    >
                        Rechazar Cotización
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}