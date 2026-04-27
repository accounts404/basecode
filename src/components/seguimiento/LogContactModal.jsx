import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { Upload, X, ImageIcon } from 'lucide-react';

export default function LogContactModal({ client, adminUsers = [], onClose, onSaved }) {
  const [form, setForm] = useState({
    interaction_type: 'call',
    interaction_date: format(new Date(), 'yyyy-MM-dd'),
    comments: '',
    conversation_text: '',
    assigned_to: '',
    visit_photos: [],
  });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileRef = useRef();

  const isConversationType = ['message', 'email'].includes(form.interaction_type);
  const isVisit = form.interaction_type === 'visit';

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploadingPhoto(true);
    const uploaded = [];
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      uploaded.push({ url: file_url, comment: '' });
    }
    setForm(f => ({ ...f, visit_photos: [...f.visit_photos, ...uploaded] }));
    setUploadingPhoto(false);
  };

  const removePhoto = (idx) => {
    setForm(f => ({ ...f, visit_photos: f.visit_photos.filter((_, i) => i !== idx) }));
  };

  const updatePhotoComment = (idx, comment) => {
    setForm(f => ({
      ...f,
      visit_photos: f.visit_photos.map((p, i) => i === idx ? { ...p, comment } : p),
    }));
  };

  const handleSave = async () => {
    if (!client) return;
    setSaving(true);
    const user = await base44.auth.me();
    await base44.entities.FollowUpLog.create({
      client_id: client.id,
      client_name: client.name,
      interaction_type: form.interaction_type,
      interaction_date: form.interaction_date,
      comments: form.comments,
      conversation_text: isConversationType ? form.conversation_text : undefined,
      visit_photos: isVisit ? form.visit_photos : undefined,
      logged_by: user?.email || 'admin',
      assigned_to: form.assigned_to || undefined,
      replied: false,
    });
    setSaving(false);
    onSaved();
  };

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar Contacto</DialogTitle>
          <DialogDescription>
            {client?.name} · {client?.mobile_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tipo */}
          <div className="space-y-2">
            <Label>Tipo de interacción</Label>
            <Select value={form.interaction_type} onValueChange={(v) => setForm(f => ({ ...f, interaction_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="call">📞 Llamada</SelectItem>
                <SelectItem value="message">💬 Mensaje (SMS/WhatsApp)</SelectItem>
                <SelectItem value="email">✉️ Email</SelectItem>
                <SelectItem value="visit">👁️ Visita</SelectItem>
                <SelectItem value="other">• Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Fecha */}
          <div className="space-y-2">
            <Label>Fecha</Label>
            <Input type="date" value={form.interaction_date} onChange={(e) => setForm(f => ({ ...f, interaction_date: e.target.value }))} />
          </div>

          {/* Responsable */}
          {adminUsers.length > 0 && (
            <div className="space-y-2">
              <Label>Responsable (opcional)</Label>
              <Select value={form.assigned_to} onValueChange={(v) => setForm(f => ({ ...f, assigned_to: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar admin..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Sin asignar</SelectItem>
                  {adminUsers.map(u => (
                    <SelectItem key={u.id} value={u.full_name || u.email}>{u.full_name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Comentarios */}
          <div className="space-y-2">
            <Label>Comentarios / Resumen</Label>
            <Textarea
              placeholder="¿De qué hablaron? ¿Hubo algún problema o novedad?"
              value={form.comments}
              onChange={(e) => setForm(f => ({ ...f, comments: e.target.value }))}
              rows={3}
            />
          </div>

          {/* Conversación completa para mensaje/email */}
          {isConversationType && (
            <div className="space-y-2">
              <Label>
                {form.interaction_type === 'email' ? 'Cuerpo del email (pegá el texto completo)' : 'Conversación completa (pegá los mensajes)'}
              </Label>
              <Textarea
                placeholder={form.interaction_type === 'email'
                  ? "Pegá aquí el texto del email enviado y la respuesta del cliente..."
                  : "Pegá aquí los mensajes de WhatsApp/SMS con el cliente..."
                }
                value={form.conversation_text}
                onChange={(e) => setForm(f => ({ ...f, conversation_text: e.target.value }))}
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-slate-400">
                💡 Podés pegar la conversación completa incluyendo la respuesta del cliente. Quedará guardada como evidencia.
              </p>
            </div>
          )}

          {/* Fotos para visita */}
          {isVisit && (
            <div className="space-y-2">
              <Label>Fotos de la visita</Label>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
              <Button
                type="button"
                variant="outline"
                className="w-full h-10 border-dashed gap-2"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? (
                  <><div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> Subiendo...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Subir fotos</>
                )}
              </Button>

              {form.visit_photos.length > 0 && (
                <div className="space-y-2 mt-2">
                  {form.visit_photos.map((photo, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <img src={photo.url} alt="" className="w-14 h-14 object-cover rounded-lg border border-slate-200 flex-shrink-0" />
                      <Input
                        placeholder="Descripción de la foto..."
                        value={photo.comment}
                        onChange={(e) => updatePhotoComment(i, e.target.value)}
                        className="flex-1 h-8 text-xs"
                      />
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500" onClick={() => removePhoto(i)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}