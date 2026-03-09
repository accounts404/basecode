import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from '@/utils';
import {
    registerClockIn,
    registerClockOut,
    canUserClockIn,
    syncActiveService
} from '@/components/utils/activeServiceManager';
import cacheManager, { CACHE_KEYS, CACHE_TTL } from '@/components/utils/cacheManager';
import logger from '@/components/utils/logger';
import { useTheme, THEME_DEFINITIONS } from '@/components/theme/ThemeProvider';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
    Calendar as CalendarIcon,
    Plus,
    RefreshCw,
    Clock,
    Users,
    MapPin,
    AlertCircle,
    CheckCircle,
    Car,
    KeySquare,
    ChevronLeft,
    ChevronRight,
    Info,
    AlertTriangle
} from "lucide-react";
import {
    format,
    startOfDay,
    endOfDay,
    isToday,
    parseISO,
    isSameDay,
    addDays,
    subDays,
    addWeeks,
    subWeeks,
    addMonths,
    subMonths,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth
} from "date-fns";
import { es } from "date-fns/locale";

import { Schedule } from "@/entities/Schedule";
import { Client } from "@/entities/Client";
import { User } from "@/entities/User";
import { DailyTeamAssignment } from "@/entities/DailyTeamAssignment";
import { WorkEntry } from "@/entities/WorkEntry";
import { Vehicle } from "@/entities/Vehicle";
import { Task } from "@/entities/Task";

import HorarioCalendario from "../components/horario/HorarioCalendario";
// Lazy load de componentes pesados
const HorarioEquiposView = lazy(() => import("../components/horario/HorarioEquiposView"));
const CrearServicioForm = lazy(() => import("../components/horario/CrearServicioForm"));
const CreateTaskForm = lazy(() => import("../components/tasks/CreateTaskForm"));
const TaskList = lazy(() => import("../components/tasks/TaskList"));

import { generateRecurringTasks } from "@/functions/generateRecurringTasks";
import { processScheduleForWorkEntries } from "@/functions/processScheduleForWorkEntries";
import { generarRecurrencias } from "@/functions/generarRecurrencias";
import { actualizarSerieRecurrente } from "@/functions/actualizarSerieRecurrencia";
import { modificarRecurrencia } from "@/functions/modificarRecurrencia";
import { isEqual } from 'lodash';
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";

const parseISOAsUTC = (isoString) => {
    if (!isoString) return null;
    const correctedIsoString = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
    return new Date(correctedIsoString);
};

// Claves de caché legacy para compatibilidad con datos existentes
const LEGACY_CACHE_KEYS = {
    SCHEDULES: 'redoak_cleaner_schedules',
    VEHICLE: 'redoak_cleaner_vehicle',
    TEAM: 'redoak_cleaner_team',
    KEYS: 'redoak_cleaner_keys',
    LAST_UPDATE: 'redoak_cleaner_last_update'
};

const saveToCache = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem(LEGACY_CACHE_KEYS.LAST_UPDATE, Date.now().toString());
    } catch (error) {
        console.warn('[Cache] Error guardando en caché:', error);
    }
};

const loadFromCache = (key) => {
    try {
        const cached = localStorage.getItem(key);
        return cached ? JSON.parse(cached) : null;
    } catch (error) {
        console.warn('[Cache] Error leyendo caché:', error);
        return null;
    }
};

