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
        const { addresses } = body; // array of address strings (client addresses in order)

        if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
            return Response.json({ error: 'Se requiere un array de direcciones' }, { status: 400 });
        }

        const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
        if (!apiKey) {
            return Response.json({ error: 'API key no configurada' }, { status: 500 });
        }

        // Build full route: office → client1 → client2 → ... → clientN → office
        const fullRoute = [OFFICE_ADDRESS, ...addresses, OFFICE_ADDRESS];

        // Build origins and destinations for consecutive pairs
        const segments = [];
        for (let i = 0; i < fullRoute.length - 1; i++) {
            segments.push({
                origin: fullRoute[i],
                destination: fullRoute[i + 1]
            });
        }

        // Call Distance Matrix API for all segments at once
        const origins = segments.map(s => encodeURIComponent(s.origin)).join('|');
        const destinations = segments.map(s => encodeURIComponent(s.destination)).join('|');

        // Use single origin/destination pairs via Distance Matrix
        // For efficiency, batch all origins and destinations
        const uniqueOrigins = [...new Set(segments.map(s => s.origin))];
        const uniqueDestinations = [...new Set(segments.map(s => s.destination))];

        const originsParam = uniqueOrigins.map(o => encodeURIComponent(o)).join('|');
        const destinationsParam = uniqueDestinations.map(d => encodeURIComponent(d)).join('|');

        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originsParam}&destinations=${destinationsParam}&units=metric&mode=driving&key=${apiKey}`;

        const mapsResponse = await fetch(url);
        const mapsData = await mapsResponse.json();

        if (mapsData.status !== 'OK') {
            return Response.json({ error: `Google Maps error: ${mapsData.status}`, details: mapsData.error_message }, { status: 500 });
        }

        // Extract travel times for each consecutive pair
        const results = segments.map((seg, idx) => {
            const originIdx = uniqueOrigins.indexOf(seg.origin);
            const destIdx = uniqueDestinations.indexOf(seg.destination);
            const element = mapsData.rows[originIdx]?.elements[destIdx];

            return {
                from: seg.origin,
                to: seg.destination,
                duration_seconds: element?.duration?.value || 0,
                duration_text: element?.duration?.text || 'N/A',
                distance_meters: element?.distance?.value || 0,
                distance_text: element?.distance?.text || 'N/A',
                status: element?.status || 'UNKNOWN'
            };
        });

        const totalDurationSeconds = results.reduce((sum, r) => sum + r.duration_seconds, 0);
        const totalDistanceMeters = results.reduce((sum, r) => sum + r.distance_meters, 0);

        return Response.json({
            success: true,
            office: OFFICE_ADDRESS,
            segments: results,
            total_travel_time_seconds: totalDurationSeconds,
            total_travel_time_text: `${Math.round(totalDurationSeconds / 60)} min`,
            total_distance_text: `${(totalDistanceMeters / 1000).toFixed(1)} km`
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});