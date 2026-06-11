// ───────────────────────────────────────────────────────────────────────────
//  Capa de datos de la plataforma.
//  HOY: localStorage (funciona offline, sin login, en este equipo).
//  MAÑANA: para pasar a Supabase, basta reimplementar estas funciones contra
//  la nube manteniendo la misma firma. El resto de la app no cambia.
// ───────────────────────────────────────────────────────────────────────────

const KEY = 'acero_v1'
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
function write(d) { localStorage.setItem(KEY, JSON.stringify(d)) }

const CONFIG_DEFAULT = {
  nombre: 'ALMACÉN EL ACERO', nit: '9517525-8', propietario: 'Nayibe Talero',
  direccion: '', ciudad: '', telefono: '',
}

let cache = (() => {
  const d = read()
  d.facturas = d.facturas || []
  d.catalogo = d.catalogo || []
  d.pendientes = d.pendientes || []
  d.pedidos = d.pedidos || []
  d.pedidoSeq = d.pedidoSeq || 0
  d.config = { ...CONFIG_DEFAULT, ...(d.config || {}) }
  return d
})()
function persist() { write(cache) }

// ─── Configuración del almacén (encabezado de comprobantes) ───
export function getConfig() { return { ...cache.config } }
export function setConfig(patch) { cache.config = { ...cache.config, ...patch }; persist() }

