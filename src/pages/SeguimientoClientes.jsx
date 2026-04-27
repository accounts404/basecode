import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Activity, Users, AlertCircle, Search, Phone, MessageSquare,
  CheckCircle, Clock, Calendar, Plus, X, ChevronRight, XCircle, Mail, Eye
} from 'lucide-react';
import { differenceInDays, parseISO, format } from 'date-fns';
import { es } from 'date-fns/locale';

// Umbral fijo: sin contacto en los últimos 90 días (3 meses)
const FOLLOWUP_THRESHOLD_DAYS = 90;

const CLIENT_TYPE_LABELS = {
  domestic: 'Doméstico',
  commercial: 'Comercial',
  training: 'Entrenamiento',
  ndis_client: 'NDIS',
  dva_client: 'DVA',
  age_care_client: 'Age Care',
  work_cover_client: 'Work Cover',
};

const interactionLabels = {
  visit: { label: 'Visita', icon: Eye, color: 'bg-blue-100 text-blue-800' },
  call: { label: 'Llamada', icon: Phone, color: 'bg-green-100 text-green-800' },
  message: { label: 'Mensaje', icon: MessageSquare, color: 'bg-purple-100 text-purple-800' },
  email: { label: 'Email', icon: Mail, color: 'bg-amber-100 text-amber-800' },
  other: { label: 'Otro', icon: Activity, color: 'bg-slate-100 text-slate-700' },
};

const frequencyLabels = {
  weekly: 'Semanal',
  fortnightly: 'Quincenal',
  every_3_weeks: 'Cada 3 sem.',
  monthly: 'Mensual',
  one_off: 'Único',
};

