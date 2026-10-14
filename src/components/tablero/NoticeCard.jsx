import React from 'react';

const BRAND = '#2563eb';
const BRAND_DEEP = '#173e9e';
const DANGER = '#dc2626';
const DANGER_SOFT = '#fee2e2';
const DANGER_DEEP = '#991b1b';

const AUDIENCE_LABEL = {
  cleaner: 'Limpiador',
  team: 'Equipo',
  all: 'Todos',
};

export default function NoticeCard({ notice, index = 0 }) {
  const rawName = notice._displayName || notice.target_name || 'Todos';
  const name = rawName.includes(' · ') ? rawName.split(' · ').pop().trim() : rawName;
  const initial = (name || '?').charAt(0).toUpperCase();
  const isHigh = notice.priority === 'high';
  const accent = isHigh ? DANGER : BRAND;
  const audience = AUDIENCE_LABEL[notice.target] || 'Aviso';

  return (
    <article
      className="tv-notice relative flex flex-col rounded-2xl bg-white border overflow-hidden"
      style={{
        animationDelay: `${index * 0.06}s`,
        borderColor: isHigh ? '#fca5a5' : '#d8e1ee',
        boxShadow: '0 6px 18px rgba(15,31,58,0.08)',
      }}
    >
      {/* Barra de acento superior */}
      <div className="tv-notice-bar w-full flex-shrink-0" style={{ background: accent, height: 'clamp(3px, 0.7cqh, 6px)' }} />

      {/* Encabezado compacto */}
      <div className="tv-notice-head flex items-center gap-2 px-3 py-2 bg-[#f5f8ff] border-b border-[#e3ebf7] flex-shrink-0">
        <div
          className="rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${accent}, ${isHigh ? '#b91c1c' : BRAND_DEEP})`,
            width: 'clamp(26px, 4.5cqw, 40px)',
            height: 'clamp(26px, 4.5cqw, 40px)',
            fontSize: 'clamp(0.7rem, 1.6cqw, 1.05rem)',
          }}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold uppercase tracking-wider text-slate-500" style={{ fontSize: 'clamp(0.5rem, 1cqw, 0.65rem)' }}>{audience}</div>
          <div className="font-bold text-[#0f1f3a] leading-tight truncate" style={{ fontSize: 'clamp(0.7rem, 1.7cqw, 1rem)' }}>{name}</div>
          {notice.title && (
            <div className="font-extrabold text-[#173e9e] truncate" style={{ fontSize: 'clamp(0.8rem, 2.1cqw, 1.25rem)', letterSpacing: '0.01em' }}>{notice.title}</div>
          )}
        </div>
        {isHigh && (
          <span
            className="font-bold uppercase tracking-wide rounded-full text-white flex-shrink-0"
            style={{ background: DANGER, fontSize: 'clamp(0.45rem, 0.9cqw, 0.6rem)', padding: '2px 6px' }}
          >
            Urgente
          </span>
        )}
      </div>

      {/* Cuerpo: se ajusta al alto disponible; el texto se encoge con cqw/cqh */}
      <div className="tv-notice-body flex-1 min-h-0 overflow-hidden px-3 py-2">
        <p
          className="text-[#1e3a5f] whitespace-pre-wrap"
          style={{
            fontSize: 'clamp(0.72rem, min(3.1cqw, 5cqh), 1.35rem)',
            lineHeight: 1.3,
            overflowWrap: 'anywhere',
            margin: 0,
          }}
        >
          {notice.body}
        </p>
      </div>

      <style>{`
        .tv-notice { container-type: size; height: 100%; min-height: 0; }
        @keyframes tv-enter { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        .tv-notice { animation: tv-enter .5s ease-out both; }
      `}</style>
    </article>
  );
}