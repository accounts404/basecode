import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { format, parseISO, startOfDay, endOfDay, isToday, isYesterday, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Search, Filter, ChevronDown, ChevronUp, Calendar, User, Database, RefreshCw } from 'lucide-react';

const OWNER_EMAIL = 'accounts@redoakcleaning.com.au';

const ACTION_LABELS = {
  create: { label: 'Creado', color: 'bg-green-100 text-green-800' },
  update: { label: 'Modificado', color: 'bg-blue-100 text-blue-800' },
  delete: { label: 'Eliminado', color: 'bg-red-100 text-red-800' },
};

// Tabs/modules — entity_type values mapped here
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
  Client: 'Cliente',
  Schedule: 'Horario/Servicio',
  Vehicle: 'Vehículo',
  VehicleKeyRecord: 'Llave Vehículo',
  VehicleChecklistRecord: 'Checklist Vehículo',
  KeyRecord: 'Llave Cliente',
  User: 'Limpiador/Usuario',
  Invoice: 'Factura',
  WorkEntry: 'Entrada de Trabajo',
  CasualCleaner: 'Casual',
  CasualMessage: 'Mensaje Casual',
  Quote: 'Cotización',
  Task: 'Tarea',
  MonthlyCleanerScore: 'Puntuación Mensual',
  ScoreAdjustment: 'Ajuste de Score',
  PunctualityRecord: 'Puntualidad',
  PerformanceReview: 'Evaluación',
  ClientFeedback: 'Feedback Cliente',
  Reconciliation: 'Conciliación',
  DailyReconciliation: 'Conciliación Diaria',
  FixedCost: 'Costo Fijo',
  PricingThreshold: 'Umbral de Precio',
  ServiceRate: 'Tarifa de Servicio',
  ClientPriceReviewList: 'Revisión de Precios',
};

function groupByDate(logs) {
  const groups = {};
  logs.forEach(log => {
    if (!log.timestamp) {
      const key = 'Sin fecha';
      if (!groups[key]) groups[key] = { label: 'Sin fecha', logs: [] };
      groups[key].logs.push(log);
      return;
    }
    const d = parseISO(log.timestamp);
    let label;
    if (isToday(d)) label = 'Hoy';
    else if (isYesterday(d)) label = 'Ayer';
    else label = format(d, "EEEE d 'de' MMMM yyyy", { locale: es });
    const key = format(d, 'yyyy-MM-dd');
    if (!groups[key]) groups[key] = { label, logs: [] };
    groups[key].logs.push(log);
  });
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function AuditCard({ log }) {
  const [expanded, setExpanded] = useState(false);
  const action = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-gray-100 text-gray-800' };
  const entityLabel = ENTITY_LABELS[log.entity_type] || log.entity_type;
  const ts = log.timestamp ? format(parseISO(log.timestamp), "HH:mm", { locale: es }) : '—';

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden text-sm">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`${action.color} text-xs`}>{action.label}</Badge>
            <Badge variant="outline" className="text-slate-600 text-xs">{entityLabel}</Badge>
            {log.entity_name && (
              <span className="font-medium text-slate-800 truncate">{log.entity_name}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-1">
            <span className="flex items-center gap-1"><User className="w-3 h-3" />{log.user_name || 'Desconocido'}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{ts}</span>
            {log.changed_fields?.length > 0 && (
              <span className="flex items-center gap-1"><Database className="w-3 h-3" />{log.changed_fields.length} campo{log.changed_fields.length > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
        {(log.changes_detail?.length > 0) && (
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

function DateGroup({ dateLabel, logs }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left py-2 mb-2"
      >
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{dateLabel}</span>
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{logs.length}</span>
        <div className="flex-1 h-px bg-slate-200 ml-1" />
        {collapsed ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronUp className="w-3 h-3 text-slate-400" />}
      </button>
      {!collapsed && (
        <div className="space-y-2 mb-4">
          {logs.map(log => <AuditCard key={log.id} log={log} />)}
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [users, setUsers] = useState([]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const allLogs = await base44.entities.AuditLog.list('-timestamp', 500);
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

  const filtered = logs.filter(log => {
    // Module filter
    if (activeModuleDef?.entities) {
      if (!activeModuleDef.entities.includes(log.entity_type)) return false;
    } else if (activeModuleDef?.isOther) {
      if (KNOWN_ENTITIES.includes(log.entity_type)) return false;
    }

    if (filterAction !== 'all' && log.action !== filterAction) return false;
    if (filterUser !== 'all' && log.user_email !== filterUser) return false;

    if (dateFrom) {
      const logDate = log.timestamp ? parseISO(log.timestamp) : null;
      if (!logDate || logDate < startOfDay(parseISO(dateFrom))) return false;
    }
    if (dateTo) {
      const logDate = log.timestamp ? parseISO(log.timestamp) : null;
      if (!logDate || logDate > endOfDay(parseISO(dateTo))) return false;
    }

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
  });

  const dateGroups = groupByDate(filtered);

  const clearFilters = () => {
    setSearchText('');
    setFilterAction('all');
    setFilterUser('all');
    setDateFrom('');
    setDateTo('');
  };

  // Count per module for badges
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
            <p className="text-sm text-slate-500">Registro de todos los cambios agrupados por módulo y fecha</p>
          </div>
        </div>
        <Button variant="outline" onClick={loadLogs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Module Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {MODULES.map(mod => {
          const count = countForModule(mod);
          if (count === 0 && mod.key !== 'all') return null;
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
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeModule === mod.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar nombre, usuario, campo..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="pl-9"
              />
            </div>

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

            <div className="flex gap-2">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-xs" title="Desde" />
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-xs" title="Hasta" />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm text-slate-500">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</span>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <Filter className="w-3 h-3 mr-1" /> Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs grouped by date */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Database className="w-12 h-12 mx-auto mb-3" />
          <p>No hay registros en este módulo.</p>
        </div>
      ) : (
        <div>
          {dateGroups.map(([key, { label, logs: groupLogs }]) => (
            <DateGroup key={key} dateLabel={label} logs={groupLogs} />
          ))}
        </div>
      )}
    </div>
  );
}