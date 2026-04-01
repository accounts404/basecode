import React, { useState } from "react";
import { MapPin, AlertTriangle, CheckCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Modal que solicita permiso GPS antes de continuar con clock in/out.
 * - Si el GPS está habilitado: obtiene la ubicación y llama onConfirm(location)
 * - Si está bloqueado: muestra instrucciones para habilitarlo en el dispositivo
 * - Siempre ofrece "Continuar sin ubicación" como último recurso
 */
export default function GpsPermissionModal({ action, onConfirm, onCancel }) {
    const [status, setStatus] = useState('idle'); // idle | requesting | success | denied | error
    const [location, setLocation] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');

    const actionLabel = action === 'clock_in' ? 'Iniciar Servicio' : 'Finalizar Servicio';
    const actionEmoji = action === 'clock_in' ? '▶️' : '⏹️';

    const requestLocation = () => {
        if (!navigator.geolocation) {
            setStatus('error');
            setErrorMessage('Tu dispositivo no soporta geolocalización.');
            return;
        }

        setStatus('requesting');

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = `${pos.coords.latitude},${pos.coords.longitude}`;
                setLocation(loc);
                setStatus('success');
                // Auto-continuar luego de mostrar éxito brevemente
                setTimeout(() => onConfirm(loc), 800);
            },
            (err) => {
                if (err.code === 1) {
                    // PERMISSION_DENIED
                    setStatus('denied');
                } else {
                    setStatus('error');
                    setErrorMessage(err.code === 2
                        ? 'No se pudo determinar tu ubicación. Verifica que tengas señal GPS.'
                        : 'Tiempo de espera agotado. Intenta de nuevo.');
                }
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

                {/* Header */}
                <div className={`px-6 pt-6 pb-4 text-center ${
                    status === 'success' ? 'bg-green-50' :
                    status === 'denied' ? 'bg-red-50' :
                    'bg-blue-50'
                }`}>
                    <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 ${
                        status === 'success' ? 'bg-green-100' :
                        status === 'denied' ? 'bg-red-100' :
                        status === 'requesting' ? 'bg-blue-100' :
                        'bg-blue-100'
                    }`}>
                        {status === 'requesting' && <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />}
                        {status === 'success' && <CheckCircle className="w-8 h-8 text-green-600" />}
                        {(status === 'denied' || status === 'error') && <AlertTriangle className="w-8 h-8 text-red-500" />}
                        {status === 'idle' && <MapPin className="w-8 h-8 text-blue-600" />}
                    </div>

                    <h2 className="text-lg font-bold text-slate-900">
                        {status === 'idle' && 'Ubicación requerida'}
                        {status === 'requesting' && 'Obteniendo ubicación...'}
                        {status === 'success' && '¡Ubicación obtenida!'}
                        {status === 'denied' && 'Acceso a GPS bloqueado'}
                        {status === 'error' && 'Error de ubicación'}
                    </h2>
                    <p className="text-sm text-slate-500 mt-1 font-medium">{actionEmoji} {actionLabel}</p>
                </div>

                {/* Body */}
                <div className="px-6 py-4">
                    {status === 'idle' && (
                        <div className="space-y-3">
                            <p className="text-sm text-slate-600 text-center">
                                Para registrar tu asistencia necesitamos verificar tu ubicación GPS.
                                Esto es <strong>obligatorio</strong> para el control de asistencia.
                            </p>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-700">
                                    Si tu navegador te pregunta si permitir el acceso a la ubicación, <strong>selecciona "Permitir"</strong>.
                                </p>
                            </div>
                        </div>
                    )}

                    {status === 'requesting' && (
                        <p className="text-sm text-slate-500 text-center">
                            Por favor espera mientras obtenemos tu ubicación GPS...
                            <br />Si tu dispositivo lo solicita, <strong>acepta el permiso</strong>.
                        </p>
                    )}

                    {status === 'success' && (
                        <p className="text-sm text-green-700 text-center font-medium">
                            Ubicación capturada correctamente. Continuando...
                        </p>
                    )}

                    {status === 'denied' && (
                        <div className="space-y-3">
                            <p className="text-sm text-red-600 text-center font-medium">
                                Bloqueaste el acceso al GPS. Para habilitarlo:
                            </p>
                            <div className="bg-slate-50 rounded-xl p-3 space-y-2 text-xs text-slate-600">
                                <p className="font-semibold text-slate-700">📱 En Android:</p>
                                <p>Configuración → Apps → [Tu Navegador] → Permisos → Ubicación → Permitir</p>
                                <p className="font-semibold text-slate-700 pt-1">🍎 En iPhone:</p>
                                <p>Ajustes → Privacidad → Localización → [Tu Navegador] → Al usar la app</p>
                            </div>
                            <p className="text-xs text-slate-400 text-center">
                                Después de habilitarlo, recarga la página e intenta de nuevo.
                            </p>
                        </div>
                    )}

                    {status === 'error' && (
                        <p className="text-sm text-red-600 text-center">{errorMessage}</p>
                    )}
                </div>

                {/* Footer buttons */}
                <div className="px-6 pb-6 space-y-2">
                    {status === 'idle' && (
                        <Button onClick={requestLocation} className="w-full bg-blue-600 hover:bg-blue-700">
                            <MapPin className="w-4 h-4 mr-2" />
                            Permitir ubicación y continuar
                        </Button>
                    )}

                    {status === 'requesting' && (
                        <Button disabled className="w-full">
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Obteniendo ubicación...
                        </Button>
                    )}

                    {(status === 'denied' || status === 'error') && (
                        <Button onClick={requestLocation} variant="outline" className="w-full border-blue-200 text-blue-700">
                            <MapPin className="w-4 h-4 mr-2" />
                            Intentar de nuevo
                        </Button>
                    )}

                    {status !== 'requesting' && status !== 'success' && (
                        <Button
                            variant="ghost"
                            onClick={() => onConfirm(null)}
                            className="w-full text-slate-400 hover:text-slate-600 text-xs"
                        >
                            Continuar sin ubicación
                        </Button>
                    )}

                    {status !== 'requesting' && status !== 'success' && (
                        <Button
                            variant="ghost"
                            onClick={onCancel}
                            className="w-full text-slate-400 text-xs"
                        >
                            <X className="w-3 h-3 mr-1" />
                            Cancelar
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}