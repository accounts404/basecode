import React from 'react';

export default function ChristmasDecoration() {
  return (
    <>
      {/* Nieve cayendo */}
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-snow"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${5 + Math.random() * 10}s`,
              fontSize: `${10 + Math.random() * 10}px`,
              opacity: 0.6 + Math.random() * 0.4
            }}
          >
            ❄️
          </div>
        ))}
      </div>

      {/* Luces navideñas en el borde superior */}
      <div className="fixed top-0 left-0 right-0 h-8 pointer-events-none z-40 flex justify-around items-center bg-gradient-to-b from-green-800/20 to-transparent">
        {[...Array(20)].map((_, i) => {
          const colors = ['text-red-500', 'text-yellow-400', 'text-green-500', 'text-blue-500'];
          return (
            <div
              key={i}
              className={`text-2xl ${colors[i % colors.length]} animate-pulse`}
              style={{
                animationDelay: `${i * 0.2}s`,
                animationDuration: '1.5s'
              }}
            >
              💡
            </div>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes snow {
          0% {
            transform: translateY(-10vh) rotate(0deg);
          }
          100% {
            transform: translateY(100vh) rotate(360deg);
          }
        }
        .animate-snow {
          animation: snow linear infinite;
        }
      `}</style>
    </>
  );
}