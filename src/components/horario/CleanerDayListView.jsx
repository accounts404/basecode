import React, { useMemo, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, Play, Square, CheckCircle, AlertTriangle } from "lucide-react";
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
                // Obtener IDs únicos de clientes
                const clientIds = [...new Set(events.map(e => e.client_id).filter(Boolean))];
                
                if (clientIds.length === 0) {
                    setLoadingClients(false);
                    return;
                }

                // Cargar todos los clientes
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

                // Crear mapa de clientes
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
                    return { type: 'completed', label: 'Completado', color: 'bg-slate-100 text-slate-800', icon: '⚪️' };
                } else if (cleanerClockData.clock_in_time) {
                    return { type: 'in_progress', label: 'En Progreso', color: 'bg-green-100 text-green-800', icon: '🟢' };
                } else {
                    return { type: 'scheduled', label: 'Programado', color: 'bg-blue-100 text-blue-800', icon: '🔵' };
                }
            } else {
                if (event.status === 'completed') {
                    return { type: 'completed', label: 'Completado', color: 'bg-slate-100 text-slate-800', icon: '⚪️' };
                } else if (event.status === 'in_progress') {
                    return { type: 'in_progress', label: 'En Progreso', color: 'bg-green-100 text-green-800', icon: '🟢' };
                } else {
                    return { type: 'scheduled', label: 'Programado', color: 'bg-blue-100 text-blue-800', icon: '🔵' };
                }
            }
        }
        
        return null;
    };

    if (eventsForDate.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="text-6xl mb-4">📅</div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">
                    No hay servicios programados
                </h3>
                <p className="text-slate-500">
                    para {format(selectedDate, "d 'de' MMMM, yyyy", { locale: es })}
                </p>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-4 max-w-2xl mx-auto">
            <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-slate-900">
                    {format(selectedDate, "EEEE", { locale: es })}
                </h2>
                <p className="text-slate-600">
                    {format(selectedDate, "d 'de' MMMM, yyyy", { locale: es })}
                </p>
                <Badge variant="secondary" className="mt-2">
                    {eventsForDate.length} servicio{eventsForDate.length !== 1 ? 's' : ''}
                </Badge>
            </div>

            {eventsForDate.map((event) => {
                const startTime = parseISOAsUTC(event.start_time);
                const endTime = parseISOAsUTC(event.end_time);
                const status = getCleanerStatus(event);
                const isCancelled = event.status === 'cancelled';
                
                // Obtener dirección actualizada del cliente
                const currentClient = clientsMap.get(event.client_id);
                const displayAddress = currentClient?.address || event.client_address || 'Dirección no disponible';

                return (
                    <Card 
                        key={event.id}
                        className={`overflow-hidden transition-all duration-200 hover:shadow-lg ${
                            isCancelled ? 'opacity-60 bg-slate-100' : 'bg-white'
                        }`}
                        style={!isCancelled ? {
                            borderLeft: `6px solid ${event.color || '#3b82f6'}`
                        } : {}}
                    >
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                    <h3 className={`text-xl font-bold ${isCancelled ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                                        {event.client_name}
                                    </h3>
                                    <div className="flex items-center gap-2 text-slate-600 mt-1">
                                        <Clock className="w-4 h-4" />
                                        <span className="font-semibold">
                                            {formatTimeUTC(startTime)} - {formatTimeUTC(endTime)}
                                        </span>
                                    </div>
                                </div>

                                {isCancelled && (
                                    <Badge variant="destructive" className="ml-2">
                                        CANCELADO
                                    </Badge>
                                )}
                            </div>

                            {/* Estado del servicio */}
                            {status && (
                                <div className="mb-3">
                                    <Badge 
                                        className={`${status.color} text-sm font-bold px-3 py-1.5 rounded-full flex items-center gap-2 w-fit ${
                                            status.type === 'in_progress' ? 'animate-pulse' : ''
                                        }`}
                                    >
                                        <span>{status.icon}</span>
                                        <span>{status.label}</span>
                                    </Badge>
                                </div>
                            )}

                            {/* Dirección actualizada */}
                            <div className="flex items-start gap-2 text-slate-700 mb-4 bg-slate-50 p-3 rounded-lg">
                                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600" />
                                <span className="text-sm leading-relaxed">
                                    {loadingClients ? (
                                        <span className="text-slate-400 italic">Cargando dirección...</span>
                                    ) : (
                                        displayAddress
                                    )}
                                </span>
                            </div>

                            {/* Botones de acción */}
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onSelectEvent(event)}
                                    className="flex-1"
                                >
                                    Ver Detalles
                                </Button>

                                {status?.type === 'in_progress' && currentUser?.id === selectedCleanerId && (
                                    <Button 
                                        variant="default"
                                        size="sm"
                                        className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            handleClockOut(event); 
                                        }}
                                        disabled={processingSchedules?.has(event.id)}
                                    >
                                        {processingSchedules?.has(event.id) ? (
                                            <>
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                                Cerrando...
                                            </>
                                        ) : (
                                            <>
                                                <Square className="w-4 h-4 mr-2" />
                                                Cerrar Servicio
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