// ───────────────────────────────────────────────────────────────────────────
//  Impresión directa a la Phomemo M110 vía Web Bluetooth (BLE GATT).
//  Sin app, sin drivers: la propia web manda la orden a la impresora.
//
//  ⚠️  SOLO funciona en Chrome/Edge (Chromium) en ANDROID o PC (Windows/Mac).
//      iPhone/iPad NO soportan Web Bluetooth → esos equipos solo liquidan.
//      Requiere HTTPS (Vercel ya lo es) o localhost.
//
//  Protocolo = ESC/POS reverse-engineered por la comunidad:
//    · vivier/phomemo-tools  · transcriptionstream/phomymo
//  Servicio BLE 0xFF00 · característica de escritura 0xFF02.
// ───────────────────────────────────────────────────────────────────────────
import { formatCOP, fechaCorta, numToLetras } from './shared'

const SERVICE = 0xff00      // servicio de la impresora
const WRITE   = 0xff02      // característica donde se escriben los bytes

// Nombres BLE típicos de las Phomemo (para filtrar en el selector del navegador)
const PREFIJOS = ['M110', 'M120', 'M200', 'M220', 'M221', 'M02', 'T02', 'D30', 'D35', 'P12', 'Phomemo']

// Lienzo de la etiqueta 40×30 mm a 203 dpi. El ancho debe ser múltiplo de 8
// (cada byte = 8 puntos). 320 px = 40 bytes/línea · 240 px = 240 líneas de alto.
export const ETIQUETA = { anchoPx: 320, altoPx: 240 }

// Parámetros de impresión por defecto (ajustables tras la prueba física)
const DEFAULTS = { velocidad: 0x03, densidad: 0x08, papel: 0x0a } // papel 0x0a = etiquetas con separación (die-cut)

// ─── Estado del módulo (una sola impresora emparejada por sesión) ───
let device = null
let caracteristica = null
let uiDisc = null

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Se dispara cuando la impresora se desconecta (apagada / fuera de rango).
function onDisc() { caracteristica = null; if (uiDisc) uiDisc() }
// La UI registra aquí un callback para reflejar la desconexión pasiva en pantalla.
export function alDesconectar(cb) { uiDisc = cb }

export function soportado() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth
}
export function conectada() {
  return !!(device && device.gatt && device.gatt.connected && caracteristica)
}
export function nombreImpresora() {
  return device?.name || null
}

// ─── Conexión ───
// Abre el selector Bluetooth del navegador. DEBE llamarse desde un onClick
// (Web Bluetooth exige un gesto del usuario). Con { todos:true } muestra todos
// los dispositivos, por si la impresora no aparece con el filtro por nombre.
export async function conectar({ todos = false } = {}) {
  if (!soportado()) {
    throw new Error('Este navegador no soporta Bluetooth web. Use Chrome o Edge en Android o PC (el iPhone/iPad no sirve para imprimir).')
  }
  const opciones = todos
    ? { acceptAllDevices: true, optionalServices: [SERVICE] }
    : { filters: PREFIJOS.map(p => ({ namePrefix: p })), optionalServices: [SERVICE] }
  device = await navigator.bluetooth.requestDevice(opciones)
  device.removeEventListener('gattserverdisconnected', onDisc)   // evita listeners duplicados si Chrome reusa el device
  device.addEventListener('gattserverdisconnected', onDisc)
  await abrirGatt()
  return nombreImpresora()
}

async function abrirGatt() {
  const server = await device.gatt.connect()
  const service = await server.getPrimaryService(SERVICE)
  caracteristica = await service.getCharacteristic(WRITE)
}

// Reabre la conexión con la impresora YA emparejada, sin volver a mostrar el selector.
export async function reconectar() {
  if (!device) return false
  if (conectada()) return true
  try { await abrirGatt(); return true } catch { return false }
}

export function olvidar() {
  try { device?.gatt?.disconnect() } catch { /* ya desconectada */ }
  device = null
  caracteristica = null
}

