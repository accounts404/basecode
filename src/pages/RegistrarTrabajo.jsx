
import React, { useState, useEffect, useCallback } from "react";
import { User } from "@/entities/User";
import { Client } from "@/entities/Client";
import { WorkEntry } from "@/entities/WorkEntry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles, Calendar, Clock, DollarSign, CheckCircle, AlertCircle, Users, FileText, TrendingUp, Info } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import ClientSearchCombobox from "../components/work/ClientSearchCombobox";

const ACTIVITIES = [
  { value: 'domestic', label: 'Doméstico' },
  { value: 'commercial', label: 'Comercial' },
  { value: 'training', label: 'Entrenamiento' }, // New activity type for client_type 'training'
  { value: 'windows', label: 'Ventanas' },
  { value: 'steam_vacuum', label: 'Vapor/Aspirado' },
  { value: 'entrenamiento', label: 'Entrenamiento (Capacitación)' }, // Existing 'entrenamiento' activity with updated label
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'inspecciones', label: 'Inspecciones' },
  { value: 'otros', label: 'Otros' }
];

const FIXED_AMOUNT_ACTIVITIES = ["otros", "gasolina", "inspecciones"];

const VALID_HOUR_DECIMALS = [0, 0.25, 0.5, 0.75];

const findRateForDate = (rateHistory, workDate) => {
  if (!rateHistory || rateHistory.length === 0 || !workDate) {
    return "";
  }
  const targetDate = new Date(workDate);
  
  const applicableRates = rateHistory
    .filter(r => new Date(r.effective_date) <= targetDate)
    .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));

  return applicableRates.length > 0 ? applicableRates[0].rate : "";
};

