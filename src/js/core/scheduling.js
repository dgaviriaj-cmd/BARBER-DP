/**
 * Lógica pura de programación de horarios, validaciones y reportes para BARBER DP.
 * Desacoplada del DOM y de la capa de persistencia para facilitar pruebas unitarias.
 */

export const VALID_APPOINTMENT_STATUSES = ['pendiente', 'confirmada', 'completada', 'cancelada'];

const ACTIVE_OCCUPYING_STATUSES = new Set(['pendiente', 'confirmada']);

const STATUS_TRANSITIONS = {
  pendiente: new Set(['confirmada', 'completada', 'cancelada']),
  confirmada: new Set(['completada', 'cancelada']),
  completada: new Set([]),
  cancelada: new Set([]),
};

/**
 * Convierte "HH:MM" o "HH:MM:SS" a minutos totales desde las 00:00.
 * @param {string} timeStr
 * @returns {number}
 */
export function parseTimeToMinutes(timeStr) {
  if (typeof timeStr !== 'string') return NaN;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(timeStr.trim());
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
  return hours * 60 + minutes;
}

/**
 * Convierte minutos desde medianoche a formato "HH:MM".
 * @param {number} totalMinutes
 * @returns {string}
 */
export function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Normaliza un número de teléfono dejando solo dígitos para comparación anti-duplicados.
 * @param {string} phone
 * @returns {string}
 */
export function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/**
 * Verifica si dos intervalos semiabiertos [startA, endA) y [startB, endB) se superponen.
 * Permite citas adyacentes (ej. 09:00-09:30 y 09:30-10:00 NO se superponen).
 * @param {number} startA
 * @param {number} endA
 * @param {number} startB
 * @param {number} endB
 * @returns {boolean}
 */
export function hasOverlap(startA, endA, startB, endB) {
  if (!(endA > startA) || !(endB > startB)) {
    throw new Error('Los intervalos deben tener fin mayor al inicio');
  }
  return startA < endB && endA > startB;
}

/**
 * Calcula el día de la semana (0=Domingo .. 6=Sábado) para una fecha YYYY-MM-DD en horario local.
 * @param {string} dateStr
 * @returns {number}
 */
export function getDayOfWeekFromDateStr(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!match) return -1;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const dt = new Date(year, month, day, 12, 0, 0);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month ||
    dt.getDate() !== day
  ) {
    return -1;
  }
  return dt.getDay();
}

/**
 * Construye una fecha ISO local con desplazamiento explícito o Date local consistente.
 * @param {string} dateStr YYYY-MM-DD
 * @param {string} timeStr HH:MM
 * @returns {Date}
 */
