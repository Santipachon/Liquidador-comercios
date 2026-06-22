// ───────────────────────────────────────────────────────────────────────────
//  Capa de datos de la plataforma.
//  Nube: Supabase (multi-dispositivo, fuente de verdad) — ESQUEMA NORMALIZADO:
//    facturas + factura_items · productos + producto_hist · pedidos + pedido_items.
//  Espejo local: localStorage (lectura instantánea + offline). Las pantallas leen
//  la caché denormalizada (producto.hist[], factura.items[]); aquí se arma desde
//  las tablas hijas al hidratar y se reparte en tablas al escribir.
//  Identidad de producto: clave = NIT + '|' + código + '|' + nombre  (backend por NIT).
// ───────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'

const KEY = 'acero_v1'
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
function write(d) { try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* cuota llena: ignorar */ } }

const CONFIG_DEFAULT = {
  nombre: 'ALMACÉN EL ACERO', nit: '9517525-8', propietario: 'Nayibe Talero',
  direccion: '', ciudad: '', telefono: '',
  inventarioInicio: null,   // "Día 0": desde aquí se cuentan movimientos de stock y el análisis "desde el inicio"
  metaConteo: 100,
}

let cache = (() => {
  const d = read()
  d.facturas = d.facturas || []
  d.catalogo = d.catalogo || []
  d.pendientes = d.pendientes || []
  d.pedidos = d.pedidos || []
  d.pedidoSeq = d.pedidoSeq || 0
  d.bandeja = d.bandeja || []
  d.proveedores = d.proveedores || []
  d.config = { ...CONFIG_DEFAULT, ...(d.config || {}) }
  return d
})()
function persist() { write(cache) }

// ─── Empuje a la nube ───
// bg(): para una sola consulta (fire-and-forget, registra el error).
function bg(q) {
  if (q && typeof q.then === 'function') {
    q.then(r => { if (r && r.error) console.error('[supabase]', r.error.message) })
     .catch(e => console.error('[supabase]', e?.message || e))
  }
}
// push(): para escrituras de varios pasos (factura→items→hist). No interrumpe la UI.
async function push(fn) {
  try { await fn() } catch (e) { console.error('[supabase] push:', e?.message || e) }
}
// agrupa filas hijas por su id de padre, para armar los arreglos al hidratar.
function groupBy(rows, campo) {
  const m = new Map()
  for (const r of rows) { const k = r[campo]; if (!m.has(k)) m.set(k, []); m.get(k).push(r) }
  return m
}
// Trae TODAS las filas de una tabla (PostgREST devuelve máx. 1000 por consulta).
// Pide la 1ª página con el total y luego el resto de páginas EN PARALELO (mucho más rápido).
async function fetchAll(tabla) {
  const PAGE = 1000
  const primera = await supabase.from(tabla).select('*', { count: 'exact' }).range(0, PAGE - 1)
  if (primera.error) return { data: null, error: primera.error }
  const total = primera.count ?? (primera.data ? primera.data.length : 0)
  if (total <= PAGE) return { data: primera.data || [], error: null }
  const peticiones = []
  for (let desde = PAGE; desde < total; desde += PAGE) {
    peticiones.push(supabase.from(tabla).select('*').range(desde, desde + PAGE - 1))
  }
  const resto = await Promise.all(peticiones)
  const conError = resto.find(r => r.error)
  if (conError) return { data: null, error: conError.error }
  return { data: (primera.data || []).concat(...resto.map(r => r.data || [])), error: null }
}

// ─── Identidad de producto ───
function keyProd(nombre, codigo, nit) {
  return (nit || '?') + '|' + (codigo || '') + '|' + norm(nombre).slice(0, 60)
}

// ─── PDFs de facturas (Storage privado 'facturas-pdf') ───
const safeName = s => String(s || '').replace(/[^A-Za-z0-9_-]/g, '_')
const pdfPathDe = numero => safeName(numero) + '.pdf'
async function subirPdf(numero, blob) {
  if (!numero || !blob) return null
  const path = pdfPathDe(numero)
  const { error } = await supabase.storage.from('facturas-pdf').upload(path, blob, { contentType: 'application/pdf', upsert: true })
  if (error) { console.error('[pdf]', error.message); return null }
  return path
}

