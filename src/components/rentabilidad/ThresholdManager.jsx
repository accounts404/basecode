import React, { useState, useEffect } from 'react';
import { PricingThreshold } from '@/entities/PricingThreshold';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Save, Loader2, CheckCircle } from 'lucide-react';

const FREQUENCIES = [
    { value: "weekly", label: "Semanal" },
    { value: "fortnightly", label: "Quincenal" },
    { value: "every_3_weeks", label: "Cada 3 semanas" },
    { value: "monthly", label: "Mensual" },
    { value: "one_off", label: "Servicio Único (One-off)" }
];

export default function ThresholdManager({ initialThresholds, onSave }) {
    const [thresholds, setThresholds] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const initialData = FREQUENCIES.reduce((acc, freq) => {
            const existing = initialThresholds.find(t => t.frequency === freq.value);
            acc[freq.value] = {
                id: existing?.id || null,
                min_price: existing?.min_price || ''
            };
            return acc;
        }, {});
        setThresholds(initialData);
    }, [initialThresholds]);

    const handleChange = (frequency, value) => {
        setThresholds(prev => ({
            ...prev,
            [frequency]: { ...prev[frequency], min_price: value }
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        setSuccess(false);

        const promises = Object.entries(thresholds).map(async ([frequency, data]) => {
            const price = parseFloat(data.min_price);
            if (isNaN(price)) return; // No guardar si no es un número

            const payload = {
                frequency,
                min_price: price
            };

            if (data.id) {
                // Actualizar existente
                return PricingThreshold.update(data.id, payload);
            } else {
                // Crear nuevo
                return PricingThreshold.create(payload);
            }
        });

        await Promise.all(promises);

        setSaving(false);
        setSuccess(true);
        onSave(); // Llama a la función para recargar los datos en la página principal

        setTimeout(() => setSuccess(false), 3000);
    };

    return (
        <div className="space-y-6 p-1">
            <p className="text-slate-600">
                Define los precios base mínimos (sin GST) que consideras óptimos para cada frecuencia de servicio. Estos umbrales se usarán en la tabla de análisis de precios.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {FREQUENCIES.map(freq => (
                    <div key={freq.value} className="space-y-2">
                        <Label htmlFor={`threshold-${freq.value}`} className="font-semibold text-slate-800">
                            {freq.label}
                        </Label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                id={`threshold-${freq.value}`}
                                type="number"
                                step="0.01"
                                placeholder="Ej: 55.00"
                                value={thresholds[freq.value]?.min_price || ''}
                                onChange={(e) => handleChange(freq.value, e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex justify-end items-center gap-4 pt-4">
                {success && (
                    <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="h-5 w-5" />
                        <span className="font-medium">Guardado exitosamente</span>
                    </div>
                )}
                <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
                    {saving ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                        <>
                            <Save className="mr-2 h-4 w-4" /> Guardar Umbrales
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}