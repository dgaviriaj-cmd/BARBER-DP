import { isSupabaseConfigured, supabase } from './supabaseClient.js';
import {
  computeReports,
  generateAvailableSlots,
  getDayOfWeekFromDateStr,
  normalizePhone,
  validateClientPayload,
} from '../core/scheduling.js';

import { getShopDateKey } from '../utils/formatters.js';

const TOKEN_STORAGE_KEY = 'barberdp_session_token';

// Supabase stores instants. The shop's calendar uses Colombia time (UTC−05:00).
function buildBookingDateTime(date, time) {
  return new Date(date + 'T' + time + ':00-05:00');
}

function checkResult({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

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
 * Capa de acceso a datos unificada: usa Supabase PostgreSQL + Auth si está configurado,
 * o la API local persistente (/api/*) cuando aún no se configuran credenciales de Supabase.
 */
export const api = {
  getBackendMode() {
    return isSupabaseConfigured ? 'supabase' : 'local';
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
        options: {
          data: { nombre: val.normalized.nombre, telefono: val.normalized.telefono },
          emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href,
        },
      });
      if (error) throw new Error(error.message);
      if (!data.session) return null;
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
    if (isSupabaseConfigured && supabase) {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      let user = null;
      if (authUser) {
        let perfil = checkResult(await supabase
          .from('perfiles')
          .select('nombre, rol, activo')
          .eq('id', authUser.id)
          .maybeSingle());
        let cli = checkResult(await supabase
          .from('clientes')
          .select('id')
          .eq('perfil_id', authUser.id)
          .maybeSingle());
        if ((!perfil || (perfil.rol === 'cliente' && perfil.activo && !cli))
            && authUser.user_metadata?.telefono) {
          checkResult(await supabase.rpc('activar_cliente'));
          perfil = checkResult(await supabase.from('perfiles')
            .select('nombre, rol, activo').eq('id', authUser.id).single());
          cli = checkResult(await supabase.from('clientes')
            .select('id').eq('perfil_id', authUser.id).maybeSingle());
        }
        user = {
          id: authUser.id,
          nombre: perfil?.nombre || authUser.email,
          correo: authUser.email,
          rol: perfil?.activo ? perfil.rol : 'cliente',
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
        clientes = checkResult(cliRes) || [];
        citas = checkResult(citRes) || [];
      }

      return {
        mode: 'supabase',
        user,
        servicios: checkResult(svcRes) || [],
        barberos: checkResult(barbRes) || [],
        barbero_servicios: checkResult(bsRes) || [],
        horarios_barbero: checkResult(horRes) || [],
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
      const [serviceResult, scheduleResult, busyResult] = await Promise.all([
        supabase.from('servicios').select('duracion_min').eq('id', servicio_id).single(),
        supabase.from('horarios_barbero').select('*')
          .eq('barbero_id', barbero_id).eq('dia_semana', dayOfWeek).maybeSingle(),
        supabase.rpc('franjas_ocupadas', { barbero: barbero_id, dia: fecha, ignorar: ignorar_cita_id }),
      ]);
      const svc = checkResult(serviceResult);
      const schedule = checkResult(scheduleResult);
      const occupied = checkResult(busyResult);
      if (!schedule || !schedule.activo) {
        return { slots: [], message: 'El barbero no atiende ese día de la semana.' };
      }
      const slots = generateAvailableSlots({
        dateStr: fecha,
        serviceDurationMin: svc.duracion_min,
        schedule,
        existingAppointments: occupied.map((range) => ({ ...range, estado: 'pendiente' })),
        buildDateTime: buildBookingDateTime,
        stepMin: 15,
        now: new Date(),
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
      const startDt = buildBookingDateTime(payload.fecha, payload.hora);
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
        const startDt = buildBookingDateTime(payload.fecha, payload.hora);
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
    if (isSupabaseConfigured && supabase) {
      const { data: citas, error } = await supabase
        .from('citas')
        .select('*, clientes(nombre, telefono, correo), barberos(nombre), servicios(nombre)')
        .order('fecha_hora_inicio', { ascending: false });
      if (error) throw new Error(error.message);
      const q = query.trim().toLowerCase();
      const filtered = (citas || [])
        .filter(
          (a) =>
            a.clientes?.nombre?.toLowerCase().includes(q) ||
            a.clientes?.correo?.toLowerCase().includes(q) ||
            (normalizePhone(q) && a.clientes?.telefono?.includes(normalizePhone(q)))
        )
        .map((a) => ({
          ...a,
          cliente_nombre: a.clientes?.nombre || 'Cliente',
          cliente_telefono: a.clientes?.telefono || '',
          barbero_nombre: a.barberos?.nombre || 'Barbero',
          servicio_nombre: a.servicios?.nombre || 'Servicio',
        }));
      return { clientes: [], citas: filtered };
    }
    const params = new URLSearchParams({ q: query });
    return localFetch(`/api/historial?${params.toString()}`);
  },

  async getReports({ desde, hasta }) {
    if (isSupabaseConfigured && supabase) {
      const [appointments, services, barbers] = await Promise.all([
        supabase.from('citas').select('*'),
        supabase.from('servicios').select('*'),
        supabase.from('barberos').select('*'),
      ]);
      return computeReports({
        appointments: checkResult(appointments) || [],
        services: checkResult(services) || [],
        barbers: checkResult(barbers) || [],
        fromDate: desde || null,
        toDate: hasta || null,
        dateKeyFor: getShopDateKey,
      });
    }
    const params = new URLSearchParams();
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    return localFetch(`/api/reportes?${params.toString()}`);
  },
};
