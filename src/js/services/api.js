import { isSupabaseConfigured, supabase } from './supabaseClient.js';
import {
  buildLocalDateTime,
  computeReports,
  generateAvailableSlots,
  getDayOfWeekFromDateStr,
  normalizePhone,
  validateClientPayload,
} from '../core/scheduling.js';

const TOKEN_STORAGE_KEY = 'barberdp_session_token';

function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function setStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota/privacy mode errors
  }
}

async function localFetch(url, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || 'Error inesperado en la solicitud.');
    err.status = response.status;
    err.payload = data;
    throw err;
  }
  return data;
}

/**
 * Inicializa los registros propios después de una sesión válida.
 * Nunca confía en el rol enviado como metadata y nunca vincula clientes por teléfono.
 * Esto funciona aunque Supabase exija confirmar el correo antes de iniciar sesión.
 */
async function ensureOwnRecords(authUser) {
  const nombre = String(authUser.user_metadata?.nombre || '').trim();
  const telefono = normalizePhone(String(authUser.user_metadata?.telefono || ''));
  const { data: perfil, error: perfilReadError } = await supabase
    .from('perfiles')
    .select('id')
    .eq('id', authUser.id)
    .maybeSingle();
  if (perfilReadError) throw new Error(perfilReadError.message);

  if (!perfil && nombre.length >= 2) {
    const { error } = await supabase.from('perfiles').insert({
      id: authUser.id,
      nombre,
      rol: 'cliente',
    });
    if (error && error.code !== '23505') throw new Error(error.message);
  }

  const { data: cliente, error: clienteReadError } = await supabase
    .from('clientes')
    .select('id')
    .eq('perfil_id', authUser.id)
    .maybeSingle();
  if (clienteReadError) throw new Error(clienteReadError.message);

  if (!cliente && nombre.length >= 2 && telefono.length >= 7) {
    const { error } = await supabase.from('clientes').insert({
      perfil_id: authUser.id,
      nombre,
      telefono,
      correo: authUser.email || null,
    });
    if (error?.code === '23505') {
      throw new Error('Ya existe una ficha con este teléfono o correo. Solicita al administrador que revise la vinculación; por seguridad no se reutiliza automáticamente.');
    }
    if (error) throw new Error(error.message);
  }
}

/**
 * Capa de acceso a datos unificada: usa Supabase PostgreSQL + Auth si está configurado,
 * o la API local persistente (/api/*) cuando aún no se configuran credenciales de Supabase.
 */
