import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  buildLocalDateTime,
  canTransitionStatus,
  computeReports,
  generateAvailableSlots,
  getDayOfWeekFromDateStr,
  hasOverlap,
  normalizePhone,
  parseTimeToMinutes,
  validateClientPayload,
  validateSchedulePayload,
  validateServicePayload,
} from './src/js/core/scheduling.js';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'barberdp-store.json');

interface UserAccount {
  id: string;
  nombre: string;
  correo: string;
  rol: 'admin' | 'barbero' | 'cliente';
  activo: boolean;
  passwordHash: string;
  clienteId?: string | null;
}

interface StoreData {
  users: UserAccount[];
  sessions: Record<string, { userId: string; createdAt: string }>;
  servicios: Array<{
    id: string;
    nombre: string;
    descripcion: string;
    duracion_min: number;
    precio: number;
    activo: boolean;
  }>;
  barberos: Array<{
    id: string;
    nombre: string;
    especialidad: string;
    telefono: string;
    activo: boolean;
  }>;
  barbero_servicios: Array<{ barbero_id: string; servicio_id: string }>;
  horarios_barbero: Array<{
    id: string;
    barbero_id: string;
    dia_semana: number;
    hora_inicio: string;
    hora_fin: string;
    activo: boolean;
  }>;
  clientes: Array<{
    id: string;
    perfil_id: string | null;
    nombre: string;
    telefono: string;
    correo: string | null;
    notas: string;
    creado_en: string;
  }>;
  citas: Array<{
    id: string;
    cliente_id: string;
    barbero_id: string;
    servicio_id: string;
    fecha_hora_inicio: string;
    fecha_hora_fin: string;
    duracion_snapshot: number;
    precio_snapshot: number;
    estado: 'pendiente' | 'confirmada' | 'completada' | 'cancelada';
    motivo_cancelacion: string | null;
    notas: string;
    creado_en: string;
    actualizado_en: string;
  }>;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function findNextOpenWeekday(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  while (d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
  }
  return formatDateYMD(d);
}

function findPastWeekday(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  while (d.getDay() === 0) {
    d.setDate(d.getDate() - 1);
  }
  return formatDateYMD(d);
}

function createInitialSeed(): StoreData {
  const adminId = '00000000-0000-0000-0000-000000000001';
  const clientUserId = '00000000-0000-0000-0000-000000000002';

  const svc1 = '11111111-1111-1111-1111-111111111101';
  const svc2 = '11111111-1111-1111-1111-111111111102';
  const svc3 = '11111111-1111-1111-1111-111111111103';
  const svc4 = '11111111-1111-1111-1111-111111111104';

  const b1 = '22222222-2222-2222-2222-222222222201';
  const b2 = '22222222-2222-2222-2222-222222222202';
  const b3 = '22222222-2222-2222-2222-222222222203';

  const c1 = '33333333-3333-3333-3333-333333333301';
  const c2 = '33333333-3333-3333-3333-333333333302';
  const c3 = '33333333-3333-3333-3333-333333333303';

  const horarios_barbero: StoreData['horarios_barbero'] = [];
  for (const barberId of [b1, b2, b3]) {
    for (let dia = 1; dia <= 6; dia++) {
      horarios_barbero.push({
        id: crypto.randomUUID(),
        barbero_id: barberId,
        dia_semana: dia,
        hora_inicio: '09:00',
        hora_fin: '19:00',
        activo: true,
      });
    }
  }

  const past1 = findPastWeekday(4);
  const past2 = findPastWeekday(2);
  const next1 = findNextOpenWeekday(1);
  const next2 = findNextOpenWeekday(2);
  const nowIso = new Date().toISOString();

  return {
    users: [
      {
        id: adminId,
        nombre: 'Administrador BARBER DP',
        correo: 'admin@barberdp.local',
        rol: 'admin',
        activo: true,
        passwordHash: hashPassword('BarberAdmin2026!'),
        clienteId: null,
      },
      {
        id: clientUserId,
        nombre: 'Carlos Mendoza (Demo)',
        correo: 'carlos.demo@barberdp.local',
        rol: 'cliente',
        activo: true,
        passwordHash: hashPassword('ClienteDemo2026!'),
        clienteId: c1,
      },
    ],
    sessions: {},
    servicios: [
      {
        id: svc1,
        nombre: 'Corte Clásico',
        descripcion: 'Corte a tijera y máquina con terminación limpia en nuca y patillas.',
        duracion_min: 30,
        precio: 25000,
        activo: true,
      },
      {
        id: svc2,
        nombre: 'Degradado (Fade)',
        descripcion: 'Corte degradado de precisión con navaja y acabado natural.',
        duracion_min: 45,
        precio: 32000,
        activo: true,
      },
      {
        id: svc3,
        nombre: 'Perfilado de Barba',
        descripcion: 'Diseño, rebaje y delineado con toalla tibia y bálsamo hidratante.',
        duracion_min: 30,
        precio: 20000,
        activo: true,
      },
      {
        id: svc4,
        nombre: 'Combo Corte + Barba',
        descripcion: 'Servicio completo de corte personalizado y perfilado de barba.',
        duracion_min: 60,
        precio: 45000,
        activo: true,
      },
    ],
    barberos: [
      {
        id: b1,
        nombre: 'Andrés Morales (Demo)',
        especialidad: 'Degradados y cortes modernos',
        telefono: '3001110001',
        activo: true,
      },
      {
        id: b2,
        nombre: 'Julián Herrera (Demo)',
        especialidad: 'Corte clásico y barba a navaja',
        telefono: '3001110002',
        activo: true,
      },
      {
        id: b3,
        nombre: 'Camilo Rojas (Demo)',
        especialidad: 'Estilismo integral y diseño de barba',
        telefono: '3001110003',
        activo: true,
      },
    ],
    barbero_servicios: [
      { barbero_id: b1, servicio_id: svc1 },
      { barbero_id: b1, servicio_id: svc2 },
      { barbero_id: b1, servicio_id: svc4 },
      { barbero_id: b2, servicio_id: svc1 },
      { barbero_id: b2, servicio_id: svc3 },
      { barbero_id: b2, servicio_id: svc4 },
      { barbero_id: b3, servicio_id: svc2 },
      { barbero_id: b3, servicio_id: svc3 },
      { barbero_id: b3, servicio_id: svc4 },
    ],
    horarios_barbero,
    clientes: [
      {
        id: c1,
        perfil_id: clientUserId,
        nombre: 'Carlos Mendoza (Demo)',
        telefono: '3105550101',
        correo: 'carlos.demo@barberdp.local',
        notas: 'Prefiere corte clásico con tijera.',
        creado_en: nowIso,
      },
      {
        id: c2,
        perfil_id: null,
        nombre: 'Mateo Vargas (Demo)',
        telefono: '3105550102',
        correo: 'mateo.demo@barberdp.local',
        notas: 'Degradado medio sin navaja en cuello.',
        creado_en: nowIso,
      },
      {
        id: c3,
        perfil_id: null,
        nombre: 'Santiago Díaz (Demo)',
        telefono: '3105550103',
        correo: 'santiago.demo@barberdp.local',
        notas: 'Combo corte y barba cada 15 días.',
        creado_en: nowIso,
      },
    ],
    citas: [
      {
        id: '44444444-4444-4444-4444-444444444401',
        cliente_id: c1,
        barbero_id: b1,
        servicio_id: svc1,
        fecha_hora_inicio: buildLocalDateTime(past1, '10:00').toISOString(),
        fecha_hora_fin: buildLocalDateTime(past1, '10:30').toISOString(),
        duracion_snapshot: 30,
        precio_snapshot: 25000,
        estado: 'completada',
        motivo_cancelacion: null,
        notas: 'Atención de demostración completada.',
        creado_en: nowIso,
        actualizado_en: nowIso,
      },
      {
        id: '44444444-4444-4444-4444-444444444402',
        cliente_id: c2,
        barbero_id: b2,
        servicio_id: svc3,
        fecha_hora_inicio: buildLocalDateTime(past2, '15:00').toISOString(),
        fecha_hora_fin: buildLocalDateTime(past2, '15:30').toISOString(),
        duracion_snapshot: 30,
        precio_snapshot: 20000,
        estado: 'completada',
        motivo_cancelacion: null,
        notas: 'Perfilado con toalla tibia.',
        creado_en: nowIso,
        actualizado_en: nowIso,
      },
      {
        id: '44444444-4444-4444-4444-444444444403',
        cliente_id: c3,
        barbero_id: b3,
        servicio_id: svc4,
        fecha_hora_inicio: buildLocalDateTime(next1, '11:00').toISOString(),
        fecha_hora_fin: buildLocalDateTime(next1, '12:00').toISOString(),
        duracion_snapshot: 60,
        precio_snapshot: 45000,
        estado: 'confirmada',
        motivo_cancelacion: null,
        notas: 'Reserva confirmada de muestra.',
        creado_en: nowIso,
        actualizado_en: nowIso,
      },
      {
        id: '44444444-4444-4444-4444-444444444404',
        cliente_id: c1,
        barbero_id: b1,
        servicio_id: svc2,
        fecha_hora_inicio: buildLocalDateTime(next2, '14:00').toISOString(),
        fecha_hora_fin: buildLocalDateTime(next2, '14:45').toISOString(),
        duracion_snapshot: 45,
        precio_snapshot: 32000,
        estado: 'pendiente',
        motivo_cancelacion: null,
        notas: 'Pendiente de confirmación.',
        creado_en: nowIso,
        actualizado_en: nowIso,
      },
    ],
  };
}

function loadStore(): StoreData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initial = createInitialSeed();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  const raw = fs.readFileSync(STORE_PATH, 'utf8');
  return JSON.parse(raw) as StoreData;
}

