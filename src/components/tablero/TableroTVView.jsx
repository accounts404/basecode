import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { formatInTimeZone } from 'date-fns-tz';
import { getDailyPhrase } from './motivationalPhrases';

const LOGO = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/4c3ba79c6_RedOakLogo.png";
const BG = "https://media.base44.com/images/public/688d6a9b330ea09f97a21af4/109c6fa5d_generated_fbb237cc.jpg";
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
  const boardRef = useRef(null);

  // Busca el contenedor scrollable más cercano al tablero (kiosk overlay o área de contenido).
  const findScrollContainer = () => {
    let el = boardRef.current && boardRef.current.parentElement;
    while (el) {
      const style = window.getComputedStyle(el);
      const ov = (style.overflowY || '').toLowerCase();
      const canScroll = (ov === 'auto' || ov === 'scroll') && el.scrollHeight > el.clientHeight + 1;
      if (canScroll) return el;
      el = el.parentElement;
    }
    return null;
  };

  // Auto-scroll pausado para TV: recorre toda la página lentamente para que las
  // notas extensas sean completamente legibles, y reanuda tras interacción manual.
  useEffect(() => {
    const SCROLL_STEP = 1;
    const TICK_MS = 60;
    const PAUSE_MS = 3500;
    const READING_STEPS = 22;
    const READING_PAUSE_MS = 1800;

    let container = findScrollContainer();
    const containerValid = (el) => {
      if (!el || !el.parentElement) return false;
      const ov = (window.getComputedStyle(el).overflowY || '').toLowerCase();
      return (ov === 'auto' || ov === 'scroll') && el.scrollHeight > el.clientHeight + 1;
    };
    const ensure = () => { if (containerValid(container)) return container; container = findScrollContainer(); return container; };
    let paused = false;
    let bottomPauseUntil = 0;
    let topPauseUntil = 0;
    let readingPauseUntil = 0;
    let stepCount = 0;

    const getMax = () => container
      ? container.scrollHeight - container.clientHeight
      : (document.documentElement.scrollHeight || 0) - window.innerHeight;
    const getTop = () => container ? container.scrollTop : (window.scrollY || window.pageYOffset);
    const setTop = (t) => { if (container) container.scrollTop = t; else window.scrollTo({ top: t, behavior: 'auto' }); };

    const tick = () => {
      if (paused) return;
      const now = Date.now();
      if (now < topPauseUntil) return;
      ensure();
      const max = getMax();
      if (max <= 1) return;
      const scrollTop = getTop();
      if (scrollTop >= max - 1) {
        if (bottomPauseUntil === 0) bottomPauseUntil = now + PAUSE_MS;
        if (now < bottomPauseUntil) return;
        setTop(0);
        bottomPauseUntil = 0;
        topPauseUntil = now + PAUSE_MS;
        stepCount = 0;
        return;
      }
      if (now < readingPauseUntil) return;
      setTop(scrollTop + SCROLL_STEP);
      stepCount += 1;
      if (stepCount >= READING_STEPS) { stepCount = 0; readingPauseUntil = now + READING_PAUSE_MS; }
    };

    const id = setInterval(tick, TICK_MS);
    let resumeTimer = null;
    const onWheel = () => { paused = true; if (resumeTimer) clearTimeout(resumeTimer); resumeTimer = setTimeout(() => { paused = false; }, 4000); };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => { clearInterval(id); if (resumeTimer) clearTimeout(resumeTimer); window.removeEventListener('wheel', onWheel); };
  }, [notices, teams]);

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

  // Hora de salida de cada equipo = primer servicio del día de cualquiera de sus miembros.
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

  const dateStr = formatInTimeZone(now, TZ, 'EEEE, d MMMM yyyy');
  const timeStr = formatInTimeZone(now, TZ, 'HH:mm');
  const phrase = useMemo(() => getDailyPhrase(now), [dateStr]);

  return (
    <div ref={boardRef} className="tv-board">
      <style>{`
        @keyframes tv-enter { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
        @keyframes tv-glow { 0%,100% { opacity:.45 } 50% { opacity:1 } }
        .tv-board { width:100%; min-height:100vh; position:relative; background:#fff; color:#0f1f3a;
          padding: clamp(16px, 1.6vw, 32px); display:flex; flex-direction:column; gap: clamp(14px, 1.4vw, 28px);
          font-family: system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; box-sizing:border-box; }
        .tv-board * { box-sizing:border-box; }
        .tv-bg { position:absolute; left:0; top:0; width:100%; height:44vh; max-height:760px; object-fit:cover; opacity:.55; z-index:0; pointer-events:none; }
        .tv-scrim { position:absolute; left:0; top:0; width:100%; height:44vh; max-height:760px;
          background:linear-gradient(180deg,rgba(255,255,255,.25),#fff 100%); z-index:0; pointer-events:none; }
        .tv-board > *:not(.tv-bg):not(.tv-scrim) { position:relative; z-index:1; }
        .tv-en { animation: tv-enter .7s cubic-bezier(.2,.75,.25,1) both; }
        .tv-glow { animation: tv-glow 4s ease-in-out infinite; }

        .tv-hdr { display:flex; align-items:center; gap: clamp(16px, 1.8vw, 36px);
          border-radius: clamp(20px, 1.6vw, 32px); padding: clamp(20px, 2.6vw, 52px) clamp(20px, 2.6vw, 52px);
          background:linear-gradient(115deg,#173e9e 0%,#1d4fd1 68%,#2563eb 100%);
          box-shadow:0 22px 46px rgba(37,99,235,.28); }
        .tv-logo { width: clamp(72px, 7.5vw, 150px); height: clamp(72px, 7.5vw, 150px); flex:none;
          background:rgba(255,255,255,.96); border-radius: clamp(14px, 1.3vw, 26px); padding: clamp(8px, .8vw, 14px);
          display:flex; align-items:center; justify-content:center; box-shadow:0 8px 20px rgba(7,23,64,.25); }
        .tv-logo img { max-width:100%; max-height:100%; object-fit:contain; }
        .tv-hm { flex:1; display:flex; flex-direction:column; gap: clamp(6px, .5vw, 10px); min-width:0; }
        .tv-date { color:#e8f0ff; font-size: clamp(16px, 1.5vw, 30px); font-weight:700; letter-spacing:.08em;
          text-transform:uppercase; line-height:1.2; }
        .tv-tr { display:flex; align-items:center; gap: clamp(16px, 2.2vw, 44px); flex-wrap:wrap; }
        .tv-time { color:#fff; font-size: clamp(48px, 6.3vw, 128px); font-weight:800; line-height:1; font-variant-numeric:tabular-nums; }
        .tv-ph { display:flex; align-items:center; gap: clamp(10px, .9vw, 18px); max-width: min(1000px, 52vw); }
        .tv-ph i { width:6px; height: clamp(36px, 3.6vw, 72px); border-radius:6px; background:#93c5fd; flex:none; }
        .tv-ph p { margin:0; color:#eff6ff; font-size: clamp(18px, 1.8vw, 36px); font-style:italic; line-height:1.3; }
        .tv-sub { color:#cfe0ff; font-size: clamp(13px, 1.2vw, 24px); line-height:1.2; }
        .tv-bar { width:14px; height: clamp(72px, 7.5vw, 150px); background:#93c5fd; border-radius:0 12px 12px 0; align-self:flex-end; }

        .tv-cols { display:grid; grid-template-columns: repeat(auto-fit, minmax(clamp(260px, 22vw, 460px), 1fr));
          gap: clamp(14px, 1.4vw, 28px); }
        .tv-col { background:#eef3fb; border:2px solid #c5d6ee; border-radius: clamp(20px, 1.4vw, 28px); overflow:hidden;
          box-shadow:0 14px 30px rgba(37,99,235,.12); display:flex; flex-direction:column; }
        .tv-ch { background:#173e9e; color:#fff; padding: clamp(16px, 1.3vw, 26px) clamp(18px, 1.6vw, 32px);
          display:flex; flex-direction:column; gap: clamp(6px, .5vw, 10px); }
        .tv-cn { font-size: clamp(24px, 2.3vw, 46px); font-weight:800; line-height:1.1; }
        .tv-cm { font-size: clamp(15px, 1.4vw, 28px); line-height:1.3; color:#dbe8ff; font-weight:600; }
        .tv-cs { display:inline-block; align-self:flex-start; background:#fff; color:#173e9e; border-radius: clamp(10px, .7vw, 14px);
          padding: clamp(4px, .4vw, 6px) clamp(10px, .9vw, 18px); font-size: clamp(18px, 1.7vw, 34px);
          font-weight:800; font-variant-numeric:tabular-nums; line-height:1.2; }
        .tv-cb { padding: clamp(16px, 1.2vw, 24px); display:flex; flex-direction:column; gap: clamp(12px, 1vw, 20px); }
        .tv-nc { background:#fff; border:1px solid #c5d6ee; border-left:10px solid #2563eb;
          border-radius: clamp(14px, 1vw, 20px); padding: clamp(14px, 1.1vw, 26px) clamp(16px, 1.3vw, 26px);
          display:flex; flex-direction:column; gap: clamp(5px, .4vw, 8px);
          box-shadow:0 6px 14px rgba(23,62,158,.08); transition:box-shadow .2s,background-color .2s; cursor:pointer; }
        .tv-nc:hover { box-shadow:0 10px 22px rgba(37,99,235,.2); background:#f7faff; }
        .tv-nc.tv-hi { border-left-color:#173e9e; }
        .tv-nw { font-size: clamp(12px, 1.1vw, 22px); font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#2563eb; }
        .tv-nt { font-size: clamp(18px, 1.7vw, 34px); font-weight:800; color:#0f1f3a; line-height:1.2; }
        .tv-nb { font-size: clamp(15px, 1.4vw, 28px); line-height:1.45; color:#1e3a5f; margin:0;
          white-space:pre-wrap; word-break:break-word; }
        .tv-rest { display:flex; flex-direction:column; gap: clamp(8px, .6vw, 12px); }
        .tv-msg { text-align:center; color:#1e3a5f; font-size: clamp(16px, 1.5vw, 30px); font-weight:600;
          background:#eef3fb; border:2px dashed #c5d6ee; border-radius: clamp(14px, 1vw, 20px);
          padding: clamp(14px, 1.1vw, 22px); }

        .tv-off { background:#fff; border:2px solid #cdd9e8; border-radius: clamp(20px, 1.4vw, 28px);
          box-shadow:0 12px 30px rgba(37,99,235,.12); overflow:hidden; }
        .tv-oh { display:flex; align-items:center; gap: clamp(12px, 1vw, 20px); padding: clamp(12px, .9vw, 18px) clamp(20px, 1.6vw, 32px);
          background:linear-gradient(90deg,#173e9e,#2563eb); }
        .tv-ol { width: clamp(44px, 3.4vw, 68px); height: clamp(44px, 3.4vw, 68px); background:#fff;
          border-radius: clamp(10px, .8vw, 16px); display:flex; align-items:center; justify-content:center; padding:6px; flex:none; }
        .tv-ol img { max-width:100%; max-height:100%; object-fit:contain; }
        .tv-ot { color:#fff; font-size: clamp(20px, 1.9vw, 38px); font-weight:800; line-height:1.1; }
        .tv-os { color:#dbe8ff; font-size: clamp(13px, 1.2vw, 24px); line-height:1.3; }
        .tv-off table { border-collapse:separate; border-spacing:0; width:100%; font-variant-numeric:tabular-nums; }
        .tv-off th { padding: clamp(10px, .8vw, 16px) clamp(18px, 1.6vw, 32px); font-size: clamp(12px, 1.1vw, 22px);
          font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#173e9e;
          border-bottom:2px solid #c5d6ee; text-align:left; background:#eef3fb; }
        .tv-off td { padding: clamp(12px, .9vw, 18px) clamp(18px, 1.6vw, 32px); vertical-align:top;
          border-bottom:1px solid #e4ebf5; font-size: clamp(15px, 1.4vw, 28px); line-height:1.45; color:#1e3a5f; }
        .tv-off tr:nth-child(odd) td { background:#f7faff; }
        .tv-off td.tv-tt { font-weight:800; color:#0f1f3a; font-size: clamp(16px, 1.5vw, 30px); width:30%; }
        .tv-off td p { margin:0; white-space:pre-wrap; word-break:break-word; }
      `}</style>

      <img className="tv-bg" src={BG} alt="" />
      <div className="tv-scrim" />

      <header className="tv-hdr tv-en" style={{ animationDelay: '.15s' }}>
        <div className="tv-logo"><img src={LOGO} alt="RedOak Cleaning" /></div>
        <div className="tv-hm">
          <div className="tv-date">{dateStr}</div>
          <div className="tv-tr">
            <div className="tv-time">{timeStr}</div>
            <div className="tv-ph"><i /><p>"{phrase}"</p></div>
          </div>
          <div className="tv-sub">Tablero del día · RedOak Cleaning</div>
        </div>
        <div className="tv-bar tv-glow" />
      </header>

      {loading ? (
        <div className="tv-rest tv-en"><div className="tv-msg">Cargando avisos…</div></div>
      ) : teams.length === 0 ? (
        <div className="tv-rest tv-en"><div className="tv-msg">No hay equipos asignados para hoy.</div></div>
      ) : (
        <div className="tv-cols">
          {teams.map((team, i) => {
            const tn = noticesForTeam(team);
            const dep = teamDeparture(team);
            return (
              <section key={`${team.key}-${i}`} className="tv-col tv-en" style={{ animationDelay: `${0.3 + i * 0.12}s` }}>
                <div className="tv-ch">
                  <div className="tv-cn">{team.key}</div>
                  <div className="tv-cm">{team.members.join(' · ')}</div>
                  <div className="tv-cs">{dep || '—'}</div>
                </div>
                <div className="tv-cb">
                  {tn.length === 0 ? (
                    <div className="tv-msg">Sin recordatorios para este equipo.</div>
                  ) : tn.map(n => (
                    <div key={n.id} className={`tv-nc${n.priority === 'high' ? ' tv-hi' : ''}`}>
                      <div className="tv-nw">{labelFor(n, team)}</div>
                      {n.title && <div className="tv-nt">{n.title}</div>}
                      <p className="tv-nb">{n.body}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <aside className="tv-off tv-en" style={{ animationDelay: '.9s' }}>
        <div className="tv-oh">
          <div className="tv-ol"><img src={LOGO} alt="" /></div>
          <div>
            <div className="tv-ot">Avisos de la oficina</div>
            <div className="tv-os">Información permanente · Léela todos los días</div>
          </div>
        </div>
        <table>
          <thead><tr><th>Título</th><th>Mensaje</th></tr></thead>
          <tbody>
            {officeNotices.length === 0 ? (
              <tr><td className="tv-tt">Sin avisos de oficina.</td><td><p>Sin avisos de oficina.</p></td></tr>
            ) : officeNotices.map(n => (
              <tr key={n.id}>
                <td className="tv-tt">{n.title || 'Aviso'}</td>
                <td><p>{n.body}</p></td>
              </tr>
            ))}
          </tbody>
        </table>
      </aside>
    </div>
  );
}