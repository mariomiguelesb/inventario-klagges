/**
 * ============================================================
 * Archivo: vistas/articulo.js
 * Dónde va: GitHub, repositorio inventario-klagges, carpeta vistas
 * Entrega 2C · Hito 2 · versión 0.2.0
 * ============================================================
 * Ficha de un artículo (solo lectura): stock y valor total, cada lugar con sus lotes en orden de
 * salida, mínimos, conversiones de unidad y datos del maestro. La usa la pantalla Inventario, que
 * la muestra al costado de la lista (computador) o sola (celular y tableta).
 * El kardex (cada movimiento con su saldo acumulado) llega en el Hito 3.
 * También exporta las etiquetas de vencimiento y de mínimo que usan Inventario e Inicio.
 */

import { crear, icono, formatoPesos, formatoCantidad, formatoNumero, formatoFecha, textoUnidad, claseVencimiento } from '../util.js';
import { textoVenceCorto } from '../existencias.js';

const NOMBRES_UNIDAD = { KG: 'kilos (kg)', G: 'gramos (g)', L: 'litros (L)', ML: 'mililitros (ml)', UN: 'unidades (un)' };

/**
 * Etiqueta del vencimiento. corto = true (tablas): texto breve y, si no hay alerta, solo la fecha
 * sin color. corto = false: siempre etiqueta, con el texto completo ("Vence en 3 días").
 */
export function etiquetaVencimiento(estado, fecha, corto) {
  const alerta = estado && ['vencido', 'critico', 'pronto', 'atento'].indexOf(estado.nivel) >= 0;
  if (corto && !alerta) return crear('span', { clase: 'texto-suave numero' }, textoVenceCorto(estado, fecha));
  return crear('span', { clase: ['estado', alerta && claseVencimiento(estado.nivel)] },
    corto ? textoVenceCorto(estado, fecha) : (estado ? estado.texto : 'Sin vencimiento'));
}

/** Etiqueta roja "Bajo el mínimo". */
export function etiquetaMinimo() {
  return crear('span', { clase: 'estado estado--critico' }, 'Bajo el mínimo');
}

/**
 * Dibuja la ficha. opciones: lugar (el elegido en Inventario, va primero), modo ('costado' o 'sola')
 * y alCerrar (función del botón cerrar o volver).
 */
export function dibujarFicha(modelo, idArticulo, opciones) {
  const datos = modelo.ficha(idArticulo);
  const sola = opciones.modo === 'sola';
  const volver = sola
    ? crear('div', null, crear('button', { clase: 'boton boton--texto', type: 'button', onclick: opciones.alCerrar },
      icono('volver'), 'Volver al inventario'))
    : null;
  if (!datos) {
    return crear('div', { clase: 'ficha' }, volver,
      cabecera('Artículo no encontrado', 'Revisa el código o actualiza el inventario.', sola, opciones.alCerrar));
  }
  const unidad = datos.articulo.unidad_base;
  return crear('div', { clase: 'ficha' },
    volver,
    cabecera(datos.articulo.nombre, datos.categoria.nombre + ' · se guarda en ' + (NOMBRES_UNIDAD[unidad] || textoUnidad(unidad)),
      sola, opciones.alCerrar),
    metricas(datos, modelo, unidad),
    seccionLugares(datos, modelo, unidad, opciones.lugar),
    seccionConversiones(datos, unidad),
    seccionDatos(datos, unidad),
    crear('p', { clase: 'texto-suave' }, 'El kardex, con cada movimiento y su saldo acumulado, llega en el Hito 3.'));
}

/** Costo por unidad: sin decimales desde $100 y con hasta 2 bajo $100 (por ejemplo, una servilleta). */
function textoCosto(costo, unidad) {
  return '$' + formatoNumero(costo, costo >= 100 ? 0 : 2) + ' / ' + textoUnidad(unidad);
}

function cabecera(titulo, subtitulo, sola, alCerrar) {
  return crear('div', { clase: 'ficha__cabecera' },
    crear('div', null, crear('h2', null, titulo), crear('p', { clase: 'texto-suave' }, subtitulo)),
    sola ? null : crear('button', {
      clase: 'boton boton--secundario boton--icono', type: 'button', 'aria-label': 'Cerrar ficha', onclick: alCerrar
    }, icono('cerrar')));
}

function metricas(datos, modelo, unidad) {
  const bloque = (etiqueta, valor) => crear('div', { clase: 'ficha__metrica' },
    crear('span', { clase: 'texto-suave' }, etiqueta), crear('strong', { clase: 'numero' }, valor));
  return crear('div', { clase: 'ficha__metricas' },
    bloque('Stock total', formatoCantidad(datos.cantidad, unidad)),
    modelo.conCostos
      ? bloque('Valor ' + (modelo.bruto ? 'bruto' : 'neto'), formatoPesos(datos.valor))
      : bloque('Lotes con stock', formatoNumero(datos.lotes, 0)),
    modelo.conCostos && datos.cantidad > 0
      ? bloque('Costo promedio', textoCosto(datos.valor / datos.cantidad, unidad))
      : null,
    bloque('Vence primero', datos.vence ? formatoFecha(datos.vence) : 'Sin vencimiento'));
}

