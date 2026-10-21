/**
 * ============================================================
 * Archivo: existencias.js
 * Dónde va: GitHub, repositorio inventario-klagges (raíz)
 * Entrega 2C · Hito 2 · versión 0.2.0
 * ============================================================
 * Cálculos de existencias para Inicio, Inventario y la ficha de cada artículo. Recibe lo que
 * entrega la API (acciones catalogos e inventario) y arma, sin volver a llamar al servidor:
 * - el stock de cada artículo en cada lugar, con sus lotes en orden de salida (FEFO o FIFO, según Config);
 * - los valores (netos, o brutos si Config dice iva_modo_reportes = BRUTO) y los totales;
 * - el estado de vencimiento de cada lote según los umbrales de Config (7, 15 y 30 días);
 * - los artículos bajo el mínimo de cada lugar (hoja StockMinimos). El mínimo global se muestra en
 *   la ficha, pero no se usa en las alertas hasta que se decida su regla (Hito 7).
 * Quien no ve costos no recibe valores desde la API: aquí sus valores quedan en null.
 */

import { hoyIso, estadoVencimiento, formatoFecha } from './util.js';

const ORDEN_TIPO = { BODEGA: 1, CAMARA: 2, FAENA: 3 };
export const GRUPOS_TIPO = [['BODEGA', 'Bodega'], ['CAMARA', 'Cámaras'], ['FAENA', 'Faenas']];
export const NOMBRES_TIPO = { BODEGA: 'Bodega', CAMARA: 'Cámara', FAENA: 'Faena' };
const NIVELES_POR_VENCER = ['critico', 'pronto', 'atento'];
const comparar = new Intl.Collator('es', { sensitivity: 'base', numeric: true }).compare;

/**
 * Modelo de existencias. hoy ('AAAA-MM-DD', opcional) sirve para las pruebas; si falta, se usa
 * la fecha de hoy en Chile.
 */
