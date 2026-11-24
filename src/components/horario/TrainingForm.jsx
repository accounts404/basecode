import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandGroup, CommandEmpty } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, ChevronsUpDown, GraduationCap, MapPin, AlertCircle, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import CleanerPicker from "./CleanerPicker";
import { getEffectiveRate } from "./supervisionHelpers";

export default function TrainingForm({ users, currentUser, existingTraining, onSave, onCancel }) {
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [trainerId, setTrainerId] = useState(existingTraining?.trainer_id || "");
  const [traineeId, setTraineeId] = useState(existingTraining?.trainee_id || "");
  const [dateStr, setDateStr] = useState(
    existingTraining?.date || format(new Date(), "yyyy-MM-dd")
  );
  const [startTime, setStartTime] = useState(existingTraining?.start_time?.slice(11, 16) || "09:00");
  const [endTime, setEndTime] = useState(existingTraining?.end_time?.slice(11, 16) || "13:00");
  const [selectedClientIds, setSelectedClientIds] = useState(
    existingTraining?.visits?.map((v) => v.client_id).filter(Boolean) || []
  );
  const [instructions, setInstructions] = useState(() => {
    const map = {};
    (existingTraining?.visits || []).forEach((v) => {
      if (v.client_id) map[v.client_id] = v.training_instructions || "";
    });
    return map;
  });
  const [notes, setNotes] = useState(existingTraining?.notes || "");
  const [clientSearch, setClientSearch] = useState("");
  const [dayClientIds, setDayClientIds] = useState(new Set());
  const [loadingDayClients, setLoadingDayClients] = useState(false);

  const initialClientIdsRef = useRef(
    existingTraining?.visits?.map((v) => v.client_id).filter(Boolean) || []
  );
  const removalLocked = existingTraining?.status === "completed";

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

  // Clientes con servicio agendado en la fecha elegida
  useEffect(() => {
    if (!dateStr) return;
    let cancelled = false;
    const fetchDayClients = async () => {
      setLoadingDayClients(true);
      try {
        const dayStart = `${dateStr}T00:00:00.000`;
        const dayEnd = `${dateStr}T23:59:59.999`;
        const filter = { start_time: { $gte: dayStart, $lte: dayEnd }, status: { $ne: "cancelled" } };
        const BATCH = 500;
        let all = [];
        let skip = 0;
        while (true) {
          const batch = await base44.entities.Schedule.filter(filter, "-start_time", BATCH, skip);
          const arr = Array.isArray(batch) ? batch : (batch?.items || []);
          all = all.concat(arr);
          if (arr.length < BATCH) break;
          skip += BATCH;
        }
        if (!cancelled) {
          const ids = new Set();
          all.forEach((s) => { if (s.client_id) ids.add(s.client_id); });
          setDayClientIds(ids);
        }
      } catch (e) {
        console.error("Error cargando clientes del día:", e);
      } finally {
        if (!cancelled) setLoadingDayClients(false);
      }
    };
    fetchDayClients();
    return () => { cancelled = true; };
  }, [dateStr]);

  const { dayClients, otherClients } = useMemo(() => {
    const q = clientSearch.toLowerCase().trim();
    const matches = (c) =>
      !q ||
      (c.name || "").toLowerCase().includes(q) ||
      (c.address || "").toLowerCase().includes(q);
    return {
      dayClients: clients.filter((c) => dayClientIds.has(c.id) && matches(c)),
      otherClients: clients.filter((c) => !dayClientIds.has(c.id) && matches(c)),
    };
  }, [clients, clientSearch, dayClientIds]);

  const handleToggleClient = (clientId) => {
    if (removalLocked && initialClientIdsRef.current.includes(clientId)) return;
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    );
  };

  const handleSave = async () => {
    setError("");
    if (!trainerId) return setError("Selecciona al limpiador que entrena.");
    if (!traineeId) return setError("Selecciona al aprendiz.");
    if (trainerId === traineeId) return setError("El entrenador y el aprendiz deben ser personas distintas.");
    if (!dateStr || !startTime || !endTime) return setError("Completa fecha y horas del bloque.");
    if (startTime >= endTime) return setError("La hora de fin debe ser mayor a la de inicio.");
    if (selectedClientIds.length === 0) return setError("Selecciona al menos una casa para el entrenamiento.");

    setSaving(true);
    try {
      const trainer = users.find((u) => u.id === trainerId);
      const trainee = users.find((u) => u.id === traineeId);
      const startISO = `${dateStr}T${startTime}:00.000`;
      const endISO = `${dateStr}T${endTime}:00.000`;

      // Releer el bloque para no borrar lo que el entrenador ya escribió
      const fresh = existingTraining?.id
        ? await base44.entities.Training.get(existingTraining.id).catch(() => existingTraining)
        : existingTraining;
      const freshVisits = fresh?.visits || [];
      const initialIds = initialClientIdsRef.current;
      const finalIds = Array.from(
        new Set([
          ...selectedClientIds,
          ...freshVisits.map((v) => v.client_id).filter((id) => id && !initialIds.includes(id)),
        ])
      );

      const visits = finalIds.map((cid) => {
        const c = clients.find((cl) => cl.id === cid);
        const existing = freshVisits.find((v) => v.client_id === cid);
        return {
          ...(existing || {}),
          client_id: cid,
          client_name: c?.name || existing?.client_name || "Cliente",
          client_address: c?.address || existing?.client_address || "",
          visit_status: existing?.visit_status || "pending",
          training_instructions:
            instructions[cid] !== undefined ? instructions[cid] : existing?.training_instructions || "",
          trainer_notes: existing?.trainer_notes || "",
          areas_covered: existing?.areas_covered || [],
          started_at: existing?.started_at || null,
          completed_at: existing?.completed_at || null,
          photos: existing?.photos || [],
        };
      });

      const payload = {
        trainer_id: trainerId,
        trainer_name: trainer?.invoice_name || trainer?.full_name || "Entrenador",
        trainee_id: traineeId,
        trainee_name: trainee?.invoice_name || trainee?.full_name || "Aprendiz",
        date: dateStr,
        start_time: startISO,
        end_time: endISO,
        status: fresh?.status || "scheduled",
        visits,
        notes,
        created_by_user_id: currentUser?.id,
        created_by_user_name: currentUser?.full_name,
      };

      let saved;
      if (existingTraining?.id) {
        await base44.entities.Training.update(existingTraining.id, payload);
        saved = { ...existingTraining, ...payload, id: existingTraining.id };

        // Solo ajustar la WorkEntry si ya existe (bloque completado) y no está facturada
        if (existingTraining.work_entry_id) {
          const we = await base44.entities.WorkEntry.get(existingTraining.work_entry_id).catch(() => null);
          if (we && !we.invoiced) {
            const startDt = new Date(startISO);
            const endDt = new Date(endISO);
            const hours = parseFloat(((endDt - startDt) / (1000 * 60 * 60)).toFixed(4));
            const rate = getEffectiveRate(trainer, dateStr);
            const day = parseInt(dateStr.slice(8, 10), 10);
            await base44.entities.WorkEntry.update(we.id, {
              hours,
              hourly_rate: rate,
              total_amount: parseFloat((hours * rate).toFixed(2)),
              work_date: dateStr,
              period: `${dateStr.slice(0, 7)}-${day <= 15 ? "1st" : "2nd"}`,
            });
          }
        }
      } else {
        const created = await base44.entities.Training.create(payload);
        saved = { ...payload, id: created.id };
      }

      if (onSave) onSave(saved);
    } catch (e) {
      console.error("Error guardando entrenamiento:", e);
      setError(e.message || "Error al guardar el entrenamiento.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingTraining?.id) return;
    if (!window.confirm("¿Eliminar este bloque de entrenamiento? Las horas ya facturadas no se modificarán.")) return;
    setSaving(true);
    try {
      if (existingTraining.work_entry_id) {
        const we = await base44.entities.WorkEntry.get(existingTraining.work_entry_id).catch(() => null);
        if (we && !we.invoiced) await base44.entities.WorkEntry.delete(we.id);
      }
      await base44.entities.Training.delete(existingTraining.id);
      if (onSave) onSave(null, true);
    } catch (e) {
      setError(e.message || "Error al eliminar.");
    } finally {
      setSaving(false);
    }
  };

  const selectedClients = selectedClientIds
    .map((id) => clients.find((c) => c.id === id))
    .filter(Boolean);

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2 text-teal-700">
        <GraduationCap className="w-5 h-5" />
        <span className="font-semibold text-sm">
          {existingTraining?.id ? "Editar bloque de entrenamiento" : "Nuevo bloque de entrenamiento"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Quién entrena</Label>
          <CleanerPicker
            cleaners={cleaners}
            value={trainerId}
            onChange={setTrainerId}
            placeholder="Seleccionar entrenador..."
            excludeId={traineeId}
          />
        </div>
        <div className="space-y-2">
          <Label>A quién se entrena</Label>
          <CleanerPicker
            cleaners={cleaners}
            value={traineeId}
            onChange={setTraineeId}
            placeholder="Seleccionar aprendiz..."
            excludeId={trainerId}
          />
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
        <Label>Casas del recorrido</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
              {selectedClientIds.length > 0
                ? `${selectedClientIds.length} casa${selectedClientIds.length > 1 ? "s" : ""} seleccionada${selectedClientIds.length > 1 ? "s" : ""}`
                : "Seleccionar casas..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Buscar cliente por nombre o dirección..."
                value={clientSearch}
                onValueChange={setClientSearch}
              />
              <CommandList className="max-h-[320px]">
                {loadingClients ? (
                  <CommandEmpty>Cargando clientes...</CommandEmpty>
                ) : dayClients.length === 0 && otherClients.length === 0 ? (
                  <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                ) : (
                  <>
                    {dayClients.length > 0 && (
                      <CommandGroup heading={loadingDayClients ? "Con servicio ese día..." : "Con servicio ese día"}>
                        {dayClients.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.name} ${c.address || ""}`}
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
                    {otherClients.length > 0 && (
                      <CommandGroup heading="Todos los clientes">
                        {otherClients.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.name} ${c.address || ""}`}
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
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {selectedClients.length > 0 && (
        <div className="space-y-2">
          <Label>Qué debe enseñarle en cada casa</Label>
          {selectedClients.map((c) => (
            <div key={c.id} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/60">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                  {c.address && <p className="text-xs text-slate-500 truncate">{c.address}</p>}
                </div>
                {!(removalLocked && initialClientIdsRef.current.includes(c.id)) && (
                  <button
                    type="button"
                    onClick={() => handleToggleClient(c.id)}
                    className="text-slate-400 hover:text-red-600 p-1"
                    title="Quitar del entrenamiento"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Textarea
                value={instructions[c.id] || ""}
                onChange={(e) => setInstructions((prev) => ({ ...prev, [c.id]: e.target.value }))}
                placeholder="Ej: enseñarle el orden de los baños, dónde están los productos, cómo dejar las camas..."
                rows={2}
                className="text-sm"
              />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label>Notas generales del bloque</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Indicaciones generales para el entrenador..."
          rows={2}
        />
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <div>
          {existingTraining?.id && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={saving}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Eliminar
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-teal-600 hover:bg-teal-700">
            {saving ? "Guardando..." : "Guardar entrenamiento"}
          </Button>
        </div>
      </div>
    </div>
  );
}