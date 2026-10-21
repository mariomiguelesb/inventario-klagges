/**
 * ============================================================
 * Archivo: vistas/mas.js
 * Dónde va: GitHub, repositorio inventario-klagges, carpeta vistas
 * Entrega 2B-3 · Hito 2 · versión 0.2.0
 * ============================================================
 * Pantalla Más: quién ingresó y qué puede ver, tema claro u oscuro, versiones de la app y de la
 * API, y cerrar sesión. En hitos posteriores suma Sincronización, Reportes, Aprobaciones y
 * Configuración.
 */

import { cargarCatalogos, obtenerSesion } from '../api.js';
import { crear, icono, formatoFechaHora } from '../util.js';
import { nombreRol } from '../marco.js';

const TEMAS = [['sistema', 'Automático'], ['claro', 'Claro'], ['oscuro', 'Oscuro']];
const AMBIENTES = { PRUEBA: 'Prueba', PRODUCCION: 'Producción' };

export function mostrar(contenedor, contexto) {
  const usuario = contexto.usuario || {};
  const sesion = obtenerSesion();
  contenedor.style.maxWidth = '760px'; // en computador, una columna cómoda de leer

  // ---------- Usuario y sesión ----------
  const lugares = crear('dd', null, textoLugares(usuario, null));
  const tarjetaUsuario = crear('section', { clase: 'tarjeta pila', 'aria-labelledby': 'mas-usuario' },
    crear('div', null,
      crear('h2', { id: 'mas-usuario' }, usuario.nombre || usuario.usuario || 'Usuario'),
      crear('p', { clase: 'texto-suave' }, nombreRol(usuario.rol) + ' · usuario ' + (usuario.usuario || ''))),
    crear('dl', { clase: 'datos' },
      crear('dt', null, 'Lugares que ve'), lugares,
      crear('dt', null, 'Ve costos y valores'), crear('dd', null, usuario.ve_costos ? 'Sí' : 'No'),
      crear('dt', null, 'Sesión vence'), crear('dd', null, sesion ? formatoFechaHora(sesion.expira_en) : '—'),
      crear('dt', null, 'En este equipo'), crear('dd', null, sesion && sesion.recordar ? 'Recordado' : 'Hasta cerrar la app')));
  cargarCatalogos()
    .then(catalogos => { lugares.textContent = textoLugares(usuario, catalogos); })
    .catch(() => {}); // sin catálogos quedan los códigos de lugar

  // ---------- Tema ----------
  const elegido = contexto.tema.elegido();
  const chips = crear('div', { clase: 'chips', role: 'group', 'aria-label': 'Tema de la app' },
    TEMAS.map(([valor, texto]) => crear('button', {
      clase: 'chip', type: 'button', 'aria-pressed': String(valor === elegido), datos: { tema: valor },
      onclick: () => elegirTema(valor)
    }, texto)));
  function elegirTema(valor) {
    contexto.tema.elegir(valor);
    chips.querySelectorAll('.chip').forEach(chip => chip.setAttribute('aria-pressed', String(chip.dataset.tema === valor)));
  }
  const tarjetaTema = crear('section', { clase: 'tarjeta pila', 'aria-labelledby': 'mas-tema' },
    crear('div', null,
      crear('h2', { id: 'mas-tema' }, 'Apariencia'),
      crear('p', { clase: 'texto-suave' }, 'Automático usa el modo claro u oscuro de este teléfono o computador.')),
    chips);

  // ---------- Versiones ----------
  const versionApi = crear('dd', null, 'Consultando…');
  const ambiente = crear('dd', null, '…');
  Promise.resolve(contexto.servidor).then(servidor => {
    versionApi.textContent = servidor ? servidor.version : 'Sin respuesta';
    ambiente.textContent = servidor ? AMBIENTES[servidor.ambiente] || servidor.ambiente : '—';
  });
  const botonActualizar = crear('button', { clase: 'boton boton--secundario', type: 'button', hidden: true },
    icono('actualizar'), 'Buscar actualización');
  // actualizacion.js llega en la entrega 2D; hasta entonces el botón no aparece.
  Promise.resolve(contexto.actualizacion).then(modulo => {
    if (!modulo || typeof modulo.buscar !== 'function') return;
    botonActualizar.hidden = false;
    botonActualizar.addEventListener('click', async () => {
      botonActualizar.disabled = true;
      try {
        const hayNueva = await modulo.buscar();
        if (!hayNueva) contexto.avisar('Ya tienes la versión más reciente.');
      } catch (error) {
        contexto.avisar('No se pudo revisar si hay una versión nueva. Revisa la señal.');
      } finally {
        botonActualizar.disabled = false;
      }
    });
  });
  const tarjetaApp = crear('section', { clase: 'tarjeta pila', 'aria-labelledby': 'mas-app' },
    crear('h2', { id: 'mas-app' }, 'Acerca de la app'),
    crear('dl', { clase: 'datos' },
      crear('dt', null, 'Versión de la app'), crear('dd', null, contexto.version),
      crear('dt', null, 'Versión de la API'), versionApi,
      crear('dt', null, 'Ambiente'), ambiente),
    crear('div', null, botonActualizar));

  // ---------- Cerrar sesión ----------
  const botonSalir = crear('button', { clase: 'boton boton--secundario boton--bloque', type: 'button' },
    icono('salir'), crear('span', null, 'Cerrar sesión'));
  botonSalir.addEventListener('click', async () => {
    botonSalir.disabled = true;
    botonSalir.lastChild.textContent = 'Cerrando sesión…';
    await contexto.salir();
  });

  contenedor.appendChild(crear('div', { clase: 'pila' }, tarjetaUsuario, tarjetaTema, tarjetaApp, botonSalir));
}

/** "Todos" para quien ve todo; si no, los nombres de sus lugares (o sus códigos, si aún no hay catálogos). */
function textoLugares(usuario, catalogos) {
  const permitidos = usuario.lugares_permitidos || [];
  if (usuario.rol === 'ADMIN' || usuario.rol === 'CONSULTA' || permitidos.indexOf('*') >= 0) return 'Todos';
  if (permitidos.length === 0) return 'Ninguno asignado';
  const nombres = {};
  ((catalogos && catalogos.lugares) || []).forEach(lugar => { nombres[lugar.id_lugar] = lugar.nombre; });
  return permitidos.map(id => nombres[id] || id).join(', ');
}
