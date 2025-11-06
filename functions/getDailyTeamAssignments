import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { date: targetDate } = await req.json();

        console.log(`[getDailyTeamAssignments] 📅 Buscando assignments para fecha: ${targetDate}`);

        const allAssignments = await base44.asServiceRole.entities.DailyTeamAssignment.list();
        
        console.log(`[getDailyTeamAssignments] 📋 Total assignments en BD: ${allAssignments.length}`);

        // CORREGIDO: Normalizar la fecha antes de comparar, igual que en loadRequiredKeysForDate
        const filteredAssignments = allAssignments.filter(a => {
            if (!a.date) return false;
            
            // Extraer YYYY-MM-DD del campo date, sin importar el formato
            // Si es ISO string completo: "2025-11-06T00:00:00.000Z" -> "2025-11-06"
            // Si es solo fecha: "2025-11-06" -> "2025-11-06"
            // Si es otro formato, intentar parsearlo
            let assignmentDateStr;
            
            if (typeof a.date === 'string') {
                // Si es un ISO string o similar, tomar los primeros 10 caracteres
                if (a.date.includes('T') || a.date.includes('-')) {
                    assignmentDateStr = a.date.slice(0, 10);
                } else {
                    // Si es otro formato, intentar convertir a Date y luego a YYYY-MM-DD
                    try {
                        const parsedDate = new Date(a.date);
                        const year = parsedDate.getFullYear();
                        const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                        const day = String(parsedDate.getDate()).padStart(2, '0');
                        assignmentDateStr = `${year}-${month}-${day}`;
                    } catch (e) {
                        console.warn(`[getDailyTeamAssignments] ⚠️ No se pudo parsear fecha: ${a.date}`);
                        return false;
                    }
                }
            } else {
                return false;
            }
            
            const isMatch = assignmentDateStr === targetDate;
            
            if (isMatch) {
                console.log(`[getDailyTeamAssignments] ✅ Assignment encontrado:`, {
                    id: a.id,
                    date: a.date,
                    normalized: assignmentDateStr,
                    vehicle_id: a.vehicle_id,
                    main_driver_id: a.main_driver_id,
                    team_member_ids: a.team_member_ids
                });
            }
            
            return isMatch;
        });

        console.log(`[getDailyTeamAssignments] 🎯 Assignments filtrados: ${filteredAssignments.length}`);

        if (filteredAssignments.length === 0) {
            console.log(`[getDailyTeamAssignments] ⚠️ No se encontraron assignments para ${targetDate}`);
            return Response.json({
                success: true,
                assignments: []
            });
        }

        // Enriquecer con información de vehículos y usuarios
        const enrichedAssignments = await Promise.all(
            filteredAssignments.map(async (assignment) => {
                const enriched = { ...assignment };

                // Obtener información del vehículo
                if (assignment.vehicle_id) {
                    try {
                        const vehicle = await base44.asServiceRole.entities.Vehicle.get(assignment.vehicle_id);
                        enriched.vehicle_info = `${vehicle.make || ''} ${vehicle.model || ''} (${vehicle.license_plate || ''})`.trim();
                        console.log(`[getDailyTeamAssignments] 🚗 Vehículo cargado:`, enriched.vehicle_info);
                    } catch (vehicleError) {
                        console.warn('[getDailyTeamAssignments] Error cargando vehículo:', vehicleError);
                        enriched.vehicle_info = null;
                    }
                } else {
                    enriched.vehicle_info = null;
                }

                // Obtener información del conductor principal
                if (assignment.main_driver_id) {
                    try {
                        const mainDriver = await base44.asServiceRole.entities.User.get(assignment.main_driver_id);
                        enriched.main_driver_name = mainDriver.display_name || mainDriver.invoice_name || mainDriver.full_name;
                        console.log(`[getDailyTeamAssignments] 👤 Conductor principal:`, enriched.main_driver_name);
                    } catch (driverError) {
                        console.warn('[getDailyTeamAssignments] Error cargando conductor:', driverError);
                        enriched.main_driver_name = null;
                    }
                } else {
                    enriched.main_driver_name = null;
                }

                // Obtener información de todos los miembros del equipo
                if (assignment.team_member_ids && Array.isArray(assignment.team_member_ids)) {
                    try {
                        const teamMembers = await Promise.all(
                            assignment.team_member_ids.map(async (memberId) => {
                                try {
                                    const member = await base44.asServiceRole.entities.User.get(memberId);
                                    return {
                                        id: member.id,
                                        name: member.display_name || member.invoice_name || member.full_name,
                                        is_main_driver: memberId === assignment.main_driver_id
                                    };
                                } catch (memberError) {
                                    console.warn(`[getDailyTeamAssignments] Error cargando miembro ${memberId}:`, memberError);
                                    return null;
                                }
                            })
                        );
                        enriched.team_members_info = teamMembers.filter(Boolean);
                        console.log(`[getDailyTeamAssignments] 👥 Miembros del equipo:`, enriched.team_members_info.length);
                    } catch (teamError) {
                        console.warn('[getDailyTeamAssignments] Error cargando equipo:', teamError);
                        enriched.team_members_info = [];
                    }
                } else {
                    enriched.team_members_info = [];
                }

                return enriched;
            })
        );

        console.log(`[getDailyTeamAssignments] ✅ Retornando ${enrichedAssignments.length} assignments enriquecidos`);

        return Response.json({
            success: true,
            assignments: enrichedAssignments
        });

    } catch (error) {
        console.error('[getDailyTeamAssignments] Error:', error);
        return Response.json(
            { 
                success: false, 
                error: error.message,
                assignments: [] 
            }, 
            { status: 500 }
        );
    }
});