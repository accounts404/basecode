export function getCombinedNotes(client, serviceSpecificNotes) {
    if (!client) {
        return serviceSpecificNotes || '';
    }

    const accessNotes = [];
    if (client.has_access) {
        accessNotes.push("--- INFORMACIÓN DE ACCESO ---");
        const accessTypeLabel = 
            client.access_type === 'key' ? 'Llave Física' :
            client.access_type === 'smart_lock' ? 'Cerradura Inteligente' :
            client.access_type === 'lockbox' ? 'Caja de Seguridad (Lockbox)' : 'Otro';
        
        accessNotes.push(`Tipo: ${accessTypeLabel}`);
        if(client.access_identifier) accessNotes.push(`Identificador/Código: ${client.access_identifier}`);
        if(client.access_instructions) accessNotes.push(`Instrucciones:\n${client.access_instructions}`);
        accessNotes.push("-----------------------------\n");
    }

    const defaultNotes = client.default_service_notes || '';
    
    return [
        accessNotes.join('\n'),
        defaultNotes,
        serviceSpecificNotes
    ].filter(Boolean).join('\n\n');
}