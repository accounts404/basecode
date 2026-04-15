import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, X, Settings, GripVertical } from "lucide-react";

const AREAS = [
  { key: "bathrooms",          name: "Baños",                      color: "blue" },
  { key: "kitchen_and_pantry", name: "Cocina y Despensa",          color: "orange" },
  { key: "floors",             name: "Pisos",                      color: "green" },
  { key: "dusting_wiping",     name: "Dusting / Limpieza General", color: "purple" },
  { key: "other_areas",        name: "Otras Áreas",                color: "slate" },
];

const AREA_COLORS = {
  blue:   "text-blue-700 border-blue-200 bg-blue-50",
  orange: "text-orange-700 border-orange-200 bg-orange-50",
  green:  "text-green-700 border-green-200 bg-green-50",
  purple: "text-purple-700 border-purple-200 bg-purple-50",
  slate:  "text-slate-700 border-slate-200 bg-slate-50",
};

export const CHECKLIST_CONFIG_KEY = "redoak_performance_checklist_config";

// Default built-in items per area
export const DEFAULT_AREA_ITEMS = {
  bathrooms: [
    { key: "sink_mirrors",  label: "Lavamanos y espejos limpios",      points: 7 },
    { key: "toilet",        label: "Inodoro desinfectado",              points: 6 },
    { key: "shower_tub",    label: "Ducha / bañera limpia",             points: 6 },
    { key: "floors_tiles",  label: "Pisos y azulejos",                  points: 6 },
  ],
  kitchen_and_pantry: [
    { key: "countertops",   label: "Mesadas y superficies",             points: 7 },
    { key: "appliances",    label: "Exterior de electrodomésticos",     points: 6 },
    { key: "sink",          label: "Fregadero limpio",                  points: 6 },
    { key: "pantry",        label: "Despensa organizada",               points: 6 },
  ],
  floors: [
    { key: "vacuumed",      label: "Aspirado",                         points: 10 },
    { key: "mopped",        label: "Trapeado / lavado",                points: 10 },
  ],
  dusting_wiping: [
    { key: "surfaces",      label: "Superficies desempolvadas",        points: 8 },
    { key: "glass_mirrors", label: "Vidrios y espejos interiores",     points: 7 },
  ],
  other_areas: [
    { key: "general_order", label: "Orden general",                    points: 8 },
    { key: "special_areas", label: "Áreas especiales (lavandería, etc.)", points: 7 },
  ],
};

