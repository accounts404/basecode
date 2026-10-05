import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { formatInTimeZone } from 'date-fns-tz';
import NoticeCard from './NoticeCard';
import NoticeBody from './NoticeBody';

const LOGO = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/4c3ba79c6_RedOakLogo.png";
const TZ = 'Australia/Melbourne';
const REFRESH_MS = 30000;

// Colores de marca RedOak
const BRAND = '#2563eb';
const BRAND_DARK = '#1d4fd1';
const BRAND_DEEP = '#173e9e';

function isVigente(n) {
  if (!n.active) return false;
  if (n.display_until) {
    try {
      const until = new Date(n.display_until + 'T23:59:59');
      if (until < new Date()) return false;
    } catch { /* ignore */ }
  }
  return true;
}

export default function TableroTVView() {
  const [notices, setNotices] = useState([]);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [nameMap, setNameMap] = useState({});
  const [teamMembersMap, setTeamMembersMap] = useState({});

  const load = async () => {
    try {
      const data = await base44.entities.BoardNotice.list('-created_date', 200);
      setNotices(data || []);
    } catch (e) {
      console.error('Error cargando avisos del tablero:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadCleaners = async () => {
    try {
      const users = await base44.entities.User.list('-full_name', 500);
      const map = {};
      (users || []).filter(u => u.role !== 'admin').forEach(u => {
        const short = u.display_name || u.full_name;
        if (short) {
          if (u.full_name) map[u.full_name] = short;
          if (u.display_name) map[u.display_name] = short;
        }
      });
      setNameMap(map);
    } catch (e) {
      console.warn('No se pudo cargar mapa de nombres cortos:', e);
    }
  };

  const loadTeams = async () => {
    try {
      const assignments = await base44.entities.DailyTeamAssignment.list('-date', 100);
      const today = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
      const map = {};
      (assignments || [])
        .filter(t => t.date && t.date >= today && t.status !== 'cancelled')
        .forEach(t => {
          const key = t.team_name || (t.team_members_names && t.team_members_names.length ? `Equipo ${t.team_members_names[0]}` : 'Equipo');
          const members = (t.team_members_names || []).map(m => nameMap[m] || m);
          if (members.length) map[key] = members;
        });
      setTeamMembersMap(map);
    } catch (e) {
      console.warn('No se pudo cargar miembros de equipos:', e);
    }
  };

  useEffect(() => {
    load();
    loadCleaners();
    const refresh = setInterval(load, REFRESH_MS);
    const clock = setInterval(() => setNow(new Date()), 1000);
    // Suscripción en tiempo real: refresca el tablero apenas cambian los avisos
    let unsubscribe = null;
    try {
      unsubscribe = base44.entities.BoardNotice.subscribe(() => { load(); });
    } catch (e) {
      console.warn('Suscripción realtime no disponible, usando polling:', e);
    }
    return () => {
      clearInterval(refresh);
      clearInterval(clock);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Carga los miembros de equipos una vez disponibles los nombres cortos
  useEffect(() => {
    if (Object.keys(nameMap).length) loadTeams();
  }, [nameMap]);

  const resolveName = (n) => {
    if (n.target === 'all') return n.target_name || 'Todos';
    const stored = n.target_name || '';
    if (n.target === 'team') {
      const members = teamMembersMap[stored];
      return members && members.length ? members.join(' · ') : stored;
    }
    return nameMap[stored] || stored;
  };

  const dayNotices = useMemo(
    () => notices.filter(n => n.type === 'day' && isVigente(n)),
    [notices]
  );
  const allNotices = useMemo(
    () => dayNotices.filter(n => n.target === 'all'),
    [dayNotices]
  );
  const specificNotices = useMemo(
    () => dayNotices.filter(n => n.target !== 'all'),
    [dayNotices]
  );
  const officeNotices = useMemo(
    () => notices.filter(n => n.type === 'office' && isVigente(n)),
    [notices]
  );

  const dateStr = formatInTimeZone(now, TZ, 'EEEE, d MMMM yyyy');
  const timeStr = formatInTimeZone(now, TZ, 'HH:mm');

  return (
    <div className="tv-board bg-white text-[#0f1f3a] h-screen w-full overflow-hidden flex flex-col p-5 lg:p-7 relative">
      <style>{`
        @keyframes tv-enter { from { opacity:0; transform:translateY(18px) } to { opacity:1; transform:translateY(0) } }
        @keyframes tv-slideup { 0% { opacity:0; transform:translateY(22px) } 100% { opacity:1; transform:translateY(0) } }
        @keyframes tv-glow { 0%,100% { opacity:.45 } 50% { opacity:1 } }
        .tv-enter { animation: tv-enter .7s cubic-bezier(.2,.75,.25,1) both; }
        .tv-slideup { animation: tv-slideup 1s cubic-bezier(.22,.7,.2,1) both; }
        .tv-glow { animation: tv-glow 4s ease-in-out infinite; }

        /* Tabla profesional de avisos de oficina */
        .tv-table { border-collapse: separate; border-spacing: 0; font-variant-numeric: tabular-nums; }
        .tv-table-scroll { scrollbar-width: thin; scrollbar-color: #b9cbe4 transparent; }
        .tv-table-scroll::-webkit-scrollbar { width: 8px; }
        .tv-table-scroll::-webkit-scrollbar-thumb { background: #b9cbe4; border-radius: 8px; }
        .tv-th {
          padding: 14px 18px;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #173e9e;
          border-bottom: 2px solid #c5d6ee;
          text-align: left;
          white-space: nowrap;
        }
        .tv-row { transition: background-color .2s ease; }
        .tv-row:nth-child(odd)  { background-color: #f7faff; }
        .tv-row:nth-child(even) { background-color: #ffffff; }
        .tv-row:hover { background-color: #eaf2ff; }
        .tv-cell {
          padding: 16px 18px;
          vertical-align: top;
          border-bottom: 1px solid #e4ebf5;
          font-size: 16px;
          line-height: 1.5;
          color: #1e3a5f;
        }
        .tv-cell-title {
          font-weight: 700;
          font-size: 17px;
          color: #0f1f3a;
          line-height: 1.3;
        }
        .tv-cell-body { max-width: 0; }
        .tv-msg {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 16px;
          line-height: 1.55;
          color: #1e3a5f;
        }
        .tv-empty {
          padding: 32px;
          text-align: center;
          color: #94a3b8;
          font-size: 15px;
        }
        /* Viñetas para avisos con varios puntos */
        .tv-bullets { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .tv-bullet-item { display: flex; align-items: flex-start; gap: 12px; }
        .tv-bullet-dot {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px; height: 22px;
          border-radius: 999px;
          background: #2563eb;
          color: #ffffff;
          font-size: 18px;
          font-weight: 700;
          line-height: 1;
          margin-top: 2px;
        }
        .tv-bullet-text { flex: 1; font-size: 16px; line-height: 1.55; color: #1e3a5f; }
        .tv-paragraph { margin: 0; font-size: 16px; line-height: 1.55; color: #1e3a5f; }
        .tv-space { height: 10px; }
      `}</style>

      {/* Mast */}
      <header className="tv-enter relative h-[140px] lg:h-[180px] rounded-[28px] overflow-hidden flex items-stretch shadow-[0_18px_38px_rgba(37,99,235,0.22)]"
        style={{ background: `linear-gradient(115deg, ${BRAND_DEEP} 0%, ${BRAND_DARK} 68%, ${BRAND} 100%)` }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.25), transparent 55%)' }} />
        <div className="relative z-10 w-full px-6 lg:px-10 py-6 flex items-center gap-6">
          <div className="hidden lg:flex flex-shrink-0 items-center justify-center bg-white/95 rounded-2xl p-3 h-[120px] w-[120px] shadow-lg">
            <img src={LOGO} alt="RedOak Cleaning" className="max-w-full max-h-full object-contain" />
          </div>
          <div className="flex-1 flex flex-col justify-center min-w-0">
            <div className="text-white/90 text-sm lg:text-lg font-semibold tracking-wide uppercase">{dateStr}</div>
            <div className="text-white text-5xl lg:text-7xl font-bold leading-none mt-1">{timeStr}</div>
            <div className="text-white/70 text-xs lg:text-sm mt-2">Tablero del día · RedOak Cleaning</div>
          </div>
          <div className="relative z-10 self-end hidden lg:flex">
            <div className="tv-glow h-[120px] w-2.5 rounded-r-lg" style={{ background: '#93c5fd' }} />
          </div>
        </div>
      </header>

      {/* Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_440px] gap-5 lg:gap-7 mt-5 min-h-0">
        {/* Main: cards */}
        <main className="min-w-0 flex flex-col gap-5 min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 content-start overflow-auto">
            {loading ? (
              <div className="col-span-2 text-center text-slate-400 py-10">Cargando avisos…</div>
            ) : specificNotices.length === 0 ? (
              <div className="col-span-2 text-center text-slate-400 py-10">No hay notas del día para limpiadores.</div>
            ) : (
              specificNotices.slice(0, 10).map((n, i) => <NoticeCard key={n.id} notice={{ ...n, _displayName: resolveName(n) }} index={i} />)
            )}
          </div>

          {allNotices.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {allNotices.slice(0, 2).map((n, i) => <NoticeCard key={n.id} notice={{ ...n, _displayName: resolveName(n) }} index={i} />)}
            </div>
          )}
        </main>

        {/* Rail: office — avisos permanentes en formato tabla */}
        <aside className="hidden lg:flex flex-col border border-[#cdd9e8] rounded-[26px] bg-white shadow-[0_12px_30px_rgba(37,99,235,0.10)] overflow-hidden min-h-0">
          <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-[#173e9e] to-[#2563eb]">
            <div className="h-[52px] w-[52px] flex-shrink-0 flex items-center justify-center bg-white rounded-xl shadow-sm">
              <img src={LOGO} alt="" className="max-w-full max-h-full object-contain p-1" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-white leading-tight tracking-wide">Avisos de la oficina</div>
              <div className="text-xs text-blue-100">Información permanente · Léela todos los días</div>
            </div>
          </div>

          <div className="tv-table-scroll flex-1 overflow-y-auto">
            <table className="tv-table w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#eef3fb]">
                  <th className="tv-th text-left" style={{ width: '34%' }}>Título</th>
                  <th className="tv-th text-left">Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {officeNotices.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="tv-empty">Sin avisos de oficina.</td>
                  </tr>
                ) : (
                  officeNotices.map((n, i) => (
                    <tr key={n.id} className="tv-row tv-slideup" style={{ animationDelay: `${0.4 + i * 0.1}s` }}>
                      <td className="tv-cell tv-cell-title">
                        {n.title || 'Aviso'}
                      </td>
                      <td className="tv-cell tv-cell-body">
                        <NoticeBody text={n.body} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </aside>
      </div>
    </div>
  );
}