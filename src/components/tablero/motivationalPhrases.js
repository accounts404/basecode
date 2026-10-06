// Frases motivacionales diarias para el Tablero TV.
// Una por día del año (rota por índice basado en el día del año).

export const MOTIVATIONAL_PHRASES = [
  'Hoy es un buen día para dejar todo reluciente.',
  'El detalle hace la diferencia. ¡Hazlo con orgullo!',
  'Cada servicio es una oportunidad para sorprender.',
  'Trabajo bien hecho es la mejor tarjeta de presentación.',
  'Constancia y cuidado: la fórmula del éxito.',
  'Tu esfuerzo de hoy construye la confianza de mañana.',
  'Limpieza perfecta, clientes felices.',
  'Pequeños detalles, grandes resultados.',
  'Empieza con energía, termina con orgullo.',
  'La calidad nunca se negocia. ¡Demuéstrala hoy!',
  'Un equipo que se cuida, cuida mejor a los clientes.',
  'Hoy suma un cliente más satisfecho que ayer.',
  'La puntualidad es respeto. ¡Llega a tiempo!',
  'Hazlo bien, hazlo rápido, hazlo con smile.',
  'Cada hora cuenta. Haz que valga la pena.',
  'El uniforme habla antes que tú. Llévalo con orgullo.',
  'Un hogar limpio empieza por una actitud impecable.',
  'Esmero hoy, orgullo mañana.',
  'Cada visita deja huella. Que sea una buena impresión.',
  'La excelencia es un hábito, no un acto.',
  'Trabaja en equipo, brilla en conjunto.',
  'Hoy es otra oportunidad para dar lo mejor.',
  'La actitud hace al limpiador, no las herramientas.',
  'Detalles invisibles, resultados visibles.',
  'Concéntrate, respira, y deja todo impecable.',
  'Tu mejor versión se construye servicio a servicio.',
  'Limpia como si fuera para ti. Esa es la clave.',
  'Disciplina hoy, tranquilidad mañana.',
  'Hazlo con cariño y se notará.',
  'Cada cliente merece tu mejor entrega hoy.',
  'Cuidado, calma y calidad. Ese es el sello RedOak.',
  'Una hora enfocada vale por dos distraídas.',
];

// Devuelve una frase determinista para una fecha dada (rota por día del año).
export function getDailyPhrase(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const idx = dayOfYear % MOTIVATIONAL_PHRASES.length;
  return MOTIVATIONAL_PHRASES[idx];
}