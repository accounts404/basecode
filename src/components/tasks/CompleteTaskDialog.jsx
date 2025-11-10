import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle, X } from 'lucide-react';

export default function CompleteTaskDialog({ task, open, onClose, onComplete, currentUser }) {
    const [completionNotes, setCompletionNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleComplete = async () => {
        if (!completionNotes.trim()) {
            alert('Por favor, describe cómo se completó la tarea');
            return;
        }

        setIsSubmitting(true);
        try {
            await onComplete(task.id, completionNotes);
            setCompletionNotes('');
            onClose();
        } catch (error) {
            console.error('Error completando tarea:', error);
            alert('Error al completar la tarea. Por favor, intenta de nuevo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = () => {
        setCompletionNotes('');
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <CheckCircle className="w-6 h-6 text-green-600" />
                        Completar Tarea
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Información de la tarea */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <h3 className="font-bold text-slate-900 mb-2">{task?.title}</h3>
                        {task?.description && (
                            <p className="text-sm text-slate-600 line-clamp-3">{task.description}</p>
                        )}
                    </div>

                    {/* Campo para notas de completado */}
                    <div className="space-y-2">
                        <Label htmlFor="completion-notes" className="text-base font-semibold">
                            ¿Cómo se completó esta tarea? *
                        </Label>
                        <p className="text-sm text-slate-600">
                            Describe brevemente las acciones tomadas, resultados obtenidos o cualquier información relevante.
                        </p>
                        <Textarea
                            id="completion-notes"
                            placeholder="Ejemplo: 'Contacté al cliente por teléfono y confirmé el servicio para el próximo martes. El cliente está conforme con el horario propuesto.'"
                            value={completionNotes}
                            onChange={(e) => setCompletionNotes(e.target.value)}
                            rows={6}
                            className="resize-none"
                            disabled={isSubmitting}
                        />
                        <p className="text-xs text-slate-500">
                            Estas notas quedarán registradas en el historial de la tarea.
                        </p>
                    </div>

                    {/* Información del usuario */}
                    <div className="flex items-center gap-2 text-sm text-slate-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <CheckCircle className="w-4 h-4 text-blue-600" />
                        <span>
                            Esta tarea será marcada como completada por <strong>{currentUser?.full_name}</strong>
                        </span>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                        disabled={isSubmitting}
                    >
                        <X className="w-4 h-4 mr-2" />
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleComplete}
                        disabled={isSubmitting || !completionNotes.trim()}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {isSubmitting ? 'Completando...' : 'Completar Tarea'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}