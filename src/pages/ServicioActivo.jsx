import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { registerClockOut } from "@/components/utils/activeServiceManager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    Clock,
    MapPin,
    Navigation,
    CheckCircle,
    AlertTriangle,
    Users,
    Camera,
    FileText,
    Timer,
    TrendingDown,
    TrendingUp,
    PawPrint,
    KeySquare,
    Phone,
    AlertCircle
} from "lucide-react";
import { format, differenceInSeconds } from "date-fns";
import { es } from "date-fns/locale";
import ServiceReportForm from "../components/reports/ServiceReportForm";

const parseISOAsUTC = (isoString) => {
    if (!isoString) return null;
    const correctedIsoString = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
    return new Date(correctedIsoString);
};

const formatElapsedTime = (seconds) => {
    if (seconds <= 0) return "00:00:00";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function ServicioActivoPage() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [activeService, setActiveService] = useState(null);
    const [clientInfo, setClientInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [elapsedTime, setElapsedTime] = useState(0);
    const [remainingTime, setRemainingTime] = useState(0);
    const [scheduledDuration, setScheduledDuration] = useState(0);
    const [clockingOut, setClockingOut] = useState(false);
    const [showReportDialog, setShowReportDialog] = useState(false);
    const intervalRef = useRef(null);
    const pollingRef = useRef(null);
    const isUnmountingRef = useRef(false); // NUEVO: Flag para prevenir actualizaciones después de unmount

    useEffect(() => {
        loadUserAndActiveService();
        return () => {
            // LIMPIEZA TOTAL al desmontar el componente
            isUnmountingRef.current = true;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, []);

    // Polling automático cada 20 segundos para actualizar el estado del servicio
    useEffect(() => {
        // CRÍTICO: No iniciar polling si estamos en proceso de Clock Out o desmontando
        if (loading || !activeService || !user || clockingOut || isUnmountingRef.current) {
            return;
        }

        console.log('[ServicioActivo] 🔄 Iniciando polling automático cada 20 segundos');
        
        pollingRef.current = setInterval(async () => {
            // CRÍTICO: Verificar antes de cada actualización si estamos desmontando o haciendo Clock Out
            if (isUnmountingRef.current || clockingOut) {
                console.log('[ServicioActivo] 🛑 Polling cancelado: componente desmontando o Clock Out en progreso');
                if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                }
                return;
            }

            try {
                console.log('[ServicioActivo] 🔄 Actualización automática silenciosa...');
                
                const schedules = await base44.entities.Schedule.list();
                const schedulesArray = Array.isArray(schedules) ? schedules : [];
                
                const active = schedulesArray.find(schedule => {
                    if (!schedule.cleaner_ids || !schedule.cleaner_ids.includes(user.id)) return false;
                    const cleanerClockData = schedule.clock_in_data?.find(c => c.cleaner_id === user.id);
                    return cleanerClockData?.clock_in_time && !cleanerClockData?.clock_out_time;
                });

                // CRÍTICO: Verificar nuevamente antes de actualizar estado
                if (isUnmountingRef.current || clockingOut) {
                    console.log('[ServicioActivo] 🛑 Actualización cancelada: componente desmontando o Clock Out en progreso');
                    return;
                }

                if (!active) {
                    console.log('[ServicioActivo] ⚠️ No hay servicio activo, redirigiendo a Horario');
                    navigate(createPageUrl("Horario"), { replace: true });
                    return;
                }

                // Actualizar el servicio activo silenciosamente
                setActiveService(active);
                
                // Recargar información del cliente si cambió o no existe
                if (active.client_id && (!clientInfo || clientInfo.id !== active.client_id)) {
                    try {
                        const client = await base44.entities.Client.get(active.client_id);
                        if (!isUnmountingRef.current && !clockingOut) {
                            setClientInfo(client);
                            console.log('[ServicioActivo] Cliente actualizado por polling:', client.name);
                        }
                    } catch (clientError) {
                        console.warn('[ServicioActivo] Error actualizando cliente en polling:', clientError);
                    }
                }

                console.log('[ServicioActivo] ✅ Actualización automática completada');
            } catch (error) {
                console.error('[ServicioActivo] ❌ Error en polling automático:', error);
            }
        }, 20000); // 20 segundos

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
                console.log('[ServicioActivo] 🛑 Polling automático detenido');
            }
        };
    }, [loading, activeService, user, clientInfo, navigate, clockingOut]);

    const loadUserAndActiveService = async () => {
        // CRÍTICO: No cargar si estamos desmontando
        if (isUnmountingRef.current) return;

        try {
            const userData = await base44.auth.me();
            if (isUnmountingRef.current) return;
            setUser(userData);

            const schedules = await base44.entities.Schedule.list();
            if (isUnmountingRef.current) return;

            const schedulesArray = Array.isArray(schedules) ? schedules : [];
            
            const active = schedulesArray.find(schedule => {
                if (!schedule.cleaner_ids || !schedule.cleaner_ids.includes(userData.id)) return false;
                const cleanerClockData = schedule.clock_in_data?.find(c => c.cleaner_id === userData.id);
                return cleanerClockData?.clock_in_time && !cleanerClockData?.clock_out_time;
            });

            if (!active) {
                console.log('[ServicioActivo] No hay servicio activo, redirigiendo a Horario');
                navigate(createPageUrl("Horario"), { replace: true });
                return;
            }

            if (isUnmountingRef.current) return;
            setActiveService(active);

            // Cargar información del cliente
            if (active.client_id) {
                try {
                    const client = await base44.entities.Client.get(active.client_id);
                    if (!isUnmountingRef.current) {
                        setClientInfo(client);
                        console.log('[ServicioActivo] Cliente cargado:', client.name);
                        console.log('[ServicioActivo] Notas estructuradas del cliente:', client.structured_service_notes);
                        console.log('[ServicioActivo] Notas por defecto del cliente:', client.default_service_notes);
                    }
                } catch (clientError) {
                    console.warn('[ServicioActivo] Error cargando cliente:', clientError);
                }
            }

            // Calcular duración programada para este limpiador específico
            let duration = 0;
            const cleanerSchedule = active.cleaner_schedules?.find(cs => cs.cleaner_id === userData.id);
            
            if (cleanerSchedule && cleanerSchedule.start_time && cleanerSchedule.end_time) {
                const schedStart = parseISOAsUTC(cleanerSchedule.start_time);
                const schedEnd = parseISOAsUTC(cleanerSchedule.end_time);
                duration = Math.floor((schedEnd.getTime() - schedStart.getTime()) / 1000);
                console.log('[ServicioActivo] Duración individual del limpiador:', duration, 'segundos (', formatElapsedTime(duration), ')');
            } else {
                const schedStart = parseISOAsUTC(active.start_time);
                const schedEnd = parseISOAsUTC(active.end_time);
                duration = Math.floor((schedEnd.getTime() - schedStart.getTime()) / 1000);
                console.log('[ServicioActivo] Duración general del servicio:', duration, 'segundos (', formatElapsedTime(duration), ')');
            }
            
            if (isUnmountingRef.current) return;
            setScheduledDuration(duration);
            startTimer(active, userData.id, duration);

        } catch (error) {
            console.error('[ServicioActivo] Error cargando datos:', error);
            if (!isUnmountingRef.current) {
                setError("Error al cargar el servicio activo");
            }
        } finally {
            if (!isUnmountingRef.current) {
                setLoading(false);
            }
        }
    };

    const startTimer = (service, userId, duration) => {
        if (intervalRef.current) clearInterval(intervalRef.current);

        const updateTimer = () => {
            // CRÍTICO: No actualizar si estamos desmontando
            if (isUnmountingRef.current) return;

            const cleanerClockData = service.clock_in_data?.find(c => c.cleaner_id === userId);
            if (!cleanerClockData?.clock_in_time) return;

            const clockInTime = parseISOAsUTC(cleanerClockData.clock_in_time);
            const now = new Date();
            const elapsed = Math.floor((now.getTime() - clockInTime.getTime()) / 1000);
            
            setElapsedTime(elapsed);
            const remaining = Math.max(0, duration - elapsed);
            setRemainingTime(remaining);
        };

        updateTimer();
        intervalRef.current = setInterval(updateTimer, 1000);
    };

    const handleClockOut = async () => {
        if (!activeService || !user) return;

        console.log('[ServicioActivo] 🕐 Iniciando Clock Out...');
        
        // 🛑 PASO 1: MARCAR INMEDIATAMENTE QUE ESTAMOS HACIENDO CLOCK OUT
        setClockingOut(true);
        setError("");
        isUnmountingRef.current = true; // Marcar ANTES para prevenir actualizaciones

        // 🛑 PASO 2: DETENER POLLING Y TIMER INMEDIATAMENTE
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
            console.log('[ServicioActivo] 🛑 Polling detenido para Clock Out');
        }

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            console.log('[ServicioActivo] 🛑 Timer detenido para Clock Out');
        }

        try {
            // 🚀 PASO 3: MARCAR LOCALMENTE QUE NO HAY SERVICIO ACTIVO (OPTIMISTIC UPDATE)
            console.log('[ServicioActivo] 💾 Marcando localmente que no hay servicio activo...');
            localStorage.setItem(`active_service_${user.id}`, 'false');
            localStorage.setItem(`clock_out_pending_${user.id}`, 'true');
            localStorage.setItem(`clock_out_time_${user.id}`, Date.now().toString());
            
            // Actualizar el schedule en localStorage inmediatamente
            const cachedSchedules = localStorage.getItem('redoak_cleaner_schedules');
            if (cachedSchedules) {
                try {
                    const schedules = JSON.parse(cachedSchedules);
                    const updatedSchedules = schedules.map(schedule => {
                        if (schedule.id === activeService.id) {
                            const updatedClockInData = [...(schedule.clock_in_data || [])];
                            const existingIndex = updatedClockInData.findIndex(c => c.cleaner_id === user.id);
                            if (existingIndex >= 0) {
                                updatedClockInData[existingIndex] = {
                                    ...updatedClockInData[existingIndex],
                                    clock_out_time: new Date().toISOString()
                                };
                            }
                            return {
                                ...schedule,
                                clock_in_data: updatedClockInData,
                                status: 'completed'
                            };
                        }
                        return schedule;
                    });
                    localStorage.setItem('redoak_cleaner_schedules', JSON.stringify(updatedSchedules));
                } catch (error) {
                    console.warn('[ServicioActivo] Error actualizando cache:', error);
                }
            }

            // 🚀 PASO 4: REGISTRAR CLOCK OUT Y REDIRIGIR INMEDIATAMENTE
            console.log('[ServicioActivo] 💾 Registrando Clock Out en cola offline...');
            const result = await registerClockOut(activeService.id, user.id);
            console.log('[ServicioActivo] ✅ Clock Out registrado en cola:', result);

            // 🚀 PASO 5: REDIRIGIR INMEDIATAMENTE CON FLAG ESPECIAL
            console.log('[ServicioActivo] 🚀 Redirigiendo a Horario...');
            navigate(createPageUrl("Horario"), { 
                replace: true,
                state: { 
                    clockOutSuccess: true,
                    skipActiveCheck: true, // NUEVO: Flag para evitar verificación de servicio activo
                    message: '¡Clock Out registrado exitosamente! El servicio está completado.'
                }
            });

            // 📡 PASO 6: SINCRONIZACIÓN EN BACKGROUND (NO BLOQUEA LA REDIRECCIÓN)
            (async () => {
                try {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de sincronizar

                    const updatedClockInData = [...(activeService.clock_in_data || [])];
                    const existingIndex = updatedClockInData.findIndex(c => c.cleaner_id === user.id);
                    const currentTime = new Date().toISOString();

                    if (existingIndex >= 0) {
                        let userLocation = null;
                        if ('geolocation' in navigator) {
                            try {
                                const position = await new Promise((resolve, reject) => {
                                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                                        timeout: 5000,
                                        enableHighAccuracy: true
                                    });
                                });
                                userLocation = `${position.coords.latitude},${position.coords.longitude}`;
                            } catch (error) {
                                console.warn('[ServicioActivo] No se pudo obtener ubicación GPS:', error);
                            }
                        }

                        updatedClockInData[existingIndex] = {
                            ...updatedClockInData[existingIndex],
                            clock_out_time: currentTime,
                            clock_out_location: userLocation
                        };
                    }

                    // PASO CRÍTICO: Actualizar primero el clock_in_data
                    await base44.entities.Schedule.update(activeService.id, {
                        clock_in_data: updatedClockInData
                    });

                    // PASO CRÍTICO: Obtener el schedule FRESCO para verificar todos los limpiadores
                    const freshSchedule = await base44.entities.Schedule.get(activeService.id);
                    const allCleanerIds = Array.isArray(freshSchedule.cleaner_ids) ? freshSchedule.cleaner_ids : [];
                    const freshClockData = Array.isArray(freshSchedule.clock_in_data) ? freshSchedule.clock_in_data : [];

                    // Verificar si TODOS los limpiadores asignados han hecho clock out
                    const allHaveClockedOut = allCleanerIds.every(cleanerId => {
                        const clockData = freshClockData.find(c => c.cleaner_id === cleanerId);
                        return clockData && clockData.clock_out_time;
                    });

                    console.log(`[ServicioActivo] 🔍 Todos los limpiadores con clock out: ${allHaveClockedOut}`);

                    // SOLO marcar como completado si TODOS han hecho clock out
                    const finalStatus = allHaveClockedOut ? 'completed' : 'in_progress';

                    await base44.entities.Schedule.update(activeService.id, {
                        status: finalStatus
                    });

                    console.log(`[ServicioActivo] ✅ Estado actualizado a: ${finalStatus}`);

                    if (finalStatus === 'completed') {
                        console.log('[ServicioActivo] ✅ Todos cerraron, creando WorkEntries...');
                        try {
                            await base44.functions.invoke('processScheduleForWorkEntries', {
                                scheduleId: activeService.id,
                                mode: 'create'
                            });
                            console.log('[ServicioActivo] ✅ WorkEntries procesadas');
                        } catch (workEntryError) {
                            console.warn('[ServicioActivo] ⚠️ Error procesando WorkEntries:', workEntryError);
                        }
                    } else {
                        console.log('[ServicioActivo] ⏳ Algunos limpiadores aún activos, WorkEntries no creadas aún');
                    }

                    // Limpiar flags después de sincronización exitosa
                    localStorage.removeItem(`clock_out_pending_${user.id}`);
                    localStorage.removeItem(`clock_out_time_${user.id}`);
                } catch (error) {
                    console.error('[ServicioActivo] ❌ Error actualizando backend (pero Clock Out ya está en cola):', error);
                }
            })();

        } catch (error) {
            console.error('[ServicioActivo] ❌ Error en Clock Out:', error);
            // Si hubo un error ANTES de navegar, restaurar el estado
            isUnmountingRef.current = false; 
            setError("Error al registrar Clock Out. Por favor, inténtalo de nuevo.");
            setClockingOut(false);
            
            // Limpiar flags de optimistic update
            localStorage.setItem(`active_service_${user.id}`, 'true');
            localStorage.removeItem(`clock_out_pending_${user.id}`);
            localStorage.removeItem(`clock_out_time_${user.id}`);
            
            // Reiniciar polling y timer si hubo error
            console.warn('[ServicioActivo] Reintentando reiniciar polling y timer debido a error en Clock Out.');
            loadUserAndActiveService(); 
        }
    };

    const handleReportSuccess = (newReport) => {
        setShowReportDialog(false);
        setSuccess("¡Reporte enviado exitosamente! El administrador ha sido notificado.");
        setTimeout(() => setSuccess(""), 5000);
    };

    const openInMaps = (address) => {
        const encodedAddress = encodeURIComponent(address);
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
        // Cambiar window.open por window.location.href para mejor compatibilidad móvil
        // Esto permite volver a la app usando el botón "Atrás" del navegador
        window.location.href = mapsUrl;
    };

    // CORREGIDO: Función para obtener notas estructuradas (siempre del cliente como fuente principal)
    const getStructuredNotes = () => {
        // Prioridad 1: Del cliente (clientInfo) - más actualizado
        if (clientInfo?.structured_service_notes) {
            console.log('[ServicioActivo] Usando notas estructuradas del cliente');
            return clientInfo.structured_service_notes;
        }
        
        // Fallback: Del servicio (para compatibilidad con servicios antiguos)
        if (activeService?.structured_service_notes) {
            console.log('[ServicioActivo] Usando notas estructuradas del servicio (fallback)');
            return activeService.structured_service_notes;
        }
        
        console.log('[ServicioActivo] No hay notas estructuradas disponibles');
        return null;
    };

    // CORREGIDO: Función para obtener notas por defecto del cliente
    const getDefaultClientNotes = () => {
        // Prioridad 1: Del cliente (clientInfo) - más actualizado
        if (clientInfo?.default_service_notes) {
            console.log('[ServicioActivo] Usando notas por defecto del cliente');
            return clientInfo.default_service_notes;
        }
        
        // Fallback: Intentar del servicio si tiene notes_public que no sean específicas
        if (activeService?.notes_public && !activeService?.service_specific_notes) {
            console.log('[ServicioActivo] Usando notes_public del servicio como fallback');
            return activeService.notes_public;
        }
        
        console.log('[ServicioActivo] No hay notas por defecto disponibles');
        return null;
    };

    // Función para obtener notas específicas del servicio
    const getServiceSpecificNotes = () => {
        return activeService?.service_specific_notes || null;
    };

    // CORREGIDO: Función para obtener fotos por defecto del cliente
    const getDefaultClientPhotos = () => {
        // Prioridad 1: Del cliente (clientInfo)
        if (clientInfo?.default_photo_urls && clientInfo.default_photo_urls.length > 0) {
            console.log('[ServicioActivo] Usando fotos por defecto del cliente');
            return clientInfo.default_photo_urls;
        }
        
        console.log('[ServicioActivo] No hay fotos por defecto disponibles');
        return [];
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-slate-600">Cargando servicio activo...</p>
                </div>
            </div>
        );
    }

    if (!activeService) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="pt-6">
                        <div className="text-center space-y-4">
                            <AlertCircle className="w-16 h-16 text-slate-400 mx-auto" />
                            <h2 className="text-xl font-bold text-slate-800">No hay servicio activo</h2>
                            <p className="text-slate-600">No tienes ningún servicio en progreso en este momento.</p>
                            <Button onClick={() => navigate(createPageUrl("Horario"))}>
                                Ir al Horario
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const clockInTime = activeService && user 
        ? parseISOAsUTC(activeService.clock_in_data?.find(c => c.cleaner_id === user.id)?.clock_in_time)
        : null;

    const percentageComplete = scheduledDuration > 0
        ? (elapsedTime / scheduledDuration) * 100
        : 0;

    // CORREGIDO: Obtener notas y fotos usando las funciones que priorizan el cliente
    const structuredNotes = getStructuredNotes();
    const defaultClientNotes = getDefaultClientNotes();
    const serviceSpecificNotes = getServiceSpecificNotes();
    const defaultClientPhotos = getDefaultClientPhotos();

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 pb-20">
            <div className="max-w-2xl mx-auto space-y-4">
                {error && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {success && (
                    <Alert className="bg-green-50 border-green-200">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-800">{success}</AlertDescription>
                    </Alert>
                )}

                {/* Información del Cliente */}
                <Card className="shadow-lg border-2 border-blue-200">
                    <CardContent className="pt-6">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                                <h1 className="text-2xl font-bold text-slate-900 mb-2">
                                    {activeService.client_name}
                                </h1>
                                <button
                                    onClick={() => openInMaps(activeService.client_address)}
                                    className="flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors group"
                                >
                                    <MapPin className="w-5 h-5" />
                                    <span className="text-sm underline">{activeService.client_address}</span>
                                    <Navigation className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </div>
                            <Badge className="bg-green-100 text-green-800 border-green-300 px-3 py-1">
                                <Clock className="w-4 h-4 mr-1" />
                                En Servicio
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                {activeService && (
                    <>
                        {/* Tiempo Trabajado Card */}
                        <Card className="bg-white border-2 border-blue-200 shadow-lg">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-5 h-5 text-blue-600" />
                                        <h3 className="text-lg font-bold text-slate-800">Tiempo Trabajado</h3>
                                    </div>
                                    {/* NUEVO: Mostrar hora de Clock In */}
                                    <div className="bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                                        <p className="text-xs text-slate-600 font-medium">Inicio:</p>
                                        <p className="text-sm font-bold text-blue-700">
                                            {clockInTime ? format(clockInTime, 'HH:mm', { locale: es }) : '--:--'}
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="text-center mb-4">
                                    <p className="text-5xl font-bold text-blue-600 font-mono tracking-tight">
                                        {formatElapsedTime(elapsedTime)}
                                    </p>
                                    <p className="text-sm text-slate-500 mt-2">Tiempo transcurrido</p>
                                </div>

                                {scheduledDuration > 0 && (
                                    <>
                                        <div className="w-full bg-slate-200 rounded-full h-3 mb-2 overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-500 ${
                                                    percentageComplete > 100 ? 'bg-red-500' : 'bg-blue-500'
                                                }`}
                                                style={{ width: `${Math.min(percentageComplete, 100)}%` }}
                                            />
                                        </div>
                                        <p className="text-center text-sm text-slate-600 font-medium">
                                            {percentageComplete > 100 ? (
                                                <span className="text-red-600 font-bold">
                                                    ⚠️ {Math.round(percentageComplete)}% - Tiempo extra: {formatElapsedTime(elapsedTime - scheduledDuration)}
                                                </span>
                                            ) : (
                                                <span>
                                                    {Math.round(percentageComplete)}% completado (Est. {formatElapsedTime(scheduledDuration)})
                                                </span>
                                            )}
                                        </p>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}

                {/* Información de Acceso */}
                {clientInfo?.has_access && (
                    <Card className="shadow-lg">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <KeySquare className="w-5 h-5 text-purple-600" />
                                Información de Acceso
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div>
                                <span className="font-semibold text-slate-700">Tipo:</span>
                                <span className="ml-2 text-slate-600">
                                    {clientInfo.access_type === 'key' ? 'Key' :
                                     clientInfo.access_type === 'smart_lock' ? 'Smart Lock' :
                                     clientInfo.access_type === 'lockbox' ? 'Lockbox' : 'Otro'}
                                </span>
                            </div>
                            {clientInfo.access_identifier && (
                                <div>
                                    <span className="font-semibold text-slate-700">Identificador:</span>
                                    <span className="ml-2 text-slate-600 font-mono bg-slate-100 px-2 py-1 rounded">
                                        {clientInfo.access_identifier}
                                    </span>
                                </div>
                            )}
                            {clientInfo.access_instructions && (
                                <div>
                                    <span className="font-semibold text-slate-700">Instrucciones:</span>
                                    <p className="text-slate-600 mt-1 whitespace-pre-wrap">
                                        {clientInfo.access_instructions}
                                    </p>
                                </div>
                            )}
                            {clientInfo.access_photos && clientInfo.access_photos.length > 0 && (
                                <div className="mt-3">
                                    <span className="font-semibold text-slate-700 block mb-2">Fotos de Acceso:</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        {clientInfo.access_photos.map((photo, index) => (
                                            <div key={index} className="relative group">
                                                <img
                                                    src={photo.url}
                                                    alt={photo.comment || `Foto de acceso ${index + 1}`}
                                                    className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
                                                    onClick={() => window.open(photo.url, '_blank')}
                                                />
                                                {photo.comment && (
                                                    <p className="text-xs text-slate-600 mt-1">{photo.comment}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Mascotas */}
                {clientInfo?.pets && clientInfo.pets.length > 0 && (
                    <Card className="shadow-lg">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <PawPrint className="w-5 h-5 text-orange-600" />
                                Mascotas
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {clientInfo.pets.map((pet, index) => (
                                    <div key={index} className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <h4 className="font-bold text-orange-900">{pet.name}</h4>
                                                <p className="text-sm text-orange-700">
                                                    {pet.type} {pet.breed ? `- ${pet.breed}` : ''}
                                                </p>
                                            </div>
                                            {pet.age && (
                                                <Badge variant="outline" className="bg-white">
                                                    {pet.age}
                                                </Badge>
                                            )}
                                        </div>
                                        {pet.temperament && (
                                            <p className="text-sm text-orange-800 mb-1">
                                                <strong>Temperamento:</strong> {pet.temperament}
                                            </p>
                                        )}
                                        {pet.special_instructions && (
                                            <p className="text-sm text-orange-800">
                                                <strong>Instrucciones:</strong> {pet.special_instructions}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Notas Estructuradas del Cliente */}
                {structuredNotes && Object.keys(structuredNotes).length > 0 && (
                    <Card className="shadow-lg">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <FileText className="w-5 h-5 text-indigo-600" />
                                Instrucciones por Área
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Accordion type="multiple" className="w-full">
                                {structuredNotes.dusting_wiping_tidyup && (structuredNotes.dusting_wiping_tidyup.notes || (structuredNotes.dusting_wiping_tidyup.photos && structuredNotes.dusting_wiping_tidyup.photos.length > 0)) && (
                                    <AccordionItem value="dusting">
                                        <AccordionTrigger className="text-base font-semibold">
                                            🧹 Dusting / Wiping / Tidy Up
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            {structuredNotes.dusting_wiping_tidyup.notes && (
                                                <p className="text-slate-700 whitespace-pre-wrap mb-3">
                                                    {structuredNotes.dusting_wiping_tidyup.notes}
                                                </p>
                                            )}
                                            {structuredNotes.dusting_wiping_tidyup.photos && structuredNotes.dusting_wiping_tidyup.photos.length > 0 && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {structuredNotes.dusting_wiping_tidyup.photos.map((photo, idx) => (
                                                        <div key={idx}>
                                                            <img
                                                                src={photo.url}
                                                                alt={photo.comment || 'Foto'}
                                                                className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90"
                                                                onClick={() => window.open(photo.url, '_blank')}
                                                            />
                                                            {photo.comment && (
                                                                <p className="text-xs text-slate-600 mt-1">{photo.comment}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                )}

                                {structuredNotes.kitchen_and_pantry && (structuredNotes.kitchen_and_pantry.notes || (structuredNotes.kitchen_and_pantry.photos && structuredNotes.kitchen_and_pantry.photos.length > 0)) && (
                                    <AccordionItem value="kitchen">
                                        <AccordionTrigger className="text-base font-semibold">
                                            🍳 Kitchen and Pantry
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            {structuredNotes.kitchen_and_pantry.notes && (
                                                <p className="text-slate-700 whitespace-pre-wrap mb-3">
                                                    {structuredNotes.kitchen_and_pantry.notes}
                                                </p>
                                            )}
                                            {structuredNotes.kitchen_and_pantry.photos && structuredNotes.kitchen_and_pantry.photos.length > 0 && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {structuredNotes.kitchen_and_pantry.photos.map((photo, idx) => (
                                                        <div key={idx}>
                                                            <img
                                                                src={photo.url}
                                                                alt={photo.comment || 'Foto'}
                                                                className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90"
                                                                onClick={() => window.open(photo.url, '_blank')}
                                                            />
                                                            {photo.comment && (
                                                                <p className="text-xs text-slate-600 mt-1">{photo.comment}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                )}

                                {structuredNotes.bathrooms && (structuredNotes.bathrooms.notes || (structuredNotes.bathrooms.photos && structuredNotes.bathrooms.photos.length > 0)) && (
                                    <AccordionItem value="bathrooms">
                                        <AccordionTrigger className="text-base font-semibold">
                                            🚿 Bathrooms
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            {structuredNotes.bathrooms.notes && (
                                                <p className="text-slate-700 whitespace-pre-wrap mb-3">
                                                    {structuredNotes.bathrooms.notes}
                                                </p>
                                            )}
                                            {structuredNotes.bathrooms.photos && structuredNotes.bathrooms.photos.length > 0 && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {structuredNotes.bathrooms.photos.map((photo, idx) => (
                                                        <div key={idx}>
                                                            <img
                                                                src={photo.url}
                                                                alt={photo.comment || 'Foto'}
                                                                className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90"
                                                                onClick={() => window.open(photo.url, '_blank')}
                                                            />
                                                            {photo.comment && (
                                                                <p className="text-xs text-slate-600 mt-1">{photo.comment}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                )}

                                {structuredNotes.laundry && (structuredNotes.laundry.notes || (structuredNotes.laundry.photos && structuredNotes.laundry.photos.length > 0)) && (
                                    <AccordionItem value="laundry">
                                        <AccordionTrigger className="text-base font-semibold">
                                            🧺 Laundry
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            {structuredNotes.laundry.notes && (
                                                <p className="text-slate-700 whitespace-pre-wrap mb-3">
                                                    {structuredNotes.laundry.notes}
                                                </p>
                                            )}
                                            {structuredNotes.laundry.photos && structuredNotes.laundry.photos.length > 0 && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {structuredNotes.laundry.photos.map((photo, idx) => (
                                                        <div key={idx}>
                                                            <img
                                                                src={photo.url}
                                                                alt={photo.comment || 'Foto'}
                                                                className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90"
                                                                onClick={() => window.open(photo.url, '_blank')}
                                                            />
                                                            {photo.comment && (
                                                                <p className="text-xs text-slate-600 mt-1">{photo.comment}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                )}

                                {structuredNotes.floors && (structuredNotes.floors.notes || (structuredNotes.floors.photos && structuredNotes.floors.photos.length > 0)) && (
                                    <AccordionItem value="floors">
                                        <AccordionTrigger className="text-base font-semibold">
                                            🧽 Floors
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            {structuredNotes.floors.notes && (
                                                <p className="text-slate-700 whitespace-pre-wrap mb-3">
                                                    {structuredNotes.floors.notes}
                                                </p>
                                            )}
                                            {structuredNotes.floors.photos && structuredNotes.floors.photos.length > 0 && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {structuredNotes.floors.photos.map((photo, idx) => (
                                                        <div key={idx}>
                                                            <img
                                                                src={photo.url}
                                                                alt={photo.comment || 'Foto'}
                                                                className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90"
                                                                onClick={() => window.open(photo.url, '_blank')}
                                                            />
                                                            {photo.comment && (
                                                                <p className="text-xs text-slate-600 mt-1">{photo.comment}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                )}

                                {structuredNotes.other_areas && (structuredNotes.other_areas.notes || (structuredNotes.other_areas.photos && structuredNotes.other_areas.photos.length > 0)) && (
                                    <AccordionItem value="other">
                                        <AccordionTrigger className="text-base font-semibold">
                                            🏠 Other Areas
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            {structuredNotes.other_areas.notes && (
                                                <p className="text-slate-700 whitespace-pre-wrap mb-3">
                                                    {structuredNotes.other_areas.notes}
                                                </p>
                                            )}
                                            {structuredNotes.other_areas.photos && structuredNotes.other_areas.photos.length > 0 && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {structuredNotes.other_areas.photos.map((photo, idx) => (
                                                        <div key={idx}>
                                                            <img
                                                                src={photo.url}
                                                                alt={photo.comment || 'Foto'}
                                                                className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90"
                                                                onClick={() => window.open(photo.url, '_blank')}
                                                            />
                                                            {photo.comment && (
                                                                <p className="text-xs text-slate-600 mt-1">{photo.comment}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                )}
                            </Accordion>
                        </CardContent>
                    </Card>
                )}

                {/* Notas Generales del Cliente */}
                {defaultClientNotes && (
                    <Card className="shadow-lg">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <FileText className="w-5 h-5 text-blue-600" />
                                Notas Generales del Cliente
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-700 whitespace-pre-wrap">
                                {defaultClientNotes}
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Fotos por Defecto del Cliente */}
                {defaultClientPhotos.length > 0 && (
                    <Card className="shadow-lg">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Camera className="w-5 h-5 text-blue-600" />
                                Fotos de Referencia del Cliente
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-2">
                                {defaultClientPhotos.map((photo, index) => (
                                    <div key={index}>
                                        <img
                                            src={photo.url}
                                            alt={photo.comment || `Foto ${index + 1}`}
                                            className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
                                            onClick={() => window.open(photo.url, '_blank')}
                                        />
                                        {photo.comment && (
                                            <p className="text-xs text-slate-600 mt-1">{photo.comment}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Notas Específicas del Servicio */}
                {serviceSpecificNotes && (
                    <Card className="shadow-lg border-l-4 border-l-purple-500">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <FileText className="w-5 h-5 text-purple-600" />
                                Notas Adicionales para Este Servicio
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-700 whitespace-pre-wrap">
                                {serviceSpecificNotes}
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Fotos del Servicio */}
                {activeService.photo_urls && activeService.photo_urls.length > 0 && (
                    <Card className="shadow-lg">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Camera className="w-5 h-5 text-purple-600" />
                                Fotos del Servicio
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-2">
                                {activeService.photo_urls.map((photo, index) => (
                                    <div key={index}>
                                        <img
                                            src={photo.url}
                                            alt={photo.comment || `Foto ${index + 1}`}
                                            className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
                                            onClick={() => window.open(photo.url, '_blank')}
                                        />
                                        {photo.comment && (
                                            <p className="text-xs text-slate-600 mt-1">{photo.comment}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Botones de Acción */}
                <div className="space-y-3 sticky bottom-4">
                    <Button
                        onClick={() => setShowReportDialog(true)}
                        variant="outline"
                        disabled={clockingOut}
                        className="w-full h-14 text-base font-semibold border-2 border-amber-500 text-amber-700 hover:bg-amber-50"
                    >
                        <AlertTriangle className="w-5 h-5 mr-2" />
                        Reportar un Problema
                    </Button>
                    
                    <Button
                        onClick={handleClockOut}
                        disabled={clockingOut}
                        className="w-full h-14 text-base font-semibold bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {clockingOut ? (
                            <>
                                <Clock className="w-5 h-5 mr-2 animate-spin" />
                                Finalizando Servicio...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-5 h-5 mr-2" />
                                Finalizar Servicio (Clock Out)
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Dialog para reportar problema */}
            <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <AlertTriangle className="w-6 h-6 text-amber-600" />
                            Reportar un Problema
                        </DialogTitle>
                    </DialogHeader>
                    <ServiceReportForm
                        scheduleId={activeService.id}
                        clientName={activeService.client_name}
                        serviceDate={format(parseISOAsUTC(activeService.start_time), 'yyyy-MM-dd')}
                        cleanerId={user?.id}
                        cleanerName={user?.full_name}
                        onSuccess={handleReportSuccess}
                        onCancel={() => setShowReportDialog(false)}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}