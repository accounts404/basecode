import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MessageSquare, Send, Loader2 } from 'lucide-react';
import { sendCancellationSms } from '@/functions/sendCancellationSms';

export default function CancellationSmsDialog({ open, onClose, schedule, selectedClient, initialText, onScheduleUpdated }) {
    const [smsText, setSmsText] = useState(initialText || '');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);

    // Sync text when initialText changes (dialog opens)
    useEffect(() => {
        setSmsText(initialText || '');
        setResult(null);
    }, [initialText, open]);

    const handleSend = async () => {
        if (!schedule?.id) return;
        setSending(true);
        setResult(null);
        try {
            const { data } = await sendCancellationSms({ scheduleId: schedule.id, customMessage: smsText });
            if (data.success) {
                // Also update the schedule status to cancelled
                await base44.entities.Schedule.update(schedule.id, { status: 'cancelled' });
                if (onScheduleUpdated) onScheduleUpdated({ ...schedule, status: 'cancelled' });
                setResult({ success: true, message: '¡SMS de cancelación enviado y servicio marcado como Cancelado!' });
                setTimeout(() => onClose(), 2000);
            } else {
                setResult({ success: false, message: data.error || 'Error al enviar el SMS.' });
            }
        } catch (err) {
            setResult({ success: false, message: err.response?.data?.error || 'Error al enviar el SMS.' });
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-700">
                        <MessageSquare className="w-5 h-5" />
                        Notificar Cancelación al Cliente
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <p className="text-sm text-slate-600">
                        El servicio ha sido marcado como <strong>Cancelado</strong>. ¿Deseas enviar un SMS de notificación al cliente?
                    </p>
                    {selectedClient?.mobile_number && (
                        <p className="text-xs text-slate-500">📱 Se enviará a: <strong>{selectedClient.mobile_number}</strong>{selectedClient.secondary_mobile_number ? ` y ${selectedClient.secondary_mobile_number}` : ''}</p>
                    )}
                    <div className="space-y-1">
                        <Label>Mensaje SMS (editable)</Label>
                        <Textarea value={smsText} onChange={(e) => setSmsText(e.target.value)} rows={5} className="text-sm" />
                        <p className="text-xs text-slate-400">{smsText.length} caracteres</p>
                    </div>
                    {result && (
                        <Alert className={result.success ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}>
                            <AlertDescription>{result.message}</AlertDescription>
                        </Alert>
                    )}
                </div>
                <div className="flex justify-between gap-3 pt-2">
                    <Button variant="outline" onClick={onClose} disabled={sending}>Omitir SMS</Button>
                    <Button className="bg-red-600 hover:bg-red-700" onClick={handleSend} disabled={sending || !smsText.trim()}>
                        {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</> : <><Send className="w-4 h-4 mr-2" />Enviar SMS de Cancelación</>}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}