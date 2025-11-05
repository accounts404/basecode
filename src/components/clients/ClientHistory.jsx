
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Schedule } from '@/entities/Schedule';
import { WorkEntry } from '@/entities/WorkEntry';
import { ServiceReport } from '@/entities/ServiceReport';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Calendar, 
  Clock, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  TrendingUp, 
  Wind, 
  Zap, 
  FileText, 
  Users,
  Filter,
  History,
  Eye,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Search
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, isAfter, isBefore, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { createPageUrl } from '@/utils';

const EventTypeIcons = {
  service_completed: { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100' },
  service_scheduled: { icon: Calendar, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  service_cancelled: { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100' },
  service_inprogress: { icon: Clock, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  work_entry: { icon: FileText, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  price_change: { icon: TrendingUp, color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  windows_service: { icon: Wind, color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
  steam_service: { icon: Zap, color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  service_report: { icon: AlertTriangle, color: 'text-red-600', bgColor: 'bg-red-100' }
};

// Helper functions moved outside component to avoid dependency issues
const getScheduleEventType = (status) => {
  switch (status) {
    case 'completed': return 'service_completed';
    case 'cancelled': return 'service_cancelled';
    case 'in_progress': return 'service_inprogress';
    default: return 'service_scheduled';
  }
};

const getScheduleTitle = (status) => {
  switch (status) {
    case 'completed': return 'Servicio Completado';
    case 'cancelled': return 'Servicio Cancelado';
    case 'in_progress': return 'Servicio en Progreso';
    default: return 'Servicio Programado';
  }
};

const getScheduleDescription = (schedule) => {
  // Ensure that schedule.start_time and schedule.end_time are not null or undefined
  const startTime = schedule.start_time ? format(parseISO(schedule.start_time), 'HH:mm', { locale: es }) : 'N/A';
  const endTime = schedule.end_time ? format(parseISO(schedule.end_time), 'HH:mm', { locale: es }) : 'N/A';
  const cleanerCount = schedule.cleaner_ids?.length || 0;
  
  return `${startTime} - ${endTime} • ${cleanerCount} limpiador${cleanerCount !== 1 ? 'es' : ''}`;
};

const getActivityLabel = (activity) => {
  const labels = {
    domestic: 'Doméstico',
    commercial: 'Comercial',
    windows: 'Ventanas',
    steam_vacuum: 'Vapor/Aspirado',
    training: 'Entrenamiento', // Added 'training' for consistency if it comes from the backend
    entrenamiento: 'Entrenamiento',
    gasolina: 'Gasolina',
    inspecciones: 'Inspecciones',
    otros: 'Otros'
  };
  return labels[activity] || activity;
};

const getWorkEntryDescription = (entry) => {
  const activityLabel = getActivityLabel(entry.activity);
  if (entry.activity === 'otros' && entry.other_activity) {
    return `${entry.hours}h • $${entry.total_amount?.toFixed(2)} • ${entry.other_activity}`;
  }
  return `${entry.hours}h • $${entry.total_amount?.toFixed(2)} • Por ${entry.cleaner_name}`;
};

const getReportDescription = (report) => {
  return `${report.priority ? `Prioridad: ${report.priority} • ` : ''}Por ${report.cleaner_name}`;
};

export default function ClientHistory({ clientId }) {
  const [loading, setLoading] = useState(true);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [expandedEvents, setExpandedEvents] = useState(new Set());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');

  const loadClientHistory = useCallback(async () => {
    setLoading(true);
    try {
      // Cargar datos en paralelo
      const [schedules, workEntries, serviceReports] = await Promise.all([
        Schedule.filter({ client_id: clientId }),
        WorkEntry.filter({ client_id: clientId }),
        ServiceReport.list() // Filtraremos después por client_name
      ]);

      const events = [];

      // Procesar servicios programados
      schedules.forEach(schedule => {
        const eventType = getScheduleEventType(schedule.status);
        events.push({
          id: `schedule-${schedule.id}`,
          type: eventType,
          date: schedule.start_time,
          title: getScheduleTitle(schedule.status),
          description: getScheduleDescription(schedule),
          data: schedule,
          category: 'service'
        });
      });

      // Procesar entradas de trabajo
      workEntries.forEach(entry => {
        events.push({
          id: `work-${entry.id}`,
          type: 'work_entry',
          date: entry.work_date,
          title: `Trabajo ${getActivityLabel(entry.activity)}`,
          description: getWorkEntryDescription(entry),
          data: entry,
          category: 'work'
        });
      });

      // Procesar reportes de servicio (filtrar por client_name si existe)
      // Como no tenemos client_id en ServiceReport, buscamos por client_name
      const clientSchedules = schedules.map(s => s.id);
      const relevantReports = serviceReports.filter(report => 
        clientSchedules.includes(report.schedule_id)
      );

      relevantReports.forEach(report => {
        events.push({
          id: `report-${report.id}`,
          type: 'service_report',
          date: report.service_date,
          title: 'Reporte de Incidencia',
          description: getReportDescription(report),
          data: report,
          category: 'report'
        });
      });

      // Ordenar eventos por fecha (más reciente primero)
      events.sort((a, b) => new Date(b.date) - new Date(a.date));

      setHistoryEvents(events);
    } catch (error) {
      console.error('Error cargando historial del cliente:', error);
    } finally {
      setLoading(false);
    }
  }, [clientId]); // clientId is the only dependency as helper functions are now outside

  useEffect(() => {
    if (clientId) {
      loadClientHistory();
    }
  }, [clientId, loadClientHistory]);

  const filteredEvents = useMemo(() => {
    let filtered = historyEvents;
    
    if (filterType !== 'all') {
      filtered = filtered.filter(event => event.category === filterType);
    }
    
    if (searchTerm) {
      filtered = filtered.filter(event => 
        event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (event.data.notes_public && event.data.notes_public.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    return filtered;
  }, [historyEvents, filterType, searchTerm]);

  const pastEvents = useMemo(() => {
    const now = new Date();
    return filteredEvents.filter(event => isBefore(parseISO(event.date), now));
  }, [filteredEvents]);

  const futureEvents = useMemo(() => {
    const now = new Date();
    return filteredEvents.filter(event => isAfter(parseISO(event.date), now) || isSameDay(parseISO(event.date), now));
  }, [filteredEvents]);

  const monthlyPastEvents = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    
    return pastEvents.filter(event => {
      const eventDate = parseISO(event.date);
      return eventDate >= monthStart && eventDate <= monthEnd;
    });
  }, [pastEvents, currentMonth]);

  const toggleEventExpansion = (eventId) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId);
    } else {
      newExpanded.add(eventId);
    }
    setExpandedEvents(newExpanded);
  };

  const navigateMonth = (direction) => {
    setCurrentMonth(prev => direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1));
  };

  const EventCard = ({ event }) => {
    const EventIcon = EventTypeIcons[event.type];
    const isExpanded = expandedEvents.has(event.id);
    const isSchedule = event.id.startsWith('schedule-');
    const scheduleId = isSchedule ? event.id.replace('schedule-', '') : null;
    
    return (
      <Card className="shadow-sm hover:shadow-md transition-shadow mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <div className={`flex-shrink-0 w-10 h-10 rounded-full ${EventIcon.bgColor} flex items-center justify-center`}>
                <EventIcon.icon className={`w-5 h-5 ${EventIcon.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <CardTitle className="text-base font-semibold text-slate-900">
                    {event.title}
                  </CardTitle>
                  {event.type === 'service_report' && (
                    <Badge variant="destructive" className="text-xs">
                      {event.data.priority || 'Media'}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-600">
                  <span className="font-medium">
                    {format(parseISO(event.date), 'dd MMM yyyy', { locale: es })}
                  </span>
                  <span>{event.description}</span>
                </div>
                
                {/* Mostrar limpiadores asignados */}
                {isSchedule && event.data.cleaner_ids && event.data.cleaner_ids.length > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <Users className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-600">
                      Limpiadores: {event.data.cleaner_ids.length}
                    </span>
                  </div>
                )}
                
                {/* Mostrar si tiene notas */}
                {event.data.notes_public && (
                  <div className="mt-2">
                    <Badge variant="outline" className="text-xs">
                      <FileText className="w-3 h-3 mr-1" />
                      Con notas
                    </Badge>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Botón para ver detalles */}
              {(event.data.notes_public || event.data.report_notes || event.data.other_activity) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleEventExpansion(event.id)}
                  className="p-1 h-fit"
                >
                  <Eye className="w-4 h-4 text-slate-500 hover:text-slate-700" />
                </Button>
              )}
              
              {/* Botón para ir al servicio directamente (abrir en nueva pestaña) */}
              {isSchedule && (
                <a
                  href={`${createPageUrl('Horario')}?focus=${scheduleId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 h-fit inline-flex items-center justify-center rounded-md hover:bg-slate-100 transition-colors"
                  title="Abrir en Horario (nueva pestaña)"
                >
                  <ExternalLink className="w-4 h-4 text-blue-600 hover:text-blue-700" />
                </a>
              )}
            </div>
          </div>
        </CardHeader>
        
        {/* Detalles expandibles */}
        {isExpanded && (
          <CardContent className="pt-0">
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              {event.data.notes_public && (
                <div>
                  <span className="text-sm font-medium text-slate-700">Notas del Servicio:</span>
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{event.data.notes_public}</p>
                </div>
              )}
              
              {event.data.report_notes && (
                <div>
                  <span className="text-sm font-medium text-slate-700">Detalle del Reporte:</span>
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{event.data.report_notes}</p>
                </div>
              )}
              
              {event.data.other_activity && (
                <div>
                  <span className="text-sm font-medium text-slate-700">Descripción:</span>
                  <p className="text-sm text-slate-600 mt-1">{event.data.other_activity}</p>
                </div>
              )}
              
              {/* Información adicional para servicios */}
              {isSchedule && event.data.cleaner_schedules && event.data.cleaner_schedules.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-slate-700">Horarios de Limpiadores:</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {event.data.cleaner_schedules.map((cleaner, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {cleaner.start_time && cleaner.end_time ?
                          `${format(parseISO(cleaner.start_time), 'HH:mm')} - ${format(parseISO(cleaner.end_time), 'HH:mm')}` :
                          'Horario pendiente'
                        }
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-slate-600">Cargando historial...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header y controles */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <History className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Historial del Cliente</h3>
            <p className="text-sm text-slate-600">{filteredEvents.length} eventos encontrados</p>
          </div>
        </div>
      </div>

      {/* Filtros y búsqueda */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filtrar por..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los Eventos</SelectItem>
              <SelectItem value="service">Servicios</SelectItem>
              <SelectItem value="work">Trabajos</SelectItem>
              <SelectItem value="report">Reportes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-slate-500" />
          <Input
            placeholder="Buscar en historial..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>
      </div>

      {/* Tabs para pasado y futuro */}
      <Tabs defaultValue="past" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="past" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Historial ({pastEvents.length})
          </TabsTrigger>
          <TabsTrigger value="future" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Próximos ({futureEvents.length})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="past" className="space-y-4">
          {/* Navegación por meses para el historial */}
          <div className="flex items-center justify-between bg-slate-50 rounded-lg p-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateMonth('prev')}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <div className="text-center">
              <h4 className="font-semibold text-slate-900">
                {format(currentMonth, 'MMMM yyyy', { locale: es })}
              </h4>
              <p className="text-sm text-slate-600">
                {monthlyPastEvents.length} evento{monthlyPastEvents.length !== 1 ? 's' : ''}
              </p>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateMonth('next')}
              disabled={isAfter(currentMonth, new Date())}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Eventos del mes seleccionado */}
          <div className="space-y-4">
            {monthlyPastEvents.length > 0 ? (
              monthlyPastEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))
            ) : (
              <div className="text-center py-12">
                <History className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-slate-500 mb-2">No hay eventos en este mes</h4>
                <p className="text-slate-400">
                  Navega a otros meses para ver más historial.
                </p>
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="future" className="space-y-4">
          {futureEvents.length > 0 ? (
            futureEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))
          ) : (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-slate-500 mb-2">No hay servicios próximos</h4>
              <p className="text-slate-400">
                Los próximos servicios programados aparecerán aquí.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
