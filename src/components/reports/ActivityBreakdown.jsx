import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart as PieChartIcon } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const activityLabels = {
  domestic: "Doméstico", 
  commercial: "Comercial", 
  windows: "Ventanas",
  steam_vacuum: "Vapor/Aspirado", 
  entrenamiento: "Entrenamiento", 
  otros: "Otros"
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF4242'];

export default function ActivityBreakdown({ entries }) {
  const activityData = entries.reduce((acc, entry) => {
    const activityName = activityLabels[entry.activity] || 'Desconocido';
    if (!acc[activityName]) {
      acc[activityName] = { name: activityName, horas: 0 };
    }
    acc[activityName].horas += entry.hours || 0;
    return acc;
  }, {});

  const chartData = Object.values(activityData);

  return (
    <Card className="shadow-lg border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChartIcon className="w-5 h-5 text-green-600" />
          Desglose de Actividades por Horas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={80}
              fill="#8884d8"
              dataKey="horas"
              nameKey="name"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `${value.toFixed(2)}h`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}