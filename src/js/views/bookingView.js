import { api } from '../services/api.js';
import {
  escapeHtml,
  formatCurrency,
  getTodayDateInputValue,
  getTomorrowDateInputValue,
} from '../utils/formatters.js';

/**
 * Módulo 5: Reserva de citas con consulta real de disponibilidad y prevención de solapamiento.
 */
export function renderBookingView(
  state,
  { preselectedServiceId, initialSuccessMsg = '', onBookingCreated, notify }
) {
  const needsAccount = state.mode === 'supabase' && state.user?.rol !== 'admin' && !state.user?.clienteId;
  const activeServices = state.servicios.filter((s) => s.activo);
  const activeBarbers = state.barberos.filter((b) => b.activo);

  const localState = {
    servicioId:
      preselectedServiceId && activeServices.some((s) => s.id === preselectedServiceId)
        ? preselectedServiceId
        : activeServices[0]?.id || '',
    barberoId: '',
    fecha: getTomorrowDateInputValue(),
    hora: '',
    notes: '',
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    reuseExisting: true,
    slots: [],
    slotsMessage: '',
    loadingSlots: false,
    clientMode: state.user?.rol === 'admin' && state.clientes.length ? 'existing' : 'new',
    selectedClientId: state.user?.clienteId || state.clientes[0]?.id || '',
    errorMsg: '',
    successMsg: initialSuccessMsg || '',
  };

  function getEligibleBarbers(serviceId) {
    if (!serviceId) return activeBarbers;
    const eligibleIds = new Set(
      state.barbero_servicios
        .filter((bs) => bs.servicio_id === serviceId)
        .map((bs) => bs.barbero_id)
    );
    return activeBarbers.filter((b) => eligibleIds.has(b.id));
  }

  const initialEligible = getEligibleBarbers(localState.servicioId);
  localState.barberoId = initialEligible[0]?.id || '';

  const wrapper = document.createElement('section');
  wrapper.className = 'section';

  async function loadAvailability() {
    if (!localState.barberoId || !localState.servicioId || !localState.fecha) {
      localState.slots = [];
      localState.hora = '';
      render();
      return;
    }
    localState.loadingSlots = true;
    localState.hora = '';
    render();

    try {
      const res = await api.getDisponibilidad({
        barbero_id: localState.barberoId,
        servicio_id: localState.servicioId,
        fecha: localState.fecha,
      });
      localState.slots = res.slots || [];
      localState.slotsMessage = res.message || '';
    } catch (err) {
      localState.slots = [];
      localState.slotsMessage = err.message;
    } finally {
      localState.loadingSlots = false;
      render();
    }
  }

  function render() {
    const selectedService = activeServices.find((s) => s.id === localState.servicioId) || null;
    const eligibleBarbers = getEligibleBarbers(localState.servicioId);
    if (!eligibleBarbers.some((b) => b.id === localState.barberoId)) {
      localState.barberoId = eligibleBarbers[0]?.id || '';
    }
    const selectedBarber = eligibleBarbers.find((b) => b.id === localState.barberoId) || null;
    const selectedSlot = localState.slots.find((s) => s.hora === localState.hora) || null;

    const isAdmin = state.user?.rol === 'admin';
    const loggedClient =
      state.user?.clienteId
        ? state.clientes.find((c) => c.id === state.user.clienteId)
        : null;

    const slotsContent = localState.loadingSlots
      ? `<p class="form-help">Consultando horarios disponibles...</p>`
      : localState.slots.length
        ? `
          <div class="slots-grid" role="group" aria-label="Horarios disponibles">
            ${localState.slots
              .map(
                (slot) => `
                  <button
                    type="button"
                    class="slot-btn ${localState.hora === slot.hora ? 'is-selected' : ''}"
                    data-slot="${escapeHtml(slot.hora)}"
                    ${slot.disponible ? '' : 'disabled'}
                    title="${slot.disponible ? `Disponible hasta ${slot.hora_fin}` : escapeHtml(slot.motivo || 'No disponible')}"
                  >
                    ${escapeHtml(slot.hora)}
                  </button>
                `
              )
              .join('')}
          </div>
          <p class="form-help" style="margin-top:0.65rem;">
            Los horarios tachados están ocupados o ya pasaron. Se verifica la duración completa del servicio (${selectedService?.duracion_min || 0} min).
          </p>
        `
        : `<p class="form-help">${escapeHtml(localState.slotsMessage || 'No hay franjas disponibles para la fecha seleccionada.')}</p>`;

    let clientFieldsHtml = '';
    if (needsAccount) {
      clientFieldsHtml = `
        <p class="alert alert-info full-span">
          Para confirmar una reserva, <a href="#admin">inicia sesión o crea una cuenta</a>.
        </p>
      `;
    } else if (loggedClient && !isAdmin) {
      clientFieldsHtml = `
        <div class="alert alert-info">
          Reservando como <strong>${escapeHtml(loggedClient.nombre)}</strong> (${escapeHtml(loggedClient.telefono)}).
        </div>
      `;
    } else if (isAdmin && state.clientes.length) {
      clientFieldsHtml = `
        <div class="form-field full-span">
          <label class="form-label">Cliente</label>
          <div class="inline-actions">
            <button type="button" class="btn btn-sm ${localState.clientMode === 'existing' ? 'btn-primary' : 'btn-secondary'}" data-client-mode="existing">
              Seleccionar cliente existente
            </button>
            <button type="button" class="btn btn-sm ${localState.clientMode === 'new' ? 'btn-primary' : 'btn-secondary'}" data-client-mode="new">
              Registrar cliente nuevo
            </button>
          </div>
        </div>
        ${
          localState.clientMode === 'existing'
            ? `
              <div class="form-field full-span">
                <label class="form-label" for="booking-existing-client">Lista de clientes registrados</label>
                <select id="booking-existing-client" class="form-control">
                  ${state.clientes
                    .map(
                      (c) => `
                        <option value="${escapeHtml(c.id)}" ${c.id === localState.selectedClientId ? 'selected' : ''}>
                          ${escapeHtml(c.nombre)} · ${escapeHtml(c.telefono)}
                        </option>
                      `
                    )
                    .join('')}
                </select>
              </div>
            `
            : `
              <div class="form-field">
                <label class="form-label" for="booking-client-name">Nombre completo *</label>
                <input id="booking-client-name" type="text" class="form-control" required minlength="2" value="${escapeHtml(localState.clientName)}" placeholder="Ej. Laura Pérez" />
              </div>
              <div class="form-field">
                <label class="form-label" for="booking-client-phone">Teléfono *</label>
                <input id="booking-client-phone" type="tel" class="form-control" required minlength="7" value="${escapeHtml(localState.clientPhone)}" placeholder="Ej. 3105550199" />
              </div>
              <div class="form-field full-span">
                <label class="form-label" for="booking-client-email">Correo electrónico (opcional)</label>
                <input id="booking-client-email" type="email" class="form-control" value="${escapeHtml(localState.clientEmail)}" placeholder="correo@ejemplo.com" />
              </div>
            `
        }
      `;
    } else {
      clientFieldsHtml = `
        <div class="form-field">
          <label class="form-label" for="booking-client-name">Nombre completo *</label>
          <input id="booking-client-name" type="text" class="form-control" required minlength="2" value="${escapeHtml(localState.clientName)}" placeholder="Ej. David Torres" />
        </div>
        <div class="form-field">
          <label class="form-label" for="booking-client-phone">Teléfono *</label>
          <input id="booking-client-phone" type="tel" class="form-control" required minlength="7" value="${escapeHtml(localState.clientPhone)}" placeholder="Ej. 3105550144" />
        </div>
        <div class="form-field full-span">
          <label class="form-label" for="booking-client-email">Correo electrónico (opcional)</label>
          <input id="booking-client-email" type="email" class="form-control" value="${escapeHtml(localState.clientEmail)}" placeholder="correo@ejemplo.com" />
        </div>
        <div class="form-field full-span">
          <label class="checkbox-option">
            <input id="booking-reuse-client" type="checkbox" ${localState.reuseExisting ? 'checked' : ''} />
            <span>Si mi teléfono ya está registrado, asociar esta cita a mi ficha existente</span>
          </label>
        </div>
      `;
    }

    wrapper.innerHTML = `
      <div class="container">
        <div class="section-header">
          <div>
            <h1 class="section-title">Reservar cita</h1>
            <p class="section-subtitle">
              Selecciona servicio, barbero, fecha y un bloque horario disponible. El sistema bloquea reservas superpuestas.
            </p>
          </div>
        </div>

        ${localState.errorMsg ? `<div class="alert alert-error" role="alert">${escapeHtml(localState.errorMsg)}</div>` : ''}
        ${localState.successMsg ? `<div class="alert alert-success" role="status">${escapeHtml(localState.successMsg)}</div>` : ''}

        <div class="booking-layout">
          <form id="booking-form" class="surface-card" novalidate>
            <div class="form-grid">
              <div class="form-field">
                <label class="form-label" for="booking-service">1. Servicio *</label>
                <select id="booking-service" class="form-control" required>
                  ${activeServices
                    .map(
                      (s) => `
                        <option value="${escapeHtml(s.id)}" ${s.id === localState.servicioId ? 'selected' : ''}>
                          ${escapeHtml(s.nombre)} (${s.duracion_min} min · ${escapeHtml(formatCurrency(s.precio))})
                        </option>
                      `
                    )
                    .join('')}
                </select>
              </div>

              <div class="form-field">
                <label class="form-label" for="booking-barber">2. Barbero *</label>
                <select id="booking-barber" class="form-control" required ${eligibleBarbers.length ? '' : 'disabled'}>
                  ${
                    eligibleBarbers.length
                      ? eligibleBarbers
                          .map(
                            (b) => `
                              <option value="${escapeHtml(b.id)}" ${b.id === localState.barberoId ? 'selected' : ''}>
                                ${escapeHtml(b.nombre)}
                              </option>
                            `
                          )
                          .join('')
                      : '<option value="">Sin barberos asignados a este servicio</option>'
                  }
                </select>
              </div>

              <div class="form-field">
                <label class="form-label" for="booking-date">3. Fecha *</label>
                <input
                  id="booking-date"
                  type="date"
                  class="form-control"
                  min="${getTodayDateInputValue()}"
                  value="${escapeHtml(localState.fecha)}"
                  required
                />
              </div>

              <div class="form-field">
                <label class="form-label" for="booking-notes">Notas adicionales (opcional)</label>
                <input id="booking-notes" type="text" class="form-control" value="${escapeHtml(localState.notes)}" placeholder="Ej. Corte con tijera arriba" />
              </div>

              <div class="form-field full-span">
                <span class="form-label">4. Horario disponible *</span>
                ${slotsContent}
              </div>

              ${clientFieldsHtml}
            </div>

            <div style="margin-top: 1.5rem; display: flex; justify-content: flex-end; gap: 0.75rem;">
              <button type="submit" class="btn btn-primary" id="booking-submit-btn" ${!localState.hora || needsAccount ? 'disabled' : ''}>
                Confirmar reserva
              </button>
            </div>
          </form>

          <aside class="surface-card" aria-label="Resumen de la cita">
            <h2 style="font-size: 1.125rem;">Resumen de reserva</h2>
            <dl class="summary-list">
              <div class="summary-row">
                <dt>Servicio</dt>
                <dd>${selectedService ? escapeHtml(selectedService.nombre) : '—'}</dd>
              </div>
              <div class="summary-row">
                <dt>Duración</dt>
                <dd class="tabular">${selectedService ? `${selectedService.duracion_min} min` : '—'}</dd>
              </div>
              <div class="summary-row">
                <dt>Barbero</dt>
                <dd>${selectedBarber ? escapeHtml(selectedBarber.nombre) : '—'}</dd>
              </div>
              <div class="summary-row">
                <dt>Fecha</dt>
                <dd class="tabular">${escapeHtml(localState.fecha || '—')}</dd>
              </div>
              <div class="summary-row">
                <dt>Horario</dt>
                <dd class="tabular">${selectedSlot ? `${selectedSlot.hora} – ${selectedSlot.hora_fin}` : 'Selecciona un bloque'}</dd>
              </div>
              <div class="summary-row" style="border-bottom: none; padding-bottom: 0;">
                <dt>Valor estimado</dt>
                <dd class="tabular">${selectedService ? escapeHtml(formatCurrency(selectedService.precio)) : '—'}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    `;

    wrapper.querySelector('#booking-service')?.addEventListener('change', (ev) => {
      localState.servicioId = ev.target.value;
      localState.errorMsg = '';
      localState.successMsg = '';
      loadAvailability();
    });

    wrapper.querySelector('#booking-barber')?.addEventListener('change', (ev) => {
      localState.barberoId = ev.target.value;
      localState.errorMsg = '';
      localState.successMsg = '';
      loadAvailability();
    });

    wrapper.querySelector('#booking-date')?.addEventListener('change', (ev) => {
      localState.fecha = ev.target.value;
      localState.errorMsg = '';
      localState.successMsg = '';
      loadAvailability();
    });

    wrapper.querySelector('#booking-notes')?.addEventListener('input', (ev) => {
      localState.notes = ev.target.value;
    });
    wrapper.querySelector('#booking-client-name')?.addEventListener('input', (ev) => {
      localState.clientName = ev.target.value;
    });
    wrapper.querySelector('#booking-client-phone')?.addEventListener('input', (ev) => {
      localState.clientPhone = ev.target.value;
    });
    wrapper.querySelector('#booking-client-email')?.addEventListener('input', (ev) => {
      localState.clientEmail = ev.target.value;
    });
    wrapper.querySelector('#booking-reuse-client')?.addEventListener('change', (ev) => {
      localState.reuseExisting = ev.target.checked;
    });

    wrapper.querySelectorAll('[data-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        localState.hora = btn.getAttribute('data-slot');
        localState.errorMsg = '';
        render();
      });
    });

    wrapper.querySelectorAll('[data-client-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        localState.clientMode = btn.getAttribute('data-client-mode');
        render();
      });
    });

    wrapper.querySelector('#booking-existing-client')?.addEventListener('change', (ev) => {
      localState.selectedClientId = ev.target.value;
    });

    wrapper.querySelector('#booking-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      localState.errorMsg = '';
      localState.successMsg = '';

      if (needsAccount) return;
      if (!localState.hora) {
        localState.errorMsg = 'Selecciona un bloque horario disponible.';
        render();
        return;
      }

      const payload = {
        servicio_id: localState.servicioId,
        barbero_id: localState.barberoId,
        fecha: localState.fecha,
        hora: localState.hora,
        notas: localState.notes,
      };

      if (loggedClient && !isAdmin) {
        payload.cliente_id = loggedClient.id;
      } else if (isAdmin && localState.clientMode === 'existing' && localState.selectedClientId) {
        payload.cliente_id = localState.selectedClientId;
      } else {
        payload.cliente_nuevo = {
          nombre: localState.clientName.trim(),
          telefono: localState.clientPhone.trim(),
          correo: localState.clientEmail.trim(),
          permitir_reutilizar: localState.reuseExisting,
        };
      }

      const submitBtn = wrapper.querySelector('#booking-submit-btn');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const created = await api.createAppointment(payload);
        const successText = `Cita creada correctamente para el ${localState.fecha} a las ${localState.hora} (estado: ${created.estado}).`;
        notify('Reserva confirmada en el sistema.', 'success');
        await onBookingCreated(successText);
      } catch (err) {
        localState.errorMsg = err.message;
        notify(err.message, 'error');
        render();
      }
    });
  }

  loadAvailability();
  return wrapper;
}
