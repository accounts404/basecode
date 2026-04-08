import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Car, Battery, Copy, AlertTriangle, Plus, CheckCircle, Edit, Clock } from 'lucide-react';
import { format, differenceInMonths, addMonths, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import KeyPhotoUploader from '@/components/keys/KeyPhotoUploader';

const KEY_TYPE_LABELS = {
  standard: 'Llave Estándar',
  remote_fob: 'Control Remoto (Fob)',
  smart_key: 'Llave Inteligente',
  other: 'Otro',
};

const STATUS_CONFIG = {
  active: { label: 'Activa', className: 'bg-green-100 text-green-800 border-green-200' },
  lost: { label: 'Perdida', className: 'bg-red-100 text-red-800 border-red-200' },
  spare_only: { label: 'Solo Copia', className: 'bg-amber-100 text-amber-800 border-amber-200' },
};

function getBatteryStatus(record) {
  if (!record.battery_last_changed) return null;
  const reminderMonths = record.battery_reminder_months || 12;
  const nextChange = addMonths(new Date(record.battery_last_changed), reminderMonths);
  const now = new Date();
  const monthsLeft = differenceInMonths(nextChange, now);

  if (isBefore(nextChange, now)) return { label: 'Vencida', color: 'text-red-600', urgent: true };
  if (monthsLeft <= 2) return { label: `${monthsLeft}m restantes`, color: 'text-amber-600', urgent: true };
  return { label: `${monthsLeft}m restantes`, color: 'text-green-600', urgent: false };
}

export default function VehicleKeySection() {
  const [vehicles, setVehicles] = useState([]);
  const [keyRecords, setKeyRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(null); // vehicle key record or null
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    key_type: 'standard',
    has_copy: false,
    copy_location: '',
    battery_last_changed: '',
    battery_reminder_months: 12,
    status: 'active',
    notes: '',
    key_photos: [],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allVehicles, allRecords] = await Promise.all([
        base44.entities.Vehicle.list(),
        base44.entities.VehicleKeyRecord.list(),
      ]);
      setVehicles(allVehicles.filter(v => v.status !== 'out_of_service'));
      setKeyRecords(allRecords);
    } catch (err) {
      setError('Error cargando datos.');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (vehicle, record) => {
    setSelectedVehicle(vehicle);
    if (record) {
      setForm({
        key_type: record.key_type || 'standard',
        has_copy: record.has_copy || false,
        copy_location: record.copy_location || '',
        battery_last_changed: record.battery_last_changed || '',
        battery_reminder_months: record.battery_reminder_months || 12,
        status: record.status || 'active',
        notes: record.notes || '',
        key_photos: record.key_photos || [],
      });
    } else {
      setForm({ key_type: 'standard', has_copy: false, copy_location: '', battery_last_changed: '', battery_reminder_months: 12, status: 'active', notes: '', key_photos: [] });
    }
    setEditModal(record || 'new');
  };

  const handleSave = async () => {
    if (!selectedVehicle) return;
    setSaving(true);
    setError('');
    try {
      const user = await base44.auth.me();
      const logEvent = {
        date: new Date().toISOString(),
        action: editModal === 'new' ? 'Registro creado' : 'Registro actualizado',
        user_name: user?.full_name || 'Admin',
      };

      const existingRecord = keyRecords.find(r => r.vehicle_id === selectedVehicle.id);
      const payload = {
        ...form,
        vehicle_id: selectedVehicle.id,
        vehicle_info: `${selectedVehicle.make} ${selectedVehicle.model} - ${selectedVehicle.license_plate}`,
        log_events: [...(existingRecord?.log_events || []), logEvent],
      };

      if (existingRecord) {
        await base44.entities.VehicleKeyRecord.update(existingRecord.id, payload);
      } else {
        await base44.entities.VehicleKeyRecord.create(payload);
      }
      await loadData();
      setEditModal(null);
    } catch (err) {
      setError('Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const combined = vehicles.map(v => ({
    vehicle: v,
    record: keyRecords.find(r => r.vehicle_id === v.id) || null,
  }));

  // Stats
  const batteryAlerts = keyRecords.filter(r => {
    const bs = getBatteryStatus(r);
    return bs?.urgent;
  }).length;

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <div>
      {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Vehículos', value: vehicles.length, color: 'text-slate-700', bg: 'bg-slate-50' },
          { label: 'Registradas', value: keyRecords.length, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Con Copia', value: keyRecords.filter(r => r.has_copy).length, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Alertas Batería', value: batteryAlerts, color: batteryAlerts > 0 ? 'text-red-700' : 'text-slate-400', bg: batteryAlerts > 0 ? 'bg-red-50' : 'bg-slate-50' },
        ].map(stat => (
          <div key={stat.label} className={`${stat.bg} rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Vehicle Key Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {combined.map(({ vehicle, record }) => {
          const batteryStatus = record ? getBatteryStatus(record) : null;
          return (
            <Card
              key={vehicle.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                !record ? 'border-dashed border-slate-300' :
                record.status === 'lost' ? 'border-red-300 bg-red-50/30' :
                'border-blue-200 bg-blue-50/10'
              }`}
              onClick={() => openModal(vehicle, record)}
            >
              <CardContent className="pt-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      !record ? 'bg-slate-100' : record.status === 'lost' ? 'bg-red-100' : 'bg-blue-100'
                    }`}>
                      <Car className={`w-5 h-5 ${!record ? 'text-slate-400' : record.status === 'lost' ? 'text-red-600' : 'text-blue-700'}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm leading-tight">{vehicle.make} {vehicle.model}</p>
                      <p className="text-xs text-slate-500 font-mono">{vehicle.license_plate}</p>
                    </div>
                  </div>
                  {record ? (
                    <Badge className={`text-xs ${STATUS_CONFIG[record.status]?.className}`}>
                      {STATUS_CONFIG[record.status]?.label}
                    </Badge>
                  ) : (
                    <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200">Sin registrar</Badge>
                  )}
                </div>

                {record ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5 text-slate-400" />
                        {KEY_TYPE_LABELS[record.key_type] || record.key_type}
                      </span>
                      <span className={`flex items-center gap-1 ${record.has_copy ? 'text-green-700' : 'text-slate-400'}`}>
                        <Copy className="w-3.5 h-3.5" />
                        {record.has_copy ? 'Tiene copia' : 'Sin copia'}
                      </span>
                    </div>

                    {(record.key_type === 'remote_fob' || record.key_type === 'smart_key') && (
                      <div className={`flex items-center gap-1.5 text-xs font-medium ${batteryStatus ? batteryStatus.color : 'text-slate-400'}`}>
                        <Battery className="w-3.5 h-3.5" />
                        {record.battery_last_changed
                          ? <>Batería: {format(new Date(record.battery_last_changed), 'd MMM yyyy', { locale: es })} {batteryStatus && `(${batteryStatus.label})`}</>
                          : 'Batería: no registrada'}
                        {batteryStatus?.urgent && <AlertTriangle className="w-3.5 h-3.5" />}
                      </div>
                    )}

                    {record.key_photos?.length > 0 && (
                      <div className="flex gap-1.5">
                        {record.key_photos.slice(0, 3).map((p, i) => (
                          <img key={i} src={p.url} alt="" className="w-10 h-10 object-cover rounded-lg border border-blue-200" />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-500 mt-2">
                    <Plus className="w-4 h-4" />
                    <span>Click para registrar llave</span>
                  </div>
                )}

                <div className="flex justify-end mt-3 pt-2 border-t border-slate-100">
                  <Button variant="ghost" size="sm" className="text-xs text-slate-500 h-7">
                    <Edit className="w-3.5 h-3.5 mr-1" />
                    {record ? 'Ver / Editar' : 'Registrar'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editModal && selectedVehicle && (
        <Dialog open={true} onOpenChange={() => setEditModal(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Car className="w-5 h-5 text-blue-600" />
                Llave: {selectedVehicle.make} {selectedVehicle.model} - {selectedVehicle.license_plate}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Tipo de llave</Label>
                  <Select value={form.key_type} onValueChange={v => setForm(f => ({ ...f, key_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(KEY_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Estado</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Activa</SelectItem>
                      <SelectItem value="lost">Perdida</SelectItem>
                      <SelectItem value="spare_only">Solo Copia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="has_copy"
                  checked={form.has_copy}
                  onChange={e => setForm(f => ({ ...f, has_copy: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <Label htmlFor="has_copy">¿Tiene copia?</Label>
              </div>

              {form.has_copy && (
                <div className="space-y-1">
                  <Label>Ubicación de la copia</Label>
                  <Input value={form.copy_location} onChange={e => setForm(f => ({ ...f, copy_location: e.target.value }))} placeholder="Ej: Caja fuerte oficina" />
                </div>
              )}

              {(form.key_type === 'remote_fob' || form.key_type === 'smart_key') && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1"><Battery className="w-3.5 h-3.5" /> Último cambio batería</Label>
                    <Input type="date" value={form.battery_last_changed} onChange={e => setForm(f => ({ ...f, battery_last_changed: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Recordar cada (meses)</Label>
                    <Input type="number" min={1} max={36} value={form.battery_reminder_months} onChange={e => setForm(f => ({ ...f, battery_reminder_months: parseInt(e.target.value) || 12 }))} />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label>Fotos de la llave</Label>
                <KeyPhotoUploader photos={form.key_photos} onChange={photos => setForm(f => ({ ...f, key_photos: photos }))} />
              </div>

              <div className="space-y-1">
                <Label>Notas</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Notas adicionales sobre la llave..." />
              </div>

              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditModal(null)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}