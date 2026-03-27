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

// Parsear ISO string como local (sin conversión de timezone)
const parseISOAsUTC = (isoString) => {
    if (!isoString) return null;
    // Tratar el string directamente como local (YYYY-MM-DDTHH:mm:00.000 sin Z)
    const clean = isoString.endsWith('Z') ? isoString.slice(0, -1) : isoString;
    return new Date(clean);
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

            // 🚀 PASO 1: Cargar datos INMEDIATAMENTE desde localStorage para mostrar UI rápido
            console.log('[ServicioActivo] 📦 Cargando datos iniciales desde localStorage...');
            const cachedActiveService = localStorage.getItem('redoak_active_service');
            if (cachedActiveService) {
                try {
                    const parsed = JSON.parse(cachedActiveService);
                    if (parsed.fullSchedule) {
                        console.log('[ServicioActivo] ✅ Mostrando servicio desde caché:', parsed.clientName);
                        setActiveService(parsed.fullSchedule);
                        setLoading(false); // Mostrar UI inmediatamente
                        
                        // Calcular duración desde cache
                        const cleanerSchedule = parsed.fullSchedule.cleaner_schedules?.find(cs => cs.cleaner_id === userData.id);
                        let duration = 0;
                        if (cleanerSchedule?.start_time && cleanerSchedule?.end_time) {
                            const schedStart = parseISOAsUTC(cleanerSchedule.start_time);
                            const schedEnd = parseISOAsUTC(cleanerSchedule.end_time);
                            duration = Math.floor((schedEnd.getTime() - schedStart.getTime()) / 1000);
                        } else {
                            const schedStart = parseISOAsUTC(parsed.fullSchedule.start_time);
                            const schedEnd = parseISOAsUTC(parsed.fullSchedule.end_time);
                            duration = Math.floor((schedEnd.getTime() - schedStart.getTime()) / 1000);
                        }
                        setScheduledDuration(duration);
                        startTimer(parsed.fullSchedule, userData.id, duration);
                    }
                } catch (parseError) {
                    console.warn('[ServicioActivo] Error parseando cache:', parseError);
                }
            }

            // 🚀 PASO 2: Actualizar en background desde la base de datos
            console.log('[ServicioActivo] 🔄 Sincronizando con base de datos en background...');
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

    const handleClockOut = async (retryCount = 0) => {
        if (!activeService || !user) return;

        const MAX_RETRIES = 3;
        console.log(`[ServicioActivo] 🕐 Iniciando Clock Out (intento ${retryCount + 1}/${MAX_RETRIES + 1})...`);
        
        // 🛑 PASO 1: BLOQUEAR UI Y DETENER ACTUALIZACIONES
        setClockingOut(true);
        setError("");
        isUnmountingRef.current = true;

        // 🛑 PASO 2: DETENER POLLING Y TIMER INMEDIATAMENTE
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
            console.log('[ServicioActivo] 🛑 Polling detenido');
        }

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            console.log('[ServicioActivo] 🛑 Timer detenido');
        }

        try {
            // 🚀 PASO 3: OBTENER UBICACIÓN GPS (ANTES de actualizar BD)
            let userLocation = null;
            if ('geolocation' in navigator) {
                try {
                    const position = await Promise.race([
                        new Promise((resolve, reject) => {
                            navigator.geolocation.getCurrentPosition(resolve, reject, {
                                timeout: 8000,
                                enableHighAccuracy: false,
                                maximumAge: 30000
                            });
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('GPS timeout')), 8000))
                    ]);
                    userLocation = `${position.coords.latitude},${position.coords.longitude}`;
                    console.log('[ServicioActivo] 📍 Ubicación GPS obtenida');
                } catch (gpsError) {
                    console.warn('[ServicioActivo] ⚠️ No se pudo obtener GPS:', gpsError.message);
                }
            }

            // 🚀 PASO 4: ACTUALIZAR CLOCK_IN_DATA EN BASE DE DATOS
            console.log('[ServicioActivo] 💾 Actualizando clock_in_data en BD...');
            const updatedClockInData = [...(activeService.clock_in_data || [])];
            const existingIndex = updatedClockInData.findIndex(c => c.cleaner_id === user.id);
            // Clock out time en formato local sin timezone
        const _now = new Date();
        const currentTime = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}T${String(_now.getHours()).padStart(2,'0')}:${String(_now.getMinutes()).padStart(2,'0')}:00.000`;

            if (existingIndex >= 0) {
                updatedClockInData[existingIndex] = {
                    ...updatedClockInData[existingIndex],
                    clock_out_time: currentTime,
                    clock_out_location: userLocation
                };
            } else {
                updatedClockInData.push({
                    cleaner_id: user.id,
                    clock_in_time: activeService.clock_in_data?.find(c => c.cleaner_id === user.id)?.clock_in_time || currentTime,
                    clock_out_time: currentTime,
                    clock_out_location: userLocation
                });
            }

            await base44.entities.Schedule.update(activeService.id, {
                clock_in_data: updatedClockInData
            });
            console.log('[ServicioActivo] ✅ Clock Out registrado en BD');

            // 🚀 PASO 5: VERIFICAR ESTADO DEL SERVICIO
            console.log('[ServicioActivo] 🔍 Verificando estado del servicio...');
            const freshSchedule = await base44.entities.Schedule.get(activeService.id);
            const allCleanerIds = Array.isArray(freshSchedule.cleaner_ids) ? freshSchedule.cleaner_ids : [];
            const freshClockData = Array.isArray(freshSchedule.clock_in_data) ? freshSchedule.clock_in_data : [];

            const allHaveClockedOut = allCleanerIds.every(cleanerId => {
                const clockData = freshClockData.find(c => c.cleaner_id === cleanerId);
                return clockData && clockData.clock_out_time;
            });

            console.log(`[ServicioActivo] 🔍 Todos con clock out: ${allHaveClockedOut}`);
            const finalStatus = allHaveClockedOut ? 'completed' : 'in_progress';

            // 🚀 PASO 6: ACTUALIZAR ESTADO DEL SERVICIO
            await base44.entities.Schedule.update(activeService.id, {
                status: finalStatus
            });
            console.log(`[ServicioActivo] ✅ Estado actualizado a: ${finalStatus}`);

            // 🚀 PASO 7: CREAR WORK ENTRIES SI CORRESPONDE
            if (finalStatus === 'completed') {
                console.log('[ServicioActivo] 📝 Todos cerraron, creando WorkEntries...');
                try {
                    await base44.functions.invoke('processScheduleForWorkEntries', {
                        scheduleId: activeService.id,
                        mode: 'create'
                    });
                    console.log('[ServicioActivo] ✅ WorkEntries creadas');
                } catch (workEntryError) {
                    console.warn('[ServicioActivo] ⚠️ Error creando WorkEntries:', workEntryError);
                }
            }

            // 🚀 PASO 8: ACTUALIZAR CACHE LOCAL
            console.log('[ServicioActivo] 💾 Actualizando cache local...');
            localStorage.setItem(`active_service_${user.id}`, 'false');
            registerClockOut(activeService.id, user.id);
            
            const cachedSchedules = localStorage.getItem('redoak_cleaner_schedules');
            if (cachedSchedules) {
                try {
                    const schedules = JSON.parse(cachedSchedules);
                    const updatedSchedules = schedules.map(schedule => {
                        if (schedule.id === activeService.id) {
                            return {
                                ...schedule,
                                clock_in_data: updatedClockInData,
                                status: finalStatus
                            };
                        }
                        return schedule;
                    });
                    localStorage.setItem('redoak_cleaner_schedules', JSON.stringify(updatedSchedules));
                } catch (error) {
                    console.warn('[ServicioActivo] ⚠️ Error actualizando cache:', error);
                }
            }

            // 🎉 PASO 9: ÉXITO - REDIRIGIR
            console.log('[ServicioActivo] 🎉 Clock Out completado exitosamente, redirigiendo...');
            setTimeout(() => {
                navigate(createPageUrl("Horario"), { 
                    replace: true,
                    state: { 
                        clockOutSuccess: true,
                        message: '✅ Clock Out exitoso. ¡Servicio finalizado!'
                    }
                });
            }, 500);

        } catch (error) {
            console.error(`[ServicioActivo] ❌ Error en Clock Out (intento ${retryCount + 1}):`, error);
            
            // 🔄 REINTENTAR SI NO SE ALCANZÓ EL MÁXIMO
            if (retryCount < MAX_RETRIES) {
                const delay = Math.pow(2, retryCount) * 1000; // Backoff exponencial
                console.log(`[ServicioActivo] 🔄 Reintentando en ${delay/1000}s...`);
                setError(`Error en Clock Out. Reintentando automáticamente (${retryCount + 1}/${MAX_RETRIES})...`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
                return handleClockOut(retryCount + 1);
            }
            
            // ❌ MÁXIMO DE REINTENTOS ALCANZADO
            console.error('[ServicioActivo] ❌ Clock Out falló después de todos los reintentos');
            isUnmountingRef.current = false;
            setClockingOut(false);
            setError(
                `❌ No se pudo completar el Clock Out después de ${MAX_RETRIES + 1} intentos. ` +
                `Por favor, verifica tu conexión a internet y vuelve a intentar. ` +
                `Si el problema persiste, contacta al administrador.`
            );
            
            // Reiniciar polling y timer
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
        <div className="min-h-screen bg-slate-50 pb-24">
            <div className="max-w-2xl mx-auto">

                {/* Alerts */}
                <div className="px-4 pt-4 space-y-2">
                    {error && (
                        <Alert variant="destructive" className="border-0 shadow-sm">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription className="font-medium text-sm">{error}</AlertDescription>
                        </Alert>
                    )}
                    {clockingOut && (
                        <Alert className="bg-blue-50 border border-blue-200">
                            <Clock className="h-4 w-4 text-blue-600 animate-spin" />
                            <AlertDescription className="text-blue-800 font-semibold text-xs">
                                Finalizando servicio... No cierres esta página.
                            </AlertDescription>
                        </Alert>
                    )}
                    {success && (
                        <Alert className="bg-green-50 border-green-200">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-800 text-xs">{success}</AlertDescription>
                        </Alert>
                    )}
                </div>

                {/* Hero: dark header with timer */}
                <div className="bg-slate-900 text-white px-5 pt-5 pb-8 mt-3 mx-4 rounded-3xl shadow-xl">
                    <div className="flex items-start justify-between mb-1">
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">En Servicio</p>
                            <h1 className="text-xl font-bold text-white leading-tight truncate">{activeService.client_name}</h1>
                        </div>
                        <span className="flex items-center gap-1.5 bg-green-500/20 text-green-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-500/30 ml-3 flex-shrink-0">
                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                            Activo
                        </span>
                    </div>
                    <button
                        onClick={() => openInMaps(activeService.client_address)}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors mt-1.5 group"
                    >
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="text-xs underline underline-offset-2 truncate">{activeService.client_address}</span>
                        <Navigation className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </button>

                    <div className="mt-6 text-center">
                        <p className="text-6xl font-mono font-bold text-white tracking-tight tabular-nums">
                            {formatElapsedTime(elapsedTime)}
                        </p>
                        {clockInTime && (
                            <p className="text-xs text-slate-400 mt-1">Inicio: {format(clockInTime, 'HH:mm', { locale: es })}</p>
                        )}
                    </div>

                    {scheduledDuration > 0 && (
                        <div className="mt-4">
                            <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        percentageComplete > 100 ? 'bg-red-400' : 'bg-blue-400'
                                    }`}
                                    style={{ width: `${Math.min(percentageComplete, 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between mt-1.5">
                                <span className="text-xs text-slate-400">{Math.round(percentageComplete)}%</span>
                                <span className="text-xs text-slate-400">
                                    {percentageComplete > 100
                                        ? `+${formatElapsedTime(elapsedTime - scheduledDuration)} extra`
                                        : `Est: ${formatElapsedTime(scheduledDuration)}`}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="px-4 mt-4 space-y-2">
                    <Button
                        onClick={() => handleClockOut(0)}
                        disabled={clockingOut}
                        className="w-full h-12 text-sm font-bold bg-green-600 hover:bg-green-700 shadow-md disabled:opacity-70 rounded-xl"
                    >
                        {clockingOut ? (
                            <><Clock className="w-4 h-4 mr-2 animate-spin" />Procesando...</>
                        ) : (
                            <><CheckCircle className="w-4 h-4 mr-2" />Finalizar Servicio (Clock Out)</>
                        )}
                    </Button>
                    <Button
                        onClick={() => setShowReportDialog(true)}
                        variant="outline"
                        disabled={clockingOut}
                        className="w-full h-10 text-xs font-semibold border-amber-200 text-amber-700 hover:bg-amber-50 rounded-xl"
                    >
                        <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                        Reportar un Problema
                    </Button>
                </div>

                {/* Info Cards */}
                <div className="px-4 mt-4 space-y-3">

                {clientInfo?.has_access && (
                    <Card className="border-0 shadow-sm rounded-2xl">
                        <CardHeader className="pb-2 pt-4 px-4">
                            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                <KeySquare className="w-4 h-4 text-violet-500" /> Acceso
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4 space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-slate-500 text-xs">Tipo:</span>
                                <span className="font-medium text-slate-800">
                                    {clientInfo.access_type === 'key' ? 'Llave' : clientInfo.access_type === 'smart_lock' ? 'Smart Lock' : clientInfo.access_type === 'lockbox' ? 'Lockbox' : 'Otro'}
                                </span>
                            </div>
                            {clientInfo.access_identifier && (
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-500 text-xs">ID:</span>
                                    <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-sm">{clientInfo.access_identifier}</span>
                                </div>
                            )}
                            {clientInfo.access_instructions && (
                                <p className="text-slate-700 text-xs bg-violet-50 rounded-lg p-2.5 mt-1">{clientInfo.access_instructions}</p>
                            )}
                            {clientInfo.access_photos && clientInfo.access_photos.length > 0 && (
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    {clientInfo.access_photos.map((photo, i) => (
                                        <div key={i}>
                                            <img src={photo.url} alt={photo.comment || `Foto ${i+1}`} className="w-full h-28 object-cover rounded-xl cursor-pointer" onClick={() => window.open(photo.url, '_blank')} />
                                            {photo.comment && <p className="text-xs text-slate-500 mt-1">{photo.comment}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {clientInfo?.pets && clientInfo.pets.length > 0 && (
                    <Card className="border-0 shadow-sm rounded-2xl">
                        <CardHeader className="pb-2 pt-4 px-4">
                            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                <PawPrint className="w-4 h-4 text-orange-500" /> Mascotas
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4 space-y-2">
                            {clientInfo.pets.map((pet, i) => (
                                <div key={i} className="bg-orange-50 rounded-xl p-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className="font-bold text-orange-900 text-sm">{pet.name}</h4>
                                        {pet.age && <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">{pet.age}</span>}
                                    </div>
                                    <p className="text-xs text-orange-700">{pet.type}{pet.breed ? ` — ${pet.breed}` : ''}</p>
                                    {pet.temperament && <p className="text-xs text-orange-800 mt-1"><strong>Temperamento:</strong> {pet.temperament}</p>}
                                    {pet.special_instructions && <p className="text-xs text-orange-800 mt-1"><strong>Instrucciones:</strong> {pet.special_instructions}</p>}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {structuredNotes && Object.keys(structuredNotes).length > 0 && (
                    <Card className="border-0 shadow-sm rounded-2xl">
                        <CardHeader className="pb-2 pt-4 px-4">
                            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                <FileText className="w-4 h-4 text-indigo-500" /> Instrucciones por Área
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <Accordion type="multiple" className="w-full">
                                {[
                                    { key: 'dusting_wiping_tidyup', label: '🧹 Dusting / Wiping / Tidy Up' },
                                    { key: 'kitchen_and_pantry', label: '🍳 Kitchen and Pantry' },
                                    { key: 'bathrooms', label: '🚿 Bathrooms' },
                                    { key: 'laundry', label: '🧷 Laundry' },
                                    { key: 'floors', label: '🧽 Floors' },
                                    { key: 'other_areas', label: '🏠 Other Areas' },
                                ].filter(({ key }) => { const s = structuredNotes[key]; return s && (s.notes || (s.photos && s.photos.length > 0)); })
                                .map(({ key, label }) => (
                                    <AccordionItem key={key} value={key} className="border-b border-slate-100">
                                        <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">{label}</AccordionTrigger>
                                        <AccordionContent className="pb-3">
                                            {structuredNotes[key].notes && <p className="text-slate-700 text-sm whitespace-pre-wrap bg-slate-50 rounded-lg p-2.5 mb-2">{structuredNotes[key].notes}</p>}
                                            {structuredNotes[key].photos && structuredNotes[key].photos.length > 0 && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {structuredNotes[key].photos.map((photo, idx) => (
                                                        <div key={idx}>
                                                            <img src={photo.url} alt={photo.comment || 'Foto'} className="w-full h-28 object-cover rounded-xl cursor-pointer" onClick={() => window.open(photo.url, '_blank')} />
                                                            {photo.comment && <p className="text-xs text-slate-500 mt-1">{photo.comment}</p>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </CardContent>
                    </Card>
                )}

                {defaultClientNotes && (
                    <Card className="border-0 shadow-sm rounded-2xl">
                        <CardHeader className="pb-2 pt-4 px-4">
                            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                <FileText className="w-4 h-4 text-blue-500" /> Notas del Cliente
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <p className="text-slate-700 text-sm whitespace-pre-wrap">{defaultClientNotes}</p>
                        </CardContent>
                    </Card>
                )}

                {defaultClientPhotos.length > 0 && (
                    <Card className="border-0 shadow-sm rounded-2xl">
                        <CardHeader className="pb-2 pt-4 px-4">
                            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                <Camera className="w-4 h-4 text-blue-500" /> Fotos de Referencia
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <div className="grid grid-cols-2 gap-2">
                                {defaultClientPhotos.map((photo, i) => (
                                    <div key={i}>
                                        <img src={photo.url} alt={photo.comment || `Foto ${i+1}`} className="w-full h-28 object-cover rounded-xl cursor-pointer" onClick={() => window.open(photo.url, '_blank')} />
                                        {photo.comment && <p className="text-xs text-slate-500 mt-1">{photo.comment}</p>}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {serviceSpecificNotes && (
                    <Card className="border-0 shadow-sm rounded-2xl border-l-4 border-l-violet-400">
                        <CardHeader className="pb-2 pt-4 px-4">
                            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-violet-700">
                                <FileText className="w-4 h-4" /> Notas de Este Servicio
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <p className="text-slate-700 text-sm whitespace-pre-wrap">{serviceSpecificNotes}</p>
                        </CardContent>
                    </Card>
                )}

                {activeService.photo_urls && activeService.photo_urls.length > 0 && (
                    <Card className="border-0 shadow-sm rounded-2xl">
                        <CardHeader className="pb-2 pt-4 px-4">
                            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                <Camera className="w-4 h-4 text-violet-500" /> Fotos del Servicio
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <div className="grid grid-cols-2 gap-2">
                                {activeService.photo_urls.map((photo, i) => (
                                    <div key={i}>
                                        <img src={photo.url} alt={photo.comment || `Foto ${i+1}`} className="w-full h-28 object-cover rounded-xl cursor-pointer" onClick={() => window.open(photo.url, '_blank')} />
                                        {photo.comment && <p className="text-xs text-slate-500 mt-1">{photo.comment}</p>}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                </div>
            </div>

            <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                            Reportar un Problema
                        </DialogTitle>
                    </DialogHeader>
                    <ServiceReportForm
                        scheduleId={activeService.id}
                        clientName={activeService.client_name}
                        serviceDate={(activeService.start_time || '').slice(0, 10)}
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