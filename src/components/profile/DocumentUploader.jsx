import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { UploadFile } from "@/integrations/Core";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, UploadCloud, Loader2, FileText, ExternalLink, Save, X } from "lucide-react";

export default function DocumentUploader({ title, fileUrl: initialFileUrl, documentType }) {
  const [currentFileUrl, setCurrentFileUrl] = useState(initialFileUrl || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pendingFile, setPendingFile] = useState(null); // { name, url }
  const fileInputRef = useRef(null);

  useEffect(() => {
    setCurrentFileUrl(initialFileUrl || "");
  }, [initialFileUrl]);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError("");
    setSaved(false);

    try {
      const { file_url } = await UploadFile({ file });
      setPendingFile({ name: file.name, url: file_url });
    } catch (err) {
      setError("Error al subir el archivo. Inténtalo de nuevo.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    if (!pendingFile) return;
    setSaving(true);
    setError("");
    try {
      await base44.auth.updateMe({ [documentType]: pendingFile.url });
      setCurrentFileUrl(pendingFile.url);
      setPendingFile(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError("Error al guardar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setPendingFile(null);
    setError("");
  };

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${currentFileUrl ? 'bg-green-100' : 'bg-slate-100'}`}>
            <FileText className={`w-5 h-5 ${currentFileUrl ? 'text-green-600' : 'text-slate-400'}`} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm">{title}</p>
            {saved ? (
              <div className="flex items-center gap-1 mt-0.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs text-green-600 font-medium">¡Guardado correctamente!</span>
              </div>
            ) : currentFileUrl ? (
              <div className="flex items-center gap-1 mt-0.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs text-green-600">Documento adjuntado</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 mt-0.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs text-amber-600">Pendiente de adjuntar</span>
              </div>
            )}
          </div>
        </div>

        {/* Botones - CRÍTICO: type="button" para no disparar submit del form padre */}
        {!pendingFile && (
          <div className="flex gap-2 flex-shrink-0">
            {currentFileUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(currentFileUrl, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                Ver
              </Button>
            )}
            <Button
              type="button"
              onClick={() => fileInputRef.current.click()}
              disabled={uploading}
              size="sm"
              variant={currentFileUrl ? "outline" : "default"}
              className={!currentFileUrl ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Subiendo...</>
              ) : (
                <><UploadCloud className="w-4 h-4 mr-1" />{currentFileUrl ? "Reemplazar" : "Adjuntar"}</>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Panel de confirmación de archivo pendiente */}
      {pendingFile && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs text-blue-600 font-medium">Archivo listo para guardar:</p>
              <p className="text-sm font-bold text-blue-900 break-all">{pendingFile.name}</p>
            </div>
          </div>
          <p className="text-xs text-blue-600">
            Presiona <strong>Guardar</strong> para confirmar que este documento quede registrado.
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Guardando...</>
              ) : (
                <><Save className="w-4 h-4 mr-1" />Guardar</>
              )}
            </Button>
            <Button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              size="sm"
              variant="outline"
              className="flex-1"
            >
              <X className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*,.pdf"
      />
    </div>
  );
}