import React, { useState, useEffect, useRef } from 'react';
import { Schedule } from '@/entities/Schedule';
import { Clock, MapPin, Timer, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function ActiveServiceTimer({ userId, onServiceClick }) {
    const [activeService, setActiveService] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const intervalRef = useRef(null);

    useEffect(() => {
        loadActiveService();
        const pollInterval = setInterval(loadActiveService, 30000);
        return () => clearInterval(pollInterval);
    }, [userId]);

    const loadActiveService = async () => {
        try {
            const schedules = await Schedule.list();
            const active = schedules.find(schedule => {
                if (!schedule.cleaner_ids || !schedule.cleaner_ids.includes(userId)) return false;
                const cleanerClockData = schedule.clock_in_data?.find(c => c.cleaner_id === userId);
                return cleanerClockData?.clock_in_time && !cleanerClockData?.clock_out_time;
            });
            setActiveService(active);
        } catch (error) {
            console.error('Error loading active service:', error);
        }
    };

    useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        
        if (!activeService) {
            setElapsedTime(0);
            return;
        }

        const updateTimer = () => {
            const cleanerClockData = activeService.clock_in_data?.find(c => c.cleaner_id === userId);
            if (cleanerClockData?.clock_in_time) {
                const clockInTime = new Date(cleanerClockData.clock_in_time);
                const elapsed = Math.floor((new Date() - clockInTime) / 1000);
                setElapsedTime(elapsed);
            }
        };

        updateTimer();
        intervalRef.current = setInterval(updateTimer, 1000);
        
        return () => clearInterval(intervalRef.current);
    }, [activeService, userId]);

    const formatTime = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    if (!activeService) return null;

    const scheduledStart = new Date(activeService.start_time);
    const scheduledEnd = new Date(activeService.end_time);
    const scheduledDuration = (scheduledEnd - scheduledStart) / 1000; // en segundos
    const remainingTime = Math.max(0, scheduledDuration - elapsedTime);
    const isOvertime = elapsedTime > scheduledDuration;
    const progressPercentage = Math.min(100, (elapsedTime / scheduledDuration) * 100);

    return (
        <div className="bg-gradient-to-r from-green-500 via-green-600 to-blue-600 shadow-lg animate-in slide-in-from-top">
            <div 
                className="p-3 md:p-4 cursor-pointer hover:opacity-90 transition-all active:scale-[0.99]"
                onClick={() => onServiceClick?.(activeService)}
            >
                <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                    {/* Sección izquierda: Indicador + Info del servicio */}
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        {/* Indicador visual animado */}
                        <div className="relative flex-shrink-0">
                            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                                <Clock className="w-6 h-6 text-white animate-pulse" />
                            </div>
                            <div className="absolute inset-0 w-12 h-12 bg-white/30 rounded-full animate-ping"></div>
                        </div>

                        {/* Info del cliente */}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white mb-0.5 flex items-center gap-2">
                                <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs uppercase tracking-wide">
                                    En Progreso
                                </span>
                            </p>
                            <p className="text-base md:text-lg font-bold text-white truncate">
                                {activeService.client_name}
                            </p>
                            <p className="text-xs text-white/80 flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                {activeService.client_address}
                            </p>
                        </div>
                    </div>

                    {/* Sección derecha: Cronómetro y progreso */}
                    <div className="flex flex-col items-end gap-2 w-full md:w-auto">
                        {/* Cronómetro principal */}
                        <div className="flex items-center gap-2">
                            <Timer className="w-5 h-5 text-white" />
                            <div className={`text-3xl md:text-4xl font-bold tabular-nums ${isOvertime ? 'text-red-200 animate-pulse' : 'text-white'}`}>
                                {formatTime(elapsedTime)}
                            </div>
                        </div>

                        {/* Tiempo restante o excedido */}
                        <div className="text-right">
                            {isOvertime ? (
                                <div className="flex items-center gap-1 bg-red-500/30 px-3 py-1 rounded-full">
                                    <AlertCircle className="w-4 h-4 text-red-200" />
                                    <span className="text-sm font-semibold text-red-100">
                                        +{formatTime(elapsedTime - scheduledDuration)} extra
                                    </span>
                                </div>
                            ) : (
                                <div className="bg-white/20 px-3 py-1 rounded-full">
                                    <span className="text-sm font-semibold text-white">
                                        {formatTime(remainingTime)} restantes
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Barra de progreso */}
                        <div className="w-full md:w-48 bg-white/20 rounded-full h-2 overflow-hidden">
                            <div 
                                className={`h-full transition-all duration-1000 ${
                                    isOvertime ? 'bg-red-400' : 'bg-white'
                                }`}
                                style={{ width: `${progressPercentage}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Hint para click */}
                <div className="text-center mt-2 pt-2 border-t border-white/20">
                    <p className="text-xs text-white/70">
                        ⬆️ Haz clic para ver detalles del servicio y cerrar cuando termines
                    </p>
                </div>
            </div>
        </div>
    );
}