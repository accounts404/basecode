import React from 'react';

const AUDIENCE_LABEL = {
  cleaner: 'Limpiador',
  team: 'Equipo',
  all: 'Todos',
};

const COLORS = ['mm-y', 'mm-r', 'mm-g', 'mm-b'];
const ROTATIONS = [0, -1.6, 1.4, -0.8];

export default function NoticeCard({ notice, index = 0 }) {
  const name = notice._displayName || notice.target_name || 'Todos';
  const isHigh = notice.priority === 'high';
  const colorClass = COLORS[index % 4];
  const rotation = ROTATIONS[index % 4];
  const audience = AUDIENCE_LABEL[notice.target] || 'Aviso';

  return (
    <article
      className={`mm-n ${colorClass}`}
      style={{
        transform: `rotate(${rotation}deg)`,
        animationDelay: `${0.15 + index * 0.1}s`,
      }}
      tabIndex={0}
    >
      <div className="mm-pin" />
      {isHigh && <span className="mm-urg">Urgente</span>}
      <div className="mm-aud">{audience}</div>
      <div className="mm-nm">{name}</div>
      {notice.title && <div className="mm-tt">{notice.title}</div>}
      <p className="mm-bd">{notice.body}</p>
    </article>
  );
}