/** Cada lugar con su stock, su mínimo (si tiene) y sus lotes en el orden en que deben salir. */
function seccionLugares(datos, modelo, unidad, lugarElegido) {
  const posiciones = datos.posiciones.slice()
    .sort((a, b) => Number(b.lugar.id_lugar === lugarElegido) - Number(a.lugar.id_lugar === lugarElegido));
  const titulo = crear('h3', null, 'Por lugar y lote, en orden de salida (' + modelo.metodoSalida + ')');
  if (posiciones.length === 0) {
    return crear('section', { clase: 'pila' }, titulo, crear('p', { clase: 'texto-suave' }, 'No hay stock de este artículo en tus lugares.'));
  }
  return crear('section', { clase: 'pila' }, titulo, posiciones.map(posicion => {
    const lotes = posicion.lotes.filter(lote => lote.cantidad !== 0);
    return crear('div', null,
      crear('div', { clase: 'fila fila--entre' },
        crear('strong', null, posicion.lugar.nombre),
        crear('span', { clase: 'numero' }, formatoCantidad(posicion.cantidad, unidad) +
          (modelo.conCostos ? ' · ' + formatoPesos(posicion.valor) : ''))),
      posicion.minimo !== null
        ? crear('p', null, crear('span', { clase: ['estado', posicion.bajoMinimo && 'estado--critico'] },
          (posicion.bajoMinimo ? 'Bajo el mínimo de ' : 'Mínimo: ') + formatoCantidad(posicion.minimo, unidad)))
        : null,
      lotes.length === 0
        ? crear('p', { clase: 'texto-suave' }, 'Sin stock en este lugar.')
        : crear('ul', { clase: 'lotes' }, lotes.map(lote => crear('li', { clase: 'lote' },
          crear('span', null, lote.id ? 'Lote ' + lote.id + (lote.codigo ? ' · ' + lote.codigo : '') : 'Sin lote'),
          crear('span', { clase: 'numero' }, formatoCantidad(lote.cantidad, unidad)),
          crear('span', { clase: 'texto-suave' }, [
            lote.ingreso ? 'Ingresó ' + formatoFecha(lote.ingreso) : '',
            lote.costoUnitario !== null ? textoCosto(lote.costoUnitario, unidad) : ''
          ].filter(Boolean).join(' · ')),
          etiquetaVencimiento(lote.estado, lote.vence, false)))));
  }));
}

function seccionConversiones(datos, unidad) {
  const titulo = crear('h3', null, 'Conversiones');
  if (datos.conversiones.length === 0) {
    return crear('section', { clase: 'pila' }, titulo,
      crear('p', { clase: 'texto-suave' }, 'Sin conversiones: se registra solo en ' + (NOMBRES_UNIDAD[unidad] || textoUnidad(unidad)) + '.'));
  }
  return crear('section', { clase: 'pila' }, titulo, crear('dl', { clase: 'datos' }, datos.conversiones.map(conversion => [
    crear('dt', null, '1 ' + conversion.unidad),
    crear('dd', null, formatoCantidad(conversion.factor_a_base, unidad))
  ])));
}

function seccionDatos(datos, unidad) {
  const articulo = datos.articulo;
  const siNo = valor => (valor === 'SI' ? 'Sí' : 'No');
  const filas = [
    ['Código', articulo.id_articulo],
    ['Código de barras', articulo.codigo_barra || '—'],
    ['Tipo', articulo.tipo_articulo === 'ACTIVO' ? 'Activo' : 'Consumible'],
    ['Lote', siNo(articulo.maneja_lote)],
    ['Vencimiento', siNo(articulo.maneja_vencimiento)],
    ['Merma tolerada', datos.merma.valor === null ? '—'
      : formatoNumero(datos.merma.valor, 2) + ' %' + (datos.merma.heredada ? ' (categoría)' : '')],
    ['IVA', (datos.exento.valor ? 'Exento' : 'Afecto') + (datos.exento.heredado ? ' (categoría)' : '')],
    ['Mínimo global', datos.minimoGlobal ? formatoCantidad(datos.minimoGlobal, unidad) : '—']
  ];
  if (articulo.activo === 'NO') filas.push(['Estado en el maestro', 'Inactivo']);
  return crear('section', { clase: 'pila' }, crear('h3', null, 'Datos del artículo'),
    crear('dl', { clase: 'datos' }, filas.map(([etiqueta, valor]) => [crear('dt', null, etiqueta), crear('dd', null, valor)])));
}
