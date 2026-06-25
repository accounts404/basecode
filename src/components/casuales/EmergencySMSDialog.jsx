import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Send, Loader2, CheckCircle, XCircle, Users } from 'lucide-react';
import { sendBulkCasualSMS } from '@/functions/sendBulkCasualSMS';

const TEMPLATES = [
  { label: '🤒 Limpiador enfermo', text: 'Hola! Necesitamos refuerzo urgente para hoy. ¿Estás disponible para trabajar? Respondé SI o NO. Gracias!' },
  { label: '📅 Trabajo disponible', text: 'Hola! Tenemos trabajo disponible esta semana. ¿Estás disponible? Respondé con tu disponibilidad. Gracias!' },
  { label: '⚡ Urgente hoy', text: 'URGENTE: Necesitamos una limpiadora para hoy. ¿Podés? Respondé SI con tu nombre y disponibilidad horaria.' },
];

export default function EmergencySMSDialog({ open, onClose, casuals, onRefresh }) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState('available'); // 'available' | 'active' | 'all'

  const targetCasuals = casuals.filter(c => {
    if (!c.is_active && c.is_active !== undefined) return false;
    if (filter === 'available') return c.available_for_work === true;
    if (filter === 'active') return c.status === 'activo';
    // 'all' = activos + trial_realizado + available_for_work, excluding descartado
    return c.status !== 'descartado';
  });

  const handleSend = async () => {
    if (!message.trim() || targetCasuals.length === 0) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await sendBulkCasualSMS({
        casual_ids: targetCasuals.map(c => c.id),
        message: message.trim(),
        broadcast_id: `emergency_${Date.now()}`,
      });
      setResult(res.data);
      if (onRefresh) onRefresh();
    } catch (e) {
      setResult({ error: e.message });
    }
    setLoading(false);
  };

  const handleClose = () => {
    setMessage('');
    setResult(null);
    setFilter('available');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            SMS de Emergencia — Convocar Casuales
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filter selector */}
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-2 block">¿A quiénes enviar?</Label>
            <div className="flex gap-2 flex-wrap">
              {[
                { key: 'available', label: '✅ Disponibles hoy', desc: 'Con "disponible ahora" activado' },
                { key: 'active', label: '⭐ Activos', desc: 'Status = activo' },
                { key: 'all', label: '📋 Todos habilitados', desc: 'Excepto descartados' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setFilter(opt.key)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left ${
                    filter === opt.key
                      ? 'border-red-400 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div>{opt.label}</div>
                  <div className="text-[10px] text-slate-400">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Recipients preview */}
          <div className={`rounded-lg px-4 py-3 ${targetCasuals.length > 0 ? 'bg-orange-50 border border-orange-200' : 'bg-slate-50 border border-slate-200'}`}>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-600" />
              <span className="font-semibold text-sm text-orange-900">
                {targetCasuals.length} destinatario{targetCasuals.length !== 1 ? 's' : ''}
              </span>
            </div>
            {targetCasuals.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-2 max-h-20 overflow-y-auto">
                {targetCasuals.map(c => (
                  <span key={c.id} className="text-[10px] bg-white border border-orange-200 rounded px-1.5 py-0.5 text-orange-700">
                    {c.full_name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 mt-1">No hay casuales en este grupo.</p>
            )}
          </div>

          {/* Templates */}
          <div>
            <Label className="text-xs font-semibold text-slate-600 mb-2 block">Templates rápidos</Label>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.label}
                  onClick={() => setMessage(t.text)}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <Label>Mensaje</Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Escribí el mensaje de emergencia..."
              rows={4}
            />
            <p className="text-xs text-slate-400">{message.length} caracteres</p>
          </div>

          {/* Result */}
          {result && (
            <div className={`rounded-lg p-3 text-sm ${result.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {result.error ? (
                <p className="flex items-center gap-1"><XCircle className="w-4 h-4" />{result.error}</p>
              ) : (
                <div>
                  <p className="font-semibold flex items-center gap-1"><CheckCircle className="w-4 h-4" />SMS enviados correctamente</p>
                  <div className="mt-2 space-y-1 max-h-28 overflow-y-auto">
                    {(result.results || []).map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span>{r.name}</span>
                        <Badge className={r.status === 'error' || r.status === 'failed' ? 'bg-red-100 text-red-700' : r.status === 'skipped' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}>
                          {r.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cerrar</Button>
          <Button
            onClick={handleSend}
            disabled={loading || !message.trim() || targetCasuals.length === 0}
            className="bg-red-600 hover:bg-red-700"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar Emergencia ({targetCasuals.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}