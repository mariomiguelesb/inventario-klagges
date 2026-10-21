/**
 * ============================================================
 * Archivo: vistas/ingreso.js
 * Dónde va: GitHub, repositorio inventario-klagges, carpeta vistas
 * Entrega 2B-3 · Hito 2 · versión 0.2.0
 * ============================================================
 * Pantalla de ingreso: nombre de usuario y PIN de 6 dígitos, con "Recordar este dispositivo".
 * - El servidor valida el PIN y bloquea el ingreso 15 minutos tras 5 intentos fallidos; aquí solo
 *   se revisa el formato antes de enviar, para avisar de inmediato.
 * - Con "Recordar este dispositivo", la sesión dura 30 días y el equipo recuerda el nombre de
 *   usuario (nunca el PIN). Sin marcarla, la sesión termina al cerrar la app o la pestaña.
 */

import { ingresar } from '../api.js';
import { APP_VERSION, NOMBRE_APP, EMPRESA } from '../config.js';
import { crear, marca } from '../util.js';

const LARGO_PIN = 6;
const CLAVE_ULTIMO_USUARIO = 'klagges.ultimo_usuario';
const CLAVE_RECORDAR = 'klagges.recordar';
// Errores en que el PIN escrito no sirve y se borra para escribirlo de nuevo.
const ERRORES_DE_PIN = ['CREDENCIALES_INVALIDAS', 'USUARIO_BLOQUEADO'];

/** contexto.motivo: aviso con que se abre (sesión vencida…); contexto.alIngresar(usuario): entrar a la app. */
export function mostrar(contenedor, contexto) {
  const recordarAntes = leer(CLAVE_RECORDAR) !== 'NO';
  const ultimoUsuario = recordarAntes ? leer(CLAVE_ULTIMO_USUARIO) || '' : '';
  let enviando = false;

  const campoUsuario = crear('input', {
    clase: 'campo__control', id: 'ingreso-usuario', name: 'usuario', type: 'text', value: ultimoUsuario,
    autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false',
    maxlength: 50, enterkeyhint: 'next'
  });
  const campoPin = crear('input', {
    clase: 'campo__control', id: 'ingreso-pin', name: 'pin', type: 'password', inputmode: 'numeric',
    pattern: '[0-9]*', maxlength: LARGO_PIN, autocomplete: 'current-password', enterkeyhint: 'go',
    'aria-describedby': 'ingreso-pin-ayuda'
  });
  const casillaRecordar = crear('input', { type: 'checkbox', name: 'recordar', checked: recordarAntes });
  const mensaje = crear('p', { clase: 'mensaje-error', role: 'alert', hidden: !contexto.motivo }, contexto.motivo || '');
  const boton = crear('button', { clase: 'boton boton--primario boton--bloque', type: 'submit' }, 'Ingresar');
  const versiones = crear('p', { clase: 'texto-suave' }, 'Versión ' + APP_VERSION);

  const formulario = crear('form', { clase: 'ingreso__tarjeta', novalidate: true, 'aria-labelledby': 'ingreso-titulo' },
    crear('div', { clase: 'marca' }, marca(),
      crear('div', null,
        crear('h1', { clase: 'marca__nombre', id: 'ingreso-titulo' }, NOMBRE_APP),
        crear('div', { clase: 'marca__empresa' }, EMPRESA))),
    crear('div', { clase: 'campo' },
      crear('label', { clase: 'campo__etiqueta', for: 'ingreso-usuario' }, 'Usuario'), campoUsuario),
    crear('div', { clase: 'campo' },
      crear('label', { clase: 'campo__etiqueta', for: 'ingreso-pin' }, 'PIN'), campoPin,
      crear('span', { clase: 'campo__ayuda', id: 'ingreso-pin-ayuda' }, LARGO_PIN + ' dígitos')),
    crear('label', { clase: 'casilla' }, casillaRecordar, 'Recordar este dispositivo'),
    mensaje,
    boton,
    crear('p', { clase: 'campo__ayuda' }, '¿Olvidaste tu PIN? Pide al administrador que lo cambie.'),
    versiones);

  // Enter en el usuario pasa al PIN, en vez de enviar el formulario a medias.
  campoUsuario.addEventListener('keydown', evento => {
    if (evento.key === 'Enter' && !campoPin.value) {
      evento.preventDefault();
      campoPin.focus();
    }
  });

  formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (enviando) return;
    const usuario = campoUsuario.value.trim().toLowerCase();
    const pin = campoPin.value.trim();
    campoUsuario.value = usuario;
    if (!usuario) {
      mostrarError('Escribe tu nombre de usuario.', campoUsuario);
      return;
    }
    if (!new RegExp('^\\d{' + LARGO_PIN + '}$').test(pin)) {
      mostrarError('El PIN tiene ' + LARGO_PIN + ' dígitos, solo números.', campoPin);
      return;
    }
    ocupado(true);
    try {
      const perfil = await ingresar(usuario, pin, casillaRecordar.checked);
      guardar(CLAVE_RECORDAR, casillaRecordar.checked ? 'SI' : 'NO');
      guardar(CLAVE_ULTIMO_USUARIO, casillaRecordar.checked ? usuario : '');
      contexto.alIngresar(perfil);
    } catch (error) {
      ocupado(false);
      if (ERRORES_DE_PIN.indexOf(error.codigo) >= 0) campoPin.value = '';
      mostrarError(error.message || 'No se pudo ingresar. Intenta de nuevo.', campoPin);
    }
  });

  function ocupado(si) {
    enviando = si;
    boton.disabled = si;
    boton.textContent = si ? 'Ingresando…' : 'Ingresar';
    formulario.setAttribute('aria-busy', si ? 'true' : 'false');
  }

  function mostrarError(texto, campo) {
    mensaje.textContent = texto;
    mensaje.hidden = false;
    campo.focus();
  }

  // Versión de la API, cuando responde (sirve para confirmar que la app llega al servidor).
  Promise.resolve(contexto.servidor).then(servidor => {
    if (servidor && servidor.version) versiones.textContent = 'Versión ' + APP_VERSION + ' · API ' + servidor.version;
  });

  contenedor.appendChild(formulario);
  (ultimoUsuario ? campoPin : campoUsuario).focus({ preventScroll: true });
}

function leer(clave) {
  try {
    return window.localStorage.getItem(clave);
  } catch (error) {
    return null;
  }
}

function guardar(clave, valor) {
  try {
    if (valor) window.localStorage.setItem(clave, valor);
    else window.localStorage.removeItem(clave);
  } catch (error) {
    // Sin almacenamiento (modo privado): no se recuerda nada.
  }
}