// ─── Mapeadores caché → fila normalizada (para escribir) ───
const productoToRow = p => ({
  clave: p.key, nombre: p.nombre, codigo: p.codigo || null, sigla: p.sigla || null, codigo_interno: p.codigo_interno || null,
  ultimo_costo: p.ultimo_costo ?? null, ultimo_venta: p.ultimo_venta ?? null, ultima_fecha: p.ultima_fecha || null, veces: p.veces || 0,
  margen_recordado: p.margen_recordado ?? null, redondeo_recordado: p.redondeo_recordado || null, etiquetas_regla: p.etiquetas_regla || null,
  conteo_fecha: p.conteo?.fecha || null, conteo_cantidad: p.conteo?.cantidad ?? null, updated_at: new Date().toISOString(),
})
const facturaHeaderRow = f => ({
  numero: f.numero, sigla: f.sigla || null, nit: f.nit || null, proveedor_nombre: f.proveedorNombre || null, fecha: f.fecha,
  num_productos: f.num_productos, unidades: f.unidades, etiquetas: f.etiquetas,
  costo_sin_iva: f.costoSinIva, iva: f.iva, costo_con_iva: f.costoConIva, venta: f.venta, ganancia: f.ganancia,
})
const pedidoHeaderRow = p => ({
  id: p.id, numero: p.numero, sigla: p.sigla || null, proveedor_nombre: p.proveedorNombre || null, nit: p.nit || null,
  fecha: p.fecha, lugar: p.lugar || null, incluye_precios: !!p.incluyePrecios, observaciones: p.observaciones || null,
  pago_tipo: p.pago?.tipo || 'contado', pago_dias: p.pago?.dias ?? null, pago_vencimiento: p.pago?.vencimiento || null,
  total_unidades: p.totalUnidades ?? null, total_dinero: p.totalDinero ?? null,
  estado_pago: p.estadoPago || 'pendiente', fecha_pago: p.fechaPago || null,
  comprobante_nombre: p.comprobantePago?.nombre || null, comprobante_url: p.comprobantePago?.dataUrl || null,
})
const pedidoItemRows = p => (p.items || []).map(it => ({
  pedido_id: p.id, producto_id: it.producto_id || null, codigo: it.codigo || null, nombre: it.nombre || null,
  cantidad: it.cantidad ?? null, precio: it.precio ?? null,
}))
const pendienteRow = p => ({
  id: p.id, prod: p.prod, codigo: p.codigo || null, cant: p.cant ?? null, cliente: p.cliente || null, tel: p.tel || null,
  sigla: p.sigla || null, estado: p.estado || 'pendiente', pedido_id: p.pedido_id || null, creado: p.creado,
})
const bandejaRow = b => ({
  id: b.id, sigla: b.sigla || null, proveedor_nombre: b.proveedorNombre || null, nit: b.nit || null, numero: b.numero || null,
  fecha_llegada: b.fechaLlegada || new Date().toISOString(), nombre_archivo: b.nombreArchivo || null, n_productos: b.nProductos ?? null, xml_text: b.xmlText || null, pdf_path: b.pdfPath || null,
})
const configRow = () => ({
  id: 1, nombre: cache.config.nombre, nit: cache.config.nit, propietario: cache.config.propietario,
  direccion: cache.config.direccion || null, ciudad: cache.config.ciudad || null, telefono: cache.config.telefono || null,
  inventario_inicio: cache.config.inventarioInicio || null, meta_mensual_conteo: cache.config.metaConteo ?? 100,
  pedido_seq: cache.pedidoSeq || 0,
})

