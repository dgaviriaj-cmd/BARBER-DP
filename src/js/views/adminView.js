import { api } from '../services/api.js';
import { computeReports } from '../core/scheduling.js';
import {
  escapeHtml,
  formatCurrency,
  formatDateOnly,
  formatTimeOnly,
  getDayName,
  getStatusLabel,
  getTodayDateInputValue,
} from '../utils/formatters.js';

/**
 * Módulos 2, 3, 4, 5 y 7: Panel de administración y autenticación.
 */
export function renderAdminView(
  state,
  { activeTab = 'citas', onTabChange, openModal, closeModal, onRefresh, notify, onNavigate }
) {
  const localState = {
    activeTab,
    filterStatus: 'todas',
    filterBarber: 'todos',
    clientSearch: '',
    reportFrom: '',
    reportTo: '',
    authError: '',
    registerError: '',
  };

  const wrapper = document.createElement('section');
  wrapper.className = 'section';

  function renderAuthScreen() {
    const isClientLogged = state.user && state.user.rol !== 'admin';
    wrapper.innerHTML = `
      <div class="container">
        <div class="section-header">
          <div>
            <h1 class="section-title">Acceso al sistema</h1>
            <p class="section-subtitle">
              Inicia sesión como administrador para gestionar barberos, servicios, clientes, agenda y reportes.
            </p>
          </div>
          ${
            state.user
              ? `<button type="button" class="btn btn-secondary" id="admin-logout-btn">Cerrar sesión (${escapeHtml(state.user.nombre)})</button>`
              : ''
          }
        </div>

        ${
          isClientLogged
            ? `
              <div class="alert alert-info">
                Has iniciado sesión como cliente (<strong>${escapeHtml(state.user.nombre)}</strong>).
                Puedes consultar tus reservas en <a href="#historial" style="text-decoration:underline; font-weight:600;">Historial</a> o cerrar sesión para entrar como administrador.
              </div>
            `
            : ''
        }

        <div class="auth-grid">
          <form id="login-form" class="surface-card" novalidate>
            <h2 style="font-size:1.15rem; margin-bottom:1rem;">Iniciar sesión</h2>
            ${localState.authError ? `<div class="alert alert-error">${escapeHtml(localState.authError)}</div>` : ''}
            <div class="form-field" style="margin-bottom:0.875rem;">
              <label class="form-label" for="login-email">Correo electrónico</label>
              <input id="login-email" type="email" class="form-control" required placeholder="admin@barberdp.local" />
            </div>
            <div class="form-field" style="margin-bottom:1rem;">
              <label class="form-label" for="login-password">Contraseña</label>
              <input id="login-password" type="password" class="form-control" required placeholder="••••••••" />
            </div>
            <div class="inline-actions" style="justify-content:space-between; align-items:center;">
              <button type="submit" class="btn btn-primary">Entrar</button>
              ${
                state.mode === 'local'
                  ? `<button type="button" class="btn btn-secondary btn-sm" id="fill-demo-admin">Usar acceso Admin Demo</button>`
                  : ''
              }
            </div>
            ${
              state.mode === 'local'
                ? `
                  <p class="form-help" style="margin-top:1rem;">
                    Credenciales de evaluación académica (modo local):<br />
                    Admin: <span class="tabular">admin@barberdp.local</span> / <span class="tabular">BarberAdmin2026!</span><br />
                    Cliente: <span class="tabular">carlos.demo@barberdp.local</span> / <span class="tabular">ClienteDemo2026!</span>
                  </p>
                `
                : ''
            }
          </form>

          <form id="register-form" class="surface-card" novalidate>
            <h2 style="font-size:1.15rem; margin-bottom:1rem;">Registro de cliente</h2>
            ${localState.registerError ? `<div class="alert alert-error">${escapeHtml(localState.registerError)}</div>` : ''}
            <div class="form-grid">
              <div class="form-field">
                <label class="form-label" for="reg-name">Nombre completo *</label>
                <input id="reg-name" type="text" class="form-control" required minlength="2" />
              </div>
              <div class="form-field">
                <label class="form-label" for="reg-phone">Teléfono *</label>
                <input id="reg-phone" type="tel" class="form-control" required minlength="7" />
              </div>
              <div class="form-field full-span">
                <label class="form-label" for="reg-email">Correo electrónico *</label>
                <input id="reg-email" type="email" class="form-control" required />
              </div>
              <div class="form-field full-span">
                <label class="form-label" for="reg-password">Contraseña (mínimo 6 caracteres) *</label>
                <input id="reg-password" type="password" class="form-control" required minlength="6" />
              </div>
            </div>
            <div style="margin-top:1rem; display:flex; justify-content:flex-end;">
              <button type="submit" class="btn btn-accent">Crear cuenta de cliente</button>
            </div>
          </form>
        </div>
      </div>
    `;

    wrapper.querySelector('#admin-logout-btn')?.addEventListener('click', async () => {
      await api.logout();
      notify('Sesión cerrada.', 'success');
      await onRefresh();
    });

    wrapper.querySelector('#fill-demo-admin')?.addEventListener('click', () => {
      wrapper.querySelector('#login-email').value = 'admin@barberdp.local';
      wrapper.querySelector('#login-password').value = 'BarberAdmin2026!';
    });

    wrapper.querySelector('#login-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      localState.authError = '';
      const email = wrapper.querySelector('#login-email')?.value?.trim() || '';
      const password = wrapper.querySelector('#login-password')?.value || '';
      try {
        await api.login(email, password);
        notify('Sesión iniciada correctamente.', 'success');
        await onRefresh();
      } catch (err) {
        localState.authError = err.message;
        renderAuthScreen();
      }
    });

    wrapper.querySelector('#register-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      localState.registerError = '';
      const nombre = wrapper.querySelector('#reg-name')?.value?.trim() || '';
      const telefono = wrapper.querySelector('#reg-phone')?.value?.trim() || '';
      const correo = wrapper.querySelector('#reg-email')?.value?.trim() || '';
      const password = wrapper.querySelector('#reg-password')?.value || '';
      try {
        await api.register({ nombre, telefono, correo, password });
        notify('Cuenta creada. Ya puedes consultar tu historial o reservar.', 'success');
        await onRefresh();
        onNavigate('historial');
      } catch (err) {
        localState.registerError = err.message;
        renderAuthScreen();
      }
    });
  }

  // --- MODALES CRUD ADMIN ---
  function openClientModal(existingClient = null) {
    const bodyEl = document.createElement('div');
    let errMsg = '';
    function renderModal() {
      bodyEl.innerHTML = `
        <form id="client-crud-form" novalidate>
          ${errMsg ? `<div class="alert alert-error">${escapeHtml(errMsg)}</div>` : ''}
          <div class="form-grid">
            <div class="form-field">
              <label class="form-label" for="cli-name">Nombre *</label>
              <input id="cli-name" type="text" class="form-control" required value="${escapeHtml(existingClient?.nombre || '')}" />
            </div>
            <div class="form-field">
              <label class="form-label" for="cli-phone">Teléfono único *</label>
              <input id="cli-phone" type="tel" class="form-control" required value="${escapeHtml(existingClient?.telefono || '')}" />
            </div>
            <div class="form-field full-span">
              <label class="form-label" for="cli-email">Correo electrónico</label>
              <input id="cli-email" type="email" class="form-control" value="${escapeHtml(existingClient?.correo || '')}" />
            </div>
            <div class="form-field full-span">
              <label class="form-label" for="cli-notes">Notas de atención</label>
              <textarea id="cli-notes" class="form-control">${escapeHtml(existingClient?.notas || '')}</textarea>
            </div>
          </div>
          <div class="inline-actions" style="justify-content:flex-end; margin-top:1.25rem;">
            <button type="button" class="btn btn-secondary" id="cli-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary">${existingClient ? 'Guardar cambios' : 'Registrar cliente'}</button>
          </div>
        </form>
      `;
      bodyEl.querySelector('#cli-cancel')?.addEventListener('click', closeModal);
      bodyEl.querySelector('#client-crud-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const payload = {
          nombre: bodyEl.querySelector('#cli-name')?.value || '',
          telefono: bodyEl.querySelector('#cli-phone')?.value || '',
          correo: bodyEl.querySelector('#cli-email')?.value || '',
          notas: bodyEl.querySelector('#cli-notes')?.value || '',
        };
        try {
          if (existingClient) {
            await api.updateClient(existingClient.id, payload);
            notify('Cliente actualizado.', 'success');
          } else {
            await api.createClient(payload);
            notify('Cliente registrado.', 'success');
          }
          closeModal();
          await onRefresh();
        } catch (err) {
          errMsg = err.message;
          renderModal();
        }
      });
    }
    renderModal();
    openModal(existingClient ? 'Editar cliente' : 'Nuevo cliente', bodyEl);
  }

  function openServiceModal(existingService = null) {
    const bodyEl = document.createElement('div');
    let errMsg = '';
    function renderModal() {
      bodyEl.innerHTML = `
        <form id="service-crud-form" novalidate>
          ${errMsg ? `<div class="alert alert-error">${escapeHtml(errMsg)}</div>` : ''}
          <div class="form-grid">
            <div class="form-field full-span">
              <label class="form-label" for="svc-name">Nombre del servicio *</label>
              <input id="svc-name" type="text" class="form-control" required value="${escapeHtml(existingService?.nombre || '')}" />
            </div>
            <div class="form-field">
              <label class="form-label" for="svc-duration">Duración (minutos) *</label>
              <input id="svc-duration" type="number" min="5" max="240" step="5" class="form-control" required value="${existingService?.duracion_min ?? 30}" />
            </div>
            <div class="form-field">
              <label class="form-label" for="svc-price">Precio *</label>
              <input id="svc-price" type="number" min="0" step="500" class="form-control" required value="${existingService?.precio ?? 25000}" />
            </div>
            <div class="form-field full-span">
              <label class="form-label" for="svc-desc">Descripción *</label>
              <textarea id="svc-desc" class="form-control" required>${escapeHtml(existingService?.descripcion || '')}</textarea>
            </div>
            <div class="form-field full-span">
              <label class="checkbox-option">
                <input id="svc-active" type="checkbox" ${existingService ? (existingService.activo ? 'checked' : '') : 'checked'} />
                <span>Servicio activo (visible para nuevas reservas)</span>
              </label>
            </div>
          </div>
          <div class="inline-actions" style="justify-content:flex-end; margin-top:1.25rem;">
            <button type="button" class="btn btn-secondary" id="svc-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary">${existingService ? 'Guardar cambios' : 'Crear servicio'}</button>
          </div>
        </form>
      `;
      bodyEl.querySelector('#svc-cancel')?.addEventListener('click', closeModal);
      bodyEl.querySelector('#service-crud-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const payload = {
          nombre: bodyEl.querySelector('#svc-name')?.value || '',
          duracion_min: Number(bodyEl.querySelector('#svc-duration')?.value),
          precio: Number(bodyEl.querySelector('#svc-price')?.value),
          descripcion: bodyEl.querySelector('#svc-desc')?.value || '',
          activo: Boolean(bodyEl.querySelector('#svc-active')?.checked),
        };
        try {
          if (existingService) {
            await api.updateService(existingService.id, payload);
            notify('Servicio actualizado.', 'success');
          } else {
            await api.createService(payload);
            notify('Servicio creado.', 'success');
          }
          closeModal();
          await onRefresh();
        } catch (err) {
          errMsg = err.message;
          renderModal();
        }
      });
    }
    renderModal();
    openModal(existingService ? 'Editar servicio' : 'Nuevo servicio', bodyEl);
  }

  function openBarberModal(existingBarber = null) {
    const bodyEl = document.createElement('div');
    let errMsg = '';
    const assignedIds = new Set(
      existingBarber
        ? state.barbero_servicios
            .filter((bs) => bs.barbero_id === existingBarber.id)
            .map((bs) => bs.servicio_id)
        : []
    );

    const existingScheduleMap = new Map(
      existingBarber
        ? state.horarios_barbero
            .filter((h) => h.barbero_id === existingBarber.id)
            .map((h) => [h.dia_semana, h])
        : []
    );

    const daysOrder = [1, 2, 3, 4, 5, 6, 0];

    function renderModal() {
      bodyEl.innerHTML = `
        <form id="barber-crud-form" novalidate>
          ${errMsg ? `<div class="alert alert-error">${escapeHtml(errMsg)}</div>` : ''}
          <div class="form-grid" style="margin-bottom:1rem;">
            <div class="form-field">
              <label class="form-label" for="barb-name">Nombre *</label>
              <input id="barb-name" type="text" class="form-control" required value="${escapeHtml(existingBarber?.nombre || '')}" />
            </div>
            <div class="form-field">
              <label class="form-label" for="barb-phone">Teléfono *</label>
              <input id="barb-phone" type="tel" class="form-control" required value="${escapeHtml(existingBarber?.telefono || '')}" />
            </div>
            <div class="form-field full-span">
              <label class="form-label" for="barb-spec">Especialidad</label>
              <input id="barb-spec" type="text" class="form-control" value="${escapeHtml(existingBarber?.especialidad || 'Corte y barba')}" />
            </div>
            <div class="form-field full-span">
              <label class="checkbox-option">
                <input id="barb-active" type="checkbox" ${existingBarber ? (existingBarber.activo ? 'checked' : '') : 'checked'} />
                <span>Barbero activo para recibir citas</span>
              </label>
            </div>
          </div>

          <div class="form-field" style="margin-bottom:1rem;">
            <span class="form-label">Servicios asignados</span>
            <div class="checkbox-grid">
              ${state.servicios
                .map(
                  (svc) => `
                    <label class="checkbox-option">
                      <input type="checkbox" name="barb-svc" value="${escapeHtml(svc.id)}" ${assignedIds.has(svc.id) ? 'checked' : ''} />
                      <span>${escapeHtml(svc.nombre)}</span>
                    </label>
                  `
                )
                .join('')}
            </div>
          </div>

          <div class="form-field" style="margin-bottom:1rem;">
            <span class="form-label">Horario semanal de atención</span>
            <div>
              ${daysOrder
                .map((dia) => {
                  const row = existingScheduleMap.get(dia);
                  const isActive = row ? row.activo : dia !== 0;
                  const hIni = row?.hora_inicio?.slice(0, 5) || '09:00';
                  const hFin = row?.hora_fin?.slice(0, 5) || '19:00';
                  return `
                    <div class="schedule-row">
                      <span>${escapeHtml(getDayName(dia))}</span>
                      <label style="display:flex; align-items:center; gap:0.35rem; font-size:0.85rem;">
                        <input type="checkbox" data-sched-active="${dia}" ${isActive ? 'checked' : ''} />
                        Activo
                      </label>
                      <input type="time" class="form-control" data-sched-start="${dia}" value="${escapeHtml(hIni)}" aria-label="Inicio ${escapeHtml(getDayName(dia))}" />
                      <input type="time" class="form-control" data-sched-end="${dia}" value="${escapeHtml(hFin)}" aria-label="Fin ${escapeHtml(getDayName(dia))}" />
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>

          <div class="inline-actions" style="justify-content:flex-end;">
            <button type="button" class="btn btn-secondary" id="barb-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary">${existingBarber ? 'Guardar cambios' : 'Registrar barbero'}</button>
          </div>
        </form>
      `;

      bodyEl.querySelector('#barb-cancel')?.addEventListener('click', closeModal);
      bodyEl.querySelector('#barber-crud-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const servicio_ids = Array.from(
          bodyEl.querySelectorAll('input[name="barb-svc"]:checked')
        ).map((el) => el.value);

        const horarios = daysOrder.map((dia) => ({
          dia_semana: dia,
          activo: Boolean(bodyEl.querySelector(`[data-sched-active="${dia}"]`)?.checked),
          hora_inicio: bodyEl.querySelector(`[data-sched-start="${dia}"]`)?.value || '09:00',
          hora_fin: bodyEl.querySelector(`[data-sched-end="${dia}"]`)?.value || '19:00',
        }));

        const payload = {
          nombre: bodyEl.querySelector('#barb-name')?.value || '',
          telefono: bodyEl.querySelector('#barb-phone')?.value || '',
          especialidad: bodyEl.querySelector('#barb-spec')?.value || '',
          activo: Boolean(bodyEl.querySelector('#barb-active')?.checked),
          servicio_ids,
          horarios,
        };

        try {
          if (existingBarber) {
            await api.updateBarber(existingBarber.id, payload);
            notify('Barbero y horarios actualizados.', 'success');
          } else {
            await api.createBarber(payload);
            notify('Barbero registrado.', 'success');
          }
          closeModal();
          await onRefresh();
        } catch (err) {
          errMsg = err.message;
          renderModal();
        }
      });
    }
    renderModal();
    openModal(existingBarber ? 'Editar barbero y horario' : 'Nuevo barbero', bodyEl);
  }

  function openRescheduleAdminModal(appt) {
    const bodyEl = document.createElement('div');
    const currentDate = appt.fecha_hora_inicio.slice(0, 10);
    let selectedHora = '';
    let slots = [];
    let errMsg = '';

    async function loadSlots(fecha) {
      try {
        const res = await api.getDisponibilidad({
          barbero_id: appt.barbero_id,
          servicio_id: appt.servicio_id,
          fecha,
          ignorar_cita_id: appt.id,
        });
        slots = res.slots || [];
        errMsg = slots.length ? '' : res.message || 'No hay horarios libres.';
      } catch (err) {
        slots = [];
        errMsg = err.message;
      }
      renderModal(fecha);
    }

    function renderModal(fechaVal) {
      bodyEl.innerHTML = `
        <form id="admin-resched-form" novalidate>
          ${errMsg ? `<div class="alert alert-error">${escapeHtml(errMsg)}</div>` : ''}
          <div class="form-field" style="margin-bottom:1rem;">
            <label class="form-label" for="admin-resched-date">Nueva fecha *</label>
            <input id="admin-resched-date" type="date" class="form-control" min="${getTodayDateInputValue()}" value="${escapeHtml(fechaVal)}" />
          </div>
          <div class="form-field" style="margin-bottom:1rem;">
            <span class="form-label">Horario disponible *</span>
            <div class="slots-grid">
              ${slots
                .map(
                  (s) => `
                    <button type="button" class="slot-btn ${selectedHora === s.hora ? 'is-selected' : ''}" data-aslot="${escapeHtml(s.hora)}" ${s.disponible ? '' : 'disabled'}>
                      ${escapeHtml(s.hora)}
                    </button>
                  `
                )
                .join('')}
            </div>
          </div>
          <div class="inline-actions" style="justify-content:flex-end;">
            <button type="button" class="btn btn-secondary" id="admin-resched-close">Cancelar</button>
            <button type="submit" class="btn btn-primary" ${selectedHora ? '' : 'disabled'}>Reprogramar</button>
          </div>
        </form>
      `;
      bodyEl.querySelector('#admin-resched-date')?.addEventListener('change', (ev) => {
        selectedHora = '';
        loadSlots(ev.target.value);
      });
      bodyEl.querySelectorAll('[data-aslot]').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedHora = btn.getAttribute('data-aslot');
          renderModal(fechaVal);
        });
      });
      bodyEl.querySelector('#admin-resched-close')?.addEventListener('click', closeModal);
      bodyEl.querySelector('#admin-resched-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          await api.updateAppointment(appt.id, { fecha: fechaVal, hora: selectedHora });
          closeModal();
          notify('Cita reprogramada.', 'success');
          await onRefresh();
        } catch (err) {
          errMsg = err.message;
          renderModal(fechaVal);
        }
      });
    }

    openModal('Reprogramar cita', bodyEl);
    loadSlots(currentDate);
  }

  // --- RENDER PESTAÑAS ADMIN ---
  function renderAdminDashboard() {
    const cliMap = new Map(state.clientes.map((c) => [c.id, c]));
    const barbMap = new Map(state.barberos.map((b) => [b.id, b]));
    const svcMap = new Map(state.servicios.map((s) => [s.id, s]));

    let tabHtml = '';

    if (localState.activeTab === 'citas') {
      const filtered = state.citas
        .filter((c) => {
          if (localState.filterStatus !== 'todas' && c.estado !== localState.filterStatus) return false;
          if (localState.filterBarber !== 'todos' && c.barbero_id !== localState.filterBarber) return false;
          return true;
        })
        .slice()
        .sort((a, b) => b.fecha_hora_inicio.localeCompare(a.fecha_hora_inicio));

      tabHtml = `
        <div class="toolbar-row">
          <div class="toolbar-filters">
            <div class="form-field">
              <label class="form-label" for="admin-filter-status">Estado</label>
              <select id="admin-filter-status" class="form-control">
                <option value="todas" ${localState.filterStatus === 'todas' ? 'selected' : ''}>Todas</option>
                <option value="pendiente" ${localState.filterStatus === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                <option value="confirmada" ${localState.filterStatus === 'confirmada' ? 'selected' : ''}>Confirmada</option>
                <option value="completada" ${localState.filterStatus === 'completada' ? 'selected' : ''}>Completada</option>
                <option value="cancelada" ${localState.filterStatus === 'cancelada' ? 'selected' : ''}>Cancelada</option>
              </select>
            </div>
            <div class="form-field">
              <label class="form-label" for="admin-filter-barber">Barbero</label>
              <select id="admin-filter-barber" class="form-control">
                <option value="todos">Todos</option>
                ${state.barberos
                  .map(
                    (b) => `
                      <option value="${escapeHtml(b.id)}" ${localState.filterBarber === b.id ? 'selected' : ''}>
                        ${escapeHtml(b.nombre)}
                      </option>
                    `
                  )
                  .join('')}
              </select>
            </div>
          </div>
          <button type="button" class="btn btn-primary" id="admin-new-appt-btn">Nueva cita</button>
        </div>

        ${
          filtered.length
            ? `
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
                      <th>Gestión</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filtered
                      .map((c) => {
                        const cli = cliMap.get(c.cliente_id);
                        const barb = barbMap.get(c.barbero_id);
                        const svc = svcMap.get(c.servicio_id);
                        return `
                          <tr>
                            <td class="tabular">${escapeHtml(formatDateOnly(c.fecha_hora_inicio))}</td>
                            <td class="tabular">${escapeHtml(formatTimeOnly(c.fecha_hora_inicio))}</td>
                            <td>
                              <strong>${escapeHtml(cli?.nombre || 'Cliente')}</strong>
                              <div class="form-help tabular">${escapeHtml(cli?.telefono || '')}</div>
                            </td>
                            <td>${escapeHtml(svc?.nombre || 'Servicio')}</td>
                            <td>${escapeHtml(barb?.nombre || 'Barbero')}</td>
                            <td class="num-col">${escapeHtml(formatCurrency(c.precio_snapshot))}</td>
                            <td>
                              <span class="status-label status-${escapeHtml(c.estado)}">
                                ${escapeHtml(getStatusLabel(c.estado))}
                              </span>
                            </td>
                            <td>
                              <div class="inline-actions">
                                ${
                                  c.estado === 'pendiente'
                                    ? `<button type="button" class="btn btn-secondary btn-sm" data-appt-status="confirmada" data-appt-id="${escapeHtml(c.id)}">Confirmar</button>`
                                    : ''
                                }
                                ${
                                  c.estado === 'pendiente' || c.estado === 'confirmada'
                                    ? `
                                      <button type="button" class="btn btn-secondary btn-sm" data-appt-status="completada" data-appt-id="${escapeHtml(c.id)}">Completar</button>
                                      <button type="button" class="btn btn-secondary btn-sm" data-appt-resched="${escapeHtml(c.id)}">Reprogramar</button>
                                      <button type="button" class="btn btn-danger-outline btn-sm" data-appt-status="cancelada" data-appt-id="${escapeHtml(c.id)}">Cancelar</button>
                                    `
                                    : '<span class="form-help">Finalizada</span>'
                                }
                              </div>
                            </td>
                          </tr>
                        `;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
            : `<div class="empty-state"><p>No hay citas que coincidan con el filtro actual.</p></div>`
        }
      `;
    } else if (localState.activeTab === 'clientes') {
      const q = localState.clientSearch.trim().toLowerCase();
      const filteredClients = q
        ? state.clientes.filter(
            (c) =>
              c.nombre.toLowerCase().includes(q) ||
              c.telefono.includes(q) ||
              (c.correo && c.correo.toLowerCase().includes(q))
          )
        : state.clientes;

      tabHtml = `
        <div class="toolbar-row">
          <div class="form-field" style="min-width: 260px; flex:1; max-width:420px;">
            <label class="form-label" for="admin-client-search">Buscar cliente</label>
            <input id="admin-client-search" type="search" class="form-control" value="${escapeHtml(localState.clientSearch)}" placeholder="Nombre, teléfono o correo" />
          </div>
          <button type="button" class="btn btn-primary" id="admin-add-client-btn">Registrar cliente</button>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Notas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${filteredClients
                .map(
                  (c) => `
                    <tr>
                      <td><strong>${escapeHtml(c.nombre)}</strong></td>
                      <td class="tabular">${escapeHtml(c.telefono)}</td>
                      <td>${escapeHtml(c.correo || '—')}</td>
                      <td>${escapeHtml(c.notas || '—')}</td>
                      <td>
                        <button type="button" class="btn btn-secondary btn-sm" data-edit-client="${escapeHtml(c.id)}">Editar</button>
                      </td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (localState.activeTab === 'barberos') {
      tabHtml = `
        <div class="toolbar-row">
          <p class="form-help">Administra barberos, sus servicios asignados y franjas de atención semanal.</p>
          <button type="button" class="btn btn-primary" id="admin-add-barber-btn">Registrar barbero</button>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Barbero</th>
                <th>Especialidad</th>
                <th>Teléfono</th>
                <th>Servicios</th>
                <th>Días activos</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${state.barberos
                .map((b) => {
                  const sIds = new Set(
                    state.barbero_servicios
                      .filter((bs) => bs.barbero_id === b.id)
                      .map((bs) => bs.servicio_id)
                  );
                  const sNames = state.servicios
                    .filter((s) => sIds.has(s.id))
                    .map((s) => s.nombre)
                    .join(', ');
                  const days = state.horarios_barbero
                    .filter((h) => h.barbero_id === b.id && h.activo)
                    .sort((a, b2) => a.dia_semana - b2.dia_semana)
                    .map((h) => `${getDayName(h.dia_semana).slice(0, 3)} ${h.hora_inicio.slice(0, 5)}-${h.hora_fin.slice(0, 5)}`)
                    .join(' · ');

                  return `
                    <tr>
                      <td><strong>${escapeHtml(b.nombre)}</strong></td>
                      <td>${escapeHtml(b.especialidad)}</td>
                      <td class="tabular">${escapeHtml(b.telefono)}</td>
                      <td>${escapeHtml(sNames || 'Ninguno')}</td>
                      <td style="max-width:260px;">${escapeHtml(days || 'Sin horario')}</td>
                      <td>
                        <span class="status-label ${b.activo ? 'status-confirmada' : 'status-cancelada'}">
                          ${b.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <button type="button" class="btn btn-secondary btn-sm" data-edit-barber="${escapeHtml(b.id)}">Editar / Horario</button>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (localState.activeTab === 'servicios') {
      tabHtml = `
        <div class="toolbar-row">
          <p class="form-help">Configura duración, precio y disponibilidad de cada servicio.</p>
          <button type="button" class="btn btn-primary" id="admin-add-service-btn">Nuevo servicio</button>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Descripción</th>
                <th class="num-col">Duración</th>
                <th class="num-col">Precio</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${state.servicios
                .map(
                  (s) => `
                    <tr>
                      <td><strong>${escapeHtml(s.nombre)}</strong></td>
                      <td>${escapeHtml(s.descripcion)}</td>
                      <td class="num-col">${s.duracion_min} min</td>
                      <td class="num-col">${escapeHtml(formatCurrency(s.precio))}</td>
                      <td>
                        <span class="status-label ${s.activo ? 'status-confirmada' : 'status-cancelada'}">
                          ${s.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <button type="button" class="btn btn-secondary btn-sm" data-edit-service="${escapeHtml(s.id)}">Editar</button>
                      </td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (localState.activeTab === 'reportes') {
      const reports = computeReports({
        appointments: state.citas,
        services: state.servicios,
        barbers: state.barberos,
        fromDate: localState.reportFrom || null,
        toDate: localState.reportTo || null,
      });

      tabHtml = `
        <div class="toolbar-row">
          <div class="toolbar-filters">
            <div class="form-field">
              <label class="form-label" for="rep-from">Desde</label>
              <input id="rep-from" type="date" class="form-control" value="${escapeHtml(localState.reportFrom)}" />
            </div>
            <div class="form-field">
              <label class="form-label" for="rep-to">Hasta</label>
              <input id="rep-to" type="date" class="form-control" value="${escapeHtml(localState.reportTo)}" />
            </div>
            <button type="button" class="btn btn-secondary" id="rep-clear-btn">Limpiar filtro</button>
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-cell">
            <div class="kpi-label">Total de citas</div>
            <div class="kpi-value">${reports.summary.total}</div>
          </div>
          <div class="kpi-cell">
            <div class="kpi-label">Completadas</div>
            <div class="kpi-value">${reports.summary.completada}</div>
          </div>
          <div class="kpi-cell">
            <div class="kpi-label">Canceladas</div>
            <div class="kpi-value">${reports.summary.cancelada}</div>
          </div>
          <div class="kpi-cell">
            <div class="kpi-label">Ingresos completados</div>
            <div class="kpi-value">${escapeHtml(formatCurrency(reports.summary.ingresosCompletados))}</div>
          </div>
        </div>

        <div class="auth-grid">
          <div>
            <h2 style="font-size:1.1rem; margin-bottom:0.75rem;">Servicios más solicitados</h2>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th class="num-col">Solicitudes</th>
                    <th class="num-col">Completadas</th>
                    <th class="num-col">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    reports.topServices.length
                      ? reports.topServices
                          .map(
                            (r) => `
                              <tr>
                                <td><strong>${escapeHtml(r.nombre)}</strong></td>
                                <td class="num-col">${r.cantidad}</td>
                                <td class="num-col">${r.completadas}</td>
                                <td class="num-col">${escapeHtml(formatCurrency(r.ingresos))}</td>
                              </tr>
                            `
                          )
                          .join('')
                      : '<tr><td colspan="4">Sin datos en el período seleccionado.</td></tr>'
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 style="font-size:1.1rem; margin-bottom:0.75rem;">Actividad por barbero</h2>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Barbero</th>
                    <th class="num-col">Total</th>
                    <th class="num-col">Activas</th>
                    <th class="num-col">Completadas</th>
                    <th class="num-col">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    reports.barberActivity.length
                      ? reports.barberActivity
                          .map(
                            (b) => `
                              <tr>
                                <td><strong>${escapeHtml(b.nombre)}</strong></td>
                                <td class="num-col">${b.total}</td>
                                <td class="num-col">${b.pendientesOConfirmadas}</td>
                                <td class="num-col">${b.completadas}</td>
                                <td class="num-col">${escapeHtml(formatCurrency(b.ingresos))}</td>
                              </tr>
                            `
                          )
                          .join('')
                      : '<tr><td colspan="5">Sin actividad registrada en el período.</td></tr>'
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    wrapper.innerHTML = `
      <div class="container">
        <div class="section-header">
          <div>
            <h1 class="section-title">Panel administrativo</h1>
            <p class="section-subtitle">
              Sesión activa: ${escapeHtml(state.user.nombre)} · Gestión centralizada de agenda, clientes, equipo y reportes.
            </p>
          </div>
          <button type="button" class="btn btn-secondary" id="admin-logout-btn">Cerrar sesión</button>
        </div>

        <div class="admin-tabs" role="tablist" aria-label="Secciones administrativas">
          <button type="button" role="tab" class="tab-btn ${localState.activeTab === 'citas' ? 'is-active' : ''}" data-admin-tab="citas">Citas (${state.citas.length})</button>
          <button type="button" role="tab" class="tab-btn ${localState.activeTab === 'clientes' ? 'is-active' : ''}" data-admin-tab="clientes">Clientes (${state.clientes.length})</button>
          <button type="button" role="tab" class="tab-btn ${localState.activeTab === 'barberos' ? 'is-active' : ''}" data-admin-tab="barberos">Barberos y Horarios (${state.barberos.length})</button>
          <button type="button" role="tab" class="tab-btn ${localState.activeTab === 'servicios' ? 'is-active' : ''}" data-admin-tab="servicios">Servicios (${state.servicios.length})</button>
          <button type="button" role="tab" class="tab-btn ${localState.activeTab === 'reportes' ? 'is-active' : ''}" data-admin-tab="reportes">Reportes</button>
        </div>

        ${tabHtml}
      </div>
    `;

    wrapper.querySelector('#admin-logout-btn')?.addEventListener('click', async () => {
      await api.logout();
      notify('Sesión cerrada.', 'success');
      await onRefresh();
    });

    wrapper.querySelectorAll('[data-admin-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        localState.activeTab = btn.getAttribute('data-admin-tab');
        if (onTabChange) onTabChange(localState.activeTab);
        renderAdminDashboard();
      });
    });

    // Listeners Citas
    wrapper.querySelector('#admin-filter-status')?.addEventListener('change', (ev) => {
      localState.filterStatus = ev.target.value;
      renderAdminDashboard();
    });
    wrapper.querySelector('#admin-filter-barber')?.addEventListener('change', (ev) => {
      localState.filterBarber = ev.target.value;
      renderAdminDashboard();
    });
    wrapper.querySelector('#admin-new-appt-btn')?.addEventListener('click', () => {
      onNavigate('reservar');
    });
    wrapper.querySelectorAll('[data-appt-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-appt-id');
        const nextStatus = btn.getAttribute('data-appt-status');
        try {
          await api.updateAppointment(id, {
            estado: nextStatus,
            motivo_cancelacion: nextStatus === 'cancelada' ? 'Cancelada desde administración' : undefined,
          });
          notify(`Cita actualizada a ${getStatusLabel(nextStatus)}.`, 'success');
          await onRefresh();
        } catch (err) {
          notify(err.message, 'error');
        }
      });
    });
    wrapper.querySelectorAll('[data-appt-resched]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const appt = state.citas.find((c) => c.id === btn.getAttribute('data-appt-resched'));
        if (appt) openRescheduleAdminModal(appt);
      });
    });

    // Listeners Clientes
    wrapper.querySelector('#admin-client-search')?.addEventListener('input', (ev) => {
      localState.clientSearch = ev.target.value;
      renderAdminDashboard();
      const input = wrapper.querySelector('#admin-client-search');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
    wrapper.querySelector('#admin-add-client-btn')?.addEventListener('click', () => openClientModal());
    wrapper.querySelectorAll('[data-edit-client]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cli = state.clientes.find((c) => c.id === btn.getAttribute('data-edit-client'));
        if (cli) openClientModal(cli);
      });
    });

    // Listeners Barberos
    wrapper.querySelector('#admin-add-barber-btn')?.addEventListener('click', () => openBarberModal());
    wrapper.querySelectorAll('[data-edit-barber]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const b = state.barberos.find((x) => x.id === btn.getAttribute('data-edit-barber'));
        if (b) openBarberModal(b);
      });
    });

    // Listeners Servicios
    wrapper.querySelector('#admin-add-service-btn')?.addEventListener('click', () => openServiceModal());
    wrapper.querySelectorAll('[data-edit-service]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = state.servicios.find((x) => x.id === btn.getAttribute('data-edit-service'));
        if (s) openServiceModal(s);
      });
    });

    // Listeners Reportes
    wrapper.querySelector('#rep-from')?.addEventListener('change', (ev) => {
      localState.reportFrom = ev.target.value;
      renderAdminDashboard();
    });
    wrapper.querySelector('#rep-to')?.addEventListener('change', (ev) => {
      localState.reportTo = ev.target.value;
      renderAdminDashboard();
    });
    wrapper.querySelector('#rep-clear-btn')?.addEventListener('click', () => {
      localState.reportFrom = '';
      localState.reportTo = '';
      renderAdminDashboard();
    });
  }

  if (state.user?.rol === 'admin') {
    renderAdminDashboard();
  } else {
    renderAuthScreen();
  }

  return wrapper;
}
