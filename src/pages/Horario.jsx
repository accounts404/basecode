import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
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
const HorarioColorView = lazy(() => import("../components/horario/HorarioColorView"));
const HorarioRutasView = lazy(() => import("../components/horario/HorarioRutasView"));
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

// Parsear ISO local (sin conversión de timezone)
const parseISOAsUTC = (isoString) => {
    if (!isoString) return null;
    const clean = isoString.endsWith('Z') ? isoString.slice(0, -1) : isoString;
    return new Date(clean);
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

                // Solo mostrar llaves si el limpiador es permanente o tiene permiso explícito
                const canSeeAccess = user?.employee_type === 'permanent' || user?.can_see_access_info;

                if (canSeeAccess) {
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

            const allAssignments = await DailyTeamAssignment.list();
            const matchingAssignments = allAssignments.filter(assignment => {
                if (!assignment.date) return false;

                let assignmentDateStr;
                if (typeof assignment.date === 'string') {
                    assignmentDateStr = assignment.date.slice(0, 10);
                } else {
                    return false;
                }

                return assignmentDateStr === selectedDateStr;
            });

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
            const dayBefore = subDays(forDate, 7);
            const dayAfter = addDays(forDate, 7);

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

    // Refresco silencioso (background) — no activa el spinner global
    const silentRefresh = async () => {
        if (!user) return;
        try {
            if (user.role === 'admin') {
                const [allSchedules, allTasks, allAssignments] = await Promise.all([
                    loadAllRecords('Schedule', '-start_time'),
                    loadAllRecords('Task', '-created_date'),
                    loadAllRecords('DailyTeamAssignment', '-date')
                ]);
                setSchedules(allSchedules);
                setTasks(allTasks);
                setDailyTeamAssignments(allAssignments);
            } else {
                await loadCleanerSpecificData(date, true);
            }
        } catch (error) {
            logger.error('Horario', 'Error en silentRefresh', error);
        }
    };

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
        const deletedId = selectedEvent?.id;
        setShowForm(false);
        setSelectedEvent(null);

        // 1. ACTUALIZACIÓN OPTIMISTA (Eliminar de la vista inmediatamente)
        if (deletedId) {
            setSchedules(prev => prev.filter(s => s.id !== deletedId));
        }

        // 2. Refresco silencioso en background (sin spinner)
        silentRefresh();
    };

    // Clock In/Out usando funciones backend (atómico, idempotente, timestamp del servidor)
    const handleClockInOut = async (scheduleId, action) => {
        if (clockInProcessingRef.current) {
            console.log('[Horario] ⏳ Proceso en curso, ignorando click duplicado');
            return;
        }

        clockInProcessingRef.current = true;
        navigationInProgressRef.current = true;

        // Generar idempotency key único para esta operación
        const idempotencyKey = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });

        // Capturar GPS — solicita permiso al usuario si aún no lo ha otorgado
        // El navegador mostrará el diálogo nativo: "Permitir una vez" / "Siempre" / "No permitir"
        let userLocation = null;
        if ('geolocation' in navigator) {
            toast({
                title: action === 'clock_in' ? '📍 Obteniendo ubicación...' : '⏳ Finalizando servicio...',
                description: action === 'clock_in' ? 'Si tu navegador lo solicita, permite el acceso a tu ubicación.' : 'Por favor espera...',
                duration: 20000,
            });
            try {
                const { getUserLocation } = await import('@/components/utils/clockService');
                userLocation = await getUserLocation();
            } catch (e) {
                console.warn('[Horario] Error importando getUserLocation:', e);
            }
        }

        toast({
            title: action === 'clock_in' ? '⏳ Iniciando servicio...' : '⏳ Finalizando servicio...',
            description: 'Por favor espera...',
            duration: 30000,
        });

        try {
            const functionName = action === 'clock_in' ? 'clockIn' : 'clockOut';
            console.log(`[Horario] 🎬 Invocando backend ${functionName}...`);

            // Reintentos automáticos con backoff (hasta 4 intentos)
            let result = null;
            let lastError = null;
            for (let attempt = 0; attempt < 4; attempt++) {
                try {
                    if (attempt > 0) {
                        const delay = attempt * 1500;
                        console.log(`[Horario] 🔄 Reintento ${attempt} en ${delay}ms...`);
                        await new Promise(r => setTimeout(r, delay));
                    }
                    const response = await base44.functions.invoke(functionName, {
                        scheduleId,
                        idempotencyKey,
                        location: userLocation  // puede ser null si el usuario negó GPS
                    });
                    result = response.data;
                    break; // éxito
                } catch (err) {
                    lastError = err;
                    console.warn(`[Horario] ⚠️ Intento ${attempt + 1} falló:`, err.message);
                }
            }

            if (!result) throw lastError || new Error('Sin respuesta del servidor');
            if (!result.success) throw new Error(result.error || `Error en ${functionName}`);

            console.log(`[Horario] ✅ ${functionName} exitoso:`, result.message);

            // Actualizar caché local con el schedule retornado
            if (result.schedule) {
                const schedulesArray = Array.isArray(schedules) ? schedules : [];
                const updated = schedulesArray.map(s => s.id === scheduleId ? result.schedule : s);
                setSchedules(updated);
                saveToCache(LEGACY_CACHE_KEYS.SCHEDULES, updated);
            }

            setShowForm(false);
            setSelectedEvent(null);

            if (action === 'clock_in') {
                registerClockIn(scheduleId, result.schedule);
                toast({
                    title: '✅ Servicio iniciado',
                    description: 'Redirigiendo...',
                    duration: 2000,
                    className: 'bg-green-50 border-green-200'
                });
                setTimeout(() => {
                    navigate(createPageUrl('ServicioActivo'), { replace: true });
                    clockInProcessingRef.current = false;
                    navigationInProgressRef.current = false;
                }, 500);
            } else {
                registerClockOut(scheduleId);
                toast({
                    title: '✅ Servicio finalizado',
                    description: result.message || '¡Buen trabajo!',
                    duration: 4000,
                    className: 'bg-green-50 border-green-200'
                });
                await loadCleanerSpecificData(date, true);
                clockInProcessingRef.current = false;
                navigationInProgressRef.current = false;
            }

        } catch (error) {
            console.error(`[Horario] ❌ Error en ${action}:`, error);
            const isNetworkError = error.message?.includes('500') || error.message?.includes('network') || error.message?.includes('Network') || error.message?.includes('fetch');
            toast({
                variant: 'destructive',
                title: '❌ Error al ' + (action === 'clock_in' ? 'iniciar' : 'finalizar') + ' servicio',
                description: isNetworkError
                    ? 'Hubo un problema de conexión. Por favor verifica tu señal e intenta de nuevo en unos segundos.'
                    : (error.message || 'Error desconocido. Intenta de nuevo.'),
                duration: 10000,
            });
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
            const originalSchedulesArray = Array.isArray(originalCleanerSchedules) ? originalCleanerSchedules : [];

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
        if (isCleanerView) return;

        try {
            let originalCleanerSchedules = [];
            const isNewService = !selectedEvent?.id;

            if (serviceData.cleaner_ids && serviceData.cleaner_ids.length > 0) {
                serviceData.color = getColorFromMostExperiencedCleaner(serviceData.cleaner_ids);
            }

            let savedServiceId = null;
            let savedServiceObj = null;

            // 1. GUARDADO PRINCIPAL (Bloquea ~1 seg para confirmar red y base de datos)
            if (!isNewService) {
                originalCleanerSchedules = selectedEvent.cleaner_schedules || [];
                const originalRecurrenceRule = selectedEvent.recurrence_rule || 'none';
                const newRecurrenceRule = serviceData.recurrence_rule || 'none';

                if (originalRecurrenceRule !== newRecurrenceRule) {
                    const { data: modResult } = await modificarRecurrencia({
                        scheduleId: selectedEvent.id, updatedData: serviceData, updateScope, originalRecurrenceRule
                    });
                    if (!modResult.success) throw new Error(modResult.error);
                    savedServiceId = selectedEvent.id;
                    savedServiceObj = { ...selectedEvent, ...serviceData };
                } else if (updateScope === 'this_and_future' && selectedEvent.recurrence_id) {
                    await Schedule.update(selectedEvent.id, serviceData);
                    savedServiceId = selectedEvent.id;
                    savedServiceObj = { ...selectedEvent, ...serviceData };
                } else {
                    await Schedule.update(selectedEvent.id, serviceData);
                    savedServiceId = selectedEvent.id;
                    savedServiceObj = { ...selectedEvent, ...serviceData };
                }
            } else {
                const newService = await Schedule.create(serviceData);
                savedServiceId = newService.id;
                savedServiceObj = newService;
            }

            // 2. CIERRE INSTANTÁNEO Y ACTUALIZACIÓN OPTIMISTA (Liberamos la pantalla)
            setSchedules(prev => {
                if (isNewService) return [...prev, savedServiceObj];
                return prev.map(s => s.id === savedServiceId ? { ...s, ...savedServiceObj } : s);
            });
            setShowForm(false);
            setSelectedEvent(null);

            // 3. TAREAS PESADAS EN BACKGROUND (Generación de meses, WorkEntries y Refresco)
            (async () => {
                try {
                    const statusChangedToCompleted = (!isNewService && selectedEvent.status !== 'completed' && serviceData.status === 'completed') || (isNewService && serviceData.status === 'completed');

                    // A. Operaciones complejas de base de datos
                    if (!isNewService && updateScope === 'this_and_future' && selectedEvent.recurrence_id && selectedEvent.recurrence_rule === serviceData.recurrence_rule) {
                        await actualizarSerieRecurrente({ scheduleId: savedServiceId, updateScope, updatedData: serviceData });
                    }
                    if (statusChangedToCompleted && savedServiceId) {
                        await processScheduleForWorkEntries({ scheduleId: savedServiceId, mode: 'create' });
                    }
                    if (!isNewService && selectedEvent.status === 'completed' && serviceData.cleaner_schedules && updateScope === 'this_only') {
                        await updateWorkEntriesIfNeeded(savedServiceId, serviceData.cleaner_schedules, originalCleanerSchedules);
                    }
                    if (isNewService && serviceData.recurrence_rule && serviceData.recurrence_rule !== 'none') {
                        await generarRecurrencias({ scheduleId: savedServiceId, recurrenceRule: serviceData.recurrence_rule, months: 6 });
                    }
                    if (serviceData.structured_service_notes && serviceData.client_id) {
                        const currentClient = await Client.get(serviceData.client_id);
                        if (!isEqual(serviceData.structured_service_notes, currentClient.structured_service_notes || {})) {
                            await Client.update(currentClient.id, { structured_service_notes: serviceData.structured_service_notes });
                        }
                    }

                    // B. Sincronización silenciosa final
                    const [allSchedules, allTasks, allAssignments] = await Promise.all([
                        loadAllRecords('Schedule', '-start_time'),
                        loadAllRecords('Task', '-created_date'),
                        loadAllRecords('DailyTeamAssignment', '-date')
                    ]);
                    setSchedules(allSchedules);
                    setTasks(allTasks);
                    setDailyTeamAssignments(allAssignments);

                } catch (bgError) {
                    console.error('[Horario] Error en background tasks:', bgError);
                }
            })();

        } catch (error) {
            console.error('[Horario] Error guardando servicio:', error);
            setError(`Error al guardar: ${error.message || 'Intente nuevamente'}`);
            setShowForm(false);
        }
    };

    const handleResizeEvent = async (eventId, newStartTime, newEndTime) => {
        if (isCleanerView || user?.role !== 'admin') return;

        const toLocalISO = (d) => {
            const y = d.getUTCFullYear(), mo = String(d.getUTCMonth()+1).padStart(2,'0'), dy = String(d.getUTCDate()).padStart(2,'0');
            const h = String(d.getUTCHours()).padStart(2,'0'), mi = String(d.getUTCMinutes()).padStart(2,'0');
            return `${y}-${mo}-${dy}T${h}:${mi}:00.000`;
        };
        const startStr = toLocalISO(newStartTime);
        const endStr = toLocalISO(newEndTime);

        // 1. ACTUALIZACIÓN OPTIMISTA (Instantánea)
        setSchedules(prev => prev.map(s => s.id === eventId ? { ...s, start_time: startStr, end_time: endStr } : s));

        try {
            // 2. Sincronización en background sin bloquear UI
            await Schedule.update(eventId, { start_time: startStr, end_time: endStr });
        } catch (error) {
            console.error('[Horario] Error al redimensionar:', error);
            setError(`Error al guardar tamaño: ${error.message}`);
            silentRefresh(); // Revertir y recargar si falla el backend
        }
    };

    const handleMoveEvent = async (eventId, newStartTime, newEndTime) => {
        if (isCleanerView || user?.role !== 'admin') return;

        const toLocalISO = (d) => {
            const y = d.getUTCFullYear(), mo = String(d.getUTCMonth()+1).padStart(2,'0'), dy = String(d.getUTCDate()).padStart(2,'0');
            const h = String(d.getUTCHours()).padStart(2,'0'), mi = String(d.getUTCMinutes()).padStart(2,'0');
            return `${y}-${mo}-${dy}T${h}:${mi}:00.000`;
        };
        const startStr = toLocalISO(newStartTime);
        const endStr = toLocalISO(newEndTime);

        let updatePayload = { start_time: startStr, end_time: endStr };
        const scheduleToUpdate = schedules.find(s => s.id === eventId);

        if (scheduleToUpdate?.cleaner_schedules && Array.isArray(scheduleToUpdate.cleaner_schedules) && scheduleToUpdate.cleaner_schedules.length > 0) {
            const originalStart = new Date(scheduleToUpdate.start_time);
            const timeDiff = newStartTime.getTime() - originalStart.getTime();
            updatePayload.cleaner_schedules = scheduleToUpdate.cleaner_schedules.map(cs => ({
                ...cs,
                start_time: toLocalISO(new Date(new Date(cs.start_time).getTime() + timeDiff)),
                end_time: toLocalISO(new Date(new Date(cs.end_time).getTime() + timeDiff)),
            }));
        }

        // 1. ACTUALIZACIÓN OPTIMISTA (Instantánea)
        setSchedules(prev => prev.map(s => s.id === eventId ? { ...s, ...updatePayload } : s));

        try {
            // 2. Sincronización en background sin bloquear UI
            await Schedule.update(eventId, updatePayload);
        } catch (error) {
            console.error('[Horario] Error al mover:', error);
            setError(`Error al guardar movimiento: ${error.message}`);
            silentRefresh(); // Revertir y recargar si falla el backend
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

        const pollingInterval = user?.role === 'admin' ? 30000 : 15000;

        console.log(`[Horario] 🔄 Polling cada ${pollingInterval/1000}s`);

        pollingRef.current = setInterval(async () => {
            if (navigationInProgressRef.current || clockInProcessingRef.current) {
                console.log('[Horario] 🚫 Operación en progreso, saltando polling...');
                return;
            }

            try {
                if (user?.role === 'admin') {
                    // Obtener TODOS los registros con paginación automática
                    const [allSchedules, allTasks, allAssignments] = await Promise.all([
                        loadAllRecords('Schedule', '-start_time'),
                        loadAllRecords('Task', '-created_date'),
                        loadAllRecords('DailyTeamAssignment', '-date')
                    ]);
                    setSchedules(allSchedules);
                    setTasks(allTasks);
                    setDailyTeamAssignments(allAssignments);
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
                <header className="flex-shrink-0 bg-white border-b shadow-sm z-10" style={{ borderColor: currentTheme.colors.cardBorder }}>
                    <div className="relative flex items-center justify-between px-2 py-3">
                        <Button variant="ghost" size="icon" onClick={handlePrev} className="h-10 w-10 rounded-full hover:bg-slate-100 active:bg-slate-200">
                            <ChevronLeft className="w-6 h-6 text-slate-700" />
                        </Button>
                        <div className="flex flex-col items-center justify-center min-w-[140px] cursor-pointer" onClick={handleToday}>
                            <h1 className="text-lg font-bold text-slate-900 leading-tight">
                                {isToday(date) ? 'Hoy' : format(date, "EEEE d", { locale: es })}
                            </h1>
                            <p className="text-xs text-slate-500 font-medium capitalize">{format(date, "MMMM yyyy", { locale: es })}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={handleNext} className="h-10 w-10 rounded-full hover:bg-slate-100 active:bg-slate-200">
                            <ChevronRight className="w-6 h-6 text-slate-700" />
                        </Button>
                        <Button variant="ghost" onClick={handleRefresh} disabled={refreshing} size="icon" className="h-9 w-9 rounded-full absolute right-2 bg-white shadow-md border border-slate-100">
                            <RefreshCw className={`w-4 h-4 text-blue-600 ${refreshing ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </header>
            ) : (
                <header className="flex-shrink-0 bg-white border-b shadow-sm">
                    <div className="px-4 md:px-6 py-3 flex flex-col gap-3">
                        {/* Title row */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
                                    <CalendarIcon className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-lg font-bold text-slate-900 leading-tight">Horario de Servicios</h1>
                                    <p className="text-xs text-slate-400 capitalize hidden sm:block">{format(date, "EEEE, d 'de' MMMM yyyy", { locale: es })}</p>
                                </div>
                                {!loading && (
                                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Actualizándose automáticamente"></span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCreateTask}
                                    className="bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1.5"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline text-xs font-semibold">Tarea</span>
                                </Button>
                                <Button
                                    onClick={() => { setSelectedEvent(null); setShowForm(true); }}
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline text-xs font-semibold">Servicio</span>
                                </Button>
                            </div>
                        </div>

                        {/* Controls row */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Date navigation group */}
                            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                                <Button variant="ghost" size="sm" onClick={handlePrev} className="h-7 w-7 p-0 hover:bg-white rounded-md">
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-7 px-3 font-semibold text-slate-700 hover:bg-white rounded-md text-xs">
                                            {view === 'day' ? format(date, 'd MMM yyyy', { locale: es }) :
                                             view === 'week' ? `Sem. ${format(startOfWeek(date, { weekStartsOn: 1 }), 'd MMM', { locale: es })}` :
                                             format(date, 'MMM yyyy', { locale: es })}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar mode="single" selected={date} onSelect={handleDateSelect} initialFocus locale={es} />
                                    </PopoverContent>
                                </Popover>
                                <Button variant="ghost" size="sm" onClick={handleNext} className="h-7 w-7 p-0 hover:bg-white rounded-md">
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>

                            <Button variant="outline" size="sm" onClick={handleToday} className="h-7 px-3 text-xs font-semibold border-slate-200 text-slate-600 hover:bg-slate-50">
                                Hoy
                            </Button>

                            <div className="w-px h-5 bg-slate-200 hidden sm:block" />

                            {/* View toggle group */}
                            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                                {[['day','Día'],['week','Semana'],['month','Mes'],['teams','Equipos'],['color','Colores'],['routes','Rutas']].map(([v, label]) => (
                                    <button
                                        key={v}
                                        onClick={() => setView(v)}
                                        className={`h-7 px-2.5 rounded-md text-xs font-semibold transition-all ${
                                            view === v
                                                ? 'bg-white text-blue-700 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            <Button
                                variant="ghost"
                                onClick={handleRefresh}
                                disabled={refreshing}
                                size="sm"
                                className="h-7 px-2 text-slate-400 hover:text-slate-700"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
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
              <div className="flex-shrink-0 bg-white border-b">
                <Accordion type="single" collapsible>
                  <AccordionItem value="info" className="border-0">
                    <AccordionTrigger className="px-4 py-2.5 hover:no-underline hover:bg-slate-50">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <Car className="w-4 h-4 text-blue-500" />
                          <span className="font-medium text-slate-700 truncate max-w-[100px]">
                            {assignedVehicle || <span className="italic text-slate-400">Sin vehículo</span>}
                          </span>
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <Users className="w-4 h-4 text-purple-500" />
                          <span className="font-medium text-slate-700">
                            {Array.isArray(teamMembers) && teamMembers.length > 0
                              ? `${teamMembers.length} miembro${teamMembers.length > 1 ? 's' : ''}`
                              : <span className="italic text-slate-400">Sin equipo</span>}
                          </span>
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <KeySquare className="w-4 h-4 text-amber-500" />
                          <span className="font-medium text-slate-700">
                            {requiredKeys.length > 0
                              ? `${requiredKeys.length} llave${requiredKeys.length > 1 ? 's' : ''}`
                              : <span className="italic text-slate-400">Sin llaves</span>}
                          </span>
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 pt-0">
                      <div className="grid grid-cols-1 gap-3">

                        {/* Vehículo */}
                        <div className="flex items-start gap-3 bg-blue-50 rounded-xl p-3">
                          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <Car className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-0.5">Vehículo</p>
                            {assignedVehicle ? (
                              <>
                                <p className="text-sm font-bold text-slate-800">{assignedVehicle}</p>
                                {mainDriverName && (
                                  <p className="text-xs text-slate-500 mt-0.5">Conductor: <span className="font-medium text-slate-700">{mainDriverName}</span></p>
                                )}
                              </>
                            ) : (
                              <p className="text-sm text-slate-400 italic">No hay vehículo asignado para hoy</p>
                            )}
                          </div>
                        </div>

                        {/* Equipo */}
                        <div className="flex items-start gap-3 bg-purple-50 rounded-xl p-3">
                          <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <Users className="w-5 h-5 text-purple-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-purple-500 uppercase tracking-wide mb-1">Equipo</p>
                            {Array.isArray(teamMembers) && teamMembers.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {teamMembers.map((name, i) => (
                                  <span key={i} className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-lg text-sm font-medium">{name}</span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400 italic">No hay equipo asignado para hoy</p>
                            )}
                          </div>
                        </div>

                        {/* Llaves */}
                        <div className="flex items-start gap-3 bg-amber-50 rounded-xl p-3">
                          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                            <KeySquare className="w-5 h-5 text-amber-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">Llaves requeridas</p>
                            {requiredKeys.length > 0 ? (
                              <div className="flex flex-col gap-1.5">
                                {requiredKeys.map((key, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-800 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                    <div>
                                      <span className="text-sm font-semibold text-slate-800">{key.identifier}</span>
                                      <span className="text-xs text-slate-500 ml-1.5">— {key.client_name}</span>
                                      {key.access_type && (
                                        <span className="ml-1.5 text-xs text-amber-700 capitalize">({key.access_type})</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400 italic">No se requieren llaves para hoy</p>
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
                            ) : view === 'color' ? (
                                <HorarioColorView
                                    events={filteredSchedules}
                                    date={date}
                                    users={users}
                                    onSelectEvent={handleSelectEvent}
                                />
                            ) : view === 'routes' ? (
                                <HorarioRutasView
                                    schedules={filteredSchedules}
                                    date={date}
                                    users={users}
                                    dailyTeamAssignments={dailyTeamAssignments}
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
                            currentUser={user}
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