import React, { useState, useEffect } from "react";
import { User } from "@/entities/User";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle, AlertCircle, Save, FileText, Gift, Calendar, User as UserIcon, Phone,
  MapPin, Briefcase, CreditCard, ExternalLink, Shield, Car
} from "lucide-react";
import DocumentUploader from "../components/profile/DocumentUploader";
import PhotoUploader from "../components/profile/PhotoUploader";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function MiPerfilPage() {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    full_name: "",
    invoice_name: "",
    next_invoice_number: 1,
    email: "",
    abn: "",
    mobile_number: "",
    address: "",
    account_name: "",
    account_number: "",
    bsb: "",
    bank: "",
    passport_url: "",
    visa_url: "",
    police_check_url: "",
    drivers_license_url: "",
    profile_photo_url: "",
    birth_date: "",
    start_date: "",
    emergency_contact_name: "",
    emergency_contact_phone: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userData = await User.me();
      setUser(userData);

      const startDate = userData.start_date || userData.created_date;

      setFormData({
        full_name: userData.full_name || "",
        invoice_name: userData.invoice_name || "",
        next_invoice_number: userData.next_invoice_number || 1,
        email: userData.email || "",
        abn: userData.abn || "",
        mobile_number: userData.mobile_number || "",
        address: userData.address || "",
        account_name: userData.account_name || "",
        account_number: userData.account_number || "",
        bsb: userData.bsb || "",
        bank: userData.bank || "",
        passport_url: userData.passport_url || "",
        visa_url: userData.visa_url || "",
        police_check_url: userData.police_check_url || "",
        drivers_license_url: userData.drivers_license_url || "",
        profile_photo_url: userData.profile_photo_url || "",
        birth_date: userData.birth_date || "",
        start_date: startDate || "",
        emergency_contact_name: userData.emergency_contact_name || "",
        emergency_contact_phone: userData.emergency_contact_phone || ""
      });

      if (!userData.start_date && userData.created_date) {
        try {
          await User.updateMyUserData({ start_date: userData.created_date });
        } catch (error) {
          console.log("Could not auto-set start_date:", error);
        }
      }
    } catch (error) {
      setError("Error cargando datos del usuario");
    }
    setLoading(false);
  };

  const handleUploadSuccess = async (documentType, fileUrl) => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await User.updateMyUserData({ [documentType]: fileUrl });
      const docName = documentType.replace('_url', '').replace('_', ' ').replace('profile photo', 'foto de perfil');
      setSuccess(`¡${docName} actualizado!`);
      loadUserData();
    } catch (error) {
      setError("Error al actualizar el documento.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const updateData = {
        invoice_name: formData.invoice_name,
        next_invoice_number: Number(formData.next_invoice_number),
        abn: formData.abn,
        mobile_number: formData.mobile_number,
        address: formData.address,
        account_name: formData.account_name,
        account_number: formData.account_number,
        bsb: formData.bsb,
        bank: formData.bank,
        birth_date: formData.birth_date,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone
      };

      await User.updateMyUserData(updateData);
      setSuccess("¡Perfil actualizado exitosamente!");

      setTimeout(() => {
        loadUserData();
        setSuccess("");
        setIsEditing(false);
      }, 3000);

    } catch (error) {
      setError("Error actualizando el perfil: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 md:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center">Cargando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">

        {success && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={() => setIsEditing(!isEditing)} variant="outline">
            {isEditing ? "Ver Perfil" : "Editar Perfil"}
          </Button>
        </div>

        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
              Editar Mi Perfil
            </h1>
            <p className="text-slate-600">Actualiza tu información personal y datos de facturación</p>

            <Card className="shadow-lg border-0">
              <CardHeader>
                <CardTitle>Foto de Perfil</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <PhotoUploader
                  currentPhotoUrl={formData.profile_photo_url}
                  onUploadSuccess={handleUploadSuccess}
                  userName={formData.full_name}
                />
              </CardContent>
            </Card>

            <Card className="shadow-lg border-0">
              <CardHeader>
                <CardTitle>Datos de Facturación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invoice_name">Nombre para Facturas *</Label>
                  <Input
                    id="invoice_name"
                    value={formData.invoice_name}
                    onChange={(e) => handleInputChange('invoice_name', e.target.value)}
                    placeholder="Tu nombre completo como aparece en las facturas"
                    required
                  />
                  <p className="text-xs text-slate-500">
                    Este es el nombre que aparecerá en las facturas.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="next_invoice_number">Próximo Número de Factura *</Label>
                  <Input
                    id="next_invoice_number"
                    type="number"
                    min="1"
                    value={formData.next_invoice_number}
                    onChange={(e) => handleInputChange('next_invoice_number', e.target.value)}
                    required
                  />
                  <p className="text-xs text-slate-500">
                    El sistema usará este número para tu próxima factura y lo incrementará automáticamente.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-0">
              <CardHeader>
                <CardTitle>Información Personal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nombre de la Cuenta</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    disabled
                    className="bg-gray-100"
                  />
                  <p className="text-xs text-slate-500">
                    Este nombre está asociado a tu cuenta de Google y no se puede cambiar.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    disabled
                    className="bg-gray-100"
                  />
                  <p className="text-xs text-slate-500">
                    El email no se puede cambiar desde aquí.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="abn">ABN (Australian Business Number)</Label>
                  <Input
                    id="abn"
                    value={formData.abn}
                    onChange={(e) => handleInputChange('abn', e.target.value)}
                    placeholder="123456789012"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mobile_number">Número de Teléfono *</Label>
                  <Input
                    id="mobile_number"
                    value={formData.mobile_number}
                    onChange={(e) => handleInputChange('mobile_number', e.target.value)}
                    placeholder="0412345678"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    placeholder="Tu dirección completa"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-0">
              <CardHeader>
                <CardTitle>Contacto de Emergencia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="emergency_contact_name">Nombre del Contacto</Label>
                  <Input
                    id="emergency_contact_name"
                    value={formData.emergency_contact_name}
                    onChange={(e) => handleInputChange('emergency_contact_name', e.target.value)}
                    placeholder="Ej: Jane Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergency_contact_phone">Teléfono del Contacto</Label>
                  <Input
                    id="emergency_contact_phone"
                    type="tel"
                    value={formData.emergency_contact_phone}
                    onChange={(e) => handleInputChange('emergency_contact_phone', e.target.value)}
                    placeholder="Ej: 0412345678"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-0">
              <CardHeader>
                <CardTitle>Fechas Importantes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="birth_date" className="flex items-center gap-2"><Gift className="w-4 h-4" /> Fecha de Nacimiento</Label>
                  <Input
                    id="birth_date"
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) => handleInputChange('birth_date', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Fecha de Inicio (Oficial)</Label>
                  <Input
                    value={formData.start_date ? format(new Date(formData.start_date), "d 'de' MMMM 'de' yyyy", { locale: es }) : "No establecida"}
                    disabled
                    className="bg-gray-100"
                  />
                  <p className="text-xs text-slate-500">
                    Esta fecha es gestionada por el administrador.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-600" />
                  Documentos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DocumentUploader
                  title="Pasaporte"
                  documentType="passport_url"
                  fileUrl={formData.passport_url}
                  onUploadSuccess={handleUploadSuccess}
                />
                <DocumentUploader
                  title="Visa"
                  documentType="visa_url"
                  fileUrl={formData.visa_url}
                  onUploadSuccess={handleUploadSuccess}
                />
                <DocumentUploader
                  title="Police Check"
                  documentType="police_check_url"
                  fileUrl={formData.police_check_url}
                  onUploadSuccess={handleUploadSuccess}
                />
                <DocumentUploader
                  title="Licencia de Conducir"
                  documentType="drivers_license_url"
                  fileUrl={formData.drivers_license_url}
                  onUploadSuccess={handleUploadSuccess}
                />
              </CardContent>
            </Card>

            <Card className="shadow-lg border-0">
              <CardHeader>
                <CardTitle>Datos Bancarios</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="account_name">Nombre de la Cuenta</Label>
                  <Input
                    id="account_name"
                    value={formData.account_name}
                    onChange={(e) => handleInputChange('account_name', e.target.value)}
                    placeholder="Nombre como aparece en la cuenta bancaria"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="account_number">Número de Cuenta</Label>
                    <Input
                      id="account_number"
                      value={formData.account_number}
                      onChange={(e) => handleInputChange('account_number', e.target.value)}
                      placeholder="123456789"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bsb">BSB</Label>
                    <Input
                      id="bsb"
                      value={formData.bsb}
                      onChange={(e) => handleInputChange('bsb', e.target.value)}
                      placeholder="123-456"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bank">Banco</Label>
                  <Input
                    id="bank"
                    value={formData.bank}
                    onChange={(e) => handleInputChange('bank', e.target.value)}
                    placeholder="Nombre del banco"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving ? (
                  "Guardando..."
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Guardar Cambios
                  </>
                )}
              </Button>
            </div>

            <div className="mt-8 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg">
              <h4 className="font-semibold text-yellow-800 mb-2">Importante:</h4>
              <p className="text-yellow-700 text-sm">
                Para generar reportes de pago, necesitarás completar tu nombre para facturas, ABN y detalles bancarios.
              </p>
            </div>
          </form>
        ) : (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center">
                  <Avatar className="w-24 h-24 mb-4 border-4 border-white shadow-lg">
                    <AvatarImage src={user?.profile_photo_url} alt={user?.full_name} />
                    <AvatarFallback className="bg-gradient-to-r from-blue-600 to-blue-700 text-white text-2xl font-bold">
                      {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <h1 className="text-2xl font-bold text-slate-900 mb-1">{user?.full_name}</h1>
                  <p className="text-slate-600 mb-3">{user?.email}</p>
                  <Badge className={user?.active !== false ? "bg-green-600" : "bg-amber-600"}>
                    {user?.active !== false ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserIcon className="w-5 h-5 text-blue-600" />
                  Información Personal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {user?.mobile_number && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <Phone className="w-5 h-5 text-slate-400" />
                    <div className="flex-1">
                      <p className="text-xs text-slate-600">Teléfono</p>
                      <p className="font-medium text-slate-900">{user.mobile_number}</p>
                    </div>
                  </div>
                )}

                {user?.address && (
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-slate-600">Dirección</p>
                      <p className="font-medium text-slate-900 text-sm">{user.address}</p>
                    </div>
                  </div>
                )}

                {user?.birth_date && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <Calendar className="w-5 h-5 text-slate-400" />
                    <div className="flex-1">
                      <p className="text-xs text-slate-600">Fecha de Nacimiento</p>
                      <p className="font-medium text-slate-900">
                        {format(new Date(user.birth_date), 'PPP', { locale: es })}
                      </p>
                    </div>
                  </div>
                )}

                {user?.start_date && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <Briefcase className="w-5 h-5 text-slate-400" />
                    <div className="flex-1">
                      <p className="text-xs text-slate-600">Fecha de Inicio</p>
                      <p className="font-medium text-slate-900">
                        {format(new Date(user.start_date), 'PPP', { locale: es })}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {(user?.account_name || user?.bsb || user?.account_number) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-blue-600" />
                    Información Bancaria
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {user.account_name && (
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-600 mb-1">Nombre de Cuenta</p>
                      <p className="font-medium text-slate-900">{user.account_name}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    {user.bsb && (
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-600 mb-1">BSB</p>
                        <p className="font-medium text-slate-900">{user.bsb}</p>
                      </div>
                    )}

                    {user.account_number && (
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-600 mb-1">N° de Cuenta</p>
                        <p className="font-medium text-slate-900">{user.account_number}</p>
                      </div>
                    )}
                  </div>

                  {user.bank && (
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-600 mb-1">Banco</p>
                      <p className="font-medium text-slate-900">{user.bank}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {user?.abn && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    Información Fiscal
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-600 mb-1">ABN</p>
                    <p className="font-medium text-slate-900">{user.abn}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Documentos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {user?.passport_url && (
                  <a
                    href={user.passport_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-slate-900">Pasaporte</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                  </a>
                )}

                {user?.visa_url && (
                  <a
                    href={user.visa_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-slate-900">Visa</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                  </a>
                )}

                {user?.police_check_url && (
                  <a
                    href={user.police_check_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-slate-900">Antecedentes Policiales</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                  </a>
                )}

                {user?.drivers_license_url && (
                  <a
                    href={user.drivers_license_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Car className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-slate-900">Licencia de Conducir</span>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                  </a>
                )}

                {!user?.passport_url && !user?.visa_url && !user?.police_check_url && !user?.drivers_license_url && (
                  <p className="text-center text-slate-500 py-4">
                    No hay documentos cargados
                  </p>
                )}
              </CardContent>
            </Card>

            {(user?.emergency_contact_name || user?.emergency_contact_phone) && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-900">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    Contacto de Emergencia
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {user.emergency_contact_name && (
                    <div className="p-3 bg-white rounded-lg">
                      <p className="text-xs text-red-600 mb-1">Nombre</p>
                      <p className="font-medium text-red-900">{user.emergency_contact_name}</p>
                    </div>
                  )}

                  {user.emergency_contact_phone && (
                    <div className="p-3 bg-white rounded-lg">
                      <p className="text-xs text-red-600 mb-1">Teléfono</p>
                      <a
                        href={`tel:${user.emergency_contact_phone}`}
                        className="font-medium text-red-900 hover:text-red-700"
                      >
                        {user.emergency_contact_phone}
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}