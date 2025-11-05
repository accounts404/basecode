
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

export default function InvoicePreview({ user, invoice, workEntries }) {
  const relatedWorkEntries = workEntries.filter(entry => 
    invoice.work_entries && invoice.work_entries.includes(entry.id)
  );

  // Agrupar entradas por fecha y sumar los montos
  const dailyTotals = {};
  relatedWorkEntries.forEach(entry => {
    const date = entry.work_date;
    if (dailyTotals[date]) {
      dailyTotals[date] += entry.total_amount;
    } else {
      dailyTotals[date] = entry.total_amount;
    }
  });

  // Ordenar fechas
  const sortedDates = Object.keys(dailyTotals).sort();

  const numberToWords = (num) => {
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    
    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
    
    return num.toString();
  };

  const invoiceDisplayName = user.invoice_name || user.full_name;

  return (
    <div className="max-w-4xl mx-auto bg-white p-8 shadow-lg">
      {/* Header */}
      <div className="text-right mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{invoiceDisplayName || 'CLEANER NAME'}</h1>
        <div className="text-slate-600">ABN: {user.abn || '**********'}</div>
        <div className="text-slate-600">Mobile Number: {user.mobile_number || '*********'}</div>
        <div className="text-slate-600">Address: {user.address || '**********'}</div>
        <div className="mt-4">
          <div className="font-semibold">Date: {format(new Date(), 'd MMMM yyyy')}</div>
          <div className="font-semibold">Invoice: {invoice.invoice_number}</div>
        </div>
      </div>

      {/* Title */}
      <div className="text-center bg-slate-100 py-4 mb-8 rounded-lg">
        <h2 className="text-2xl font-bold text-slate-900">TAX INVOICE</h2>
      </div>

      {/* Invoice To */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">TAX INVOICE TO:</h3>
        <div className="font-semibold">RedOak Cleaning Solutions</div>
        <div className="text-slate-600">Mobile Number: 0491829501</div>
      </div>

      {/* Terms */}
      <div className="mb-8">
        <h4 className="text-lg font-semibold text-slate-900 mb-4">TERMS:</h4>
        <div className="font-semibold mb-4">1. Cleaning Service:</div>
        
        <div className="bg-slate-50 rounded-lg p-4">
          {sortedDates.map((date) => (
            <div key={date} className="flex justify-between items-center py-2 border-b border-slate-200 last:border-b-0">
              <span>• {format(new Date(date), 'd MMMM yyyy')}</span>
              <span className="font-semibold">${dailyTotals[date].toFixed(2)}</span>
            </div>
          ))}
        </div>
        
        <div className="mt-6 p-4 bg-green-50 rounded-lg">
          <div className="text-xl font-bold text-green-800">Total: ${invoice.total_amount.toFixed(2)} AUD</div>
          <div className="text-sm text-slate-600 mt-2">
            Amount in words: {numberToWords(Math.floor(invoice.total_amount))} dollars AUD
          </div>
        </div>
      </div>

      {/* Additional Notes */}
      {invoice.notes && (
        <div className="mb-8 p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
          <h4 className="font-semibold text-slate-900 mb-2">Additional Notes:</h4>
          <p className="text-slate-700">{invoice.notes}</p>
        </div>
      )}

      {/* Banking Details */}
      <div className="bg-blue-50 p-6 rounded-lg border-l-4 border-blue-400">
        <h4 className="text-lg font-semibold text-slate-900 mb-4">BANKING DETAILS:</h4>
        <div className="grid grid-cols-2 gap-4">
          <div><strong>Account Name:</strong> {user.account_name || '*******'}</div>
          <div><strong>Account Number:</strong> {user.account_number || '*******'}</div>
          <div><strong>BSB:</strong> {user.bsb || '*******'}</div>
          <div><strong>Bank:</strong> {user.bank || '*******'}</div>
        </div>
      </div>
    </div>
  );
}
