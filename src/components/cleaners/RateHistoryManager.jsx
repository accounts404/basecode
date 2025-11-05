import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, PlusCircle, AlertTriangle, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function RateHistoryManager({ cleaner, onSave, onCancel, saving }) {
  const [history, setHistory] = useState(cleaner.rate_history || []);
  const [newRate, setNewRate] = useState('');
  const [newDate, setNewDate] = useState('');
  const [error, setError] = useState('');

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
  }, [history]);

  const handleAddRate = () => {
    if (!newRate || !newDate) {
      setError('Por favor, completa la tarifa y la fecha.');
      return;
    }
    if (parseFloat(newRate) <= 0) {
      setError('La tarifa debe ser un número positivo.');
      return;
    }
    setError('');
    const newEntry = { rate: parseFloat(newRate), effective_date: newDate };
    setHistory([...history, newEntry]);
    setNewRate('');
    setNewDate('');
  };

  const handleDeleteRate = (indexToDelete) => {
    const originalIndex = history.findIndex(item => item.effective_date === sortedHistory[indexToDelete].effective_date && item.rate === sortedHistory[indexToDelete].rate);
    if (originalIndex > -1) {
        const updatedHistory = [...history];
        updatedHistory.splice(originalIndex, 1);
        setHistory(updatedHistory);
    }
  };
  
  const handleSave = () => {
    onSave({ ...cleaner, rate_history: history });
  };

  return (
    <div className="max-h-[85vh] overflow-y-auto p-1">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
              Añadir Nueva Tarifa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-rate">Nueva Tarifa por Hora (AUD)</Label>
                <Input
                  id="new-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  placeholder="Ej: 29.50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-date">Fecha Efectiva</Label>
                <Input
                  id="new-date"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
            </div>
            {error && (
              <div className="text-red-600 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </div>
            )}
            <Button onClick={handleAddRate} className="w-full">
              <PlusCircle className="mr-2 h-4 w-4" />
              Añadir al Historial
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Historial de Tarifas</CardTitle>
          </CardHeader>
          <CardContent>
            {sortedHistory.length > 0 ? (
              <div className="space-y-3">
                {sortedHistory.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                    <div className="flex items-center gap-4">
                        <DollarSign className="w-5 h-5 text-green-500"/>
                        <div>
                            <p className="font-bold text-lg text-slate-800">${item.rate.toFixed(2)}</p>
                            <p className="text-sm text-slate-600">
                                Efectivo desde: {format(new Date(item.effective_date), "d MMM, yyyy", { locale: es })}
                            </p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteRate(index)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-500 italic py-4">No hay historial de tarifas.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-4 pt-8 sticky bottom-0 bg-white py-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Guardando..." : "Guardar Cambios"}
        </Button>
      </div>
    </div>
  );
}