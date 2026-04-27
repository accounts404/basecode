import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function ExportCSV({ clients, logs }) {
  const handleExport = () => {
    const getLastContact = (clientId) => {
      const clientLogs = logs.filter(l => l.client_id === clientId);
      return clientLogs[0] || null;
    };

    const rows = [
      ['Nombre', 'Tipo', 'Teléfono', 'Email', 'Dirección', 'Frecuencia', 'Último contacto', 'Días sin contacto', 'Tipo interacción', 'Responsable'],
      ...clients.map(c => {
        const last = getLastContact(c.id);
        const days = last?.interaction_date
          ? Math.floor((new Date() - new Date(last.interaction_date)) / 86400000)
          : 'Nunca';
        return [
          c.name || '',
          c.client_type || '',
          c.mobile_number || '',
          c.email || '',
          c.address || '',
          c.service_frequency || '',
          last?.interaction_date ? format(parseISO(last.interaction_date), 'dd/MM/yyyy') : 'Sin contacto',
          days,
          last?.interaction_type || '',
          last?.logged_by || '',
        ];
      }),
    ];

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seguimiento_clientes_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" onClick={handleExport} className="h-11 gap-2">
      <Download className="w-4 h-4" />
      Exportar CSV
    </Button>
  );
}