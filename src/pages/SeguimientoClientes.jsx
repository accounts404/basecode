import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Activity, Users, AlertCircle, Search, Phone, MessageSquare,
  CheckCircle, X, XCircle, Mail, Eye, Plus,
} from 'lucide-react';
import { differenceInDays, parseISO, format } from 'date-fns';
import { es } from 'date-fns/locale';
import ExportCSV from '@/components/seguimiento/ExportCSV';
import LogContactModal from '@/components/seguimiento/LogContactModal';
import ContactDetailModal from '@/components/seguimiento/ContactDetailModal';

const FOLLOWUP_THRESHOLD_DAYS = 90;

const CLIENT_TYPE_LABELS = {
  domestic: 'Doméstico', commercial: 'Comercial', training: 'Entrenamiento',
  ndis_client: 'NDIS', dva_client: 'DVA', age_care_client: 'Age Care', work_cover_client: 'Work Cover',
};

const interactionLabels = {
  visit: { label: 'Visita', icon: Eye, color: 'bg-blue-100 text-blue-800' },
  call: { label: 'Llamada', icon: Phone, color: 'bg-green-100 text-green-800' },
  message: { label: 'Mensaje', icon: MessageSquare, color: 'bg-purple-100 text-purple-800' },
  email: { label: 'Email', icon: Mail, color: 'bg-amber-100 text-amber-800' },
  other: { label: 'Otro', icon: Activity, color: 'bg-slate-100 text-slate-700' },
};

const frequencyLabels = {
  weekly: 'Semanal', fortnightly: 'Quincenal', every_3_weeks: 'Cada 3 sem.',
  monthly: 'Mensual', one_off: 'Único',
};

const DAY_FILTER_OPTIONS = [
  { label: 'Todos', value: 'all' },
  { label: '+30 días', value: '30' },
  { label: '+60 días', value: '60' },
  { label: '+90 días', value: '90' },
  { label: 'Sin contacto', value: 'never' },
];