// ─── Hidratar desde la nube (tras el login) ───
let hidratado = false
export function estaHidratado() { return hidratado }
export async function inicializar() {
  try {
    const [prod, hist, ventas, conteos, fact, fitems, pend, ped, pitems, band, provs, cfg] = await Promise.all([
      fetchAll('productos'),
      fetchAll('producto_hist'),
      fetchAll('producto_ventas'),
      fetchAll('conteos'),
      fetchAll('facturas'),
      fetchAll('factura_items'),
      fetchAll('pendientes'),
      fetchAll('pedidos'),
      fetchAll('pedido_items'),
      fetchAll('bandeja'),
      fetchAll('proveedores'),
      supabase.from('config').select('*').eq('id', 1).maybeSingle(),
    ])
    const err = prod.error || hist.error || ventas.error || conteos.error || fact.error || fitems.error || pend.error || ped.error || pitems.error || band.error || provs.error || cfg.error
    if (err) { console.error('[hidratar]', err.message); return false }

    const histByProd = groupBy(hist.data || [], 'producto_id')
    const ventasByProd = groupBy(ventas.data || [], 'producto_id')
    const itemsByFact = groupBy(fitems.data || [], 'factura_id')
    const itemsByPed = groupBy(pitems.data || [], 'pedido_id')
    const factById = new Map((fact.data || []).map(r => [r.id, r]))   // para enlazar cada historial con su factura/PDF

    cache.catalogo = (prod.data || []).map(r => ({
      key: r.clave, nombre: r.nombre, codigo: r.codigo, sigla: r.sigla, codigo_interno: r.codigo_interno,
      ultimo_costo: r.ultimo_costo, ultimo_venta: r.ultimo_venta, ultima_fecha: r.ultima_fecha, veces: r.veces || 0,
      margen_recordado: r.margen_recordado, redondeo_recordado: r.redondeo_recordado, etiquetas_regla: r.etiquetas_regla,
      conteo: r.conteo_fecha ? { fecha: r.conteo_fecha, cantidad: r.conteo_cantidad } : undefined,
      hist: (histByProd.get(r.id) || [])
        .map(h => { const fa = factById.get(h.factura_id); return { fecha: h.fecha, costo: h.costo, venta: h.venta, cantidad: h.cantidad, margen: h.margen, redondeo: h.redondeo, factura: fa?.numero || null, pdf_path: fa?.pdf_path || null } })
        .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')),
      ventas: (ventasByProd.get(r.id) || []).map(v => ({ fecha: v.fecha, cantidad: v.cantidad, precio: v.precio, fuente: v.fuente })),
    }))

    cache.facturas = (fact.data || []).map(r => ({
      id: 'F-' + (r.numero || r.id), numero: r.numero, sigla: r.sigla, nit: r.nit, proveedorNombre: r.proveedor_nombre, fecha: r.fecha,
      num_productos: r.num_productos, unidades: r.unidades, etiquetas: r.etiquetas,
      costoSinIva: r.costo_sin_iva, iva: r.iva, costoConIva: r.costo_con_iva, venta: r.venta, ganancia: r.ganancia,
      items: (itemsByFact.get(r.id) || []).map(it => ({
        nombre: it.nombre, codigo: it.codigo, cantidad: it.cantidad, precio_unitario: it.precio_unitario, iva_percent: it.iva_percent,
        margen: it.margen, redondeo: it.redondeo, precio_venta: it.precio_venta, codigo_interno: it.codigo_interno, etiquetas: it.etiquetas,
      })),
    }))

    cache.pendientes = (pend.data || []).sort((a, b) => (b.creado || '').localeCompare(a.creado || '')).map(r => ({
      id: r.id, prod: r.prod, codigo: r.codigo, cant: r.cant, cliente: r.cliente, tel: r.tel, sigla: r.sigla, estado: r.estado, creado: r.creado, pedido_id: r.pedido_id,
    }))

    cache.pedidos = (ped.data || []).map(r => ({
      id: r.id, numero: r.numero, sigla: r.sigla, proveedorNombre: r.proveedor_nombre, nit: r.nit, fecha: r.fecha, lugar: r.lugar,
      incluyePrecios: r.incluye_precios, observaciones: r.observaciones,
      pago: r.pago_tipo === 'credito' ? { tipo: 'credito', dias: r.pago_dias, vencimiento: r.pago_vencimiento } : { tipo: r.pago_tipo || 'contado' },
      totalUnidades: r.total_unidades, totalDinero: r.total_dinero, estadoPago: r.estado_pago, fechaPago: r.fecha_pago,
      comprobantePago: r.comprobante_nombre ? { nombre: r.comprobante_nombre, dataUrl: r.comprobante_url } : undefined,
      items: (itemsByPed.get(r.id) || []).map(it => ({ codigo: it.codigo, nombre: it.nombre, cantidad: it.cantidad, precio: it.precio, producto_id: it.producto_id })),
    }))

    cache.bandeja = (band.data || []).map(r => ({
      id: r.id, sigla: r.sigla, proveedorNombre: r.proveedor_nombre, nit: r.nit, numero: r.numero,
      fechaLlegada: r.fecha_llegada, nombreArchivo: r.nombre_archivo, nProductos: r.n_productos, xmlText: r.xml_text, pdfPath: r.pdf_path,
    }))

    cache.proveedores = (provs.data || []).map(r => ({ id: r.id, sigla: r.sigla, nombre: r.nombre, nit: r.nit }))

    if (cfg.data) {
      cache.config = {
        nombre: cfg.data.nombre, nit: cfg.data.nit, propietario: cfg.data.propietario,
        direccion: cfg.data.direccion || '', ciudad: cfg.data.ciudad || '', telefono: cfg.data.telefono || '',
        inventarioInicio: cfg.data.inventario_inicio || null,
        metaConteo: cfg.data.meta_mensual_conteo ?? 100,
      }
      cache.pedidoSeq = cfg.data.pedido_seq || 0
    }
    hidratado = true
    persist()
    return true
  } catch (e) { console.error('[hidratar]', e?.message || e); return false }
}