export default function RegistrarTrabajoPage() {
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [formData, setFormData] = useState({
    client_id: "",
    client_name: "",
    work_date: format(new Date(), 'yyyy-MM-dd'),
    hours: "",
    activity: "",
    other_activity: "",
    hourly_rate: "",
    fixed_amount: ""
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [hoursError, setHoursError] = useState("");
  const [rateHistory, setRateHistory] = useState([]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const userData = await User.me();
      setUser(userData);
      setRateHistory(userData.rate_history || []);
      
      // Check if user is active
      if (userData.active === false) {
        return; // Don't load clients if user is inactive
      }
      
      try {
        const clientsList = await Client.list();
        setClients(clientsList.filter(client => client.active !== false));
      } catch (clientError) {
        console.error("Error loading clients:", clientError);
        setClients([]);
      }
    } catch (error) {
      setError("Error cargando datos iniciales");
      console.error("Error loading initial data:", error);
    }
  };

  const handleDateChange = useCallback((date) => {
    const rate = findRateForDate(rateHistory, date);
    setFormData(prev => ({ 
      ...prev, 
      work_date: date,
      hourly_rate: rate !== "" ? String(rate) : prev.hourly_rate 
    }));
  }, [rateHistory]);

  useEffect(() => {
    if (formData.work_date && rateHistory.length > 0) {
      handleDateChange(formData.work_date);
    }
  }, [formData.work_date, rateHistory, handleDateChange]);

  const validateHours = (value) => {
    if (!value || value === "") {
      setHoursError("");
      return true;
    }
    
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) {
      setHoursError("Por favor ingresa un número válido de horas");
      return false;
    }
    
    const decimal = Math.round((num % 1) * 100) / 100;
    const isValidDecimal = VALID_HOUR_DECIMALS.includes(decimal);
    
    if (!isValidDecimal) {
      setHoursError("Solo se permiten decimales .00, .25, .50 o .75");
      return false;
    }
    
    setHoursError("");
    return true;
  };

  const handleHoursChange = (e) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, hours: value }));
    validateHours(value);
  };

  const handleActivityChange = (value) => {
    const isFixedAmount = FIXED_AMOUNT_ACTIVITIES.includes(value);

    setFormData(prev => ({ 
      ...prev, 
      activity: value,
      hours: isFixedAmount ? "1" : prev.hours, // Set hours to 1 for fixed amount activities
      fixed_amount: !isFixedAmount ? "" : prev.fixed_amount, // Clear fixed amount if not a fixed activity
      hourly_rate: isFixedAmount ? "" : findRateForDate(rateHistory, prev.work_date) // Clear hourly rate if fixed, or set based on date for others
    }));

    if (isFixedAmount) {
      setHoursError(""); // Clear hours error for fixed amount activities
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const isFixed = FIXED_AMOUNT_ACTIVITIES.includes(formData.activity);

    try {
      if (!isFixed) {
        // Validation for regular activities (hourly)
        if (!formData.client_id || !formData.hours || !formData.activity || !formData.hourly_rate) {
          throw new Error("Por favor completa todos los campos requeridos");
        }
        if (!validateHours(formData.hours) || hoursError) {
          throw new Error("Las horas trabajadas solo pueden tener decimales .00, .25, .50, .75");
        }
      } else {
        // Validation for fixed-amount activities
        if (!formData.client_id || !formData.activity || !formData.fixed_amount) {
          throw new Error("Por favor completa todos los campos requeridos para esta actividad.");
        }
        if (formData.activity === 'otros' && formData.other_activity.trim() === '') {
            throw new Error("Para la actividad 'Otros', la descripción es obligatoria.");
        }
      }

      let hours, hourlyRate, totalAmount;

      if (isFixed) {
        // For fixed-amount activities, use fixed amount logic
        hours = 1; // Fixed to 1 hour for system consistency
        totalAmount = parseFloat(formData.fixed_amount);
        hourlyRate = totalAmount; // hourly_rate = total_amount since hours = 1
      } else {
        // For regular activities, use hours * rate
        hours = parseFloat(formData.hours);
        hourlyRate = parseFloat(formData.hourly_rate);
        totalAmount = hours * hourlyRate;
      }

      const workEntry = {
        cleaner_id: user.id,
        cleaner_name: user.invoice_name || user.full_name, // Prioritizes invoice_name
        client_id: formData.client_id,
        client_name: formData.client_name,
        work_date: formData.work_date,
        hours: hours,
        activity: formData.activity,
        other_activity: formData.activity === 'otros' ? formData.other_activity.trim() : "",
        hourly_rate: hourlyRate,
        total_amount: totalAmount,
        period: generatePeriod(formData.work_date),
        invoiced: false
      };

      await WorkEntry.create(workEntry);
      
      setSuccess(true);
      setFormData({
        client_id: "",
        client_name: "",
        work_date: format(new Date(), 'yyyy-MM-dd'),
        hours: "",
        activity: "",
        other_activity: "",
        hourly_rate: "",
        fixed_amount: ""
      });
      setHoursError("");

      setTimeout(() => setSuccess(false), 5000);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const generatePeriod = (workDate) => {
    const date = new Date(workDate);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    
    if (day <= 15) {
      return `${year}-${month.toString().padStart(2, '0')}-1st`;
    } else {
      return `${year}-${month.toString().padStart(2, '0')}-2nd`;
    }
  };

  const handleClientSelect = (client) => {
    // Determine the default activity based on client_type
    let defaultActivity = "";
    if (client?.client_type === 'domestic') {
        defaultActivity = 'domestic';
    } else if (client?.client_type === 'commercial') {
        defaultActivity = 'commercial';
    } else if (client?.client_type === 'training') {
        defaultActivity = 'training';
    }

    setFormData(prev => ({
      ...prev,
      client_id: client.id,
      client_name: client.name,
      // Automatically set activity based on client type
      activity: defaultActivity,
      // Clear other_activity and fixed_amount if activity changes to a non-fixed one
      other_activity: defaultActivity !== 'otros' ? "" : prev.other_activity,
      fixed_amount: !FIXED_AMOUNT_ACTIVITIES.includes(defaultActivity) ? "" : prev.fixed_amount,
      // Re-evaluate hourly_rate if it's not a fixed amount activity
      hourly_rate: !FIXED_AMOUNT_ACTIVITIES.includes(defaultActivity) ? findRateForDate(rateHistory, prev.work_date) : ""
    }));
  };

  const calculateTotal = () => {
    if (FIXED_AMOUNT_ACTIVITIES.includes(formData.activity)) {
      return parseFloat(formData.fixed_amount) || 0;
    } else {
      const hours = parseFloat(formData.hours) || 0;
      const rate = parseFloat(formData.hourly_rate) || 0;
      return hours * rate;
    }
  };

  const isFormValid = () => {
    const isFixed = FIXED_AMOUNT_ACTIVITIES.includes(formData.activity);

    if (isFixed) {
        const baseValid = formData.client_id && 
                          formData.activity && 
                          formData.fixed_amount &&
                          !isNaN(parseFloat(formData.fixed_amount)) && parseFloat(formData.fixed_amount) >= 0;
        
        if (formData.activity === 'otros') {
            return baseValid && formData.other_activity.trim() !== '';
        }
        return baseValid;
    } else {
      return formData.client_id && 
             formData.hours && 
             formData.activity && 
             formData.hourly_rate && 
             !hoursError &&
             !isNaN(parseFloat(formData.hours)) && parseFloat(formData.hours) >= 0 &&
             !isNaN(parseFloat(formData.hourly_rate)) && parseFloat(formData.hourly_rate) >= 0;
    }
  };

  // Check if user is inactive
  if (user && user.active === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 pb-24">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-lg">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Registrar Trabajo</h1>
                <p className="text-slate-600 text-sm">Panel de registro de horas profesional</p>
              </div>
            </div>
          </div>

          <Card className="shadow-xl">
            <CardContent className="p-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-100 to-amber-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-amber-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-3">Cuenta Temporalmente Inactiva</h2>
                <p className="text-slate-600 text-sm leading-relaxed max-w-full mx-auto mb-4">
                  Tu cuenta está actualmente inactiva. Puedes consultar toda tu información histórica, 
                  pero no puedes registrar nuevas horas de trabajo en este momento.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left max-w-full mx-auto">
                  <p className="text-amber-800 text-sm">
                    <strong>Nota:</strong> Si necesitas reactivar tu cuenta, contacta con el administrador a través de los canales habituales de comunicación.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 pb-24">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Registrar Horas</h1>
        </div>

        <Alert className="mb-6 border-blue-200 bg-blue-50">
          <Info className="h-5 w-5 text-blue-600" />
          <AlertTitle className="font-semibold text-blue-800 text-base">¡Importante!</AlertTitle>
          <AlertDescription className="text-blue-700 text-sm">
            Usa esta página para registrar trabajos <strong>adicionales</strong> que no están en tu horario (ej: entrenamiento, gasolina, servicios especiales).
          </AlertDescription>
        </Alert>

        {/* Success Alert */}
        {success && (
          <div className="mb-6">
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-full">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-green-900">¡Trabajo Registrado!</h3>
                  <p className="text-green-700 text-sm">Tu registro ha sido guardado</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-5 w-5" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Main Form Card */}
        <Card className="shadow-xl">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Detalles del Trabajo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Client Selection */}
              <div>
                <Label className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  Cliente *
                </Label>
                <ClientSearchCombobox
                  clients={clients}
                  selectedClient={formData.client_name}
                  onClientSelect={handleClientSelect}
                />
              </div>

              {/* Work Date */}
              <div>
                <Label className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  Fecha del Trabajo *
                </Label>
                <Input
                  type="date"
                  value={formData.work_date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="h-12"
                  required
                />
              </div>

              {/* Activity Selection */}
              <div>
                <Label className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Tipo de Actividad *
                </Label>
                <Select
                  value={formData.activity}
                  onValueChange={handleActivityChange}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Selecciona el tipo de trabajo" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITIES.map((activity) => (
                      <SelectItem key={activity.value} value={activity.value} className="py-3">
                        {activity.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Other Activity Description */}
              {formData.activity === 'otros' && (
                <div>
                  <Label className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    Descripción *
                  </Label>
                  <Textarea
                    value={formData.other_activity}
                    onChange={(e) => setFormData(prev => ({ ...prev, other_activity: e.target.value }))}
                    placeholder="Describe la actividad..."
                    rows={4}
                    className="resize-none"
                  />
                </div>
              )}

              {/* Payment Details */}
              {formData.activity && (
                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-600" />
                    Detalles de Pago
                  </h3>
                  
                  {FIXED_AMOUNT_ACTIVITIES.includes(formData.activity) ? (
                    <div>
                      <Label className="text-sm font-semibold mb-2">Monto Fijo (AUD) *</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.fixed_amount}
                          onChange={(e) => setFormData(prev => ({ ...prev, fixed_amount: e.target.value }))}
                          className="pl-12 h-14 text-lg"
                          placeholder="150.00"
                          required
                          onWheel={(e) => e.currentTarget.blur()}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label className="text-sm font-semibold mb-2">Tarifa por Hora (AUD) *</Label>
                        <div className="relative">
                          <DollarSign className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.hourly_rate}
                            onChange={(e) => setFormData(prev => ({ ...prev, hourly_rate: e.target.value }))}
                            className="pl-12 h-14 text-lg"
                            placeholder="28.50"
                            required
                            onWheel={(e) => e.currentTarget.blur()}
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-semibold mb-2">Horas Trabajadas *</Label>
                        <div className="relative">
                          <Clock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                          <Input
                            type="number"
                            step="0.25"
                            min="0"
                            value={formData.hours}
                            onChange={handleHoursChange}
                            className={`pl-12 h-14 text-lg ${hoursError ? 'border-red-500' : ''}`}
                            placeholder="8.5"
                            required
                            onWheel={(e) => e.currentTarget.blur()}
                          />
                        </div>
                        
                        {hoursError && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-red-600" />
                              <p className="text-red-800 text-sm">{hoursError}</p>
                            </div>
                          </div>
                        )}
                        
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3">
                          <h4 className="text-sm font-semibold text-blue-900 mb-3">
                            Conversión de Minutos
                          </h4>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { minutes: "15 min", decimal: ".25" },
                              { minutes: "30 min", decimal: ".50" },
                              { minutes: "45 min", decimal: ".75" },
                              { minutes: "60 min", decimal: "1.00" }
                            ].map((conversion, index) => (
                              <div key={index} className="text-center p-2 bg-white rounded-lg">
                                <div className="font-semibold text-slate-900 text-sm">{conversion.minutes}</div>
                                <div className="font-mono text-blue-700">{conversion.decimal}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Total Display */}
              {((FIXED_AMOUNT_ACTIVITIES.includes(formData.activity) && formData.fixed_amount && !isNaN(parseFloat(formData.fixed_amount))) || 
                (!FIXED_AMOUNT_ACTIVITIES.includes(formData.activity) && formData.hours && formData.hourly_rate && !hoursError)) && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
                  <div className="text-center">
                    <h3 className="text-sm font-semibold text-green-900 mb-2">
                      Valor Total
                    </h3>
                    <p className="text-4xl font-bold text-green-800 mb-1">
                      ${calculateTotal().toFixed(2)}
                    </p>
                    <p className="text-xs text-green-600">AUD</p>
                    {!FIXED_AMOUNT_ACTIVITIES.includes(formData.activity) && (
                      <p className="text-green-700 text-sm mt-2">
                        {formData.hours}h × ${formData.hourly_rate}/h
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div>
                <Button
                  type="submit"
                  className={`w-full h-14 text-lg font-semibold shadow-xl ${
                    isFormValid() 
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800' 
                      : 'bg-slate-400 cursor-not-allowed'
                  }`}
                  disabled={loading || !isFormValid()}
                >
                  {loading ? (
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Guardando...
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5" />
                      Registrar Trabajo
                    </div>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