export const api = {
  getBackendMode() {
    if (isSupabaseConfigured) return 'supabase';
    return import.meta.env.PROD ? 'unconfigured' : 'local';
  },

  async login(correo, password) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: correo,
        password,
      });
      if (error) throw new Error(error.message);
      return this.bootstrap();
    }
    const res = await localFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ correo, password }),
    });
    setStoredToken(res.token);
    return res.user;
  },

  async register({ nombre, telefono, correo, password }) {
    if (isSupabaseConfigured && supabase) {
      const val = validateClientPayload({ nombre, telefono, correo });
      if (!val.valid) throw new Error(val.errors.join(' '));
      const { data, error } = await supabase.auth.signUp({
        email: val.normalized.correo,
        password,
        options: { data: { nombre: val.normalized.nombre, telefono: val.normalized.telefono } },
      });
      if (error) throw new Error(error.message);
      // Sin sesión todavía no existe identidad autenticada para escribir en RLS.
      // Tras confirmar el correo e iniciar sesión, bootstrap crea la ficha propia.
      if (!data.session) return { requiresEmailConfirmation: true };
      return this.bootstrap();
    }
    const res = await localFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ nombre, telefono, correo, password }),
    });
    setStoredToken(res.token);
    return res.user;
  },

  async logout() {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
      return;
    }
    await localFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setStoredToken('');
  },

  async bootstrap() {
    if (import.meta.env.PROD && !isSupabaseConfigured) {
      throw new Error('Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Cloudflare Builds.');
    }
    if (isSupabaseConfigured && supabase) {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      let user = null;
      if (authUser) {
        await ensureOwnRecords(authUser);
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();
        const { data: cli } = await supabase
          .from('clientes')
          .select('id')
          .eq('perfil_id', authUser.id)
          .maybeSingle();
        user = {
          id: authUser.id,
          nombre: perfil?.nombre || authUser.email,
          correo: authUser.email,
          rol: perfil?.rol || 'cliente',
          clienteId: cli?.id || null,
        };
      }

      const [svcRes, barbRes, bsRes, horRes] = await Promise.all([
        supabase.from('servicios').select('*').order('nombre'),
        supabase.from('barberos').select('*').order('nombre'),
        supabase.from('barbero_servicios').select('*'),
        supabase.from('horarios_barbero').select('*').order('dia_semana'),
      ]);

      let clientes = [];
      let citas = [];
      if (user) {
        const [cliRes, citRes] = await Promise.all([
          supabase.from('clientes').select('*').order('nombre'),
          supabase.from('citas').select('*').order('fecha_hora_inicio', { ascending: false }),
        ]);
        clientes = cliRes.data || [];
        citas = citRes.data || [];
      }

      return {
        mode: 'supabase',
        user,
        servicios: svcRes.data || [],
        barberos: barbRes.data || [],
        barbero_servicios: bsRes.data || [],
        horarios_barbero: horRes.data || [],
        clientes,
        citas,
      };
    }

    return localFetch('/api/bootstrap');
  },

  async getDisponibilidad({ barbero_id, servicio_id, fecha, ignorar_cita_id = null }) {
    if (isSupabaseConfigured && supabase) {
      const dayOfWeek = getDayOfWeekFromDateStr(fecha);
      if (dayOfWeek === -1) throw new Error('Fecha inválida.');
      const [{ data: svc }, { data: schedule }, { data: citas }] = await Promise.all([
        supabase.from('servicios').select('duracion_min').eq('id', servicio_id).single(),
        supabase
          .from('horarios_barbero')
          .select('*')
          .eq('barbero_id', barbero_id)
          .eq('dia_semana', dayOfWeek)
          .maybeSingle(),
        supabase
          .from('citas')
          .select('id, fecha_hora_inicio, fecha_hora_fin, estado')
          .eq('barbero_id', barbero_id)
          .in('estado', ['pendiente', 'confirmada']),
      ]);
      if (!schedule || !schedule.activo) {
        return { slots: [], message: 'El barbero no atiende ese día de la semana.' };
      }
      const slots = generateAvailableSlots({
        dateStr: fecha,
        serviceDurationMin: svc.duracion_min,
        schedule,
        existingAppointments: citas || [],
        stepMin: 15,
        now: new Date(),
        ignoreAppointmentId: ignorar_cita_id,
      });
      return { slots, schedule };
    }

    const params = new URLSearchParams({ barbero_id, servicio_id, fecha });
    if (ignorar_cita_id) params.set('ignorar_cita_id', ignorar_cita_id);
    return localFetch(`/api/disponibilidad?${params.toString()}`);
  },

  async createService(payload) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('servicios').insert(payload).select().single();
      if (error) throw new Error(error.message);
      return data;
    }
    return localFetch('/api/servicios', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateService(id, payload) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('servicios')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }
    return localFetch(`/api/servicios/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  async createBarber(payload) {
    if (isSupabaseConfigured && supabase) {
      const { servicio_ids, horarios, ...barberFields } = payload;
      const { data: barber, error } = await supabase
        .from('barberos')
        .insert(barberFields)
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (Array.isArray(servicio_ids) && servicio_ids.length) {
        await supabase
          .from('barbero_servicios')
          .insert(servicio_ids.map((sid) => ({ barbero_id: barber.id, servicio_id: sid })));
      }
      if (Array.isArray(horarios) && horarios.length) {
        await supabase
          .from('horarios_barbero')
          .insert(horarios.map((h) => ({ barbero_id: barber.id, ...h })));
      }
      return barber;
    }
    return localFetch('/api/barberos', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateBarber(id, payload) {
    if (isSupabaseConfigured && supabase) {
      const { servicio_ids, horarios, ...barberFields } = payload;
      const { data: barber, error } = await supabase
        .from('barberos')
        .update(barberFields)
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (Array.isArray(servicio_ids)) {
        await supabase.from('barbero_servicios').delete().eq('barbero_id', id);
        if (servicio_ids.length) {
          await supabase
            .from('barbero_servicios')
            .insert(servicio_ids.map((sid) => ({ barbero_id: id, servicio_id: sid })));
        }
      }
      if (Array.isArray(horarios)) {
        await supabase.from('horarios_barbero').delete().eq('barbero_id', id);
        if (horarios.length) {
          await supabase
            .from('horarios_barbero')
            .insert(horarios.map((h) => ({ barbero_id: id, ...h })));
        }
      }
      return barber;
    }
    return localFetch(`/api/barberos/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  async createClient(payload) {
    if (isSupabaseConfigured && supabase) {
      const val = validateClientPayload(payload);
      if (!val.valid) throw new Error(val.errors.join(' '));
      const { data, error } = await supabase
        .from('clientes')
        .insert(val.normalized)
        .select()
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new Error('Ya existe un cliente registrado con ese teléfono o correo.');
        }
        throw new Error(error.message);
      }
      return data;
    }
    return localFetch('/api/clientes', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateClient(id, payload) {
    if (isSupabaseConfigured && supabase) {
      const val = validateClientPayload(payload);
      if (!val.valid) throw new Error(val.errors.join(' '));
      const { data, error } = await supabase
        .from('clientes')
        .update(val.normalized)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        if (error.code === '23505') {
          throw new Error('Otro cliente ya usa ese teléfono o correo.');
        }
        throw new Error(error.message);
      }
      return data;
    }
    return localFetch(`/api/clientes/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  async createAppointment(payload) {
    if (isSupabaseConfigured && supabase) {
      const { data: { user }, error: sessionError } = await supabase.auth.getUser();
      if (sessionError || !user) {
        throw new Error('Para reservar necesitas crear una cuenta e iniciar sesión.');
      }
      const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle();
      const esAdmin = perfil?.rol === 'admin';
      if (!esAdmin && (!payload.cliente_id || payload.cliente_nuevo)) {
        throw new Error('La reserva debe quedar vinculada a tu ficha de cliente. Cierra sesión y vuelve a entrar si no aparece tu ficha.');
      }
      let clienteId = payload.cliente_id;
      if (!clienteId && payload.cliente_nuevo) {
        const val = validateClientPayload(payload.cliente_nuevo);
        if (!val.valid) throw new Error(val.errors.join(' '));
        const { data: existing } = await supabase
          .from('clientes')
          .select('id')
          .eq('telefono', normalizePhone(val.normalized.telefono))
          .maybeSingle();
        if (existing && payload.cliente_nuevo.permitir_reutilizar) {
          clienteId = existing.id;
        } else if (existing) {
          throw new Error('Ya existe un cliente registrado con ese teléfono.');
        } else {
          const { data: created, error: cErr } = await supabase
            .from('clientes')
            .insert(val.normalized)
            .select()
            .single();
          if (cErr) throw new Error(cErr.message);
          clienteId = created.id;
        }
      }
      const { data: svc } = await supabase
        .from('servicios')
        .select('duracion_min, precio')
        .eq('id', payload.servicio_id)
        .single();
      const startDt = buildLocalDateTime(payload.fecha, payload.hora);
      const endDt = new Date(startDt.getTime() + svc.duracion_min * 60_000);
      const { data, error } = await supabase
        .from('citas')
        .insert({
          cliente_id: clienteId,
          barbero_id: payload.barbero_id,
          servicio_id: payload.servicio_id,
          fecha_hora_inicio: startDt.toISOString(),
          fecha_hora_fin: endDt.toISOString(),
          duracion_snapshot: svc.duracion_min,
          precio_snapshot: svc.precio,
          estado: payload.estado || 'pendiente',
          notas: payload.notas || '',
        })
        .select()
        .single();
      if (error) {
        if (error.code === '23P01') {
          throw new Error('El barbero ya tiene una cita programada en ese horario.');
        }
        throw new Error(error.message);
      }
      return data;
    }
    return localFetch('/api/citas', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateAppointment(id, payload) {
    if (isSupabaseConfigured && supabase) {
      const updates = {};
      if (payload.estado) updates.estado = payload.estado;
      if (payload.motivo_cancelacion) updates.motivo_cancelacion = payload.motivo_cancelacion;
      if (payload.fecha && payload.hora) {
        const { data: current } = await supabase
          .from('citas')
          .select('duracion_snapshot')
          .eq('id', id)
          .single();
        const startDt = buildLocalDateTime(payload.fecha, payload.hora);
        const endDt = new Date(startDt.getTime() + current.duracion_snapshot * 60_000);
        updates.fecha_hora_inicio = startDt.toISOString();
        updates.fecha_hora_fin = endDt.toISOString();
        if (payload.barbero_id) updates.barbero_id = payload.barbero_id;
      }
      const { data, error } = await supabase
        .from('citas')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        if (error.code === '23P01') {
          throw new Error('El horario elegido ya está ocupado para ese barbero.');
        }
        throw new Error(error.message);
      }
      return data;
    }
    return localFetch(`/api/citas/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  async searchHistory(query) {
    const q = String(query || '').trim();
    const phone = normalizePhone(q);
    if (q.length < 2 && phone.length < 4) {
      throw new Error('Escribe al menos 2 caracteres para buscar un cliente.');
    }
    if (isSupabaseConfigured && supabase) {
      // Nunca descargar todas las citas para filtrar en el navegador.
      // Escapar comodines de ILIKE evita que '%' o '_' amplíen la búsqueda.
      const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      const searches = [
        supabase.from('clientes').select('id,nombre,telefono,correo').ilike('nombre', pattern).limit(25),
        supabase.from('clientes').select('id,nombre,telefono,correo').ilike('correo', pattern).limit(25),
      ];
      if (phone.length >= 4) {
        searches.push(
          supabase.from('clientes').select('id,nombre,telefono,correo').ilike('telefono', `%${phone}%`).limit(25)
        );
      }
      const results = await Promise.all(searches);
      const clientsById = new Map();
      for (const { data, error } of results) {
        if (error) throw new Error(error.message);
        for (const client of data || []) clientsById.set(client.id, client);
      }
      return {
        clientes: [...clientsById.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
        citas: [],
      };
    }
    const params = new URLSearchParams({ q });
    return localFetch(`/api/historial?${params.toString()}`);
  },

  async getClientHistory(clienteId) {
    if (!clienteId) throw new Error('Selecciona un cliente para consultar su historial.');
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('citas')
        .select('*, clientes(nombre, telefono), barberos(nombre), servicios(nombre)')
        .eq('cliente_id', clienteId)
        .order('fecha_hora_inicio', { ascending: false });
      if (error) throw new Error(error.message);
      return {
        citas: (data || []).map((a) => ({
          ...a,
          cliente_nombre: a.clientes?.nombre || 'Cliente',
          cliente_telefono: a.clientes?.telefono || '',
          barbero_nombre: a.barberos?.nombre || 'Barbero',
          servicio_nombre: a.servicios?.nombre || 'Servicio',
        })),
      };
    }
    const params = new URLSearchParams({ cliente_id: clienteId });
    return localFetch(`/api/historial?${params.toString()}`);
  },

  async getReports({ desde, hasta }) {
    if (isSupabaseConfigured && supabase) {
      const [{ data: appointments }, { data: services }, { data: barbers }] = await Promise.all([
        supabase.from('citas').select('*'),
        supabase.from('servicios').select('*'),
        supabase.from('barberos').select('*'),
      ]);
      return computeReports({
        appointments: appointments || [],
        services: services || [],
        barbers: barbers || [],
        fromDate: desde || null,
        toDate: hasta || null,
      });
    }
    const params = new URLSearchParams();
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    return localFetch(`/api/reportes?${params.toString()}`);
  },
};