// ─── Escritura BLE troceada ───
// BLE manda paquetes pequeños; si se envía todo de golpe la M110 pierde datos.
// Se trocea y se deja un respiro entre paquetes.
async function enviar(bytes) {
  if (!conectada()) {
    const ok = await reconectar()
    if (!ok) throw new Error('La impresora no está conectada. Pulse "Conectar impresora".')
  }
  // Preferimos escritura CON respuesta: es portátil (fragmenta sola si el paquete
  // supera el MTU negociado —típico en PC— y controla el flujo por ACK). Solo caemos
  // a "sin respuesta" si la característica no admite la otra (según sus properties).
  const props = caracteristica.properties || {}
  const sinRespuesta = !props.write && !!props.writeWithoutResponse
  const CHUNK = 100
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const trozo = bytes.slice(i, i + CHUNK)
    if (sinRespuesta) {
      await caracteristica.writeValueWithoutResponse(trozo)
      await sleep(18)   // sin ACK: dar respiro para no perder datos
    } else if (caracteristica.writeValueWithResponse) {
      await caracteristica.writeValueWithResponse(trozo)
    } else {
      await caracteristica.writeValue(trozo)
    }
  }
}

// ─── Dibujo de la etiqueta en un <canvas> ───
// datos = { nombre, sigla, codigo, precio, fecha }
export function lienzoEtiqueta(datos) {
  const { anchoPx: W, altoPx: H } = ETIQUETA
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'

  // 1) Nombre del producto (hasta 2 líneas, ajustado al ancho)
  ctx.font = 'bold 25px Arial, sans-serif'
  let y = 10
  ajustarTexto(ctx, String(datos.nombre || '').toUpperCase(), W - 16, 2).forEach(l => {
    ctx.fillText(l, 8, y); y += 29
  })

  // Línea divisoria
  ctx.fillRect(8, 96, W - 16, 2)

  // 2) Sigla del proveedor (izq) + código interno REPUBLICAS (der)
  ctx.font = 'bold 27px Arial, sans-serif'
  ctx.fillText(String(datos.sigla || ''), 8, 108)
  ctx.textAlign = 'right'
  ctx.font = 'bold 33px "Courier New", monospace'
  ctx.fillText(String(datos.codigo || ''), W - 8, 106)
  ctx.textAlign = 'left'

  // 3) Precio de venta (grande) + fecha
  ctx.font = 'bold 46px Arial, sans-serif'
  ctx.fillText(String(datos.precio || ''), 8, 160)
  ctx.textAlign = 'right'
  ctx.font = '19px Arial, sans-serif'
  ctx.fillText(String(datos.fecha || ''), W - 8, 214)
  ctx.textAlign = 'left'

  return cv
}

// Vista previa PNG (data URL) para mostrar en la pantalla antes de imprimir.
export function vistaPrevia(datos) {
  return lienzoEtiqueta(datos).toDataURL('image/png')
}

// Divide un texto en varias líneas que quepan en maxAncho, máximo maxLineas.
function ajustarTexto(ctx, texto, maxAncho, maxLineas) {
  const palabras = texto.split(/\s+/).filter(Boolean)
  const lineas = []
  let actual = ''
  for (let k = 0; k < palabras.length; k++) {
    const p = palabras[k]
    const prueba = actual ? actual + ' ' + p : p
    if (ctx.measureText(prueba).width <= maxAncho || !actual) {
      actual = prueba
    } else {
      lineas.push(actual)
      if (lineas.length === maxLineas - 1) {
        actual = palabras.slice(k).join(' ')   // el resto va completo en la última línea (luego se trunca)
        break
      }
      actual = p
    }
  }
  if (lineas.length < maxLineas) lineas.push(actual)
  // Recorta con "…" la última línea si excede
  const i = lineas.length - 1
  if (i >= 0 && ctx.measureText(lineas[i]).width > maxAncho) {
    let ult = lineas[i]
    while (ult.length > 1 && ctx.measureText(ult + '…').width > maxAncho) ult = ult.slice(0, -1)
    lineas[i] = ult + '…'
  }
  return lineas
}