// Load saved config from localStorage, falling back to defaults
export function loadChecklistConfig() {
  try {
    const saved = localStorage.getItem(CHECKLIST_CONFIG_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  // Return default config
  const config = {};
  AREAS.forEach(a => {
    config[a.key] = {
      items: DEFAULT_AREA_ITEMS[a.key].map(i => ({ ...i, enabled: true })),
    };
  });
  return config;
}

export function saveChecklistConfig(config) {
  localStorage.setItem(CHECKLIST_CONFIG_KEY, JSON.stringify(config));
}

export default function ChecklistConfigModal({ open, onClose }) {
  const [config, setConfig] = useState(() => {
    const loaded = loadChecklistConfig();
    // Ensure all areas have their default items merged with any extras
    const merged = {};
    AREAS.forEach(a => {
      const saved = loaded[a.key];
      if (saved) {
        merged[a.key] = saved;
      } else {
        merged[a.key] = {
          items: DEFAULT_AREA_ITEMS[a.key].map(i => ({ ...i, enabled: true })),
        };
      }
    });
    return merged;
  });

  const [newItemLabel, setNewItemLabel] = useState({});
  const [newItemPoints, setNewItemPoints] = useState({});

  const toggleItem = (areaKey, itemKey) => {
    setConfig(prev => ({
      ...prev,
      [areaKey]: {
        ...prev[areaKey],
        items: prev[areaKey].items.map(i =>
          i.key === itemKey ? { ...i, enabled: !i.enabled } : i
        ),
      },
    }));
  };

  const removeItem = (areaKey, itemKey) => {
    // Only allow removing custom items (not default ones)
    const isDefault = DEFAULT_AREA_ITEMS[areaKey]?.some(i => i.key === itemKey);
    if (isDefault) {
      toggleItem(areaKey, itemKey);
      return;
    }
    setConfig(prev => ({
      ...prev,
      [areaKey]: {
        ...prev[areaKey],
        items: prev[areaKey].items.filter(i => i.key !== itemKey),
      },
    }));
  };

  const addItem = (areaKey) => {
    const label = (newItemLabel[areaKey] || "").trim();
    const pts = parseInt(newItemPoints[areaKey]) || 5;
    if (!label) return;
    const newItem = { key: `custom_${Date.now()}`, label, points: pts, enabled: true, isCustom: true };
    setConfig(prev => ({
      ...prev,
      [areaKey]: {
        ...prev[areaKey],
        items: [...prev[areaKey].items, newItem],
      },
    }));
    setNewItemLabel(prev => ({ ...prev, [areaKey]: "" }));
    setNewItemPoints(prev => ({ ...prev, [areaKey]: "" }));
  };

  const handleSave = () => {
    saveChecklistConfig(config);
    onClose(config);
  };

  const handleReset = (areaKey) => {
    setConfig(prev => ({
      ...prev,
      [areaKey]: {
        items: DEFAULT_AREA_ITEMS[areaKey].map(i => ({ ...i, enabled: true })),
      },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose(null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configurar Checklist de Evaluación
          </DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            Los cambios aquí se aplican a todas las evaluaciones futuras.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {AREAS.map(area => {
            const areaConfig = config[area.key] || { items: [] };
            const colorCls = AREA_COLORS[area.color];
            const enabledCount = areaConfig.items.filter(i => i.enabled).length;

            return (
              <div key={area.key} className={`rounded-lg border p-4 ${colorCls}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{area.name}</span>
                    <Badge variant="outline" className="text-xs">{enabledCount} activos</Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReset(area.key)}
                    className="text-xs text-slate-400 hover:text-slate-600 underline"
                  >
                    Restaurar defaults
                  </button>
                </div>

                <div className="space-y-2 mb-3">
                  {areaConfig.items.map(item => {
                    const isDefault = DEFAULT_AREA_ITEMS[area.key]?.some(i => i.key === item.key);
                    return (
                      <div key={item.key} className="flex items-center justify-between bg-white rounded-md px-3 py-2 border border-white/60 shadow-sm">
                        <div className="flex items-center gap-3 flex-1">
                          <Switch
                            checked={item.enabled !== false}
                            onCheckedChange={() => toggleItem(area.key, item.key)}
                          />
                          <span className={`text-sm flex-1 ${item.enabled === false ? "line-through text-slate-400" : "text-slate-700"}`}>
                            {item.label}
                          </span>
                          <span className="text-xs text-slate-400 ml-2">{item.points} pts base</span>
                        </div>
                        {!isDefault && (
                          <button
                            type="button"
                            onClick={() => removeItem(area.key, item.key)}
                            className="ml-2 text-slate-300 hover:text-red-500 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add new item */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newItemLabel[area.key] || ""}
                    onChange={e => setNewItemLabel(prev => ({ ...prev, [area.key]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addItem(area.key)}
                    placeholder="Nuevo ítem..."
                    className="flex-1 text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
                  />
                  <input
                    type="number"
                    value={newItemPoints[area.key] || ""}
                    onChange={e => setNewItemPoints(prev => ({ ...prev, [area.key]: e.target.value }))}
                    placeholder="pts"
                    className="w-14 text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
                    min="1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addItem(area.key)}
                    disabled={!(newItemLabel[area.key] || "").trim()}
                    className="h-7 px-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(null)}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar configuración</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}