import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, Eye, EyeOff, RefreshCw } from 'lucide-react';

const EMPTY = {
  type: 'day',
  target: 'all',
  target_name: 'Todos',
  title: '',
  body: '',
  priority: 'normal',
  display_until: '',
};

function isVigente(n) {
  if (!n.active) return false;
  if (n.display_until) {
    try {
      if (new Date(n.display_until + 'T23:59:59') < new Date()) return false;
    } catch { /* ignore */ }
  }
  return true;
}

export default function TableroAdminPanel() {
  const [notices, setNotices] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await base44.entities.BoardNotice.list('-created_date', 200);
      setNotices(data || []);
    } catch (e) {
      console.error('Error cargando avisos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.body.trim()) return;
    setSaving(true);
    try {
      await base44.entities.BoardNotice.create({
        type: form.type,
        target: form.target,
        target_name: form.target === 'all' ? 'Todos' : form.target_name.trim(),
        title: form.title.trim(),
        body: form.body.trim(),
        priority: form.priority,
        display_until: form.display_until || null,
        active: true,
      });
      setForm(EMPTY);
      await load();
    } catch (err) {
      console.error('Error creando aviso:', err);
      alert('No se pudo crear el aviso: ' + (err.message || 'error'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este aviso del tablero?')) return;
    try {
      await base44.entities.BoardNotice.delete(id);
      await load();
    } catch (err) {
      console.error('Error eliminando aviso:', err);
    }
  };

  const toggleActive = async (n) => {
    try {
      await base44.entities.BoardNotice.update(n.id, { active: !n.active });
      await load();
    } catch (err) {
      console.error('Error alternando aviso:', err);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tablero TV</h1>
          <p className="text-slate-500 text-sm">Crea y gestiona los avisos que se muestran en el televisor de la oficina.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /> Refrescar</Button>
      </div>

      <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Tipo</Label>
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            className="w-full h-10 rounded-md border border-input bg-background px-3 mt-1">
            <option value="day">Nota del día</option>
            <option value="office">Aviso de oficina (rotativo)</option>
          </select>
        </div>
        <div>
          <Label>Destinatario</Label>
          <select value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value, target_name: e.target.value === 'all' ? 'Todos' : f.target_name }))}
            className="w-full h-10 rounded-md border border-input bg-background px-3 mt-1">
            <option value="all">Todos</option>
            <option value="cleaner">Limpiador específico</option>
            <option value="team">Equipo</option>
          </select>
        </div>
        {form.target !== 'all' && (
          <div className="md:col-span-2">
            <Label>Nombre del {form.target === 'cleaner' ? 'limpiador' : 'equipo'}</Label>
            <Input value={form.target_name} onChange={e => setForm(f => ({ ...f, target_name: e.target.value }))}
              placeholder={form.target === 'cleaner' ? 'Ej: Daniel' : 'Ej: Equipo Norte'} />
          </div>
        )}
        <div>
          <Label>Título (opcional)</Label>
          <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Ej: Revisar notas del cliente" />
        </div>
        <div>
          <Label>Prioridad</Label>
          <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
            className="w-full h-10 rounded-md border border-input bg-background px-3 mt-1">
            <option value="normal">Normal</option>
            <option value="high">Urgente</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <Label>Mensaje</Label>
          <Textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            placeholder="Ej: Revisar el vehículo antes de salir. Sacar la basura del área de suministros."
            rows={3} />
        </div>
        <div>
          <Label>Vigente hasta (opcional)</Label>
          <Input type="date" value={form.display_until} onChange={e => setForm(f => ({ ...f, display_until: e.target.value }))} />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={saving || !form.body.trim()} className="w-full">
            <Plus className="w-4 h-4" /> {saving ? 'Guardando…' : 'Publicar aviso'}
          </Button>
        </div>
      </form>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800">Avisos actuales</h2>
        {loading ? (
          <div className="text-slate-400">Cargando…</div>
        ) : notices.length === 0 ? (
          <div className="text-slate-400">No hay avisos. Crea el primero arriba.</div>
        ) : (
          notices.map(n => (
            <div key={n.id} className={`bg-white rounded-xl border p-4 flex items-start gap-3 ${isVigente(n) ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${n.type === 'office' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {n.type === 'office' ? 'Oficina' : 'Día'}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{n.target_name || n.target}</span>
                  {n.priority === 'high' && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">Urgente</span>}
                  {!n.active && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">Inactivo</span>}
                </div>
                {n.title && <div className="font-semibold text-slate-800 mt-1">{n.title}</div>}
                <div className="text-slate-600 text-sm mt-0.5 whitespace-pre-wrap">{n.body}</div>
                {n.display_until && <div className="text-xs text-slate-400 mt-1">Vigente hasta: {n.display_until}</div>}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => toggleActive(n)} title={n.active ? 'Ocultar' : 'Mostrar'}>
                  {n.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(n.id)} title="Eliminar">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}