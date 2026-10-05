import React from 'react';
import NoticeBody from './NoticeBody';

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
  const name = notice._displayName || notice.target_name || 'Todos';
  const initial = (name || '?').charAt(0).toUpperCase();
  const isHigh = notice.priority === 'high';
  const accent = isHigh ? DANGER : BRAND;
  const audience = AUDIENCE_LABEL[notice.target] || 'Aviso';

  return (
    <article
      className="tv-notice relative flex flex-col rounded-3xl bg-white border shadow-[0_10px_28px_rgba(15,31,58,0.10)] overflow-hidden tv-enter"
      style={{
        animationDelay: `${index * 0.08}s`,
        borderColor: isHigh ? '#fca5a5' : '#d8e1ee',
      }}
    >
      {/* Barra de acento superior */}
      <div className="h-1.5 w-full" style={{ background: accent }} />

      {/* Encabezado: destinatario + prioridad */}
      <div className="flex items-center gap-4 px-5 py-4 bg-[#f5f8ff] border-b border-[#e3ebf7]">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-white font-bold text-xl shadow-sm"
          style={{ background: `linear-gradient(135deg, ${accent}, ${isHigh ? '#b91c1c' : BRAND_DEEP})` }}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{audience}</div>
          <div className="text-lg font-bold text-[#0f1f3a] leading-tight truncate">{name}</div>
          {notice.title && (
            <div className="text-sm text-slate-500 truncate mt-0.5">{notice.title}</div>
          )}
        </div>
        {isHigh && (
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full text-white flex-shrink-0"
            style={{ background: DANGER }}
          >
            Urgente
          </span>
        )}
      </div>

      {/* Cuerpo del mensaje */}
      <div className="flex-1 px-5 py-4 min-h-[120px]">
        <NoticeBody text={notice.body} />
      </div>
    </article>
  );
}