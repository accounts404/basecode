import React, { useState, useEffect, useMemo } from "react";
import { User } from "@/entities/User";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IdCard, Edit, Calendar, Gift, CheckCircle, AlertCircle, FileText, Stamp, ShieldCheck, Car, Contact, ExternalLink, Users, UserCheck, Clock2, Mail, Phone, Download, Search, X, Users2, DollarSign, Wand2, Eye, EyeOff } from "lucide-react";
import { format, differenceInYears, differenceInMonths, differenceInDays, addYears } from "date-fns";
import { es } from "date-fns/locale";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import RateHistoryManager from "../components/cleaners/RateHistoryManager";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";

const daysOfWeek = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo'
};

const defaultAvailability = {
  monday: { available: false, start_time: '', end_time: '' },
  tuesday: { available: false, start_time: '', end_time: '' },
  wednesday: { available: false, start_time: '', end_time: '' },
  thursday: { available: false, start_time: '', end_time: '' },
  friday: { available: false, start_time: '', end_time: '' },
  saturday: { available: false, start_time: '', end_time: '' }
};

function EditCleanerSheet({ cleaner, onSave, onCancel, allCleaners }) {
  const [formData, setFormData] = useState({
    display_name: cleaner.display_name || "", // Nuevo campo
    start_date: cleaner.start_date || "",
    birth_date: cleaner.birth_date || "",
    hr_notes: cleaner.hr_notes || "",
    emergency_contact_name: cleaner.emergency_contact_name || "",
    emergency_contact_phone: cleaner.emergency_contact_phone || "",
    employee_type: cleaner.employee_type || "casual",
    active: cleaner.active !== false,
    availability: cleaner.availability || defaultAvailability,
    color: cleaner.color || '#3b82f6', // Default to a shade of blue
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // This effect ensures that if the cleaner prop changes (e.g., when editing a different cleaner),
    // the formData state is updated accordingly.
    if (cleaner) {
      setFormData({
        display_name: cleaner.display_name || "", // Nuevo campo
        start_date: cleaner.start_date || "",
        birth_date: cleaner.birth_date || "",
        hr_notes: cleaner.hr_notes || "",
        emergency_contact_name: cleaner.emergency_contact_name || "",
        emergency_contact_phone: cleaner.emergency_contact_phone || "",
        employee_type: cleaner.employee_type || "casual",
        active: cleaner.active !== false,
        availability: cleaner.availability || defaultAvailability,
        color: cleaner.color || '#3b82f6',
      });
    }
  }, [cleaner]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(formData);
    setSaving(false);
  };

  const handleAvailabilityChange = (day, field, value) => {
    setFormData(prev => ({
      ...prev,
      availability: {
        ...prev.availability,
        [day]: {
          ...prev.availability[day],
          [field]: value
        }
      }
    }));
  };

  const handleGenerateRandomColor = () => {
    // Get colors already used by other cleaners, excluding the current cleaner's own color
    const usedColors = allCleaners
        .filter(c => c.id !== cleaner.id)
        .map(c => c.color)
        .filter(Boolean);

    let randomColor;
    let attempts = 0;
    const maxAttempts = 100; // To prevent infinite loops

    // Function to avoid colors that are too light to be visible on a white background
    const isColorTooLight = (hexColor) => {
        if (!hexColor) return true;
        const color = hexColor.substring(1); // Remove #
        if (color.length !== 6) return true;
        const r = parseInt(color.substring(0, 2), 16);
        const g = parseInt(color.substring(2, 4), 16);
        const b = parseInt(color.substring(4, 6), 16);
        // Using YIQ luminosity formula
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return yiq >= 200; // threshold for light colors
    };

    do {
        randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        attempts++;
    } while ((usedColors.includes(randomColor) || isColorTooLight(randomColor)) && attempts < maxAttempts);
    
    setFormData(prev => ({ ...prev, color: randomColor }));
  };

  return (
    <div className="max-h-[80vh] overflow-y-auto">
      <form onSubmit={handleSubmit} className="space-y-6 p-4">
        {/* NUEVO CAMPO: Display Name */}
        <div className="space-y-2">
            <Label htmlFor="display_name">Nombre Corto (para Horario)</Label>
            <Input
              id="display_name"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              placeholder="Ej: Dani H."
            />
            <p className="text-xs text-slate-500">Este nombre aparecerá en el calendario para una identificación rápida. Si se deja en blanco, se usará el nombre completo.</p>
        </div>

        {/* Row for Start Date and Color */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="start_date">Fecha de Inicio</Label>
            <Input
              id="start_date"
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="color">Color de Horario</Label>
            <div className="flex items-center gap-4">
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-16 h-10 p-1 cursor-pointer rounded-md border"
                />
                 <Button type="button" variant="outline" onClick={handleGenerateRandomColor} className="gap-2">
                    <Wand2 className="w-4 h-4" />
                    Generar Color
                </Button>
                <span className="text-sm text-slate-600 truncate">
                    {formData.color || 'Sin color asignado'}
                </span>
            </div>
            <p className="text-xs text-slate-500">Este color se usará para identificar los servicios en el horario.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="birth_date">Fecha de Nacimiento</Label>
          <Input
            id="birth_date"
            type="date"
            value={formData.birth_date}
            onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="employee_type">Tipo de Empleado</Label>
          <Select
            value={formData.employee_type}
            onValueChange={(value) => setFormData({ ...formData, employee_type: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona el tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="permanent">De Planta</SelectItem>
              <SelectItem value="casual">Casual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Availability Section */}
        <div className="space-y-4">
          <Label className="text-base font-semibold">Disponibilidad Semanal</Label>
          <div className="bg-slate-50 rounded-lg p-4 space-y-4">
            {Object.entries(daysOfWeek).map(([day, dayLabel]) => (
              <div key={day} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">{dayLabel}</Label>
                  <Switch
                    checked={formData.availability[day]?.available || false}
                    onCheckedChange={(checked) => handleAvailabilityChange(day, 'available', checked)}
                  />
                </div>
                {formData.availability[day]?.available && (
                  <div className="grid grid-cols-2 gap-2 ml-4">
                    <div>
                      <Label className="text-sm text-slate-600">Desde</Label>
                      <Input
                        type="time"
                        value={formData.availability[day]?.start_time || ''}
                        onChange={(e) => handleAvailabilityChange(day, 'start_time', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-slate-600">Hasta</Label>
                      <Input
                        type="time"
                        value={formData.availability[day]?.end_time || ''}
                        onChange={(e) => handleAvailabilityChange(day, 'end_time', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="emergency_contact_name">Nombre Contacto Emergencia</Label>
          <Input
            id="emergency_contact_name"
            value={formData.emergency_contact_name}
            onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
            placeholder="Nombre completo"
          />
        </div>
         <div className="space-y-2">
          <Label htmlFor="emergency_contact_phone">Teléfono Contacto Emergencia</Label>
          <Input
            id="emergency_contact_phone"
            type="tel"
            value={formData.emergency_contact_phone}
            onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
            placeholder="Número de teléfono"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="active">Limpiador Activo</Label>
          <Switch
            id="active"
            checked={formData.active}
            onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hr_notes">Notas Adicionales</Label>
          <Textarea
            id="hr_notes"
            value={formData.hr_notes}
            onChange={(e) => setFormData({ ...formData, hr_notes: e.target.value })}
            rows={5}
            placeholder="Añadir notas sobre el rendimiento, acuerdos, etc."
          />
        </div>
        <div className="flex justify-end gap-4 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// Availability Display Component
function AvailabilityDisplay({ availability }) {
  if (!availability) {
    return (
      <p className="text-sm text-slate-500">No configurada</p>
    );
  }

  const availableDays = Object.entries(availability).filter(([, info]) => info.available);

  if (availableDays.length === 0) {
    return (
      <p className="text-sm text-slate-500">Sin disponibilidad configurada</p>
    );
  }

  return (
    <div className="space-y-1">
      {availableDays.map(([day, info]) => (
        <div key={day} className="flex justify-between items-center text-sm">
          <span className="font-medium text-green-700">
            {daysOfWeek[day]}
          </span>
          <span className="text-slate-600">
            {info.start_time && info.end_time ? `${info.start_time} - ${info.end_time}` : 'Todo el día'}
          </span>
        </div>
      ))}
    </div>
  );
}

// Cleaner Card Component
function CleanerCard({ cleaner, onToggleActive, onEdit, onManageRates }) {
  const calculateTenure = (startDate) => {
    if (!startDate) return "N/A";
    const now = new Date();
    const start = new Date(startDate);
    const years = differenceInYears(now, start);
    const months = differenceInMonths(now, start) % 12;
    let result = "";
    if (years > 0) result += `${years} ${years === 1 ? 'año' : 'años'} `;
    if (months > 0) result += `${months} ${months === 1 ? 'mes' : 'meses'}`;
    return result.trim() || "Menos de un mes";
  };

  const calculateAge = (birthDate) => {
    if (!birthDate) return "";
    return `${differenceInYears(new Date(), new Date(birthDate))} años`;
  };

  const isBirthdayUpcoming = (birthDate) => {
    if (!birthDate) return false;
    const today = new Date();
    const birth = new Date(birthDate);
    const nextBirthday = addYears(new Date(today.getFullYear(), birth.getMonth(), birth.getDate()), today > new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
    const daysUntilBirthday = differenceInDays(nextBirthday, today);
    return daysUntilBirthday >= 0 && daysUntilBirthday <= 30;
  };
  
  const getEmployeeTypeBadge = (type) => {
    if (type === "permanent") {
      return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">De Planta</span>;
    }
    return <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">Casual</span>;
  };

  const getCurrentRate = (rateHistory) => {
    if (!rateHistory || rateHistory.length === 0) {
      return null;
    }
    const sorted = [...rateHistory].sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
    return sorted[0];
  };

  const currentRate = getCurrentRate(cleaner.rate_history);

  return (
    <Card className={`shadow-lg border-0 transition-all duration-200 hover:shadow-xl ${cleaner.active === false ? 'bg-gray-100 opacity-80' : 'bg-white'}`}>
      <Accordion type="single" collapsible>
        <AccordionItem value="cleaner-details" className="border-b-0">
          <div className="p-6">
            {/* Vista Compacta - Siempre Visible */}
            <div className="flex items-center gap-4 w-full mb-4">
              <div className="relative">
                <Avatar className="w-16 h-16 border-4 border-slate-200 shadow-md" style={{ borderColor: cleaner.color || '#3b82f6' }}>
                  <AvatarImage src={cleaner.profile_photo_url} alt={cleaner.full_name} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 text-xl font-semibold">
                    {cleaner.full_name?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {isBirthdayUpcoming(cleaner.birth_date) && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center shadow-lg">
                    <Gift className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h3 className="text-xl font-bold text-slate-900 truncate">
                    {cleaner.invoice_name || cleaner.full_name}
                  </h3>
                  {getEmployeeTypeBadge(cleaner.employee_type)}
                  {isBirthdayUpcoming(cleaner.birth_date) && (
                    <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full animate-pulse">
                      🎂 Cumpleaños próximo
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                  <p className="flex items-center gap-2 text-sm text-slate-600 truncate">
                    <Mail className="w-4 h-4 flex-shrink-0 text-slate-400" />
                    <span className="truncate">{cleaner.email || 'Email no especificado'}</span>
                  </p>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <DollarSign className="w-4 h-4 text-green-600" />
                    {currentRate ? (
                      <span className="font-semibold text-green-700">${currentRate.rate.toFixed(2)}/hr</span>
                    ) : (
                      <span className="text-slate-500 italic">Sin tarifa</span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <Switch
                    checked={cleaner.active !== false}
                    onCheckedChange={() => onToggleActive(cleaner)}
                    className="data-[state=checked]:bg-green-600"
                  />
                  <span className="text-xs text-slate-500 mt-1 font-medium">
                    {cleaner.active !== false ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onManageRates(cleaner)}
                  className="hover:bg-green-50 hover:border-green-300"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Tarifas
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(cleaner)}
                  className="hover:bg-blue-50 hover:border-blue-300"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              </div>
            </div>

            {/* Botón para expandir/contraer */}
            <AccordionTrigger className="w-full py-3 px-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors">
              <span className="text-sm font-medium text-slate-700">
                Ver detalles completos del empleado
              </span>
            </AccordionTrigger>
          </div>

          {/* Contenido Expandible */}
          <AccordionContent className="px-6 pb-6">
            <div className="bg-slate-50/70 rounded-lg p-6 border border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Columna 1: Info General */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-slate-800 border-b border-slate-300 pb-2">
                    Información General
                  </h4>
                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 mt-1 text-blue-500" />
                    <div>
                      <p className="font-medium text-slate-700">Fecha de Inicio</p>
                      <p className="text-slate-600">
                        {cleaner.start_date ? format(new Date(cleaner.start_date), "d MMM yyyy", { locale: es }) : "No especificada"}
                      </p>
                      <p className="text-xs text-slate-500 bg-blue-50 px-2 py-1 rounded-full inline-block mt-1">
                        Antigüedad: {calculateTenure(cleaner.start_date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Gift className="w-5 h-5 mt-1 text-purple-500" />
                    <div>
                      <p className="font-medium text-slate-700">Cumpleaños</p>
                      <p className="text-slate-600">
                        {cleaner.birth_date ? format(new Date(cleaner.birth_date), "d 'de' MMMM", { locale: es }) : "No especificada"}
                      </p>
                      <p className="text-xs text-slate-500 bg-purple-50 px-2 py-1 rounded-full inline-block mt-1">
                        {calculateAge(cleaner.birth_date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Contact className="w-5 h-5 mt-1 text-orange-500" />
                    <div>
                      <p className="font-medium text-slate-700">Contacto de Emergencia</p>
                      {cleaner.emergency_contact_name || cleaner.emergency_contact_phone ? (
                          <>
                              <p className="text-slate-600 font-medium">{cleaner.emergency_contact_name}</p>
                              <p className="text-sm text-slate-500">{cleaner.emergency_contact_phone}</p>
                          </>
                      ) : (
                          <p className="text-sm text-slate-500 italic">No especificado</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Columna 2: Disponibilidad y Documentos */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-slate-800 border-b border-slate-300 pb-2">
                    Disponibilidad & Documentos
                  </h4>
                  <div className="flex items-start gap-3">
                    <Clock2 className="w-5 h-5 mt-1 text-green-500" />
                    <div className="flex-1">
                      <p className="font-medium text-slate-700 mb-2">Disponibilidad Semanal</p>
                      <AvailabilityDisplay availability={cleaner.availability} />
                    </div>
                  </div>
                   <div className="space-y-3">
                     <h5 className="font-medium text-slate-700 flex items-center gap-2">
                       <FileText className="w-5 h-5 text-indigo-500" />
                       Documentos Adjuntos
                     </h5>
                     <div className="grid grid-cols-1 gap-2 text-sm">
                        <DocumentLink url={cleaner.passport_url} label="Pasaporte" icon={Contact} />
                        <DocumentLink url={cleaner.visa_url} label="Visa" icon={Stamp} />
                        <DocumentLink url={cleaner.police_check_url} label="Police Check" icon={ShieldCheck} />
                        <DocumentLink url={cleaner.drivers_license_url} label="Licencia" icon={Car} />
                     </div>
                  </div>
                </div>

                {/* Columna 3: Notas */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-slate-800 border-b border-slate-300 pb-2">
                    Notas y Observaciones
                  </h4>
                  {cleaner.hr_notes ? (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm font-medium text-yellow-800 mb-2 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Notas de RRHH:
                      </p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {cleaner.hr_notes}
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-100 border border-slate-200 rounded-lg text-center">
                      <p className="text-sm text-slate-500 italic">
                        No hay notas adicionales registradas
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}

export default function LimpiadoresPage() {
  const [user, setUser] = useState(null);
  const [cleaners, setCleaners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCleaner, setEditingCleaner] = useState(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [notification, setNotification] = useState({ type: "", message: "" });
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingRatesFor, setEditingRatesFor] = useState(null);
  const [isRateSheetOpen, setIsRateSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false); // New state for showing inactive cleaners

  const loadAllRecords = async (entity, sortField = '-created_date') => {
    const BATCH_SIZE = 5000;
    let allRecords = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await entity.list(sortField, BATCH_SIZE, skip);
      const batchArray = Array.isArray(batch) ? batch : [];
      
      allRecords = [...allRecords, ...batchArray];
      
      if (batchArray.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        skip += BATCH_SIZE;
      }
    }

    return allRecords;
  };

  const loadCleaners = async () => {
    setLoading(true);
    try {
      const allUsers = await loadAllRecords(User, '-created_date');
      setCleaners(allUsers.filter(u => u.role !== 'admin') || []);
    } catch (error) {
      console.error("Error cargando limpiadores:", error);
      setCleaners([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    const checkUserAndLoad = async () => {
      try {
        const userData = await User.me();
        setUser(userData);
        if (userData.role === 'admin') {
          loadCleaners();
        } else {
          setLoading(false);
        }
      } catch (e) {
        setLoading(false);
      }
    };
    checkUserAndLoad();
  }, []);

  const handleSaveCleaner = async (data) => {
    setNotification({ type: "", message: "" });
    try {
      await User.update(editingCleaner.id, data);
      setNotification({ type: "success", message: "¡Datos del limpiador actualizados!" });
      setIsSheetOpen(false);
      setEditingCleaner(null);
      loadCleaners();
    } catch (error) {
      setNotification({ type: "error", message: "Error guardando los datos." });
      console.error("Error guardando limpiador:", error);
    }
  };

  const handleSaveRates = async (cleanerWithNewRates) => {
    setSaving(true);
    setNotification({ type: "", message: "" });
    try {
      await User.update(cleanerWithNewRates.id, { rate_history: cleanerWithNewRates.rate_history });
      setNotification({ type: "success", message: `¡Tarifas de ${cleanerWithNewRates.full_name} actualizadas!` });
      setIsRateSheetOpen(false);
      setEditingRatesFor(null);
      loadCleaners();
    } catch (error) {
      setNotification({ type: "error", message: "Error guardando las tarifas." });
      console.error("Error guardando tarifas:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cleaner) => {
    setNotification({ type: "", message: "" });
    try {
      await User.update(cleaner.id, { active: !cleaner.active });
      setNotification({
        type: "success",
        message: `${cleaner.full_name} ha sido ${!cleaner.active ? 'activado' : 'desactivado'}.`
      });
      loadCleaners();
    } catch (error) {
      setNotification({ type: "error", message: "Error al cambiar el estado del limpiador." });
      console.error("Error updating cleaner status:", error);
    }
  };

  const clearSearch = () => {
    setSearchTerm("");
  };

  // Filter cleaners based on active tab, search term, and active status
  const filteredCleaners = useMemo(() => {
    return cleaners.filter((cleaner) => {
      // Filter by active status
      if (!showInactive && cleaner.active === false) {
        return false;
      }

      // Filter by tab
      const tabMatch = (
        activeTab === "all" ||
        (activeTab === "permanent" && cleaner.employee_type === "permanent") ||
        (activeTab === "casual" && (cleaner.employee_type === "casual" || !cleaner.employee_type))
      );

      if (!tabMatch) return false;

      // Filter by search term
      if (!searchTerm) return true;

      const searchLower = searchTerm.toLowerCase();
      return (
        (cleaner.full_name || '').toLowerCase().includes(searchLower) ||
        (cleaner.invoice_name || '').toLowerCase().includes(searchLower) ||
        (cleaner.email || '').toLowerCase().includes(searchLower) ||
        (cleaner.display_name || '').toLowerCase().includes(searchLower)
      );
    });
  }, [cleaners, showInactive, activeTab, searchTerm]);

  // Count cleaners by type (based on the unfiltered list)
  const permanentCount = cleaners.filter(c => c.employee_type === "permanent").length;
  const casualCount = cleaners.filter(c => c.employee_type === "casual" || !c.employee_type).length;
  
  const getEmployeeTypeLabel = (type) => {
    switch (type) {
      case "permanent":
        return "De Planta";
      case "casual":
        return "Casual";
      default:
        return "Casual"; // Default for existing records
    }
  };

  const handleDownloadCleaners = () => {
    if (filteredCleaners.length === 0) {
      alert("No hay limpiadores para descargar con los filtros actuales.");
      return;
    }

    const headers = [
      "Nombre Completo",
      "Nombre Corto", // New header for display_name
      "Nombre para Facturas",
      "Email",
      "Teléfono",
      "Tipo de Empleado",
      "Fecha de Inicio",
      "Antigüedad",
      "Fecha de Nacimiento",
      "Edad",
      "Contacto de Emergencia - Nombre",
      "Contacto de Emergencia - Teléfono",
      "Estado",
      "Notas de RH",
      "Color de Horario"
    ];

    const escapeCsvCell = (cell) => {
      if (cell === null || cell === undefined) return '';
      const strCell = String(cell);
      if (strCell.includes(',') || strCell.includes('"') || strCell.includes('\n')) {
        return `"${strCell.replace(/"/g, '""')}"`;
      }
      return strCell;
    };
    
    // Calculate tenure for download
    const calculateTenureForDownload = (startDate) => {
      if (!startDate) return "N/A";
      const now = new Date();
      const start = new Date(startDate);
      const years = differenceInYears(now, start);
      const months = differenceInMonths(now, start) % 12;
      let result = "";
      if (years > 0) result += `${years} ${years === 1 ? 'año' : 'años'} `;
      if (months > 0) result += `${months} ${months === 1 ? 'mes' : 'meses'}`;
      return result.trim() || "Menos de un mes";
    };
    
    // Calculate age for download
    const calculateAgeForDownload = (birthDate) => {
      if (!birthDate) return "";
      return `${differenceInYears(new Date(), new Date(birthDate))} años`;
    };

    const rows = filteredCleaners.map(cleaner => [
      escapeCsvCell(cleaner.full_name || ''),
      escapeCsvCell(cleaner.display_name || ''), // New field for CSV
      escapeCsvCell(cleaner.invoice_name || ''),
      escapeCsvCell(cleaner.email || ''),
      escapeCsvCell(cleaner.mobile_number || ''),
      escapeCsvCell(getEmployeeTypeLabel(cleaner.employee_type)),
      escapeCsvCell(cleaner.start_date ? format(new Date(cleaner.start_date), "d/MM/yyyy") : ''),
      escapeCsvCell(calculateTenureForDownload(cleaner.start_date)),
      escapeCsvCell(cleaner.birth_date ? format(new Date(cleaner.birth_date), "d/MM/yyyy") : ''),
      escapeCsvCell(calculateAgeForDownload(cleaner.birth_date)),
      escapeCsvCell(cleaner.emergency_contact_name || ''),
      escapeCsvCell(cleaner.emergency_contact_phone || ''),
      escapeCsvCell(cleaner.active !== false ? 'Activo' : 'Inactivo'),
      escapeCsvCell(cleaner.hr_notes || ''),
      escapeCsvCell(cleaner.color || '')
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `limpiadores_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-8">Cargando...</div>;
  if (user?.role !== 'admin') return <div className="p-8">Acceso denegado.</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 md:p-8">
      <div className="w-full">
        <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                <Users2 className="w-8 h-8 text-blue-600" />
                Panel de Equipo de Limpieza
              </h1>
              <p className="text-slate-600">Administra la información de tu equipo de forma profesional.</p>
            </div>
            <Button onClick={handleDownloadCleaners} disabled={filteredCleaners.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Descargar Limpiadores
            </Button>
          </div>

        {notification.message && (
          <Alert className={`mb-4 ${notification.type === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            {notification.type === 'success' ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-500" />}
            <AlertDescription className={notification.type === 'success' ? 'text-green-800' : 'text-red-800'}>
              {notification.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Search Bar and Show Inactive Toggle */}
        <Card className="mb-6 shadow-lg border-0">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar limpiadores por nombre, nombre corto o email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-10 h-12"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSearch}
                    className="absolute right-2 top-2 h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              <Button
                  variant="outline"
                  onClick={() => setShowInactive(!showInactive)}
                  className="flex items-center gap-2 h-12"
              >
                  {showInactive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showInactive ? 'Ocultar Inactivos' : 'Mostrar Inactivos'}
              </Button>
              <div className="text-sm text-slate-600 md:self-center">
                {filteredCleaners.length} de {cleaners.length} limpiadores
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for employee types */}
        <div className="mb-6">
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-6 py-3 font-medium text-sm transition-colors duration-200 border-b-2 ${
                activeTab === "all"
                  ? "border-blue-600 text-blue-600 bg-blue-50"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Todos ({cleaners.length})
              </div>
            </button>
            <button
              onClick={() => setActiveTab("permanent")}
              className={`px-6 py-3 font-medium text-sm transition-colors duration-200 border-b-2 ${
                activeTab === "permanent"
                  ? "border-green-600 text-green-600 bg-green-50"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                De Planta ({permanentCount})
              </div>
            </button>
            <button
              onClick={() => setActiveTab("casual")}
              className={`px-6 py-3 font-medium text-sm transition-colors duration-200 border-b-2 ${
                activeTab === "casual"
                  ? "border-blue-600 text-blue-600 bg-blue-50"
                  : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Casuales ({casualCount})
              </div>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {filteredCleaners.map((cleaner) => (
            <CleanerCard 
              key={cleaner.id} 
              cleaner={cleaner}
              onToggleActive={handleToggleActive}
              onEdit={() => {
                setEditingCleaner(cleaner);
                setIsSheetOpen(true);
              }}
              onManageRates={() => {
                setEditingRatesFor(cleaner);
                setIsRateSheetOpen(true);
              }}
            />
          ))}
        </div>

        {filteredCleaners.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            {searchTerm ? (
              <>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">
                  No se encontraron resultados
                </h3>
                <p className="text-slate-500 mb-4">
                  No hay limpiadores que coincidan con "{searchTerm}".
                </p>
                <Button onClick={clearSearch} variant="outline">Limpiar búsqueda</Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">
                  No hay limpiadores {activeTab === "permanent" ? "de planta" : activeTab === "casual" ? "casuales" : ""}
                </h3>
                <p className="text-slate-500">
                  {activeTab === "all" && !showInactive
                    ? "No hay limpiadores activos registrados."
                    : activeTab === "all" && showInactive
                    ? "No hay limpiadores registrados, incluyendo inactivos."
                    : `No hay limpiadores ${activeTab === "permanent" ? "de planta" : "casuales"} ${!showInactive ? 'activos ' : ''}registrados.`
                  }
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Editar Detalles de {editingCleaner?.full_name}</SheetTitle>
            <SheetDescription>
              Modifica la información personal y de trabajo del limpiador.
            </SheetDescription>
          </SheetHeader>
          {editingCleaner && (
            <EditCleanerSheet
              cleaner={editingCleaner}
              onSave={handleSaveCleaner}
              onCancel={() => setIsSheetOpen(false)}
              allCleaners={cleaners} // Pass the list of all cleaners for uniqueness check
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={isRateSheetOpen} onOpenChange={setIsRateSheetOpen}>
        <SheetContent className="sm:max-w-[600px]">
          <SheetHeader>
            <SheetTitle>Gestionar Tarifas de {editingRatesFor?.full_name}</SheetTitle>
            <SheetDescription>
              Añade nuevas tarifas y consulta el historial de aumentos.
            </SheetDescription>
          </SheetHeader>
          {editingRatesFor && (
            <RateHistoryManager
              cleaner={editingRatesFor}
              onSave={handleSaveRates}
              onCancel={() => setIsRateSheetOpen(false)}
              saving={saving}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DocumentLink({ url, label, icon: Icon }) {
  if (!url) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="w-4 h-4" />
        <span>{label} (No)</span>
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline"
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}