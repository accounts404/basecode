import React, { useMemo, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, Square } from "lucide-react";
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
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        return events
            .filter(event => {
                if (!event.start_time) return false;
                const eventDateString = event.start_time.slice(0, 10);
                return eventDateString === dateString;
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
                    return { type: 'completed', label: 'Completado', color: 'bg-slate-100 text-slate-700', icon: '✓' };
                } else if (cleanerClockData.clock_in_time) {
                    return { type: 'in_progress', label: 'En Progreso', color: 'bg-green-100 text-green-700', icon: '●' };
                } else {
                    return { type: 'scheduled', label: 'Programado', color: 'bg-blue-100 text-blue-700', icon: '○' };
                }
            } else {
                if (event.status === 'completed') {
                    return { type: 'completed', label: 'Completado', color: 'bg-slate-100 text-slate-700', icon: '✓' };
                } else if (event.status === 'in_progress') {
                    return { type: 'in_progress', label: 'En Progreso', color: 'bg-green-100 text-green-700', icon: '●' };
                } else {
                    return { type: 'scheduled', label: 'Programado', color: 'bg-blue-100 text-blue-700', icon: '○' };
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
                
                const currentClient = clientsMap.get(event.client_id);
                const displayAddress = currentClient?.address || event.client_address || 'Dirección no disponible';

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
                            {/* Header con nombre y hora - MUY COMPACTO */}
                            <div className="flex items-start justify-between mb-1.5">
                                <div className="flex-1 min-w-0">
                                    <h3 className={`text-sm font-bold leading-tight truncate ${
                                        isCancelled ? 'line-through text-slate-500' : 'text-slate-900'
                                    }`}>
                                        {event.client_name}
                                    </h3>
                                    <div className="flex items-center gap-1 text-slate-600 mt-0.5">
                                        <Clock className="w-3 h-3 flex-shrink-0" />
                                        <span className="text-xs font-medium">
                                            {formatTimeUTC(startTime)} - {formatTimeUTC(endTime)}
                                        </span>
                                    </div>
                                </div>

                                {/* Badge de estado más pequeño */}
                                {status && !isCancelled && (
                                    <Badge 
                                        className={`${status.color} text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0 ml-1 ${
                                            status.type === 'in_progress' ? 'animate-pulse' : ''
                                        }`}
                                    >
                                        <span className="text-xs">{status.icon}</span>
                                        <span className="hidden xs:inline">{status.label}</span>
                                    </Badge>
                                )}

                                {isCancelled && (
                                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 ml-1 flex-shrink-0">
                                        CANCELADO
                                    </Badge>
                                )}
                            </div>

                            {/* Dirección ultra compacta */}
                            <div className="flex items-start gap-1 text-slate-700 mb-2 bg-slate-50 p-1.5 rounded">
                                <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-blue-600" />
                                <span className="text-[11px] leading-tight line-clamp-2">
                                    {loadingClients ? (
                                        <span className="text-slate-400 italic">Cargando...</span>
                                    ) : (
                                        displayAddress
                                    )}
                                </span>
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