import { base44 } from './base44Client';


export const Query = base44.entities.Query;



// auth sdk:
export const User = base44.auth;

/**
 * Helper centralizado para cargar todos los registros de una entidad con paginación automática.
 * Reemplaza las copias locales en TrabajoEntradas, Reportes, Rentabilidad, etc.
 *
 * @param {string} entityName - Nombre de la entidad (ej: 'WorkEntry')
 * @param {string} sortField - Campo de ordenamiento (ej: '-work_date')
 * @param {number} maxLimit - Límite máximo de seguridad (default: 10000)
 * @param {object|null} filterObj - Filtro opcional para usar .filter() en vez de .list()
 * @returns {Promise<Array>}
 */
export const loadAllRecords = async (entityName, sortField = '-created_date', maxLimit = 10000, filterObj = null) => {
  const BATCH_SIZE = 500;
  let allRecords = [];
  let skip = 0;
  let hasMore = true;

  while (hasMore && allRecords.length < maxLimit) {
    let batch;
    if (filterObj) {
      batch = await base44.entities[entityName].filter(filterObj, sortField, BATCH_SIZE, skip);
    } else {
      batch = await base44.entities[entityName].list(sortField, BATCH_SIZE, skip);
    }
    const batchArray = Array.isArray(batch) ? batch : [];
    allRecords = [...allRecords, ...batchArray];
    if (batchArray.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      skip += BATCH_SIZE;
    }
  }

  return allRecords.slice(0, maxLimit);
};