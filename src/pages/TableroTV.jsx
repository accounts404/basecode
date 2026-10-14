import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Monitor, Pencil, Maximize2, Minimize2 } from 'lucide-react';
import TableroTVView from '@/components/tablero/TableroTVView';
import TableroAdminPanel from '@/components/tablero/TableroAdminPanel';

export default function TableroTV() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('tv'); // 'tv' | 'edit'
  const [kiosk, setKiosk] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const u = await base44.auth.me();
        setUser(u);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Sincroniza el estado si el usuario sale de pantalla completa con Esc
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setKiosk(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const enterKiosk = async () => {
    setKiosk(true);
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch (e) { /* el navegador puede bloquear; igual funciona en overlay */ }
  };

  const exitKiosk = async () => {
    setKiosk(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch (e) { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return <div className="p-8 text-center text-red-500">Acceso restringido a administradores.</div>;
  }

  // Modo pantalla completa: overlay que cubre TODO (menú lateral incluido)
  if (kiosk) {
    return (
      <div className="fixed inset-0 z-[100000] bg-white overflow-y-auto">
        <TableroTVView />
        <button
          onClick={exitKiosk}
          className="fixed top-3 right-3 z-[100001] bg-[#0f1f3a] hover:bg-[#1e3a5f] text-white px-4 py-2.5 rounded-[14px] shadow-[0_6px_16px_rgba(23,62,158,0.25)] flex items-center gap-2.5 text-sm font-semibold transition-[background-color,box-shadow,opacity] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93c5fd] active:shadow-[0_2px_6px_rgba(23,62,158,0.3)]"
          style={{ opacity: 0.3 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = 1)}
          onMouseLeave={e => (e.currentTarget.style.opacity = 0.3)}
          title="Salir de pantalla completa"
        >
          <Minimize2 className="w-4 h-4" /> Salir
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        {mode === 'tv' && (
          <button
            onClick={enterKiosk}
            className="bg-[#0f1f3a] hover:bg-[#1e3a5f] text-white px-3 py-2 rounded-[14px] shadow-[0_6px_16px_rgba(23,62,158,0.25)] flex items-center gap-2.5 text-sm font-semibold transition-[background-color,box-shadow,opacity] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93c5fd] active:shadow-[0_2px_6px_rgba(23,62,158,0.3)]"
            style={{ opacity: 0.25 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = 1)}
            onMouseLeave={e => (e.currentTarget.style.opacity = 0.25)}
            title="Pantalla completa (oculta el menú)"
          >
            <Maximize2 className="w-4 h-4" /> Pantalla completa
          </button>
        )}
        <button
          onClick={() => setMode(m => (m === 'tv' ? 'edit' : 'tv'))}
          className="bg-[#2563eb] hover:bg-[#1d4fd1] text-white px-3 py-2 rounded-[14px] shadow-[0_6px_16px_rgba(23,62,158,0.25)] flex items-center gap-2.5 text-sm font-semibold transition-[background-color,box-shadow,opacity] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93c5fd] active:shadow-[0_2px_6px_rgba(23,62,158,0.3)]"
          style={{ opacity: mode === 'tv' ? 0.25 : 1 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = 1)}
          onMouseLeave={e => (e.currentTarget.style.opacity = mode === 'tv' ? 0.25 : 1)}
          title={mode === 'tv' ? 'Cambiar a modo edición' : 'Ver en TV'}
        >
          {mode === 'tv' ? <><Pencil className="w-4 h-4" /> Editar</> : <><Monitor className="w-4 h-4" /> Ver TV</>}
        </button>
      </div>
      {mode === 'tv' ? <TableroTVView /> : <TableroAdminPanel />}
    </div>
  );
}