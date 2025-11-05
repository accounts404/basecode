import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { GraduationCap, DollarSign, Clock, Calendar, Users, Building } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function TrainingCostsAnalysis({ entries }) {
  // Filter only training entries
  const trainingEntries = entries.filter(entry => entry.activity === 'entrenamiento');

  // Group training entries by cleaner
  const trainingByCleaner = trainingEntries.reduce((acc, entry) => {
    const cleanerId = entry.cleaner_id;
    if (!acc[cleanerId]) {
      acc[cleanerId] = {
        cleanerId: cleanerId,
        cleanerName: entry.cleaner_name,
        totalHours: 0,
        totalCost: 0,
        sessions: [],
      };
    }
    acc[cleanerId].totalHours += entry.hours || 0;
    acc[cleanerId].totalCost += entry.total_amount || 0;
    acc[cleanerId].sessions.push(entry);
    return acc;
  }, {});
  
  const cleanerData = Object.values(trainingByCleaner).sort((a, b) => b.totalCost - a.totalCost);

  // Calculate overall totals
  const totalTrainingCost = cleanerData.reduce((sum, cleaner) => sum + cleaner.totalCost, 0);
  const totalTrainingHours = cleanerData.reduce((sum, cleaner) => sum + cleaner.totalHours, 0);
  const totalTrainedCleaners = cleanerData.length;

  if (trainingEntries.length === 0) {
    return (
      <Card className="shadow-lg border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-indigo-600" />
            Análisis de Costos de Entrenamiento
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8 text-indigo-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Sin Entrenamientos en Este Período</h3>
          <p className="text-slate-500">No se registraron actividades de entrenamiento en el período seleccionado.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-indigo-600" />
          Análisis de Costos de Entrenamiento
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="training-summary" className="border-none">
            <AccordionTrigger className="p-6 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all duration-200">
              <div className="w-full">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                  <div className="bg-gradient-to-r from-indigo-50 to-indigo-100 p-4 rounded-xl border border-indigo-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-200 rounded-lg">
                        <DollarSign className="w-5 h-5 text-indigo-700" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-indigo-700">Costo Total</p>
                        <p className="text-2xl font-bold text-indigo-900">${totalTrainingCost.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-200 rounded-lg">
                        <Clock className="w-5 h-5 text-purple-700" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-purple-700">Total Horas</p>
                        <p className="text-2xl font-bold text-purple-900">{totalTrainingHours.toFixed(1)}h</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-r from-pink-50 to-pink-100 p-4 rounded-xl border border-pink-200">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-pink-200 rounded-lg">
                        <Users className="w-5 h-5 text-pink-700" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-pink-700">Limpiadores Entrenados</p>
                        <p className="text-2xl font-bold text-pink-900">{totalTrainedCleaners}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <p className="text-sm text-slate-600">Clic para ver desglose por limpiador</p>
                </div>
              </div>
            </AccordionTrigger>
            
            <AccordionContent>
              <div className="bg-gradient-to-br from-slate-50 to-indigo-50/30 p-6 border-t">
                <h4 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  Desglose de Entrenamiento por Limpiador
                </h4>
                
                <Accordion type="multiple" className="w-full space-y-2">
                  {cleanerData.map((cleaner) => (
                    <AccordionItem key={cleaner.cleanerId} value={cleaner.cleanerId} className="bg-white rounded-lg border border-slate-200 shadow-sm">
                      <AccordionTrigger className="p-4 hover:bg-slate-50/50 transition-colors w-full">
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                                  <GraduationCap className="w-4 h-4 text-indigo-600" />
                                </div>
                                <span className="font-bold text-slate-800">{cleaner.cleanerName}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                                <div className="text-center">
                                    <p className="font-semibold text-slate-700">{cleaner.totalHours.toFixed(1)}h</p>
                                    <p className="text-xs text-slate-500">Horas</p>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-green-600">${cleaner.totalCost.toFixed(2)}</p>
                                    <p className="text-xs text-slate-500">Costo</p>
                                </div>
                            </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="p-4 border-t">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Cliente (Lugar)</TableHead>
                                <TableHead className="text-right">Horas</TableHead>
                                <TableHead className="text-right">Costo</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {cleaner.sessions.sort((a,b) => new Date(b.work_date) - new Date(a.work_date)).map((session) => (
                                <TableRow key={session.id}>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-4 h-4 text-slate-400" />
                                      {format(new Date(session.work_date), "d MMM yyyy", { locale: es })}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                     <div className="flex items-center gap-2">
                                        <Building className="w-4 h-4 text-slate-400" />
                                        {session.client_name}
                                     </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                     <div className="flex items-center justify-end gap-1">
                                        <Clock className="w-4 h-4 text-slate-400" />
                                        {(session.hours || 0).toFixed(1)}h
                                     </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1 font-semibold text-indigo-700">
                                      <DollarSign className="w-4 h-4" />
                                      {(session.total_amount || 0).toFixed(2)}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                
                <div className="mt-6 bg-gradient-to-r from-indigo-100 to-purple-100 border border-indigo-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-200 rounded-lg">
                        <GraduationCap className="w-5 h-5 text-indigo-700" />
                      </div>
                      <div>
                        <p className="font-semibold text-indigo-900">Inversión Total en Entrenamiento</p>
                        <p className="text-sm text-indigo-700">{totalTrainedCleaners} limpiador(es) • {totalTrainingHours.toFixed(1)} horas</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-indigo-900">${totalTrainingCost.toFixed(2)}</p>
                      <p className="text-sm text-indigo-700">AUD</p>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}