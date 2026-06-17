import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { sendBulkCasualSMS } from '@/functions/sendBulkCasualSMS';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Users, Phone, Mail, MapPin, Plus, Search, Send, MessageCircle,
  CheckCircle, XCircle, Clock, Loader2, Edit, Trash2,
  Filter, ChevronDown, ChevronUp, History, UserCheck, UserX,
  Facebook, MessageSquare, Tag, Car, FileText, Award, IdCard
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_CONFIG = {
  nuevo: { label: 'Nuevo', color: 'bg-blue-100 text-blue-800', icon: <Users className="w-3 h-3" /> },
  contactado: { label: 'Contactado', color: 'bg-yellow-100 text-yellow-800', icon: <MessageCircle className="w-3 h-3" /> },
  trial_pendiente: { label: 'Trial Pendiente', color: 'bg-purple-100 text-purple-800', icon: <Clock className="w-3 h-3" /> },
  trial_realizado: { label: 'Trial Realizado', color: 'bg-orange-100 text-orange-800', icon: <Award className="w-3 h-3" /> },
  activo: { label: 'Activo', color: 'bg-green-100 text-green-800', icon: <UserCheck className="w-3 h-3" /> },
  descartado: { label: 'Descartado', color: 'bg-red-100 text-red-800', icon: <UserX className="w-3 h-3" /> },
};

const SOURCE_CONFIG = {
  facebook: { label: 'Facebook', icon: <Facebook className="w-3 h-3" /> },
  whatsapp_group: { label: 'Grupo WhatsApp', icon: <MessageSquare className="w-3 h-3" /> },
  referral: { label: 'Referido', icon: <Users className="w-3 h-3" /> },
  gumtree: { label: 'Gumtree', icon: <FileText className="w-3 h-3" /> },
  seek: { label: 'Seek', icon: <Search className="w-3 h-3" /> },
  other: { label: 'Otro', icon: <Tag className="w-3 h-3" /> },
};

const AVAILABILITY_OPTIONS = [
  { value: 'mananas', label: 'Mañanas' },
  { value: 'tardes', label: 'Tardes' },
  { value: 'full_time', label: 'Tiempo Completo' },
  { value: 'fines_de_semana', label: 'Fines de Semana' },
  { value: 'flexible', label: 'Flexible' },
  { value: 'no_disponible', label: 'No Disponible' },
];

