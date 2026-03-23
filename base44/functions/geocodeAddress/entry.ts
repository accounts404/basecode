import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const { address } = await req.json();

        if (!address) {
            return new Response(JSON.stringify({ error: 'Address is required' }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // Usar Nominatim (OpenStreetMap) para geocodificación gratuita
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1`;
        
        console.log('[geocodeAddress] Consultando Nominatim para:', address);
        
        const response = await fetch(nominatimUrl, {
            headers: {
                'User-Agent': 'RedoakTimes-CleaningApp/1.0' // Requerido por Nominatim
            }
        });

        if (!response.ok) {
            throw new Error(`Nominatim API error: ${response.status}`);
        }

        const results = await response.json();

        if (!results || results.length === 0) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'No se pudo encontrar la dirección' 
            }), { 
                status: 404, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const location = results[0];
        const coordinates = {
            lat: parseFloat(location.lat),
            lng: parseFloat(location.lon),
            display_name: location.display_name
        };

        console.log('[geocodeAddress] ✅ Coordenadas encontradas:', coordinates);

        return new Response(JSON.stringify({ 
            success: true, 
            coordinates 
        }), { 
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (error) {
        console.error('[geocodeAddress] ❌ Error:', error);
        return new Response(JSON.stringify({ 
            success: false, 
            error: error.message || 'Error al geocodificar la dirección' 
        }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
});