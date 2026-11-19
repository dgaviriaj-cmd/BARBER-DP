import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimeToMinutes,
  minutesToTime,
  normalizePhone,
  hasOverlap,
  generateAvailableSlots,
  canTransitionStatus,
  validateClientPayload,
  validateServicePayload,
  validateSchedulePayload,
  computeReports,
} from './scheduling.js';

test('parseTimeToMinutes y minutesToTime convierten correctamente', () => {
  assert.equal(parseTimeToMinutes('09:30'), 570);
  assert.equal(parseTimeToMinutes('19:00:00'), 1140);
  assert.equal(Number.isNaN(parseTimeToMinutes('25:00')), true);
  assert.equal(minutesToTime(570), '09:30');
});

test('hasOverlap detecta solapamientos reales y permite bloques contiguos', () => {
  // 09:00-09:30 vs 09:30-10:00 NO se superponen
  assert.equal(hasOverlap(540, 570, 570, 600), false);
  // 09:00-09:45 vs 09:30-10:00 SÍ se superponen
  assert.equal(hasOverlap(540, 585, 570, 600), true);
  // 09:15-09:30 contenido dentro de 09:00-10:00 SÍ se superpone
  assert.equal(hasOverlap(555, 570, 540, 600), true);
});

test('generateAvailableSlots excluye citas activas pero ignora citas canceladas', () => {
  const dateStr = '2026-11-24'; // Martes
  const schedule = { hora_inicio: '09:00', hora_fin: '11:00', activo: true };
  const existingAppointments = [
    {
      id: 'a1',
      fecha_hora_inicio: new Date(2026, 10, 24, 9, 30).toISOString(),
      fecha_hora_fin: new Date(2026, 10, 24, 10, 15).toISOString(),
      estado: 'confirmada',
    },
    {
      id: 'a2',
      fecha_hora_inicio: new Date(2026, 10, 24, 10, 15).toISOString(),
      fecha_hora_fin: new Date(2026, 10, 24, 10, 45).toISOString(),
      estado: 'cancelada',
    },
  ];

  const slots = generateAvailableSlots({
    dateStr,
    serviceDurationMin: 30,
    schedule,
    existingAppointments,
    stepMin: 15,
    now: new Date(2026, 10, 24, 8, 0),
  });

  const byTime = Object.fromEntries(slots.map((s) => [s.hora, s]));
  assert.equal(byTime['09:00'].disponible, true); // 09:00-09:30 libre antes de 09:30
  assert.equal(byTime['09:15'].disponible, false); // 09:15-09:45 choca con 09:30-10:15
  assert.equal(byTime['09:30'].disponible, false);
  assert.equal(byTime['10:15'].disponible, true); // la cita cancelada no bloquea
  assert.equal(byTime['10:30'].disponible, true); // 10:30-11:00 cabe exacto
  assert.equal(byTime['10:45'], undefined); // 10:45+30 = 11:15 excede cierre 11:00
});

test('validaciones de cliente, servicio y horario funcionan correctamente', () => {
  assert.equal(normalizePhone('(+57) 310-555 0101'), '573105550101');

  const badClient = validateClientPayload({ nombre: 'A', telefono: '123', correo: 'mal' });
  assert.equal(badClient.valid, false);
  assert.equal(badClient.errors.length, 3);

  const okClient = validateClientPayload({
    nombre: 'Laura Gómez',
    telefono: '310 555 0199',
    correo: 'LAURA@EXAMPLE.COM',
  });
  assert.equal(okClient.valid, true);
  assert.equal(okClient.normalized.telefono, '3105550199');
  assert.equal(okClient.normalized.correo, 'laura@example.com');

  assert.equal(
    validateServicePayload({ nombre: 'Corte', descripcion: 'Corte limpio', duracion_min: 30, precio: 25000 }).valid,
    true
  );
  assert.equal(
    validateSchedulePayload({ dia_semana: 1, hora_inicio: '18:00', hora_fin: '09:00' }).valid,
    false
  );
});

test('canTransitionStatus respeta flujo de estados de cita', () => {
  assert.equal(canTransitionStatus('pendiente', 'confirmada'), true);
  assert.equal(canTransitionStatus('confirmada', 'completada'), true);
  assert.equal(canTransitionStatus('completada', 'cancelada'), false);
  assert.equal(canTransitionStatus('cancelada', 'confirmada'), false);
});

test('computeReports calcula totales, top servicios e ingresos correctamente', () => {
  const services = [
    { id: 's1', nombre: 'Corte Clásico', precio: 25000 },
    { id: 's2', nombre: 'Combo', precio: 45000 },
  ];
  const barbers = [
    { id: 'b1', nombre: 'Andrés' },
    { id: 'b2', nombre: 'Julián' },
  ];
  const appointments = [
    {
      id: 'c1',
      barbero_id: 'b1',
      servicio_id: 's1',
      fecha_hora_inicio: '2026-11-18T14:00:00.000Z',
      precio_snapshot: 25000,
      estado: 'completada',
    },
    {
      id: 'c2',
      barbero_id: 'b1',
      servicio_id: 's2',
      fecha_hora_inicio: '2026-11-19T14:00:00.000Z',
      precio_snapshot: 45000,
      estado: 'confirmada',
    },
    {
      id: 'c3',
      barbero_id: 'b2',
      servicio_id: 's1',
      fecha_hora_inicio: '2026-11-19T16:00:00.000Z',
      precio_snapshot: 25000,
      estado: 'cancelada',
    },
  ];

  const report = computeReports({ appointments, services, barbers });
  assert.equal(report.summary.total, 3);
  assert.equal(report.summary.completada, 1);
  assert.equal(report.summary.confirmada, 1);
  assert.equal(report.summary.cancelada, 1);
  assert.equal(report.summary.ingresosCompletados, 25000);
  assert.equal(report.barberActivity[0].barbero_id, 'b1');
  assert.equal(report.topServices.length, 2);
});
