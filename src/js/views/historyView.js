import { api } from '../services/api.js';
import {
  escapeHtml,
  formatCurrency,
  formatDateOnly,
  formatTimeOnly,
  getStatusLabel,
  getTodayDateInputValue,
} from '../utils/formatters.js';

/**
 * Módulo 6: Historial de atención por cliente con reprogramación y cancelación.
 */
export function renderHistoryView(state, { openModal, closeModal, onRefresh, notify }) {
  const localState = {
    query: '',
    loading: false,
    error: '',
    results: null,
  };

  // Si el usuario es cliente autenticado, mostramos sus citas automáticamente al entrar
  const isLoggedClient = state.user?.rol === 'cliente' && state.user?.clienteId;
  if (isLoggedClient && state.citas.length && localState.results === null) {
    const cliMap = new Map(state.clientes.map((c) => [c.id, c]));
    const barbMap = new Map(state.barberos.map((b) => [b.id, b]));
    const svcMap = new Map(state.servicios.map((s) => [s.id, s]));
    localState.results = state.citas.map((a) => ({
      ...a,
      cliente_nombre: cliMap.get(a.cliente_id)?.nombre || state.user.nombre,
      cliente_telefono: cliMap.get(a.cliente_id)?.telefono || '',
      barbero_nombre: barbMap.get(a.barbero_id)?.nombre || 'Barbero',
      servicio_nombre: svcMap.get(a.servicio_id)?.nombre || 'Servicio',
    }));
  }

  const wrapper = document.createElement('section');
  wrapper.className = 'section';

  async function runSearch(queryText) {
    const q = queryText.trim();
    if (!q) {
      localState.error = 'Ingresa un teléfono, correo o nombre del cliente.';
      render();
      return;
    }
    localState.loading = true;
    localState.error = '';
    render();
    try {
      const data = await api.searchHistory(q);
      localState.results = data.citas || [];
    } catch (err) {
      localState.error = err.message;
      localState.results = [];
    } finally {
      localState.loading = false;
      render();
    }
  }

  function openRescheduleDialog(appt) {
    const currentDate = appt.fecha_hora_inicio.slice(0, 10);
    let selectedHora = '';
    let slots = [];
    let modalError = '';

    const bodyEl = document.createElement('div');

    async function fetchSlots(fecha) {
      try {
        const res = await api.getDisponibilidad({
          barbero_id: appt.barbero_id,
          servicio_id: appt.servicio_id,
          fecha,
          ignorar_cita_id: appt.id,
        });
        slots = res.slots || [];
        modalError = slots.length ? '' : res.message || 'Sin horarios disponibles para esa fecha.';
      } catch (err) {
        slots = [];
        modalError = err.message;
      }
      renderBody(fecha);
    }

    function renderBody(fechaVal) {
      bodyEl.innerHTML = `
        <form id="reschedule-form" novalidate>
          <p class="form-help" style="margin-bottom:1rem;">
            Reprogramando <strong>${escapeHtml(appt.servicio_nombre)}</strong> con <strong>${escapeHtml(appt.barbero_nombre)}</strong>.
          </p>
          ${modalError ? `<div class="alert alert-error">${escapeHtml(modalError)}</div>` : ''}
          <div class="form-field" style="margin-bottom:1rem;">
            <label class="form-label" for="resched-date">Nueva fecha *</label>
            <input id="resched-date" type="date" class="form-control" min="${getTodayDateInputValue()}" value="${escapeHtml(fechaVal)}" required />
          </div>
          <div class="form-field" style="margin-bottom:1rem;">
            <span class="form-label">Horario disponible *</span>
            <div class="slots-grid">
              ${slots
                .map(
                  (s) => `
                    <button type="button" class="slot-btn ${selectedHora === s.hora ? 'is-selected' : ''}" data-rslot="${escapeHtml(s.hora)}" ${s.disponible ? '' : 'disabled'}>
                      ${escapeHtml(s.hora)}
                    </button>
                  `
                )
                .join('')}
            </div>
          </div>
          ${
            state.user?.rol === 'admin' || isLoggedClient
              ? ''
              : `
                <div class="form-field" style="margin-bottom:1rem;">
                  <label class="form-label" for="resched-phone">Confirma el teléfono del cliente *</label>
                  <input id="resched-phone" type="tel" class="form-control" required placeholder="Ej. 3105550101" />
                </div>
              `
          }
          <div class="inline-actions" style="justify-content:flex-end; margin-top:1.25rem;">
            <button type="button" class="btn btn-secondary" id="resched-cancel-btn">Cerrar</button>
            <button type="submit" class="btn btn-primary" ${selectedHora ? '' : 'disabled'}>Guardar nuevo horario</button>
          </div>
        </form>
      `;

      bodyEl.querySelector('#resched-date')?.addEventListener('change', (ev) => {
        selectedHora = '';
        fetchSlots(ev.target.value);
      });

      bodyEl.querySelectorAll('[data-rslot]').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedHora = btn.getAttribute('data-rslot');
          renderBody(fechaVal);
        });
      });

      bodyEl.querySelector('#resched-cancel-btn')?.addEventListener('click', closeModal);

      bodyEl.querySelector('#reschedule-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const phoneVerify = bodyEl.querySelector('#resched-phone')?.value?.trim() || '';
        try {
          await api.updateAppointment(appt.id, {
            fecha: fechaVal,
            hora: selectedHora,
            telefono_verificacion: phoneVerify || undefined,
          });
          closeModal();
          notify('Cita reprogramada correctamente.', 'success');
          await onRefresh();
          if (localState.query) await runSearch(localState.query);
        } catch (err) {
          modalError = err.message;
          renderBody(fechaVal);
        }
      });
    }

    openModal('Reprogramar cita', bodyEl);
    fetchSlots(currentDate);
  }

  function openCancelDialog(appt) {
    const bodyEl = document.createElement('div');
    let errMsg = '';

    function renderCancel() {
      bodyEl.innerHTML = `
        <form id="cancel-appt-form" novalidate>
          <p class="form-help" style="margin-bottom:1rem;">
            Vas a cancelar la cita de <strong>${escapeHtml(appt.servicio_nombre)}</strong> del ${escapeHtml(formatDateOnly(appt.fecha_hora_inicio))}.
          </p>
          ${errMsg ? `<div class="alert alert-error">${escapeHtml(errMsg)}</div>` : ''}
          <div class="form-field" style="margin-bottom:1rem;">
            <label class="form-label" for="cancel-reason">Motivo de cancelación *</label>
            <input id="cancel-reason" type="text" class="form-control" required minlength="3" placeholder="Ej. Cambio de disponibilidad" />
          </div>
          ${
            state.user?.rol === 'admin' || isLoggedClient
              ? ''
              : `
                <div class="form-field" style="margin-bottom:1rem;">
                  <label class="form-label" for="cancel-phone">Confirma el teléfono del cliente *</label>
                  <input id="cancel-phone" type="tel" class="form-control" required placeholder="Ej. 3105550101" />
                </div>
              `
          }
          <div class="inline-actions" style="justify-content:flex-end;">
            <button type="button" class="btn btn-secondary" id="cancel-dialog-close">Volver</button>
            <button type="submit" class="btn btn-danger-outline">Confirmar cancelación</button>
          </div>
        </form>
      `;

      bodyEl.querySelector('#cancel-dialog-close')?.addEventListener('click', closeModal);
      bodyEl.querySelector('#cancel-appt-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const reason = bodyEl.querySelector('#cancel-reason')?.value?.trim() || '';
        const phoneVerify = bodyEl.querySelector('#cancel-phone')?.value?.trim() || '';
        if (reason.length < 3) {
          errMsg = 'Indica brevemente el motivo de cancelación.';
          renderCancel();
          return;
        }
        try {
          await api.updateAppointment(appt.id, {
            estado: 'cancelada',
            motivo_cancelacion: reason,
            telefono_verificacion: phoneVerify || undefined,
          });
          closeModal();
          notify('Cita cancelada.', 'success');
          await onRefresh();
          if (localState.query) await runSearch(localState.query);
        } catch (err) {
          errMsg = err.message;
          renderCancel();
        }
      });
    }

    renderCancel();
    openModal('Cancelar cita', bodyEl);
  }

  function render() {
    const rows = localState.results || [];
    const tableHtml =
      localState.results === null
        ? `
          <div class="empty-state">
            <p>Ingresa un número de teléfono, correo o nombre para consultar el historial de servicios de un cliente.</p>
          </div>
        `
        : rows.length === 0
          ? `
            <div class="empty-state">
              <p>No se encontraron citas registradas para esa búsqueda.</p>
            </div>
          `
          : `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Hora</th>
                    <th>Cliente</th>
                    <th>Servicio</th>
                    <th>Barbero</th>
                    <th class="num-col">Valor</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows
                    .map((appt) => {
                      const canEdit = appt.estado === 'pendiente' || appt.estado === 'confirmada';
                      return `
                        <tr>
                          <td class="tabular">${escapeHtml(formatDateOnly(appt.fecha_hora_inicio))}</td>
                          <td class="tabular">${escapeHtml(formatTimeOnly(appt.fecha_hora_inicio))}</td>
                          <td>
                            <strong>${escapeHtml(appt.cliente_nombre)}</strong>
                            ${appt.cliente_telefono ? `<div class="form-help tabular">${escapeHtml(appt.cliente_telefono)}</div>` : ''}
                          </td>
                          <td>${escapeHtml(appt.servicio_nombre)}</td>
                          <td>${escapeHtml(appt.barbero_nombre)}</td>
                          <td class="num-col">${escapeHtml(formatCurrency(appt.precio_snapshot))}</td>
                          <td>
                            <span class="status-label status-${escapeHtml(appt.estado)}">
                              ${escapeHtml(getStatusLabel(appt.estado))}
                            </span>
                            ${
                              appt.motivo_cancelacion
                                ? `<div class="form-help">${escapeHtml(appt.motivo_cancelacion)}</div>`
                                : ''
                            }
                          </td>
                          <td>
                            ${
                              canEdit
                                ? `
                                  <div class="inline-actions">
                                    <button type="button" class="btn btn-secondary btn-sm" data-reschedule="${escapeHtml(appt.id)}">Reprogramar</button>
                                    <button type="button" class="btn btn-danger-outline btn-sm" data-cancel="${escapeHtml(appt.id)}">Cancelar</button>
                                  </div>
                                `
                                : '<span class="form-help">Cerrada</span>'
                            }
                          </td>
                        </tr>
                      `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
          `;

    wrapper.innerHTML = `
      <div class="container">
        <div class="section-header">
          <div>
            <h1 class="section-title">Historial de servicios</h1>
            <p class="section-subtitle">
              Consulta todas las citas anteriores o activas de un cliente por teléfono, correo o nombre.
            </p>
          </div>
        </div>

        <form id="history-search-form" class="surface-card" style="margin-bottom: 1.5rem;" novalidate>
          <div class="toolbar-row" style="margin-bottom:0;">
            <div class="form-field" style="flex:1; min-width: 240px;">
              <label class="form-label" for="history-query">Buscar cliente (teléfono, nombre o correo)</label>
              <input
                id="history-query"
                type="search"
                class="form-control"
                value="${escapeHtml(localState.query)}"
                placeholder="Ej. 3105550101 o Carlos"
              />
            </div>
            <button type="submit" class="btn btn-primary" ${localState.loading ? 'disabled' : ''}>
              ${localState.loading ? 'Buscando...' : 'Consultar historial'}
            </button>
          </div>
        </form>

        ${localState.error ? `<div class="alert alert-error">${escapeHtml(localState.error)}</div>` : ''}
        ${tableHtml}
      </div>
    `;

    wrapper.querySelector('#history-search-form')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      localState.query = wrapper.querySelector('#history-query')?.value || '';
      runSearch(localState.query);
    });

    wrapper.querySelectorAll('[data-reschedule]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-reschedule');
        const appt = rows.find((r) => r.id === id);
        if (appt) openRescheduleDialog(appt);
      });
    });

    wrapper.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-cancel');
        const appt = rows.find((r) => r.id === id);
        if (appt) openCancelDialog(appt);
      });
    });
  }

  render();
  return wrapper;
}