function saveStore(store: StoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

// Cola secuencial de escritura para evitar condiciones de carrera en reservas simultáneas
let writeQueue: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const next = writeQueue.then(() => fn());
  writeQueue = next.catch(() => undefined);
  return next;
}

function getAuthenticatedUser(req: express.Request, store: StoreData): UserAccount | null {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;
  const session = store.sessions[token];
  if (!session) return null;
  const user = store.users.find((u) => u.id === session.userId && u.activo);
  return user || null;
}

function sanitizeUser(user: UserAccount) {
  return {
    id: user.id,
    nombre: user.nombre,
    correo: user.correo,
    rol: user.rol,
    clienteId: user.clienteId || null,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // --- AUTH ---
  app.get('/api/auth/session', (req, res) => {
    const store = loadStore();
    const user = getAuthenticatedUser(req, store);
    res.json({ user: user ? sanitizeUser(user) : null });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { correo, password } = req.body || {};
    const emailNorm = String(correo || '').trim().toLowerCase();
    const passStr = String(password || '');
    if (!emailNorm || !passStr) {
      return res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });
    }
    const result = await withWriteLock(() => {
      const store = loadStore();
      const user = store.users.find((u) => u.correo.toLowerCase() === emailNorm && u.activo);
      if (!user || !verifyPassword(passStr, user.passwordHash)) {
        return { status: 401, body: { error: 'Credenciales inválidas.' } };
      }
      const token = crypto.randomBytes(24).toString('hex');
      store.sessions[token] = { userId: user.id, createdAt: new Date().toISOString() };
      saveStore(store);
      return { status: 200, body: { token, user: sanitizeUser(user) } };
    });
    return res.status(result.status).json(result.body);
  });

  app.post('/api/auth/register', async (req, res) => {
    const { nombre, telefono, correo, password } = req.body || {};
    const validation = validateClientPayload({ nombre, telefono, correo });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(' ') });
    }
    if (!validation.normalized.correo) {
      return res.status(400).json({ error: 'El correo electrónico es obligatorio para crear cuenta.' });
    }
    if (String(password || '').length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const result = await withWriteLock(() => {
      const store = loadStore();
      const email = validation.normalized.correo as string;
      if (store.users.some((u) => u.correo.toLowerCase() === email)) {
        return { status: 409, body: { error: 'Ya existe una cuenta registrada con ese correo.' } };
      }

      const existingPhoneClient = store.clientes.find(
        (c) => normalizePhone(c.telefono) === validation.normalized.telefono
      );
      if (existingPhoneClient && existingPhoneClient.perfil_id) {
        return { status: 409, body: { error: 'Este teléfono ya está asociado a otra cuenta.' } };
      }

      const userId = crypto.randomUUID();
      let clienteId = existingPhoneClient?.id;
      if (existingPhoneClient) {
        existingPhoneClient.perfil_id = userId;
        existingPhoneClient.nombre = validation.normalized.nombre;
        existingPhoneClient.correo = email;
      } else {
        clienteId = crypto.randomUUID();
        store.clientes.push({
          id: clienteId,
          perfil_id: userId,
          nombre: validation.normalized.nombre,
          telefono: validation.normalized.telefono,
          correo: email,
          notas: '',
          creado_en: new Date().toISOString(),
        });
      }

      const newUser: UserAccount = {
        id: userId,
        nombre: validation.normalized.nombre,
        correo: email,
        rol: 'cliente',
        activo: true,
        passwordHash: hashPassword(String(password)),
        clienteId,
      };
      store.users.push(newUser);
      const token = crypto.randomBytes(24).toString('hex');
      store.sessions[token] = { userId, createdAt: new Date().toISOString() };
      saveStore(store);

      return { status: 201, body: { token, user: sanitizeUser(newUser) } };
    });

    return res.status(result.status).json(result.body);
  });

  app.post('/api/auth/logout', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (token) {
      await withWriteLock(() => {
        const store = loadStore();
        delete store.sessions[token];
        saveStore(store);
      });
    }
    res.json({ ok: true });
  });

  // --- BOOTSTRAP ---
  app.get('/api/bootstrap', (req, res) => {
    const store = loadStore();
    const user = getAuthenticatedUser(req, store);
    const isAdmin = user?.rol === 'admin';

    const servicios = isAdmin ? store.servicios : store.servicios.filter((s) => s.activo);
    const barberos = isAdmin ? store.barberos : store.barberos.filter((b) => b.activo);

    res.json({
      mode: 'local',
      user: user ? sanitizeUser(user) : null,
      servicios,
      barberos,
      barbero_servicios: store.barbero_servicios,
      horarios_barbero: store.horarios_barbero,
      clientes: isAdmin
        ? store.clientes
        : user?.clienteId
          ? store.clientes.filter((c) => c.id === user.clienteId)
          : [],
      citas: isAdmin
        ? store.citas
        : user?.clienteId
          ? store.citas.filter((c) => c.cliente_id === user.clienteId)
          : [],
    });
  });

  // --- DISPONIBILIDAD ---
  app.get('/api/disponibilidad', (req, res) => {
    const { barbero_id, servicio_id, fecha, ignorar_cita_id } = req.query;
    const dateStr = String(fecha || '');
    const barberId = String(barbero_id || '');
    const serviceId = String(servicio_id || '');

    const dayOfWeek = getDayOfWeekFromDateStr(dateStr);
    if (dayOfWeek === -1) {
      return res.status(400).json({ error: 'Fecha inválida. Use formato YYYY-MM-DD.' });
    }

    const store = loadStore();
    const barber = store.barberos.find((b) => b.id === barberId && b.activo);
    const service = store.servicios.find((s) => s.id === serviceId && s.activo);
    if (!barber || !service) {
      return res.status(404).json({ error: 'Barbero o servicio no disponible.' });
    }

    const offersService = store.barbero_servicios.some(
      (bs) => bs.barbero_id === barberId && bs.servicio_id === serviceId
    );
    if (!offersService) {
      return res.json({ slots: [], message: 'El barbero seleccionado no realiza este servicio.' });
    }

    const schedule =
      store.horarios_barbero.find(
        (h) => h.barbero_id === barberId && h.dia_semana === dayOfWeek
      ) || null;

    if (!schedule || !schedule.activo) {
      return res.json({ slots: [], message: 'El barbero no atiende ese día de la semana.' });
    }

    const barberAppointments = store.citas.filter((c) => c.barbero_id === barberId);
    const slots = generateAvailableSlots({
      dateStr,
      serviceDurationMin: service.duracion_min,
      schedule,
      existingAppointments: barberAppointments,
      stepMin: 15,
      now: new Date(),
      ignoreAppointmentId: ignorar_cita_id ? String(ignorar_cita_id) : null,
    });

    return res.json({ slots, schedule });
  });

  // --- SERVICIOS ---
  app.post('/api/servicios', async (req, res) => {
    const storeCheck = loadStore();
    const user = getAuthenticatedUser(req, storeCheck);
    if (user?.rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso restringido a administradores.' });
    }

    const validation = validateServicePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(' ') });
    }

    const result = await withWriteLock(() => {
      const store = loadStore();
      if (
        store.servicios.some(
          (s) => s.nombre.toLowerCase() === validation.normalized.nombre.toLowerCase()
        )
      ) {
        return { status: 409, body: { error: 'Ya existe un servicio con ese nombre.' } };
      }
      const nuevo = { id: crypto.randomUUID(), ...validation.normalized };
      store.servicios.push(nuevo);
      saveStore(store);
      return { status: 201, body: nuevo };
    });

    return res.status(result.status).json(result.body);
  });

  app.patch('/api/servicios/:id', async (req, res) => {
    const storeCheck = loadStore();
    const user = getAuthenticatedUser(req, storeCheck);
    if (user?.rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso restringido a administradores.' });
    }

    const validation = validateServicePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(' ') });
    }

    const result = await withWriteLock(() => {
      const store = loadStore();
      const idx = store.servicios.findIndex((s) => s.id === req.params.id);
      if (idx === -1) {
        return { status: 404, body: { error: 'Servicio no encontrado.' } };
      }
      const dup = store.servicios.some(
        (s) =>
          s.id !== req.params.id &&
          s.nombre.toLowerCase() === validation.normalized.nombre.toLowerCase()
      );
      if (dup) {
        return { status: 409, body: { error: 'Ya existe otro servicio con ese nombre.' } };
      }
      store.servicios[idx] = { ...store.servicios[idx], ...validation.normalized };
      saveStore(store);
      return { status: 200, body: store.servicios[idx] };
    });

    return res.status(result.status).json(result.body);
  });

  // --- BARBEROS Y HORARIOS ---
  app.post('/api/barberos', async (req, res) => {
    const storeCheck = loadStore();
    const user = getAuthenticatedUser(req, storeCheck);
    if (user?.rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso restringido a administradores.' });
    }

    const nombre = String(req.body?.nombre || '').trim();
    const especialidad = String(req.body?.especialidad || '').trim() || 'Corte y barba';
    const telefono = normalizePhone(req.body?.telefono);
    const activo = req.body?.activo !== undefined ? Boolean(req.body.activo) : true;
    const servicioIds: string[] = Array.isArray(req.body?.servicio_ids) ? req.body.servicio_ids : [];
    const horarios: Array<{ dia_semana: number; hora_inicio: string; hora_fin: string; activo: boolean }> =
      Array.isArray(req.body?.horarios) ? req.body.horarios : [];

    if (nombre.length < 2) {
      return res.status(400).json({ error: 'El nombre del barbero debe tener al menos 2 caracteres.' });
    }
    if (telefono.length < 7) {
      return res.status(400).json({ error: 'El teléfono del barbero debe tener al menos 7 dígitos.' });
    }

    for (const h of horarios) {
      const check = validateSchedulePayload(h);
      if (!check.valid) {
        return res.status(400).json({ error: check.errors.join(' ') });
      }
    }

    const result = await withWriteLock(() => {
      const store = loadStore();
      const id = crypto.randomUUID();
      const barber = { id, nombre, especialidad, telefono, activo };
      store.barberos.push(barber);

      for (const sid of servicioIds) {
        if (store.servicios.some((s) => s.id === sid)) {
          store.barbero_servicios.push({ barbero_id: id, servicio_id: sid });
        }
      }

      if (horarios.length > 0) {
        for (const h of horarios) {
          const check = validateSchedulePayload(h);
          store.horarios_barbero.push({
            id: crypto.randomUUID(),
            barbero_id: id,
            ...check.normalized,
          });
        }
      } else {
        for (let dia = 1; dia <= 6; dia++) {
          store.horarios_barbero.push({
            id: crypto.randomUUID(),
            barbero_id: id,
            dia_semana: dia,
            hora_inicio: '09:00',
            hora_fin: '19:00',
            activo: true,
          });
        }
      }

      saveStore(store);
      return { status: 201, body: barber };
    });

    return res.status(result.status).json(result.body);
  });

  app.patch('/api/barberos/:id', async (req, res) => {
    const storeCheck = loadStore();
    const user = getAuthenticatedUser(req, storeCheck);
    if (user?.rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso restringido a administradores.' });
    }

    const nombre = String(req.body?.nombre || '').trim();
    const especialidad = String(req.body?.especialidad || '').trim() || 'Corte y barba';
    const telefono = normalizePhone(req.body?.telefono);
    const activo = req.body?.activo !== undefined ? Boolean(req.body.activo) : true;
    const servicioIds: string[] | null = Array.isArray(req.body?.servicio_ids)
      ? req.body.servicio_ids
      : null;
    const horarios: Array<{ dia_semana: number; hora_inicio: string; hora_fin: string; activo: boolean }> | null =
      Array.isArray(req.body?.horarios) ? req.body.horarios : null;

    if (nombre.length < 2) {
      return res.status(400).json({ error: 'El nombre del barbero debe tener al menos 2 caracteres.' });
    }
    if (telefono.length < 7) {
      return res.status(400).json({ error: 'El teléfono debe tener al menos 7 dígitos.' });
    }
    if (horarios) {
      for (const h of horarios) {
        const check = validateSchedulePayload(h);
        if (!check.valid) {
          return res.status(400).json({ error: check.errors.join(' ') });
        }
      }
    }

    const result = await withWriteLock(() => {
      const store = loadStore();
      const idx = store.barberos.findIndex((b) => b.id === req.params.id);
      if (idx === -1) {
        return { status: 404, body: { error: 'Barbero no encontrado.' } };
      }
      store.barberos[idx] = { ...store.barberos[idx], nombre, especialidad, telefono, activo };

      if (servicioIds) {
        store.barbero_servicios = store.barbero_servicios.filter(
          (bs) => bs.barbero_id !== req.params.id
        );
        for (const sid of servicioIds) {
          if (store.servicios.some((s) => s.id === sid)) {
            store.barbero_servicios.push({ barbero_id: req.params.id, servicio_id: sid });
          }
        }
      }

      if (horarios) {
        store.horarios_barbero = store.horarios_barbero.filter(
          (h) => h.barbero_id !== req.params.id
        );
        for (const h of horarios) {
          const check = validateSchedulePayload(h);
          store.horarios_barbero.push({
            id: crypto.randomUUID(),
            barbero_id: req.params.id,
            ...check.normalized,
          });
        }
      }

      saveStore(store);
      return { status: 200, body: store.barberos[idx] };
    });

    return res.status(result.status).json(result.body);
  });

  // --- CLIENTES ---
  app.get('/api/clientes', (req, res) => {
    const store = loadStore();
    const user = getAuthenticatedUser(req, store);
    if (user?.rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso restringido a administradores.' });
    }
    const q = String(req.query.q || '').trim().toLowerCase();
    const list = q
      ? store.clientes.filter(
          (c) =>
            c.nombre.toLowerCase().includes(q) ||
            c.telefono.includes(normalizePhone(q)) ||
            (c.correo && c.correo.toLowerCase().includes(q))
        )
      : store.clientes;
    return res.json({ clientes: list });
  });

  app.post('/api/clientes', async (req, res) => {
    const validation = validateClientPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(' ') });
    }

    const result = await withWriteLock(() => {
      const store = loadStore();
      const dupPhone = store.clientes.some(
        (c) => normalizePhone(c.telefono) === validation.normalized.telefono
      );
      if (dupPhone) {
        return {
          status: 409,
          body: { error: 'Ya existe un cliente registrado con ese número de teléfono.' },
        };
      }
      if (validation.normalized.correo) {
        const dupEmail = store.clientes.some(
          (c) => c.correo && c.correo.toLowerCase() === validation.normalized.correo
        );
        if (dupEmail) {
          return {
            status: 409,
            body: { error: 'Ya existe un cliente registrado con ese correo electrónico.' },
          };
        }
      }
      const nuevo = {
        id: crypto.randomUUID(),
        perfil_id: null,
        ...validation.normalized,
        creado_en: new Date().toISOString(),
      };
      store.clientes.push(nuevo);
      saveStore(store);
      return { status: 201, body: nuevo };
    });

    return res.status(result.status).json(result.body);
  });

  app.patch('/api/clientes/:id', async (req, res) => {
    const storeCheck = loadStore();
    const user = getAuthenticatedUser(req, storeCheck);
    if (user?.rol !== 'admin' && user?.clienteId !== req.params.id) {
      return res.status(403).json({ error: 'No tienes permiso para editar este cliente.' });
    }

    const validation = validateClientPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(' ') });
    }

    const result = await withWriteLock(() => {
      const store = loadStore();
      const idx = store.clientes.findIndex((c) => c.id === req.params.id);
      if (idx === -1) {
        return { status: 404, body: { error: 'Cliente no encontrado.' } };
      }
      const dupPhone = store.clientes.some(
        (c) =>
          c.id !== req.params.id &&
          normalizePhone(c.telefono) === validation.normalized.telefono
      );
      if (dupPhone) {
        return {
          status: 409,
          body: { error: 'Otro cliente ya utiliza ese número de teléfono.' },
        };
      }
      if (validation.normalized.correo) {
        const dupEmail = store.clientes.some(
          (c) =>
            c.id !== req.params.id &&
            c.correo &&
            c.correo.toLowerCase() === validation.normalized.correo
        );
        if (dupEmail) {
          return {
            status: 409,
            body: { error: 'Otro cliente ya utiliza ese correo electrónico.' },
          };
        }
      }
      store.clientes[idx] = { ...store.clientes[idx], ...validation.normalized };
      saveStore(store);
      return { status: 200, body: store.clientes[idx] };
    });

    return res.status(result.status).json(result.body);
  });

  // --- HISTORIAL (Módulo 6) ---
  app.get('/api/historial', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const store = loadStore();
    if (!q) {
      return res.status(400).json({ error: 'Ingresa un teléfono, correo o nombre para consultar.' });
    }
    const qPhone = normalizePhone(q);
    const matchedClients = store.clientes.filter((c) => {
      const matchPhone = qPhone.length >= 4 && normalizePhone(c.telefono).includes(qPhone);
      const matchEmail = c.correo && c.correo.toLowerCase().includes(q);
      const matchName = c.nombre.toLowerCase().includes(q);
      return matchPhone || matchEmail || matchName;
    });

    const clientIds = new Set(matchedClients.map((c) => c.id));
    const citas = store.citas
      .filter((a) => clientIds.has(a.cliente_id))
      .sort((a, b) => b.fecha_hora_inicio.localeCompare(a.fecha_hora_inicio))
      .map((a) => ({
        ...a,
        cliente_nombre: store.clientes.find((c) => c.id === a.cliente_id)?.nombre || 'Cliente',
        cliente_telefono: store.clientes.find((c) => c.id === a.cliente_id)?.telefono || '',
        barbero_nombre: store.barberos.find((b) => b.id === a.barbero_id)?.nombre || 'Barbero',
        servicio_nombre: store.servicios.find((s) => s.id === a.servicio_id)?.nombre || 'Servicio',
      }));

    return res.json({ clientes: matchedClients, citas });
  });

  // --- CITAS (Módulo 5) ---
  app.get('/api/citas', (req, res) => {
    const store = loadStore();
    const user = getAuthenticatedUser(req, store);
    if (!user) {
      return res.status(401).json({ error: 'Inicia sesión para consultar citas.' });
    }

    let list = store.citas;
    if (user.rol !== 'admin') {
      list = list.filter((c) => c.cliente_id === user.clienteId);
    }

    const { barbero_id, estado } = req.query;
    if (barbero_id) list = list.filter((c) => c.barbero_id === String(barbero_id));
    if (estado) list = list.filter((c) => c.estado === String(estado));

    const enriched = list
      .slice()
      .sort((a, b) => b.fecha_hora_inicio.localeCompare(a.fecha_hora_inicio))
      .map((a) => ({
        ...a,
        cliente_nombre: store.clientes.find((c) => c.id === a.cliente_id)?.nombre || 'Cliente',
        cliente_telefono: store.clientes.find((c) => c.id === a.cliente_id)?.telefono || '',
        barbero_nombre: store.barberos.find((b) => b.id === a.barbero_id)?.nombre || 'Barbero',
        servicio_nombre: store.servicios.find((s) => s.id === a.servicio_id)?.nombre || 'Servicio',
      }));

    return res.json({ citas: enriched });
  });

  app.post('/api/citas', async (req, res) => {
    const {
      cliente_id,
      cliente_nuevo,
      barbero_id,
      servicio_id,
      fecha,
      hora,
      notas,
      estado,
    } = req.body || {};

    if (!barbero_id || !servicio_id || !fecha || !hora) {
      return res.status(400).json({ error: 'Debes seleccionar servicio, barbero, fecha y hora.' });
    }

    const dayOfWeek = getDayOfWeekFromDateStr(String(fecha));
    const startMin = parseTimeToMinutes(String(hora));
    if (dayOfWeek === -1 || Number.isNaN(startMin)) {
      return res.status(400).json({ error: 'Fecha u hora inválida.' });
    }

    const result = await withWriteLock(() => {
      const store = loadStore();
      const service = store.servicios.find((s) => s.id === servicio_id && s.activo);
      const barber = store.barberos.find((b) => b.id === barbero_id && b.activo);
      if (!service) {
        return { status: 404, body: { error: 'El servicio seleccionado no está disponible.' } };
      }
      if (!barber) {
        return { status: 404, body: { error: 'El barbero seleccionado no está disponible.' } };
      }

      const offersService = store.barbero_servicios.some(
        (bs) => bs.barbero_id === barbero_id && bs.servicio_id === servicio_id
      );
      if (!offersService) {
        return {
          status: 400,
          body: { error: 'El barbero seleccionado no tiene asignado ese servicio.' },
        };
      }

      const schedule = store.horarios_barbero.find(
        (h) => h.barbero_id === barbero_id && h.dia_semana === dayOfWeek && h.activo
      );
      if (!schedule) {
        return { status: 400, body: { error: 'El barbero no atiende en la fecha elegida.' } };
      }

      const openMin = parseTimeToMinutes(schedule.hora_inicio);
      const closeMin = parseTimeToMinutes(schedule.hora_fin);
      const endMin = startMin + service.duracion_min;
      if (startMin < openMin || endMin > closeMin) {
        return {
          status: 400,
          body: {
            error: `El horario excede la jornada del barbero (${schedule.hora_inicio} a ${schedule.hora_fin}).`,
          },
        };
      }

      const startDt = buildLocalDateTime(String(fecha), String(hora));
      const endDt = new Date(startDt.getTime() + service.duracion_min * 60_000);
      if (startDt.getTime() < Date.now() - 60_000) {
        return { status: 400, body: { error: 'No puedes agendar citas en horarios pasados.' } };
      }

      // Verificar solapamiento atómicamente bajo writeLock
      const conflict = store.citas.some((c) => {
        if (c.barbero_id !== barbero_id) return false;
        if (c.estado !== 'pendiente' && c.estado !== 'confirmada') return false;
        const cStart = new Date(c.fecha_hora_inicio).getTime();
        const cEnd = new Date(c.fecha_hora_fin).getTime();
        return hasOverlap(startDt.getTime(), endDt.getTime(), cStart, cEnd);
      });
      if (conflict) {
        return {
          status: 409,
          body: { error: 'El barbero ya tiene una cita programada en ese horario.' },
        };
      }

      // Resolver cliente existente o registrar uno nuevo validado sin duplicados
      let resolvedClientId = cliente_id ? String(cliente_id) : '';
      if (resolvedClientId) {
        const exists = store.clientes.some((c) => c.id === resolvedClientId);
        if (!exists) {
          return { status: 404, body: { error: 'El cliente indicado no existe.' } };
        }
      } else if (cliente_nuevo) {
        const val = validateClientPayload(cliente_nuevo);
        if (!val.valid) {
          return { status: 400, body: { error: val.errors.join(' ') } };
        }
        const byPhone = store.clientes.find(
          (c) => normalizePhone(c.telefono) === val.normalized.telefono
        );
        if (byPhone) {
          // Si ya existía por teléfono, reutilizamos su ficha si coincide o avisamos si viene de registro explícito
          if (cliente_nuevo.permitir_reutilizar) {
            resolvedClientId = byPhone.id;
          } else {
            return {
              status: 409,
              body: {
                error:
                  'Ya existe un cliente con ese teléfono. Selecciónalo en la lista o marca "Ya soy cliente".',
                existingClient: byPhone,
              },
            };
          }
        } else {
          if (val.normalized.correo) {
            const byEmail = store.clientes.find(
              (c) => c.correo && c.correo.toLowerCase() === val.normalized.correo
            );
            if (byEmail) {
              return {
                status: 409,
                body: { error: 'Ya existe un cliente registrado con ese correo electrónico.' },
              };
            }
          }
          const newClient = {
            id: crypto.randomUUID(),
            perfil_id: null,
            ...val.normalized,
            creado_en: new Date().toISOString(),
          };
          store.clientes.push(newClient);
          resolvedClientId = newClient.id;
        }
      } else {
        return { status: 400, body: { error: 'Debes indicar o registrar un cliente.' } };
      }

      const authUser = getAuthenticatedUser(req, store);
      const initialStatus =
        authUser?.rol === 'admin' && estado === 'confirmada' ? 'confirmada' : 'pendiente';
      const nowIso = new Date().toISOString();

      const nuevaCita = {
        id: crypto.randomUUID(),
        cliente_id: resolvedClientId,
        barbero_id: String(barbero_id),
        servicio_id: String(servicio_id),
        fecha_hora_inicio: startDt.toISOString(),
        fecha_hora_fin: endDt.toISOString(),
        duracion_snapshot: service.duracion_min,
        precio_snapshot: service.precio,
        estado: initialStatus as 'pendiente' | 'confirmada',
        motivo_cancelacion: null,
        notas: String(notas || '').trim(),
        creado_en: nowIso,
        actualizado_en: nowIso,
      };

      store.citas.push(nuevaCita);
      saveStore(store);

      return {
        status: 201,
        body: {
          ...nuevaCita,
          cliente_nombre: store.clientes.find((c) => c.id === resolvedClientId)?.nombre || '',
          barbero_nombre: barber.nombre,
          servicio_nombre: service.nombre,
        },
      };
    });

    return res.status(result.status).json(result.body);
  });

  app.patch('/api/citas/:id', async (req, res) => {
    const { estado, motivo_cancelacion, fecha, hora, barbero_id } = req.body || {};

    const result = await withWriteLock(() => {
      const store = loadStore();
      const idx = store.citas.findIndex((c) => c.id === req.params.id);
      if (idx === -1) {
        return { status: 404, body: { error: 'Cita no encontrada.' } };
      }

      const current = store.citas[idx];
      const user = getAuthenticatedUser(req, store);

      // Si solo cancela o reprograma desde historial sin admin, requerimos que sea admin, cliente dueño o teléfono verificado
      const isAdmin = user?.rol === 'admin';
      const isOwner = user?.clienteId === current.cliente_id;
      const phoneCheck = req.body?.telefono_verificacion
        ? normalizePhone(req.body.telefono_verificacion) ===
          normalizePhone(store.clientes.find((c) => c.id === current.cliente_id)?.telefono || '')
        : false;

      if (!isAdmin && !isOwner && !phoneCheck) {
        return {
          status: 403,
          body: { error: 'No autorizado para modificar esta cita.' },
        };
      }

      if (estado && estado !== current.estado) {
        if (!canTransitionStatus(current.estado, estado)) {
          return {
            status: 400,
            body: { error: `No se puede cambiar el estado de "${current.estado}" a "${estado}".` },
          };
        }
        if (!isAdmin && estado !== 'cancelada') {
          return {
            status: 403,
            body: { error: 'Solo el administrador puede confirmar o completar citas.' },
          };
        }
      }

      // Reprogramación
      if (fecha && hora) {
        if (current.estado === 'completada' || current.estado === 'cancelada') {
          return {
            status: 400,
            body: { error: 'No se puede reprogramar una cita completada o cancelada.' },
          };
        }
        const targetBarberId = barbero_id ? String(barbero_id) : current.barbero_id;
        const dayOfWeek = getDayOfWeekFromDateStr(String(fecha));
        const startMin = parseTimeToMinutes(String(hora));
        if (dayOfWeek === -1 || Number.isNaN(startMin)) {
          return { status: 400, body: { error: 'Fecha u hora inválida para reprogramar.' } };
        }
        const schedule = store.horarios_barbero.find(
          (h) => h.barbero_id === targetBarberId && h.dia_semana === dayOfWeek && h.activo
        );
        if (!schedule) {
          return { status: 400, body: { error: 'El barbero no atiende ese día.' } };
        }
        const openMin = parseTimeToMinutes(schedule.hora_inicio);
        const closeMin = parseTimeToMinutes(schedule.hora_fin);
        if (startMin < openMin || startMin + current.duracion_snapshot > closeMin) {
          return { status: 400, body: { error: 'La hora seleccionada excede la jornada del barbero.' } };
        }
        const newStart = buildLocalDateTime(String(fecha), String(hora));
        const newEnd = new Date(newStart.getTime() + current.duracion_snapshot * 60_000);
        if (newStart.getTime() < Date.now() - 60_000) {
          return { status: 400, body: { error: 'No se puede reprogramar al pasado.' } };
        }
        const conflict = store.citas.some((c) => {
          if (c.id === current.id) return false;
          if (c.barbero_id !== targetBarberId) return false;
          if (c.estado !== 'pendiente' && c.estado !== 'confirmada') return false;
          return hasOverlap(
            newStart.getTime(),
            newEnd.getTime(),
            new Date(c.fecha_hora_inicio).getTime(),
            new Date(c.fecha_hora_fin).getTime()
          );
        });
        if (conflict) {
          return {
            status: 409,
            body: { error: 'El horario elegido ya está ocupado para ese barbero.' },
          };
        }
        current.barbero_id = targetBarberId;
        current.fecha_hora_inicio = newStart.toISOString();
        current.fecha_hora_fin = newEnd.toISOString();
      }

      if (estado) {
        current.estado = estado;
        if (estado === 'cancelada') {
          current.motivo_cancelacion = String(motivo_cancelacion || 'Cancelada por solicitud').trim();
        }
      }
      current.actualizado_en = new Date().toISOString();
      store.citas[idx] = current;
      saveStore(store);

      return { status: 200, body: current };
    });

    return res.status(result.status).json(result.body);
  });

  // --- REPORTES (Módulo 7) ---
  app.get('/api/reportes', (req, res) => {
    const store = loadStore();
    const user = getAuthenticatedUser(req, store);
    if (user?.rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso restringido a administradores.' });
    }
    const desde = req.query.desde ? String(req.query.desde) : null;
    const hasta = req.query.hasta ? String(req.query.hasta) : null;
    const reports = computeReports({
      appointments: store.citas,
      services: store.servicios,
      barbers: store.barberos,
      fromDate: desde,
      toDate: hasta,
    });
    return res.json(reports);
  });

  // Vite dev middleware o archivos estáticos en producción
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BARBER DP escuchando en http://0.0.0.0:${PORT}`);
  });
}

startServer();