export function buildLocalDateTime(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

/**
 * Extrae YYYY-MM-DD en hora local a partir de un Date o ISO string.
 * @param {string|Date} value
 * @returns {string}
 */
export function toLocalDateKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Extrae HH:MM en hora local a partir de un Date o ISO string.
 * @param {string|Date} value
 * @returns {string}
 */
export function toLocalTimeKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Genera bloques horarios disponibles y ocupados para un barbero, fecha y duración de servicio.
 * @param {object} params
 * @param {string} params.dateStr YYYY-MM-DD
 * @param {number} params.serviceDurationMin
 * @param {{ hora_inicio: string, hora_fin: string, activo: boolean }|null} params.schedule
 * @param {Array<{ id?: string, fecha_hora_inicio: string, fecha_hora_fin: string, estado: string }>} params.existingAppointments
 * @param {number} [params.stepMin=15]
 * @param {Date|null} [params.now=null]
 * @param {string|null} [params.ignoreAppointmentId=null]
 * @returns {Array<{ hora: string, hora_fin: string, disponible: boolean, motivo: string|null }>}
 */
export function generateAvailableSlots({
  dateStr,
  serviceDurationMin,
  schedule,
  existingAppointments = [],
  stepMin = 15,
  now = null,
  ignoreAppointmentId = null,
}) {
  if (!schedule || !schedule.activo) {
    return [];
  }
  const duration = Number(serviceDurationMin);
  if (!Number.isFinite(duration) || duration <= 0) {
    return [];
  }

  const openMin = parseTimeToMinutes(schedule.hora_inicio);
  const closeMin = parseTimeToMinutes(schedule.hora_fin);
  if (Number.isNaN(openMin) || Number.isNaN(closeMin) || closeMin <= openMin) {
    return [];
  }

  const dayBusyRanges = existingAppointments
    .filter((appt) => {
      if (ignoreAppointmentId && appt.id === ignoreAppointmentId) return false;
      if (!ACTIVE_OCCUPYING_STATUSES.has(appt.estado)) return false;
      return toLocalDateKey(appt.fecha_hora_inicio) === dateStr;
    })
    .map((appt) => {
      const start = new Date(appt.fecha_hora_inicio).getTime();
      const end = new Date(appt.fecha_hora_fin).getTime();
      return { start, end };
    });

  const slots = [];
  const nowMs = now ? now.getTime() : null;

  for (let startMin = openMin; startMin + duration <= closeMin; startMin += stepMin) {
    const endMin = startMin + duration;
    const hora = minutesToTime(startMin);
    const horaFin = minutesToTime(endMin);
    const slotStartMs = buildLocalDateTime(dateStr, hora).getTime();
    const slotEndMs = slotStartMs + duration * 60_000;

    let motivo = null;
    if (nowMs !== null && slotStartMs < nowMs) {
      motivo = 'Horario pasado';
    } else {
      const conflict = dayBusyRanges.some((busy) =>
        hasOverlap(slotStartMs, slotEndMs, busy.start, busy.end)
      );
      if (conflict) {
        motivo = 'Ocupado';
      }
    }

    slots.push({
      hora,
      hora_fin: horaFin,
      disponible: motivo === null,
      motivo,
    });
  }

  return slots;
}

/**
 * Valida la transición de estado de una cita.
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @returns {boolean}
 */
export function canTransitionStatus(currentStatus, nextStatus) {
  if (!VALID_APPOINTMENT_STATUSES.includes(nextStatus)) return false;
  if (currentStatus === nextStatus) return true;
  const allowed = STATUS_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

/**
 * Valida datos de entrada de un cliente.
 * @param {{ nombre?: string, telefono?: string, correo?: string, notas?: string }} payload
 * @returns {{ valid: boolean, errors: string[], normalized: { nombre: string, telefono: string, correo: string|null, notas: string } }}
 */
export function validateClientPayload(payload) {
  const errors = [];
  const nombre = String(payload?.nombre || '').trim();
  const telefonoRaw = String(payload?.telefono || '').trim();
  const telefonoDigits = normalizePhone(telefonoRaw);
  const correo = String(payload?.correo || '').trim().toLowerCase();
  const notas = String(payload?.notas || '').trim();

  if (nombre.length < 2) {
    errors.push('El nombre del cliente debe tener al menos 2 caracteres.');
  }
  if (telefonoDigits.length < 7 || telefonoDigits.length > 15) {
    errors.push('El teléfono debe contener entre 7 y 15 dígitos.');
  }
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    errors.push('El formato del correo electrónico no es válido.');
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      nombre,
      telefono: telefonoDigits,
      correo: correo || null,
      notas,
    },
  };
}

/**
 * Valida datos de entrada de un servicio.
 * @param {{ nombre?: string, descripcion?: string, duracion_min?: number|string, precio?: number|string, activo?: boolean }} payload
 */
export function validateServicePayload(payload) {
  const errors = [];
  const nombre = String(payload?.nombre || '').trim();
  const descripcion = String(payload?.descripcion || '').trim();
  const duracion_min = Number(payload?.duracion_min);
  const precio = Number(payload?.precio);
  const activo = payload?.activo !== undefined ? Boolean(payload.activo) : true;

  if (nombre.length < 2) {
    errors.push('El nombre del servicio debe tener al menos 2 caracteres.');
  }
  if (descripcion.length < 4) {
    errors.push('La descripción del servicio debe tener al menos 4 caracteres.');
  }
  if (!Number.isInteger(duracion_min) || duracion_min < 5 || duracion_min > 240) {
    errors.push('La duración debe ser un número entero entre 5 y 240 minutos.');
  }
  if (!Number.isFinite(precio) || precio < 0) {
    errors.push('El precio debe ser un número válido mayor o igual a 0.');
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: { nombre, descripcion, duracion_min, precio, activo },
  };
}

/**
 * Valida un horario de barbero.
 */
