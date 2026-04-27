import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KeyRound, Plus, Trash2, Save, X, Clock, Copy, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';
import KeyPhotoUploader from './KeyPhotoUploader';

const STATUS_LABELS = {
  active: { label: 'Activa', color: 'bg-green-100 text-green-800' },
  returned: { label: 'Devuelta', color: 'bg-slate-100 text-slate-700' },
  lost: { label: 'Perdida', color: 'bg-red-100 text-red-800' },
};

export default function KeyRecordModal({ record, client, onSave, onClose }) {
  const isNew = !record?.id;
  const [form, setForm] = useState({
    safe_box_number: record?.safe_box_number || client?.access_identifier || '',
    status: record?.status || 'active',
    key_photos: record?.key_photos || [],
    copies: record?.copies || [],
    notes: record?.notes || '',
    received_date: record?.received_date || format(new Date(), 'yyyy-MM-dd'),
    returned_date: record?.returned_date || '',
    log_events: record?.log_events || [],
  });
  const [saving, setSaving] = useState(false);
  const [newCopy, setNewCopy] = useState({ label: '', notes: '', photos: [], created_date: format(new Date(), 'yyyy-MM-dd') });
  const [showNewCopy, setShowNewCopy] = useState(false);

  const buildLogEvent = (action, currentLogs, notes = '') => {
    const event = {
      date: new Date().toISOString(),
      action,
      notes,
      user_name: 'Admin',
    };
    return [...(currentLogs || []), event];
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let logs = form.log_events;
      if (isNew) {
        logs = buildLogEvent('Llave registrada en el sistema', logs);
      } else if (form.status !== record.status) {
        logs = buildLogEvent(`Estado cambiado a: ${STATUS_LABELS[form.status]?.label}`, logs);
      }

      const data = {
        client_id: client.id,
        client_name: client.name,
        client_address: client.address || '',
        ...form,
        log_events: logs,
      };
      await onSave(data);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCopy = async () => {
    if (!newCopy.label.trim()) return;
    const copyToAdd = { ...newCopy };
    let updatedForm;
    setForm(prev => {
      const updatedCopies = [...prev.copies, copyToAdd];
      const updatedLogs = buildLogEvent(`Copia agregada: ${copyToAdd.label}`, prev.log_events);
      updatedForm = { ...prev, copies: updatedCopies, log_events: updatedLogs };
      return updatedForm;
    });
    setNewCopy({ label: '', notes: '', photos: [], created_date: format(new Date(), 'yyyy-MM-dd') });
    setShowNewCopy(false);

    // Si ya existe el registro, persistir inmediatamente sin cerrar el modal
    if (!isNew && record?.id) {
      setSaving(true);
      try {
        const updatedCopies = [...form.copies, copyToAdd];
        const updatedLogs = buildLogEvent(`Copia agregada: ${copyToAdd.label}`, form.log_events);
        await onSave({
          client_id: client.id,
          client_name: client.name,
          client_address: client.address || '',
          ...form,
          copies: updatedCopies,
          log_events: updatedLogs,
        }, true);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleRemoveCopy = async (idx) => {
    const copy = form.copies[idx];
    const updatedCopies = form.copies.filter((_, i) => i !== idx);
    const updatedLogs = buildLogEvent(`Copia eliminada: ${copy.label}`, form.log_events);
    setForm(prev => ({ ...prev, copies: updatedCopies, log_events: updatedLogs }));

    // Si ya existe el registro, persistir inmediatamente sin cerrar el modal
    if (!isNew && record?.id) {
      setSaving(true);
      try {
        await onSave({
          client_id: client.id,
          client_name: client.name,
          client_address: client.address || '',
          ...form,
          copies: updatedCopies,
          log_events: updatedLogs,
        }, true);
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-600" />
            {isNew ? 'Registrar Llave' : 'Gestión de Llave'} — {client?.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="main">
          <TabsList className="w-full">
            <TabsTrigger value="main" className="flex-1">Llave Principal</TabsTrigger>
            <TabsTrigger value="copies" className="flex-1">
              Copias
              {form.copies.length > 0 && (
                <Badge className="ml-2 bg-amber-100 text-amber-800 text-xs">{form.copies.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">Historial</TabsTrigger>
          </TabsList>

          {/* TAB: LLAVE PRINCIPAL */}
          <TabsContent value="main" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Número en Caja Fuerte *</Label>
                <Input
                  value={form.safe_box_number}
                  onChange={e => setForm(p => ({ ...p, safe_box_number: e.target.value }))}
                  placeholder="Ej: A-12, 045..."
                  className="mt-1 font-mono text-lg font-bold"
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">✅ Activa</SelectItem>
                    <SelectItem value="returned">↩️ Devuelta</SelectItem>
                    <SelectItem value="lost">❌ Perdida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha de Recepción</Label>
                <Input
                  type="date"
                  value={form.received_date}
                  onChange={e => setForm(p => ({ ...p, received_date: e.target.value }))}
                  className="mt-1"
                />
              </div>
              {form.status === 'returned' && (
                <div>
                  <Label>Fecha de Devolución</Label>
                  <Input
                    type="date"
                    value={form.returned_date}
                    onChange={e => setForm(p => ({ ...p, returned_date: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              )}
            </div>

            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <p className="font-semibold text-slate-700">📍 {client?.address || 'Sin dirección'}</p>
              {client?.access_type && (
                <p className="text-slate-500 mt-1">Tipo de acceso: <span className="capitalize">{client.access_type}</span></p>
              )}
              {client?.access_instructions && (
                <p className="text-slate-500 mt-1">Instrucciones: {client.access_instructions}</p>
              )}
            </div>

            <div>
              <Label className="mb-2 block">📸 Fotos de la Llave</Label>
              <KeyPhotoUploader
                photos={form.key_photos}
                onChange={urls => setForm(p => ({ ...p, key_photos: urls }))}
              />
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Notas adicionales sobre la llave..."
                className="mt-1"
                rows={3}
              />
            </div>

            {form.status === 'lost' && (
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <AlertDescription className="text-red-700">
                  Esta llave está marcada como perdida. Considera cambiar el acceso del cliente.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* TAB: COPIAS */}
          <TabsContent value="copies" className="space-y-4 mt-4">
            {form.copies.length === 0 && !showNewCopy && (
              <div className="text-center py-8 text-slate-500">
                <Copy className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No hay copias registradas</p>
              </div>
            )}

            {form.copies.map((copy, idx) => (
              <Card key={idx} className="border-amber-200 bg-amber-50/30">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-slate-800">{copy.label}</p>
                      {copy.created_date && (
                        <p className="text-xs text-slate-500">Creada: {copy.created_date}</p>
                      )}
                      {copy.notes && <p className="text-sm text-slate-600 mt-1">{copy.notes}</p>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveCopy(idx)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {copy.photos?.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {copy.photos.map((p, pi) => (
                        <img key={pi} src={p.url} alt="" className="w-20 h-20 object-cover rounded-lg border" />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {showNewCopy && (
              <Card className="border-blue-200 bg-blue-50/30">
                <CardHeader>
                  <CardTitle className="text-sm">Nueva Copia</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Etiqueta *</Label>
                      <Input
                        value={newCopy.label}
                        onChange={e => setNewCopy(p => ({ ...p, label: e.target.value }))}
                        placeholder="Ej: Copia #1 - Daniel"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Fecha de Creación</Label>
                      <Input
                        type="date"
                        value={newCopy.created_date}
                        onChange={e => setNewCopy(p => ({ ...p, created_date: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Notas</Label>
                    <Input
                      value={newCopy.notes}
                      onChange={e => setNewCopy(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Notas sobre esta copia..."
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">📸 Fotos de la Copia</Label>
                    <KeyPhotoUploader
                      photos={newCopy.photos}
                      onChange={photos => setNewCopy(p => ({ ...p, photos }))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddCopy} disabled={!newCopy.label.trim()}>
                      <Save className="w-4 h-4 mr-1" /> Guardar Copia
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowNewCopy(false)}>
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!showNewCopy && (
              <Button variant="outline" onClick={() => setShowNewCopy(true)} className="w-full border-dashed">
                <Plus className="w-4 h-4 mr-2" /> Agregar Copia
              </Button>
            )}
          </TabsContent>

          {/* TAB: HISTORIAL */}
          <TabsContent value="history" className="mt-4">
            {form.log_events.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Sin historial aún</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...form.log_events].reverse().map((event, idx) => (
                  <div key={idx} className="flex gap-3 items-start bg-slate-50 rounded-lg p-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{event.action}</p>
                      {event.notes && <p className="text-xs text-slate-500">{event.notes}</p>}
                      <p className="text-xs text-slate-400 mt-1">
                        {format(new Date(event.date), "d 'de' MMMM yyyy, HH:mm", { locale: es })}
                        {event.user_name && ` · ${event.user_name}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !form.safe_box_number.trim()} className="bg-amber-600 hover:bg-amber-700">
            {saving ? 'Guardando...' : (isNew ? 'Registrar Llave' : 'Guardar Cambios')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}