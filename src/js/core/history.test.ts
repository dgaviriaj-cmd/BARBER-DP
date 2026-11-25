import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesClientHistorySearch, filterClientAppointments } from './history.js';

const clients = [
  { id: 'c1', nombre: 'Camilo Rojas', telefono: '3105551111', correo: 'camilo@example.com' },
  { id: 'c2', nombre: 'Ana Vargas', telefono: '3105552222', correo: 'ana@example.com' },
  { id: 'c3', nombre: 'Camilo Pérez', telefono: '3105553333', correo: 'camilo.perez@example.com' },
];

test('buscar por nombre no coincide con todos los teléfonos por cadena vacía', () => {
  assert.deepEqual(clients.filter((c) => matchesClientHistorySearch(c, 'Camilo')).map((c) => c.id), ['c1', 'c3']);
  assert.deepEqual(clients.filter((c) => matchesClientHistorySearch(c, 'Ana')).map((c) => c.id), ['c2']);
});

test('búsqueda por correo y teléfono con guardia de dígitos mínimos', () => {
  assert.deepEqual(clients.filter((c) => matchesClientHistorySearch(c, 'ana@example')).map((c) => c.id), ['c2']);
  assert.deepEqual(clients.filter((c) => matchesClientHistorySearch(c, '5552222')).map((c) => c.id), ['c2']);
  assert.deepEqual(clients.filter((c) => matchesClientHistorySearch(c, 'z')).map((c) => c.id), []);
  assert.deepEqual(clients.filter((c) => matchesClientHistorySearch(c, '')).map((c) => c.id), []);
});

test('las citas se limitan al cliente seleccionado incluso con otros nombres iguales', () => {
  const citas = [
    { id: 'a1', cliente_id: 'c1' },
    { id: 'a2', cliente_id: 'c2' },
    { id: 'a3', cliente_id: 'c1' },
    { id: 'a4', cliente_id: 'c3' },
  ];
  assert.deepEqual(filterClientAppointments(citas, 'c1').map((a) => a.id), ['a1', 'a3']);
  assert.deepEqual(filterClientAppointments(citas, 'c3').map((a) => a.id), ['a4']);
  assert.deepEqual(filterClientAppointments(citas, 'not-found'), []);
  assert.deepEqual(filterClientAppointments(citas, ''), []);
});
