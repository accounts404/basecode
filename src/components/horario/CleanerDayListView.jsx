import React, { useMemo, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Square } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Client } from "@/entities/Client";

const parseISOAsUTC = (isoString) => {
    if (!isoString) return null;
    const correctedIsoString = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
    return new Date(correctedIsoString);
};

const formatTimeUTC = (date) => {
    if (!date) return '';
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
};

export default function CleanerDayListView({ 
    events, 
    selectedDate, 
    selectedCleanerId, 
    onSelectEvent,
    processingSchedules,
    handleClockOut,
    currentUser
}) {
    const [clientsMap, setClientsMap] = useState(new Map());
    const [loadingClients, setLoadingClients] = useState(true);

    // Cargar información actualizada de los clientes
    useEffect(() => {
        const loadClients = async () => {
            if (!events || events.length === 0) {
                setLoadingClients(false);
                return;
            }

            try {
                const clientIds = [...new Set(events.map(e => e.client_id).filter(Boolean))];
                
                if (clientIds.length === 0) {
                    setLoadingClients(false);
                    return;
                }

                const clientsData = await Promise.all(
                    clientIds.map(async (id) => {
                        try {
                            return await Client.get(id);
                        } catch (error) {
                            console.warn(`No se pudo cargar cliente ${id}:`, error);
                            return null;
                        }
                    })
                );

                const map = new Map();
                clientsData.filter(Boolean).forEach(client => {
                    map.set(client.id, client);
                });

                setClientsMap(map);
            } catch (error) {
                console.error('Error cargando clientes:', error);
            } finally {
                setLoadingClients(false);
            }
        };

        loadClients();
    }, [events]);

    // Filtrar eventos del día seleccionado
    const eventsForDate = useMemo(() => {
        // Obtener fecha local del selectedDate
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        console.log('[CleanerDayListView] Filtrando para fecha LOCAL:', dateString);
        
        return events
            .filter(event => {
                if (!event.start_time) return false;
                const eventDateString = event.start_time.slice(0, 10);
                const match = eventDateString === dateString;
                if (match) {
                    console.log('[CleanerDayListView] ✅ Match encontrado:', event.client_name, eventDateString);
                }
                return match;
            })
            .sort((a, b) => {
                const timeA = parseISOAsUTC(a.start_time);
                const timeB = parseISOAsUTC(b.start_time);
                return timeA.getTime() - timeB.getTime();
            });
    }, [events, selectedDate]);

    // Obtener estado del limpiador para un evento
    const getCleanerStatus = (event) => {
        if (!selectedCleanerId) return null;
        
        const cleanerClockData = event.clock_in_data?.find(c => c.cleaner_id === selectedCleanerId);
        
        if (event.cleaner_ids && event.cleaner_ids.includes(selectedCleanerId)) {
            if (cleanerClockData) {
                if (cleanerClockData.clock_out_time) {
                    return { type: 'completed', label: 'Completado', color: 'bg-slate-100 text-slate-700 border-slate-300', icon: '✓' };
                } else if (cleanerClockData.clock_in_time) {
                    return { type: 'in_progress', label: 'En Progreso', color: 'bg-green-100 text-green-800 border-green-300', icon: '●' };
                } else {
                    return { type: 'scheduled', label: 'Programado', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: '○' };
                }
            } else {
                if (event.status === 'completed') {
                    return { type: 'completed', label: 'Completado', color: 'bg-slate-100 text-slate-700 border-slate-300', icon: '✓' };
                } else if (event.status === 'in_progress') {
                    return { type: 'in_progress', label: 'En Progreso', color: 'bg-green-100 text-green-800 border-green-300', icon: '●' };
                } else {
                    return { type: 'scheduled', label: 'Programado', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: '○' };
                }
            }
        }
        
        return null;
    };

    if (eventsForDate.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                    <Clock className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-base font-semibold text-slate-600 mb-1">Sin servicios</h3>
                <p className="text-sm text-slate-400">
                    {format(selectedDate, "d 'de' MMMM", { locale: es })}
                </p>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-3 max-w-lg mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-1">
                <div>
                    <h2 className="text-base font-bold text-slate-800 capitalize">
                        {format(selectedDate, "EEEE", { locale: es })}
                    </h2>
                    <p className="text-xs text-slate-400">
                        {format(selectedDate, "d 'de' MMMM, yyyy", { locale: es })}
                    </p>
                </div>
                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">
                    {eventsForDate.length} servicio{eventsForDate.length !== 1 ? 's' : ''}
                </span>
            </div>

            {eventsForDate.map((event, index) => {
                const startTime = parseISOAsUTC(event.start_time);
                const endTime = parseISOAsUTC(event.end_time);
                const status = getCleanerStatus(event);
                const isCancelled = event.status === 'cancelled';
                const eventColor = event.color || '#3b82f6';

                return (
                    <div
                        key={event.id}
                        className={`rounded-2xl overflow-hidden shadow-sm transition-all duration-200 hover:shadow-md ${
                            isCancelled ? 'opacity-60' : ''
                        }`}
                        style={{ border: `1px solid ${isCancelled ? '#e2e8f0' : eventColor + '30'}` }}
                    >
                        {/* Color bar top */}
                        <div className="h-1.5 w-full" style={{ backgroundColor: isCancelled ? '#cbd5e1' : eventColor }} />

                        <div className="bg-white p-3.5">
                            {/* Cabecera: hora + estado */}
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                        <span className="text-sm font-bold text-slate-700">
                                            {formatTimeUTC(startTime)} – {formatTimeUTC(endTime)}
                                        </span>
                                    </div>
                                    <h3 className={`text-base font-bold leading-tight ${
                                        isCancelled ? 'line-through text-slate-400' : 'text-slate-900'
                                    }`}>
                                        {event.client_name}
                                    </h3>
                                </div>

                                {isCancelled ? (
                                    <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">CANCELADO</span>
                                ) : status && (
                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                                        status.type === 'in_progress' ? 'bg-green-100 text-green-700 animate-pulse' :
                                        status.type === 'completed' ? 'bg-slate-100 text-slate-600' :
                                        'bg-blue-100 text-blue-700'
                                    }`}>
                                        <span>{status.icon}</span>
                                        <span>{status.label}</span>
                                    </span>
                                )}
                            </div>

                            {/* Botones */}
                            <div className="flex gap-2 mt-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onSelectEvent(event)}
                                    className="flex-1 h-8 text-xs font-semibold rounded-xl border-slate-200 text-slate-600"
                                >
                                    Ver Detalles
                                </Button>

                                {status?.type === 'in_progress' && currentUser?.id === selectedCleanerId && (
                                    <Button 
                                        size="sm"
                                        className="flex-1 h-8 text-xs font-semibold rounded-xl bg-red-500 hover:bg-red-600 text-white"
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            handleClockOut(event); 
                                        }}
                                        disabled={processingSchedules?.has(event.id)}
                                    >
                                        {processingSchedules?.has(event.id) ? (
                                            <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1.5" />Cerrando...</>
                                        ) : (
                                            <><Square className="w-3.5 h-3.5 mr-1.5" />Cerrar Servicio</>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}