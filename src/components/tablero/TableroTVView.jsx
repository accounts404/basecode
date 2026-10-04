import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { formatInTimeZone } from 'date-fns-tz';
import NoticeCard from './NoticeCard';

const HERO_IMG = "https://media.base44.com/images/public/688d6a9b330ea09f97a21af4/c3fcf769e_generated_712b4a08.jpg";
const TZ = 'Australia/Melbourne';
const OFFICE_ROTATION_MS = 8000;
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
  const [officeOffset, setOfficeOffset] = useState(0);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    load();
    const refresh = setInterval(load, REFRESH_MS);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(refresh); clearInterval(clock); };
  }, []);

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

  useEffect(() => {
    if (officeNotices.length <= 3) return;
    const t = setInterval(() => {
      setOfficeOffset(o => (o + 3) % officeNotices.length);
    }, OFFICE_ROTATION_MS);
    return () => clearInterval(t);
  }, [officeNotices.length]);

  const visibleOffice = useMemo(() => {
    if (officeNotices.length === 0) return [];
    const out = [];
    for (let i = 0; i < Math.min(3, officeNotices.length); i++) {
      out.push(officeNotices[(officeOffset + i) % officeNotices.length]);
    }
    return out;
  }, [officeNotices, officeOffset]);

  const dateStr = formatInTimeZone(now, TZ, 'EEEE, d MMMM yyyy');
  const timeStr = formatInTimeZone(now, TZ, 'HH:mm');

  return (
    <div className="tv-board bg-white text-[#172c43] h-screen w-full overflow-hidden flex flex-col p-5 lg:p-7 relative">
      <style>{`
        @keyframes tv-enter { from { opacity:0; transform:translateY(18px) } to { opacity:1; transform:translateY(0) } }
        @keyframes tv-slideup { 0% { opacity:0; transform:translateY(22px) } 100% { opacity:1; transform:translateY(0) } }
        @keyframes tv-glow { 0%,100% { opacity:.45 } 50% { opacity:1 } }
        .tv-enter { animation: tv-enter .7s cubic-bezier(.2,.75,.25,1) both; }
        .tv-slideup { animation: tv-slideup 1s cubic-bezier(.22,.7,.2,1) both; }
        .tv-glow { animation: tv-glow 4s ease-in-out infinite; }
      `}</style>

      {/* Mast */}
      <header className="tv-enter relative h-[140px] lg:h-[180px] rounded-[28px] overflow-hidden flex items-stretch shadow-[0_18px_38px_rgba(20,63,97,0.18)]"
        style={{ background: 'linear-gradient(115deg,#123e68 0%,#17558a 68%,#2678a7 100%)' }}>
        <img src={HERO_IMG} alt="" className="absolute right-0 top-0 h-full w-[55%] object-cover object-center opacity-80" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg,rgba(10,39,65,0.7),rgba(10,39,65,0.12) 73%,rgba(10,39,65,0.08))' }} />
        <div className="relative z-10 w-full px-6 lg:px-10 py-6 flex flex-col justify-center">
          <div className="text-white/90 text-sm lg:text-lg font-semibold tracking-wide uppercase">{dateStr}</div>
          <div className="text-white text-5xl lg:text-7xl font-bold leading-none mt-1">{timeStr}</div>
          <div className="text-white/70 text-xs lg:text-sm mt-2">Tablero del día · RedOak Cleaning</div>
        </div>
        <div className="relative z-10 self-end m-6 hidden lg:flex">
          <div className="tv-glow h-[120px] w-2.5 rounded-r-lg" style={{ background: '#4c9fc3' }} />
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
              specificNotices.slice(0, 10).map((n, i) => <NoticeCard key={n.id} notice={n} index={i} />)
            )}
          </div>

          {allNotices.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {allNotices.slice(0, 2).map((n, i) => <NoticeCard key={n.id} notice={n} index={i} />)}
            </div>
          )}
        </main>

        {/* Rail: office rotating */}
        <aside className="hidden lg:flex flex-col border border-[#d8e0e8] rounded-[26px] bg-[#f8fafb] shadow-[0_12px_30px_rgba(30,59,83,0.09)] p-5 min-h-0 overflow-hidden">
          <div className="h-[220px] rounded-[19px] overflow-hidden relative bg-[#dce8ef]">
            <img src={HERO_IMG} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(17,54,82,0.06),rgba(15,49,75,0.35))' }} />
            <div className="absolute bottom-3 left-4 text-white font-bold text-lg drop-shadow">Avisos de la oficina</div>
          </div>
          <div className="mt-4 flex flex-col gap-4 flex-1 overflow-hidden">
            {visibleOffice.length === 0 ? (
              <div className="text-center text-slate-400 py-10">Sin avisos de oficina.</div>
            ) : (
              visibleOffice.map((n, i) => (
                <div key={n.id} className="tv-slideup h-[150px] rounded-[18px] bg-white/80 border border-[#dce4ea] shadow-[0_5px_14px_rgba(21,51,72,0.05)] p-4 flex flex-col gap-3"
                  style={{ animationDelay: `${0.45 + i * 0.15}s` }}>
                  {n.title && <div className="text-sm font-bold text-[#17558a] truncate">{n.title}</div>}
                  <div className="flex-1 overflow-hidden">
                    <p className="text-[#2b4663] text-[15px] leading-snug whitespace-pre-wrap">{n.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}