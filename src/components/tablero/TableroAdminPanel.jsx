import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatInTimeZone } from 'date-fns-tz';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, Eye, EyeOff, RefreshCw, Users, UserCheck } from 'lucide-react';

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

function todayMelbourne() {
  try {
    return formatInTimeZone(new Date(), 'Australia/Melbourne', 'yyyy-MM-dd');
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default function TableroAdminPanel() {
  const [notices, setNotices] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cleaners, setCleaners] = useState([]);
  const [teams, setTeams] = useState([]);

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

  const loadRecipients = async () => {
    try {
      const [users, casuals, assignments] = await Promise.all([
        base44.entities.User.list('-full_name', 500).catch(() => []),
        base44.entities.CasualCleaner.list('-created_date', 500).catch(() => []),
        base44.entities.DailyTeamAssignment.list('-date', 100).catch(() => []),
      ]);

      // Limpiadores activos: usuarios no-admin activos (planta + casuales con cuenta)
      const activeUsers = (users || [])
        .filter(u => u.role !== 'admin' && u.active !== false)
        .map(u => ({
          id: u.id,
          name: u.display_name || u.full_name || 'Sin nombre',
          kind: u.employee_type === 'permanent' ? 'Planta' : 'Casual',
        }))
        .filter(u => u.name && u.name !== 'Sin nombre')
        .sort((a, b) => a.name.localeCompare(b.name));

      // Casuales del pipeline de reclutamiento (sin cuenta, activos)
      const activeCasuals = (casuals || [])
        .filter(c => c.is_active !== false && c.status !== 'descartado')
        .map(c => ({
          id: c.id,
          name: c.full_name || 'Sin nombre',
          kind: 'Casual (pipeline)',
        }))
        .filter(c => c.name && c.name !== 'Sin nombre')
        .sort((a, b) => a.name.localeCompare(b.name));

      setCleaners([...activeUsers, ...activeCasuals]);

      // Equipos: asignaciones de hoy en adelante no canceladas, con nombre
      const today = todayMelbourne();
      const activeTeams = (assignments || [])
        .filter(t => t.date && t.date >= today && t.status !== 'cancelled' && (t.team_name || (t.team_members_names && t.team_members_names.length)))
        .map(t => ({
          id: t.id,
          name: t.team_name || (t.team_members_names && t.team_members_names.length ? `Equipo ${t.team_members_names[0]}` : 'Equipo'),
          date: t.date,
          members: t.team_members_names || [],
        }));
      setTeams(activeTeams);
    } catch (e) {
      console.error('Error cargando destinatarios:', e);
    }
  };

  useEffect(() => {
    load();
    loadRecipients();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.body.trim()) return;
    if (form.target !== 'all' && !form.target_name.trim()) {
      alert('Selecciona un destinatario de la lista.');
      return;
    }
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
        <Button variant="outline" size="sm" onClick={() => { load(); loadRecipients(); }}><RefreshCw className="w-4 h-4" /> Refrescar</Button>
      </div>

      <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Tipo</Label>
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            className="w-full h-10 rounded-md border border-input bg-background px-3 mt-1">
            <option value="day">Nota del día</option>
            <option value="office">Aviso de oficina (permanente)</option>
          </select>
        </div>
        <div>
          <Label>Destinatario</Label>
          <select value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value, target_name: e.target.value === 'all' ? 'Todos' : '' }))}
            className="w-full h-10 rounded-md border border-input bg-background px-3 mt-1">
            <option value="all">Todos</option>
            <option value="cleaner">Limpiador específico</option>
            <option value="team">Equipo</option>
          </select>
        </div>
        {form.target === 'cleaner' && (
          <div className="md:col-span-2">
            <Label>
              <span className="inline-flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" /> Limpiador activo</span>
            </Label>
            <select value={form.target_name} onChange={e => setForm(f => ({ ...f, target_name: e.target.value }))}
              className="w-full h-10 rounded-md border border-input bg-background px-3 mt-1">
              <option value="">— Selecciona un limpiador —</option>
              {cleaners.length > 0 && (
                <optgroup label="Planta y casuales con cuenta">
                  {cleaners.filter(c => c.kind !== 'Casual (pipeline)').map(c => (
                    <option key={`u-${c.id}`} value={c.name}>{c.name} · {c.kind}</option>
                  ))}
                </optgroup>
              )}
              {cleaners.filter(c => c.kind === 'Casual (pipeline)').length > 0 && (
                <optgroup label="Casuales (pipeline)">
                  {cleaners.filter(c => c.kind === 'Casual (pipeline)').map(c => (
                    <option key={`c-${c.id}`} value={c.name}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {cleaners.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">Cargando limpiadores activos…</p>
            )}
          </div>
        )}
        {form.target === 'team' && (
          <div className="md:col-span-2">
            <Label>
              <span className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Equipo (asignaciones actuales)</span>
            </Label>
            <select value={form.target_name} onChange={e => setForm(f => ({ ...f, target_name: e.target.value }))}
              className="w-full h-10 rounded-md border border-input bg-background px-3 mt-1">
              <option value="">— Selecciona un equipo —</option>
              {teams.map(t => (
                <option key={t.id} value={t.name}>{t.name} · {t.date}{t.members.length ? ` (${t.members.join(', ')})` : ''}</option>
              ))}
            </select>
            {teams.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">No hay equipos asignados para hoy o fechas futuras.</p>
            )}
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
          {form.type === 'office' && (
            <p className="text-xs text-blue-600 mt-1.5">
              Los avisos de oficina se muestran siempre en el tablero (no rotan). Déjalo sin fecha de vigencia para que sea permanente.
            </p>
          )}
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