// ─── Bandeja: facturas por liquidar ───
export function getBandeja() {
  return [...cache.bandeja].sort((a, b) => (b.fechaLlegada || '').localeCompare(a.fechaLlegada || ''))
}
export function addABandeja(item) {
  const { pdfBlob, ...rest } = item
  if (rest.numero) {
    cache.bandeja.filter(x => x.numero === rest.numero).forEach(x => bg(supabase.from('bandeja').delete().eq('id', x.id)))
    cache.bandeja = cache.bandeja.filter(x => x.numero !== rest.numero)
  }
  const nuevo = { id: 'b' + Date.now() + Math.floor(Math.random() * 1000), fechaLlegada: new Date().toISOString(), ...rest }
  if (pdfBlob && nuevo.numero) { nuevo.pdfPath = pdfPathDe(nuevo.numero); push(() => subirPdf(nuevo.numero, pdfBlob)) }  // sube el PDF de una vez
  cache.bandeja.unshift(nuevo)
  persist(); bg(supabase.from('bandeja').upsert(bandejaRow(nuevo), { onConflict: 'id' }))
}
export function quitarDeBandeja(id) {
  cache.bandeja = cache.bandeja.filter(x => x.id !== id)
  persist(); bg(supabase.from('bandeja').delete().eq('id', id))
}

// ─── Configuración del almacén ───
export function getConfig() { return { ...cache.config } }
export function setConfig(patch) {
  cache.config = { ...cache.config, ...patch }
  persist(); bg(supabase.from('config').upsert(configRow(), { onConflict: 'id' }))
}

