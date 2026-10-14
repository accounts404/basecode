import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { formatInTimeZone } from 'date-fns-tz';
import NoticeCard from './NoticeCard';
import { getDailyPhrase } from './motivationalPhrases';

const LOGO = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/4c3ba79c6_RedOakLogo.png";
const CORK = "https://media.base44.com/images/public/688d6a9b330ea09f97a21af4/694cc365c_generated_0b53f1e9.jpg";
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

export default function TableroTVView() {
  const [notices, setNotices] = useState([]);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [nameMap, setNameMap] = useState({});
  const [userById, setUserById] = useState({});
  const [billingNameMap, setBillingNameMap] = useState({});
  const [handleToBilling, setHandleToBilling] = useState({});
  const [teams, setTeams] = useState([]);
  const cleanersRef = useRef([]);

  // Auto-scroll para TV: recorre la página lentamente, pausa al final y vuelve arriba.
  const boardRef = useRef(null);

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
    const ensure = () => {
      if (containerValid(container)) return container;
      container = findScrollContainer();
      return container;
    };
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
      if (stepCount >= READING_STEPS) {
        stepCount = 0;
        readingPauseUntil = now + READING_PAUSE_MS;
      }
    };

    const id = setInterval(tick, TICK_MS);
    let resumeTimer = null;
    const onWheel = () => {
      paused = true;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { paused = false; }, 4000);
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      clearInterval(id);
      if (resumeTimer) clearTimeout(resumeTimer);
      window.removeEventListener('wheel', onWheel);
    };
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
      const page = await base44.entities.WorkEntry.filter(
        {},
        { sort: '-created_date', limit: 300 }
      );
      const items = (page && page.items) ? page.items : (page || []);
      const map = {};
      (items || []).forEach((e) => {
        const name = (e.cleaner_name || '').trim();
        if (e.cleaner_id && name && !map[e.cleaner_id]) {
          map[e.cleaner_id] = name;
        }
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
    loadBillingNames();
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
        team = teams.find(t =>
          (t.firstRaw && s.includes(t.firstRaw)) ||
          (t.firstDisplay && s.includes(t.firstDisplay))
        );
      }
      if (team && team.members.length) return team.members.join(' · ');
      return stored;
    }
    return handleToBilling[stored] || nameMap[stored] || stored;
  };

  const dayNotices = useMemo(() => notices.filter(n => n.type === 'day' && isVigente(n)), [notices]);
  const allNotices = useMemo(() => dayNotices.filter(n => n.target === 'all'), [dayNotices]);
  const specificNotices = useMemo(() => dayNotices.filter(n => n.target !== 'all'), [dayNotices]);
  const officeNotices = useMemo(() => notices.filter(n => n.type === 'office' && isVigente(n)), [notices]);

  // Agrupar recordatorios por destinatario (chica/equipo) en columnas del mural.
  const specificCols = useMemo(() => {
    const groups = {};
    specificNotices.forEach((n) => {
      const name = resolveName(n) || 'Otros';
      if (!groups[name]) groups[name] = { who: name, notes: [] };
      groups[name].notes.push(n);
    });
    return Object.values(groups);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specificNotices, teams, handleToBilling, nameMap]);

  // "Para todos" queda al centro del mural.
  const orderedCols = useMemo(() => {
    const half = Math.ceil(specificCols.length / 2);
    const left = specificCols.slice(0, half);
    const right = specificCols.slice(half);
    const middle = allNotices.length ? [{ who: 'Para todos', notes: allNotices, all: true }] : [];
    return [...left, ...middle, ...right];
  }, [specificCols, allNotices]);

  const dateStr = formatInTimeZone(now, TZ, 'EEEE, d MMMM yyyy');
  const timeStr = formatInTimeZone(now, TZ, 'HH:mm');
  const phrase = useMemo(() => getDailyPhrase(now), [dateStr]);

  return (
    <div ref={boardRef} className="mm-board min-h-screen w-full">
      <style>{`
        .mm-board { position:relative; background:#e7d8b5; color:#1f2937; font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; overflow:hidden; }
        .mm-cork { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.55; pointer-events:none; z-index:0; }
        .mm-in { position:relative; z-index:1; padding:clamp(20px,3vw,48px) clamp(24px,4vw,72px) clamp(36px,4vw,72px); display:flex; flex-direction:column; gap:clamp(28px,3vw,44px); }

        .mm-hd { display:flex; align-items:center; gap:clamp(20px,2vw,36px); background:#fffaf0; border-radius:28px; padding:clamp(20px,2vw,28px) clamp(24px,2.5vw,40px); box-shadow:0 14px 34px rgba(80,55,15,.28); border:1px solid #d9c593; animation:mm-drop .8s cubic-bezier(.2,.8,.25,1) both; }
        .mm-logo { width:clamp(80px,6vw,120px); height:clamp(80px,6vw,120px); background:#fff; border-radius:22px; padding:10px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(0,0,0,.15); flex:none; }
        .mm-logo img { max-width:100%; max-height:100%; object-fit:contain; }
        .mm-hm { flex:1; display:flex; flex-direction:column; gap:6px; min-width:0; }
        .mm-dt { font-size:clamp(18px,1.3vw,26px); font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#2563eb; }
        .mm-tm { display:flex; align-items:flex-end; gap:clamp(20px,2vw,36px); flex-wrap:wrap; }
        .mm-clk { font-size:clamp(64px,5.5vw,112px); font-weight:800; line-height:1; font-variant-numeric:tabular-nums; color:#1f2937; }
        .mm-ph { display:flex; gap:16px; align-items:center; max-width:900px; margin-bottom:10px; }
        .mm-ph i { width:6px; height:clamp(36px,2.8vw,56px); background:#2563eb; border-radius:4px; flex:none; display:block; }
        .mm-ph p { margin:0; font-size:clamp(20px,1.5vw,30px); font-style:italic; line-height:1.3; color:#374151; }
        .mm-sub { font-size:clamp(15px,1.1vw,22px); color:#6b7280; margin-top:4px; }

        .mm-wall { display:grid; grid-template-columns:1fr; gap:28px; align-items:stretch; }
        @media (min-width:900px){ .mm-wall { grid-template-columns:repeat(3,1fr); gap:40px; } }
        .mm-col { display:flex; flex-direction:column; gap:clamp(22px,1.8vw,30px); background:rgba(255,250,235,.35); border:2px dashed rgba(120,90,40,.35); border-radius:26px; padding:clamp(20px,1.6vw,28px); }
        .mm-who { font-family:"Segoe Script","Bradley Hand","Brush Script MT","Comic Sans MS",cursive; font-size:clamp(34px,2.7vw,54px); font-weight:700; color:#1f2937; line-height:1.1; padding:0 8px; }
        .mm-col.mm-all { background:rgba(255,255,255,.55); border:3px solid #2563eb; box-shadow:0 18px 40px rgba(37,99,235,.28); transform:scale(1.03); }
        .mm-col.mm-all .mm-n { padding:clamp(36px,2.6vw,48px) clamp(28px,2.2vw,40px) clamp(30px,2.2vw,40px); }
        .mm-col.mm-all .mm-bd { font-size:clamp(22px,1.7vw,34px); }
        .mm-col.mm-all .mm-nm { font-size:clamp(36px,2.8vw,56px); }

        .mm-n { position:relative; border-radius:6px 6px 22px 6px; padding:clamp(30px,2.2vw,40px) clamp(24px,1.8vw,32px) clamp(26px,1.8vw,32px); box-shadow:0 12px 22px rgba(60,40,10,.28),0 2px 3px rgba(0,0,0,.15); animation:mm-stick .9s cubic-bezier(.3,1.6,.5,1) both; animation-fill-mode:both; transition:box-shadow .2s,filter .2s; cursor:pointer; }
        .mm-n:hover { box-shadow:0 16px 28px rgba(60,40,10,.35); filter:saturate(1.1); }
        .mm-n:focus-visible { outline:3px solid #2563eb; }
        .mm-y { background:#fde68a; } .mm-r { background:#fbcfe8; } .mm-g { background:#bbf7d0; } .mm-b { background:#bfdbfe; }
        .mm-pin { width:clamp(20px,1.4vw,28px); height:clamp(20px,1.4vw,28px); border-radius:50%; background:radial-gradient(circle at 35% 30%,#f87171,#b91c1c); box-shadow:0 3px 5px rgba(0,0,0,.35); position:absolute; top:-12px; left:50%; margin-left:calc(clamp(20px,1.4vw,28px) / -2); }
        .mm-aud { font-size:clamp(12px,.8vw,16px); font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#4b5563; }
        .mm-nm { font-family:"Segoe Script","Bradley Hand","Brush Script MT","Comic Sans MS",cursive; font-size:clamp(26px,2vw,40px); font-weight:700; margin:6px 0; line-height:1.15; color:#1f2937; }
        .mm-tt { font-size:clamp(18px,1.2vw,24px); font-weight:600; color:#374151; margin-bottom:10px; }
        .mm-bd { margin:0; font-size:clamp(18px,1.4vw,28px); line-height:1.5; white-space:pre-wrap; color:#1f2937; word-break:break-word; }
        .mm-urg { position:absolute; top:18px; right:18px; background:#dc2626; color:#fff; font-size:clamp(12px,.75vw,15px); font-weight:800; letter-spacing:.1em; text-transform:uppercase; padding:6px 14px; border-radius:999px; }

        .mm-off { position:relative; background:#fffaf0; border:1px solid #d9c593; border-radius:28px; padding:clamp(24px,2vw,36px) clamp(28px,2.4vw,44px); box-shadow:0 14px 34px rgba(80,55,15,.26); }
        .mm-ph2 { height:clamp(160px,13vw,260px); width:100%; object-fit:cover; border-radius:18px; margin-bottom:26px; display:block; }
        .mm-oh { display:flex; align-items:center; gap:22px; margin-bottom:26px; }
        .mm-ol { width:clamp(56px,3.8vw,76px); height:clamp(56px,3.8vw,76px); background:#fff; border-radius:18px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(0,0,0,.15); flex:none; }
        .mm-ol img { max-width:90%; max-height:90%; object-fit:contain; }
        .mm-ot { font-size:clamp(28px,2.2vw,44px); font-weight:800; color:#1d4fd1; }
        .mm-os { font-size:clamp(15px,1.1vw,22px); color:#6b7280; }
        .mm-tb { width:100%; border-collapse:separate; border-spacing:0 10px; }
        .mm-tb th { text-align:left; font-size:clamp(13px,1vw,20px); font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:#173e9e; padding:8px 22px; }
        .mm-tb td { background:#fff; padding:20px 22px; font-size:clamp(18px,1.3vw,26px); line-height:1.5; vertical-align:top; border-top:1px solid #e5e7eb; border-bottom:1px solid #e5e7eb; }
        .mm-tb td:first-child { font-weight:700; width:30%; border-left:6px solid #2563eb; border-radius:12px 0 0 12px; color:#1f2937; }
        .mm-tb td:last-child { border-radius:0 12px 12px 0; border-right:1px solid #e5e7eb; }
        .mm-tb td p { margin:0; white-space:pre-wrap; word-break:break-word; }

        .mm-st { display:flex; flex-direction:column; gap:6px; color:#6b7280; font-size:clamp(18px,1.4vw,22px); text-align:center; padding:48px 24px; background:rgba(255,250,235,.5); border-radius:24px; border:2px dashed rgba(120,90,40,.3); }

        @keyframes mm-drop { from{opacity:0;transform:translateY(-30px)} to{opacity:1;transform:none} }
        @keyframes mm-stick { 0%{opacity:0;transform:translateY(-40px) scale(1.15) rotate(4deg)} 60%{opacity:1;transform:translateY(6px) scale(.98)} 100%{opacity:1} }
        @keyframes mm-sway { 0%,100%{transform:rotate(-.6deg)} 50%{transform:rotate(.6deg)} }
      `}</style>

      <img className="mm-cork" src={CORK} alt="" />

      <div className="mm-in">
        <header className="mm-hd">
          <div className="mm-logo"><img src={LOGO} alt="RedOak Cleaning" /></div>
          <div className="mm-hm">
            <div className="mm-dt">{dateStr}</div>
            <div className="mm-tm">
              <div className="mm-clk">{timeStr}</div>
              <div className="mm-ph"><i /><p>"{phrase}"</p></div>
            </div>
            <div className="mm-sub">Tablero del día · RedOak Cleaning</div>
          </div>
        </header>

        {loading ? (
          <div className="mm-st">Cargando avisos…</div>
        ) : orderedCols.length === 0 ? (
          <div className="mm-st">No hay notas del día para limpiadores.</div>
        ) : (
          <section className="mm-wall">
            {orderedCols.map((col) => (
              <div key={col.who} className={`mm-col ${col.all ? 'mm-all' : ''}`}>
                <div className="mm-who">{col.who}</div>
                {col.notes.map((n, i) => (
                  <NoticeCard
                    key={n.id}
                    notice={{ ...n, _displayName: col.all ? 'Para todos' : resolveName(n) }}
                    index={i}
                  />
                ))}
              </div>
            ))}
          </section>
        )}

        <section className="mm-off">
          <img className="mm-ph2" src={CORK} alt="" />
          <div className="mm-oh">
            <div className="mm-ol"><img src={LOGO} alt="" /></div>
            <div>
              <div className="mm-ot">Avisos de la oficina</div>
              <div className="mm-os">Información permanente · Léela todos los días</div>
            </div>
          </div>
          <table className="mm-tb">
            <thead>
              <tr><th>Título</th><th>Mensaje</th></tr>
            </thead>
            <tbody>
              {officeNotices.length === 0 ? (
                <tr><td>Aviso</td><td><p>Sin avisos de oficina.</p></td></tr>
              ) : (
                officeNotices.map((n) => (
                  <tr key={n.id}>
                    <td>{n.title || 'Aviso'}</td>
                    <td><p>{n.body}</p></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}