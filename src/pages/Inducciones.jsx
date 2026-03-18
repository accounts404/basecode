import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  FileText, Video, BookOpen, GripVertical, ExternalLink, X, Upload
} from "lucide-react";

const CATEGORIES = [
  { value: "cleaning_standards", label: "🧹 Estándares de Limpieza", hasAreas: true },
  { value: "uniform_presentation", label: "👔 Uniforme y Presentación", hasAreas: false },
  { value: "punctuality_clockin", label: "⏰ Puntualidad y Clock-In/Out", hasAreas: false },
  { value: "property_access", label: "🔑 Acceso a Propiedades", hasAreas: false },
  { value: "pets_protocol", label: "🐾 Protocolo con Mascotas", hasAreas: false },
  { value: "safety_health", label: "🦺 Seguridad y Salud", hasAreas: false },
  { value: "app_usage", label: "📱 Uso de la App", hasAreas: false },
  { value: "hours_payments", label: "💰 Horas y Pagos", hasAreas: false },
  { value: "general_policies", label: "📋 Políticas Generales", hasAreas: false },
];

const CLEANING_AREAS = [
  { value: "bathrooms", label: "🚿 Baños" },
  { value: "floors", label: "🪣 Pisos" },
  { value: "kitchen_pantry", label: "🍳 Cocina y Despensa" },
  { value: "dusting_wiping", label: "🧽 Polvo / Wiping / Tidy Up" },
  { value: "laundry", label: "👕 Lavandería" },
  { value: "other_areas", label: "🏠 Otras Áreas" },
  { value: "general", label: "📌 General" },
];

function getCategoryLabel(value) {
  return CATEGORIES.find(c => c.value === value)?.label || value;
}
function getAreaLabel(value) {
  return CLEANING_AREAS.find(a => a.value === value)?.label || value;
}

const EMPTY_MODULE = {
  title: "",
  category: "cleaning_standards",
  cleaning_area: "general",
  description: "",
  content_text: "",
  video_links: [],
  pdf_urls: [],
  order: 0,
  is_mandatory: true,
  active: true,
};

