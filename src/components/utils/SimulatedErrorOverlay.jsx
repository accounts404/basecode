import React from "react";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";

// Cambiar a true para activar el error simulado, false para desactivarlo
export const SIMULATE_ERROR = true;

export default function SimulatedErrorOverlay({ pageName = "esta página" }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-12 h-12 text-red-500" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full animate-ping opacity-75" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-800">Error al cargar los datos</h2>
          <p className="text-slate-500 text-sm">
            No se pudo recuperar la información de {pageName}. El servidor no respondió correctamente.
          </p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-left space-y-2">
          <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <span>Error de conexión con el servidor</span>
          </div>
          <p className="text-xs text-red-600 font-mono bg-red-100 rounded p-2">
            ERR_CONNECTION_TIMEOUT: Failed to fetch data from API endpoint. Status 503.
          </p>
        </div>

        <div className="space-y-1 text-sm text-slate-400">
          <div className="flex items-center gap-2 justify-center">
            <div className="w-2 h-2 bg-slate-300 rounded-full" />
            <span>0 registros cargados</span>
          </div>
          <p className="text-xs">Última actualización: hace más de 5 minutos</p>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
      </div>
    </div>
  );
}