import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { format, addDays, subDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { es } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Search, Filter, ChevronDown, ChevronUp, Calendar, User, Database, RefreshCw, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

const TZ = 'Australia/Melbourne';
const OWNER_EMAIL = 'accounts@redoakcleaning.com.au';

const ACTION_LABELS = {
  create: { label: 'Creado', color: 'bg-green-100 text-green-800' },
  update: { label: 'Modificado', color: 'bg-blue-100 text-blue-800' },
  delete: { label: 'Eliminado', color: 'bg-red-100 text-red-800' },
};

const MODULES = [
  { key: 'all', label: 'Todo', entities: null },
  { key: 'clientes', label: 'Clientes', entities: ['Client'] },
  { key: 'horario', label: 'Horario', entities: ['Schedule'] },
  { key: 'limpiadores', label: 'Limpiadores', entities: ['User'] },
  { key: 'facturas', label: 'Facturas', entities: ['Invoice', 'WorkEntry'] },
  { key: 'conciliacion', label: 'Conciliación', entities: ['Reconciliation', 'DailyReconciliation'] },
  { key: 'rentabilidad', label: 'Rentabilidad', entities: ['FixedCost', 'PricingThreshold', 'ServiceRate', 'ClientPriceReviewList'] },
  { key: 'flota', label: 'Flota', entities: ['Vehicle', 'VehicleKeyRecord', 'VehicleChecklistRecord'] },
  { key: 'llaves', label: 'Llaves', entities: ['KeyRecord'] },
  { key: 'casuales', label: 'Casuales', entities: ['CasualCleaner', 'CasualMessage'] },
  { key: 'cotizaciones', label: 'Cotizaciones', entities: ['Quote'] },
  { key: 'puntuacion', label: 'Puntuación', entities: ['MonthlyCleanerScore', 'ScoreAdjustment', 'PunctualityRecord', 'PerformanceReview', 'ClientFeedback'] },
  { key: 'tareas', label: 'Tareas', entities: ['Task'] },
  { key: 'otros', label: 'Otros', entities: null, isOther: true },
];

const KNOWN_ENTITIES = MODULES.flatMap(m => m.entities || []).filter(Boolean);

const ENTITY_LABELS = {
  Client: 'Cliente', Schedule: 'Horario/Servicio', Vehicle: 'Vehículo',
  VehicleKeyRecord: 'Llave Vehículo', VehicleChecklistRecord: 'Checklist Vehículo',
  KeyRecord: 'Llave Cliente', User: 'Limpiador/Usuario', Invoice: 'Factura',
  WorkEntry: 'Entrada de Trabajo', CasualCleaner: 'Casual', CasualMessage: 'Mensaje Casual',
  Quote: 'Cotización', Task: 'Tarea', MonthlyCleanerScore: 'Puntuación Mensual',
  ScoreAdjustment: 'Ajuste de Score', PunctualityRecord: 'Puntualidad',
  PerformanceReview: 'Evaluación', ClientFeedback: 'Feedback Cliente',
  Reconciliation: 'Conciliación', DailyReconciliation: 'Conciliación Diaria',
  FixedCost: 'Costo Fijo', PricingThreshold: 'Umbral de Precio',
  ServiceRate: 'Tarifa de Servicio', ClientPriceReviewList: 'Revisión de Precios',
};

function toMelbourneDate(isoString) {
  if (!isoString) return null;
  return formatInTimeZone(new Date(isoString), TZ, 'yyyy-MM-dd');
}

function toMelbourneTime(isoString) {
  if (!isoString) return '—';
  return formatInTimeZone(new Date(isoString), TZ, 'HH:mm');
}

function getTodayMelbourne() {
  return formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
}

function toMelbourneDateLabel(dateStr) {
  const today = getTodayMelbourne();
  const yesterday = formatInTimeZone(subDays(new Date(), 1), TZ, 'yyyy-MM-dd');
  if (dateStr === today) return 'Hoy';
  if (dateStr === yesterday) return 'Ayer';
  const [y, m, d] = dateStr.split('-').map(Number);
  return format(new Date(y, m - 1, d), "EEEE d 'de' MMMM yyyy", { locale: es });
}

function AuditCard({ log }) {
  const [expanded, setExpanded] = useState(false);
  const action = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-gray-100 text-gray-800' };
  const entityLabel = ENTITY_LABELS[log.entity_type] || log.entity_type;
  const ts = toMelbourneTime(log.timestamp);
  const isSystemAction = log.user_id?.startsWith('service_') || (!log.user_id && !log.user_email);
  const displayUser = isSystemAction
    ? 'Sistema (automático)'
    : (log.user_name && log.user_name !== 'Desconocido' && log.user_name !== 'Admin')
      ? log.user_name
      : log.user_email || log.user_name || 'Desconocido';
  const initials = isSystemAction ? '⚙' : displayUser.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden text-sm">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${isSystemAction ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-600'}`}>
          {isSystemAction ? '⚙' : (initials || <User className="w-3.5 h-3.5" />)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-semibold text-sm ${isSystemAction ? 'text-slate-400 italic' : 'text-slate-800'}`}>{displayUser}</span>
            <Badge className={`${action.color} text-xs`}>{action.label}</Badge>
            <Badge variant="outline" className="text-slate-600 text-xs">{entityLabel}</Badge>
            {log.entity_name && <span className="text-slate-600 truncate">— {log.entity_name}</span>}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-0.5">
            {log.user_email && log.user_name && log.user_name !== log.user_email && <span>{log.user_email}</span>}
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{ts} (Melbourne)</span>
            {log.changed_fields?.length > 0 && (
              <span className="flex items-center gap-1"><Database className="w-3 h-3" />{log.changed_fields.length} campo{log.changed_fields.length > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
        {log.changes_detail?.length > 0 && (
          <div className="text-slate-400 flex-shrink-0">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        )}
      </div>
      {expanded && log.changes_detail?.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 space-y-2">
          {log.changes_detail.map((change, i) => (
            <div key={i} className="text-xs bg-white border border-slate-200 rounded-lg p-2">
              <span className="font-mono font-semibold text-slate-700">{change.field}</span>
              <div className="flex gap-2 mt-1 flex-wrap">
                {change.before && change.before !== '(nuevo)' && (
                  <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded line-through max-w-xs truncate">{change.before}</span>
                )}
                <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded max-w-xs truncate">{change.after}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Auditoria() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [filterSource, setFilterSource] = useState('manual');
  const [users, setUsers] = useState([]);

  // Date navigation — default to today in Melbourne
  const todayMelbourne = getTodayMelbourne();
  const [selectedDate, setSelectedDate] = useState(() => getTodayMelbourne());

  const loadLogs = async () => {
    setLoading(true);
    try {
      const allLogs = await base44.entities.AuditLog.list('-timestamp', 1000);
      setLogs(allLogs);
      const uniqueUsers = {};
      allLogs.forEach(l => {
        if (l.user_email && !uniqueUsers[l.user_email]) {
          uniqueUsers[l.user_email] = l.user_name || l.user_email;
        }
      });
      setUsers(Object.entries(uniqueUsers).map(([email, name]) => ({ email, name })));
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user?.email === OWNER_EMAIL) loadLogs();
  }, [user]);

  if (user && user.email !== OWNER_EMAIL) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800">Acceso Restringido</h2>
          <p className="text-slate-500 mt-2">No tienes permisos para ver esta sección.</p>
        </div>
      </div>
    );
  }

  const activeModuleDef = MODULES.find(m => m.key === activeModule);
  const isSystemLog = (log) => log.user_id?.startsWith('service_') || (!log.user_id && !log.user_email);

  // Apply module + source + action + user filters (no date here — date is handled by day view)
  const applyBaseFilters = (log) => {
    if (activeModuleDef?.entities && !activeModuleDef.entities.includes(log.entity_type)) return false;
    if (activeModuleDef?.isOther && KNOWN_ENTITIES.includes(log.entity_type)) return false;
    if (filterSource === 'manual' && isSystemLog(log)) return false;
    if (filterSource === 'automatic' && !isSystemLog(log)) return false;
    if (filterAction !== 'all' && log.action !== filterAction) return false;
    if (filterUser !== 'all' && log.user_email !== filterUser) return false;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      return (
        log.entity_name?.toLowerCase().includes(q) ||
        log.user_name?.toLowerCase().includes(q) ||
        log.user_email?.toLowerCase().includes(q) ||
        log.changed_fields?.some(f => f.toLowerCase().includes(q)) ||
        log.changes_detail?.some(c => c.before?.toLowerCase().includes(q) || c.after?.toLowerCase().includes(q))
      );
    }
    return true;
  };

  // Latest 10 changes (no date filter, manual only by default)
  const recentLogs = logs
    .filter(l => !isSystemLog(l))
    .slice(0, 10);

  // Day view: filter by selectedDate in Melbourne TZ
  const dayLogs = logs
    .filter(log => {
      if (!log.timestamp) return false;
      return toMelbourneDate(log.timestamp) === selectedDate;
    })
    .filter(applyBaseFilters)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const goToPrevDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const prev = subDays(new Date(y, m - 1, d), 1);
    setSelectedDate(format(prev, 'yyyy-MM-dd'));
  };

  const goToNextDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const next = addDays(new Date(y, m - 1, d), 1);
    const nextStr = format(next, 'yyyy-MM-dd');
    if (nextStr <= todayMelbourne) setSelectedDate(nextStr);
  };

  const isNextDisabled = selectedDate >= todayMelbourne;
  const dayLabel = toMelbourneDateLabel(selectedDate);

  const countForModule = (mod) => {
    if (mod.entities) return logs.filter(l => mod.entities.includes(l.entity_type)).length;
    if (mod.isOther) return logs.filter(l => !KNOWN_ENTITIES.includes(l.entity_type)).length;
    return logs.length;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Auditoría del Sistema</h1>
            <p className="text-sm text-slate-500">Registro de todos los cambios — zona horaria Melbourne</p>
          </div>
        </div>
        <Button variant="outline" onClick={loadLogs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Recent changes panel */}
      {!loading && recentLogs.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">Últimos cambios manuales</span>
              <Badge className="bg-blue-100 text-blue-700 text-xs">{recentLogs.length}</Badge>
            </div>
            <div className="space-y-2">
              {recentLogs.map(log => <AuditCard key={log.id} log={log} />)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Module Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {MODULES.map(mod => {
          const count = countForModule(mod);
          return (
            <button
              key={mod.key}
              onClick={() => setActiveModule(mod.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeModule === mod.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {mod.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeModule === mod.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar nombre, usuario, campo..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger><SelectValue placeholder="Origen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los cambios</SelectItem>
                <SelectItem value="manual">Solo manuales</SelectItem>
                <SelectItem value="automatic">Solo automáticos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger><SelectValue placeholder="Acción" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las acciones</SelectItem>
                <SelectItem value="create">Creado</SelectItem>
                <SelectItem value="update">Modificado</SelectItem>
                <SelectItem value="delete">Eliminado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger><SelectValue placeholder="Usuario" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los usuarios</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.email} value={u.email}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm text-slate-500">{dayLogs.length} registro{dayLogs.length !== 1 ? 's' : ''} el {dayLabel}</span>
            <Button variant="ghost" size="sm" onClick={() => { setSearchText(''); setFilterAction('all'); setFilterUser('all'); setFilterSource('manual'); }}>
              <Filter className="w-3 h-3 mr-1" /> Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Date navigation */}
      <div className="flex items-center gap-3 justify-center bg-white border border-slate-200 rounded-xl px-4 py-3">
        <Button variant="outline" size="icon" onClick={goToPrevDay}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1 justify-center">
          <Calendar className="w-4 h-4 text-slate-500" />
          <input
            type="date"
            value={selectedDate}
            max={todayMelbourne}
            onChange={e => e.target.value && setSelectedDate(e.target.value)}
            className="border-0 bg-transparent text-center font-semibold text-slate-800 text-sm focus:outline-none cursor-pointer"
          />
          <span className="text-slate-500 text-sm">— {dayLabel}</span>
        </div>
        <Button variant="outline" size="icon" onClick={goToNextDay} disabled={isNextDisabled}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Logs for selected day */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : dayLogs.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Database className="w-12 h-12 mx-auto mb-3" />
          <p>No hay registros para {dayLabel}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dayLogs.map(log => <AuditCard key={log.id} log={log} />)}
        </div>
      )}
    </div>
  );
}