import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { input } = await req.json();

        if (!input || input.trim().length < 3) {
            return Response.json({ predictions: [] });
        }

        // Google Places Autocomplete API
        const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
        
        if (!googleApiKey) {
            return Response.json({ 
                error: 'Google Maps API key not configured' 
            }, { status: 500 });
        }

        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:au&types=address&key=${googleApiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            console.error('Google Places API error:', data);
            return Response.json({ 
                error: `Google Places API error: ${data.status}`,
                predictions: []
            }, { status: 500 });
        }

        const predictions = data.predictions?.map(p => ({
            description: p.description,
            place_id: p.place_id
        })) || [];

        return Response.json({ predictions });

    } catch (error) {
        console.error('Error in autocompleteAddress:', error);
        return Response.json({ 
            error: error.message,
            predictions: []
        }, { status: 500 });
    }
});