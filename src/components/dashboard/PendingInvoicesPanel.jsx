import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { FileText, ChevronRight, DollarSign, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_CONFIG = {
    draft: { label: 'Borrador', className: 'bg-slate-100 text-slate-700 border-slate-300' },
    submitted: { label: 'Enviada', className: 'bg-blue-100 text-blue-700 border-blue-300' },
    reviewed: { label: 'Revisada', className: 'bg-amber-100 text-amber-700 border-amber-300' },
    paid: { label: 'Pagada', className: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
};

export default function PendingInvoicesPanel({ pendingInvoicesList, totalPendingAmount }) {
    const submitted = pendingInvoicesList.filter(i => i.status === 'submitted');
    const reviewed = pendingInvoicesList.filter(i => i.status === 'reviewed');

    return (
        <Card className="shadow-xl border-0">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-amber-50 border-b">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <FileText className="w-6 h-6 text-amber-600" />
                        Facturas Pendientes del Mes
                        {pendingInvoicesList.length > 0 && (
                            <Badge variant="outline" className="ml-1 bg-amber-100 text-amber-800 border-amber-300 font-bold">
                                {pendingInvoicesList.length}
                            </Badge>
                        )}
                    </CardTitle>
                    <Link to={createPageUrl('Facturas')}>
                        <Button variant="ghost" size="sm" className="text-amber-700 hover:text-amber-900 hover:bg-amber-50">
                            Ver todas
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </Link>
                </div>
            </CardHeader>
            <CardContent className="p-5">
                {/* Resumen */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                        <DollarSign className="w-4 h-4 mx-auto mb-1 text-amber-600" />
                        <p className="text-xs text-amber-700 mb-0.5">Total pendiente</p>
                        <p className="text-xl font-bold text-amber-800">${(totalPendingAmount || 0).toFixed(0)}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                        <Clock className="w-4 h-4 mx-auto mb-1 text-blue-600" />
                        <p className="text-xs text-blue-700 mb-0.5">Enviadas</p>
                        <p className="text-xl font-bold text-blue-800">{submitted.length}</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                        <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-orange-600" />
                        <p className="text-xs text-orange-700 mb-0.5">Revisadas (pendiente pago)</p>
                        <p className="text-xl font-bold text-orange-800">{reviewed.length}</p>
                    </div>
                </div>

                {pendingInvoicesList.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">
                        <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400 opacity-60" />
                        <p className="font-medium">Sin facturas pendientes</p>
                        <p className="text-sm mt-1">¡Todo al día!</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                        {pendingInvoicesList.map((invoice) => {
                            const statusCfg = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.draft;
                            return (
                                <div
                                    key={invoice.id}
                                    className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-amber-300 hover:shadow-sm transition-all"
                                >
                                    <div className="flex-shrink-0 p-2 bg-amber-100 rounded-lg">
                                        <FileText className="w-4 h-4 text-amber-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-slate-900 truncate">{invoice.cleaner_name}</p>
                                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                            <span>#{invoice.invoice_number || '—'}</span>
                                            <span>•</span>
                                            <span>{invoice.period || '—'}</span>
                                            {invoice.period_end && (
                                                <>
                                                    <span>•</span>
                                                    <span>hasta {format(new Date(invoice.period_end), "d MMM", { locale: es })}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <p className="font-bold text-slate-900">
                                            ${(invoice.total_amount || 0).toFixed(0)}
                                        </p>
                                        <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>
                                            {statusCfg.label}
                                        </Badge>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}