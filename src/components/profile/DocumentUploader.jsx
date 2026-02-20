import React, { useState, useRef } from "react";
import { UploadFile } from "@/integrations/Core";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, UploadCloud, Loader2, File, ExternalLink, Save, X } from "lucide-react";

export default function DocumentUploader({ title, fileUrl, onUploadSuccess, documentType }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState(null); // { name, url }
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef(null);

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
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
      // Reset input so same file can be selected again
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    if (!pendingFile) return;
    setSaving(true);
    setError("");
    try {
      await onUploadSuccess(documentType, pendingFile.url);
      setSaved(true);
      setPendingFile(null);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError("Error al guardar el documento.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setPendingFile(null);
    setError("");
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      {/* Fila principal */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <File className="w-6 h-6 text-slate-500 flex-shrink-0" />
          <div>
            <p className="font-medium text-slate-800">{title}</p>
            {saved ? (
              <div className="flex items-center gap-1 text-sm text-green-600 mt-1">
                <CheckCircle className="w-4 h-4" />
                <span>¡Guardado correctamente!</span>
              </div>
            ) : fileUrl ? (
              <div className="flex items-center gap-1 text-sm text-green-600 mt-1">
                <CheckCircle className="w-4 h-4" />
                <span>Documento adjuntado</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-sm text-amber-600 mt-1">
                <AlertCircle className="w-4 h-4" />
                <span>Pendiente de adjuntar</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          {fileUrl && !pendingFile && (
            <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                Ver
              </a>
            </Button>
          )}
          {!pendingFile && (
            <Button onClick={triggerFileSelect} disabled={uploading} size="sm" className="flex-1 sm:flex-none">
              {uploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <UploadCloud className="w-4 h-4 mr-2" />
              )}
              {uploading ? "Subiendo..." : fileUrl ? "Reemplazar" : "Adjuntar"}
            </Button>
          )}
        </div>
      </div>

      {/* Archivo pendiente de guardar */}
      {pendingFile && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <File className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-800 font-medium truncate">
              Archivo seleccionado: <span className="font-bold">{pendingFile.name}</span>
            </p>
          </div>
          <p className="text-xs text-blue-600">
            Haz clic en "Guardar" para confirmar el cambio del documento.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saving ? "Guardando..." : "Guardar"}
            </Button>
            <Button
              onClick={handleCancel}
              disabled={saving}
              size="sm"
              variant="outline"
              className="flex-1"
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*,.pdf"
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}