export default function HorarioPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { theme } = useTheme();
    const currentTheme = THEME_DEFINITIONS[theme] || THEME_DEFINITIONS.default;

    const [user, setUser] = useState(null);
    const [schedules, setSchedules] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [date, setDate] = useState(new Date());
    const [view, setView] = useState('day');
    const [refreshing, setRefreshing] = useState(false);
    const [currentServiceElapsedTime, setCurrentServiceElapsedTime] = useState(0);
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

    const [isCleanerView, setIsCleanerView] = useState(false);
    const [assignedVehicle, setAssignedVehicle] = useState(null);
    const [mainDriverName, setMainDriverName] = useState(null);
    const [requiredKeys, setRequiredKeys] = useState([]);
    const [loadingCleanerData, setLoadingCleanerData] = useState(false);
    const [teamMembers, setTeamMembers] = useState([]);

    const [tasks, setTasks] = useState([]);
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [dailyTeamAssignments, setDailyTeamAssignments] = useState([]);

    const [error, setError] = useState('');

    const intervalRef = useRef(null);
    const pollingRef = useRef(null);
    const calendarRef = useRef(null);
    const loadingRef = useRef(false);
    const navigationInProgressRef = useRef(false);
    const clockInProcessingRef = useRef(false);

    const currentDateRef = useRef(date);
    const currentViewRef = useRef(view);

    useEffect(() => {
        currentDateRef.current = date;
    }, [date]);

    useEffect(() => {
        currentViewRef.current = view;
    }, [view]);

    useEffect(() => {
        loadInitialData();
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (pollingRef.current) clearInterval(pollingRef.current);
            navigationInProgressRef.current = false;
            clockInProcessingRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (location.state?.clockOutSuccess && location.state?.message) {
            console.log('[Horario] 🎉 Mostrando mensaje de Clock Out exitoso');
            toast({
                title: "✅ Clock Out Exitoso",
                description: location.state.message,
                duration: 5000,
                className: "bg-green-50 border-green-200"
            });
            
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate, toast, location.pathname, user]);

    useEffect(() => {
        if (location.state?.selectedService && location.state?.openModal) {
            console.log('[Horario] 🎯 Abriendo modal para servicio desde dashboard:', location.state.selectedService);
            setSelectedEvent(location.state.selectedService);
            setShowForm(true);
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate, location.pathname]);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const focusScheduleId = urlParams.get('focus');

        if (focusScheduleId && schedules.length > 0) {
            const scheduleToFocus = schedules.find(s => s.id === focusScheduleId);

            if (scheduleToFocus) {
                handleSelectEvent(scheduleToFocus);
                window.history.replaceState({}, '', window.location.pathname);
            }
        }
    }, [schedules]);

    const loadRequiredKeysForDate = useCallback(async (currentSchedules, forDate) => {
        if (!user || user.role === 'admin') {
            setRequiredKeys([]);
            return;
        }

        const schedulesArray = Array.isArray(currentSchedules) ? currentSchedules : [];

        const year = forDate.getFullYear();
        const month = String(forDate.getMonth() + 1).padStart(2, '0');
        const day = String(forDate.getDate()).padStart(2, '0');
        const selectedDateStr = `${year}-${month}-${day}`;
        
        console.log('[Horario] 🔑 Filtrando llaves para la fecha:', selectedDateStr);
        
        const todaySchedules = schedulesArray.filter(s => {
            if (!s.start_time || !s.cleaner_ids) return false;
            
            const scheduleStartDateStr = s.start_time.slice(0, 10);
            
            const isMatch = scheduleStartDateStr === selectedDateStr && 
                           Array.isArray(s.cleaner_ids) && 
                           s.cleaner_ids.includes(user.id);
            
            if (isMatch) {
                console.log('[Horario] ✅ Servicio coincide:', s.client_name, 'Hora:', s.start_time.slice(11, 16));
            }
            
            return isMatch;
        });

        console.log('[Horario] 📋 Total de servicios del día para llaves:', todaySchedules.length);

        if (todaySchedules.length > 0) {
            try {
                const clientIds = [...new Set(todaySchedules.map(s => s.client_id).filter(Boolean))];
                const clients = await Promise.all(
                    clientIds.map(async (clientId) => {
                        try {
                            return await Client.get(clientId);
                        } catch (clientError) {
                            console.warn('Error cargando cliente:', clientId, clientError);
                            return null;
                        }
                    })
                );

                const validClients = clients.filter(Boolean);
                const keys = [];

                for (const schedule of todaySchedules) {
                    const client = validClients.find(c => c.id === schedule.client_id);
                    if (client && client.has_access && client.access_identifier) {
                        keys.push({
                            identifier: client.access_identifier,
                            client_name: client.name,
                            access_type: client.access_type
                        });
                    }
                }

                console.log('[Horario] 🔑 Llaves necesarias encontradas:', keys.length);
                setRequiredKeys(keys);
                saveToCache(LEGACY_CACHE_KEYS.KEYS, keys);
            } catch (clientError) {
                console.warn('Error cargando información de clientes:', clientError);
                setRequiredKeys([]);
            }
        } else {
            setRequiredKeys([]);
            saveToCache(LEGACY_CACHE_KEYS.KEYS, []);
        }
    }, [user]);

    const loadVehicleAndTeamForDate = useCallback(async (forDate) => {
        if (!user || user.role === 'admin') {
            setAssignedVehicle(null);
            setMainDriverName(null);
            setTeamMembers([]);
            return;
        }

        try {
            const year = forDate.getFullYear();
            const month = String(forDate.getMonth() + 1).padStart(2, '0');
            const day = String(forDate.getDate()).padStart(2, '0');
            const selectedDateStr = `${year}-${month}-${day}`;
            
            console.log('[Horario] 🚗 Buscando vehículo y equipo para:', selectedDateStr);

            // OPTIMIZADO: filtrar solo por la fecha en lugar de traer todos los registros
            const matchingAssignments = await DailyTeamAssignment.filter({ date: selectedDateStr });

            const myAssignment = matchingAssignments.find(a =>
                a.team_member_ids && 
                Array.isArray(a.team_member_ids) && 
                a.team_member_ids.includes(user.id)
            );

            if (myAssignment) {
                const vehicleInfo = myAssignment.vehicle_info || null;
                const driverName = myAssignment.driver_name || null;
                let teamMembersNames = [];
                if (myAssignment.team_members_names && Array.isArray(myAssignment.team_members_names)) {
                    teamMembersNames = myAssignment.team_members_names.filter(name => name);
                }

                setAssignedVehicle(vehicleInfo);
                setMainDriverName(driverName);
                setTeamMembers(teamMembersNames);

                saveToCache(LEGACY_CACHE_KEYS.VEHICLE, { vehicle: vehicleInfo, driver: driverName });
                saveToCache(LEGACY_CACHE_KEYS.TEAM, teamMembersNames);
            } else {
                setAssignedVehicle(null);
                setMainDriverName(null);
                setTeamMembers([]);
                saveToCache(LEGACY_CACHE_KEYS.VEHICLE, { vehicle: null, driver: null });
                saveToCache(LEGACY_CACHE_KEYS.TEAM, []);
            }

        } catch (error) {
            console.error('[Horario] ❌ Error cargando vehículo y equipo:', error);
            setAssignedVehicle(null);
            setMainDriverName(null);
            setTeamMembers([]);
        }
    }, [user]);

    const loadCleanerSpecificData = useCallback(async (forDate, isSilentUpdate = false) => {
        if (!user || user.role === 'admin') return;

        if (loadingRef.current) {
            logger.debug('Horario', 'Carga ya en progreso, saltando...');
            return;
        }

        if (navigationInProgressRef.current || clockInProcessingRef.current) {
            logger.debug('Horario', 'Operación en progreso, saltando carga...');
            return;
        }

        loadingRef.current = true;

        if (!isSilentUpdate) {
            setLoadingCleanerData(true);
        }

        try {
            const dayBefore = subDays(forDate, 2);
            const dayAfter = addDays(forDate, 2);

            // Construir fechas UTC desde la fecha LOCAL seleccionada
            const startYear = dayBefore.getFullYear();
            const startMonth = String(dayBefore.getMonth() + 1).padStart(2, '0');
            const startDay = String(dayBefore.getDate()).padStart(2, '0');
            const startOfRangeUTC = `${startYear}-${startMonth}-${startDay}T00:00:00.000Z`;

            const endYear = dayAfter.getFullYear();
            const endMonth = String(dayAfter.getMonth() + 1).padStart(2, '0');
            const endDay = String(dayAfter.getDate()).padStart(2, '0');
            const endOfRangeUTC = `${endYear}-${endMonth}-${endDay}T23:59:59.999Z`;
            
            const dateRange = `${startYear}-${startMonth}-${startDay}_${endYear}-${endMonth}-${endDay}`;

            logger.info('Horario', `${isSilentUpdate ? 'Actualización silenciosa' : 'Cargando servicios'}`, { 
                dateRange,
                startUTC: startOfRangeUTC,
                endUTC: endOfRangeUTC
            });

            // Intentar obtener de caché primero
            const cacheKey = CACHE_KEYS.SCHEDULES(dateRange);
            const cachedSchedules = cacheManager.get(cacheKey);

            if (cachedSchedules && !isSilentUpdate) {
                logger.debug('Horario', 'Usando servicios desde caché', { count: cachedSchedules.length });
                setSchedules(cachedSchedules);
                loadingRef.current = false;
                if (!isSilentUpdate) {
                    setLoadingCleanerData(false);
                }
                
                // Cargar en background para actualizar caché
                setTimeout(() => {
                    loadCleanerSpecificData(forDate, true);
                }, 100);
                return;
            }

            // Consulta optimizada con índices y rangos UTC correctos
            const cleanerSchedules = await Schedule.filter({
                cleaner_ids: { $contains: user.id },
                status: { $ne: 'cancelled' },
                start_time: {
                    $gte: startOfRangeUTC,
                    $lte: endOfRangeUTC
                }
            }).catch(filterError => {
                logger.warn('Horario', 'Filtro optimizado falló, usando fallback', filterError);
                const monthStart = startOfMonth(forDate);
                const monthEnd = endOfMonth(forDate);
                
                // Construir fechas UTC manualmente desde fechas locales
                const fallbackStartYear = monthStart.getFullYear();
                const fallbackStartMonth = String(monthStart.getMonth() + 1).padStart(2, '0');
                const monthStartUTC = `${fallbackStartYear}-${fallbackStartMonth}-01T00:00:00.000Z`;
                
                const fallbackEndYear = monthEnd.getFullYear();
                const fallbackEndMonth = String(monthEnd.getMonth() + 1).padStart(2, '0');
                const fallbackEndDay = String(monthEnd.getDate()).padStart(2, '0');
                const monthEndUTC = `${fallbackEndYear}-${fallbackEndMonth}-${fallbackEndDay}T23:59:59.999Z`;
                
                return Schedule.filter({
                    start_time: {
                        $gte: monthStartUTC,
                        $lte: monthEndUTC
                    }
                }).then(allSchedules => {
                    const allSchedulesArray = Array.isArray(allSchedules) ? allSchedules : [];
                    return allSchedulesArray.filter(s =>
                        s.cleaner_ids && Array.isArray(s.cleaner_ids) && s.cleaner_ids.includes(user.id) && s.status !== 'cancelled'
                    );
                });
            });

            logger.info('Horario', 'Servicios cargados desde BD', { count: cleanerSchedules?.length || 0 });

            const currentCleanerSchedules = Array.isArray(cleanerSchedules) ? cleanerSchedules : [];
            setSchedules(currentCleanerSchedules);
            
            // Guardar en caché con TTL de 2 minutos para limpiadores
            cacheManager.set(cacheKey, currentCleanerSchedules, CACHE_TTL.SHORT);

            await loadVehicleAndTeamForDate(forDate);
            await loadRequiredKeysForDate(currentCleanerSchedules, forDate);

        } catch (error) {
            logger.error('Horario', 'Error cargando datos de limpiador', error);
        } finally {
            if (!isSilentUpdate) {
                setLoadingCleanerData(false);
            }
            loadingRef.current = false;
        }
    }, [user, loadRequiredKeysForDate, loadVehicleAndTeamForDate]);

    // Helper para cargar TODOS los registros con paginación automática
    const loadAllRecords = async (entityName, sortField = '-created_date') => {
        const { base44 } = await import('@/api/base44Client');
        const BATCH_SIZE = 5000;
        let allRecords = [];
        let skip = 0;
        let hasMore = true;

        while (hasMore) {
            const batch = await base44.entities[entityName].list(sortField, BATCH_SIZE, skip);
            const batchArray = Array.isArray(batch) ? batch : [];

            allRecords = [...allRecords, ...batchArray];

            if (batchArray.length < BATCH_SIZE) {
                hasMore = false;
            } else {
                skip += BATCH_SIZE;
            }
        }

        return allRecords;
    };

    const loadInitialData = async () => {
          try {
              const currentUser = await User.me();
              setUser(currentUser);

              logger.info('Horario', 'Usuario cargado', { userId: currentUser.id, role: currentUser.role });

              if (currentUser.role === 'admin') {
                  // CRÍTICO: Obtener TODOS los registros con paginación automática
                  logger.info('Horario', 'Iniciando carga paginada de datos...');

                  const [cachedUsers, cachedSchedules, cachedTasks, cachedAssignments] = await Promise.all([
                      loadAllRecords('User', '-created_date'),
                      loadAllRecords('Schedule', '-start_time'),
                      loadAllRecords('Task', '-created_date'),
                      loadAllRecords('DailyTeamAssignment', '-date')
                  ]);

                  setUsers(cachedUsers);
                  setSchedules(cachedSchedules);
                  setTasks(cachedTasks);
                  setDailyTeamAssignments(cachedAssignments);
                  setLoading(false);
                  setInitialLoadComplete(true);

                  logger.info('Horario', 'Admin - Datos cargados', { 
                      users: cachedUsers?.length || 0, 
                      schedules: cachedSchedules?.length || 0,
                      tasks: cachedTasks?.length || 0,
                      assignments: cachedAssignments?.length || 0
                  });
            } else {
                logger.debug('Horario', 'Limpiador detectado, cargando desde caché local');
                const cachedSchedules = loadFromCache(LEGACY_CACHE_KEYS.SCHEDULES);
                const cachedVehicle = loadFromCache(LEGACY_CACHE_KEYS.VEHICLE);
                const cachedTeam = loadFromCache(LEGACY_CACHE_KEYS.TEAM);
                const cachedKeys = loadFromCache(LEGACY_CACHE_KEYS.KEYS);

                if (cachedSchedules) {
                    logger.debug('Horario', 'Mostrando servicios desde caché', { count: cachedSchedules.length });
                    setSchedules(cachedSchedules);
                }
                if (cachedVehicle) {
                    setAssignedVehicle(cachedVehicle.vehicle);
                    setMainDriverName(cachedVehicle.driver);
                }
                if (cachedTeam) setTeamMembers(cachedTeam);
                if (cachedKeys) setRequiredKeys(cachedKeys);

                setUsers([currentUser]);
                setIsCleanerView(true);
                setLoading(false);
                setInitialLoadComplete(true);

                logger.debug('Horario', 'Iniciando actualización en background');
                setTimeout(() => {
                    loadCleanerSpecificData(new Date(), true);
                }, 100);
            }

        } catch (error) {
            logger.error('Horario', 'Error cargando datos iniciales', error);
            setError(`Error al cargar datos: ${error.message || 'Error desconocido'}`);
            if (error.response?.status === 401) {
                logger.warn('Horario', 'Error de autenticación (401), redirigiendo al login');
                await User.logout();
                window.location.reload();
            }
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user && user.role !== 'admin' && initialLoadComplete && !loadingRef.current && !navigationInProgressRef.current && !clockInProcessingRef.current) {
            console.log('[Horario] 📅 Fecha cambiada, actualizando datos...');
            loadCleanerSpecificData(date, false);
        }
    }, [date, user, initialLoadComplete, loadCleanerSpecificData]);

    const startServiceTimer = useCallback(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);

        intervalRef.current = setInterval(() => {
            const schedulesArray = Array.isArray(schedules) ? schedules : [];
            const activeService = schedulesArray.find(schedule => {
                if (!schedule.cleaner_ids || !Array.isArray(schedule.cleaner_ids) || !schedule.cleaner_ids.includes(user?.id)) return false;

                const clockInDataArray = Array.isArray(schedule.clock_in_data) ? schedule.clock_in_data : [];
                const cleanerClockData = clockInDataArray.find(c => c.cleaner_id === user?.id);
                return cleanerClockData?.clock_in_time && !cleanerClockData?.clock_out_time;
            });

            if (activeService) {
                const clockInDataArray = Array.isArray(activeService.clock_in_data) ? activeService.clock_in_data : [];
                const cleanerClockData = clockInDataArray.find(c => c.cleaner_id === user?.id);
                const clockInTime = parseISOAsUTC(cleanerClockData.clock_in_time);
                const elapsed = Math.floor((new Date() - clockInTime) / 1000);
                setCurrentServiceElapsedTime(elapsed);
            } else {
                setCurrentServiceElapsedTime(0);
            }
        }, 1000);
    }, [schedules, user]);

    useEffect(() => {
        if (isCleanerView && user) {
            startServiceTimer();
            return () => {
                if (intervalRef.current) clearInterval(intervalRef.current);
            };
        }
    }, [isCleanerView, user, startServiceTimer]);

    const handleRefresh = async () => {
          if (!user) return;

          setRefreshing(true);
          setError('');

          try {
              if (user.role === 'admin') {
                  // CRÍTICO: Obtener TODOS los registros con paginación automática
                  logger.info('Horario', 'Iniciando refresh con paginación...');

                  const [allSchedules, allTasks, allAssignments] = await Promise.all([
                      loadAllRecords('Schedule', '-start_time'),
                      loadAllRecords('Task', '-created_date'),
                      loadAllRecords('DailyTeamAssignment', '-date')
                  ]);

                  setSchedules(allSchedules);
                  setTasks(allTasks);
                  setDailyTeamAssignments(allAssignments);

                  // Actualizar caché
                  cacheManager.set(CACHE_KEYS.SCHEDULES('all'), allSchedules, CACHE_TTL.SHORT);
                  cacheManager.set(CACHE_KEYS.TASKS('all'), allTasks, CACHE_TTL.MEDIUM);

                  logger.info('Horario', 'Datos admin actualizados', { 
                      schedules: allSchedules.length, 
                      tasks: allTasks.length,
                      assignments: allAssignments.length
                  });
            } else {
                await loadCleanerSpecificData(date, false);
                logger.info('Horario', 'Datos limpiador actualizados');
            }
        } catch (error) {
            logger.error('Horario', 'Error en handleRefresh', error);
            setError(`Error al refrescar: ${error.message || 'Error desconocido'}`);
        } finally {
            setRefreshing(false);
        }
    };

    const handleServiceDeleted = async () => {
        console.log("[Horario] Servicio eliminado, recargando...");
        setShowForm(false);
        setSelectedEvent(null);
        await handleRefresh();
    };

    // OPTIMIZADO: Proceso simplificado y robusto para Clock In/Out
    const handleClockInOut = async (scheduleId, action) => {
        if (clockInProcessingRef.current) {
            console.log('[Horario] ⏳ Proceso en curso, ignorando click duplicado');
            return;
        }

        clockInProcessingRef.current = true;
        navigationInProgressRef.current = true;

        // 🎯 MOSTRAR INDICADOR DE PROCESANDO
        toast({
            title: action === 'clock_in' ? "⏳ Iniciando Clock In..." : "⏳ Finalizando Clock Out...",
            description: "Por favor espera, procesando...",
            duration: 60000, // Duración larga mientras procesa
        });

        try {
            console.log(`[Horario] 🎬 Iniciando ${action === 'clock_in' ? 'Clock In' : 'Clock Out'}...`);

            // PASO 1: Verificaciones previas
            if (action === 'clock_in') {
                const verification = await canUserClockIn(user.id);
                if (!verification.canClockIn) {
                    toast({
                        variant: "destructive",
                        title: "⚠️ No se puede hacer Clock In",
                        description: verification.reason,
                        duration: 5000,
                    });
                    clockInProcessingRef.current = false;
                    navigationInProgressRef.current = false;
                    navigate(createPageUrl('ServicioActivo'));
                    return;
                }
            }

            // PASO 2: Obtener ubicación GPS (sin bloquear)
            let userLocation = null;
            if ('geolocation' in navigator) {
                try {
                    const position = await Promise.race([
                        new Promise((resolve, reject) => {
                            navigator.geolocation.getCurrentPosition(resolve, reject, {
                                timeout: 5000,
                                enableHighAccuracy: false,
                                maximumAge: 30000
                            });
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('GPS timeout')), 5000))
                    ]);
                    userLocation = `${position.coords.latitude},${position.coords.longitude}`;
                    console.log('[Horario] 📍 Ubicación GPS obtenida');
                } catch (gpsError) {
                    console.warn('[Horario] ⚠️ No se pudo obtener GPS:', gpsError.message);
                }
            }

            // PASO 3: Obtener y actualizar el schedule
            console.log('[Horario] 📥 Obteniendo información del servicio...');
            const schedule = await Schedule.get(scheduleId);
            if (!schedule) {
                throw new Error('Servicio no encontrado');
            }

            let updatedClockData = [...(schedule.clock_in_data || [])];
            const existingIndex = updatedClockData.findIndex(c => c.cleaner_id === user.id);
            const currentTime = new Date().toISOString();

            if (action === 'clock_in') {
                const clockData = {
                    cleaner_id: user.id,
                    clock_in_time: currentTime,
                    clock_in_location: userLocation,
                    clock_out_time: null,
                    clock_out_location: null
                };

                if (existingIndex >= 0) {
                    updatedClockData[existingIndex] = { ...updatedClockData[existingIndex], ...clockData };
                } else {
                    updatedClockData.push(clockData);
                }

                // Registrar en localStorage ANTES de actualizar BD
                registerClockIn(scheduleId, schedule);

            } else if (action === 'clock_out') {
                if (existingIndex >= 0) {
                    updatedClockData[existingIndex] = {
                        ...updatedClockData[existingIndex],
                        clock_out_time: currentTime,
                        clock_out_location: userLocation
                    };
                }

                // CRÍTICO: Registrar Clock Out ANTES de cualquier otra acción
                registerClockOut(scheduleId);
                console.log('[Horario] ✅ Clock Out registrado en localStorage (20s de gracia)');
            }

            // PASO 4: Actualizar clock_in_data con reintentos
            console.log('[Horario] 💾 Actualizando clock_in_data en base de datos...');
            const { updateScheduleWithRetry } = await import('@/components/utils/activeServiceManager');
            
            await updateScheduleWithRetry(scheduleId, {
                clock_in_data: updatedClockData
            });

            // PASO 5: Determinar y actualizar el estado correcto del servicio
            let finalStatus = schedule.status; // Mantener el status actual por defecto

            if (action === 'clock_in') {
                // Si es clock in y está scheduled, cambiar a in_progress
                if (schedule.status === 'scheduled') {
                    finalStatus = 'in_progress';
                }
            } else if (action === 'clock_out') {
                console.log('[Horario] 🔄 Verificando si todos los limpiadores han cerrado...');
                
                // CRÍTICO: Obtener el schedule FRESCO después de actualizar clock_in_data
                const freshSchedule = await Schedule.get(scheduleId);
                const allCleanerIds = Array.isArray(freshSchedule.cleaner_ids) ? freshSchedule.cleaner_ids : [];
                const freshClockData = Array.isArray(freshSchedule.clock_in_data) ? freshSchedule.clock_in_data : [];

                // Verificar si TODOS los limpiadores asignados tienen clock_out_time
                const allHaveClockedOut = allCleanerIds.every(cleanerId => {
                    const clockData = freshClockData.find(c => c.cleaner_id === cleanerId);
                    return clockData && clockData.clock_out_time;
                });

                console.log(`[Horario] 🔍 Total limpiadores: ${allCleanerIds.length}, Todos con clock out: ${allHaveClockedOut}`);

                // SOLO marcar como completado si TODOS han cerrado
                finalStatus = allHaveClockedOut ? 'completed' : 'in_progress';
            }

            // PASO 6: Actualizar el estado final del servicio con reintentos
            await updateScheduleWithRetry(scheduleId, { status: finalStatus });
            console.log(`[Horario] ✅ Estado del servicio actualizado a: ${finalStatus}`);

            // PASO 7: Procesamiento post-Clock Out (crear WorkEntries solo si está completado)
            if (action === 'clock_out' && finalStatus === 'completed') {
                console.log('[Horario] ✅ Todos cerraron, creando WorkEntries...');
                try {
                    const { data } = await processScheduleForWorkEntries({
                        scheduleId: scheduleId,
                        mode: 'create'
                    });

                    if (data.success && data.created_entries > 0) {
                        console.log(`[Horario] ✅ ${data.created_entries} WorkEntries creadas`);
                    }
                } catch (workEntryError) {
                    console.error("[Horario] ⚠️ Error creando WorkEntries:", workEntryError);
                }
            } else if (action === 'clock_out' && finalStatus === 'in_progress') {
                console.log('[Horario] ⏳ Algunos limpiadores aún activos, WorkEntries no creadas aún');
            }

            // CRÍTICO: Actualizar cache local con el estado correcto
            const schedulesArray = Array.isArray(schedules) ? schedules : [];
            const updatedSchedules = schedulesArray.map(s => {
                if (s.id === scheduleId) {
                    return {
                        ...s,
                        clock_in_data: updatedClockData,
                        status: finalStatus
                    };
                }
                return s;
            });
            setSchedules(updatedSchedules);
            saveToCache(LEGACY_CACHE_KEYS.SCHEDULES, updatedSchedules);

            // PASO 6: Cerrar modal y mostrar mensaje
            setShowForm(false);
            setSelectedEvent(null);

            if (action === 'clock_in') {
                toast({
                    title: "✅ Clock In Exitoso",
                    description: "Servicio iniciado. Redirigiendo...",
                    duration: 2000,
                    className: "bg-green-50 border-green-200"
                });

                console.log('[Horario] 🚀 Navegando a ServicioActivo...');
                setTimeout(() => {
                    navigate(createPageUrl('ServicioActivo'), { replace: true });
                    clockInProcessingRef.current = false;
                    navigationInProgressRef.current = false;
                }, 500);

            } else if (action === 'clock_out') {
                toast({
                    title: "✅ Clock Out Exitoso",
                    description: "Servicio finalizado. ¡Buen trabajo!",
                    duration: 5000,
                    className: "bg-green-50 border-green-200"
                });

                // Recargar datos antes de navegar
                console.log('[Horario] 🔄 Recargando datos...');
                await loadCleanerSpecificData(date, true);

                console.log('[Horario] 🚀 Quedándose en Horario (refresh)...');
                setTimeout(() => {
                    // No navegar, solo forzar refresh del estado
                    window.location.reload();
                }, 1000);
            }

        } catch (error) {
            console.error(`[Horario] ❌ Error en ${action}:`, error);
            
            toast({
                variant: "destructive",
                title: "❌ Error",
                description: `No se pudo completar el ${action === 'clock_in' ? 'Clock In' : 'Clock Out'}. Por favor, intenta de nuevo.`,
                duration: 5000,
            });

            setError(`Error: ${error.message || 'Error desconocido'}`);
            
        } finally {
            clockInProcessingRef.current = false;
            navigationInProgressRef.current = false;
        }
    };

    const handleSelectEvent = (event) => {
        setSelectedEvent(event);
        setShowForm(true);
    };

    const handleCreateAtTime = (dateTime) => {
        if (isCleanerView) {
            console.log('[Horario] Limpiadores no pueden crear servicios');
            return;
        }

        // Extraer hora/minuto UTC (el calendario los pasa como UTC)
        const hours = dateTime.getUTCHours();
        const minutes = dateTime.getUTCMinutes();
        const startTimeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        const endHours = hours + 4;
        const endTimeStr = `${String(endHours % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

        // Extraer la fecha UTC directamente del ISO string para evitar conversión de zona horaria
        const datePart = dateTime.toISOString().slice(0, 10);

        setSelectedEvent({
            preselected_date: datePart,
            preselected_start_time: startTimeStr,
            preselected_end_time: endTimeStr
        });
        setShowForm(true);
    };

    const updateWorkEntriesIfNeeded = async (scheduleId, newCleanerSchedules, originalCleanerSchedules) => {
        try {
            console.log('[Horario] 📊 Comparando horarios para WorkEntry...');

            let hasChanges = false;
            const newSchedulesArray = Array.isArray(newCleanerSchedules) ? newCleanerSchedules : [];
            const originalSchedulesArray = Array.isArray(originalCleanerSchedules) ? originalSchedulesArray : [];

            if (newSchedulesArray.length !== originalSchedulesArray.length) {
                hasChanges = true;
            } else {
                for (const newSchedule of newSchedulesArray) {
                    const originalSchedule = originalSchedulesArray.find(
                        orig => orig.cleaner_id === newSchedule.cleaner_id
                    );

                    if (!originalSchedule ||
                        originalSchedule.start_time !== newSchedule.start_time ||
                        originalSchedule.end_time !== newSchedule.end_time) {
                        hasChanges = true;
                        break;
                    }
                }
            }

            if (!hasChanges) {
                console.log('[Horario] ✅ Sin cambios en horarios');
                return;
            }

            console.log('[Horario] 🔄 Actualizando WorkEntry...');

            const workEntries = await WorkEntry.filter({ schedule_id: scheduleId });

            for (const newSchedule of newSchedulesArray) {
                const workEntry = workEntries.find(we => we.cleaner_id === newSchedule.cleaner_id);

                if (workEntry && (workEntry.invoiced === false || workEntry.invoiced === undefined)) {
                    const startTime = new Date(newSchedule.start_time);
                    const endTime = new Date(newSchedule.end_time);
                    const newHours = (endTime - startTime) / (1000 * 60 * 60);
                    const newTotalAmount = newHours * workEntry.hourly_rate;

                    await WorkEntry.update(workEntry.id, {
                        hours: newHours,
                        total_amount: newTotalAmount
                    });

                    console.log(`[Horario] ✅ WorkEntry ${workEntry.id} actualizada`);
                }
            }

        } catch (error) {
            console.error('[Horario] ❌ Error actualizando WorkEntry:', error);
        }
    };

    const getColorFromMostExperiencedCleaner = useCallback((cleanerIds) => {
        if (!cleanerIds || cleanerIds.length === 0) {
            return '#3b82f6';
        }

        const assignedCleaners = users.filter(user => cleanerIds.includes(user.id));

        if (assignedCleaners.length === 0) {
            return '#3b82f6';
        }

        let mostExperiencedCleaner = assignedCleaners[0];
        if (mostExperiencedCleaner && !mostExperiencedCleaner.start_date) {
            const firstWithStartDate = assignedCleaners.find(c => c.start_date);
            mostExperiencedCleaner = firstWithStartDate || mostExperiencedCleaner;
        }

        for (let i = 0; i < assignedCleaners.length; i++) {
            const current = assignedCleaners[i];

            if (!current.start_date) {
                continue;
            }

            if (!mostExperiencedCleaner.start_date) {
                mostExperiencedCleaner = current;
            } else if (new Date(current.start_date) < new Date(mostExperiencedCleaner.start_date)) {
                mostExperiencedCleaner = current;
            }
        }

        if (!mostExperiencedCleaner.start_date && assignedCleaners.length > 0) {
            return assignedCleaners[0].color || '#3b82f6';
        }

        return mostExperiencedCleaner.color || '#3b82f6';
    }, [users]);

    const handleSaveService = async (serviceData, updateScope) => {
        if (isCleanerView) {
            console.log('[Horario] Limpiadores no pueden guardar servicios');
            return;
        }

        try {
            let wasCompleted = false;
            let originalCleanerSchedules = [];
            const isNewService = !selectedEvent?.id;

            if (serviceData.cleaner_ids && serviceData.cleaner_ids.length > 0) {
                const assignedColor = getColorFromMostExperiencedCleaner(serviceData.cleaner_ids);
                serviceData.color = assignedColor;
            }

            let savedServiceId = null;

            if (!isNewService) {
                wasCompleted = selectedEvent.status === 'completed';
                originalCleanerSchedules = selectedEvent.cleaner_schedules || [];

                const wasNotCompleted = selectedEvent.status !== 'completed';
                const isNowCompleted = serviceData.status === 'completed';
                const statusChangedToCompleted = wasNotCompleted && isNowCompleted;

                const originalRecurrenceRule = selectedEvent.recurrence_rule || 'none';
                const newRecurrenceRule = serviceData.recurrence_rule || 'none';
                const hasRecurrenceRuleChanged = originalRecurrenceRule !== newRecurrenceRule;

                if (hasRecurrenceRuleChanged) {
                    try {
                        const { data: modificationResult } = await modificarRecurrencia({
                            scheduleId: selectedEvent.id,
                            updatedData: serviceData,
                            updateScope: updateScope,
                            originalRecurrenceRule: originalRecurrenceRule,
                        });
                        if (modificationResult.success) {
                            savedServiceId = selectedEvent.id;
                        } else {
                            throw new Error(modificationResult.error || 'Error al modificar recurrencia');
                        }
                    } catch (modRecurrenceError) {
                        console.error('[Horario] ❌ Error en modificarRecurrencia:', modRecurrenceError);
                        setError(`Error: ${modRecurrenceError.message || 'Error desconocido'}`);
                        throw modRecurrenceError;
                    }
                } else if (updateScope === 'this_and_future' && selectedEvent.recurrence_id) {
                    await Schedule.update(selectedEvent.id, serviceData);
                    savedServiceId = selectedEvent.id;
                    try {
                        const { data: recurrenceResult } = await actualizarSerieRecurrente({
                            scheduleId: selectedEvent.id,
                            updateScope: updateScope,
                            updatedData: serviceData
                        });

                        if (!recurrenceResult.success) {
                            setError(`Error: ${recurrenceResult.error}`);
                        }
                    } catch (recurrenceError) {
                        console.error('[Horario] ❌ Error en actualizarSerieRecurrente:', recurrenceError);
                        setError(`Error: ${recurrenceError.message || 'Error desconocido'}`);
                        throw recurrenceError;
                    }
                } else {
                    await Schedule.update(selectedEvent.id, serviceData);
                    savedServiceId = selectedEvent.id;
                }

                if (statusChangedToCompleted && savedServiceId) {
                    try {
                        const { data } = await processScheduleForWorkEntries({
                            scheduleId: savedServiceId,
                            mode: 'create'
                        });

                        if (data.success && data.created_entries > 0) {
                            console.log(`[Horario] ✅ WorkEntries creadas: ${data.created_entries}`);
                        }
                    } catch (workEntryError) {
                        console.error("[Horario] ❌ Error creando WorkEntries:", workEntryError);
                    }
                }

                if (wasCompleted && serviceData.cleaner_schedules && updateScope === 'this_only') {
                    await updateWorkEntriesIfNeeded(selectedEvent.id, serviceData.cleaner_schedules, originalCleanerSchedules);
                }

            } else {
                const newService = await Schedule.create(serviceData);
                savedServiceId = newService.id;

                if (serviceData.status === 'completed' && savedServiceId) {
                    try {
                        const { data } = await processScheduleForWorkEntries({
                            scheduleId: savedServiceId,
                            mode: 'create'
                        });

                        if (data.success && data.created_entries > 0) {
                            console.log(`[Horario] ✅ WorkEntries creadas: ${data.created_entries}`);
                        }
                    } catch (workEntryError) {
                        console.error("[Horario] ❌ Error creando WorkEntries:", workEntryError);
                    }
                }

                if (serviceData.recurrence_rule && serviceData.recurrence_rule !== 'none') {
                    try {
                        const { data: recurrenceResult } = await generarRecurrencias({
                            scheduleId: savedServiceId,
                            recurrenceRule: serviceData.recurrence_rule,
                            months: 6
                        });

                        if (!recurrenceResult.success) {
                            setError(`Error al generar recurrencias: ${recurrenceResult.error}`);
                        }
                    } catch (recurrenceError) {
                        console.error('[Horario] ❌ Error generando recurrencias:', recurrenceError);
                        setError(`Error: ${recurrenceError.message || 'Error desconocido'}`);
                    }
                }
            }

            if (serviceData.structured_service_notes && serviceData.client_id) {
                try {
                    const currentClient = await Client.get(serviceData.client_id);
                    const serviceNotes = serviceData.structured_service_notes || {};
                    const clientNotes = currentClient.structured_service_notes || {};

                    if (!isEqual(serviceNotes, clientNotes)) {
                        await Client.update(currentClient.id, {
                            structured_service_notes: serviceNotes
                        });
                    }
                } catch (clientError) {
                    console.error('[Horario] ❌ Error actualizando notas del cliente:', clientError);
                }
            }

            setShowForm(false);
            setSelectedEvent(null);
            await handleRefresh();
        } catch (error) {
            console.error('[Horario] Error guardando servicio:', error);
            setError(`Error: ${error.message || 'Error desconocido'}`);
            throw error;
        }
    };

    const handleResizeEvent = async (eventId, newStartTime, newEndTime) => {
        if (isCleanerView || user?.role !== 'admin') {
            return;
        }

        try {
            const schedulesArray = Array.isArray(schedules) ? schedules : [];
            const scheduleToUpdate = schedulesArray.find(s => s.id === eventId);
            if (!scheduleToUpdate) {
                return;
            }

            const updatePayload = {
                start_time: newStartTime.toISOString(),
                end_time: newEndTime.toISOString(),
            };

            await Schedule.update(eventId, updatePayload);
            await handleRefresh();

        } catch (error) {
            console.error('[Horario] Error al redimensionar:', error);
            setError(`Error: ${error.message || 'Error desconocido'}`);
            await handleRefresh();
        }
    };

    const handleMoveEvent = async (eventId, newStartTime, newEndTime) => {
        if (isCleanerView || user?.role !== 'admin') {
            return;
        }

        try {
            const schedulesArray = Array.isArray(schedules) ? schedules : [];
            const scheduleToUpdate = schedulesArray.find(s => s.id === eventId);
            if (!scheduleToUpdate) {
                return;
            }

            const updatePayload = {
                start_time: newStartTime.toISOString(),
                end_time: newEndTime.toISOString(),
            };

            if (scheduleToUpdate.cleaner_schedules && Array.isArray(scheduleToUpdate.cleaner_schedules) && scheduleToUpdate.cleaner_schedules.length > 0) {
                const originalStart = new Date(scheduleToUpdate.start_time);
                const timeDiff = newStartTime.getTime() - originalStart.getTime();

                updatePayload.cleaner_schedules = scheduleToUpdate.cleaner_schedules.map(cs => ({
                    ...cs,
                    start_time: new Date(new Date(cs.start_time).getTime() + timeDiff).toISOString(),
                    end_time: new Date(new Date(cs.end_time).getTime() + timeDiff).toISOString(),
                }));
            }

            await Schedule.update(eventId, updatePayload);
            await handleRefresh();

        } catch (error) {
            console.error('[Horario] Error al mover:', error);
            setError(`Error: ${error.message || 'Error desconocido'}`);
            await handleRefresh();
        }
    };

    const openInMaps = (address) => {
        const encodedAddress = encodeURIComponent(address);
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
        window.location.href = mapsUrl;
    };

    const filteredSchedules = useMemo(() => {
        if (!Array.isArray(schedules)) return [];

        return schedules.filter(schedule => {
            if (isCleanerView && user?.id && schedule.cleaner_ids) {
                return schedule.cleaner_ids.includes(user.id);
            }
            return true;
        });
    }, [schedules, isCleanerView, user?.id]);

    const servicesForSelectedDateCount = React.useMemo(() => {
        if (!isCleanerView) return 0;
        try {
            const filteredArray = Array.isArray(filteredSchedules) ? filteredSchedules : [];
            return filteredArray.filter(s => s.start_time && isSameDay(parseISOAsUTC(s.start_time), date)).length;
        } catch (error) {
            console.error("[Horario] Error filtrando servicios:", error);
            return 0;
        }
    }, [filteredSchedules, date, isCleanerView]);

    const handleCreateTask = () => {
        setSelectedTask(null);
        setShowTaskForm(true);
    };

    const handleTaskClick = (task) => {
        setSelectedTask(task);
        setShowTaskForm(true);
    };

    const handleSaveTask = async (taskData) => {
        try {
            if (selectedTask?.id) {
                await Task.update(selectedTask.id, taskData);
            } else {
                const newTask = {
                    ...taskData,
                    created_by_user_id: user.id
                };
                const createdTask = await Task.create(newTask);

                if (taskData.recurrence_type !== 'none') {
                    try {
                        const { data } = await generateRecurringTasks(createdTask);
                        console.log(`[Horario] Tareas recurrentes creadas: ${data.created_tasks}`);
                    } catch (recurrenceError) {
                        setError(`Error generando tareas: ${recurrenceError.message || 'Error desconocido'}`);
                    }
                }
            }

            setShowTaskForm(false);
            setSelectedTask(null);
            await handleRefresh();
        } catch (error) {
            console.error('[Horario] Error guardando tarea:', error);
            setError(`Error: ${error.message || 'Error desconocido'}`);
            throw error;
        }
    };

    const handleDeleteTask = async (taskId) => {
        try {
            await Task.delete(taskId);
            setShowTaskForm(false);
            setSelectedTask(null);
            await handleRefresh();
        } catch (error) {
            console.error('[Horario] Error eliminando tarea:', error);
            setError(`Error: ${error.message || 'Error desconocido'}`);
            throw error;
        }
    };

    const handleToggleTaskStatus = async (taskId, newStatus) => {
        try {
            await Task.update(taskId, { status: newStatus });
            await handleRefresh();
        } catch (error) {
            console.error('[Horario] Error actualizando estado:', error);
            setError(`Error: ${error.message || 'Error desconocido'}`);
        }
    };

    const handlePrev = () => {
        setDate(prevDate => {
            if (view === 'day') return subDays(prevDate, 1);
            if (view === 'week') return subWeeks(prevDate, 1);
            if (view === 'month') return subMonths(prevDate, 1);
            return prevDate;
        });
    };

    const handleNext = () => {
        setDate(prevDate => {
            if (view === 'day') return addDays(prevDate, 1);
            if (view === 'week') return addWeeks(prevDate, 1);
            if (view === 'month') return addMonths(prevDate, 1);
            return prevDate;
        });
    };

    const handleToday = () => {
        setDate(new Date());
    };

    const handleDateSelect = (selectedDate) => {
        if (selectedDate) {
            setDate(selectedDate);
            setIsDatePickerOpen(false);
        }
    };

    useEffect(() => {
        if (!initialLoadComplete) return;

        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }

        // OPTIMIZADO: polling menos frecuente para reducir rate limit
        const pollingInterval = user?.role === 'admin' ? 90000 : 45000; // 90s admin, 45s cleaner
        let slowPollCounter = 0; // para tareas y asignaciones (cada 5 min para admin)

        console.log(`[Horario] 🔄 Polling cada ${pollingInterval/1000}s`);

        pollingRef.current = setInterval(async () => {
            // No pollear si la pestaña no está visible
            if (document.hidden) return;

            if (navigationInProgressRef.current || clockInProcessingRef.current) {
                console.log('[Horario] 🚫 Operación en progreso, saltando polling...');
                return;
            }

            try {
                if (user?.role === 'admin') {
                    slowPollCounter++;
                    // Schedules en cada ciclo, tasks/assignments cada ~5 min (cada 3 ciclos de 90s)
                    const allSchedules = await loadAllRecords('Schedule', '-start_time');
                    setSchedules(allSchedules);
                    if (slowPollCounter % 3 === 0) {
                        const [allTasks, allAssignments] = await Promise.all([
                            loadAllRecords('Task', '-created_date'),
                            loadAllRecords('DailyTeamAssignment', '-date')
                        ]);
                        setTasks(allTasks);
                        setDailyTeamAssignments(allAssignments);
                    }
                } else {
                    await loadCleanerSpecificData(currentDateRef.current, true);
                }
            } catch (error) {
                console.error('[Horario] ❌ Error en polling:', error);
            }
        }, pollingInterval);

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [user, initialLoadComplete, loadCleanerSpecificData]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-slate-600">Cargando horario...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: currentTheme.colors.background }}>
            <Toaster />
            {isCleanerView ? (
                <header className="flex-shrink-0 bg-white border-b" style={{ borderColor: currentTheme.colors.cardBorder }}>
                    <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-bold flex items-center gap-2" style={{ color: currentTheme.colors.primary }}>
                                <CalendarIcon className="w-5 h-5" style={{ color: currentTheme.colors.primary }} />
                                {theme === 'christmas' && <span>🎄</span>}
                                Mi Horario
                                {theme === 'christmas' && <span>🎁</span>}
                                {!loading && (
                                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Actualizándose automáticamente"></span>
                                )}
                            </h1>
                        </div>
                        
                        <Button
                            variant="outline"
                            onClick={handleRefresh}
                            disabled={refreshing}
                            size="sm"
                            className="flex items-center gap-1 hover:bg-blue-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </header>
            ) : (
                <header className="flex-shrink-0 bg-white border-b p-2 md:p-4">
                    <div className="flex flex-col gap-2 md:gap-0 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2">
                                <CalendarIcon className="w-5 h-5 text-blue-600" />
                                Horario de Servicios
                                {!loading && (
                                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Actualizándose automáticamente"></span>
                                )}
                            </h1>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 md:gap-2 mt-2 md:mt-4">
                        <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" onClick={handlePrev}><ChevronLeft className="w-4 h-4" /></Button>
                            <Button variant="outline" size="sm" onClick={handleToday}>Hoy</Button>
                            <Button variant="outline" size="sm" onClick={handleNext}><ChevronRight className="w-4 h-4" /></Button>
                        </div>

                        <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className="text-xs md:text-sm w-auto justify-center text-left font-semibold text-slate-700"
                                >
                                    {view === 'day' ? format(date, 'd MMM yyyy', { locale: es }) :
                                     view === 'week' ? `Semana del ${format(startOfWeek(date, { weekStartsOn: 1 }), 'd MMM', { locale: es })}` :
                                     format(date, 'MMM yyyy', { locale: es })}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={handleDateSelect}
                                    initialFocus
                                    locale={es}
                                />
                            </PopoverContent>
                        </Popover>

                        <div className="flex items-center gap-1">
                            <Button variant={view === 'day' ? 'default' : 'outline'} size="sm" onClick={() => setView('day')}>Día</Button>
                            <Button variant={view === 'week' ? 'default' : 'outline'} size="sm" onClick={() => setView('week')}>Semana</Button>
                            <Button variant={view === 'month' ? 'default' : 'outline'} size="sm" onClick={() => setView('month')}>Mes</Button>
                            <Button variant={view === 'teams' ? 'default' : 'outline'} size="sm" onClick={() => setView('teams')}>Equipos</Button>
                        </div>

                        <Button
                            variant="outline"
                            onClick={handleRefresh}
                            disabled={refreshing}
                            size="sm"
                            className="flex items-center gap-1"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">Actualizar</span>
                        </Button>

                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCreateTask}
                                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" />
                                <span className="hidden sm:inline">Tarea</span>
                            </Button>
                            <Button
                                onClick={() => {
                                    setSelectedEvent(null);
                                    setShowForm(true);
                                }}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" />
                                <span className="hidden sm:inline">Servicio</span>
                            </Button>
                        </div>
                    </div>
                </header>
            )}

            {error && (
                <Alert variant="destructive" className="m-2 md:m-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {isCleanerView && (
              <div className="flex-shrink-0 bg-blue-50 border-b border-t border-blue-200">
                <Accordion type="single" collapsible defaultValue="info-dia" className="w-full">
                    <AccordionItem value="info-dia" className="border-none">
                        <AccordionTrigger className="hover:no-underline py-2 px-3 mx-2 my-2 bg-white rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-2">
                                <Info className="w-5 h-5 text-blue-600" />
                                <span className="font-semibold text-slate-900">Información del Día</span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-2 pb-2">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <div className="p-2 md:p-3 bg-white rounded-lg shadow-sm flex items-center gap-2 md:gap-3">
                                    <Car className="w-5 md:w-6 h-5 md:h-6 text-blue-600 flex-shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs text-slate-500 font-semibold">Vehículo Hoy</p>
                                        {assignedVehicle ? (
                                            <>
                                                <p className="text-sm md:text-base text-slate-900 font-bold truncate">{assignedVehicle}</p>
                                                {mainDriverName && (
                                                    <p className="text-xs text-slate-600 mt-1">
                                                        <span className="font-semibold">Conductor:</span> {mainDriverName}
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <p className="text-sm text-slate-400 italic">Sin asignar</p>
                                        )}
                                    </div>
                                </div>

                                <div className="p-2 md:p-3 bg-white rounded-lg shadow-sm flex items-center gap-2 md:gap-3">
                                    <Users className="w-5 md:w-6 h-5 md:h-6 text-purple-600 flex-shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs text-slate-500 font-semibold">Equipo del Día</p>
                                        {Array.isArray(teamMembers) && teamMembers.length > 0 ? (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {teamMembers.map((memberName, index) => (
                                                    <Badge
                                                        key={index}
                                                        variant="secondary"
                                                        className="text-xs"
                                                    >
                                                        {memberName}
                                                    </Badge>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-slate-400 italic">Sin equipo asignado</p>
                                        )}
                                    </div>
                                </div>

                                <div className="p-2 md:p-3 bg-white rounded-lg shadow-sm flex items-center gap-2 md:gap-3">
                                    <KeySquare className="w-5 md:w-6 h-5 md:h-6 text-orange-600 flex-shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs text-slate-500 font-semibold">Llaves Necesarias</p>
                                        {requiredKeys.length > 0 ? (
                                            <p className="text-sm md:text-base text-slate-900 font-bold truncate">
                                                {requiredKeys.map(k => k.identifier).join(', ')}
                                            </p>
                                        ) : (
                                            <p className="text-sm text-slate-400 italic">Sin llaves</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
              </div>
            )}

            {user?.role === 'admin' && (
                <div className="flex-shrink-0">
                    <TaskList
                        user={user}
                        tasks={tasks}
                        selectedDate={date}
                        onTaskClick={handleTaskClick}
                        onToggleTaskStatus={handleToggleTaskStatus}
                    />
                </div>
            )}

            <div className="flex-grow overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-auto bg-white">
                    <div className="w-full h-full">
                        <Suspense fallback={
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center space-y-3">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
                                    <p className="text-slate-600">Cargando vista...</p>
                                </div>
                            </div>
                        }>
                            {view === 'teams' ? (
                                <HorarioEquiposView
                                    schedules={filteredSchedules}
                                    date={date}
                                    users={users}
                                    dailyTeamAssignments={dailyTeamAssignments}
                                    onSelectEvent={handleSelectEvent}
                                />
                            ) : (
                                <HorarioCalendario
                                    ref={calendarRef}
                                    events={filteredSchedules}
                                    date={date}
                                    view={view}
                                    onNavigate={setDate}
                                    onView={setView}
                                    onSelectEvent={handleSelectEvent}
                                    onCreateAtTime={user?.role === 'admin' ? handleCreateAtTime : null}
                                    users={users}
                                    isCleanerView={isCleanerView}
                                    selectedCleanerId={user?.id}
                                    isReadOnly={isCleanerView}
                                    onMoveEvent={user?.role === 'admin' ? handleMoveEvent : null}
                                    onResizeEvent={user?.role === 'admin' ? handleResizeEvent : null}
                                />
                            )}
                        </Suspense>
                    </div>
                </div>
            </div>

            <Dialog open={showForm} onOpenChange={() => {
                setShowForm(false);
                setSelectedEvent(null);
            }}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {isCleanerView ? 'Detalles del Servicio' : selectedEvent?.id ? 'Editar Servicio' : 'Nuevo Servicio'}
                        </DialogTitle>
                    </DialogHeader>
                    <Suspense fallback={
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                        </div>
                    }>
                        <CrearServicioForm
                            schedule={selectedEvent}
                            onSave={handleSaveService}
                            onCancel={() => {
                                setShowForm(false);
                                setSelectedEvent(null);
                            }}
                            onDelete={!isCleanerView ? handleServiceDeleted : null}
                            users={users}
                            isReadOnly={isCleanerView}
                            selectedCleanerId={user?.id}
                            onClockInOut={isCleanerView ? handleClockInOut : null}
                            openInMaps={openInMaps}
                            currentServiceElapsedTime={currentServiceElapsedTime}
                        />
                    </Suspense>
                </DialogContent>
            </Dialog>

            {user?.role === 'admin' && (
                <Dialog open={showTaskForm} onOpenChange={() => {
                    setShowTaskForm(false);
                    setSelectedTask(null);
                }}>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>
                                {selectedTask?.id ? 'Editar Tarea' : 'Nueva Tarea'}
                            </DialogTitle>
                        </DialogHeader>
                        <Suspense fallback={
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                            </div>
                        }>
                            <CreateTaskForm
                                task={selectedTask}
                                onSave={handleSaveTask}
                                onCancel={() => {
                                    setShowTaskForm(false);
                                    setSelectedTask(null);
                                }}
                                onDelete={selectedTask?.id ? handleDeleteTask : null}
                            />
                        </Suspense>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}