export function armarExistencias(catalogos, inventario, hoy) {
  const parametros = catalogos.parametros || {};
  const conCostos = inventario.con_costos === true;
  const bruto = conCostos && parametros.iva_modo_reportes === 'BRUTO';
  const tasaIva = Number(parametros.iva_tasa) || 0;
  const umbrales = Array.isArray(parametros.dias_alerta_vencimiento) && parametros.dias_alerta_vencimiento.length
    ? parametros.dias_alerta_vencimiento : [7, 15, 30];
  const fifo = parametros.metodo_salida === 'FIFO';
  const fecha = hoy || hoyIso();

  const categorias = indexar(catalogos.categorias, 'id_categoria');
  const articulos = indexar(catalogos.articulos, 'id_articulo');
  const conversiones = {};
  (catalogos.conversiones || []).forEach(fila => {
    (conversiones[fila.id_articulo] = conversiones[fila.id_articulo] || []).push(fila);
  });
  const visibles = new Set((inventario.lugares || []).map(String));
  const lugares = (catalogos.lugares || [])
    .filter(lugar => visibles.has(String(lugar.id_lugar)))
    .map(lugar => Object.assign({}, lugar, { valor: conCostos ? 0 : null, articulos: 0, lotes: 0 }))
    .sort((a, b) => (ORDEN_TIPO[a.tipo] || 9) - (ORDEN_TIPO[b.tipo] || 9) || comparar(a.nombre, b.nombre));
  const lugarPorId = indexar(lugares, 'id_lugar');
  const posiciones = new Map(); // una por lugar y artículo

  function categoriaDe(articulo) {
    return categorias[articulo.id_categoria] || { id_categoria: '', nombre: 'Sin categoría' };
  }

  function articuloDe(idArticulo) {
    return articulos[idArticulo] || { id_articulo: idArticulo, nombre: idArticulo, unidad_base: '', id_categoria: '' };
  }

  function posicionDe(idLugar, idArticulo) {
    const clave = idLugar + '|' + idArticulo;
    if (!posiciones.has(clave)) {
      const articulo = articuloDe(idArticulo);
      posiciones.set(clave, {
        lugar: lugarPorId[idLugar], articulo: articulo, categoria: categoriaDe(articulo), cantidad: 0,
        valor: conCostos ? 0 : null, lotes: [], minimo: null, bajoMinimo: false, vence: '', estado: null
      });
    }
    return posiciones.get(clave);
  }

  /** Valor que se muestra: el neto o, en modo BRUTO, neto × (1 + IVA), salvo artículos exentos. */
  function aMostrar(neto, articulo) {
    if (!bruto) return neto;
    const exento = articulo.exento_iva ? articulo.exento_iva === 'SI' : categoriaDe(articulo).exento_iva === 'SI';
    return exento ? neto : neto * (1 + tasaIva);
  }

  (inventario.saldos || []).forEach(saldo => {
    if (!lugarPorId[saldo.id_lugar]) return;
    const posicion = posicionDe(saldo.id_lugar, saldo.id_articulo);
    const datos = (inventario.lotes || {})[saldo.id_lote] || {};
    const lote = {
      id: saldo.id_lote || '', codigo: datos.codigo_lote_proveedor || '', ingreso: datos.fecha_ingreso || '',
      vence: datos.fecha_vencimiento || '', cantidad: Number(saldo.cantidad) || 0,
      valor: conCostos ? aMostrar(Number(saldo.costo_total_neto) || 0, posicion.articulo) : null,
      costoUnitario: conCostos && datos.costo_unitario_neto !== undefined
        ? aMostrar(Number(datos.costo_unitario_neto) || 0, posicion.articulo) : null
    };
    lote.estado = estadoVencimiento(lote.vence, umbrales, fecha);
    posicion.lotes.push(lote);
    posicion.cantidad += lote.cantidad;
    if (conCostos) posicion.valor += lote.valor;
  });
  (catalogos.stock_minimos || []).forEach(fila => {
    const minimo = Number(fila.minimo);
    if (lugarPorId[fila.id_lugar] && minimo > 0) posicionDe(fila.id_lugar, fila.id_articulo).minimo = minimo;
  });

  const lista = [];
  posiciones.forEach(posicion => {
    posicion.cantidad = redondear(posicion.cantidad, 3);
    posicion.lotes.sort((a, b) => ordenSalida(a, b, fifo));
    posicion.vence = venceMasProximo(posicion.lotes);
    posicion.estado = estadoVencimiento(posicion.vence, umbrales, fecha);
    posicion.bajoMinimo = posicion.minimo !== null && posicion.cantidad < posicion.minimo;
    const lugar = posicion.lugar;
    if (posicion.cantidad > 0) lugar.articulos++;
    lugar.lotes += posicion.lotes.filter(lote => lote.cantidad > 0).length;
    if (conCostos) lugar.valor += posicion.valor;
    lista.push(posicion);
  });
  lista.sort((a, b) => comparar(a.articulo.nombre, b.articulo.nombre) || ordenLugar(a.lugar, b.lugar));

  /** Filas de la lista de Inventario: las de un lugar o, con idLugar vacío, una por artículo. */
  function filas(idLugar) {
    const relevantes = lista.filter(p => p.cantidad !== 0 || p.bajoMinimo);
    if (idLugar) return relevantes.filter(p => p.lugar.id_lugar === idLugar);
    const porArticulo = new Map();
    relevantes.forEach(p => {
      const id = p.articulo.id_articulo;
      if (!porArticulo.has(id)) {
        porArticulo.set(id, {
          articulo: p.articulo, categoria: p.categoria, cantidad: 0, valor: conCostos ? 0 : null,
          lotes: [], lugares: 0, bajoMinimo: false, minimo: null, vence: '', estado: null
        });
      }
      const fila = porArticulo.get(id);
      fila.cantidad += p.cantidad;
      if (conCostos) fila.valor += p.valor;
      fila.lotes = fila.lotes.concat(p.lotes);
      if (p.cantidad > 0) fila.lugares++;
      fila.bajoMinimo = fila.bajoMinimo || p.bajoMinimo;
    });
    const resultado = [];
    porArticulo.forEach(fila => {
      fila.cantidad = redondear(fila.cantidad, 3);
      fila.vence = venceMasProximo(fila.lotes);
      fila.estado = estadoVencimiento(fila.vence, umbrales, fecha);
      resultado.push(fila);
    });
    return resultado.sort((a, b) => comparar(a.articulo.nombre, b.articulo.nombre));
  }

  /** Totales de un lugar (o de todos, con idLugar vacío) para el resumen y las tarjetas. */
  function resumen(idLugar) {
    const propias = lista.filter(p => !idLugar || p.lugar.id_lugar === idLugar);
    const lotes = [];
    propias.forEach(p => p.lotes.forEach(lote => { if (lote.cantidad > 0) lotes.push(lote); }));
    return {
      articulos: new Set(propias.filter(p => p.cantidad > 0).map(p => p.articulo.id_articulo)).size,
      lotes: lotes.length,
      valor: conCostos ? propias.reduce((suma, p) => suma + p.valor, 0) : null,
      vencidos: lotes.filter(lote => lote.estado.nivel === 'vencido').length,
      porVencer: lotes.filter(lote => NIVELES_POR_VENCER.indexOf(lote.estado.nivel) >= 0).length,
      bajoMinimo: propias.filter(p => p.bajoMinimo).length
    };
  }

  /** Datos de la ficha de un artículo: sus lugares y lotes visibles, mínimos y conversiones. */
  function ficha(idArticulo) {
    const propias = lista.filter(p => p.articulo.id_articulo === idArticulo)
      .sort((a, b) => ordenLugar(a.lugar, b.lugar));
    if (!articulos[idArticulo] && propias.length === 0) return null;
    const articulo = articuloDe(idArticulo);
    const categoria = categoriaDe(articulo);
    const lotes = [].concat(...propias.map(p => p.lotes));
    const vence = venceMasProximo(lotes);
    const merma = numeroONulo(articulo.merma_tolerada_pct);
    return {
      articulo: articulo, categoria: categoria, posiciones: propias,
      cantidad: redondear(propias.reduce((suma, p) => suma + p.cantidad, 0), 3),
      valor: conCostos ? propias.reduce((suma, p) => suma + p.valor, 0) : null,
      lotes: lotes.filter(lote => lote.cantidad > 0).length,
      lugares: propias.filter(p => p.cantidad > 0).length,
      vence: vence, estado: estadoVencimiento(vence, umbrales, fecha),
      conversiones: (conversiones[idArticulo] || []).slice().sort((a, b) => Number(a.factor_a_base) - Number(b.factor_a_base)),
      merma: merma !== null ? { valor: merma, heredada: false } : { valor: numeroONulo(categoria.merma_tolerada_pct), heredada: true },
      exento: articulo.exento_iva ? { valor: articulo.exento_iva === 'SI', heredado: false }
        : { valor: categoria.exento_iva === 'SI', heredado: true },
      minimoGlobal: numeroONulo(articulo.stock_minimo_global)
    };
  }

  /** Lotes con stock vencidos o por vencer (según los umbrales), del más urgente al menos. */
  function vencimientos() {
    const resultado = [];
    lista.forEach(p => p.lotes.forEach(lote => {
      if (lote.cantidad > 0 && (lote.estado.nivel === 'vencido' || NIVELES_POR_VENCER.indexOf(lote.estado.nivel) >= 0)) {
        resultado.push({ lote: lote, posicion: p });
      }
    }));
    return resultado.sort((a, b) => a.lote.estado.dias - b.lote.estado.dias ||
      comparar(a.posicion.articulo.nombre, b.posicion.articulo.nombre) || ordenLugar(a.posicion.lugar, b.posicion.lugar));
  }

  /** Artículos bajo el mínimo de su lugar, ordenados por lugar y nombre. */
  function bajoMinimo() {
    return lista.filter(p => p.bajoMinimo)
      .sort((a, b) => ordenLugar(a.lugar, b.lugar) || comparar(a.articulo.nombre, b.articulo.nombre));
  }

  /** Valor y cantidad de lugares por tipo (Bodega, Cámara, Faena), más las faenas activas. */
  function porTipo() {
    const tipos = {};
    lugares.forEach(lugar => {
      const tipo = tipos[lugar.tipo] = tipos[lugar.tipo] || { lugares: 0, activos: 0, valor: conCostos ? 0 : null };
      tipo.lugares++;
      if (lugar.estado === 'ACTIVO') tipo.activos++;
      if (conCostos) tipo.valor += lugar.valor;
    });
    return tipos;
  }

  return {
    hoy: fecha, conCostos: conCostos, bruto: bruto, umbrales: umbrales, metodoSalida: fifo ? 'FIFO' : 'FEFO',
    generadoEn: inventario.generado_en || '', actualizadoEn: inventario.actualizado_en || '',
    lugares: lugares, lugarPorId: lugarPorId, categorias: categorias,
    filas: filas, resumen: resumen, ficha: ficha, vencimientos: vencimientos, bajoMinimo: bajoMinimo, porTipo: porTipo
  };
}

