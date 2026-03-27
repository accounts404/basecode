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
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="text-4xl mb-3">📅</div>
                <h3 className="text-lg font-semibold text-slate-700 mb-1">
                    No hay servicios
                </h3>
                <p className="text-sm text-slate-500">
                    para {format(selectedDate, "d 'de' MMMM", { locale: es })}
                </p>
            </div>
        );
    }

    return (
        <div className="p-3 space-y-2 max-w-2xl mx-auto">
            {/* Header compacto */}
            <div className="text-center mb-3">
                <h2 className="text-lg font-bold text-slate-900">
                    {format(selectedDate, "EEEE", { locale: es })}
                </h2>
                <p className="text-xs text-slate-600">
                    {format(selectedDate, "d 'de' MMMM, yyyy", { locale: es })}
                </p>
                <Badge variant="secondary" className="mt-1 text-xs px-2 py-0.5">
                    {eventsForDate.length} servicio{eventsForDate.length !== 1 ? 's' : ''}
                </Badge>
            </div>

            {eventsForDate.map((event) => {
                const startTime = parseISOAsUTC(event.start_time);
                const endTime = parseISOAsUTC(event.end_time);
                const status = getCleanerStatus(event);
                const isCancelled = event.status === 'cancelled';

                return (
                    <Card 
                        key={event.id}
                        className={`overflow-hidden transition-all duration-200 hover:shadow-md ${
                            isCancelled ? 'opacity-50 bg-slate-50' : 'bg-white'
                        }`}
                        style={!isCancelled ? {
                            borderLeft: `4px solid ${event.color || '#3b82f6'}`
                        } : {}}
                    >
                        <CardContent className="p-2.5">
                            {/* Nombre del cliente */}
                            <div className="mb-1.5">
                                <h3 className={`text-sm font-bold leading-tight ${
                                    isCancelled ? 'line-through text-slate-500' : 'text-slate-900'
                                }`}>
                                    {event.client_name}
                                </h3>
                            </div>

                            {/* Hora y Estado en una fila */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1 text-slate-600">
                                    <Clock className="w-3 h-3 flex-shrink-0" />
                                    <span className="text-xs font-medium">
                                        {formatTimeUTC(startTime)} - {formatTimeUTC(endTime)}
                                    </span>
                                </div>

                                {/* Badge de estado más prominente */}
                                {status && !isCancelled && (
                                    <Badge 
                                        className={`${status.color} text-xs font-bold px-2 py-1 rounded border flex items-center gap-1 ${
                                            status.type === 'in_progress' ? 'animate-pulse' : ''
                                        }`}
                                    >
                                        <span className="text-sm">{status.icon}</span>
                                        <span>{status.label}</span>
                                    </Badge>
                                )}

                                {isCancelled && (
                                    <Badge variant="destructive" className="text-xs px-2 py-1 font-bold">
                                        CANCELADO
                                    </Badge>
                                )}
                            </div>

                            {/* Botones compactos en una sola fila */}
                            <div className="flex gap-1.5">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onSelectEvent(event)}
                                    className="flex-1 h-7 text-[11px] px-2"
                                >
                                    Ver Detalles
                                </Button>

                                {status?.type === 'in_progress' && currentUser?.id === selectedCleanerId && (
                                    <Button 
                                        variant="default"
                                        size="sm"
                                        className="flex-1 h-7 text-[11px] px-2 bg-red-600 hover:bg-red-700 text-white"
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            handleClockOut(event); 
                                        }}
                                        disabled={processingSchedules?.has(event.id)}
                                    >
                                        {processingSchedules?.has(event.id) ? (
                                            <>
                                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1" />
                                                <span className="text-[10px]">Cerrando...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Square className="w-3 h-3 mr-1" />
                                                Cerrar
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}