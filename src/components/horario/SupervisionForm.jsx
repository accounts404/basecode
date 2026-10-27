import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandGroup, CommandEmpty } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, ChevronsUpDown, Shield, Clock, MapPin, AlertCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const pad = (n) => String(n).padStart(2, "0");
const toLocalISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00.000`;

const getEffectiveRate = (user, workDateStr) => {
  if (user?.rate_history?.length > 0) {
    const effective = user.rate_history
      .filter((rh) => rh.effective_date <= workDateStr)
      .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
    if (effective) return effective.rate;
  }
  return user?.hourly_rate || 0;
};

export default function SupervisionForm({ users, currentUser, existingSupervision, onSave, onCancel }) {
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [supervisorId, setSupervisorId] = useState(existingSupervision?.supervisor_id || "");
  const [dateStr, setDateStr] = useState(
    existingSupervision?.date || format(new Date(), "yyyy-MM-dd")
  );
  const [startTime, setStartTime] = useState(
    existingSupervision?.start_time?.slice(11, 16) || "09:00"
  );
  const [endTime, setEndTime] = useState(
    existingSupervision?.end_time?.slice(11, 16) || "17:00"
  );
  const [selectedClientIds, setSelectedClientIds] = useState(
    existingSupervision?.visits?.map((v) => v.client_id).filter(Boolean) || []
  );
  const [notes, setNotes] = useState(existingSupervision?.notes || "");
  const [clientSearch, setClientSearch] = useState("");

  const cleaners = useMemo(
    () => users.filter((u) => u.role !== "admin" && u.active !== false),
    [users]
  );

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const BATCH = 500;
        let all = [];
        let skip = 0;
        while (true) {
          const batch = await base44.entities.Client.list("-created_date", BATCH, skip);
          const arr = Array.isArray(batch) ? batch : [];
          all = all.concat(arr);
          if (arr.length < BATCH) break;
          skip += BATCH;
        }
        setClients(all.filter((c) => c.active !== false));
      } catch (e) {
        console.error("Error cargando clientes:", e);
        setError("No se pudieron cargar los clientes.");
      } finally {
        setLoadingClients(false);
      }
    };
    fetchClients();
  }, []);

  const filteredClients = useMemo(() => {
    const q = clientSearch.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.address || "").toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  const handleToggleClient = (clientId) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    );
  };

  const handleSave = async () => {
    setError("");
    if (!supervisorId) {
      setError("Selecciona un limpiador supervisor.");
      return;
    }
    if (!dateStr || !startTime || !endTime) {
      setError("Completa fecha y horas del bloque.");
      return;
    }
    if (selectedClientIds.length === 0) {
      setError("Selecciona al menos un cliente para revisar.");
      return;
    }
    if (startTime >= endTime) {
      setError("La hora de fin debe ser mayor a la de inicio.");
      return;
    }

    setSaving(true);
    try {
      const supervisor = users.find((u) => u.id === supervisorId);
      const startISO = `${dateStr}T${startTime}:00.000`;
      const endISO = `${dateStr}T${endTime}:00.000`;
      const startDt = new Date(`${dateStr}T${startTime}`);
      const endDt = new Date(`${dateStr}T${endTime}`);
      const hours = parseFloat(((endDt - startDt) / (1000 * 60 * 60)).toFixed(4));

      const rate = getEffectiveRate(supervisor, dateStr);
      const day = parseInt(dateStr.slice(8, 10), 10);
      const period = `${dateStr.slice(0, 7)}-${day <= 15 ? "1st" : "2nd"}`;

      const visits = selectedClientIds.map((cid) => {
        const c = clients.find((cl) => cl.id === cid);
        const existing = existingSupervision?.visits?.find((v) => v.client_id === cid);
        return {
          client_id: cid,
          client_name: c?.name || existing?.client_name || "Cliente",
          client_address: c?.address || existing?.client_address || "",
          visit_status: existing?.visit_status || "pending",
          started_at: existing?.started_at || null,
          completed_at: existing?.completed_at || null,
          notes: existing?.notes || "",
          incidents: existing?.incidents || "",
          photos: existing?.photos || [],
        };
      });

      const supervisionData = {
        supervisor_id: supervisorId,
        supervisor_name: supervisor?.invoice_name || supervisor?.full_name || "Supervisor",
        date: dateStr,
        start_time: startISO,
        end_time: endISO,
        status: existingSupervision?.status || "scheduled",
        visits,
        notes,
        created_by_user_id: currentUser?.id,
        created_by_user_name: currentUser?.full_name,
      };

      let savedSupervision;
      if (existingSupervision?.id) {
        // Actualizar supervisión existente
        await base44.entities.Supervision.update(existingSupervision.id, supervisionData);

        // Actualizar WorkEntry asociada si existe y no está facturada
        if (existingSupervision.work_entry_id) {
          const we = await base44.entities.WorkEntry.get(existingSupervision.work_entry_id).catch(() => null);
          if (we && !we.invoiced) {
            await base44.entities.WorkEntry.update(we.id, {
              hours,
              total_amount: parseFloat((hours * rate).toFixed(2)),
              hourly_rate: rate,
              work_date: dateStr,
              period,
            });
          }
        } else {
          // Crear WorkEntry si no existía
          const we = await base44.entities.WorkEntry.create({
            cleaner_id: supervisorId,
            cleaner_name: supervisor?.invoice_name || supervisor?.full_name || "Supervisor",
            client_id: supervisorId,
            client_name: `Supervisión ${format(new Date(dateStr + "T12:00:00"), "d MMM yyyy", { locale: es })}`,
            work_date: dateStr,
            hours,
            activity: "supervision",
            hourly_rate: rate,
            total_amount: parseFloat((hours * rate).toFixed(2)),
            period,
            invoiced: false,
            is_supervision: true,
            supervision_id: existingSupervision.id,
          });
          await base44.entities.Supervision.update(existingSupervision.id, { work_entry_id: we.id });
        }
        savedSupervision = { ...existingSupervision, ...supervisionData, id: existingSupervision.id };
      } else {
        // Crear nueva supervisión
        const created = await base44.entities.Supervision.create(supervisionData);

        // Crear WorkEntry pagable
        const we = await base44.entities.WorkEntry.create({
          cleaner_id: supervisorId,
          cleaner_name: supervisor?.invoice_name || supervisor?.full_name || "Supervisor",
          client_id: supervisorId,
          client_name: `Supervisión ${format(new Date(dateStr + "T12:00:00"), "d MMM yyyy", { locale: es })}`,
          work_date: dateStr,
          hours,
          activity: "supervision",
          hourly_rate: rate,
          total_amount: parseFloat((hours * rate).toFixed(2)),
          period,
          invoiced: false,
          is_supervision: true,
          supervision_id: created.id,
        });
        await base44.entities.Supervision.update(created.id, { work_entry_id: we.id });
        savedSupervision = { ...supervisionData, id: created.id, work_entry_id: we.id };
      }

      if (onSave) onSave(savedSupervision);
    } catch (e) {
      console.error("Error guardando supervisión:", e);
      setError(e.message || "Error al guardar la supervisión.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingSupervision?.id) return;
    if (!window.confirm("¿Eliminar este bloque de supervisión? Las horas ya facturadas no se modificarán.")) return;
    setSaving(true);
    try {
      if (existingSupervision.work_entry_id) {
        const we = await base44.entities.WorkEntry.get(existingSupervision.work_entry_id).catch(() => null);
        if (we && !we.invoiced) {
          await base44.entities.WorkEntry.delete(we.id);
        }
      }
      await base44.entities.Supervision.delete(existingSupervision.id);
      if (onSave) onSave(null, true);
    } catch (e) {
      setError(e.message || "Error al eliminar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2 text-purple-700">
        <Shield className="w-5 h-5" />
        <span className="font-semibold text-sm">
          {existingSupervision?.id ? "Editar bloque de supervisión" : "Nuevo bloque de supervisión"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label>Limpiador supervisor</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between">
                {supervisorId
                  ? cleaners.find((c) => c.id === supervisorId)?.display_name ||
                    cleaners.find((c) => c.id === supervisorId)?.invoice_name ||
                    cleaners.find((c) => c.id === supervisorId)?.full_name ||
                    "Seleccionar..."
                  : "Seleccionar limpiador..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar limpiador..." />
                <CommandList>
                  <CommandEmpty>No se encontraron limpiadores.</CommandEmpty>
                  <CommandGroup>
                    {cleaners.map((c) => (
                      <CommandItem
                        key={c.id}
                        onSelect={() => setSupervisorId(c.id)}
                        className="flex items-center gap-2"
                      >
                        <Check className={`h-4 w-4 ${supervisorId === c.id ? "opacity-100" : "opacity-0"}`} />
                        <span>{c.display_name || c.invoice_name || c.full_name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Fecha</Label>
          <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label>Inicio</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Fin</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Clientes a revisar ({selectedClientIds.length})</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-full justify-between h-auto min-h-[40px] py-2">
              <div className="flex flex-wrap gap-1 flex-1">
                {selectedClientIds.length === 0 ? (
                  <span className="text-muted-foreground">Seleccionar clientes...</span>
                ) : (
                  selectedClientIds.slice(0, 4).map((cid) => {
                    const c = clients.find((cl) => cl.id === cid);
                    return (
                      <Badge key={cid} variant="secondary" className="text-xs">
                        {c?.name || "Cliente"}
                      </Badge>
                    );
                  })
                )}
                {selectedClientIds.length > 4 && (
                  <Badge variant="secondary" className="text-xs">
                    +{selectedClientIds.length - 4} más
                  </Badge>
                )}
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[450px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Buscar cliente por nombre o dirección..."
                value={clientSearch}
                onValueChange={setClientSearch}
              />
              <CommandList className="max-h-[300px]">
                {loadingClients ? (
                  <CommandEmpty>Cargando clientes...</CommandEmpty>
                ) : filteredClients.length === 0 ? (
                  <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {filteredClients.map((c) => (
                      <CommandItem
                        key={c.id}
                        onSelect={() => handleToggleClient(c.id)}
                        className="flex items-center gap-2"
                      >
                        <Checkbox checked={selectedClientIds.includes(c.id)} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{c.name}</p>
                          {c.address && (
                          <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {c.address}
                          </p>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label>Notas generales del bloque</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Instrucciones generales para el supervisor..."
          rows={2}
        />
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <div>
          {existingSupervision?.id && (
            <Button variant="outline" onClick={handleDelete} disabled={saving} className="text-red-600 border-red-200 hover:bg-red-50">
              <Trash2 className="w-4 h-4 mr-2" /> Eliminar
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
            {saving ? "Guardando..." : "Guardar supervisión"}
          </Button>
        </div>
      </div>
    </div>
  );
}