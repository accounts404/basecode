import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar, Mail, History, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';

export default function PriceIncreaseNotificationDialog({ client, open, onOpenChange, onSuccess }) {
    const [sentDate, setSentDate] = useState(new Date());
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            const user = await base44.auth.me();
            
            const existingNotifications = client.price_increase_notifications || [];
            const newNotification = {
                sent_date: format(sentDate, 'yyyy-MM-dd'),
                notes: notes.trim(),
                sent_by_user_id: user.id
            };

            await base44.entities.Client.update(client.id, {
                price_increase_notifications: [...existingNotifications, newNotification]
            });

            setSentDate(new Date());
            setNotes('');
            onSuccess();
        } catch (error) {
            console.error('Error guardando notificación:', error);
            alert('Error al guardar la notificación');
        } finally {
            setSaving(false);
        }
    };

    const handleUnmark = async (indexToRemove) => {
        if (!confirm('¿Desmarcar esta notificación?')) return;
        
        setSaving(true);
        try {
            const updatedNotifications = (client.price_increase_notifications || [])
                .filter((_, index) => index !== indexToRemove);

            await base44.entities.Client.update(client.id, {
                price_increase_notifications: updatedNotifications
            });

            onSuccess();
        } catch (error) {
            console.error('Error desmarcando notificación:', error);
            alert('Error al desmarcar');
        } finally {
            setSaving(false);
        }
    };

    const history = client.price_increase_notifications || [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="text-2xl flex items-center gap-2">
                        <Mail className="w-6 h-6 text-blue-600" />
                        Marcar Envío de Aumento - {client.name}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Fecha de Envío</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start text-left font-normal"
                                >
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {format(sentDate, 'PPP', { locale: es })}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <CalendarComponent
                                    mode="single"
                                    selected={sentDate}
                                    onSelect={(date) => date && setSentDate(date)}
                                    disabled={(date) => date > new Date()}
                                    locale={es}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">
                            Notas (opcional)
                        </Label>
                        <Textarea
                            placeholder="Ej: Enviado por email, cliente aceptó aumento..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            className="resize-none"
                        />
                    </div>

                    {history.length > 0 && (
                        <div className="border-t pt-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowHistory(!showHistory)}
                                className="w-full justify-start text-slate-600 hover:text-slate-900"
                            >
                                <History className="w-4 h-4 mr-2" />
                                Historial de Envíos ({history.length})
                            </Button>

                            {showHistory && (
                                <div className="mt-3 space-y-2 max-h-[200px] overflow-y-auto">
                                    {history.map((notification, index) => (
                                        <div 
                                            key={index}
                                            className="bg-slate-50 rounded-lg p-3 text-sm border border-slate-200"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 text-slate-700 font-medium">
                                                        <Calendar className="w-3 h-3" />
                                                        {format(new Date(notification.sent_date), 'dd MMM yyyy', { locale: es })}
                                                    </div>
                                                    {notification.notes && (
                                                        <p className="text-slate-600 mt-1 text-xs">{notification.notes}</p>
                                                    )}
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleUnmark(index)}
                                                    className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-700"
                                                    disabled={saving}
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {saving ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        ) : (
                            <>
                                <Mail className="w-4 h-4 mr-2" />
                                Marcar Enviado
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}