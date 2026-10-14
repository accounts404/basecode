import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { formatInTimeZone } from 'date-fns-tz';
import NoticeCard from './NoticeCard';
import { getDailyPhrase } from './motivationalPhrases';

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

const normalize = (s) => (s || '').trim().toLowerCase();

export default function TableroTVView() {
  const [notices, setNotices] = useState([]);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [nameMap, setNameMap] = useState({});
  const [userById, setUserById] = useState({});
  const [teams, setTeams] = useState([]);

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
      const isProperName = (s) => !!s && /\s/.test(s.trim());
      const pickName = (u) => {
        const fn = (u.full_name || '').trim();
        const dn = (u.display_name || '').trim();
        if (isProperName(fn)) return fn;
        if (isProperName(dn)) return dn;
        return fn || dn;
      };
      const byId = {};
      (users || []).forEach(u => { if (u.id) byId[u.id] = pickName(u); });
      setUserById(byId);
    } catch (e) {
      console.warn('No se pudo cargar mapa de nombres cortos:', e);
    }
  };

  const loadTeams = async () => {
    try {
      const assignments = await base44.entities.DailyTeamAssignment.list('-date', 100);
      const today = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
      const list = (assignments || [])
        .filter(t => t.date && t.date >= today && t.status !== 'cancelled')
        .map(t => {
          const ids = t.team_member_ids || [];
          const rawNames = (t.team_members_names || []).map(m => m.trim());
          const members = ids.map((id, i) => {
            const nice = (userById[id] || '').trim();
            if (nice) return nice;
            return rawNames[i] || '';
          }).filter(Boolean);
          const finalMembers = members.length ? members : rawNames;
          const firstRaw = ((t.team_members_names && t.team_members_names[0]) || '').trim();
          const firstDisplay = firstRaw ? (nameMap[firstRaw] || firstRaw) : '';
          const key = (t.team_name || (firstDisplay ? `Equipo ${firstDisplay}` : 'Equipo')).trim();
          return { key, members: finalMembers, firstRaw, firstDisplay };
        })
        .filter(t => t.members.length);
      setTeams(list);
    } catch (e) {
      console.warn('No se pudo cargar miembros de equipos:', e);
    }
  };

  useEffect(() => {
    load();
    loadCleaners();
    const refresh = setInterval(load, REFRESH_MS);
    const clock = setInterval(() => setNow(new Date()), 1000);
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

  useEffect(() => {
    if (Object.keys(userById).length) loadTeams();
  }, [userById]);

  // Resuelve a qué equipo pertenece una nota (team, cleaner o ninguno)
  const matchTeam = (n) => {
    const stored = (n.target_name || '').trim();
    if (n.target === 'team') {
      let team = teams.find(t => t.key === stored);
      if (!team) team = teams.find(t => stored.startsWith(t.key) || t.key.startsWith(stored));
      if (!team) team = teams.find(t => (t.firstRaw && stored.includes(t.firstRaw)) || (t.firstDisplay && stored.includes(t.firstDisplay)));
      return team || null;
    }
    if (n.target === 'cleaner') {
      const ns = normalize(stored);
      return teams.find(t => (t.members || []).some(m => normalize(m) === ns)) || null;
    }
    return null;
  };

  // Extrae solo los nombres de limpiadores de un target_name de equipo
  // Formato guardado: "Equipo <lider> · <nombre1, nombre2, ...>"
  const extractMembers = (target_name) => {
    let s = (target_name || '').trim().replace(/^Equipo\s*:?\s*/i, '');
    const idx = s.indexOf(' · ');
    if (idx >= 0) {
      return s.slice(idx + 3).split(',').map(x => x.trim()).filter(Boolean);
    }
    return s ? [s] : ['—'];
  };

  const dayNotices = useMemo(() => notices.filter(n => n.type === 'day' && isVigente(n)), [notices]);
  const allNotices = useMemo(() => dayNotices.filter(n => n.target === 'all'), [dayNotices]);
  const targetedNotices = useMemo(() => dayNotices.filter(n => n.target !== 'all'), [dayNotices]);

  // Agrupación estricta por equipo (los equipos sin notas no se renderizan)
  const teamGroups = useMemo(() => {
    const map = new Map();
    targetedNotices.forEach(n => {
      const team = matchTeam(n);
      const key = team ? team.key : (n.target_name || 'Sin equipo asignado');
      if (!map.has(key)) {
        const members = team
          ? team.members
          : (n.target === 'team' ? extractMembers(n.target_name) : [n.target_name || '—']);
        map.set(key, {
          key,
          members,
          notes: [],
        });
      }
      map.get(key).notes.push({ ...n, _displayName: n.target_name || '—' });
    });
    return Array.from(map.values());
  }, [targetedNotices, teams]);

  const officeNotices = useMemo(() => notices.filter(n => n.type === 'office' && isVigente(n)), [notices]);

  const dateStr = formatInTimeZone(now, TZ, 'EEEE, d MMMM yyyy');
  const timeStr = formatInTimeZone(now, TZ, 'HH:mm');
  const phrase = useMemo(() => getDailyPhrase(now), [dateStr]);

  return (
    <div className="tv-board bg-white text-[#0f1f3a] w-full flex flex-col p-3 sm:p-5 lg:p-6 relative"
      style={{ height: '100dvh', overflow: 'hidden' }}>
      <style>{`
        @keyframes tv-enter { from { opacity:0; transform:translateY(18px) } to { opacity:1; transform:translateY(0) } }
        @keyframes tv-slideup { 0% { opacity:0; transform:translateY(22px) } 100% { opacity:1; transform:translateY(0) } }
        @keyframes tv-glow { 0%,100% { opacity:.45 } 50% { opacity:1 } }
        .tv-enter { animation: tv-enter .7s cubic-bezier(.2,.75,.25,1) both; }
        .tv-slideup { animation: tv-slideup 1s cubic-bezier(.22,.7,.2,1) both; }
        .tv-glow { animation: tv-glow 4s ease-in-out infinite; }
        .tv-phrase { text-shadow: 0 1px 2px rgba(7, 23, 64, 0.35); }
        .tv-phrase-text { text-wrap: balance; }

        /* Área principal: container queries para que todo escale */
        .tv-area { display: grid; grid-template-columns: minmax(0,1fr) clamp(240px, 15vw, 320px); gap: clamp(10px, 1.2vw, 18px); flex: 1 1 0; min-height: 0; }
        .tv-main { container-type: size; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: clamp(8px, 1vh, 14px); overflow: hidden; }

        /* Banner "Para todos los equipos" */
        .tv-all { flex: 0 0 auto; container-type: size; }
        .tv-all-strip {
          display: flex; align-items: center; gap: clamp(8px, 1cqw, 14px);
          padding: clamp(6px, 1cqw, 12px) clamp(10px, 1.4cqw, 18px);
          border-radius: clamp(10px, 1cqw, 16px);
          background: linear-gradient(135deg, #173e9e 0%, #2563eb 100%);
          color: #fff; overflow: hidden;
        }
        .tv-all-label { font-weight: 800; text-transform: uppercase; letter-spacing: .08em; white-space: nowrap; font-size: clamp(0.6rem, 1.2cqw, 0.85rem); }
        .tv-all-text { font-size: clamp(0.62rem, min(1.4cqw, 2.4cqh), 0.95rem); line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }

        /* Grid de equipos: columnas auto-ajustables, filas a altura igual */
        .tv-teams {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, clamp(170px, 15cqw, 280px)), 1fr));
          grid-auto-rows: minmax(0, 1fr);
          gap: clamp(8px, 1vw, 14px);
          flex: 1 1 0; min-height: 0; overflow: hidden;
        }
        .tv-team-col { container-type: size; display: flex; flex-direction: column; min-height: 0; background: #fff; border: 1px solid #d8e1ee; border-radius: clamp(12px, 1.2cqw, 20px); overflow: hidden; box-shadow: 0 8px 22px rgba(37,99,235,0.08); }
        .tv-team-head { flex: 0 0 auto; padding: clamp(7px, 1.2cqw, 13px) clamp(10px, 1.5cqw, 16px); background: linear-gradient(135deg, #173e9e 0%, #1d4fd1 70%, #2563eb 100%); color: #fff; }
        .tv-team-name { font-weight: 800; line-height: 1.15; font-size: clamp(0.78rem, 2cqw, 1.1rem); }
        .tv-team-sub { color: #dbe6fb; font-size: clamp(0.55rem, 1.2cqw, 0.75rem); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tv-team-body { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; gap: clamp(6px, 0.9cqw, 11px); padding: clamp(7px, 1.1cqw, 13px); overflow: hidden; }

        /* Rail de oficina */
        .tv-rail { container-type: size; display: flex; flex-direction: column; border: 1px solid #cdd9e8; border-radius: clamp(14px, 1.4vw, 22px); background: #fff; box-shadow: 0 12px 30px rgba(37,99,235,0.10); overflow: hidden; min-height: 0; }
        .tv-rail-scroll { flex: 1 1 0; min-height: 0; overflow-y: auto; }
        .tv-table { border-collapse: separate; border-spacing: 0; font-variant-numeric: tabular-nums; width: 100%; }
        .tv-rail-scroll { scrollbar-width: thin; scrollbar-color: #b9cbe4 transparent; }
        .tv-rail-scroll::-webkit-scrollbar { width: 6px; }
        .tv-rail-scroll::-webkit-scrollbar-thumb { background: #b9cbe4; border-radius: 8px; }
        .tv-th { padding: clamp(7px, 1vw, 11px) clamp(9px, 1vw, 14px); font-size: clamp(0.6rem, 1cqw, 0.78rem); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #173e9e; border-bottom: 2px solid #c5d6ee; text-align: left; white-space: nowrap; }
        .tv-row { transition: background-color .2s ease; }
        .tv-row:nth-child(odd) { background-color: #f7faff; }
        .tv-row:nth-child(even) { background-color: #ffffff; }
        .tv-cell { padding: clamp(8px, 1.1vw, 12px) clamp(9px, 1vw, 14px); vertical-align: top; border-bottom: 1px solid #e4ebf5; font-size: clamp(0.62rem, min(1.2cqw, 1.8cqh), 0.92rem); line-height: 1.4; color: #1e3a5f; }
        .tv-cell-title { font-weight: 700; color: #0f1f3a; line-height: 1.25; }
        .tv-cell-body { max-width: 0; }
        .tv-msg { margin: 0; white-space: pre-wrap; word-break: break-word; }
        .tv-empty { padding: 24px; text-align: center; color: #94a3b8; font-size: 14px; }
      `}</style>

      {/* Mast */}
      <header className="tv-enter relative rounded-[20px] sm:rounded-[24px] lg:rounded-[28px] overflow-hidden flex items-stretch shadow-[0_18px_38px_rgba(37,99,235,0.22)] flex-shrink-0"
        style={{ background: `linear-gradient(115deg, ${BRAND_DEEP} 0%, ${BRAND_DARK} 68%, ${BRAND} 100%)`, minHeight: 'clamp(80px, 13vh, 150px)' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.25), transparent 55%)' }} />
        <div className="relative z-10 w-full px-4 sm:px-6 lg:px-10 py-3 sm:py-5 flex items-center gap-4 sm:gap-6">
          <div className="hidden sm:flex flex-shrink-0 items-center justify-center bg-white/95 rounded-2xl p-2 sm:p-3 shadow-lg"
            style={{ height: 'clamp(56px, 10vh, 100px)', width: 'clamp(56px, 10vh, 100px)' }}>
            <img src={LOGO} alt="RedOak Cleaning" className="max-w-full max-h-full object-contain" />
          </div>
          <div className="flex-1 flex flex-col justify-center min-w-0">
            <div className="text-white/90 font-semibold tracking-wide uppercase truncate" style={{ fontSize: 'clamp(0.65rem, 1.4vw, 1rem)' }}>{dateStr}</div>
            <div className="flex items-end gap-3 sm:gap-5 mt-1 flex-wrap">
              <div className="text-white font-bold leading-none tabular-nums" style={{ fontSize: 'clamp(1.8rem, 7vw, 3.6rem)' }}>{timeStr}</div>
              <div className="tv-phrase flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2 max-w-[min(60ch,52vw)]">
                <span className="flex-shrink-0 rounded-full" style={{ width: '4px', height: 'clamp(22px, 4vh, 42px)', background: '#93c5fd' }} />
                <p className="tv-phrase-text italic text-blue-50 leading-snug" style={{ fontSize: 'clamp(0.72rem, 1.4vw, 1rem)' }}>"{phrase}"</p>
              </div>
            </div>
            <div className="text-white/70 mt-1" style={{ fontSize: 'clamp(0.6rem, 1.2vw, 0.85rem)' }}>Tablero del día · RedOak Cleaning</div>
          </div>
          <div className="relative z-10 self-end hidden lg:flex">
            <div className="tv-glow rounded-r-lg" style={{ height: 'clamp(56px, 10vh, 100px)', width: '10px', background: '#93c5fd' }} />
          </div>
        </div>
      </header>

      {/* Layout */}
      <div className="tv-area mt-3 lg:mt-4">
        {/* Main: equipos agrupados */}
        <main className="tv-main">
          {/* Banner "Para todos los equipos" */}
          {allNotices.length > 0 && (
            <div className="tv-all">
              <div className="tv-all-strip">
                <span className="tv-all-label">Para todos los equipos</span>
                <span className="tv-all-text">
                  {allNotices.map(n => n.body).join('  ·  ')}
                </span>
              </div>
            </div>
          )}

          {/* Grid de equipos (solo los que tienen notas) */}
          <div className="tv-teams">
            {loading ? (
              <div className="text-center text-slate-400" style={{ fontSize: 'clamp(0.8rem, 1.4vw, 1rem)' }}>Cargando avisos…</div>
            ) : teamGroups.length === 0 && allNotices.length === 0 ? (
              <div className="text-center text-slate-400" style={{ fontSize: 'clamp(0.8rem, 1.4vw, 1rem)' }}>No hay notas del día para los equipos.</div>
            ) : (
              teamGroups.map((g, gi) => (
                <section key={g.key} className="tv-team-col tv-enter" style={{ animationDelay: `${gi * 0.08}s` }}>
                  <div className="tv-team-head">
                    <div className="tv-team-name">{g.members.join(' · ')}</div>
                  </div>
                  <div className="tv-team-body">
                    {g.notes.map((n, ni) => (
                      <div key={n.id} className="flex-1 min-h-0">
                        <NoticeCard notice={n} index={ni} />
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </main>

        {/* Rail: avisos permanentes de oficina */}
        <aside className="tv-rail">
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[#173e9e] to-[#2563eb] flex-shrink-0">
            <div className="h-[40px] w-[40px] flex-shrink-0 flex items-center justify-center bg-white rounded-xl shadow-sm">
              <img src={LOGO} alt="" className="max-w-full max-h-full object-contain p-1" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-white leading-tight tracking-wide" style={{ fontSize: 'clamp(0.85rem, 1.4vw, 1.1rem)' }}>Avisos de la oficina</div>
              <div className="text-blue-100" style={{ fontSize: 'clamp(0.58rem, 1vw, 0.75rem)' }}>Información permanente</div>
            </div>
          </div>
          <div className="tv-rail-scroll">
            <table className="tv-table">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#eef3fb]">
                  <th className="tv-th text-left" style={{ width: '34%' }}>Título</th>
                  <th className="tv-th text-left">Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {officeNotices.length === 0 ? (
                  <tr><td colSpan={2} className="tv-empty">Sin avisos de oficina.</td></tr>
                ) : (
                  officeNotices.map((n, i) => (
                    <tr key={n.id} className="tv-row tv-slideup" style={{ animationDelay: `${0.4 + i * 0.08}s` }}>
                      <td className="tv-cell tv-cell-title">{n.title || 'Aviso'}</td>
                      <td className="tv-cell tv-cell-body"><p className="tv-msg">{n.body}</p></td>
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