export default function SeguimientoClientesPage() {
  const [clients, setClients] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Modal registrar interacción
  const [logModal, setLogModal] = useState(null); // { client }
  const [logForm, setLogForm] = useState({ interaction_type: 'call', interaction_date: format(new Date(), 'yyyy-MM-dd'), comments: '' });
  const [savingLog, setSavingLog] = useState(false);

  // Modal detalle de cliente
  const [detailClient, setDetailClient] = useState(null);

  // Modal registrar respuesta
  const [replyModal, setReplyModal] = useState(null); // { log }
  const [replyForm, setReplyForm] = useState({ reply_date: format(new Date(), 'yyyy-MM-dd'), reply_comments: '' });

  // Confirmación "sin respuesta"
  const [noReplyConfirm, setNoReplyConfirm] = useState(null); // log

  // Tab activo
  const [activeTab, setActiveTab] = useState('needs-followup');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [clientsData, logsData] = await Promise.all([
        base44.entities.Client.list('-created_date', 5000),
        base44.entities.FollowUpLog.list('-interaction_date', 5000),
      ]);
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setLogs(Array.isArray(logsData) ? logsData : []);
    } catch (err) {
      console.error('Error cargando datos:', err);
    }
    setLoading(false);
  };

  // Solo clientes activos
  const activeClients = useMemo(() => clients.filter(c => c.active !== false), [clients]);

  // Filtrar por búsqueda y tipo de cliente
  const filteredClients = useMemo(() => {
    return activeClients.filter(c => {
      const matchesSearch = !searchTerm.trim() || (
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.mobile_number?.includes(searchTerm)
      );
      const matchesType = filterType === 'all' || c.client_type === filterType;
      return matchesSearch && matchesType;
    });
  }, [activeClients, searchTerm, filterType]);

  // Calcular días desde el último contacto registrado
  const getLastContactDays = (client) => {
    const clientLogs = logs.filter(l => l.client_id === client.id);
    const lastLog = clientLogs[0]; // ordenados por -interaction_date
    if (!lastLog?.interaction_date) return null;
    return differenceInDays(new Date(), parseISO(lastLog.interaction_date));
  };

  // Necesita contacto = sin contacto en los últimos 90 días (o nunca contactado)
  const needsFollowUp = (client) => {
    const days = getLastContactDays(client);
    if (days === null) return true;
    return days > FOLLOWUP_THRESHOLD_DAYS;
  };

  const clientsNeedingFollowUp = useMemo(() => filteredClients.filter(needsFollowUp), [filteredClients, logs]);
  const clientsOk = useMemo(() => filteredClients.filter(c => !needsFollowUp(c)), [filteredClients, logs]);

  // ── Registrar interacción ──
  const handleSaveLog = async () => {
    if (!logModal?.client) return;
    setSavingLog(true);
    try {
      const user = await base44.auth.me();
      await base44.entities.FollowUpLog.create({
        client_id: logModal.client.id,
        client_name: logModal.client.name,
        interaction_type: logForm.interaction_type,
        interaction_date: logForm.interaction_date,
        comments: logForm.comments,
        logged_by: user?.email || 'admin',
        replied: false,
      });
      setLogModal(null);
      setLogForm({ interaction_type: 'call', interaction_date: format(new Date(), 'yyyy-MM-dd'), comments: '' });
      await loadData();
    } catch (err) {
      console.error(err);
    }
    setSavingLog(false);
  };

  // ── Registrar respuesta ──
  const handleSaveReply = async () => {
    if (!replyModal?.log) return;
    setSavingLog(true);
    try {
      await base44.entities.FollowUpLog.update(replyModal.log.id, {
        replied: true,
        reply_date: replyForm.reply_date,
        reply_comments: replyForm.reply_comments,
      });
      setReplyModal(null);
      setReplyForm({ reply_date: format(new Date(), 'yyyy-MM-dd'), reply_comments: '' });
      await loadData();
    } catch (err) {
      console.error(err);
    }
    setSavingLog(false);
  };

  // ── Cerrar sin respuesta ──
  const handleNoReply = async () => {
    if (!noReplyConfirm) return;
    try {
      await base44.entities.FollowUpLog.update(noReplyConfirm.id, {
        replied: true,
        reply_date: format(new Date(), 'yyyy-MM-dd'),
        reply_comments: 'Cerrado por admin – sin respuesta.',
      });
      setNoReplyConfirm(null);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const openLogModal = (client) => {
    setLogModal({ client });
    setLogForm({ interaction_type: 'call', interaction_date: format(new Date(), 'yyyy-MM-dd'), comments: '' });
  };

  const getClientLogs = (clientId) => logs.filter(l => l.client_id === clientId);

  // ── Renderizar fila de cliente ──
  const ClientRow = ({ client }) => {
    const days = getLastContactDays(client);
    const urgent = days === null || days > FOLLOWUP_THRESHOLD_DAYS;
    const clientLogs = getClientLogs(client.id);
    const lastLog = clientLogs[0];

    return (
      <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl hover:shadow-sm transition-shadow">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${urgent ? 'bg-red-500' : 'bg-green-500'}`}>
            {client.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm truncate">{client.name}</p>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
              {client.client_type && CLIENT_TYPE_LABELS[client.client_type] && (
                <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">{CLIENT_TYPE_LABELS[client.client_type]}</span>
              )}
              {client.service_frequency && (
                <span className="bg-slate-100 px-1.5 py-0.5 rounded">{frequencyLabels[client.service_frequency] || client.service_frequency}</span>
              )}
              {client.mobile_number && (
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.mobile_number}</span>
              )}
            </div>
            {lastLog && (
              <p className="text-xs text-slate-400 mt-0.5">
                Último contacto: {format(parseISO(lastLog.interaction_date), "d MMM yyyy", { locale: es })} · {interactionLabels[lastLog.interaction_type]?.label}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {days !== null ? (
            <Badge className={`text-xs ${urgent ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {days}d
            </Badge>
          ) : (
            <Badge className="text-xs bg-slate-200 text-slate-600">Sin contacto</Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => setDetailClient(client)} className="h-7 text-xs">
            <Eye className="w-3 h-3 mr-1" /> Detalle
          </Button>
          <Button size="sm" onClick={() => openLogModal(client)} className="h-7 text-xs bg-blue-600 hover:bg-blue-700">
            <Plus className="w-3 h-3 mr-1" /> Contacto
          </Button>
        </div>
      </div>
    );
  };

  // ── Renderizar log ──
  const LogRow = ({ log }) => {
    const config = interactionLabels[log.interaction_type] || interactionLabels.other;
    const Icon = config.icon;
    const pendingReply = (log.interaction_type === 'message' || log.interaction_type === 'email') && !log.replied;

    return (
      <div className="flex items-start gap-3 p-3 bg-white border border-slate-100 rounded-xl">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${config.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-semibold text-slate-800 text-sm">{log.client_name}</p>
            <div className="flex items-center gap-2">
              <Badge className={`text-xs ${config.color}`}>{config.label}</Badge>
              <span className="text-xs text-slate-400">{format(parseISO(log.interaction_date), "d MMM yyyy", { locale: es })}</span>
            </div>
          </div>
          {log.comments && <p className="text-xs text-slate-600 mt-1">{log.comments}</p>}
          {log.replied && log.reply_comments && (
            <div className="mt-1.5 bg-green-50 border border-green-100 rounded-lg px-2 py-1.5">
              <p className="text-xs text-green-700"><span className="font-semibold">Respuesta:</span> {log.reply_comments}</p>
              {log.reply_date && <p className="text-xs text-green-500 mt-0.5">{format(parseISO(log.reply_date), "d MMM yyyy", { locale: es })}</p>}
            </div>
          )}
          {pendingReply && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" className="h-6 text-xs text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => { setReplyModal({ log }); setReplyForm({ reply_date: format(new Date(), 'yyyy-MM-dd'), reply_comments: '' }); }}>
                <CheckCircle className="w-3 h-3 mr-1" /> Respondió
              </Button>
              <Button size="sm" variant="outline" className="h-6 text-xs text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setNoReplyConfirm(log)}>
                <XCircle className="w-3 h-3 mr-1" /> Sin respuesta
              </Button>
            </div>
          )}
          {log.replied && !log.reply_comments && (
            <p className="text-xs text-slate-400 mt-1">✓ Cerrado sin respuesta</p>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Cargando seguimiento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-600" />
            Seguimiento de Clientes
          </h1>
          <p className="text-slate-500 mt-1">Registra y monitorea el contacto con clientes activos</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-2xl font-bold text-slate-900">{activeClients.length}</p><p className="text-xs text-slate-500">Clientes activos</p></div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><AlertCircle className="w-5 h-5 text-red-600" /></div>
              <div><p className="text-2xl font-bold text-red-600">{clientsNeedingFollowUp.length}</p><p className="text-xs text-slate-500">Necesitan contacto</p></div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-2xl font-bold text-green-700">{clientsOk.length}</p><p className="text-xs text-slate-500">Al día</p></div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><MessageSquare className="w-5 h-5 text-purple-600" /></div>
              <div><p className="text-2xl font-bold text-slate-900">{logs.filter(l => !l.replied && (l.interaction_type === 'message' || l.interaction_type === 'email')).length}</p><p className="text-xs text-slate-500">Esperando respuesta</p></div>
            </CardContent>
          </Card>
        </div>

        {/* Buscador + Filtro tipo */}
        <div className="flex gap-3 flex-col sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Buscar cliente por nombre, dirección o teléfono..."
              className="pl-10 h-11 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <Button variant="ghost" size="sm" onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-11 bg-white w-full sm:w-[200px]">
              <SelectValue placeholder="Tipo de cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="domestic">Doméstico</SelectItem>
              <SelectItem value="commercial">Comercial</SelectItem>
              <SelectItem value="training">Entrenamiento</SelectItem>
              <SelectItem value="ndis_client">NDIS Client</SelectItem>
              <SelectItem value="dva_client">DVA Client</SelectItem>
              <SelectItem value="age_care_client">Age Care Client</SelectItem>
              <SelectItem value="work_cover_client">Work Cover Client</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="needs-followup" className="relative">
              ⚠️ Necesitan Contacto
              {clientsNeedingFollowUp.length > 0 && (
                <Badge className="ml-2 bg-red-500 text-white text-xs px-1.5">{clientsNeedingFollowUp.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all-clients">👥 Todos los Clientes</TabsTrigger>
            <TabsTrigger value="history">📋 Historial de Contactos</TabsTrigger>
          </TabsList>

          {/* Tab: Necesitan contacto */}
          <TabsContent value="needs-followup" className="space-y-3 mt-4">
            <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              ⚠️ Clientes sin contacto registrado en los últimos <strong>90 días</strong> (3 meses) o que nunca han sido contactados.
            </p>
            {clientsNeedingFollowUp.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="text-slate-600 font-medium">¡Todo al día! Todos los clientes han sido contactados en los últimos 3 meses.</p>
                </CardContent>
              </Card>
            ) : (
              clientsNeedingFollowUp.map(client => <ClientRow key={client.id} client={client} />)
            )}
          </TabsContent>

          {/* Tab: Todos los clientes */}
          <TabsContent value="all-clients" className="space-y-3 mt-4">
            {filteredClients.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No se encontraron clientes.</p>
                </CardContent>
              </Card>
            ) : (
              filteredClients.map(client => <ClientRow key={client.id} client={client} />)
            )}
          </TabsContent>

          {/* Tab: Historial */}
          <TabsContent value="history" className="space-y-3 mt-4">
            {logs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No hay contactos registrados todavía.</p>
                </CardContent>
              </Card>
            ) : (
              logs.map(log => <LogRow key={log.id} log={log} />)
            )}
          </TabsContent>
        </Tabs>

        {/* Modal: Registrar contacto */}
        <Dialog open={!!logModal} onOpenChange={(o) => !o && setLogModal(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Registrar Contacto</DialogTitle>
              <DialogDescription>
                {logModal?.client?.name} · {logModal?.client?.mobile_number}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Tipo de interacción</Label>
                <Select value={logForm.interaction_type} onValueChange={(v) => setLogForm(f => ({ ...f, interaction_type: v }))}>
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
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={logForm.interaction_date} onChange={(e) => setLogForm(f => ({ ...f, interaction_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Comentarios (opcional)</Label>
                <Textarea
                  placeholder="¿De qué hablaron? ¿Hubo algún problema o novedad?"
                  value={logForm.comments}
                  onChange={(e) => setLogForm(f => ({ ...f, comments: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLogModal(null)}>Cancelar</Button>
              <Button onClick={handleSaveLog} disabled={savingLog} className="bg-blue-600 hover:bg-blue-700">
                {savingLog ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Detalle de cliente */}
        <Dialog open={!!detailClient} onOpenChange={(o) => !o && setDetailClient(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  {detailClient?.name?.charAt(0).toUpperCase()}
                </div>
                {detailClient?.name}
              </DialogTitle>
              <DialogDescription>
                {detailClient?.address} · {frequencyLabels[detailClient?.service_frequency] || detailClient?.service_frequency}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {detailClient?.mobile_number && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="w-4 h-4 text-slate-400" /> {detailClient.mobile_number}
                  </div>
                )}
                {detailClient?.email && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="w-4 h-4 text-slate-400" /> {detailClient.email}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Historial de contactos</p>
                {getClientLogs(detailClient?.id).length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Sin contactos registrados.</p>
                ) : (
                  <div className="space-y-2">
                    {getClientLogs(detailClient?.id).map(log => <LogRow key={log.id} log={log} />)}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => { setDetailClient(null); openLogModal(detailClient); }} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-1" /> Registrar contacto
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Registrar respuesta */}
        <Dialog open={!!replyModal} onOpenChange={(o) => !o && setReplyModal(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Registrar Respuesta</DialogTitle>
              <DialogDescription>{replyModal?.log?.client_name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Fecha de respuesta</Label>
                <Input type="date" value={replyForm.reply_date} onChange={(e) => setReplyForm(f => ({ ...f, reply_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>¿Qué respondió el cliente?</Label>
                <Textarea
                  placeholder="Describe la respuesta del cliente..."
                  value={replyForm.reply_comments}
                  onChange={(e) => setReplyForm(f => ({ ...f, reply_comments: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReplyModal(null)}>Cancelar</Button>
              <Button onClick={handleSaveReply} disabled={savingLog} className="bg-green-600 hover:bg-green-700">
                {savingLog ? 'Guardando...' : 'Guardar Respuesta'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmación sin respuesta */}
        <AlertDialog open={!!noReplyConfirm} onOpenChange={(o) => !o && setNoReplyConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" /> ¿Sin respuesta?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Esto cerrará el seguimiento de <strong>{noReplyConfirm?.client_name}</strong> como "sin respuesta".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleNoReply} className="bg-red-600 hover:bg-red-700">Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}