import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { formatInTimeZone } from 'date-fns-tz';
import NoticeCard from './NoticeCard';

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
              specificNotices.slice(0, 10).map((n, i) => <NoticeCard key={n.id} notice={n} index={i} />)
            )}
          </div>

          {allNotices.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {allNotices.slice(0, 2).map((n, i) => <NoticeCard key={n.id} notice={n} index={i} />)}
            </div>
          )}
        </main>

        {/* Rail: office — avisos permanentes siempre visibles */}
        <aside className="hidden lg:flex flex-col border border-[#cdd9e8] rounded-[26px] bg-[#f5f8ff] shadow-[0_12px_30px_rgba(37,99,235,0.10)] p-5 min-h-0 overflow-hidden">
          <div className="flex items-center gap-3 pb-4 border-b-2 border-[#2563eb]/20">
            <div className="h-[64px] w-[64px] flex-shrink-0 flex items-center justify-center bg-white rounded-2xl border border-[#cdd9e8] shadow-sm">
              <img src={LOGO} alt="" className="max-w-full max-h-full object-contain p-1.5" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-[#173e9e] leading-tight">Avisos de la oficina</div>
              <div className="text-xs text-slate-500">Información permanente · Léela todos los días</div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 flex-1 overflow-y-auto pr-1">
            {officeNotices.length === 0 ? (
              <div className="text-center text-slate-400 py-10">Sin avisos de oficina.</div>
            ) : (
              officeNotices.map((n, i) => (
                <div key={n.id} className="tv-slideup rounded-[18px] bg-white border border-[#dbe5f1] shadow-[0_5px_14px_rgba(37,99,235,0.06)] p-4 flex flex-col gap-2"
                  style={{ animationDelay: `${0.45 + i * 0.12}s` }}>
                  {n.title && <div className="text-sm font-bold text-[#1d4fd1] truncate">{n.title}</div>}
                  <div className="overflow-hidden">
                    <p className="text-[#1e3a5f] text-[15px] leading-snug whitespace-pre-wrap">{n.body}</p>
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