export function validateSchedulePayload(payload) {
  const errors = [];
  const dia_semana = Number(payload?.dia_semana);
  const hora_inicio = String(payload?.hora_inicio || '').slice(0, 5);
  const hora_fin = String(payload?.hora_fin || '').slice(0, 5);
  const activo = payload?.activo !== undefined ? Boolean(payload.activo) : true;

  if (!Number.isInteger(dia_semana) || dia_semana < 0 || dia_semana > 6) {
    errors.push('El día de la semana debe estar entre 0 (Domingo) y 6 (Sábado).');
  }

  const startMin = parseTimeToMinutes(hora_inicio);
  const endMin = parseTimeToMinutes(hora_fin);
  if (Number.isNaN(startMin) || Number.isNaN(endMin)) {
    errors.push('Formato de hora inválido. Use HH:MM.');
  } else if (endMin <= startMin) {
    errors.push('La hora de fin debe ser mayor que la hora de inicio.');
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: { dia_semana, hora_inicio, hora_fin, activo },
  };
}

/**
 * Calcula métricas y reportes administrativos sobre un rango de fechas.
 * @param {object} params
 * @param {Array} params.appointments
 * @param {Array} params.services
 * @param {Array} params.barbers
 * @param {string|null} [params.fromDate=null] YYYY-MM-DD
 * @param {string|null} [params.toDate=null] YYYY-MM-DD
 */
export function computeReports({
  appointments = [],
  services = [],
  barbers = [],
  fromDate = null,
  toDate = null,
}) {
  const serviceMap = new Map(services.map((s) => [s.id, s]));
  const barberMap = new Map(barbers.map((b) => [b.id, b]));

  const filtered = appointments.filter((appt) => {
    const dateKey = toLocalDateKey(appt.fecha_hora_inicio);
    if (fromDate && dateKey < fromDate) return false;
    if (toDate && dateKey > toDate) return false;
    return true;
  });

  const summary = {
    total: filtered.length,
    pendiente: 0,
    confirmada: 0,
    completada: 0,
    cancelada: 0,
    ingresosCompletados: 0,
  };

  const serviceCounts = new Map();
  const barberStats = new Map();

  for (const appt of filtered) {
    if (appt.estado in summary) {
      summary[appt.estado] += 1;
    }
    const price = Number(appt.precio_snapshot ?? serviceMap.get(appt.servicio_id)?.precio ?? 0);
    if (appt.estado === 'completada') {
      summary.ingresosCompletados += price;
    }

    if (appt.estado !== 'cancelada') {
      const svc = serviceMap.get(appt.servicio_id);
      const svcKey = appt.servicio_id;
      if (!serviceCounts.has(svcKey)) {
        serviceCounts.set(svcKey, {
          servicio_id: svcKey,
          nombre: svc?.nombre || 'Servicio eliminado',
          cantidad: 0,
          completadas: 0,
          ingresos: 0,
        });
      }
      const svcEntry = serviceCounts.get(svcKey);
      svcEntry.cantidad += 1;
      if (appt.estado === 'completada') {
        svcEntry.completadas += 1;
        svcEntry.ingresos += price;
      }
    }

    const bKey = appt.barbero_id;
    const barber = barberMap.get(bKey);
    if (!barberStats.has(bKey)) {
      barberStats.set(bKey, {
        barbero_id: bKey,
        nombre: barber?.nombre || 'Barbero',
        total: 0,
        completadas: 0,
        pendientesOConfirmadas: 0,
        canceladas: 0,
        ingresos: 0,
      });
    }
    const bEntry = barberStats.get(bKey);
    bEntry.total += 1;
    if (appt.estado === 'completada') {
      bEntry.completadas += 1;
      bEntry.ingresos += price;
    } else if (appt.estado === 'cancelada') {
      bEntry.canceladas += 1;
    } else {
      bEntry.pendientesOConfirmadas += 1;
    }
  }

  const topServices = Array.from(serviceCounts.values()).sort(
    (a, b) => b.cantidad - a.cantidad || b.ingresos - a.ingresos
  );

  const barberActivity = Array.from(barberStats.values()).sort(
    (a, b) => b.total - a.total || b.completadas - a.completadas
  );

  return {
    summary,
    topServices,
    barberActivity,
  };
}