// ─── Pedidos / comprobantes a proveedores ───
export function getPedidos() { return [...cache.pedidos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')) }
export function getPedido(id) { return cache.pedidos.find(p => p.id === id) }
export function siguienteNumeroPedido() { return 'PED-' + String((cache.pedidoSeq || 0) + 1).padStart(4, '0') }
export function addPedido(p) {
  cache.pedidoSeq = (cache.pedidoSeq || 0) + 1
  const pedido = { id: 'ped' + Date.now(), numero: 'PED-' + String(cache.pedidoSeq).padStart(4, '0'), creado: new Date().toISOString(), estadoPago: 'pendiente', ...p }
  cache.pedidos.unshift(pedido)
  persist()
  push(async () => {
    const { error } = await supabase.from('pedidos').upsert(pedidoHeaderRow(pedido), { onConflict: 'id' })
    if (error) throw error
    await supabase.from('pedido_items').delete().eq('pedido_id', pedido.id)
    const rows = pedidoItemRows(pedido)
    if (rows.length) { const { error: e2 } = await supabase.from('pedido_items').insert(rows); if (e2) throw e2 }
  })
  bg(supabase.from('config').upsert(configRow(), { onConflict: 'id' }))
  return pedido
}
export function updatePedido(id, patch) {
  const p = cache.pedidos.find(x => x.id === id)
  if (!p) return
  Object.assign(p, patch); persist()
  push(async () => {
    const { error } = await supabase.from('pedidos').upsert(pedidoHeaderRow(p), { onConflict: 'id' })
    if (error) throw error
    if (patch.items) {
      await supabase.from('pedido_items').delete().eq('pedido_id', p.id)
      const rows = pedidoItemRows(p)
      if (rows.length) { const { error: e2 } = await supabase.from('pedido_items').insert(rows); if (e2) throw e2 }
    }
  })
}
export function creditosPorVencer(dias = 3) {
  const hoy = Date.now()
  return cache.pedidos.filter(p => p.pago?.tipo === 'credito' && p.estadoPago !== 'pagado' && p.pago?.vencimiento)
    .map(p => ({ ...p, diasRestantes: Math.ceil((new Date(p.pago.vencimiento).getTime() - hoy) / 86400000) }))
    .filter(p => p.diasRestantes <= dias)
    .sort((a, b) => a.diasRestantes - b.diasRestantes)
}

// ─── Facturas (historial) ───
export function getFacturas() { return [...cache.facturas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')) }
export function getFactura(id) { return cache.facturas.find(f => f.id === id) }

export function guardarLiquidacion(p) {
  const id = p.numero ? 'F-' + p.numero : 'F-' + Date.now()
  let costoSinIva = 0, iva = 0, venta = 0, unidades = 0, etiquetas = 0
  p.items.forEach(it => {
    const sub = it.precio_unitario * it.cantidad
    costoSinIva += sub
    iva += sub * ((it.iva_percent || 0) / 100)
    venta += (it.precio_venta || 0) * it.cantidad
    unidades += it.cantidad
    etiquetas += it.etiquetas || 0
  })
  const factura = {
    id, numero: p.numero || '(sin número)', sigla: p.sigla || '', nit: p.nit || '',
    proveedorNombre: p.proveedorNombre || '', fecha: p.fecha || new Date().toISOString(),
    items: p.items, num_productos: p.items.length, unidades, etiquetas,
    costoSinIva: Math.round(costoSinIva), iva: Math.round(iva),
    costoConIva: Math.round(costoSinIva + iva), venta: Math.round(venta),
    ganancia: Math.round(venta - (costoSinIva + iva)),
  }
  const pdfPath = p.pdfBlob ? pdfPathDe(p.numero || '') : (p.pdfPath || null)
  factura.pdf_path = pdfPath
  const idx = cache.facturas.findIndex(f => f.id === id)
  if (idx >= 0) cache.facturas[idx] = factura; else cache.facturas.push(factura)
  p.items.forEach(it => upsertProductoLocal(it, p.sigla, p.nit, factura.fecha, factura.numero, pdfPath))
  persist()
  push(() => pushLiquidacion(factura, p))
  return factura
}

// Catálogo en memoria (denormalizado) — clave NIT+código+nombre.
function upsertProductoLocal(it, sigla, nit, fecha, numero, pdfPath) {
  const k = keyProd(it.nombre, it.codigo, nit)
  let prod = cache.catalogo.find(x => x.key === k)
  if (!prod) { prod = { key: k, nombre: it.nombre, sigla: sigla || '?', veces: 0, hist: [] }; cache.catalogo.push(prod) }
  prod.codigo = it.codigo || prod.codigo
  prod.ultimo_costo = it.precio_unitario
  prod.ultimo_venta = it.precio_venta
  prod.codigo_interno = it.codigo_interno
  prod.ultima_fecha = fecha
  prod.veces = (prod.veces || 0) + 1
  prod.hist = prod.hist || []
  prod.hist.push({ fecha, costo: it.precio_unitario, venta: it.precio_venta, cantidad: it.cantidad, margen: it.margen, redondeo: it.redondeo, factura: numero || null, pdf_path: pdfPath || null })
  return prod
}

// Escritura normalizada a la nube: factura → factura_items + productos → producto_hist.
// Idempotente por número de factura (re-guardar reemplaza los renglones/historial de esa factura).
async function pushLiquidacion(factura, p) {
  const { data: frow, error: fe } = await supabase
    .from('facturas').upsert(facturaHeaderRow(factura), { onConflict: 'numero' }).select('id').single()
  if (fe) throw fe
  const fid = frow.id
  // PDF: subir el del ZIP (carga directa) o enlazar el ya subido desde la bandeja
  let pdfPath = p.pdfPath || null
  if (p.pdfBlob) pdfPath = await subirPdf(factura.numero, p.pdfBlob)
  if (pdfPath) { const up = await supabase.from('facturas').update({ pdf_path: pdfPath }).eq('id', fid); if (up.error) throw up.error }
  // limpiar lo previo de ESTA factura (evita duplicar al re-guardar)
  const del1 = await supabase.from('factura_items').delete().eq('factura_id', fid); if (del1.error) throw del1.error
  const del2 = await supabase.from('producto_hist').delete().eq('factura_id', fid); if (del2.error) throw del2.error

  const itemRows = [], histRows = []
  for (const it of p.items) {
    const clave = keyProd(it.nombre, it.codigo, p.nit)
    const cacheProd = cache.catalogo.find(x => x.key === clave) || { key: clave, nombre: it.nombre, codigo: it.codigo, sigla: p.sigla }
    const { data: prow, error: pe } = await supabase
      .from('productos').upsert(productoToRow(cacheProd), { onConflict: 'clave' }).select('id').single()
    if (pe) throw pe
    const pid = prow.id
    itemRows.push({
      factura_id: fid, producto_id: pid, nombre: it.nombre, codigo: it.codigo || null, cantidad: it.cantidad,
      precio_unitario: it.precio_unitario, iva_percent: it.iva_percent ?? null, margen: it.margen ?? null,
      redondeo: it.redondeo || null, precio_venta: it.precio_venta ?? null, codigo_interno: it.codigo_interno || null, etiquetas: it.etiquetas ?? null,
    })
    histRows.push({
      producto_id: pid, factura_id: fid, fecha: factura.fecha, costo: it.precio_unitario,
      venta: it.precio_venta ?? null, cantidad: it.cantidad, margen: it.margen ?? null, redondeo: it.redondeo || null,
    })
  }
  if (itemRows.length) { const { error } = await supabase.from('factura_items').insert(itemRows); if (error) throw error }
  if (histRows.length) { const { error } = await supabase.from('producto_hist').insert(histRows); if (error) throw error }
}

// ─── Catálogo maestro ───
export function getCatalogo() { return [...cache.catalogo].sort((a, b) => norm(a.nombre).localeCompare(norm(b.nombre))) }
export function getProductoPorNombre(nombre, sigla) {
  const n = norm(nombre)
  return cache.catalogo.find(p => norm(p.nombre) === n && (!sigla || p.sigla === sigla))
    || cache.catalogo.find(p => norm(p.nombre) === n) || null
}

// ─── Proveedores (catálogo de la base; se pueden registrar nuevos al liquidar) ───
export function getProveedores() { return [...cache.proveedores] }
export async function addProveedor({ nit, sigla, nombre }) {
  const s = (sigla || '').trim().toUpperCase()
  if (!s) return { error: 'Escriba una sigla (apodo) para el proveedor.' }
  if (cache.proveedores.some(p => (p.sigla || '').toUpperCase() === s)) return { error: `La sigla "${s}" ya existe. Use una distinta.` }
  const { data, error } = await supabase.from('proveedores').insert({ sigla: s, nombre: nombre || s, nit: nit || null, activo: true }).select('id').single()
  if (error) return { error: /sigla_unica|duplicate/i.test(error.message) ? `La sigla "${s}" ya existe.` : error.message }
  const nuevo = { id: data.id, sigla: s, nombre: nombre || s, nit: nit || null }
  cache.proveedores.push(nuevo); persist()
  return { ok: true, proveedor: nuevo }
}

// ─── Pendientes ───
export function getPendientes() { return [...cache.pendientes] }
export function addPendiente(p) {
  const nuevo = { id: 'p' + Date.now() + Math.floor(Math.random() * 1000), estado: 'pendiente', creado: new Date().toISOString(), ...p }
  cache.pendientes.unshift(nuevo)
  persist(); bg(supabase.from('pendientes').upsert(pendienteRow(nuevo), { onConflict: 'id' }))
}
export function updatePendiente(id, patch) {
  const p = cache.pendientes.find(x => x.id === id)
  if (p) { Object.assign(p, patch); persist(); bg(supabase.from('pendientes').upsert(pendienteRow(p), { onConflict: 'id' })) }
}
export function deletePendiente(id) {
  cache.pendientes = cache.pendientes.filter(x => x.id !== id)
  persist(); bg(supabase.from('pendientes').delete().eq('id', id))
}

// ─── Utilidades ───
export function hayDatos() { return cache.facturas.length > 0 || cache.pendientes.length > 0 }
export async function borrarTodo() {
  cache.facturas = []; cache.catalogo = []; cache.pendientes = []; cache.pedidos = []; cache.bandeja = []
  persist()
  await Promise.all([
    supabase.from('factura_items').delete().gte('id', 0),
    supabase.from('producto_hist').delete().gte('id', 0),
    supabase.from('producto_ventas').delete().gte('id', 0),
    supabase.from('conteos').delete().gte('id', 0),
    supabase.from('pedido_items').delete().not('id', 'is', null),
  ])
  await Promise.all([
    supabase.from('facturas').delete().gte('id', 0),
    supabase.from('productos').delete().gte('id', 0),
    supabase.from('pendientes').delete().not('id', 'is', null),
    supabase.from('pedidos').delete().not('id', 'is', null),
    supabase.from('bandeja').delete().not('id', 'is', null),
  ])
}
