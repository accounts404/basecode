import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Calendar, DollarSign, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, eachDayOfInterval } from "date-fns";
import { es } from "date-fns/locale";

export default function ActivityChart({ workEntries = [], selectedPeriod }) {
  const chartData = useMemo(() => {
    if (!workEntries.length || !selectedPeriod) return [];

    const dailyData = {};
    const allDays = eachDayOfInterval({ start: selectedPeriod.start, end: selectedPeriod.end });

    allDays.forEach(day => {
      const dateKey = format(day, 'yyyy-MM-dd');
      dailyData[dateKey] = {
        date: dateKey,
        formattedDate: format(day, 'd MMM', { locale: es }),
        cost: 0,
        hours: 0,
        services: 0
      };
    });

    workEntries.forEach(entry => {
      const dateKey = entry.work_date;
      if (dailyData[dateKey]) {
        dailyData[dateKey].cost += entry.total_amount || 0;
        dailyData[dateKey].hours += entry.hours || 0;
        dailyData[dateKey].services += 1;
      }
    });

    return Object.values(dailyData).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [workEntries, selectedPeriod]);

  const totalCost = chartData.reduce((sum, day) => sum + day.cost, 0);
  const totalHours = chartData.reduce((sum, day) => sum + day.hours, 0);
  const activeDays = chartData.filter(day => day.cost > 0).length;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200">
          <p className="font-semibold text-slate-900 mb-2">{label}</p>
          <div className="space-y-1">
            <p className="text-sm flex items-center gap-2"><span className="inline-block w-3 h-3 bg-blue-500 rounded-sm"></span><strong>Costo:</strong> ${payload[0]?.value?.toFixed(2)}</p>
            <p className="text-sm flex items-center gap-2"><span className="inline-block w-3 h-3 bg-green-500 rounded-sm"></span><strong>Horas:</strong> {payload[1]?.value?.toFixed(1)}h</p>
            <p className="text-sm"><strong>Servicios:</strong> {payload[0]?.payload?.services}</p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="shadow-xl border-0 bg-white">
      <CardHeader className="border-b border-slate-100/80 pb-4">
        <CardTitle className="flex items-center gap-3 text-xl">
          <div className="p-2 rounded-xl bg-purple-100"><BarChart3 className="w-6 h-6 text-purple-600" /></div>
          <div>
            <h3 className="text-slate-900 font-bold">Actividad del Período</h3>
            <p className="text-sm text-slate-600 font-normal">Costo y horas por día</p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {chartData.length === 0 ? (
          <div className="text-center py-8"><p className="text-slate-500">No hay datos para el período seleccionado.</p></div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-2xl font-bold text-blue-700">${totalCost.toFixed(0)}</p>
                <p className="text-sm text-blue-600 font-medium">Costo Total</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-50 border border-green-200">
                <p className="text-2xl font-bold text-green-700">{totalHours.toFixed(1)}h</p>
                <p className="text-sm text-green-600 font-medium">Total Horas</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-purple-50 border border-purple-200">
                <p className="text-2xl font-bold text-purple-700">{activeDays}</p>
                <p className="text-sm text-purple-600 font-medium">Días Activos</p>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="formattedDate" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} />
                  <YAxis yAxisId="cost" tick={{ fontSize: 12, fill: '#3b82f6' }} axisLine={{ stroke: '#e2e8f0' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar yAxisId="cost" dataKey="cost" fill="#3b82f6" name="Costo ($)" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="cost" dataKey="hours" fill="#10b981" name="Horas" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}