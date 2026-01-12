import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, FileText, DollarSign, Calendar, Download, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, differenceInDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const COLORS = {
  initial: '#f97316',
  regular: '#3b82f6',
  extras: '#8b5cf6',
  approved: '#22c55e',
  rejected: '#ef4444',
  pending: '#eab308',
};

export default function QuoteReports({ quotes }) {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [compareEnabled, setCompareEnabled] = useState(false);

  // Filtrar cotizaciones por rango de fecha
  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      const quoteDate = new Date(q.quote_date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (quoteDate < start || quoteDate > end) return false;
      
      if (serviceTypeFilter !== 'all') {
        const hasServiceType = q.selected_services?.some(s => s.service_type === serviceTypeFilter);
        if (!hasServiceType) return false;
      }
      
      return true;
    });
  }, [quotes, startDate, endDate, serviceTypeFilter]);

  // Cotizaciones del periodo anterior (para comparación)
  const previousPeriodQuotes = useMemo(() => {
    if (!compareEnabled) return [];
    
    const daysDiff = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
    const prevStart = format(subMonths(new Date(startDate), 1), 'yyyy-MM-dd');
    const prevEnd = format(subMonths(new Date(endDate), 1), 'yyyy-MM-dd');
    
    return quotes.filter(q => {
      const quoteDate = new Date(q.quote_date);
      const start = new Date(prevStart);
      const end = new Date(prevEnd);
      return quoteDate >= start && quoteDate <= end;
    });
  }, [quotes, startDate, endDate, compareEnabled]);

  // Calcular métricas por tipo de servicio
  const metrics = useMemo(() => {
    const calculateServiceMetrics = (quotesList) => {
      let totalInitial = 0, totalRegular = 0, totalExtras = 0;
      let countInitial = 0, countRegular = 0;
      let approvedInitial = 0, approvedRegular = 0;

      quotesList.forEach(q => {
        const extrasTotal = (q.cost_steam_vacuum || 0) + (q.cost_oven || 0) + (q.cost_windows_cleaning || 0);
        totalExtras += extrasTotal;

        q.selected_services?.forEach(s => {
          const avgPrice = (s.price_min + s.price_max) / 2;
          if (s.service_type === 'initial') {
            totalInitial += avgPrice;
            countInitial++;
            if (q.status === 'aprobado') approvedInitial++;
          } else if (s.service_type === 'regular') {
            totalRegular += avgPrice;
            countRegular++;
            if (q.status === 'aprobado') approvedRegular++;
          }
        });
      });

      return {
        totalInitial,
        totalRegular,
        totalExtras,
        countInitial,
        countRegular,
        approvedInitial,
        approvedRegular,
        conversionInitial: countInitial > 0 ? (approvedInitial / countInitial) * 100 : 0,
        conversionRegular: countRegular > 0 ? (approvedRegular / countRegular) * 100 : 0,
      };
    };

    const current = calculateServiceMetrics(filteredQuotes);
    const previous = compareEnabled ? calculateServiceMetrics(previousPeriodQuotes) : null;

    return { current, previous };
  }, [filteredQuotes, previousPeriodQuotes, compareEnabled]);

  // Estados de cotizaciones
  const statusData = useMemo(() => {
    const statuses = {
      borrador: 0,
      itemizando: 0,
      enviada: 0,
      aprobado: 0,
      rechazado: 0,
    };

    filteredQuotes.forEach(q => {
      statuses[q.status] = (statuses[q.status] || 0) + 1;
    });

    return [
      { name: 'Borrador', value: statuses.borrador, color: '#9ca3af' },
      { name: 'Itemizando', value: statuses.itemizando, color: '#a855f7' },
      { name: 'Enviada', value: statuses.enviada, color: '#3b82f6' },
      { name: 'Aprobado', value: statuses.aprobado, color: '#22c55e' },
      { name: 'Rechazado', value: statuses.rechazado, color: '#ef4444' },
    ];
  }, [filteredQuotes]);

  // Análisis de rechazos
  const rejectionData = useMemo(() => {
    const rejections = {};
    filteredQuotes
      .filter(q => q.status === 'rechazado' && q.rejection_type)
      .forEach(q => {
        rejections[q.rejection_type] = (rejections[q.rejection_type] || 0) + 1;
      });

    return Object.entries(rejections).map(([type, count]) => ({
      name: type === 'precio_alto' ? 'Precio Alto' :
            type === 'contrató_competencia' ? 'Competencia' :
            type === 'no_interesado' ? 'No Interesado' : 'Otro',
      value: count,
    }));
  }, [filteredQuotes]);

  // Evolución temporal
  const timelineData = useMemo(() => {
    const grouped = {};
    filteredQuotes.forEach(q => {
      const month = format(new Date(q.quote_date), 'MMM yyyy', { locale: es });
      if (!grouped[month]) {
        grouped[month] = { month, enviadas: 0, aprobadas: 0, rechazadas: 0 };
      }
      if (q.status === 'enviada') grouped[month].enviadas++;
      if (q.status === 'aprobado') grouped[month].aprobadas++;
      if (q.status === 'rechazado') grouped[month].rechazadas++;
    });

    return Object.values(grouped);
  }, [filteredQuotes]);

  // Exportar a PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Reporte de Cotizaciones', 14, 20);
    
    doc.setFontSize(11);
    doc.text(`Período: ${format(new Date(startDate), 'dd/MM/yyyy')} - ${format(new Date(endDate), 'dd/MM/yyyy')}`, 14, 30);
    
    // KPIs
    doc.setFontSize(14);
    doc.text('Métricas Principales', 14, 45);
    
    const kpiData = [
      ['Tipo', 'Valor Total', 'Cantidad', 'Conversión'],
      ['Servicios Iniciales', `$${metrics.current.totalInitial.toFixed(2)}`, metrics.current.countInitial, `${metrics.current.conversionInitial.toFixed(1)}%`],
      ['Servicios Regulares', `$${metrics.current.totalRegular.toFixed(2)}`, metrics.current.countRegular, `${metrics.current.conversionRegular.toFixed(1)}%`],
      ['Servicios Extras', `$${metrics.current.totalExtras.toFixed(2)}`, '-', '-'],
    ];
    
    doc.autoTable({
      head: [kpiData[0]],
      body: kpiData.slice(1),
      startY: 50,
    });
    
    // Estados
    doc.setFontSize(14);
    doc.text('Estados de Cotizaciones', 14, doc.lastAutoTable.finalY + 15);
    
    const statusTableData = statusData.map(s => [s.name, s.value]);
    doc.autoTable({
      head: [['Estado', 'Cantidad']],
      body: statusTableData,
      startY: doc.lastAutoTable.finalY + 20,
    });
    
    doc.save(`reporte-cotizaciones-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // Exportar a Excel (CSV)
  const exportToExcel = () => {
    const headers = ['ID', 'Fecha', 'Cliente', 'Estado', 'Tipo Servicios', 'Valor Min', 'Valor Max', 'Extras'];
    const rows = filteredQuotes.map(q => [
      q.id.slice(0, 8),
      format(new Date(q.quote_date), 'dd/MM/yyyy'),
      q.client_name,
      q.status,
      q.selected_services?.map(s => s.service_type).join(', ') || '-',
      q.total_price_min || 0,
      q.total_price_max || 0,
      (q.cost_steam_vacuum || 0) + (q.cost_oven || 0) + (q.cost_windows_cleaning || 0),
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cotizaciones-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const MetricCard = ({ title, current, previous, icon: Icon, format: formatFn = (v) => v, color }) => {
    const change = previous ? ((current - previous) / previous) * 100 : 0;
    const isPositive = change >= 0;

    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">{title}</p>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <p className="text-3xl font-bold mb-1" style={{ color }}>{formatFn(current)}</p>
          {compareEnabled && previous !== null && (
            <div className="flex items-center gap-1 text-sm">
              {isPositive ? (
                <TrendingUp className="w-4 h-4 text-green-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
              <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
                {Math.abs(change).toFixed(1)}%
              </span>
              <span className="text-gray-500">vs período anterior</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros de Reporte</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Fecha Inicio</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha Fin</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Servicio</Label>
              <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="initial">Iniciales</SelectItem>
                  <SelectItem value="regular">Regulares</SelectItem>
                  <SelectItem value="commercial">Comerciales</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant={compareEnabled ? "default" : "outline"}
                onClick={() => setCompareEnabled(!compareEnabled)}
                className="flex-1"
              >
                {compareEnabled ? 'Comparando' : 'Comparar Períodos'}
              </Button>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={exportToPDF} variant="outline">
              <Download className="w-4 h-4 mr-2" /> Exportar PDF
            </Button>
            <Button onClick={exportToExcel} variant="outline">
              <Download className="w-4 h-4 mr-2" /> Exportar Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs por tipo de servicio */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Valor Servicios Iniciales"
          current={metrics.current.totalInitial}
          previous={metrics.previous?.totalInitial}
          icon={DollarSign}
          format={(v) => `$${v.toFixed(0)}`}
          color={COLORS.initial}
        />
        <MetricCard
          title="Valor Servicios Regulares"
          current={metrics.current.totalRegular}
          previous={metrics.previous?.totalRegular}
          icon={DollarSign}
          format={(v) => `$${v.toFixed(0)}`}
          color={COLORS.regular}
        />
        <MetricCard
          title="Valor Servicios Extras"
          current={metrics.current.totalExtras}
          previous={metrics.previous?.totalExtras}
          icon={DollarSign}
          format={(v) => `$${v.toFixed(0)}`}
          color={COLORS.extras}
        />
      </div>

      {/* Conversión */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard
          title="Conversión Iniciales"
          current={metrics.current.conversionInitial}
          previous={metrics.previous?.conversionInitial}
          icon={TrendingUp}
          format={(v) => `${v.toFixed(1)}%`}
          color={COLORS.initial}
        />
        <MetricCard
          title="Conversión Regulares"
          current={metrics.current.conversionRegular}
          previous={metrics.previous?.conversionRegular}
          icon={TrendingUp}
          format={(v) => `${v.toFixed(1)}%`}
          color={COLORS.regular}
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Estados */}
        <Card>
          <CardHeader>
            <CardTitle>Estados de Cotizaciones</CardTitle>
            <CardDescription>Distribución por estado actual</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Rechazos */}
        {rejectionData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Motivos de Rechazo</CardTitle>
              <CardDescription>Análisis de cotizaciones rechazadas</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={rejectionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill={COLORS.rejected} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Evolución temporal */}
      {timelineData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Evolución Temporal</CardTitle>
            <CardDescription>Cotizaciones por mes y estado</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="enviadas" stroke={COLORS.pending} strokeWidth={2} />
                <Line type="monotone" dataKey="aprobadas" stroke={COLORS.approved} strokeWidth={2} />
                <Line type="monotone" dataKey="rechazadas" stroke={COLORS.rejected} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Resumen de cotizaciones filtradas */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen del Período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-600">Total Cotizaciones</p>
              <p className="text-2xl font-bold">{filteredQuotes.length}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Enviadas</p>
              <p className="text-2xl font-bold text-blue-600">
                {filteredQuotes.filter(q => q.status === 'enviada').length}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Aprobadas</p>
              <p className="text-2xl font-bold text-green-600">
                {filteredQuotes.filter(q => q.status === 'aprobado').length}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Rechazadas</p>
              <p className="text-2xl font-bold text-red-600">
                {filteredQuotes.filter(q => q.status === 'rechazado').length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}