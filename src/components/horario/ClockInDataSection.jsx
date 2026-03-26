import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Play, Square, Navigation, ExternalLink, AlertTriangle, User } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import { es } from 'date-fns/locale';

function parseGPSCoordinates(locationString) {
    if (!locationString || typeof locationString !== 'string') return null;
    const coords = locationString.split(',');
    if (coords.length === 2) {
        const lat = parseFloat(coords[0].trim());
        const lng = parseFloat(coords[1].trim());
        if (!isNaN(lat) && !isNaN(lng)) return { latitude: lat, longitude: lng };
    }
    return null;
}

function openLocationInMaps(latitude, longitude) {
    if (latitude && longitude) {
        window.open(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`, '_blank');
    }
}

function formatDateWithTime(isoString) {
    return isoString ? format(parseISO(isoString), 'dd/MM/yyyy HH:mm', { locale: es }) : 'N/A';
}

export default function ClockInDataSection({ schedule, allUsers, selectedClient, liveCleanerTimes, openInMaps }) {
    if (!schedule?.clock_in_data || schedule.clock_in_data.length === 0) return null;

    return (
        <div className="my-6 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-4 sm:p-6 shadow-lg space-y-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-900">
                <MapPin className="w-5 h-5 text-blue-600" />
                Registros de Asistencia y Ubicaciones GPS
            </h3>
            <div className="space-y-4">
                {schedule.clock_in_data.map((clockData, index) => {
                    const cleaner = allUsers.find(u => u.id === clockData.cleaner_id);
                    const cleanerName = cleaner ? (cleaner.display_name || cleaner.invoice_name || cleaner.full_name) : 'Limpiador no encontrado';
                    const clockInCoords = parseGPSCoordinates(clockData.clock_in_location);
                    const clockOutCoords = parseGPSCoordinates(clockData.clock_out_location);
                    const timeData = liveCleanerTimes[clockData.cleaner_id];

                    return (
                        <Card key={index} className="bg-white border-blue-100 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                                        <User className="w-4 h-4 text-blue-600" />
                                        {cleanerName}
                                    </h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Card className="border border-green-200 bg-green-50">
                                        <CardContent className="p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Play className="w-4 h-4 text-green-600" />
                                                <span className="font-semibold text-green-800">Clock In</span>
                                            </div>
                                            {clockData.clock_in_time ? (
                                                <>
                                                    <div className="text-lg font-bold text-green-900 mb-2">{formatDateWithTime(clockData.clock_in_time)}</div>
                                                    {clockInCoords ? (
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm text-green-700">📍 {clockInCoords.latitude.toFixed(6)}, {clockInCoords.longitude.toFixed(6)}</span>
                                                            <Button variant="outline" size="sm" onClick={() => openLocationInMaps(clockInCoords.latitude, clockInCoords.longitude)} className="text-xs bg-green-100 hover:bg-green-200 text-green-800">
                                                                <ExternalLink className="w-3 h-3 mr-1" /> Ver en Mapa
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-amber-600 bg-amber-100 p-2 rounded flex items-center gap-1">
                                                            <AlertTriangle className="w-4 h-4" /> Ubicación GPS no disponible
                                                        </div>
                                                    )}
                                                </>
                                            ) : <div className="text-slate-500 text-sm">No registrado</div>}
                                        </CardContent>
                                    </Card>
                                    <Card className="border border-red-200 bg-red-50">
                                        <CardContent className="p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Square className="w-4 h-4 text-red-600" />
                                                <span className="font-semibold text-red-800">Clock Out</span>
                                            </div>
                                            {clockData.clock_out_time ? (
                                                <>
                                                    <div className="text-lg font-bold text-red-900 mb-2">{formatDateWithTime(clockData.clock_out_time)}</div>
                                                    {clockOutCoords ? (
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm text-red-700">📍 {clockOutCoords.latitude.toFixed(6)}, {clockOutCoords.longitude.toFixed(6)}</span>
                                                            <Button variant="outline" size="sm" onClick={() => openLocationInMaps(clockOutCoords.latitude, clockOutCoords.longitude)} className="text-xs bg-red-100 hover:bg-red-200 text-red-800">
                                                                <ExternalLink className="w-3 h-3 mr-1" /> Ver en Mapa
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-amber-600 bg-amber-100 p-2 rounded flex items-center gap-1">
                                                            <AlertTriangle className="w-4 h-4" /> Ubicación GPS no disponible
                                                        </div>
                                                    )}
                                                </>
                                            ) : <div className="text-slate-500 text-sm">Aún en progreso</div>}
                                        </CardContent>
                                    </Card>
                                </div>
                                {timeData && (
                                    <div className="mt-4 pt-4 border-t space-y-3">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="font-semibold text-slate-700">Tiempo Trabajado</span>
                                            <span className={`font-mono font-bold text-lg ${timeData.isLive ? 'text-green-600' : 'text-slate-800'}`}>{timeData.workedTime}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="font-semibold text-slate-700">Tiempo Restante</span>
                                            <span className="font-mono font-bold text-lg text-orange-600">{timeData.remainingTime}</span>
                                        </div>
                                        <div>
                                            <div className="w-full bg-slate-200 rounded-full h-2.5">
                                                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${timeData.progress}%` }}></div>
                                            </div>
                                            <p className="text-xs text-right mt-1 text-slate-500">{Math.round(timeData.progress)}% completado</p>
                                        </div>
                                    </div>
                                )}
                                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                                    {selectedClient?.address && openInMaps && (
                                        <Button variant="outline" size="sm" onClick={() => openInMaps(selectedClient.address)} className="bg-blue-100 hover:bg-blue-200 text-blue-800">
                                            <Navigation className="w-4 h-4 mr-2" /> Ver Dirección Cliente
                                        </Button>
                                    )}
                                    {clockInCoords && clockOutCoords && (
                                        <Button variant="outline" size="sm" onClick={() => window.open(`https://www.google.com/maps/dir/${clockInCoords.latitude},${clockInCoords.longitude}/${clockOutCoords.latitude},${clockOutCoords.longitude}`, '_blank')} className="bg-purple-100 hover:bg-purple-200 text-purple-800">
                                            <MapPin className="w-4 h-4 mr-2" /> Ruta Clock In → Out
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}