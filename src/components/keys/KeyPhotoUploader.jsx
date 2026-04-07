import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, X, Upload, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function KeyPhotoUploader({ photos = [], onChange, disabled = false }) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onChange([...photos, { url: file_url, comment: '' }]);
    } catch (err) {
      console.error('Error subiendo foto:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemove = (idx) => {
    onChange(photos.filter((_, i) => i !== idx));
  };

  const handleComment = (idx, value) => {
    const updated = [...photos];
    updated[idx] = { ...updated[idx], comment: value };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {photos.map((photo, idx) => (
          <div key={idx} className="relative group">
            <img
              src={photo.url}
              alt={`foto-${idx}`}
              className="w-24 h-24 object-cover rounded-lg border border-slate-200"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            )}
            {!disabled && (
              <Input
                value={photo.comment || ''}
                onChange={(e) => handleComment(idx, e.target.value)}
                placeholder="Comentario..."
                className="mt-1 text-xs h-7 w-24"
              />
            )}
          </div>
        ))}

        {!disabled && (
          <label className="w-24 h-24 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
            {uploading ? (
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            ) : (
              <>
                <Camera className="w-6 h-6 text-slate-400" />
                <span className="text-xs text-slate-400 mt-1">Agregar</span>
              </>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={uploading} />
          </label>
        )}
      </div>
    </div>
  );
}