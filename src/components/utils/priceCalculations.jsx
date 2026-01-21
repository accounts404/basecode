import { format, parseISO } from 'date-fns';

/**
 * FUNCIÓN UNIFICADA: Calcula el precio correcto para un servicio
 * Esta función es usada tanto en Rentabilidad como en Conciliación
 * para garantizar que ambos reportes muestren los mismos valores.
 */
export const getPriceForSchedule = (schedule, client) => {
    // PRIORIDAD 1: Si tiene reconciliation_items, usar esos
    if (schedule.reconciliation_items && schedule.reconciliation_items.length > 0) {
        let tempRawBreakdown = {};
        let totalRawReconciledAmount = 0;

        schedule.reconciliation_items.forEach(item => {
            const type = item.type || 'other_extra';
            const amount = parseFloat(item.amount) || 0;
            tempRawBreakdown[type] = (tempRawBreakdown[type] || 0) + amount;
            
            if (type === 'discount') {
                totalRawReconciledAmount -= amount;
            } else {
                totalRawReconciledAmount += amount;
            }
        });
        
        return { 
            rawAmount: totalRawReconciledAmount, 
            breakdown: tempRawBreakdown,
            gstType: schedule.billed_gst_type_snapshot || client?.gst_type || 'inclusive'
        };
    }
    
    // PRIORIDAD 2: Si está facturado con snapshot (INMUTABLE)
    if (schedule.xero_invoiced && schedule.billed_price_snapshot !== undefined && schedule.billed_price_snapshot !== null) {
        return {
            rawAmount: schedule.billed_price_snapshot,
            breakdown: { base_service: schedule.billed_price_snapshot },
            gstType: schedule.billed_gst_type_snapshot || 'inclusive'
        };
    }
    
    // PRIORIDAD 3: Precio vigente en fecha del servicio
    if (client) {
        const serviceDate = schedule.start_time;
        if (!client.price_history || client.price_history.length === 0) {
            return {
                rawAmount: client.current_service_price || 0,
                breakdown: { base_service: client.current_service_price || 0 },
                gstType: client.gst_type || 'inclusive'
            };
        }
        
        const serviceDateStr = format(parseISO(serviceDate), 'yyyy-MM-dd');
        const sortedHistory = [...client.price_history].sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
        
        for (const historyEntry of sortedHistory) {
            if (historyEntry.effective_date <= serviceDateStr) {
                return {
                    rawAmount: historyEntry.new_price || client.current_service_price || 0,
                    breakdown: { base_service: historyEntry.new_price || client.current_service_price || 0 },
                    gstType: historyEntry.gst_type || client.gst_type || 'inclusive'
                };
            }
        }
        
        const oldestEntry = sortedHistory[sortedHistory.length - 1];
        if (oldestEntry) {
            return {
                rawAmount: oldestEntry.previous_price || oldestEntry.new_price || client.current_service_price || 0,
                breakdown: { base_service: oldestEntry.previous_price || oldestEntry.new_price || client.current_service_price || 0 },
                gstType: oldestEntry.gst_type || client.gst_type || 'inclusive'
            };
        }
    }
    
    return {
        rawAmount: client?.current_service_price || 0,
        breakdown: { base_service: client?.current_service_price || 0 },
        gstType: client?.gst_type || 'inclusive'
    };
};

/**
 * FUNCIÓN UNIFICADA: Calcula los componentes de GST
 */
export const calculateGST = (price, gstType) => {
    const numPrice = parseFloat(price) || 0;
    switch (gstType) {
        case 'inclusive':
            return { base: numPrice / 1.1, gst: numPrice - (numPrice / 1.1), total: numPrice };
        case 'exclusive':
            const gst = numPrice * 0.1;
            return { base: numPrice, gst: gst, total: numPrice + gst };
        case 'no_tax':
            return { base: numPrice, gst: 0, total: numPrice };
        default:
            return { base: numPrice, gst: 0, total: numPrice };
    }
};

/**
 * FUNCIÓN UNIFICADA: Extrae solo la fecha (YYYY-MM-DD) de un ISO string
 */
export const extractDateOnly = (isoString) => {
    if (!isoString) return null;
    return isoString.substring(0, 10);
};

/**
 * FUNCIÓN UNIFICADA: Verifica si una fecha está en un rango
 */
export const isDateInRange = (dateString, rangeStart, rangeEnd) => {
    if (!dateString || !rangeStart || !rangeEnd) return false;
    
    const date = extractDateOnly(dateString);
    const startDate = format(rangeStart, 'yyyy-MM-dd');
    const endDate = format(rangeEnd, 'yyyy-MM-dd');
    
    return date >= startDate && date <= endDate;
};