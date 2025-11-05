import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function MonthlyTrendChart({ title, labels, datasets }) {
  const hasRightAxis = datasets.some(ds => ds.yAxisId === 'right');

  const chartData = labels.map((label, i) => {
    const dataPoint = { name: label };
    datasets.forEach(ds => {
      dataPoint[ds.name] = ds.data[i];
    });
    return dataPoint;
  });

  // Determine if it's a bar chart or line chart based on first dataset
  const isBarChart = datasets.length > 0 && datasets[0].type === 'bar';

  const ChartComponent = isBarChart ? BarChart : LineChart;

  return (
    <Card className="shadow-lg border-0">
      <CardHeader>
        <CardTitle className="text-lg text-slate-800">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ChartComponent data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} tickFormatter={(value) => value.toLocaleString()} />
            {hasRightAxis && <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(value) => value.toLocaleString()} />}
            <Tooltip
              formatter={(value, name) => {
                if (name.toLowerCase().includes('costo') || name.toLowerCase().includes('($)')) {
                    return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                }
                if (name.toLowerCase().includes('horas')) {
                    return `${Number(value).toFixed(1)}h`;
                }
                return Number(value).toLocaleString();
              }}
            />
            <Legend />
            {datasets.map(ds => {
              if (ds.type === 'bar') {
                return <Bar key={ds.name} dataKey={ds.name} fill={ds.color} yAxisId={ds.yAxisId || 'left'} />;
              }
              return (
                <Line
                  key={ds.name}
                  type="monotone"
                  dataKey={ds.name}
                  stroke={ds.color}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  yAxisId={ds.yAxisId || 'left'}
                />
              );
            })}
          </ChartComponent>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}