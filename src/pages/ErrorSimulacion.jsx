import React from "react";

// Página de prueba que simula una caída total: pantalla completamente blanca.
// Ruta aislada: /ErrorSimulacion — no afecta el resto de la aplicación.
export default function ErrorSimulacion() {
  return <div className="w-full h-screen bg-white" />;
}