const ENGLISH_OPTIONS = [
  { value: 'basico', label: 'Básico' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
  { value: 'nativo', label: 'Nativo' },
];

const VISA_OPTIONS = [
  { value: '', label: '— Sin especificar —' },
  { value: 'australian_citizen', label: 'Australian Citizen' },
  { value: 'permanent_resident', label: 'Permanent Resident' },
  { value: 'student_visa', label: 'Student Visa' },
  { value: 'working_holiday', label: 'Working Holiday' },
  { value: 'temp_skill_shortage', label: 'Temp. Skill Shortage' },
  { value: 'partner_visa', label: 'Partner Visa' },
  { value: 'other_visa', label: 'Other Visa' },
];

const EMPTY_FORM = {
  full_name: '', phone_number: '', email: '', address: '', suburb: '',
  source: 'facebook', source_detail: '', status: 'nuevo', availability: 'flexible',
  availability_notes: '', trial_date: '', trial_conducted_by: '', trial_notes: '',
  has_car: false, has_drivers_license: false, has_abn: false, visa_type: '', english_level: 'intermedio', general_notes: '', tags: [],
};

export default function CasualesPage() {
  const [casuals, setCasuals] = useState([]);
  const [messages, setMessages] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingCasual, setEditingCasual] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // SMS state
  const [showSMS, setShowSMS] = useState(false);
  const [smsMessage, setSmsMessage] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsResult, setSmsResult] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Conversation modal
  const [conversationCasual, setConversationCasual] = useState(null);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [manualNote, setManualNote] = useState('');

  // Delete confirm
  const [deleteId, setDeleteId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [casualsData, messagesData] = await Promise.all([
        base44.entities.CasualCleaner.list('-updated_date', 500),
        base44.entities.CasualMessage.list('-created_date', 2000),
      ]);
      setCasuals(Array.isArray(casualsData) ? casualsData : []);
      const msgMap = {};
      (Array.isArray(messagesData) ? messagesData : []).forEach(m => {
        if (!msgMap[m.casual_cleaner_id]) msgMap[m.casual_cleaner_id] = [];
        msgMap[m.casual_cleaner_id].push(m);
      });
      setMessages(msgMap);
    } catch (e) {
      console.error('Error cargando casuales:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filters ────────────────────────────────────────────────────────────────

  const filteredCasuals = useMemo(() => {
    let list = casuals;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.full_name?.toLowerCase().includes(q) ||
        c.phone_number?.includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.suburb?.toLowerCase().includes(q) ||
        (c.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);
    if (sourceFilter !== 'all') list = list.filter(c => c.source === sourceFilter);
    return list;
  }, [casuals, search, statusFilter, sourceFilter]);

  const stats = useMemo(() => ({
    total: casuals.length,
    activos: casuals.filter(c => c.status === 'activo').length,
    nuevos: casuals.filter(c => c.status === 'nuevo').length,
    trialPendiente: casuals.filter(c => c.status === 'trial_pendiente').length,
    descartados: casuals.filter(c => c.status === 'descartado').length,
  }), [casuals]);

  // ── Form handlers ──────────────────────────────────────────────────────────

  const openNewForm = () => {
    setEditingCasual(null);
    setForm(EMPTY_FORM);
    setTagInput('');
    setShowForm(true);
  };

  const openEditForm = (casual) => {
    setEditingCasual(casual);
    setForm({
      full_name: casual.full_name || '',
      phone_number: casual.phone_number || '',
      email: casual.email || '',
      address: casual.address || '',
      suburb: casual.suburb || '',
      source: casual.source || 'facebook',
      source_detail: casual.source_detail || '',
      status: casual.status || 'nuevo',
      availability: casual.availability || 'flexible',
      availability_notes: casual.availability_notes || '',
      trial_date: casual.trial_date || '',
      trial_conducted_by: casual.trial_conducted_by || '',
      trial_notes: casual.trial_notes || '',
      has_car: casual.has_car || false,
      has_drivers_license: casual.has_drivers_license || false,
      has_abn: casual.has_abn || false,
      visa_type: casual.visa_type || '',
      english_level: casual.english_level || 'intermedio',
      general_notes: casual.general_notes || '',
      tags: casual.tags || [],
    });
    setTagInput('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.phone_number.trim()) return;
    setFormLoading(true);
    try {
      const data = {
        full_name: form.full_name.trim(),
        phone_number: form.phone_number.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        suburb: form.suburb.trim() || null,
        source: form.source,
        source_detail: form.source_detail.trim() || null,
        status: form.status,
        availability: form.availability,
        availability_notes: form.availability_notes.trim() || null,
        trial_date: form.trial_date || null,
        trial_conducted_by: form.trial_conducted_by.trim() || null,
        trial_notes: form.trial_notes.trim() || null,
        has_car: form.has_car,
        has_drivers_license: form.has_drivers_license,
        has_abn: form.has_abn,
        visa_type: form.visa_type || null,
        english_level: form.english_level,
        general_notes: form.general_notes.trim() || null,
        tags: form.tags,
      };

      if (editingCasual) {
        await base44.entities.CasualCleaner.update(editingCasual.id, data);
      } else {
        await base44.entities.CasualCleaner.create(data);
      }
      setShowForm(false);
      loadData();
    } catch (e) {
      console.error('Error guardando:', e);
    }
    setFormLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await base44.entities.CasualCleaner.delete(deleteId);
      setDeleteId(null);
      loadData();
    } catch (e) {
      console.error('Error eliminando:', e);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !form.tags.includes(tag)) {
      setForm(f => ({ ...f, tags: [...f.tags, tag] }));
    }
    setTagInput('');
  };

  const removeTag = (tag) => {
    setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));
  };

  // ── SMS handlers ───────────────────────────────────────────────────────────

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCasuals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCasuals.map(c => c.id)));
    }
  };

  const handleSendSMS = async () => {
    if (!smsMessage.trim() || selectedIds.size === 0) return;
    setSmsLoading(true);
    setSmsResult(null);
    try {
      const res = await sendBulkCasualSMS({
        casual_ids: [...selectedIds],
        message: smsMessage.trim(),
      });
      setSmsResult(res.data);
      loadData();
    } catch (e) {
      setSmsResult({ error: e.message || 'Error al enviar SMS' });
    }
    setSmsLoading(false);
  };

  // ── Conversation handlers ──────────────────────────────────────────────────

  const openConversation = async (casual) => {
    setConversationCasual(casual);
    setConversationLoading(true);
    setManualNote('');
    try {
      const msgs = await base44.entities.CasualMessage.filter(
        { casual_cleaner_id: casual.id },
        'created_date',
        100
      );
      setMessages(prev => ({ ...prev, [casual.id]: msgs }));
    } catch (e) {
      console.error('Error cargando mensajes:', e);
    }
    setConversationLoading(false);
  };

  const addManualNote = async () => {
    if (!manualNote.trim() || !conversationCasual) return;
    try {
      await base44.entities.CasualMessage.create({
        casual_cleaner_id: conversationCasual.id,
        casual_cleaner_name: conversationCasual.full_name,
        direction: 'incoming',
        content: manualNote.trim(),
        status: 'received',
      });
      setManualNote('');
      // Reload messages
      const msgs = await base44.entities.CasualMessage.filter(
        { casual_cleaner_id: conversationCasual.id },
        'created_date',
        100
      );
      setMessages(prev => ({ ...prev, [conversationCasual.id]: msgs }));
    } catch (e) {
      console.error('Error agregando nota:', e);
    }
  };

  // ── Quick status update ────────────────────────────────────────────────────

  const quickUpdateStatus = async (casualId, newStatus) => {
    try {
      await base44.entities.CasualCleaner.update(casualId, { status: newStatus });
      loadData();
    } catch (e) {
      console.error('Error actualizando estado:', e);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg">
            <Users className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Directorio de Casuales</h1>
            <p className="text-slate-500 text-sm">Gestiona y contacta limpiadores casuales</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={openNewForm} className="bg-violet-600 hover:bg-violet-700">
            <Plus className="w-4 h-4 mr-2" />Agregar Casual
          </Button>
          <Button
            variant="outline"
            onClick={() => { setShowSMS(true); setSmsResult(null); }}
            disabled={selectedIds.size === 0}
          >
            <Send className="w-4 h-4 mr-2" />
            Enviar SMS ({selectedIds.size})
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'slate' },
          { label: 'Nuevos', value: stats.nuevos, color: 'blue' },
          { label: 'Trial Pend.', value: stats.trialPendiente, color: 'purple' },
          { label: 'Activos', value: stats.activos, color: 'green' },
          { label: 'Descartados', value: stats.descartados, color: 'red' },
        ].map(s => (
          <Card key={s.label} className={`border-${s.color}-200`}>
            <CardContent className="p-4 text-center">
              <p className={`text-3xl font-bold text-${s.color}-700`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por nombre, teléfono, email, suburbio..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Fuente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las fuentes</SelectItem>
            {Object.entries(SOURCE_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredCasuals.length && filteredCasuals.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300"
                  />
                </TableHead>
                <TableHead className="font-bold text-slate-700">Nombre</TableHead>
                <TableHead className="font-bold text-slate-700">Contacto</TableHead>
                <TableHead className="font-bold text-slate-700">Ubicación</TableHead>
                <TableHead className="font-bold text-slate-700">Fuente</TableHead>
                <TableHead className="font-bold text-slate-700">Estado</TableHead>
                <TableHead className="font-bold text-slate-700">Disp.</TableHead>
                <TableHead className="font-bold text-slate-700">Docs / Visa</TableHead>
                <TableHead className="font-bold text-slate-700 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCasuals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-slate-400">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-25" />
                    <p>No se encontraron casuales</p>
                  </TableCell>
                </TableRow>
              ) : filteredCasuals.map(casual => {
                const config = STATUS_CONFIG[casual.status] || STATUS_CONFIG.nuevo;
                const src = SOURCE_CONFIG[casual.source] || SOURCE_CONFIG.other;
                const msgCount = (messages[casual.id] || []).length;
                const lastMsg = messages[casual.id]?.[0];
                return (
                  <TableRow key={casual.id} className="hover:bg-slate-50/50">
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(casual.id)}
                        onChange={() => toggleSelect(casual.id)}
                        className="rounded border-slate-300"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-900">{casual.full_name}</div>
                      {(casual.tags || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {casual.tags.map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        {casual.phone_number && (
                          <p className="flex items-center gap-1 text-slate-700">
                            <Phone className="w-3 h-3 text-slate-400" />{casual.phone_number}
                          </p>
                        )}
                        {casual.email && (
                          <p className="flex items-center gap-1 text-slate-600 text-xs">
                            <Mail className="w-3 h-3 text-slate-400" />{casual.email}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {casual.suburb || casual.address ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          {casual.suburb || casual.address}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-sm text-slate-600">
                        {src.icon}{src.label}
                      </span>
                      {casual.source_detail && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[120px]">{casual.source_detail}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="relative group">
                        <Badge className={`cursor-pointer ${config.color}`}>
                          {config.icon}
                          <span className="ml-1">{config.label}</span>
                          <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
                        </Badge>
                        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-1.5 hidden group-hover:block min-w-[160px]">
                          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                            <button
                              key={k}
                              onClick={() => quickUpdateStatus(casual.id, k)}
                              className={`w-full text-left px-3 py-1.5 rounded text-sm hover:bg-slate-50 flex items-center gap-2 ${k === casual.status ? 'font-bold' : ''}`}
                            >
                              <Badge className={v.color}>{v.label}</Badge>
                            </button>
                          ))}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-slate-100 text-slate-700 text-xs">
                        {AVAILABILITY_OPTIONS.find(o => o.value === casual.availability)?.label || casual.availability}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs">
                        {casual.has_drivers_license && <IdCard className="w-4 h-4 text-emerald-600" title="Tiene licencia" />}
                        {casual.has_car && <Car className="w-4 h-4 text-green-600" title="Tiene vehículo" />}
                        {casual.has_abn && <span className="font-bold text-blue-600" title="Tiene ABN">ABN</span>}
                        {casual.visa_type && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 max-w-[100px] truncate" title={VISA_OPTIONS.find(o => o.value === casual.visa_type)?.label}>
                            {VISA_OPTIONS.find(o => o.value === casual.visa_type)?.label || casual.visa_type}
                          </span>
                        )}
                        {!casual.has_drivers_license && !casual.has_car && !casual.has_abn && !casual.visa_type && <span className="text-xs text-slate-300">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {lastMsg && (
                          <span className="text-[10px] text-slate-400 mr-1" title={lastMsg.content}>
                            {format(new Date(lastMsg.created_date), 'd/M HH:mm')}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openConversation(casual)}
                          title="Ver conversación"
                        >
                          <MessageCircle className={`w-4 h-4 ${msgCount > 0 ? 'text-violet-600' : 'text-slate-400'}`} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForm(casual)}>
                          <Edit className="w-4 h-4 text-slate-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(casual.id)}>
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Form Modal ─────────────────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCasual ? 'Editar Casual' : 'Nuevo Casual'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre completo *</Label>
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Nombre y apellido" />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono *</Label>
              <Input value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} placeholder="+614XXXXXXXX" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="correo@ejemplo.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Dirección completa" />
            </div>
            <div className="space-y-1.5">
              <Label>Suburbio</Label>
              <Input value={form.suburb} onChange={e => setForm(f => ({ ...f, suburb: e.target.value }))} placeholder="Ej: Altona North" />
            </div>
            <div className="space-y-1.5">
              <Label>Fuente de contacto</Label>
              <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.icon}{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Detalle de fuente</Label>
              <Input value={form.source_detail} onChange={e => setForm(f => ({ ...f, source_detail: e.target.value }))} placeholder="Ej: Grupo Cleaning Jobs FB" />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Disponibilidad</Label>
              <Select value={form.availability} onValueChange={v => setForm(f => ({ ...f, availability: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notas de disponibilidad</Label>
              <Input value={form.availability_notes} onChange={e => setForm(f => ({ ...f, availability_notes: e.target.value }))} placeholder="Ej: Solo lunes y miércoles" />
            </div>
            <div className="space-y-1.5">
              <Label>Nivel de inglés</Label>
              <Select value={form.english_level} onValueChange={v => setForm(f => ({ ...f, english_level: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENGLISH_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.has_car} onCheckedChange={v => setForm(f => ({ ...f, has_car: v }))} />
                <Label>Tiene vehículo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.has_abn} onCheckedChange={v => setForm(f => ({ ...f, has_abn: v }))} />
                <Label>Tiene ABN</Label>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.has_drivers_license} onCheckedChange={v => setForm(f => ({ ...f, has_drivers_license: v }))} />
                <Label>Licencia de conducir</Label>
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Visa</Label>
              <Select value={form.visa_type} onValueChange={v => setForm(f => ({ ...f, visa_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo de visa..." /></SelectTrigger>
                <SelectContent>
                  {VISA_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Trial section */}
            <div className="md:col-span-2 border-t pt-4 mt-2">
              <h3 className="font-bold text-sm text-slate-700 mb-3">🧪 Trial</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Fecha del trial</Label>
                  <Input type="date" value={form.trial_date} onChange={e => setForm(f => ({ ...f, trial_date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Realizado por</Label>
                  <Input value={form.trial_conducted_by} onChange={e => setForm(f => ({ ...f, trial_conducted_by: e.target.value }))} placeholder="Nombre del supervisor" />
                </div>
                <div className="space-y-1.5 md:col-span-1" />
                <div className="space-y-1.5 md:col-span-3">
                  <Label>Notas del trial</Label>
                  <Textarea value={form.trial_notes} onChange={e => setForm(f => ({ ...f, trial_notes: e.target.value }))} placeholder="Resultados, desempeño, observaciones..." rows={2} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5 md:col-span-2">
              <Label>Notas generales</Label>
              <Textarea value={form.general_notes} onChange={e => setForm(f => ({ ...f, general_notes: e.target.value }))} placeholder="Cualquier otra información relevante..." rows={2} />
            </div>

            {/* Tags */}
            <div className="space-y-1.5 md:col-span-2">
              <Label>Etiquetas</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="Escribe y presiona Enter..."
                />
                <Button type="button" variant="outline" onClick={addTag}>Agregar</Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.tags.map(tag => (
                    <Badge key={tag} className="cursor-pointer bg-violet-100 text-violet-700 hover:bg-violet-200" onClick={() => removeTag(tag)}>
                      {tag} <XCircle className="w-3 h-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={formLoading || !form.full_name || !form.phone_number} className="bg-violet-600 hover:bg-violet-700">
              {formLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingCasual ? 'Guardar Cambios' : 'Crear Casual'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SMS Modal ──────────────────────────────────────────────────────── */}
      <Dialog open={showSMS} onOpenChange={setShowSMS}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-violet-600" />
              Enviar SMS Masivo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-violet-900">
                {selectedIds.size} destinatario{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
              </p>
              <div className="text-xs text-violet-700 mt-1 max-h-24 overflow-y-auto">
                {[...selectedIds].map(id => {
                  const c = casuals.find(x => x.id === id);
                  return c ? <span key={id} className="inline-block mr-2 mb-1">{c.full_name}</span> : null;
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Mensaje</Label>
              <Textarea
                value={smsMessage}
                onChange={e => setSmsMessage(e.target.value)}
                placeholder="Escribe el mensaje a enviar..."
                rows={4}
              />
              <p className="text-xs text-slate-400">{smsMessage.length} caracteres</p>
            </div>

            {smsResult && (
              <div className={`rounded-lg p-3 text-sm ${smsResult.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                {smsResult.error ? (
                  <p className="flex items-center gap-1"><XCircle className="w-4 h-4" />{smsResult.error}</p>
                ) : (
                  <div>
                    <p className="font-semibold flex items-center gap-1"><CheckCircle className="w-4 h-4" />SMS enviados</p>
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {(smsResult.results || []).map((r, i) => (
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
            <Button variant="outline" onClick={() => { setShowSMS(false); setSmsResult(null); }}>Cerrar</Button>
            <Button
              onClick={handleSendSMS}
              disabled={smsLoading || !smsMessage.trim() || selectedIds.size === 0}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {smsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Conversation Modal ─────────────────────────────────────────────── */}
      <Dialog open={!!conversationCasual} onOpenChange={() => setConversationCasual(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-violet-600" />
              Conversación: {conversationCasual?.full_name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px] max-h-[50vh] py-2">
            {conversationLoading ? (
              <div className="flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
            ) : (messages[conversationCasual?.id] || []).length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">Sin mensajes aún</p>
            ) : (
              [...(messages[conversationCasual?.id] || [])].reverse().map(msg => (
                <div key={msg.id} className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                    msg.direction === 'outgoing'
                      ? 'bg-violet-600 text-white rounded-br-md'
                      : 'bg-slate-100 text-slate-800 rounded-bl-md'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${msg.direction === 'outgoing' ? 'text-violet-200' : 'text-slate-400'}`}>
                      {format(new Date(msg.created_date), 'd MMM HH:mm', { locale: es })}
                      {msg.direction === 'incoming' && msg.twilio_sid && ' · SMS'}
                      {msg.direction === 'incoming' && !msg.twilio_sid && ' · Nota manual'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          {/* Manual note input */}
          <div className="border-t pt-3">
            <div className="flex gap-2">
              <Input
                value={manualNote}
                onChange={e => setManualNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addManualNote()}
                placeholder="Agregar nota manual..."
                className="flex-1"
              />
              <Button size="sm" onClick={addManualNote} disabled={!manualNote.trim()} className="bg-violet-600 hover:bg-violet-700">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Las respuestas SMS llegan automáticamente. Usa esto para notas manuales.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConversationCasual(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ─────────────────────────────────────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-700">¿Eliminar casual?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">Esta acción no se puede deshacer.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}