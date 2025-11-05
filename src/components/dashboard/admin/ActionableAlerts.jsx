import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, FileText, CheckSquare, Trophy, AlertCircle } from 'lucide-react';
import { createPageUrl } from '@/utils';

const ActionableAlerts = ({ alerts }) => {
  const alertConfig = {
    pendingInvoices: {
      title: 'Reportes de Pago Pendientes',
      icon: FileText,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50',
      link: createPageUrl('Facturas'),
      linkText: 'Revisar Reportes'
    },
    pendingReports: {
      title: 'Reportes de Servicio Pendientes',
      icon: AlertTriangle,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
      link: createPageUrl('ReportesServicio'),
      linkText: 'Revisar Reportes'
    },
    pendingTasks: {
      title: 'Tareas Admin Pendientes',
      icon: CheckSquare,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
      link: createPageUrl('Horario'), // Assuming tasks are viewed in schedule
      linkText: 'Ver Tareas'
    },
    unclosedScores: {
      title: 'Puntuaciones Mensuales Abiertas',
      icon: Trophy,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
      link: createPageUrl('PuntuacionLimpiadores'),
      linkText: 'Gestionar Puntuaciones'
    }
  };

  const activeAlerts = Object.entries(alerts)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({ ...alertConfig[key], value }));

  if (activeAlerts.length === 0) {
    return (
        <div className="bg-green-50 border border-green-200 text-green-800 p-6 rounded-lg text-center shadow-sm">
            <div className="flex items-center justify-center gap-3">
                <CheckSquare className="w-6 h-6" />
                <h3 className="text-lg font-semibold">¡Todo en orden!</h3>
            </div>
            <p className="mt-2 text-sm">No hay acciones urgentes que requieran tu atención.</p>
        </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200/80">
        <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-slate-500"/>
            Centro de Acciones
        </h3>
        <div className="space-y-3">
        {activeAlerts.map((alert) => (
            <div key={alert.title} className={`p-4 rounded-lg flex items-center justify-between ${alert.bgColor}`}>
            <div className="flex items-center gap-4">
                <div className={`p-2 rounded-full ${alert.color} ${alert.bgColor}`}>
                    <alert.icon className="w-5 h-5" />
                </div>
                <div>
                <p className={`font-semibold ${alert.color}`}>{alert.title}</p>
                <p className="text-sm text-slate-600">{alert.value} pendiente{alert.value > 1 ? 's' : ''}</p>
                </div>
            </div>
            <Link to={alert.link} className="text-sm font-bold text-blue-600 hover:underline">
                {alert.linkText}
            </Link>
            </div>
        ))}
        </div>
    </div>
  );
};

export default ActionableAlerts;