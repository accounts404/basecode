import React from "react";
import { Construction, Wrench } from "lucide-react";

export default function MaintenanceScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-32 h-32 bg-yellow-400 rounded-full flex items-center justify-center shadow-2xl">
              <Construction className="w-16 h-16 text-slate-900" />
            </div>
            <div className="absolute -top-2 -right-2 w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center animate-bounce">
              <Wrench className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-white mb-3">
          Estableciendo Servidor
        </h1>
        <p className="text-slate-300 text-lg mb-2">
          Estamos realizando mejoras en el sistema.
        </p>
        <p className="text-slate-400 text-sm mb-8">
          Por favor vuelve en unos momentos.
        </p>

        <div className="flex justify-center gap-2">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}