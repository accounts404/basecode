import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Download, FileSpreadsheet } from 'lucide-react';

const CLIENT_TYPE_LABELS = {
  domestic: 'Domestic',
  commercial: 'Commercial',
  training: 'Training',
  ndis_client: 'NDIS Client',
  dva_client: 'DVA Client',
  age_care_client: 'Age Care Client',
  work_cover_client: 'Work Cover Client',
};

const FREQ_LABELS = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  every_3_weeks: 'Every 3 Weeks',
  monthly: 'Monthly',
  one_off: 'One-Off',
};

const PAYMENT_LABELS = {
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  credit_card: 'Credit Card',
  gocardless: 'GoCardless',
  stripe: 'Stripe',
  other: 'Other',
};

const ACCESS_TYPE_LABELS = {
  key: 'Physical Key',
  smart_lock: 'Smart Lock',
  lockbox: 'Lockbox',
  other: 'Other',
};

const PROPERTY_TYPE_LABELS = {
  house: 'House',
  townhouse: 'Townhouse',
  unit: 'Unit',
  apartment: 'Apartment',
};

const PROPERTY_STORIES_LABELS = {
  single_storey: 'Single Storey',
  double_storey: 'Double Storey',
  triple_storey: 'Triple Storey',
  other: 'Other',
};

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function generateCSV(clients) {
  const headers = [
    'Name',
    'SMS Name',
    'Client Type',
    'Status',
    'Start Date',
    'End Date',
    'Email',
    'Phone Primary',
    'Phone Secondary',
    'Address',
    'Property Type',
    'Property Stories',
    'Bedrooms',
    'Bathrooms',
    'Service Frequency',
    'Service Price (AUD)',
    'Service Hours',
    'GST Type',
    'Payment Method',
    'Has Access',
    'Access Type',
    'Access Identifier',
    'Access Instructions',
    'Special Billing',
    'Billing Instructions',
    'Admin Notes',
    'Default Service Notes',
    'Pets',
    'Family Notes',
    'Emergency Contact',
  ];

  const rows = clients.map(c => {
    const pets = (c.pets || []).map(p => `${p.name} (${p.type}${p.breed ? ', ' + p.breed : ''})`).join(' | ');
    const family = c.family_details || {};
    return [
      c.name,
      c.sms_name,
      CLIENT_TYPE_LABELS[c.client_type] || c.client_type,
      c.active !== false ? 'Active' : 'Inactive',
      c.start_date,
      c.end_date,
      c.email,
      c.mobile_number,
      c.secondary_mobile_number,
      c.address,
      PROPERTY_TYPE_LABELS[c.property_type] || c.property_type,
      PROPERTY_STORIES_LABELS[c.property_stories] || c.property_stories,
      c.num_bedrooms,
      c.num_bathrooms,
      FREQ_LABELS[c.service_frequency] || c.service_frequency,
      c.current_service_price,
      c.service_hours,
      c.gst_type,
      PAYMENT_LABELS[c.payment_method] || c.payment_method,
      c.has_access ? 'Yes' : 'No',
      c.has_access ? (ACCESS_TYPE_LABELS[c.access_type] || c.access_type) : '',
      c.has_access ? c.access_identifier : '',
      c.has_access ? c.access_instructions : '',
      c.has_special_billing_instructions ? 'Yes' : 'No',
      c.has_special_billing_instructions ? c.special_billing_instructions : '',
      c.admin_notes,
      c.default_service_notes,
      pets,
      family.family_notes,
      family.emergency_contact,
    ].map(escapeCSV);
  });

  const csvContent = [headers.map(escapeCSV).join(','), ...rows.map(r => r.join(','))].join('\n');
  return csvContent;
}

export default function ExportClientsCSV({ clients }) {
  const [open, setOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('active');
  const [filterType, setFilterType] = useState('all');

  const filteredCount = clients.filter(c => {
    const statusOk = filterStatus === 'all' ? true : filterStatus === 'active' ? c.active !== false : c.active === false;
    const typeOk = filterType === 'all' ? true : c.client_type === filterType;
    return statusOk && typeOk;
  }).length;

  const handleExport = () => {
    const filtered = clients.filter(c => {
      const statusOk = filterStatus === 'all' ? true : filterStatus === 'active' ? c.active !== false : c.active === false;
      const typeOk = filterType === 'all' ? true : c.client_type === filterType;
      return statusOk && typeOk;
    });

    const csv = generateCSV(filtered);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    const typeLabel = filterType === 'all' ? 'all-types' : filterType;
    const statusLabel = filterStatus === 'all' ? 'all' : filterStatus;
    link.href = url;
    link.download = `clients_${statusLabel}_${typeLabel}_${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Download className="h-4 w-4" />
        Exportar CSV
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-green-600" />
              Exportar Clientes a CSV
            </DialogTitle>
            <DialogDescription>
              Selecciona los filtros y descarga el archivo con toda la información de los clientes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Estado del cliente</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Solo activos</SelectItem>
                  <SelectItem value="inactive">Solo inactivos</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de cliente</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="domestic">Doméstico</SelectItem>
                  <SelectItem value="commercial">Comercial</SelectItem>
                  <SelectItem value="training">Entrenamiento</SelectItem>
                  <SelectItem value="ndis_client">NDIS Client</SelectItem>
                  <SelectItem value="dva_client">DVA Client</SelectItem>
                  <SelectItem value="age_care_client">Age Care Client</SelectItem>
                  <SelectItem value="work_cover_client">Work Cover Client</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 border border-slate-200">
              Se exportarán <strong>{filteredCount}</strong> cliente{filteredCount !== 1 ? 's' : ''} con toda su información (contacto, propiedad, servicio, acceso, notas, mascotas, etc.)
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleExport} disabled={filteredCount === 0} className="gap-2 bg-green-600 hover:bg-green-700">
              <Download className="h-4 w-4" />
              Descargar CSV ({filteredCount})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}