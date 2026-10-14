import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { formatInTimeZone } from 'date-fns-tz';
import { getDailyPhrase } from './motivationalPhrases';

const LOGO = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/4c3ba79c6_RedOakLogo.png";
const TZ = 'Australia/Melbourne';
const REFRESH_MS = 30000;

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

const norm = (s) => (s || '').trim().toLowerCase();

export default function TableroTVView() {
  const [notices, setNotices] = useState([]);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [nameMap, setNameMap] = useState({});
  const [userById, setUserById] = useState({});
  const [billingNameMap, setBillingNameMap] = useState({});
  const [handleToBilling, setHandleToBilling] = useState({});
  const [teams, setTeams] = useState([]);
  const [departures, setDepartures] = useState({});
  const cleanersRef = useRef([]);

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
      cleanersRef.current = users || [];
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

  const loadBillingNames = async () => {
    try {
      const page = await base44.entities.WorkEntry.filter({}, { sort: '-created_date', limit: 300 });
      const items = (page && page.items) ? page.items : (page || []);
      const map = {};
      (items || []).forEach((e) => {
        const name = (e.cleaner_name || '').trim();
        if (e.cleaner_id && name && !map[e.cleaner_id]) map[e.cleaner_id] = name;
      });
      setBillingNameMap(map);
    } catch (e) {
      console.warn('No se pudo cargar nombres de facturación:', e);
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
          const resolveMember = (id, i) => {
            const billing = (billingNameMap[id] || '').trim();
            if (billing) return billing;
            const nice = (userById[id] || '').trim();
            if (nice) return nice;
            return rawNames[i] || '';
          };
          const members = ids.map(resolveMember).filter(Boolean);
          const finalMembers = members.length ? members : rawNames;
          const firstId = ids[0];
          const firstRaw = ((t.team_members_names && t.team_members_names[0]) || '').trim();
          const firstDisplay =
            (firstId && (billingNameMap[firstId] || '').trim()) ||
            (firstId && (userById[firstId] || '').trim()) ||
            firstRaw ||
            (nameMap[firstRaw] || '');
          const key = (t.team_name || (firstDisplay ? `Equipo ${firstDisplay}` : 'Equipo')).trim();
          return { key, members: finalMembers, ids, firstRaw, firstDisplay };
        })
        .filter(t => t.members.length);
      setTeams(list);
    } catch (e) {
      console.warn('No se pudo cargar miembros de equipos:', e);
    }
  };

  const loadDepartures = async () => {
    try {
      const t = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
      const startISO = `${t}T00:00:00`;
      const endISO = `${t}T23:59:59`;
      const page = await base44.entities.Schedule.filter(
        { start_time: { $gte: startISO, $lt: endISO }, status: { $ne: 'cancelled' } },
        { sort: 'start_time', limit: 500 }
      );
      const items = (page && page.items) ? page.items : (page || []);
      const cleanerTime = {};
      (items || []).forEach(s => {
        if (!s.start_time) return;
        const hhmm = formatInTimeZone(new Date(s.start_time), TZ, 'HH:mm');
        (s.cleaner_ids || []).forEach(id => {
          if (!cleanerTime[id] || hhmm < cleanerTime[id]) cleanerTime[id] = hhmm;
        });
      });
      setDepartures(cleanerTime);
    } catch (e) {
      console.warn('No se pudieron cargar horarios de salida:', e);
    }
  };

  useEffect(() => {
    load();
    loadCleaners();
    loadBillingNames();
    loadDepartures();
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
    if (Object.keys(userById).length || Object.keys(billingNameMap).length) loadTeams();
    const map = {};
    (cleanersRef.current || []).forEach((u) => {
      const billing = (billingNameMap[u.id] || '').trim();
      if (!billing) return;
      const names = [u.full_name, u.display_name].filter(Boolean).map(s => s.trim());
      names.forEach((n) => { if (n && n !== billing) map[n] = billing; });
    });
    setHandleToBilling(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userById, billingNameMap]);

  const resolveName = (n) => {
    if (n.target === 'all') return n.target_name || 'Todos';
    const stored = n.target_name || '';
    if (n.target === 'team') {
      const s = stored.trim();
      let team = teams.find(t => t.key === s);
      if (!team) team = teams.find(t => s.startsWith(t.key) || t.key.startsWith(s));
      if (!team) {
        team = teams.find(t => (t.firstRaw && s.includes(t.firstRaw)) || (t.firstDisplay && s.includes(t.firstDisplay)));
      }
      if (team && team.members.length) return team.members.join(' · ');
      return stored;
    }
    return handleToBilling[stored] || nameMap[stored] || stored;
  };

  const dayNotices = useMemo(() => notices.filter(n => n.type === 'day' && isVigente(n)), [notices]);
  const officeNotices = useMemo(() => notices.filter(n => n.type === 'office' && isVigente(n)), [notices]);

  const noticesForTeam = (team) => {
    const out = [];
    const memberSet = new Set(team.members.map(norm));
    dayNotices.forEach(n => {
      if (n.target === 'all') { out.push(n); return; }
      if (n.target === 'team') {
        const s = (n.target_name || '').trim();
        if (team.key === s || s.startsWith(team.key) || team.key.startsWith(s) ||
            (team.firstRaw && s.includes(team.firstRaw)) ||
            (team.firstDisplay && s.includes(team.firstDisplay))) {
          out.push(n);
        }
        return;
      }
      if (n.target === 'cleaner') {
        if (memberSet.has(norm(resolveName(n)))) out.push(n);
      }
    });
    return out.sort((a, b) => (b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0));
  };

  const labelFor = (n, team) => {
    if (n.target === 'all') return 'Todos';
    if (n.target === 'team') return team.key;
    return resolveName(n);
  };

  const teamDeparture = (team) => {
    const times = (team.ids || []).map(id => departures[id]).filter(Boolean);
    if (!times.length) return '';
    return [...times].sort()[0];
  };

  // Solo equipos con recordatorios para el día (oculta los vacíos).
  const visible = useMemo(
    () => teams.map(t => ({ team: t, notes: noticesForTeam(t) })).filter(x => x.notes.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teams, dayNotices, handleToBilling, nameMap]
  );
  const oddLast = visible.length % 2 === 1;

  const dateStr = formatInTimeZone(now, TZ, 'EEEE, d MMMM yyyy');
  const timeStr = formatInTimeZone(now, TZ, 'HH:mm');
  const phrase = useMemo(() => getDailyPhrase(now), [dateStr]);

  return (
    <div className="tv-board">
      <style>{`
        @keyframes tv-enter { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        @keyframes tv-glow { 0%,100% { opacity:.45 } 50% { opacity:1 } }
        .tv-board { width:100vw; height:100vh; overflow:hidden; background:#fff; color:#0f1f3a;
          padding: clamp(10px, 1vw, 18px); display:flex; flex-direction:column; gap: clamp(8px, .8vw, 14px);
          font-family: system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; box-sizing:border-box; }
        .tv-board * { box-sizing:border-box; }
        .tv-en { animation: tv-enter .6s cubic-bezier(.2,.75,.25,1) both; }
        .tv-glow { animation: tv-glow 4s ease-in-out infinite; }

        .tv-hdr { flex:none; display:flex; align-items:center; gap: clamp(12px, 1.2vw, 24px);
          border-radius: clamp(14px, 1vw, 20px); padding: clamp(10px, .9vw, 16px) clamp(16px, 1.4vw, 28px);
          background:linear-gradient(115deg,#173e9e 0%,#1d4fd1 68%,#2563eb 100%);
          box-shadow:0 12px 30px rgba(37,99,235,.25); }
        .tv-logo { width: clamp(48px, 4.2vw, 76px); height: clamp(48px, 4.2vw, 76px); flex:none;
          background:rgba(255,255,255,.96); border-radius: clamp(10px, .8vw, 16px); padding: clamp(5px, .5vw, 9px);
          display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(7,23,64,.25); }
        .tv-logo img { max-width:100%; max-height:100%; object-fit:contain; }
        .tv-hm { flex:0 0 auto; display:flex; flex-direction:column; gap: clamp(3px, .3vw, 6px); min-width:0; }
        .tv-date { color:#e8f0ff; font-size: clamp(12px, 1vw, 18px); font-weight:700; letter-spacing:.08em;
          text-transform:uppercase; line-height:1.15; }
        .tv-time { color:#fff; font-size: clamp(26px, 3vw, 52px); font-weight:800; line-height:1; font-variant-numeric:tabular-nums; }
        .tv-ph { flex:1 1 0; display:flex; align-items:center; gap: clamp(10px, .9vw, 18px); min-width:0; justify-content:flex-end; }
        .tv-ph i { width:6px; height: clamp(30px, 3vw, 54px); border-radius:6px; background:#93c5fd; flex:none; }
        .tv-ph p { margin:0; color:#eff6ff; font-size: clamp(14px, 1.4vw, 26px); font-style:italic; line-height:1.3;
          text-align:right; max-width: 60vw; }
        .tv-bar { width:12px; height: clamp(48px, 4.2vw, 76px); background:#93c5fd; border-radius:0 10px 10px 0; align-self:center; flex:none; }

        .tv-cols { flex:1 1 0; min-height:0; display:grid; grid-template-columns: 1fr 1fr;
          grid-auto-rows: 1fr; gap: clamp(10px, .9vw, 16px); overflow:hidden; }
        .tv-col { min-height:0; display:flex; flex-direction:column; overflow:hidden;
          background:#eef3fb; border:2px solid #c5d6ee; border-radius: clamp(16px, 1.1vw, 22px);
          box-shadow:0 12px 28px rgba(37,99,235,.12); }
        .tv-ch { flex:none; background:#173e9e; color:#fff; padding: clamp(12px, 1vw, 20px) clamp(16px, 1.3vw, 26px);
          display:flex; align-items:center; gap: clamp(12px, 1vw, 20px); flex-wrap:wrap; }
        .tv-chl { flex:1 1 auto; display:flex; flex-direction:column; gap: clamp(3px, .3vw, 6px); min-width:0; }
        .tv-cn { font-size: clamp(20px, 2vw, 38px); font-weight:800; line-height:1.1; }
        .tv-cm { font-size: clamp(14px, 1.3vw, 24px); line-height:1.25; color:#dbe8ff; font-weight:600;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .tv-cs { display:inline-block; align-self:center; background:#fff; color:#173e9e; border-radius: clamp(10px, .7vw, 14px);
          padding: clamp(4px, .4vw, 8px) clamp(10px, .9vw, 18px); font-size: clamp(18px, 1.8vw, 34px);
          font-weight:800; font-variant-numeric:tabular-nums; line-height:1.2; flex:none; }
        .tv-cb { flex:1 1 0; min-height:0; overflow-y:auto; padding: clamp(12px, 1vw, 20px);
          display:flex; flex-direction:column; gap: clamp(10px, .9vw, 16px); }
        .tv-cb::-webkit-scrollbar { width:8px; }
        .tv-cb::-webkit-scrollbar-thumb { background:#c5d6ee; border-radius:8px; }
        .tv-nc { background:#fff; border:1px solid #c5d6ee; border-left:10px solid #2563eb;
          border-radius: clamp(12px, .9vw, 18px); padding: clamp(12px, 1vw, 22px) clamp(14px, 1.2vw, 24px);
          display:flex; flex-direction:column; gap: clamp(4px, .4vw, 8px);
          box-shadow:0 6px 14px rgba(23,62,158,.08); }
        .tv-nc.tv-hi { border-left-color:#173e9e; background:#f7faff; }
        .tv-nw { font-size: clamp(12px, 1.1vw, 20px); font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#2563eb; }
        .tv-nt { font-size: clamp(17px, 1.7vw, 30px); font-weight:800; color:#0f1f3a; line-height:1.2; }
        .tv-nb { font-size: clamp(15px, 1.5vw, 26px); line-height:1.4; color:#1e3a5f; margin:0;
          white-space:pre-wrap; word-break:break-word; }
        .tv-empty { grid-column: 1 / -1; display:flex; align-items:center; justify-content:center;
          color:#1e3a5f; font-size: clamp(18px, 1.6vw, 30px); font-weight:600;
          background:#eef3fb; border:2px dashed #c5d6ee; border-radius: clamp(16px, 1.1vw, 22px); }

        .tv-off { flex:none; max-height: clamp(110px, 15vh, 200px); min-height:0; display:flex; flex-direction:column;
          background:#fff; border:2px solid #cdd9e8; border-radius: clamp(14px, 1vw, 20px); overflow:hidden;
          box-shadow:0 10px 24px rgba(37,99,235,.1); }
        .tv-oh { flex:none; display:flex; align-items:center; gap: clamp(10px, .9vw, 16px);
          padding: clamp(8px, .7vw, 14px) clamp(16px, 1.3vw, 26px); background:linear-gradient(90deg,#173e9e,#2563eb); }
        .tv-ol { width: clamp(34px, 2.6vw, 52px); height: clamp(34px, 2.6vw, 52px); background:#fff;
          border-radius: clamp(8px, .6vw, 12px); display:flex; align-items:center; justify-content:center; padding:5px; flex:none; }
        .tv-ol img { max-width:100%; max-height:100%; object-fit:contain; }
        .tv-ot { color:#fff; font-size: clamp(15px, 1.4vw, 26px); font-weight:800; line-height:1.1; }
        .tv-obb { flex:1 1 0; min-height:0; overflow-y:auto; display:grid; grid-template-columns: 1fr 1fr;
          gap: clamp(6px, .5vw, 10px); padding: clamp(8px, .7vw, 14px); align-content:start; }
        .tv-obb::-webkit-scrollbar { width:8px; }
        .tv-obb::-webkit-scrollbar-thumb { background:#cdd9e8; border-radius:8px; }
        .tv-oi { background:#f7faff; border:1px solid #e4ebf5; border-radius: clamp(8px, .6vw, 12px);
          padding: clamp(7px, .6vw, 12px) clamp(10px, .8vw, 16px); }
        .tv-oi b { display:block; color:#0f1f3a; font-size: clamp(13px, 1.2vw, 22px); font-weight:800; margin-bottom:2px; }
        .tv-oi p { margin:0; color:#1e3a5f; font-size: clamp(12px, 1.1vw, 20px); line-height:1.35;
          white-space:pre-wrap; word-break:break-word; }
      `}</style>

      <header className="tv-hdr tv-en" style={{ animationDelay: '.05s' }}>
        <div className="tv-logo"><img src={LOGO} alt="RedOak Cleaning" /></div>
        <div className="tv-hm">
          <div className="tv-date">{dateStr}</div>
          <div className="tv-time">{timeStr}</div>
        </div>
        <div className="tv-ph"><i /><p>"{phrase}"</p></div>
        <div className="tv-bar tv-glow" />
      </header>

      <div className="tv-cols">
        {loading ? (
          <div className="tv-empty">Cargando avisos…</div>
        ) : visible.length === 0 ? (
          <div className="tv-empty">No hay recordatorios de salida para hoy.</div>
        ) : (
          visible.map(({ team, notes }, i) => {
            const isLastOdd = oddLast && i === visible.length - 1;
            const dep = teamDeparture(team);
            return (
              <section
                key={`${team.key}-${i}`}
                className="tv-col tv-en"
                style={{ animationDelay: `${0.15 + i * 0.08}s`, gridColumn: isLastOdd ? '1 / -1' : undefined }}
              >
                <div className="tv-ch">
                  <div className="tv-chl">
                    <div className="tv-cn">{team.key}</div>
                    <div className="tv-cm">{team.members.join(' · ')}</div>
                  </div>
                  <div className="tv-cs">{dep || '—'}</div>
                </div>
                <div className="tv-cb">
                  {notes.map(n => (
                    <div key={n.id} className={`tv-nc${n.priority === 'high' ? ' tv-hi' : ''}`}>
                      <div className="tv-nw">{labelFor(n, team)}</div>
                      {n.title && <div className="tv-nt">{n.title}</div>}
                      <p className="tv-nb">{n.body}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      {officeNotices.length > 0 && (
        <aside className="tv-off tv-en" style={{ animationDelay: '.5s' }}>
          <div className="tv-oh">
            <div className="tv-ol"><img src={LOGO} alt="" /></div>
            <div className="tv-ot">Avisos de la oficina</div>
          </div>
          <div className="tv-obb">
            {officeNotices.map(n => (
              <div key={n.id} className="tv-oi">
                <b>{n.title || 'Aviso'}</b>
                <p>{n.body}</p>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}