// ---------- Textos para mostrar ----------

/** "2026-10-21T09:02:15" → "hoy a las 09:02", "ayer a las 18:30" o "el 19-10-2026 a las 18:30". */
export function textoMomento(iso, hoy) {
  const texto = String(iso || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(texto)) return '';
  const dia = texto.slice(0, 10);
  const hora = texto.slice(11, 16);
  const fechaHoy = hoy || hoyIso();
  const ayer = new Date(Date.UTC(Number(fechaHoy.slice(0, 4)), Number(fechaHoy.slice(5, 7)) - 1, Number(fechaHoy.slice(8, 10)) - 1))
    .toISOString().slice(0, 10);
  if (dia === fechaHoy) return 'hoy a las ' + hora;
  if (dia === ayer) return 'ayer a las ' + hora;
  return 'el ' + formatoFecha(dia) + ' a las ' + hora;
}

/** Texto corto del vencimiento para tablas: "en 3 días", "hoy", "Venció ayer", "06-12-2026", "Sin vencimiento". */
export function textoVenceCorto(estado, fecha) {
  if (!estado || estado.nivel === 'sin') return 'Sin vencimiento';
  if (estado.nivel === 'normal') return formatoFecha(fecha);
  return estado.texto.replace(/^Vence /, '');
}

