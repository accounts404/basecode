import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import VehicleKeySection from '@/components/keys/VehicleKeySection';
import { Car } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KeyRound, Search, Plus, Copy, AlertTriangle, CheckCircle, RotateCcw, Eye, Shield, Trash2, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import KeyRecordModal from '@/components/keys/KeyRecordModal';

const STATUS_CONFIG = {
  active: { label: 'Activa', icon: <CheckCircle className="w-3.5 h-3.5" />, className: 'bg-green-100 text-green-800 border-green-200' },
  returned: { label: 'Devuelta', icon: <RotateCcw className="w-3.5 h-3.5" />, className: 'bg-slate-100 text-slate-600 border-slate-200' },
  lost: { label: 'Perdida', icon: <AlertTriangle className="w-3.5 h-3.5" />, className: 'bg-red-100 text-red-800 border-red-200' },
};

export default function GestionLlaves() {
  const [allClients, setAllClients] = useState([]);
  const [clients, setClients] = useState([]);
  const [keyRecords, setKeyRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedModal, setSelectedModal] = useState(null); // { client, record }
  const [error, setError] = useState('');
  const [showAddClientPicker, setShowAddClientPicker] = useState(false);
  const [clientPickerSearch, setClientPickerSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // { client, record }

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedClients, allRecords] = await Promise.all([
        base44.entities.Client.list(),
        base44.entities.KeyRecord.list(),
      ]);
      const active = fetchedClients.filter(c => c.active !== false);
      setAllClients(active);
      // Mostrar solo clientes que tienen un KeyRecord
      const clientIds = new Set(allRecords.map(r => r.client_id));
      setClients(active.filter(c => clientIds.has(c.id)));
      setKeyRecords(allRecords);
    } catch (err) {
      setError('Error cargando datos.');
    } finally {
      setLoading(false);
    }
  };

  // Combinar clientes con sus registros de llave
  const combinedData = useMemo(() => {
    return clients.map(client => {
      const record = keyRecords.find(r => r.client_id === client.id) || null;
      return { client, record };
    });
  }, [clients, keyRecords]);

  const filtered = useMemo(() => {
    return combinedData.filter(({ client, record }) => {
      const matchSearch = !search ||
        client.name.toLowerCase().includes(search.toLowerCase()) ||
        client.address?.toLowerCase().includes(search.toLowerCase()) ||
        record?.safe_box_number?.toLowerCase().includes(search.toLowerCase());

      const matchStatus = statusFilter === 'all' ||
        (statusFilter === 'unregistered' && !record) ||
        (record && record.status === statusFilter);

      return matchSearch && matchStatus;
    });
  }, [combinedData, search, statusFilter]);

  const stats = useMemo(() => ({
    total: clients.length,
    registered: keyRecords.length,
    active: keyRecords.filter(r => r.status === 'active').length,
    withCopies: keyRecords.filter(r => r.copies?.length > 0).length,
    lost: keyRecords.filter(r => r.status === 'lost').length,
  }), [clients, keyRecords]);

  const handleOpenModal = (client, record) => {
    setSelectedModal({ client, record });
  };

  const handleSave = async (data) => {
    try {
      if (selectedModal.record?.id) {
        await base44.entities.KeyRecord.update(selectedModal.record.id, data);
      } else {
        await base44.entities.KeyRecord.create(data);
      }
      await loadData();
      setSelectedModal(null);
    } catch (err) {
      setError('Error al guardar.');
    }
  };

  const handleAddClient = async (client) => {
    try {
      await base44.entities.KeyRecord.create({
        client_id: client.id,
        client_name: client.name,
        client_address: client.address || '',
        safe_box_number: '',
        status: 'active',
      });
      setShowAddClientPicker(false);
      setClientPickerSearch('');
      await loadData();
    } catch (err) {
      setError('Error al agregar cliente.');
    }
  };

  const handleDeleteRecord = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.record?.id) {
        await base44.entities.KeyRecord.delete(confirmDelete.record.id);
      }
      setConfirmDelete(null);
      await loadData();
    } catch (err) {
      setError('Error al eliminar.');
    }
  };

  // Clientes disponibles para agregar (que no tienen registro aún)
  const availableClients = useMemo(() => {
    const existingIds = new Set(keyRecords.map(r => r.client_id));
    return allClients.filter(c => !existingIds.has(c.id) &&
      (!clientPickerSearch || c.name.toLowerCase().includes(clientPickerSearch.toLowerCase()) || c.address?.toLowerCase().includes(clientPickerSearch.toLowerCase()))
    );
  }, [allClients, keyRecords, clientPickerSearch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600 mx-auto" />
          <p className="text-slate-600">Cargando gestión de llaves...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center shadow-sm">
          <KeyRound className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Gestión de Llaves</h1>
          <p className="text-sm text-slate-500">Control y trazabilidad de llaves</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="clients">
        <TabsList className="mb-6">
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Llaves de Clientes
          </TabsTrigger>
          <TabsTrigger value="vehicles" className="flex items-center gap-2">
            <Car className="w-4 h-4" /> Llaves de Vehículos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clients">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Total Clientes', value: stats.total, color: 'text-slate-700', bg: 'bg-slate-50' },
              { label: 'Registradas', value: stats.registered, color: 'text-blue-700', bg: 'bg-blue-50' },
              { label: 'Activas', value: stats.active, color: 'text-green-700', bg: 'bg-green-50' },
              { label: 'Con Copias', value: stats.withCopies, color: 'text-amber-700', bg: 'bg-amber-50' },
              { label: 'Perdidas', value: stats.lost, color: 'text-red-700', bg: 'bg-red-50' },
            ].map((stat) => (
              <div key={stat.label} className={`${stat.bg} rounded-xl p-3 text-center`}>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Filters + Add Button */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por cliente, dirección o número de caja..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">✅ Activas</SelectItem>
                <SelectItem value="returned">↩️ Devueltas</SelectItem>
                <SelectItem value="lost">❌ Perdidas</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setShowAddClientPicker(true)} className="bg-amber-600 hover:bg-amber-700 gap-2 shrink-0">
              <UserPlus className="w-4 h-4" /> Agregar Cliente
            </Button>
          </div>

          {/* Key Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(({ client, record }) => (
              <Card
                key={client.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  !record ? 'border-dashed border-slate-300' :
                  record.status === 'lost' ? 'border-red-300 bg-red-50/30' :
                  record.status === 'returned' ? 'border-slate-200 bg-slate-50/30' :
                  'border-amber-200 bg-amber-50/20'
                }`}
                onClick={() => handleOpenModal(client, record)}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                        !record ? 'bg-slate-100 text-slate-400' :
                        record.status === 'lost' ? 'bg-red-100 text-red-700' :
                        record.status === 'returned' ? 'bg-slate-100 text-slate-600' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {record ? record.safe_box_number : <KeyRound className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm leading-tight">{client.name}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[160px]">{client.address || 'Sin dirección'}</p>
                      </div>
                    </div>

                    {record ? (
                      <Badge className={`text-xs flex items-center gap-1 ${STATUS_CONFIG[record.status]?.className}`}>
                        {STATUS_CONFIG[record.status]?.icon}
                        {STATUS_CONFIG[record.status]?.label}
                      </Badge>
                    ) : (
                      <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200">Sin registrar</Badge>
                    )}
                  </div>

                  {record ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-4 text-xs text-slate-600">
                        <span className="flex items-center gap-1">
                          <Shield className="w-3.5 h-3.5 text-amber-500" />
                          Caja: <strong className="font-mono">{record.safe_box_number}</strong>
                        </span>
                        {record.copies?.length > 0 && (
                          <span className="flex items-center gap-1 text-amber-700">
                            <Copy className="w-3.5 h-3.5" />
                            {record.copies.length} copia{record.copies.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {record.key_photos?.length > 0 && (
                        <div className="flex gap-1.5">
                          {record.key_photos.slice(0, 3).map((photo, i) => (
                            <img key={i} src={photo.url} alt="" className="w-12 h-12 object-cover rounded-lg border border-amber-200" />
                          ))}
                          {record.key_photos.length > 3 && (
                            <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-xs text-slate-500 font-medium">
                              +{record.key_photos.length - 3}
                            </div>
                          )}
                        </div>
                      )}

                      {record.received_date && (
                        <p className="text-xs text-slate-400">
                          Recibida: {format(new Date(record.received_date), "d MMM yyyy", { locale: es })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-slate-500 mt-2">
                      <Plus className="w-4 h-4" />
                      <span>Click para registrar llave</span>
                    </div>
                  )}

                  <div className="flex justify-between mt-3 pt-2 border-t border-slate-100">
                    <Button variant="ghost" size="sm" className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 h-7"
                      onClick={e => { e.stopPropagation(); setConfirmDelete({ client, record }); }}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs text-slate-500 h-7">
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      {record ? 'Ver / Editar' : 'Registrar'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filtered.length === 0 && (
              <div className="col-span-full text-center py-16 text-slate-500">
                <KeyRound className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No se encontraron resultados</p>
                <p className="text-sm mt-1">Ajusta los filtros o verifica que los clientes tengan acceso con llave configurado.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="vehicles">
          <VehicleKeySection />
        </TabsContent>
      </Tabs>

      {selectedModal && (
        <KeyRecordModal
          record={selectedModal.record}
          client={selectedModal.client}
          onSave={handleSave}
          onClose={() => setSelectedModal(null)}
        />
      )}

      {/* Add Client Picker */}
      <Dialog open={showAddClientPicker} onOpenChange={v => { setShowAddClientPicker(v); setClientPickerSearch(''); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-amber-600" /> Agregar Cliente</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <Input placeholder="Buscar cliente..." value={clientPickerSearch} onChange={e => setClientPickerSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="space-y-2">
            {availableClients.length === 0 && (
              <p className="text-center text-slate-500 py-8 text-sm">No hay clientes disponibles para agregar.</p>
            )}
            {availableClients.map(client => (
              <button key={client.id} onClick={() => handleAddClient(client)}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-all">
                <p className="font-medium text-slate-800 text-sm">{client.name}</p>
                <p className="text-xs text-slate-500">{client.address || 'Sin dirección'}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <Dialog open={!!confirmDelete} onOpenChange={v => !v && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar cliente de gestión de llaves?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 mb-4">
            Se eliminará <strong>{confirmDelete?.client?.name}</strong> y su registro de llave. Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteRecord}>Eliminar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}