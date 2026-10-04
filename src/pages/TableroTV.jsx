import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Monitor, Pencil } from 'lucide-react';
import TableroTVView from '@/components/tablero/TableroTVView';
import TableroAdminPanel from '@/components/tablero/TableroAdminPanel';

export default function TableroTV() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('tv'); // 'tv' | 'edit'

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

  return (
    <div className="relative">
      <button
        onClick={() => setMode(m => (m === 'tv' ? 'edit' : 'tv'))}
        className="fixed top-4 right-4 z-50 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl shadow-lg flex items-center gap-2 text-sm transition-opacity"
        style={{ opacity: mode === 'tv' ? 0.25 : 1 }}
        onMouseEnter={e => (e.currentTarget.style.opacity = 1)}
        onMouseLeave={e => (e.currentTarget.style.opacity = mode === 'tv' ? 0.25 : 1)}
        title={mode === 'tv' ? 'Cambiar a modo edición' : 'Ver en TV'}
      >
        {mode === 'tv' ? <><Pencil className="w-4 h-4" /> Editar</> : <><Monitor className="w-4 h-4" /> Ver TV</>}
      </button>
      {mode === 'tv' ? <TableroTVView /> : <TableroAdminPanel />}
    </div>
  );
}