// ─── Canvas → bytes ESC/POS (configuración + imagen raster + pie) ───
function bytesDeLienzo(cv, opc = {}) {
  const { velocidad, densidad, papel } = { ...DEFAULTS, ...opc }
  const W = cv.width, H = cv.height
  const img = cv.getContext('2d').getImageData(0, 0, W, H)
  const bytesPorFila = Math.ceil(W / 8)   // robusto aunque el ancho no sea múltiplo de 8
  const raster = new Uint8Array(bytesPorFila * H)
  const d = img.data
  for (let y = 0; y < H; y++) {
    for (let xb = 0; xb < bytesPorFila; xb++) {
      let b = 0
      for (let bit = 0; bit < 8; bit++) {
        const x = xb * 8 + bit
        if (x >= W) break   // no leer fuera de la fila
        const idx = (y * W + x) * 4
        const a = d[idx + 3]
        const lum = a < 128 ? 255 : (0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2])
        if (lum < 128) b |= (0x80 >> bit)   // bit encendido = punto negro · MSB = píxel izquierdo
      }
      raster[y * bytesPorFila + xb] = b
    }
  }

  const partes = []
  // Cabecera / configuración de impresión
  partes.push(Uint8Array.of(0x1b, 0x40))                    // ESC @  inicializar
  partes.push(Uint8Array.of(0x1b, 0x4e, 0x0d, velocidad))   // velocidad de impresión
  partes.push(Uint8Array.of(0x1b, 0x4e, 0x04, densidad))    // densidad (oscuridad)
  partes.push(Uint8Array.of(0x1f, 0x11, papel))             // tipo de papel

  // Imagen raster (GS v 0), en bandas (el buffer de la M110 ronda las ~240 líneas;
  // usamos 200 como margen de seguridad — no cambia el resultado visual).
  const MAX = 200
  for (let y0 = 0; y0 < H; y0 += MAX) {
    const alto = Math.min(MAX, H - y0)
    partes.push(Uint8Array.of(
      0x1d, 0x76, 0x30, 0x00,
      bytesPorFila & 0xff, (bytesPorFila >> 8) & 0xff,
      alto & 0xff, (alto >> 8) & 0xff,
    ))
    partes.push(raster.subarray(y0 * bytesPorFila, (y0 + alto) * bytesPorFila))
  }

  // Pie: avanzar el papel / finalizar
  partes.push(Uint8Array.of(0x1f, 0xf0, 0x05, 0x00))
  partes.push(Uint8Array.of(0x1f, 0xf0, 0x03, 0x00))

  return concat(partes)
}

function concat(arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}

// ─── Impresión ───
// Imprime UNA etiqueta a partir de sus datos.
export async function imprimirEtiqueta(datos, opc) {
  await enviar(bytesDeLienzo(lienzoEtiqueta(datos), opc))
}

// Convierte un renglón de factura (item) + datos de la factura en los datos de la etiqueta.
export function etiquetaDeItem(it, factura) {
  return {
    nombre: it.nombre,
    sigla: factura.sigla || '',
    codigo: it.codigo_interno || (it.precio_venta != null ? numToLetras(it.precio_venta) : ''),
    precio: it.precio_venta != null ? formatCOP(it.precio_venta) : '',
    fecha: fechaCorta(factura.fecha),
  }
}

// nº de etiquetas de un ítem — MISMA regla en la cabecera, el botón y la impresión
// (evita que el botón diga "Imprimir 0" y salgan N, o que se salte la confirmación).
export function nEtiquetasDeItem(it) {
  return Math.max(0, Math.round(it.etiquetas ?? it.cantidad ?? 0))
}
export function contarEtiquetas(factura) {
  return (factura.items || []).reduce((n, it) => n + nEtiquetasDeItem(it), 0)
}

// Imprime una factura completa: por cada producto repite su nº de "etiquetas".
// onProgreso(hechas, total, item) permite mostrar una barra de progreso.
export async function imprimirFactura(factura, { onProgreso, ...opc } = {}) {
  const trabajos = []
  for (const it of (factura.items || [])) {
    for (let i = 0; i < nEtiquetasDeItem(it); i++) trabajos.push(it)
  }
  const total = trabajos.length
  for (let i = 0; i < total; i++) {
    if (i > 0) await sleep(120)   // respiro entre etiquetas (avance del papel), no tras la última
    await imprimirEtiqueta(etiquetaDeItem(trabajos[i], factura), opc)
    onProgreso?.(i + 1, total, trabajos[i])
  }
  return total
}

// Etiqueta de PRUEBA para verificar el hardware sin depender de una factura.
export async function imprimirPrueba(opc) {
  await imprimirEtiqueta({
    nombre: 'PRUEBA EL ACERO',
    sigla: 'TEST',
    codigo: 'EAAAS',
    precio: formatCOP(29990),
    fecha: fechaCorta(new Date().toISOString()),
  }, opc)
}
