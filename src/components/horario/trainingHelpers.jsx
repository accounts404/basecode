import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getEffectiveRate } from "./supervisionHelpers";

// Áreas que se pueden marcar como enseñadas en cada casa
export const TRAINING_AREAS = [
  { key: "dusting_wiping_tidyup", label: "Polvo y orden" },
  { key: "kitchen_and_pantry", label: "Cocina y despensa" },
  { key: "bathrooms", label: "Baños" },
  { key: "laundry", label: "Lavandería" },
  { key: "floors", label: "Pisos" },
  { key: "other_areas", label: "Otras áreas" },
];

// Campos de la WorkEntry pagable del entrenador.
// Se marca is_supervision para que quede como costo operativo de la empresa:
// no se factura al cliente ni entra en conciliaciones de servicios.
export const computeTrainingWorkEntryFields = (training, trainerUser) => {
  const dateStr =
    training.date || (training.start_time ? training.start_time.slice(0, 10) : "");
  const startDt = new Date(training.start_time);
  const endDt = new Date(training.end_time);
  const hours = parseFloat(((endDt - startDt) / (1000 * 60 * 60)).toFixed(4));
  const rate = getEffectiveRate(trainerUser, dateStr);
  const day = parseInt(dateStr.slice(8, 10), 10);
  const period = `${dateStr.slice(0, 7)}-${day <= 15 ? "1st" : "2nd"}`;
  const prettyDate = format(new Date(dateStr + "T12:00:00"), "d MMM yyyy", { locale: es });
  return {
    cleaner_id: training.trainer_id,
    cleaner_name:
      trainerUser?.invoice_name || trainerUser?.full_name || "Entrenador",
    client_id: training.trainer_id,
    client_name: `Entrenamiento ${training.trainee_name || ""} · ${prettyDate}`,
    work_date: dateStr,
    hours,
    // "entrenamiento" es el valor que ya usan los reportes de costos de entrenamiento
    activity: "entrenamiento",
    hourly_rate: rate,
    total_amount: parseFloat((hours * rate).toFixed(2)),
    period,
    invoiced: false,
    is_supervision: true,
  };
};