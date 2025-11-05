import React, { useState, useRef } from "react";
import { UploadFile } from "@/integrations/Core";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, UploadCloud, Loader2, File, ExternalLink } from "lucide-react";

export default function DocumentUploader({ title, fileUrl, onUploadSuccess, documentType }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      const { file_url } = await UploadFile({ file });
      onUploadSuccess(documentType, file_url);
    } catch (err) {
      setError("Error al subir el archivo. Inténtalo de nuevo.");
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div className="flex items-center gap-4">
        <File className="w-6 h-6 text-slate-500" />
        <div>
          <p className="font-medium text-slate-800">{title}</p>
          {fileUrl ? (
            <div className="flex items-center gap-2 text-sm text-green-600 mt-1">
              <CheckCircle className="w-4 h-4" />
              <span>Documento adjuntado</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-600 mt-1">
              <AlertCircle className="w-4 h-4" />
              <span>Pendiente de adjuntar</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex gap-2 w-full sm:w-auto">
        {fileUrl && (
          <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
            <a href={fileUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Ver
            </a>
          </Button>
        )}
        <Button onClick={triggerFileSelect} disabled={uploading} size="sm" className="flex-1 sm:flex-none">
          {uploading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <UploadCloud className="w-4 h-4 mr-2" />
          )}
          {uploading ? "Subiendo..." : fileUrl ? "Reemplazar" : "Adjuntar"}
        </Button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*,.pdf"
      />
      
      {error && (
        <Alert variant="destructive" className="mt-4 w-full">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}