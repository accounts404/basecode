
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from '@/utils';
import {
    syncActiveService
} from '@/components/utils/activeServiceManager';
import { performClockIn, performClockOut } from '../components/utils/clockService';
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
import CrearServicioForm from "../components/horario/CrearServicioForm";
import CreateTaskForm from "../components/tasks/CreateTaskForm";
import TaskList from "../components/tasks/TaskList";

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

const CACHE_KEYS = {
    SCHEDULES: 'redoak_cleaner_schedules',
    VEHICLE: 'redoak_cleaner_vehicle',
    TEAM: 'redoak_cleaner_team',
    KEYS: 'redoak_cleaner_keys',
    LAST_UPDATE: 'redoak_cleaner_last_update'
};

const saveToCache = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem(CACHE_KEYS.LAST_UPDATE, Date.now().toString());
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
    const [selectedTask, setSelectedTask] = null);

    const [error, setError] = useState('');

    const [clockInProcessing, setClockInProcessing] = useState(false);
    const [clockOutProcessing, setClockOutProcessing] = useState(false);

    const intervalRef = useRef(null);
    const pollingRef = useRef(null);
    const calendarRef = useRef(null);
    const loadingRef = useRef(false);
    const navigationInProgressRef = useRef(false);

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
        };
    }, []);

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
        const selectedDateStr = format(forDate, 'yyyy-MM-dd');
        const todaySchedules = schedulesArray.filter(s => {
            if (!s.start_time || !s.cleaner_ids) return false;
            const scheduleDate = format(parseISOAsUTC(s.start_time), 'yyyy-MM-dd');
            return scheduleDate === selectedDateStr && Array.isArray(s.cleaner_ids) && s.cleaner_ids.includes(user.id);
        });

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

                setRequiredKeys(keys);
                saveToCache(CACHE_KEYS.KEYS, keys);
            } catch (clientError) {
                console.warn('Error cargando información de clientes:', clientError);
                setRequiredKeys([]);
            }
        } else {
            setRequiredKeys([]);
            saveToCache(CACHE_KEYS.KEYS, []);
        }
    }, [user]);

    const loadCleanerSpecificData = useCallback(async (forDate, isSilentUpdate = false) => {
        if (!user || user.role === 'admin') return;

        if (loadingRef.current) {
            console.log('[Horario] ⏳ Carga ya en progreso, saltando...');
            return;
        }

        if (navigationInProgressRef.current || clockInProcessing || clockOutProcessing) {
            console.log('[Horario] 🚫 Operación en progreso, saltando carga...');
            return;
        }

        loadingRef.current = true;

        if (!isSilentUpdate) {
            setLoadingCleanerData(true);
        }

        try {
            const dayBefore = subDays(forDate, 2);
            const dayAfter = addDays(forDate, 2);

            const formatLocalDate = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const startDateStr = formatLocalDate(dayBefore) + 'T00:00:00.000Z';
            const endDateStr = formatLocalDate(dayAfter) + 'T23:59:59.999Z';

            console.log(`[Horario] 🔍 ${isSilentUpdate ? 'Actualización silenciosa' : 'Cargando servicios'}...`);

            const [cleanerSchedules, assignmentsResponse] = await Promise.all([
                Schedule.filter({
                    cleaner_ids: { $contains: user.id },
                    status: { $ne: 'cancelled' },
                    start_time: {
                        $gte: startDateStr,
                        $lte: endDateStr
                    }
                }).catch(filterError => {
                    console.warn('[Horario] ⚠️ Filtro optimizado falló:', filterError);
                    const monthStart = startOfMonth(forDate);
                    const monthEnd = endOfMonth(forDate);
                    return Schedule.filter({
                        start_time: {
                            $gte: formatLocalDate(monthStart) + 'T00:00:00.000Z',
                            $lte: formatLocalDate(monthEnd) + 'T23:59:59.999Z'
                        }
                    }).then(allSchedules => {
                        const allSchedulesArray = Array.isArray(allSchedules) ? allSchedules : [];
                        return allSchedulesArray.filter(s =>
                            s.cleaner_ids && Array.isArray(s.cleaner_ids) && s.cleaner_ids.includes(user.id) && s.status !== 'cancelled'
                        );
                    });
                }),

                (async () => {
                    try {
                        const selectedDateStr = formatLocalDate(forDate);
                        const { getDailyTeamAssignments: getAssignmentsFunc } = await import('@/functions/getDailyTeamAssignments');
                        return await getAssignmentsFunc({ date: selectedDateStr });
                    } catch (error) {
                        console.error('[Horario] ❌ Error cargando assignments:', error);
                        return { data: { assignments: [] } };
                    }
                })()
            ]);

            console.log(`[Horario] ✅ Servicios cargados: ${cleanerSchedules?.length || 0}`);
            console.log('[Horario] 📡 Assignments Response:', assignmentsResponse);

            const currentCleanerSchedules = Array.isArray(cleanerSchedules) ? cleanerSchedules : [];
            setSchedules(currentCleanerSchedules);
            saveToCache(CACHE_KEYS.SCHEDULES, currentCleanerSchedules);

            if (assignmentsResponse.data && assignmentsResponse.data.assignments && Array.isArray(assignmentsResponse.data.assignments)) {
                console.log('[Horario] 📋 Assignments encontrados:', assignmentsResponse.data.assignments.length);
                
                const currentAssignment = assignmentsResponse.data.assignments.find(a =>
                    a.team_member_ids && Array.isArray(a.team_member_ids) && a.team_member_ids.includes(user.id)
                );

                console.log('[Horario] 🎯 Assignment actual para el usuario:', currentAssignment);

                if (currentAssignment) {
                    console.log('[Horario] 🚗 Vehículo:', currentAssignment.vehicle_info);
                    console.log('[Horario] 👤 Conductor:', currentAssignment.main_driver_name);
                    console.log('[Horario] 👥 Equipo:', currentAssignment.team_members_info);
                    
                    setAssignedVehicle(currentAssignment.vehicle_info || null);
                    setMainDriverName(currentAssignment.main_driver_name || null);
                    saveToCache(CACHE_KEYS.VEHICLE, {
                        vehicle: currentAssignment.vehicle_info || null,
                        driver: currentAssignment.main_driver_name || null
                    });

                    if (currentAssignment.team_members_info && Array.isArray(currentAssignment.team_members_info)) {
                        const teammates = currentAssignment.team_members_info.filter(member => member.id !== user.id);
                        setTeamMembers(teammates);
                        saveToCache(CACHE_KEYS.TEAM, teammates);
                        console.log('[Horario] ✅ Compañeros de equipo actualizados:', teammates.length);
                    } else {
                        setTeamMembers([]);
                        saveToCache(CACHE_KEYS.TEAM, []);
                        console.log('[Horario] ℹ️ Sin compañeros de equipo');
                    }
                } else {
                    console.log('[Horario] ℹ️ Sin assignment para este usuario hoy');
                    setAssignedVehicle(null);
                    setMainDriverName(null);
                    setTeamMembers([]);
                    saveToCache(CACHE_KEYS.VEHICLE, { vehicle: null, driver: null });
                    saveToCache(CACHE_KEYS.TEAM, []);
                }
            } else {
                console.log('[Horario] ⚠️ Respuesta de assignments vacía o inválida');
                setAssignedVehicle(null);
                setMainDriverName(null);
                setTeamMembers([]);
                saveToCache(CACHE_KEYS.VEHICLE, { vehicle: null, driver: null });
                saveToCache(CACHE_KEYS.TEAM, []);
            }

            await loadRequiredKeysForDate(currentCleanerSchedules, forDate);

        } catch (error) {
            console.error('[Horario] ❌ Error cargando datos:', error);
        } finally {
            if (!isSilentUpdate) {
                setLoadingCleanerData(false);
            }
            loadingRef.current = false;
        }
    }, [user, loadRequiredKeysForDate, clockInProcessing, clockOutProcessing]);

    const loadInitialData = async () => {
        try {
            const currentUser = await User.me();
            setUser(currentUser);

            console.log('[Horario] Usuario cargado:', currentUser.id, 'Rol:', currentUser.role);

            if (currentUser.role === 'admin') {
                const [allUsers, allSchedules, allTasks] = await Promise.all([
                    User.list(),
                    Schedule.list(),
                    Task.list()
                ]);
                setUsers(Array.isArray(allUsers) ? allUsers : []);
                setSchedules(Array.isArray(allSchedules) ? allSchedules : []);
                setTasks(Array.isArray(allTasks) ? allTasks : []);
                setLoading(false);
                setInitialLoadComplete(true);
                console.log('[Horario] Admin - Cargados:', allUsers?.length || 0, 'usuarios,', allSchedules?.length || 0, 'servicios');
            } else {
                console.log('[Horario] 📦 Limpiador detectado, cargando desde caché...');
                const cachedSchedules = loadFromCache(CACHE_KEYS.SCHEDULES);
                const cachedVehicle = loadFromCache(CACHE_KEYS.VEHICLE);
                const cachedTeam = loadFromCache(CACHE_KEYS.TEAM);
                const cachedKeys = loadFromCache(CACHE_KEYS.KEYS);

                if (cachedSchedules) {
                    console.log('[Horario] ✅ Mostrando', cachedSchedules.length, 'servicios desde caché');
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

                console.log('[Horario] 🔄 Iniciando actualización en background...');
                setTimeout(() => {
                    loadCleanerSpecificData(new Date(), true);
                }, 100);
            }

        } catch (error) {
            console.error('[Horario] Error cargando datos:', error);
            setError(`Error al cargar datos: ${error.message || 'Error desconocido'}`);
            if (error.response?.status === 401) {
                console.log('[Horario] Error de autenticación (401), redirigiendo al login...');
                await User.logout();
                window.location.reload();
            }
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user && user.role !== 'admin' && initialLoadComplete && !loadingRef.current && !navigationInProgressRef.current && !clockInProcessing && !clockOutProcessing) {
            console.log('[Horario] 📅 Fecha cambiada, actualizando datos...');
            loadCleanerSpecificData(date, false);
        }
    }, [date, user, initialLoadComplete, loadCleanerSpecificData, clockInProcessing, clockOutProcessing]);

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
                const [allSchedules, allTasks] = await Promise.all([
                    Schedule.list(),
                    Task.list()
                ]);
                setSchedules(Array.isArray(allSchedules) ? allSchedules : []);
                setTasks(Array.isArray(allTasks) ? allTasks : []);
                console.log('[Horario] ✅ Datos admin actualizados');
            } else {
                await loadCleanerSpecificData(date, false);
                console.log('[Horario] ✅ Datos limpiador actualizados');
            }
        } catch (error) {
            console.error('[Horario] ❌ Error en handleRefresh:', error);
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

    const handleClockInOut = async (scheduleId, action) => {
        console.log(`[Horario] 🎬 Iniciando ${action === 'clock_in' ? 'Clock In' : 'Clock Out'}...`);

        if (action === 'clock_in' && clockInProcessing) {
            console.log('[Horario] ⏳ Clock In ya en progreso...');
            return;
        }
        
        if (action === 'clock_out' && clockOutProcessing) {
            console.log('[Horario] ⏳ Clock Out ya en progreso...');
            return;
        }

        try {
            if (action === 'clock_in') {
                setClockInProcessing(true);
                setError('');

                const result = await performClockIn(scheduleId, user.id, (progress) => {
                    console.log('[Horario] Progreso Clock In:', progress.message);
                });

                if (result.success) {
                    toast({
                        title: "✅ Clock In Registrado",
                        description: result.message + (result.locationCaptured ? '' : ' (Sin ubicación GPS)'),
                        duration: 2000,
                        className: "bg-green-50 border-green-200"
                    });

                    const schedulesArray = Array.isArray(schedules) ? schedules : [];
                    const updatedSchedules = schedulesArray.map(s => 
                        s.id === scheduleId ? result.schedule : s
                    );
                    setSchedules(updatedSchedules);
                    saveToCache(CACHE_KEYS.SCHEDULES, updatedSchedules);

                    setShowForm(false);
                    setSelectedEvent(null);

                    if (isCleanerView) {
                        navigationInProgressRef.current = true;
                        console.log('[Horario] 🚀 Navegando a ServicioActivo...');
                        setTimeout(() => {
                            navigate(createPageUrl('ServicioActivo'));
                        }, 300);
                    }
                } else {
                    toast({
                        title: "❌ Error en Clock In",
                        description: result.message,
                        duration: 4000,
                        variant: "destructive"
                    });
                    setError(result.message);
                }

            } else if (action === 'clock_out') {
                setClockOutProcessing(true);
                setError('');

                const result = await performClockOut(scheduleId, user.id, (progress) => {
                    console.log('[Horario] Progreso Clock Out:', progress.message);
                });

                if (result.success) {
                    toast({
                        title: "✅ Clock Out Registrado",
                        description: result.message + (result.locationCaptured ? '' : ' (Sin ubicación GPS)'),
                        duration: 3000,
                        className: "bg-blue-50 border-blue-200"
                    });

                    const schedulesArray = Array.isArray(schedules) ? schedules : [];
                    const updatedSchedules = schedulesArray.map(s => 
                        s.id === scheduleId ? result.schedule : s
                    );
                    setSchedules(updatedSchedules);
                    saveToCache(CACHE_KEYS.SCHEDULES, updatedSchedules);

                    setShowForm(false);
                    setSelectedEvent(null);

                    if (isCleanerView) {
                        await loadCleanerSpecificData(currentDateRef.current, true);
                    }
                } else {
                    toast({
                        title: "❌ Error en Clock Out",
                        description: result.message,
                        duration: 4000,
                        variant: "destructive"
                    });
                    setError(result.message);
                }
            }

        } catch (error) {
            console.error('[Horario] ❌ Error en clock in/out:', error);
            
            toast({
                title: "❌ Error",
                description: `Error inesperado: ${error.message || 'Error desconocido'}`,
                duration: 4000,
                variant: "destructive"
            });
            setError(error.message || 'Error desconocido');
            
        } finally {
            if (action === 'clock_in') {
                setClockInProcessing(false);
            } else if (action === 'clock_out') {
                setClockOutProcessing(false);
                navigationInProgressRef.current = false; 
            }
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

        setSelectedEvent({
            preselected_date: format(dateTime, 'yyyy-MM-dd'),
            preselected_start_time: format(dateTime, 'HH:mm'),
            preselected_end_time: format(new Date(dateTime.getTime() + 4 * 60 * 60 * 1000), 'HH:mm')
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
                    const newHours = Math.round(((endTime - startTime) / (1000 * 60 * 60)) * 4) / 4;
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
        window.open(mapsUrl, '_blank');
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

        const pollingInterval = user?.role === 'admin' ? 30000 : 20000;

        console.log(`[Horario] 🔄 Polling cada ${pollingInterval/1000}s`);

        pollingRef.current = setInterval(async () => {
            if (navigationInProgressRef.current || clockInProcessing || clockOutProcessing) {
                console.log('[Horario] 🚫 Operación en progreso, saltando polling...');
                return;
            }

            try {
                if (user?.role === 'admin') {
                    const [allSchedules, allTasks] = await Promise.all([
                        Schedule.list(),
                        Task.list()
                    ]);
                    setSchedules(Array.isArray(allSchedules) ? allSchedules : []);
                    setTasks(Array.isArray(allTasks) ? allTasks : []);
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
    }, [user, initialLoadComplete, loadCleanerSpecificData, clockInProcessing, clockOutProcessing]);

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
        <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
            <Toaster />
            {isCleanerView ? (
                <header className="flex-shrink-0 bg-white border-b">
                    <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <CalendarIcon className="w-5 h-5 text-blue-600" />
                                Mi Horario
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
                                        <p className="text-xs text-slate-500 font-semibold">Compañeros</p>
                                        {teamMembers.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {teamMembers.map(member => (
                                                    <Badge
                                                        key={member.id}
                                                        variant={member.is_main_driver ? "default" : "secondary"}
                                                        className="text-xs"
                                                    >
                                                        {member.is_main_driver && '👑 '}
                                                        {member.name}
                                                    </Badge>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-slate-400 italic">Sin compañeros</p>
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
                    <div className="w-full">
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
                            currentUser={user}
                            onRefresh={handleRefresh}
                        />
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
                        isProcessing={clockInProcessing || clockOutProcessing}
                    />
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
                        <CreateTaskForm
                            task={selectedTask}
                            onSave={handleSaveTask}
                            onCancel={() => {
                                setShowTaskForm(false);
                                setSelectedTask(null);
                            }}
                            onDelete={selectedTask?.id ? handleDeleteTask : null}
                        />
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