// ─── Pedidos / comprobantes a proveedores ───
export function getPedidos() { return [...cache.pedidos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')) }
export function getPedido(id) { return cache.pedidos.find(p => p.id === id) }
export function siguienteNumeroPedido() { return 'PED-' + String((cache.pedidoSeq || 0) + 1).padStart(4, '0') }
export function addPedido(p) {
  cache.pedidoSeq = (cache.pedidoSeq || 0) + 1
  const pedido = { id: 'ped' + Date.now(), numero: 'PED-' + String(cache.pedidoSeq).padStart(4, '0'), creado: new Date().toISOString(), estadoPago: 'pendiente', ...p }
  cache.pedidos.unshift(pedido)
  persist()
  return pedido
}
export function updatePedido(id, patch) {
  const p = cache.pedidos.find(x => x.id === id); if (p) Object.assign(p, patch); persist()
}
// Créditos próximos a vencer o vencidos (no pagados, dentro de `dias` días o ya vencidos)
export function creditosPorVencer(dias = 3) {
  const hoy = Date.now()
  return cache.pedidos.filter(p => p.pago?.tipo === 'credito' && p.estadoPago !== 'pagado' && p.pago?.vencimiento)
    .map(p => ({ ...p, diasRestantes: Math.ceil((new Date(p.pago.vencimiento).getTime() - hoy) / 86400000) }))
    .filter(p => p.diasRestantes <= dias)
    .sort((a, b) => a.diasRestantes - b.diasRestantes)
}

// ─── Facturas (historial) ───
export function getFacturas() {
  return [...cache.facturas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
}
export function getFactura(id) { return cache.facturas.find(f => f.id === id) }

export function guardarLiquidacion(p) {
  // p: {numero, sigla, nit, proveedorNombre, fecha, items:[{nombre,codigo,cantidad,
  //     precio_unitario,iva_percent,margen,redondeo,etiquetas,precio_venta,codigo_interno}]}
  const id = p.numero ? 'F-' + p.numero : 'F-' + Date.now()
  let costoSinIva = 0, iva = 0, venta = 0, unidades = 0, etiquetas = 0
  p.items.forEach(it => {
    const sub = it.precio_unitario * it.cantidad
    costoSinIva += sub
    iva += sub * ((it.iva_percent || 0) / 100)
    venta += it.precio_venta * it.cantidad
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
  const idx = cache.facturas.findIndex(f => f.id === id)
  if (idx >= 0) cache.facturas[idx] = factura; else cache.facturas.push(factura)
  p.items.forEach(it => upsertProducto(it, p.sigla, factura.fecha))
  persist()
  return factura
}

// ─── Catálogo maestro (crece con cada factura) ───
export function getCatalogo() {
  return [...cache.catalogo].sort((a, b) => norm(a.nombre).localeCompare(norm(b.nombre)))
}
// Busca un producto del catálogo por nombre (y opcionalmente sigla) para auto-rellenar
// su código, costo, etc. Primero intenta coincidencia exacta por clave (sigla+nombre),
// luego por nombre normalizado en cualquier proveedor.
export function getProductoPorNombre(nombre, sigla) {
  const n = norm(nombre)
  return cache.catalogo.find(p => p.key === keyProd(nombre, sigla))
    || cache.catalogo.find(p => norm(p.nombre) === n) || null
}
function keyProd(nombre, sigla) { return (sigla || '?') + '|' + norm(nombre).slice(0, 60) }
function upsertProducto(it, sigla, fecha) {
  const k = keyProd(it.nombre, sigla)
  let prod = cache.catalogo.find(x => x.key === k)
  if (!prod) { prod = { key: k, nombre: it.nombre, sigla: sigla || '?', veces: 0, hist: [] }; cache.catalogo.push(prod) }
  prod.codigo = it.codigo || prod.codigo
  prod.ultimo_costo = it.precio_unitario
  prod.ultimo_venta = it.precio_venta
  prod.codigo_interno = it.codigo_interno
  prod.ultima_fecha = fecha
  prod.veces += 1
  prod.hist.push({ fecha, costo: it.precio_unitario, venta: it.precio_venta })
  if (prod.hist.length > 24) prod.hist = prod.hist.slice(-24)
}

// ─── Pendientes (lo que pide la gente) ───
export function getPendientes() { return [...cache.pendientes] }
export function addPendiente(p) {
  cache.pendientes.unshift({ id: 'p' + Date.now() + Math.floor(Math.random() * 1000), estado: 'pendiente', creado: new Date().toISOString(), ...p })
  persist()
}
export function updatePendiente(id, patch) {
  const p = cache.pendientes.find(x => x.id === id); if (p) Object.assign(p, patch); persist()
}
export function deletePendiente(id) {
  cache.pendientes = cache.pendientes.filter(x => x.id !== id); persist()
}

// ─── Utilidades ───
export function hayDatos() { return cache.facturas.length > 0 || cache.pendientes.length > 0 }
export function borrarTodo() { cache = { facturas: [], catalogo: [], pendientes: [] }; persist() }

export function sembrarEjemplos() {
  if (cache.facturas.length) return
  const hoy = new Date()
  const iso = d => new Date(hoy.getTime() - d * 86400000).toISOString()
  guardarLiquidacion({
    numero: 'TGE121432', sigla: 'TG', nit: '860403249', proveedorNombre: 'TECNIGRAPAS LTDA', fecha: iso(2),
    items: [
      { nombre: 'Válvula de retención 1177 booster 3/8"', codigo: '1177SAMA', cantidad: 3, precio_unitario: 11741, iva_percent: 19, margen: 30, redondeo: 'auto', etiquetas: 3, precio_venta: 16000, codigo_interno: 'RLSSS' },
      { nombre: 'Tornillo hexagonal G5 5/8 x 3-1/2"', codigo: 'TH58', cantidad: 10, precio_unitario: 1389, iva_percent: 19, margen: 30, redondeo: 'auto', etiquetas: 1, precio_venta: 1900, codigo_interno: 'RASS' },
      { nombre: 'Grasera recta 6mm', codigo: 'GR01', cantidad: 6, precio_unitario: 900, iva_percent: 19, margen: 30, redondeo: 'auto', etiquetas: 1, precio_venta: 1200, codigo_interno: 'RESS' },
    ],
  })
  guardarLiquidacion({
    numero: 'RD-08840', sigla: 'RD', nit: '860015737', proveedorNombre: 'RODACOL', fecha: iso(0),
    items: [
      { nombre: 'Rodamiento 6204 2RS', codigo: '6204', cantidad: 4, precio_unitario: 8200, iva_percent: 19, margen: 30, redondeo: 'auto', etiquetas: 4, precio_venta: 10700, codigo_interno: 'RSISS' },
      { nombre: 'Rodamiento 6301 ZZ', codigo: '6301', cantidad: 4, precio_unitario: 6800, iva_percent: 19, margen: 30, redondeo: 'auto', etiquetas: 4, precio_venta: 8900, codigo_interno: 'CASS' },
    ],
  })
  addPendiente({ prod: 'Rodamiento 6204 2RS', cant: 1, cliente: 'Sra. Elena', tel: '315 222 1111', sigla: 'RD', estado: 'llego' })
  addPendiente({ prod: 'Cruceta cardán Mitsubishi Montero 88/94', cant: 1, cliente: 'Taller La 30', tel: '320 444 9876', sigla: 'TG' })
  addPendiente({ prod: 'Disco de corte 4-1/2"', cant: 5, cliente: 'Don Jorge', tel: '310 555 1234', sigla: 'INT' })
}