// ---------- Utilidades ----------

function indexar(lista, campo) {
  const mapa = {};
  (lista || []).forEach(elemento => { mapa[elemento[campo]] = elemento; });
  return mapa;
}

function redondear(numero, decimales) {
  const factor = Math.pow(10, decimales);
  return Math.round(numero * factor) / factor;
}

function numeroONulo(valor) {
  return valor === null || valor === undefined || valor === '' || !isFinite(Number(valor)) ? null : Number(valor);
}

/** FEFO: vence primero (sin vencimiento al final) y luego llegó primero. FIFO: solo llegó primero. */
function ordenSalida(a, b, fifo) {
  if (!fifo && a.vence !== b.vence) {
    if (!a.vence) return 1;
    if (!b.vence) return -1;
    return a.vence < b.vence ? -1 : 1;
  }
  if (a.ingreso !== b.ingreso) return a.ingreso < b.ingreso ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Fecha de vencimiento más próxima entre los lotes con stock ('' si ninguno vence). */
function venceMasProximo(lotes) {
  let proxima = '';
  lotes.forEach(lote => {
    if (lote.cantidad > 0 && lote.vence && (!proxima || lote.vence < proxima)) proxima = lote.vence;
  });
  return proxima;
}

function ordenLugar(a, b) {
  return (ORDEN_TIPO[a.tipo] || 9) - (ORDEN_TIPO[b.tipo] || 9) || comparar(a.nombre, b.nombre);
}
