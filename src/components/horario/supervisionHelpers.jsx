import { format } from "date-fns";
import { es } from "date-fns/locale";

// Tarifa efectiva del supervisor para una fecha (soporta rate_history)
export const getEffectiveRate = (user, workDateStr) => {
  if (user?.rate_history?.length > 0) {
    const effective = user.rate_history
      .filter((rh) => rh.effective_date <= workDateStr)
      .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
    if (effective) return effective.rate;
  }
  return user?.hourly_rate || 0;
};

// Calcula los campos de la WorkEntry pagable de un bloque de supervisión.
// La WorkEntry NO se ata a ningún cliente (client_id = supervisor_id) y se
// marca is_supervision: true para excluirla de facturación/conciliación.
export const computeSupervisionWorkEntryFields = (supervision, supervisorUser) => {
  const dateStr =
    supervision.date || (supervision.start_time ? supervision.start_time.slice(0, 10) : "");
  // start_time/end_time se guardan como ISO naive (sin Z); el delta es correcto
  const startDt = new Date(supervision.start_time);
  const endDt = new Date(supervision.end_time);
  const hours = parseFloat(((endDt - startDt) / (1000 * 60 * 60)).toFixed(4));
  const rate = getEffectiveRate(supervisorUser, dateStr);
  const day = parseInt(dateStr.slice(8, 10), 10);
  const period = `${dateStr.slice(0, 7)}-${day <= 15 ? "1st" : "2nd"}`;
  return {
    cleaner_id: supervision.supervisor_id,
    cleaner_name:
      supervisorUser?.invoice_name || supervisorUser?.full_name || "Supervisor",
    client_id: supervision.supervisor_id,
    client_name: `Supervisión ${format(new Date(dateStr + "T12:00:00"), "d MMM yyyy", { locale: es })}`,
    work_date: dateStr,
    hours,
    activity: "supervision",
    hourly_rate: rate,
    total_amount: parseFloat((hours * rate).toFixed(2)),
    period,
    invoiced: false,
    is_supervision: true,
  };
};