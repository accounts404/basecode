
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users } from 'lucide-react';

export default function CleanerPerformance({ entries }) {
  const performanceData = entries.reduce((acc, entry) => {
    const cleanerName = entry.cleaner_name;
    if (!acc[cleanerName]) {
      acc[cleanerName] = { name: cleanerName, total: 0, horas: 0 };
    }
    // Change: Adjust metric from total_amount to service_cost
    acc[cleanerName].total += entry.service_cost || 0;
    acc[cleanerName].horas += entry.hours || 0;
    return acc;
  }, {});

  // Change: Sort by 'horas' instead of 'total'
  const chartData = Object.values(performanceData).sort((a, b) => b.horas - a.horas);

  return (
    <Card className="shadow-lg border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          Rendimiento por Limpiador
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
            <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
            <Tooltip />
            <Legend />
            {/* Change: Update name from "Ingresos ($)" to "Costo Servicio ($)" */}
            <Bar yAxisId="left" dataKey="total" fill="#8884d8" name="Costo Servicio ($)" />
            <Bar yAxisId="right" dataKey="horas" fill="#82ca9d" name="Horas" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
