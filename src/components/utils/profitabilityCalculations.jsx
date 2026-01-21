import { format, addMonths } from "date-fns";
import { getPriceForSchedule, calculateGST, isDateInRange, mergeRevenueBreakdowns, calculateTotalIncomeFromBreakdown, extractDateOnly } from './priceCalculations';

/**
 * FUNCIÓN CENTRAL: Calcula la rentabilidad para un período dado
 * Usada tanto por RentabilityAnalysisTab como ClientAccumulatedTab
 * para garantizar que ambas usen exactamente la misma lógica
 */
export const calculateProfitabilityForPeriod = ({
    periodStart,
    periodEnd,
    clients,
    allSchedules,
    allWorkEntries,
    allFixedCosts,
    trainingClientId,
    sortColumn = 'realMargin',
    sortDirection = 'desc'
}) => {
    const clientMap = new Map(clients.map(c => [c.id, c]));
    const clientData = {};

    // 1. PROCESAR SCHEDULES FACTURADOS (INGRESOS)
    const periodSchedules = allSchedules.filter(s => 
        isDateInRange(s.start_time, periodStart, periodEnd) &&
        s.xero_invoiced
    );

    periodSchedules.forEach(schedule => {
        if (schedule.client_id === trainingClientId) return;

        const client = clientMap.get(schedule.client_id);
        if (!client) return;

        const clientId = client.id;
        if (!clientData[clientId]) {
            clientData[clientId] = {
                clientId: clientId,
                clientName: client.name,
                totalIncome: 0,
                totalLaborCost: 0,
                totalHours: 0,
                serviceCount: 0,
                revenueBreakdown: {},
                currentServicePrice: client.current_service_price || 0,
                gstType: client.gst_type || 'inclusive',
            };
        }

        const priceData = getPriceForSchedule(schedule, client);
        const { base: netIncome } = calculateGST(priceData.rawAmount, priceData.gstType);
        
        const gstFactor = priceData.rawAmount > 0 ? (netIncome / priceData.rawAmount) : 1;
        
        let netBreakdownForSchedule = {};
        for (const type in priceData.breakdown) {
            netBreakdownForSchedule[type] = priceData.breakdown[type] * gstFactor;
        }

        clientData[clientId].revenueBreakdown = mergeRevenueBreakdowns(clientData[clientId].revenueBreakdown, netBreakdownForSchedule);
        clientData[clientId].totalIncome += calculateTotalIncomeFromBreakdown(netBreakdownForSchedule);
        clientData[clientId].serviceCount += 1;
    });

    // 2. CALCULAR COSTO DE ENTRENAMIENTO
    let trainingHours = 0;
    let trainingAmount = 0;
    allWorkEntries.forEach(entry => {
        if (entry.client_id === trainingClientId && 
            isDateInRange(entry.work_date, periodStart, periodEnd)) {
            trainingHours += entry.hours || 0;
            trainingAmount += entry.total_amount || 0;
        }
    });

    // 3. PROCESAR WORK ENTRIES (COSTOS LABORALES) - EXCLUYENDO OPERATIONAL_COST
    const periodWorkEntries = allWorkEntries.filter(e => 
        isDateInRange(e.work_date, periodStart, periodEnd) &&
        e.activity !== 'training'
    );

    periodWorkEntries.forEach(entry => {
        const clientId = entry.client_id;
        
        if (clientId === trainingClientId) return;

        // CRÍTICO: Excluir operational_cost
        const client = clientMap.get(clientId);
        if (client?.client_type === 'operational_cost') return;

        if (!clientData[clientId]) {
            if (client) {
                clientData[clientId] = {
                    clientId: clientId,
                    clientName: client.name,
                    totalIncome: 0,
                    revenueBreakdown: {},
                    totalLaborCost: 0,
                    totalHours: 0,
                    serviceCount: 0,
                    currentServicePrice: client.current_service_price || 0,
                    gstType: client.gst_type || 'inclusive',
                };
            }
        }
        
        if (clientData[clientId]) {
            clientData[clientId].totalLaborCost += entry.total_amount || 0;
            clientData[clientId].totalHours += entry.hours || 0;
        }
    });

    // 4. CALCULAR COSTOS OPERACIONALES
    const operationalCostEntries = allWorkEntries.filter(entry => {
        const client = clientMap.get(entry.client_id);
        return client?.client_type === 'operational_cost' && 
               isDateInRange(entry.work_date, periodStart, periodEnd);
    });
    
    const monthlyOperationalCost = operationalCostEntries.reduce((sum, entry) => sum + (entry.total_amount || 0), 0);

    // 5. CALCULAR GASTOS FIJOS DEL PERÍODO
    const startPeriod = format(periodStart, 'yyyy-MM');
    const endPeriod = format(periodEnd, 'yyyy-MM');
    const periodMonths = [];
    let currentDate = new Date(startPeriod + '-01');
    while (format(currentDate, 'yyyy-MM') <= endPeriod) {
        periodMonths.push(format(currentDate, 'yyyy-MM'));
        currentDate = addMonths(currentDate, 1);
    }

    const relevantFixedCosts = allFixedCosts.filter(fc => periodMonths.includes(fc.period));
    const totalFixedCosts = relevantFixedCosts.reduce((sum, fc) => sum + (fc.amount || 0), 0);

    // 6. CALCULAR TOTAL DE GASTOS FIJOS (INCLUYE TRAINING Y OPERATIONAL)
    const totalFixedCostsWithTraining = totalFixedCosts + trainingAmount + monthlyOperationalCost;

    // 7. CALCULAR HORAS TOTALES (EXCLUYENDO OPERATIONAL_COST)
    const totalHours = Object.values(clientData)
        .filter(c => {
            const client = clientMap.get(c.clientId);
            return client?.client_type !== 'operational_cost';
        })
        .reduce((sum, c) => sum + c.totalHours, 0);

    // 8. GENERAR ANÁLISIS POR CLIENTE
    const profitData = Object.values(clientData).map(data => {
        const client = clientMap.get(data.clientId);
        const isCash = client?.payment_method === 'cash';
        
        const incomePerHour = data.totalHours > 0 ? data.totalIncome / data.totalHours : 0;
        const laborCostPerHour = data.totalHours > 0 ? data.totalLaborCost / data.totalHours : 0;
        const margin = data.totalIncome - data.totalLaborCost;
        const marginPerHour = data.totalHours > 0 ? margin / data.totalHours : 0;

        const clientHourShare = totalHours > 0 ? data.totalHours / totalHours : 0;
        const distributedFixedCost = totalFixedCostsWithTraining * clientHourShare;
        const fixedCostPerHour = data.totalHours > 0 ? distributedFixedCost / data.totalHours : 0;
        const realMargin = margin - distributedFixedCost;
        const realMarginPerHour = data.totalHours > 0 ? realMargin / data.totalHours : 0;
        const realProfitPercentage = data.totalIncome > 0 ? (realMargin / data.totalIncome) * 100 : (realMargin < 0 ? -100 : 0);

        return {
            ...data,
            isCash,
            margin,
            profitPercentage: data.totalIncome > 0 ? (margin / data.totalIncome) * 100 : 0,
            distributedFixedCost,
            realMargin,
            realProfitPercentage,
            incomePerHour,
            laborCostPerHour,
            marginPerHour,
            fixedCostPerHour,
            realMarginPerHour,
            totalCostPerHour: laborCostPerHour + fixedCostPerHour
        };
    }).filter(data => {
        const client = clientMap.get(data.clientId);
        return client?.client_type !== 'operational_cost' && (data.totalHours > 0 || data.totalIncome > 0);
    });

    // 9. ORDENAR
    const sortedClientAnalysis = [...profitData].sort((a, b) => {
        let aValue = a[sortColumn];
        let bValue = b[sortColumn];

        if (sortColumn === 'clientName') {
            aValue = aValue?.toLowerCase() || '';
            bValue = bValue?.toLowerCase() || '';
            return sortDirection === 'asc' ? 
                aValue.localeCompare(bValue) : 
                bValue.localeCompare(aValue);
        }

        aValue = parseFloat(aValue) || 0;
        bValue = parseFloat(bValue) || 0;
        
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });

    // 10. CALCULAR RESUMEN
    const summary = sortedClientAnalysis.reduce((acc, client) => {
        acc.totalIncome += client.totalIncome;
        acc.totalLaborCost += client.totalLaborCost;
        acc.totalMargin += client.margin;
        acc.totalHours += client.totalHours;
        acc.totalRealMargin += client.realMargin;
        if (client.isCash) {
            acc.cashIncome += client.totalIncome;
            acc.cashLaborCost += client.totalLaborCost;
            acc.cashMargin += client.margin;
        } else {
            acc.nonCashIncome += client.totalIncome;
            acc.invoiceLaborCost += client.totalLaborCost;
            acc.invoiceMargin += client.margin;
        }
        return acc;
    }, { 
        totalIncome: 0, 
        totalLaborCost: 0, 
        totalMargin: 0, 
        totalHours: 0, 
        totalRealMargin: 0, 
        cashIncome: 0, 
        nonCashIncome: 0,
        cashLaborCost: 0,
        invoiceLaborCost: 0,
        cashMargin: 0,
        invoiceMargin: 0
    });

    const totalRealProfitPercentage = summary.totalIncome > 0 ? (summary.totalRealMargin / summary.totalIncome) * 100 : 0;
    summary.totalRealProfitPercentage = totalRealProfitPercentage;
    
    // Distribución de gastos fijos por Cash vs Factura
    const cashRatio = summary.totalIncome > 0 ? summary.cashIncome / summary.totalIncome : 0;
    const invoiceRatio = summary.totalIncome > 0 ? summary.nonCashIncome / summary.totalIncome : 0;
    
    summary.cashFixedCosts = totalFixedCostsWithTraining * cashRatio;
    summary.invoiceFixedCosts = totalFixedCostsWithTraining * invoiceRatio;
    summary.cashNetMargin = summary.cashMargin - summary.cashFixedCosts;
    summary.invoiceNetMargin = summary.invoiceMargin - summary.invoiceFixedCosts;
    summary.cashProfitability = summary.cashIncome > 0 ? (summary.cashNetMargin / summary.cashIncome) * 100 : 0;
    summary.invoiceProfitability = summary.nonCashIncome > 0 ? (summary.invoiceNetMargin / summary.nonCashIncome) * 100 : 0;

    // 11. DETALLES DE COSTOS OPERACIONALES
    const operationalCostsDetails = {};
    operationalCostEntries.forEach(entry => {
        if (!operationalCostsDetails[entry.client_id]) {
            operationalCostsDetails[entry.client_id] = {
                clientId: entry.client_id,
                clientName: entry.client_name,
                totalHours: 0,
                totalLaborCost: 0
            };
        }
        operationalCostsDetails[entry.client_id].totalHours += entry.hours || 0;
        operationalCostsDetails[entry.client_id].totalLaborCost += entry.total_amount || 0;
    });

    return {
        clientAnalysis: sortedClientAnalysis,
        summary,
        trainingCost: { hours: trainingHours, amount: trainingAmount },
        operationalCost: monthlyOperationalCost,
        operationalCostsDetails: Object.values(operationalCostsDetails),
        totalFixedCosts,
        totalFixedCostsWithTraining
    };
};