export default function Inducciones() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("cleaning_standards");
  const [expandedAreas, setExpandedAreas] = useState({});
  const [showDialog, setShowDialog] = useState(false);
  const [editingModule, setEditingModule] = useState(null);
  const [form, setForm] = useState(EMPTY_MODULE);
  const [saving, setSaving] = useState(false);
  const [newVideoTitle, setNewVideoTitle] = useState("");
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [newPdfTitle, setNewPdfTitle] = useState("");
  const [newPdfUrl, setNewPdfUrl] = useState("");
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    setLoading(true);
    const data = await base44.entities.InductionModule.list('-order', 200);
    setModules(data);
    setLoading(false);
  };

  const openCreate = (category, area) => {
    setEditingModule(null);
    setForm({ ...EMPTY_MODULE, category: category || activeCategory, cleaning_area: area || "general" });
    setNewVideoTitle(""); setNewVideoUrl(""); setNewPdfTitle(""); setNewPdfUrl("");
    setShowDialog(true);
  };

  const openEdit = (mod) => {
    setEditingModule(mod);
    setForm({ ...mod });
    setNewVideoTitle(""); setNewVideoUrl(""); setNewPdfTitle(""); setNewPdfUrl("");
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    if (editingModule) {
      await base44.entities.InductionModule.update(editingModule.id, form);
    } else {
      await base44.entities.InductionModule.create(form);
    }
    await loadModules();
    setShowDialog(false);
    setSaving(false);
  };

  const handleDelete = async (mod) => {
    await base44.entities.InductionModule.delete(mod.id);
    setDeleteConfirm(null);
    await loadModules();
  };

  const addVideo = () => {
    if (!newVideoUrl.trim()) return;
    setForm(f => ({ ...f, video_links: [...(f.video_links || []), { title: newVideoTitle, url: newVideoUrl }] }));
    setNewVideoTitle(""); setNewVideoUrl("");
  };

  const removeVideo = (idx) => {
    setForm(f => ({ ...f, video_links: f.video_links.filter((_, i) => i !== idx) }));
  };

  const addPdfManual = () => {
    if (!newPdfUrl.trim()) return;
    setForm(f => ({ ...f, pdf_urls: [...(f.pdf_urls || []), { title: newPdfTitle, url: newPdfUrl }] }));
    setNewPdfTitle(""); setNewPdfUrl("");
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPdf(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, pdf_urls: [...(f.pdf_urls || []), { title: file.name, url: file_url }] }));
    setUploadingPdf(false);
  };

  const removePdf = (idx) => {
    setForm(f => ({ ...f, pdf_urls: f.pdf_urls.filter((_, i) => i !== idx) }));
  };

  const toggleArea = (area) => {
    setExpandedAreas(prev => ({ ...prev, [area]: !prev[area] }));
  };

  // Modules for current category
  const catModules = modules.filter(m => m.category === activeCategory && m.active !== false);
  const currentCatDef = CATEGORIES.find(c => c.value === activeCategory);

  // For cleaning_standards: group by area
  const modulesByArea = {};
  if (activeCategory === "cleaning_standards") {
    CLEANING_AREAS.forEach(a => {
      modulesByArea[a.value] = catModules.filter(m => m.cleaning_area === a.value);
    });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📚 Inducciones</h1>
            <p className="text-slate-500 text-sm mt-0.5">Gestiona los módulos y contenidos de inducción para limpiadores</p>
          </div>
          <Button onClick={() => openCreate()} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" /> Nuevo Módulo
          </Button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Sidebar de categorías */}
        <div className="w-64 bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0">
          <div className="p-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Categorías</p>
            {CATEGORIES.map(cat => {
              const count = modules.filter(m => m.category === cat.value && m.active !== false).length;
              return (
                <button
                  key={cat.value}
                  onClick={() => setActiveCategory(cat.value)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 flex items-center justify-between transition-colors text-sm ${
                    activeCategory === cat.value
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span>{cat.label}</span>
                  {count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      activeCategory === cat.value ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
                    }`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Contenido principal */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">{getCategoryLabel(activeCategory)}</h2>
              <Button variant="outline" size="sm" onClick={() => openCreate(activeCategory)}>
                <Plus className="w-4 h-4 mr-1" /> Agregar módulo
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">Cargando...</div>
            ) : activeCategory === "cleaning_standards" ? (
              // Vista por áreas para estándares de limpieza
              <div className="space-y-3">
                {CLEANING_AREAS.map(area => {
                  const areaMods = modulesByArea[area.value] || [];
                  const isExpanded = expandedAreas[area.value] !== false; // default expanded
                  return (
                    <div key={area.value} className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50"
                        onClick={() => toggleArea(area.value)}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                          <span className="font-medium text-slate-700">{area.label}</span>
                          <span className="text-xs text-slate-400">({areaMods.length} módulos)</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={e => { e.stopPropagation(); openCreate("cleaning_standards", area.value); }}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Plus className="w-3 h-3 mr-1" /> Agregar
                        </Button>
                      </div>
                      {isExpanded && (
                        <div className="px-4 pb-3 space-y-2">
                          {areaMods.length === 0 ? (
                            <p className="text-sm text-slate-400 italic py-2">Sin módulos. Agrega el primero.</p>
                          ) : areaMods.map(mod => (
                            <ModuleCard key={mod.id} mod={mod} onEdit={openEdit} onDelete={setDeleteConfirm} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              // Vista normal para otras categorías
              <div className="space-y-3">
                {catModules.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p>Sin módulos en esta categoría.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => openCreate(activeCategory)}>
                      <Plus className="w-4 h-4 mr-1" /> Agregar primer módulo
                    </Button>
                  </div>
                ) : catModules.map(mod => (
                  <ModuleCard key={mod.id} mod={mod} onEdit={openEdit} onDelete={setDeleteConfirm} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialog crear/editar módulo */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingModule ? "Editar Módulo" : "Nuevo Módulo"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Categoría</label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.category === "cleaning_standards" && (
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Área de limpieza</label>
                  <Select value={form.cleaning_area} onValueChange={v => setForm(f => ({ ...f, cleaning_area: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLEANING_AREAS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Título *</label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ej: Cómo limpiar un baño correctamente"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Descripción breve</label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Resumen corto del módulo"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Contenido / Instrucciones</label>
              <Textarea
                value={form.content_text}
                onChange={e => setForm(f => ({ ...f, content_text: e.target.value }))}
                placeholder="Escribe aquí el contenido detallado, pasos, instrucciones..."
                className="min-h-[120px]"
              />
            </div>

            {/* Videos */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block flex items-center gap-1">
                <Video className="w-4 h-4" /> Videos
              </label>
              <div className="space-y-2">
                {(form.video_links || []).map((v, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                    <Video className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="text-sm flex-1 truncate">{v.title || v.url}</span>
                    <a href={v.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-600">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => removeVideo(idx)} className="text-red-400 hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newVideoTitle}
                    onChange={e => setNewVideoTitle(e.target.value)}
                    placeholder="Título (opcional)"
                    className="w-1/3"
                  />
                  <Input
                    value={newVideoUrl}
                    onChange={e => setNewVideoUrl(e.target.value)}
                    placeholder="URL del video (YouTube, Vimeo...)"
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addVideo}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* PDFs */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block flex items-center gap-1">
                <FileText className="w-4 h-4" /> Documentos PDF
              </label>
              <div className="space-y-2">
                {(form.pdf_urls || []).map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />
                    <span className="text-sm flex-1 truncate">{p.title || p.url}</span>
                    <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-600">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => removePdf(idx)} className="text-red-400 hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {/* Subir PDF */}
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:bg-slate-50 flex-shrink-0">
                    <Upload className="w-4 h-4" />
                    {uploadingPdf ? "Subiendo..." : "Subir PDF"}
                    <input type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} disabled={uploadingPdf} />
                  </label>
                  <span className="text-slate-400 text-xs">o pega un link:</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newPdfTitle}
                    onChange={e => setNewPdfTitle(e.target.value)}
                    placeholder="Título (opcional)"
                    className="w-1/3"
                  />
                  <Input
                    value={newPdfUrl}
                    onChange={e => setNewPdfUrl(e.target.value)}
                    placeholder="URL del PDF"
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addPdfManual}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.title.trim()} className="bg-blue-600 hover:bg-blue-700">
              {saving ? "Guardando..." : editingModule ? "Guardar cambios" : "Crear módulo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar módulo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">Esta acción no se puede deshacer. ¿Confirmas que deseas eliminar <strong>{deleteConfirm?.title}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => handleDelete(deleteConfirm)}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModuleCard({ mod, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const videoCount = (mod.video_links || []).length;
  const pdfCount = (mod.pdf_urls || []).length;

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-800 text-sm">{mod.title}</span>
            {!mod.is_mandatory && <Badge variant="outline" className="text-xs">Opcional</Badge>}
          </div>
          {mod.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{mod.description}</p>}
          <div className="flex items-center gap-3 mt-1">
            {videoCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-500">
                <Video className="w-3 h-3" /> {videoCount} video{videoCount > 1 ? "s" : ""}
              </span>
            )}
            {pdfCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-orange-500">
                <FileText className="w-3 h-3" /> {pdfCount} PDF{pdfCount > 1 ? "s" : ""}
              </span>
            )}
            {mod.content_text && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <BookOpen className="w-3 h-3" /> Contenido
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {(mod.content_text || videoCount > 0 || pdfCount > 0) && (
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="text-slate-400">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onEdit(mod)} className="text-slate-400 hover:text-blue-600">
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(mod)} className="text-slate-400 hover:text-red-600">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          {mod.content_text && (
            <div className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3">
              {mod.content_text}
            </div>
          )}
          {videoCount > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Videos:</p>
              <div className="space-y-1">
                {mod.video_links.map((v, i) => (
                  <a
                    key={i}
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                  >
                    <Video className="w-3.5 h-3.5" />
                    {v.title || v.url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {pdfCount > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Documentos:</p>
              <div className="space-y-1">
                {mod.pdf_urls.map((p, i) => (
                  <a
                    key={i}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {p.title || p.url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}