import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const OFFICE_ADDRESS = '167 Millers Rd, Altona North VIC 3025, Australia';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        // Supports both single team (addresses[]) and multi-team (teams: [{teamId, addresses}])
        const { addresses, teams } = body;

        const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
        if (!apiKey) {
            return Response.json({ error: 'API key no configurada' }, { status: 500 });
        }

        // Helper: compute route segments for one address list
        const computeRouteSegments = async (addrs) => {
            if (!addrs || addrs.length === 0) return { segments: [], total_travel_time_seconds: 0, total_travel_time_text: '0 min', total_distance_text: '0 km' };
            const fullRoute = [OFFICE_ADDRESS, ...addrs, OFFICE_ADDRESS];
            const pairs = [];
            for (let i = 0; i < fullRoute.length - 1; i++) {
                pairs.push({ origin: fullRoute[i], destination: fullRoute[i + 1] });
            }

            const uniqueOrigins = [...new Set(pairs.map(p => p.origin))];
            const uniqueDestinations = [...new Set(pairs.map(p => p.destination))];
            const originsParam = uniqueOrigins.map(o => encodeURIComponent(o)).join('|');
            const destinationsParam = uniqueDestinations.map(d => encodeURIComponent(d)).join('|');
            const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originsParam}&destinations=${destinationsParam}&units=metric&mode=driving&key=${apiKey}`;

            const mapsResponse = await fetch(url);
            const mapsData = await mapsResponse.json();
            if (mapsData.status !== 'OK') {
                throw new Error(`Google Maps error: ${mapsData.status} — ${mapsData.error_message || ''}`);
            }

            const segments = pairs.map((pair) => {
                const originIdx = uniqueOrigins.indexOf(pair.origin);
                const destIdx = uniqueDestinations.indexOf(pair.destination);
                const element = mapsData.rows[originIdx]?.elements[destIdx];
                return {
                    from: pair.origin,
                    to: pair.destination,
                    duration_seconds: element?.duration?.value || 0,
                    duration_text: element?.duration?.text || 'N/A',
                    distance_meters: element?.distance?.value || 0,
                    distance_text: element?.distance?.text || 'N/A',
                    status: element?.status || 'UNKNOWN'
                };
            });

            const totalDurationSeconds = segments.reduce((s, r) => s + r.duration_seconds, 0);
            const totalDistanceMeters = segments.reduce((s, r) => s + r.distance_meters, 0);
            return {
                segments,
                total_travel_time_seconds: totalDurationSeconds,
                total_travel_time_text: `${Math.round(totalDurationSeconds / 60)} min`,
                total_distance_text: `${(totalDistanceMeters / 1000).toFixed(1)} km`
            };
        };

        // Multi-team mode
        if (teams && Array.isArray(teams)) {
            const results = {};
            // Run sequentially to avoid hammering Google Maps API
            for (const team of teams) {
                try {
                    results[team.teamId] = await computeRouteSegments(team.addresses);
                } catch (err) {
                    results[team.teamId] = { error: err.message, segments: [] };
                }
            }
            return Response.json({ success: true, teams: results });
        }

        // Single team mode (legacy)
        if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
            return Response.json({ error: 'Se requiere addresses o teams' }, { status: 400 });
        }
        const result = await computeRouteSegments(addresses);
        return Response.json({ success: true, office: OFFICE_ADDRESS, ...result });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});