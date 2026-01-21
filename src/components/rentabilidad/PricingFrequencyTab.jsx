import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings } from 'lucide-react';
import PricingAnalysisTable from './PricingAnalysisTable';
import ThresholdManager from './ThresholdManager';

const frequencyOptions = [
    { value: "all", label: "Todas las Frecuencias" },
    { value: "weekly", label: "Semanal" },
    { value: "fortnightly", label: "Quincenal" },
    { value: "every_3_weeks", label: "Cada 3 semanas" },
    { value: "monthly", label: "Mensual" },
    { value: "one_off", label: "Servicio Único" }
];

export default function PricingFrequencyTab({ clients, pricingThresholds, onThresholdsSaved }) {
    const [selectedFrequency, setSelectedFrequency] = useState('all');
    const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);

    const handleThresholdsSaved = () => {
        setIsThresholdModalOpen(false);
        onThresholdsSaved();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Label htmlFor="frequency-filter" className="font-semibold text-sm uppercase tracking-wide text-slate-700">Frecuencia:</Label>
                    <Select value={selectedFrequency} onValueChange={setSelectedFrequency}>
                        <SelectTrigger id="frequency-filter" className="w-[250px] h-11 shadow-sm border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 font-medium">
                            <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent>
                            {frequencyOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value} className="py-3">
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                
                <Dialog open={isThresholdModalOpen} onOpenChange={setIsThresholdModalOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="h-11 shadow-md border-slate-300 hover:bg-slate-50 hover:border-blue-600 font-medium">
                            <Settings className="mr-2 h-5 w-5" />
                            Configurar Umbrales
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[700px]">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-bold">Umbrales de Precios Mínimos</DialogTitle>
                        </DialogHeader>
                        <ThresholdManager 
                            initialThresholds={pricingThresholds}
                            onSave={handleThresholdsSaved}
                        />
                    </DialogContent>
                </Dialog>
            </div>

            <div className="max-h-[600px] overflow-y-auto border border-slate-200 rounded-xl bg-white">
                <PricingAnalysisTable
                    clients={clients}
                    selectedFrequency={selectedFrequency}
                    thresholds={pricingThresholds}
                />
            </div>
        </div>
    );
}