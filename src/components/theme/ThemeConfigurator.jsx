import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Palette, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { THEME_DEFINITIONS } from './ThemeProvider';

export default function ThemeConfigurator({ onThemeChange }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState(null);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            const settings = await base44.entities.ThemeSettings.list();
            
            if (settings && settings.length > 0) {
                setConfig(settings[0]);
            } else {
                // Crear configuración por defecto
                const defaultConfig = {
                    active_theme: 'default',
                    seasonal_themes_enabled: true,
                    halloween_start_date: '10-20',
                    halloween_end_date: '11-02',
                    christmas_start_date: '12-01',
                    christmas_end_date: '01-06'
                };
                const created = await base44.entities.ThemeSettings.create(defaultConfig);
                setConfig(created);
            }
        } catch (err) {
            console.error('[ThemeConfigurator] Error cargando configuración:', err);
            setError('Error al cargar la configuración de temas.');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');
        
        try {
            await base44.entities.ThemeSettings.update(config.id, config);
            setSuccess('¡Configuración de tema guardada exitosamente!');
            
            // Notificar al provider que refresque
            if (onThemeChange) {
                onThemeChange();
            }
            
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            console.error('[ThemeConfigurator] Error guardando:', err);
            setError('Error al guardar la configuración. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </CardContent>
            </Card>
        );
    }

    if (!config) {
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>No se pudo cargar la configuración de temas.</AlertDescription>
            </Alert>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Palette className="w-6 h-6 text-purple-600" />
                    Temas Visuales
                </CardTitle>
                <CardDescription>
                    Personaliza la apariencia de la aplicación según las temporadas y festividades.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Tema Manual */}
                <div className="space-y-3">
                    <Label htmlFor="active_theme" className="text-lg font-semibold">
                        Tema Activo
                    </Label>
                    <Select
                        value={config.active_theme}
                        onValueChange={(value) => setConfig({ ...config, active_theme: value })}
                    >
                        <SelectTrigger id="active_theme">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(THEME_DEFINITIONS).map(([key, theme]) => (
                                <SelectItem key={key} value={key}>
                                    {theme.emoji ? `${theme.emoji} ` : ''}{theme.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-sm text-slate-600">
                        Este tema se aplicará si los temas automáticos están desactivados.
                    </p>
                </div>

                {/* Vista Previa */}
                <div className="border rounded-lg p-4 space-y-3">
                    <Label className="text-sm font-semibold">Vista Previa del Tema</Label>
                    <div className="grid grid-cols-3 gap-3">
                        {Object.entries(THEME_DEFINITIONS).map(([key, theme]) => (
                            <div
                                key={key}
                                className={`p-3 rounded-lg border-2 text-center transition-all ${
                                    config.active_theme === key 
                                        ? 'border-blue-600 shadow-md' 
                                        : 'border-slate-200'
                                }`}
                                style={{ 
                                    backgroundColor: theme.colors.background,
                                    color: theme.colors.primary 
                                }}
                            >
                                <div className="text-2xl mb-1">{theme.emoji || '🎨'}</div>
                                <div className="text-xs font-semibold">{theme.name}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Temas Automáticos */}
                <div className="border-t pt-6">
                    <div className="flex items-center justify-between p-4 bg-slate-100 rounded-lg mb-4">
                        <div>
                            <Label htmlFor="seasonal_enabled" className="text-lg font-semibold">
                                Temas Estacionales Automáticos
                            </Label>
                            <p className="text-sm text-slate-600 mt-1">
                                Cambia automáticamente según las fechas configuradas
                            </p>
                        </div>
                        <Switch
                            id="seasonal_enabled"
                            checked={config.seasonal_themes_enabled}
                            onCheckedChange={(checked) => 
                                setConfig({ ...config, seasonal_themes_enabled: checked })
                            }
                        />
                    </div>

                    {config.seasonal_themes_enabled && (
                        <div className="space-y-4 mt-4">
                            {/* Halloween */}
                            <div className="grid grid-cols-2 gap-4 p-4 bg-orange-50 rounded-lg">
                                <div className="col-span-2">
                                    <h4 className="font-semibold text-orange-900 flex items-center gap-2">
                                        🎃 Halloween
                                    </h4>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm">Desde (MM-DD)</Label>
                                    <input
                                        type="text"
                                        value={config.halloween_start_date}
                                        onChange={(e) => setConfig({ 
                                            ...config, 
                                            halloween_start_date: e.target.value 
                                        })}
                                        placeholder="10-20"
                                        className="w-full px-3 py-2 border rounded-md text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm">Hasta (MM-DD)</Label>
                                    <input
                                        type="text"
                                        value={config.halloween_end_date}
                                        onChange={(e) => setConfig({ 
                                            ...config, 
                                            halloween_end_date: e.target.value 
                                        })}
                                        placeholder="11-02"
                                        className="w-full px-3 py-2 border rounded-md text-sm"
                                    />
                                </div>
                            </div>

                            {/* Navidad */}
                            <div className="grid grid-cols-2 gap-4 p-4 bg-red-50 rounded-lg">
                                <div className="col-span-2">
                                    <h4 className="font-semibold text-red-900 flex items-center gap-2">
                                        🎄 Navidad
                                    </h4>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm">Desde (MM-DD)</Label>
                                    <input
                                        type="text"
                                        value={config.christmas_start_date}
                                        onChange={(e) => setConfig({ 
                                            ...config, 
                                            christmas_start_date: e.target.value 
                                        })}
                                        placeholder="12-01"
                                        className="w-full px-3 py-2 border rounded-md text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm">Hasta (MM-DD)</Label>
                                    <input
                                        type="text"
                                        value={config.christmas_end_date}
                                        onChange={(e) => setConfig({ 
                                            ...config, 
                                            christmas_end_date: e.target.value 
                                        })}
                                        placeholder="01-06"
                                        className="w-full px-3 py-2 border rounded-md text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                        <ul className="list-disc pl-5 space-y-1 text-sm">
                            <li>Los temas estacionales automáticos tienen prioridad sobre el tema manual.</li>
                            <li>El formato de fecha es MM-DD (mes-día), por ejemplo: 12-01 para 1 de diciembre.</li>
                            <li>Los rangos pueden cruzar el año (ej: 12-20 a 01-05).</li>
                        </ul>
                    </AlertDescription>
                </Alert>

                <div className="flex justify-end pt-4">
                    <Button onClick={handleSave} disabled={saving} size="lg">
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Guardando...
                            </>
                        ) : (
                            'Guardar Configuración de Tema'
                        )}
                    </Button>
                </div>

                {success && (
                    <Alert className="border-green-300 bg-green-50 text-green-800">
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription>{success}</AlertDescription>
                    </Alert>
                )}
                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
    );
}