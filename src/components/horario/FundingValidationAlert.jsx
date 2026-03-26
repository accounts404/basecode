import { AlertTriangle, CheckCircle } from 'lucide-react';

const FUNDED_CLIENT_TYPES = ['ndis_client', 'dva_client', 'age_care_client', 'work_cover_client'];

export function getFundingValidation(selectedClient, startDate) {
    if (!selectedClient || !FUNDED_CLIENT_TYPES.includes(selectedClient.client_type)) return null;
    if (!startDate) return null;
    const docStart = selectedClient.funding_document_start_date;
    const docEnd = selectedClient.funding_document_end_date;
    if (!docStart && !docEnd) return null;
    const serviceDate = new Date(startDate);
    const typeLabel = selectedClient.client_type.replace(/_/g, ' ').toUpperCase();
    if (docStart && serviceDate < new Date(docStart)) {
        return { valid: false, message: `Este cliente (${typeLabel}) solo puede ser agendado a partir del ${new Date(docStart).toLocaleDateString('es-AU')}. La fecha es anterior al inicio de vigencia del documento soporte.` };
    }
    if (docEnd && serviceDate > new Date(docEnd)) {
        return { valid: false, message: `Este cliente (${typeLabel}) solo puede ser agendado hasta el ${new Date(docEnd).toLocaleDateString('es-AU')}. La fecha excede la vigencia del documento soporte.` };
    }
    return { valid: true };
}

export default function FundingValidationAlert({ selectedClient, startDate }) {
    const validation = getFundingValidation(selectedClient, startDate);
    if (!validation) return null;

    if (!validation.valid) {
        return (
            <div className="flex items-start gap-2 bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
                <span>{validation.message}</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg p-2 text-xs text-purple-700">
            <CheckCircle className="w-4 h-4 text-purple-600" />
            <span>Fecha dentro del período de vigencia del documento soporte ✓</span>
        </div>
    );
}