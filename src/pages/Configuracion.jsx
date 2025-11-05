
import React, { useState, useEffect } from 'react';
import { User } from '@/entities/User';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Settings, AlertCircle, CheckCircle, Info, BellRing } from 'lucide-react';
import { sendServiceReminders } from '@/functions/sendServiceReminders';

const defaultOnMyWayTemplate = `Hola {client_name}, tu limpiador de RedOak, {cleaner_name}, va de camino para tu servicio. ¡Nos vemos pronto!`;
const defaultReminderTemplate = `Hola {client_name}, te recordamos tu servicio de limpieza de RedOak programado para mañana a las {service_time}. ¡Gracias!`;
const defaultUpdateTemplate = `Hola {client_name}, tu servicio con RedOak ha sido actualizado. Nuevos detalles:\nFecha: {service_date}\nHora: {service_time}.\nSi tienes alguna pregunta, contáctanos.`;
const defaultMotivationalMessage = '¡Hoy es un gran día para brillar! Da lo mejor de ti y haz que cada cliente sonría. 💪✨';

export default function ConfiguracionPage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testingReminders, setTestingReminders] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [templates, setTemplates] = useState({
        on_my_way: '',
        service_reminder: '',
        service_update: '',
    });
    const [reminderConfig, setReminderConfig] = useState({
        enabled: false,
        days_before: 1,
        time_of_day: '09:00',
    });
    const [motivationalMessage, setMotivationalMessage] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const loadUserData = async () => {
            try {
                const currentUser = await User.me();
                setUser(currentUser);

                if (currentUser.role !== 'admin') {
                    setError('Acceso denegado. Esta página es solo para administradores.');
                    setLoading(false);
                    return;
                }

                setTemplates({
                    on_my_way: currentUser.sms_templates?.on_my_way || defaultOnMyWayTemplate,
                    service_reminder: currentUser.sms_templates?.service_reminder || defaultReminderTemplate,
                    service_update: currentUser.sms_templates?.service_update || defaultUpdateTemplate,
                });
                
                setReminderConfig({
                    enabled: currentUser.reminder_config?.enabled || false,
                    days_before: currentUser.reminder_config?.days_before || 1,
                    time_of_day: currentUser.reminder_config?.time_of_day || '09:00',
                });

                setMotivationalMessage(
                    currentUser.motivational_message || defaultMotivationalMessage
                );

            } catch (err) {
                setError('No se pudo cargar la información del usuario.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        loadUserData();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            await User.updateMyUserData({ 
                sms_templates: templates,
                reminder_config: {
                    ...reminderConfig,
                    days_before: Number(reminderConfig.days_before)
                },
                motivational_message: motivationalMessage
            });
            setSuccess('¡Configuración guardada exitosamente!');
        } catch (err) {
            setError('Error al guardar la configuración. Inténtalo de nuevo.');
            console.error(err);
        } finally {
            setSaving(false);
            setTimeout(() => setSuccess(''), 3000);
        }
    };

    const handleTestReminders = async () => {
        setTestingReminders(true);
        setTestResult(null);
        setError('');
        try {
            const response = await sendServiceReminders({});
            setTestResult({
                success: true,
                data: response.data
            });
        } catch (err) {
            setTestResult({
                success: false,
                error: err.message || 'Error al ejecutar la función de recordatorios'
            });
        } finally {
            setTestingReminders(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (error && !user) {
        return (
            <div className="p-8">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </div>
        );
    }
    
    if (user.role !== 'admin') {
         return (
            <div className="p-8">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Acceso denegado. Esta página es solo para administradores.</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 md:p-8 bg-slate-50 min-h-screen">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <Settings className="w-8 h-8" />
                        Configuración de Comunicaciones
                    </h1>
                    <p className="text-slate-600 mt-1">
                        Personaliza y automatiza los mensajes SMS que se envían a tus clientes.
                    </p>
                </div>
                
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           <BellRing className="w-6 h-6 text-blue-600"/>
                           Recordatorios Automáticos de Servicio
                        </CardTitle>
                        <CardDescription>
                            Configura el sistema para que envíe automáticamente recordatorios de los próximos servicios a tus clientes.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-slate-100 rounded-lg">
                            <Label htmlFor="reminder_enabled" className="text-lg font-semibold">
                                Habilitar Recordatorios Automáticos
                            </Label>
                            <Switch
                                id="reminder_enabled"
                                checked={reminderConfig.enabled}
                                onCheckedChange={(checked) => setReminderConfig({...reminderConfig, enabled: checked})}
                            />
                        </div>

                        {reminderConfig.enabled && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t">
                                <div className="space-y-2">
                                    <Label htmlFor="days_before">Enviar con antelación</Label>
                                    <Select
                                        value={String(reminderConfig.days_before)}
                                        onValueChange={(value) => setReminderConfig({...reminderConfig, days_before: Number(value)})}
                                    >
                                        <SelectTrigger id="days_before">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1">1 día antes</SelectItem>
                                            <SelectItem value="2">2 días antes</SelectItem>
                                            <SelectItem value="3">3 días antes</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="time_of_day">Hora de envío (hora de Melbourne)</Label>
                                    <Input
                                        id="time_of_day"
                                        type="time"
                                        value={reminderConfig.time_of_day}
                                        onChange={(e) => setReminderConfig({...reminderConfig, time_of_day: e.target.value})}
                                    />
                                </div>
                            </div>
                        )}
                        <Alert variant="default" className="border-blue-200 bg-blue-50">
                            <Info className="h-4 w-4 text-blue-700" />
                            <AlertDescription className="text-blue-800">
                                <h5 className="font-bold mb-1">¡Configuración Simplificada!</h5>
                                Simplemente elige la hora local de Melbourne. El sistema se encargará automáticamente de la conversión y de los cambios de horario de verano/invierno.
                            </AlertDescription>
                        </Alert>

                        {/* Botón de Prueba Temporal */}
                        <div className="border-t pt-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h4 className="text-lg font-semibold text-slate-900">Prueba de Recordatorios</h4>
                                    <p className="text-sm text-slate-600">Ejecuta manualmente la función para diagnosticar problemas</p>
                                </div>
                                <Button 
                                    onClick={handleTestReminders} 
                                    disabled={testingReminders}
                                    variant="outline"
                                    className="gap-2"
                                >
                                    {testingReminders ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Ejecutando...
                                        </>
                                    ) : (
                                        <>
                                            <BellRing className="w-4 h-4" />
                                            Probar Recordatorios Ahora
                                        </>
                                    )}
                                </Button>
                            </div>

                            {testResult && (
                                <Alert variant={testResult.success ? "default" : "destructive"} className="mt-4">
                                    <AlertDescription>
                                        {testResult.success ? (
                                            <div>
                                                <h5 className="font-bold mb-2">✅ Función ejecutada correctamente</h5>
                                                <pre className="text-xs bg-slate-100 p-2 rounded overflow-auto">
                                                    {JSON.stringify(testResult.data, null, 2)}
                                                </pre>
                                            </div>
                                        ) : (
                                            <div>
                                                <h5 className="font-bold mb-2">❌ Error al ejecutar la función</h5>
                                                <p className="text-sm">{testResult.error}</p>
                                            </div>
                                        )}
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Plantillas de Mensajes SMS</CardTitle>
                        <CardDescription>
                            Modifica el texto de los mensajes. Usa las variables entre llaves `{}` para insertar datos dinámicos.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        <div className="space-y-3">
                            <Label htmlFor="on_my_way" className="text-lg font-semibold">
                                Mensaje "En Camino" (Manual)
                            </Label>
                            <Textarea
                                id="on_my_way"
                                value={templates.on_my_way}
                                onChange={(e) => setTemplates({ ...templates, on_my_way: e.target.value })}
                                rows={4}
                                className="text-base"
                            />
                        </div>

                        <div className="space-y-3">
                            <Label htmlFor="service_reminder" className="text-lg font-semibold">
                                Mensaje "Recordatorio de Servicio" (Automático)
                            </Label>
                            <Textarea
                                id="service_reminder"
                                value={templates.service_reminder}
                                onChange={(e) => setTemplates({ ...templates, service_reminder: e.target.value })}
                                rows={4}
                                className="text-base"
                            />
                        </div>

                        <div className="space-y-3">
                            <Label htmlFor="service_update" className="text-lg font-semibold">
                                Mensaje "Servicio Actualizado" (Manual)
                            </Label>
                            <Textarea
                                id="service_update"
                                value={templates.service_update}
                                onChange={(e) => setTemplates({ ...templates, service_update: e.target.value })}
                                rows={4}
                                className="text-base"
                            />
                        </div>

                        <Alert>
                           <Info className="h-4 w-4" />
                            <AlertDescription>
                                <h5 className="font-bold mb-2">Variables Disponibles:</h5>
                                <ul className="list-disc pl-5 space-y-1 text-sm">
                                    <li><code className="bg-slate-200 px-1 rounded">{`{client_name}`}</code>: Nombre del cliente.</li>
                                    <li><code className="bg-slate-200 px-1 rounded">{`{cleaner_name}`}</code>: Nombre del limpiador principal.</li>
                                    <li><code className="bg-slate-200 px-1 rounded">{`{service_time}`}</code>: Hora de inicio del servicio (ej: 09:00 AM).</li>
                                    <li><code className="bg-slate-200 px-1 rounded">{`{service_date}`}</code>: Fecha del servicio (ej: 25 de Diciembre).</li>
                                </ul>
                            </AlertDescription>
                        </Alert>

                        
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            ✨ Mensaje Motivacional
                        </CardTitle>
                        <CardDescription>
                            Este mensaje aparecerá en el dashboard de todos los limpiadores para motivarlos cada día.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-3">
                            <Label htmlFor="motivational_message" className="text-lg font-semibold">
                                Frase del Día
                            </Label>
                            <Textarea
                                id="motivational_message"
                                value={motivationalMessage}
                                onChange={(e) => setMotivationalMessage(e.target.value)}
                                rows={3}
                                className="text-base"
                                placeholder="¡Hoy es un gran día para brillar! Da lo mejor de ti..."
                            />
                        </div>

                        <Alert>
                            <Info className="h-4 w-4" />
                            <AlertDescription>
                                <p className="text-sm">
                                    Este mensaje se mostrará en un recuadro especial junto con los nombres de sus compañeros de equipo. 
                                    Usa emojis y frases positivas para motivar a tu equipo. ✨💪
                                </p>
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                </Card>

                <div className="flex justify-end pt-4">
                    <Button onClick={handleSave} disabled={saving} size="lg">
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Guardando...
                            </>
                        ) : (
                            'Guardar Toda la Configuración'
                        )}
                    </Button>
                </div>
                
                {success && (
                     <Alert className="border-green-300 bg-green-50 text-green-800">
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription>{success}</AlertDescription>
                    </Alert>
                )}
                {error && !success &&(
                     <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
            </div>
        </div>
    );
}
