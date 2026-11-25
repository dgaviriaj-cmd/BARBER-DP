/**
 * Reglas puras para buscar y aislar historiales de clientes.
 * No sustituye la autorización del servidor ni las políticas RLS.
 */
export function matchesClientHistorySearch(client, query) {
  const q = String(query || '').trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  if (q.length < 2 && digits.length < 4) return false;
  return String(client?.nombre || '').toLowerCase().includes(q)
    || String(client?.correo || '').toLowerCase().includes(q)
    || (digits.length >= 4 && String(client?.telefono || '').replace(/\D/g, '').includes(digits));
}

export function filterClientAppointments(appointments, clienteId) {
  if (!clienteId) return [];
  return (appointments || []).filter((appointment) => appointment.cliente_id === clienteId);
}
