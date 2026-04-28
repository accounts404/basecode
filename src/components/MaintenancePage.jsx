import React from "react";
import { FileX } from "lucide-react";

export default function MaintenancePage() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
      <div className="text-center px-8 max-w-sm">
        <div className="flex justify-center mb-6">
          <FileX className="w-16 h-16 text-slate-400" strokeWidth={1.2} />
        </div>
        <h1 className="text-2xl font-normal text-slate-800 mb-3">
          Esta página no está disponible
        </h1>
        <p className="text-sm text-slate-500 uppercase tracking-widest mb-8">
          EN MANTENIMIENTO
        </p>
        <p className="text-sm text-slate-400">
          Estamos trabajando para mejorar la aplicación. Vuelve en unos momentos.
        </p>
      </div>
    </div>
  );
}