export default function SeguimientoClientesPage() {
  const [clients, setClients] = useState([]);
  const [logs, setLogs] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterDays, setFilterDays] = useState('all');

  // Modals
  const [logModalClient, setLogModalClient] = useState(null);
  const [detailClient, setDetailClient] = useState(null);
  const [noReplyConfirm, setNoReplyConfirm] = useState(null);
  const [replyModal, setReplyModal] = useState(null);
  const [replyForm, setReplyForm] = useState({ reply_date: format(new Date(), 'yyyy-MM-dd'), reply_comments: '' });
  const [savingReply, setSavingReply] = useState(false);

  const [activeTab, setActiveTab] = useState('needs-followup');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [clientsData, logsData, usersData] = await Promise.all([
      base44.entities.Client.list('-created_date', 5000),
      base44.entities.FollowUpLog.list('-interaction_date', 5000),
      base44.entities.User.list(),
    ]);
    setClients(Array.isArray(clientsData) ? clientsData : []);
    setLogs(Array.isArray(logsData) ? logsData : []);
    setAdminUsers(Array.isArray(usersData) ? usersData.filter(u => u.role === 'admin') : []);
    setLoading(false);
  };

  const activeClients = useMemo(() => clients.filter(c => c.active !== false), [clients]);

  const getLastContactDays = (client) => {
    const clientLogs = logs.filter(l => l.client_id === client.id);
    const lastLog = clientLogs[0];
    if (!lastLog?.interaction_date) return null;
    return differenceInDays(new Date(), parseISO(lastLog.interaction_date));
  };

  const needsFollowUp = (client) => {
    const days = getLastContactDays(client);
    if (days === null) return true;
    return days > FOLLOWUP_THRESHOLD_DAYS;
  };

  const filteredClients = useMemo(() => {
    return activeClients.filter(c => {
      const matchesSearch = !searchTerm.trim() || (
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.mobile_number?.includes(searchTerm)
      );
      const matchesType = filterType === 'all' || c.client_type === filterType;
      let matchesDays = true;
      if (filterDays !== 'all') {
        const days = getLastContactDays(c);
        if (filterDays === 'never') matchesDays = days === null;
        else matchesDays = days === null || days > parseInt(filterDays);
      }
      return matchesSearch && matchesType && matchesDays;
    });
  }, [activeClients, searchTerm, filterType, filterDays, logs]);

  const clientsNeedingFollowUp = useMemo(() => filteredClients.filter(needsFollowUp), [filteredClients, logs]);
  const clientsOk = useMemo(() => filteredClients.filter(c => !needsFollowUp(c)), [filteredClients, logs]);
  const pendingReplies = useMemo(() => logs.filter(l => !l.replied && (l.interaction_type === 'message' || l.interaction_type === 'email')), [logs]);

  const getClientLogs = (clientId) => logs.filter(l => l.client_id === clientId);

  // Reply
  const handleSaveReply = async () => {
    if (!replyModal) return;
    setSavingReply(true);
    await base44.entities.FollowUpLog.update(replyModal.id, {
      replied: true,
      reply_date: replyForm.reply_date,
      reply_comments: replyForm.reply_comments,
    });
    setReplyModal(null);
    setReplyForm({ reply_date: format(new Date(), 'yyyy-MM-dd'), reply_comments: '' });
    setSavingReply(false);
    await loadData();
  };

  const handleNoReply = async () => {
    if (!noReplyConfirm) return;
    await base44.entities.FollowUpLog.update(noReplyConfirm.id, {
      replied: true,
      reply_date: format(new Date(), 'yyyy-MM-dd'),
      reply_comments: 'Cerrado por admin – sin respuesta.',
    });
    setNoReplyConfirm(null);
    await loadData();
  };

  const openReply = (log) => {
    setReplyModal(log);
    setReplyForm({ reply_date: format(new Date(), 'yyyy-MM-dd'), reply_comments: '' });
  };

  // ── ClientRow ──
  const ClientRow = ({ client }) => {
    const days = getLastContactDays(client);
    const urgent = days === null || days > FOLLOWUP_THRESHOLD_DAYS;
    const lastLog = getClientLogs(client.id)[0];

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
                {lastLog.assigned_to && ` · ${lastLog.assigned_to}`}
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
            <Eye className="w-3 h-3 mr-1" /> Ver
          </Button>
          <Button size="sm" onClick={() => setLogModalClient(client)} className="h-7 text-xs bg-blue-600 hover:bg-blue-700">
            <Plus className="w-3 h-3 mr-1" /> Contacto
          </Button>
        </div>
      </div>
    );
  };

  // ── TimelineItem (igual que ContactDetailModal) ──
  const TimelineItem = ({ log }) => {
    const config = interactionLabels[log.interaction_type] || interactionLabels.other;
    const Icon = config.icon;
    const pendingReply = (log.interaction_type === 'message' || log.interaction_type === 'email') && !log.replied;

    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${config.color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="w-0.5 bg-slate-200 flex-1 mt-1 min-h-[16px]" />
        </div>
        <div className="flex-1 pb-4">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge className={`text-xs ${config.color}`}>{config.label}</Badge>
            <span className="text-xs text-slate-400">
              {format(parseISO(log.interaction_date), "d 'de' MMMM yyyy", { locale: es })}
            </span>
            {log.logged_by && <span className="text-xs text-slate-400">· por {log.logged_by}</span>}
          </div>
          {log.comments && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 mb-2 border border-slate-100">
              {log.comments}
            </div>
          )}
          {log.conversation_text && (
            <div className="mb-2 space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Conversación</p>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">
                {log.conversation_text}
              </div>
            </div>
          )}
          {log.visit_photos?.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Fotos</p>
              <div className="flex gap-2 flex-wrap">
                {log.visit_photos.map((photo, i) => (
                  <a key={i} href={photo.url} target="_blank" rel="noopener noreferrer">
                    <img src={photo.url} alt={photo.comment || `Foto ${i + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border border-slate-200 hover:opacity-80 transition-opacity" />
                    {photo.comment && <p className="text-xs text-slate-500 mt-0.5 w-20 truncate">{photo.comment}</p>}
                  </a>
                ))}
              </div>
            </div>
          )}
          {log.replied && log.reply_comments && (
            <div className="bg-green-50 border border-green-100 rounded-lg p-3 mb-2">
              <p className="text-xs font-semibold text-green-700 mb-1">↩ Respuesta del cliente</p>
              <p className="text-sm text-green-800 whitespace-pre-wrap">{log.reply_comments}</p>
              {log.reply_date && (
                <p className="text-xs text-green-500 mt-1">
                  {format(parseISO(log.reply_date), "d 'de' MMMM yyyy", { locale: es })}
                </p>
              )}
            </div>
          )}
          {log.replied && !log.reply_comments && (
            <p className="text-xs text-slate-400 italic">✓ Cerrado sin respuesta</p>
          )}
          {pendingReply && (
            <div className="flex gap-2 mt-1">
              <Button size="sm" variant="outline" className="h-6 text-xs text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => openReply(log)}>
                <CheckCircle className="w-3 h-3 mr-1" /> Respondió
              </Button>
              <Button size="sm" variant="outline" className="h-6 text-xs text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setNoReplyConfirm(log)}>
                <XCircle className="w-3 h-3 mr-1" /> Sin respuesta
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── ClientHistoryRow: agrupado por cliente con acordeón ──
  const [expandedClients, setExpandedClients] = useState({});
  const toggleExpand = (clientId) => setExpandedClients(prev => ({ ...prev, [clientId]: !prev[clientId] }));

  const clientsWithLogs = useMemo(() => {
    const grouped = {};
    logs.forEach(log => {
      if (!grouped[log.client_id]) grouped[log.client_id] = [];
      grouped[log.client_id].push(log);
    });
    return Object.entries(grouped).map(([clientId, clientLogs]) => {
      const client = clients.find(c => c.id === clientId);
      return { clientId, clientName: clientLogs[0].client_name, client, logs: clientLogs };
    }).sort((a, b) => (a.clientName || '').localeCompare(b.clientName || ''));
  }, [logs, clients]);

  const ClientHistoryRow = ({ clientId, clientName, client, logs: clientLogs }) => {
    const isOpen = !!expandedClients[clientId];
    const lastLog = clientLogs[0];
    const config = interactionLabels[lastLog?.interaction_type] || interactionLabels.other;
    const pendingCount = clientLogs.filter(l => !l.replied && (l.interaction_type === 'message' || l.interaction_type === 'email')).length;

    return (
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        {/* Header del cliente */}
        <button
          className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
          onClick={() => toggleExpand(clientId)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {clientName?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 text-sm">{clientName}</p>
              <p className="text-xs text-slate-400">
                {clientLogs.length} contacto{clientLogs.length !== 1 ? 's' : ''} · último: {format(parseISO(lastLog.interaction_date), "d MMM yyyy", { locale: es })} · {config.label}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            {pendingCount > 0 && (
              <Badge className="bg-purple-100 text-purple-700 text-xs">{pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}</Badge>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={(e) => { e.stopPropagation(); client && setLogModalClient(client); }}>
              <Plus className="w-3 h-3 mr-1" /> Contacto
            </Button>
            <span className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
          </div>
        </button>

        {/* Timeline expandible */}
        {isOpen && (
          <div className="px-6 pt-2 pb-4 border-t border-slate-100 bg-slate-50/40">
            <div className="mt-3">
              {clientLogs.map(log => <TimelineItem key={log.id} log={log} />)}
            </div>
          </div>
        )}
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
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <Activity className="w-8 h-8 text-blue-600" />
              Seguimiento de Clientes
            </h1>
            <p className="text-slate-500 mt-1">Registra y monitorea el contacto con clientes activos</p>
          </div>
          <ExportCSV clients={filteredClients} logs={logs} />
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
              <div><p className="text-2xl font-bold text-green-700">{clientsOk.length}</p><p className="text-xs text-slate-500">Al día (90 días)</p></div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><MessageSquare className="w-5 h-5 text-purple-600" /></div>
              <div><p className="text-2xl font-bold text-slate-900">{pendingReplies.length}</p><p className="text-xs text-slate-500">Esperando respuesta</p></div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Buscar cliente..."
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
            <SelectTrigger className="h-11 bg-white w-[180px]">
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
          <Select value={filterDays} onValueChange={setFilterDays}>
            <SelectTrigger className="h-11 bg-white w-[160px]">
              <SelectValue placeholder="Días sin contacto" />
            </SelectTrigger>
            <SelectContent>
              {DAY_FILTER_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="needs-followup">
              ⚠️ Necesitan Contacto
              {clientsNeedingFollowUp.length > 0 && (
                <Badge className="ml-2 bg-red-500 text-white text-xs px-1.5">{clientsNeedingFollowUp.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all-clients">👥 Todos los Clientes</TabsTrigger>
            <TabsTrigger value="history">
              📋 Historial
              {pendingReplies.length > 0 && (
                <Badge className="ml-2 bg-purple-500 text-white text-xs px-1.5">{pendingReplies.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="needs-followup" className="space-y-3 mt-4">
            <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              ⚠️ Clientes sin contacto registrado en los últimos <strong>90 días</strong> o nunca contactados.
            </p>
            {clientsNeedingFollowUp.length === 0 ? (
              <Card><CardContent className="py-12 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">¡Todo al día! Todos contactados en los últimos 3 meses.</p>
              </CardContent></Card>
            ) : (
              clientsNeedingFollowUp.map(client => <ClientRow key={client.id} client={client} />)
            )}
          </TabsContent>

          <TabsContent value="all-clients" className="space-y-3 mt-4">
            {filteredClients.length === 0 ? (
              <Card><CardContent className="py-12 text-center">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No se encontraron clientes.</p>
              </CardContent></Card>
            ) : (
              filteredClients.map(client => <ClientRow key={client.id} client={client} />)
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3 mt-4">
            {clientsWithLogs.length === 0 ? (
              <Card><CardContent className="py-12 text-center">
                <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No hay contactos registrados todavía.</p>
              </CardContent></Card>
            ) : (
              clientsWithLogs.map(({ clientId, clientName, client, logs: clientLogs }) => (
                <ClientHistoryRow key={clientId} clientId={clientId} clientName={clientName} client={client} logs={clientLogs} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal: Registrar contacto */}
      <LogContactModal
        client={logModalClient}
        adminUsers={adminUsers}
        onClose={() => setLogModalClient(null)}
        onSaved={async () => { setLogModalClient(null); await loadData(); }}
      />

      {/* Modal: Detalle / Timeline */}
      <ContactDetailModal
        client={detailClient}
        logs={logs}
        onClose={() => setDetailClient(null)}
        onNewContact={(client) => setLogModalClient(client)}
        onReply={openReply}
        onNoReply={setNoReplyConfirm}
      />

      {/* Modal: Registrar respuesta */}
      <Dialog open={!!replyModal} onOpenChange={(o) => !o && setReplyModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Respuesta</DialogTitle>
            <DialogDescription>{replyModal?.client_name}</DialogDescription>
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
            <Button onClick={handleSaveReply} disabled={savingReply} className="bg-green-600 hover:bg-green-700">
              {savingReply ? 'Guardando...' : 'Guardar Respuesta'}
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
  );
}