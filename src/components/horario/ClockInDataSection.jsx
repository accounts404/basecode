import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

import { MapPin, Navigation, ExternalLink, AlertTriangle, Mail, CheckCircle, Loader2, Clock, Send, X, Plus, Eye } from 'lucide-react';
import { parseISO, format, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';

function parseGPSCoordinates(locationString) {
    if (!locationString || typeof locationString !== 'string') return null;
    const coords = locationString.split(',');
    if (coords.length === 2) {
        const lat = parseFloat(coords[0].trim());
        const lng = parseFloat(coords[1].trim());
        if (!isNaN(lat) && !isNaN(lng)) return { latitude: lat, longitude: lng };
    }
    return null;
}

function openLocationInMaps(latitude, longitude) {
    window.open(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`, '_blank');
}

function formatDateWithTime(isoString) {
    return isoString ? format(parseISO(isoString), 'dd/MM/yyyy HH:mm', { locale: es }) : 'N/A';
}

function formatDuration(minutes) {
    if (!minutes || minutes <= 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function buildEmailBody(schedule, selectedClient, allUsers) {
    const serviceDate = schedule.start_time ? format(parseISO(schedule.start_time), "EEEE d 'de' MMMM yyyy", { locale: es }) : 'N/A';
    const serviceTime = schedule.start_time ? `${schedule.start_time.slice(11, 16)} – ${schedule.end_time?.slice(11, 16) || ''}` : '';

    const cleanerRows = (schedule.clock_in_data || []).map((cd, i) => {
        const cleaner = allUsers.find(u => u.id === cd.cleaner_id);
        const name = cleaner ? (cleaner.invoice_name || cleaner.full_name) : 'Limpiador';
        const inCoords = parseGPSCoordinates(cd.clock_in_location);
        const outCoords = parseGPSCoordinates(cd.clock_out_location);
        const inMapLink = inCoords ? `https://www.google.com/maps/search/?api=1&query=${inCoords.latitude},${inCoords.longitude}` : null;
        const outMapLink = outCoords ? `https://www.google.com/maps/search/?api=1&query=${outCoords.latitude},${outCoords.longitude}` : null;
        const workedMin = cd.clock_in_time && cd.clock_out_time
            ? differenceInMinutes(parseISO(cd.clock_out_time), parseISO(cd.clock_in_time))
            : null;
        const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
        return `<tr style="background:${bg}">
  <td style="padding:12px 16px;font-weight:600;color:#1e293b;border-bottom:1px solid #e2e8f0">${name}</td>
  <td style="padding:12px 16px;color:#166534;border-bottom:1px solid #e2e8f0">
    <div style="font-weight:600">${cd.clock_in_time ? formatDateWithTime(cd.clock_in_time) : '—'}</div>
    ${inCoords ? `<div style="font-size:12px;color:#15803d;margin-top:4px">📍 ${inCoords.latitude.toFixed(6)}, ${inCoords.longitude.toFixed(6)}</div><div style="margin-top:4px"><a href="${inMapLink}" style="font-size:11px;color:#2563eb">Ver en Google Maps →</a></div>` : '<div style="font-size:12px;color:#b45309;margin-top:4px">⚠️ GPS no disponible</div>'}
  </td>
  <td style="padding:12px 16px;color:#991b1b;border-bottom:1px solid #e2e8f0">
    ${cd.clock_out_time ? `<div style="font-weight:600">${formatDateWithTime(cd.clock_out_time)}</div>${outCoords ? `<div style="font-size:12px;color:#b91c1c;margin-top:4px">📍 ${outCoords.latitude.toFixed(6)}, ${outCoords.longitude.toFixed(6)}</div><div style="margin-top:4px"><a href="${outMapLink}" style="font-size:11px;color:#2563eb">Ver en Google Maps →</a></div>` : '<div style="font-size:12px;color:#b45309;margin-top:4px">⚠️ GPS no disponible</div>'}` : '<div style="color:#64748b">En progreso</div>'}
  </td>
  <td style="padding:12px 16px;text-align:center;font-weight:600;color:#1d4ed8;border-bottom:1px solid #e2e8f0">${workedMin !== null ? formatDuration(workedMin) : '—'}</td>
</tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f1f5f9">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td>
<table width="600" cellpadding="0" cellspacing="0" align="center" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
<tr><td style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:32px 40px;text-align:center">
  <div style="font-size:22px;font-weight:700;color:#ffffff">RedOak Cleaning Solutions</div>
  <div style="font-size:13px;color:#93c5fd;margin-top:4px">Informe Oficial de Asistencia</div>
</td></tr>
<tr><td style="padding:28px 40px 16px">
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px 20px">
    <div style="font-size:13px;color:#0369a1;font-weight:600;margin-bottom:8px">DETALLES DEL SERVICIO</div>
    <table width="100%">
      <tr>
        <td style="padding:4px 0;width:50%"><span style="color:#64748b;font-size:13px">Cliente:</span> <strong style="color:#1e293b">${selectedClient?.name || schedule.client_name}</strong></td>
        <td style="padding:4px 0"><span style="color:#64748b;font-size:13px">Fecha:</span> <strong style="color:#1e293b;text-transform:capitalize">${serviceDate}</strong></td>
      </tr>
      <tr><td colspan="2" style="padding:4px 0"><span style="color:#64748b;font-size:13px">Horario planificado:</span> <strong style="color:#1e293b">${serviceTime}</strong></td></tr>
      ${selectedClient?.address ? `<tr><td colspan="2" style="padding:4px 0"><span style="color:#64748b;font-size:13px">Dirección:</span> <strong style="color:#1e293b">${selectedClient.address}</strong></td></tr>` : ''}
    </table>
  </div>
</td></tr>
<tr><td style="padding:8px 40px 28px">
  <div style="font-size:13px;color:#475569;font-weight:600;margin-bottom:12px;text-transform:uppercase">Registro de Asistencia con GPS</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
    <thead><tr style="background:#1e3a5f">
      <th style="padding:12px 16px;text-align:left;color:#fff;font-size:12px">Limpiador</th>
      <th style="padding:12px 16px;text-align:left;color:#fff;font-size:12px">🟢 Clock In</th>
      <th style="padding:12px 16px;text-align:left;color:#fff;font-size:12px">🔴 Clock Out</th>
      <th style="padding:12px 16px;text-align:center;color:#fff;font-size:12px">Duración</th>
    </tr></thead>
    <tbody>${cleanerRows}</tbody>
  </table>
</td></tr>
<tr><td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center">
  <div style="font-size:12px;color:#94a3b8">Este informe fue generado automáticamente por el sistema RedOak Cleaning Solutions.</div>
  <div style="font-size:12px;color:#94a3b8;margin-top:4px">Los registros GPS y horarios son verificables y están almacenados en nuestro sistema.</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

    return { html, serviceDate, serviceTime };
}

// ─── Preview Dialog ──────────────────────────────────────────────────────────
function SendReportDialog({ open, onClose, schedule, selectedClient, allUsers }) {
    const [recipients, setRecipients] = useState([]);
    const [newEmail, setNewEmail] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');
    const [tab, setTab] = useState('preview');

    useEffect(() => {
        if (open) {
            setRecipients(selectedClient?.email ? [selectedClient.email] : []);
            setNewEmail('');
            setSending(false);
            setSent(false);
            setError('');
            setTab('preview');
        }
    }, [open, selectedClient?.email]);

    const addEmail = () => {
        const trimmed = newEmail.trim();
        if (trimmed && !recipients.includes(trimmed)) {
            setRecipients(prev => [...prev, trimmed]);
        }
        setNewEmail('');
    };

    const removeEmail = (email) => setRecipients(prev => prev.filter(e => e !== email));

    const handleSend = async () => {
        if (recipients.length === 0) { setError('Agrega al menos un destinatario.'); return; }
        setSending(true);
        setError('');
        const { html, serviceDate } = buildEmailBody(schedule, selectedClient, allUsers);
        const subject = `Informe de Asistencia – ${selectedClient?.name || schedule.client_name} – ${serviceDate}`;
        try {
            await Promise.all(recipients.map(to =>
                base44.integrations.Core.SendEmail({ to, subject, body: html })
            ));
            setSent(true);
            setTimeout(() => { setSent(false); onClose(); }, 2500);
        } catch (err) {
            setError('Error al enviar. Intenta nuevamente.');
        } finally {
            setSending(false);
        }
    };

    const { html: previewHtml, serviceDate, serviceTime } = buildEmailBody(schedule, selectedClient, allUsers);
    const cleanerData = schedule?.clock_in_data || [];

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex-shrink-0">
                    <h2 className="flex items-center gap-2 text-slate-900 font-semibold text-lg">
                        <Mail className="w-5 h-5 text-blue-600" />
                        Vista previa del informe
                    </h2>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 flex-shrink-0">
                    <button
                        type="button"
                        onClick={() => setTab('preview')}
                        className={`px-6 py-3 text-sm font-medium transition-colors ${tab === 'recipients' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Mail className="w-4 h-4 inline mr-2" />Destinatarios
                        <Badge className="ml-2 bg-blue-100 text-blue-700 text-xs">{recipients.length}</Badge>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {tab === 'preview' && (
                        <div className="p-6">
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5">
                                <p className="text-xs font-semibold text-blue-600 uppercase mb-2">Detalles del servicio</p>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div><span className="text-slate-500">Cliente:</span> <span className="font-semibold text-slate-800">{selectedClient?.name || schedule.client_name}</span></div>
                                    <div><span className="text-slate-500">Fecha:</span> <span className="font-semibold text-slate-800 capitalize">{serviceDate}</span></div>
                                    <div><span className="text-slate-500">Horario:</span> <span className="font-semibold text-slate-800">{serviceTime}</span></div>
                                    {selectedClient?.address && <div><span className="text-slate-500">Dirección:</span> <span className="font-semibold text-slate-800">{selectedClient.address}</span></div>}
                                </div>
                            </div>
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Registro de asistencia</p>
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-800 text-white">
                                            <th className="px-4 py-3 text-left text-xs font-semibold">Limpiador</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold">🟢 Clock In</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold">🔴 Clock Out</th>
                                            <th className="px-4 py-3 text-center text-xs font-semibold">Duración</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cleanerData.map((cd, i) => {
                                            const cleaner = allUsers.find(u => u.id === cd.cleaner_id);
                                            const name = cleaner ? (cleaner.invoice_name || cleaner.full_name) : 'Limpiador';
                                            const inCoords = parseGPSCoordinates(cd.clock_in_location);
                                            const outCoords = parseGPSCoordinates(cd.clock_out_location);
                                            const workedMin = cd.clock_in_time && cd.clock_out_time
                                                ? differenceInMinutes(parseISO(cd.clock_out_time), parseISO(cd.clock_in_time))
                                                : null;
                                            return (
                                                <tr key={i} className={i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                                                    <td className="px-4 py-3 font-semibold text-slate-900">{name}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="text-green-700 font-medium">{cd.clock_in_time ? formatDateWithTime(cd.clock_in_time) : '—'}</div>
                                                        {inCoords ? (
                                                            <div className="text-xs text-slate-500 font-mono">📍 {inCoords.latitude.toFixed(5)}, {inCoords.longitude.toFixed(5)}</div>
                                                        ) : <div className="text-xs text-amber-600">⚠️ GPS no disponible</div>}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {cd.clock_out_time ? (
                                                            <>
                                                                <div className="text-red-700 font-medium">{formatDateWithTime(cd.clock_out_time)}</div>
                                                                {outCoords ? (
                                                                    <div className="text-xs text-slate-500 font-mono">📍 {outCoords.latitude.toFixed(5)}, {outCoords.longitude.toFixed(5)}</div>
                                                                ) : <div className="text-xs text-amber-600">⚠️ GPS no disponible</div>}
                                                            </>
                                                        ) : <span className="text-slate-400 italic text-xs">En progreso</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-bold text-blue-700">
                                                        {workedMin !== null ? formatDuration(workedMin) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {tab === 'recipients' && (
                        <div className="p-6">
                            <p className="text-sm text-slate-600 mb-4">El informe se enviará a los siguientes destinatarios.</p>
                            <div className="space-y-2 mb-5">
                                {recipients.map((email, i) => (
                                    <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <Mail className="w-4 h-4 text-blue-500" />
                                            <span className="text-sm text-slate-800">{email}</span>
                                            {i === 0 && selectedClient?.email === email && (
                                                <Badge className="bg-blue-100 text-blue-700 text-xs">Principal</Badge>
                                            )}
                                        </div>
                                        <button onClick={() => removeEmail(email)} className="text-slate-400 hover:text-red-500 transition-colors">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                {recipients.length === 0 && (
                                    <div className="text-center py-6 text-slate-400 text-sm">No hay destinatarios. Agrega al menos uno.</div>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    type="email"
                                    placeholder="Agregar otro correo electrónico..."
                                    value={newEmail}
                                    onChange={e => setNewEmail(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addEmail()}
                                    className="flex-1"
                                />
                                <Button variant="outline" onClick={addEmail} disabled={!newEmail.trim()}>
                                    <Plus className="w-4 h-4 mr-1" /> Agregar
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0 bg-slate-50">
                    <div className="text-sm text-slate-500">
                        {recipients.length > 0 ? (
                            <span>Se enviará a <strong className="text-slate-700">{recipients.length} destinatario{recipients.length > 1 ? 's' : ''}</strong></span>
                        ) : (
                            <span className="text-red-500">Sin destinatarios</span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {error && <span className="text-red-500 text-sm">{error}</span>}
                        {sent && (
                            <Badge className="bg-green-500 text-white gap-1">
                                <CheckCircle className="w-3 h-3" /> ¡Enviado!
                            </Badge>
                        )}
                        <Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button>
                        <Button onClick={handleSend} disabled={sending || recipients.length === 0 || sent} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {sending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</> : <><Send className="w-4 h-4 mr-2" />Enviar informe</>}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClockInDataSection({ schedule, allUsers, selectedClient, liveCleanerTimes, openInMaps }) {
    const [showDialog, setShowDialog] = useState(false);

    if (!schedule?.clock_in_data || schedule.clock_in_data.length === 0) return null;

    return (
        <>
            <SendReportDialog
                open={showDialog}
                onClose={() => setShowDialog(false)}
                schedule={schedule}
                selectedClient={selectedClient}
                allUsers={allUsers}
            />

            <div className="my-6 rounded-2xl border border-slate-200 bg-white shadow-md overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
                            <MapPin className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-semibold text-base">Registro de Asistencia</h3>
                            <p className="text-slate-300 text-xs">Clock In / Clock Out con GPS</p>
                        </div>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setShowDialog(true); }}
                        className="bg-blue-600 hover:bg-blue-500 text-white border-0"
                    >
                        <Mail className="w-4 h-4" />
                        <span className="ml-1.5 hidden sm:inline">Enviar Informe</span>
                    </Button>
                </div>

                {/* Cleaner cards */}
                <div className="divide-y divide-slate-100">
                    {schedule.clock_in_data.map((clockData, index) => {
                        const cleaner = allUsers.find(u => u.id === clockData.cleaner_id);
                        const cleanerName = cleaner ? (cleaner.display_name || cleaner.invoice_name || cleaner.full_name) : 'Limpiador no encontrado';
                        const clockInCoords = parseGPSCoordinates(clockData.clock_in_location);
                        const clockOutCoords = parseGPSCoordinates(clockData.clock_out_location);
                        const timeData = liveCleanerTimes[clockData.cleaner_id];
                        const workedMin = clockData.clock_in_time && clockData.clock_out_time
                            ? differenceInMinutes(parseISO(clockData.clock_out_time), parseISO(clockData.clock_in_time))
                            : null;
                        const isCompleted = !!clockData.clock_out_time;

                        return (
                            <div key={index} className="p-5">
                                {/* Cleaner header */}
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm">
                                            {cleanerName.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-900">{cleanerName}</p>
                                            {workedMin !== null && (
                                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> Total: {formatDuration(workedMin)}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <Badge className={isCompleted ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>
                                        {isCompleted ? '✓ Completado' : '● En progreso'}
                                    </Badge>
                                </div>

                                {/* Clock In / Clock Out */}
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                            <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Clock In</span>
                                        </div>
                                        {clockData.clock_in_time ? (
                                            <div>
                                                <p className="font-bold text-slate-900 text-sm">{formatDateWithTime(clockData.clock_in_time)}</p>
                                                {clockInCoords ? (
                                                    <div className="mt-2">
                                                        <p className="text-xs text-slate-500 font-mono">📍 {clockInCoords.latitude.toFixed(5)}, {clockInCoords.longitude.toFixed(5)}</p>
                                                        <button onClick={() => openLocationInMaps(clockInCoords.latitude, clockInCoords.longitude)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1">
                                                            <ExternalLink className="w-3 h-3" /> Ver en Google Maps
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-2">
                                                        <AlertTriangle className="w-3 h-3" /> GPS no disponible
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-400">No registrado</p>
                                        )}
                                    </div>

                                    <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                            <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Clock Out</span>
                                        </div>
                                        {clockData.clock_out_time ? (
                                            <div>
                                                <p className="font-bold text-slate-900 text-sm">{formatDateWithTime(clockData.clock_out_time)}</p>
                                                {clockOutCoords ? (
                                                    <div className="mt-2">
                                                        <p className="text-xs text-slate-500 font-mono">📍 {clockOutCoords.latitude.toFixed(5)}, {clockOutCoords.longitude.toFixed(5)}</p>
                                                        <button onClick={() => openLocationInMaps(clockOutCoords.latitude, clockOutCoords.longitude)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1">
                                                            <ExternalLink className="w-3 h-3" /> Ver en Google Maps
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-2">
                                                        <AlertTriangle className="w-3 h-3" /> GPS no disponible
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-400 italic">Aún en progreso</p>
                                        )}
                                    </div>
                                </div>

                                {/* Progress bar */}
                                {timeData && (
                                    <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-4">
                                        <div className="flex-1">
                                            <div className="w-full bg-slate-200 rounded-full h-2">
                                                <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(timeData.progress, 100)}%` }}></div>
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-xs text-slate-500">Trabajado: <span className={`font-mono font-semibold ${timeData.isLive ? 'text-green-600' : 'text-slate-700'}`}>{timeData.workedTime}</span></span>
                                                <span className="text-xs text-slate-500">Restante: <span className="font-mono font-semibold text-orange-500">{timeData.remainingTime}</span></span>
                                            </div>
                                        </div>
                                        <span className="text-sm font-bold text-blue-700 whitespace-nowrap">{Math.round(timeData.progress)}%</span>
                                    </div>
                                )}

                                {/* Client address */}
                                {selectedClient?.address && openInMaps && (
                                    <button onClick={() => openInMaps(selectedClient.address)} className="mt-3 w-full flex items-center justify-center gap-2 text-xs text-blue-600 hover:text-blue-800 py-2 rounded-lg border border-blue-100 hover:bg-blue-50 transition-colors">
                                        <Navigation className="w-3.5 h-3.5" /> Ver dirección del cliente
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}