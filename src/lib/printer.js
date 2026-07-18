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

// Lienzo de la etiqueta 30×20 mm a 203 dpi. El ancho debe ser múltiplo de 8
// (cada byte = 8 puntos). 240 px = 30 bytes/línea · 160 px = 160 líneas de alto.
export const ETIQUETA = { anchoPx: 240, altoPx: 160 }

// Parámetros de impresión por defecto (ajustables tras la prueba física)
const DEFAULTS = { velocidad: 0x05, densidad: 0x0a, papel: 0x0a } // papel 0x0a = etiquetas con separación (die-cut)

// ─── Estado del módulo (una sola impresora emparejada por sesión) ───
let device = null
let caracteristica = null
let uiDisc = null

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Reintenta una operación BLE que puede fallar de forma transitoria ("GATT operation failed").
async function conReintento(fn, veces = 3, espera = 300) {
  let ultimo
  for (let i = 0; i < veces; i++) {
    try { return await fn() } catch (e) { ultimo = e; await sleep(espera) }
  }
  throw ultimo
}

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
  const server = await conReintento(() => device.gatt.connect())
  await sleep(200)   // dar tiempo al stack BLE antes de descubrir servicios
  const service = await conReintento(() => server.getPrimaryService(SERVICE))
  caracteristica = await conReintento(() => service.getCharacteristic(WRITE))
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

// ─── Escritura BLE ───
// Escribe bytes a la característica en trozos, con una pausa entre cada uno.
// La M110 NECESITA ese respiro para procesar; sin él "recibe pero no imprime".
async function escribir(bytes, chunk = 128, pausa = 20) {
  const props = caracteristica.properties || {}
  const sinRespuesta = !!props.writeWithoutResponse   // la M110 usa write-sin-respuesta + pausa (como phomymo)
  for (let i = 0; i < bytes.length; i += chunk) {
    const trozo = bytes.slice(i, i + chunk)
    if (sinRespuesta) await caracteristica.writeValueWithoutResponse(trozo)
    else if (caracteristica.writeValueWithResponse) await caracteristica.writeValueWithResponse(trozo)
    else await caracteristica.writeValue(trozo)
    await sleep(pausa)
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
  // Diseño (réplica de la etiqueta de referencia):
  //   · fecha arriba a la derecha (pequeña)
  //   · sigla del proveedor debajo, a la derecha
  //   · CÓDIGO interno REPUBLICAS grande a la izquierda (protagonista; el precio va en letras, no en números)
  //   · nombre del producto abajo, hasta 3 líneas
  ctx.textBaseline = 'top'

  // 1) Fecha (arriba a la derecha)
  ctx.textAlign = 'right'
  ctx.font = '15px Arial, sans-serif'
  ctx.fillText(String(datos.fecha || ''), W - 6, 4)

  // 2) Sigla del proveedor (derecha, bajo la fecha)
  ctx.font = '24px Arial, sans-serif'
  ctx.fillText(String(datos.sigla || ''), W - 6, 22)

  // 3) Código REPUBLICAS — grande, a la izquierda (se auto-ajusta para caber)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const cod = String(datos.codigo || '')
  const codPx = ajustarFuente(ctx, cod, W - 54, 50, 'Arial, sans-serif')
  ctx.font = `${codPx}px Arial, sans-serif`
  ctx.fillText(cod, 6, 55)

  // 4) Nombre del producto (abajo, hasta 3 líneas)
  ctx.textBaseline = 'top'
  ctx.font = '16px Arial, sans-serif'
  let y = 92
  ajustarTexto(ctx, String(datos.nombre || '').toUpperCase(), W - 12, 3).forEach(l => {
    ctx.fillText(l, 6, y); y += 19
  })

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

// Devuelve el mayor tamaño de fuente (≤ maxPx) con el que `texto` cabe en maxAncho.
function ajustarFuente(ctx, texto, maxAncho, maxPx, fam) {
  let px = maxPx
  ctx.font = `${px}px ${fam}`
  while (px > 10 && ctx.measureText(texto).width > maxAncho) {
    px--
    ctx.font = `${px}px ${fam}`
  }
  return px
}

// ─── Canvas → raster 1-bit ───
function rasterDeLienzo(cv) {
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
  return { bytesPorFila, alto: H, raster }
}

// Envía a la M110 el trabajo de impresión de UN lienzo, replicando la secuencia
// probada de phomymo/phomemo-tools: comandos separados CON pausas (clave para que
// imprima). NO se manda ESC @ (0x1b 0x40): en la M110 estorba.
async function secuenciaImpresion(cv, opc = {}) {
  const { velocidad, densidad, papel } = { ...DEFAULTS, ...opc }
  const { bytesPorFila, alto, raster } = rasterDeLienzo(cv)

  await escribir(Uint8Array.of(0x1b, 0x4e, 0x0d, velocidad)); await sleep(30)  // velocidad (ESC N 0x0d)
  await escribir(Uint8Array.of(0x1b, 0x4e, 0x04, densidad));  await sleep(30)  // densidad (ESC N 0x04)
  await escribir(Uint8Array.of(0x1f, 0x11, papel));           await sleep(30)  // tipo de papel (0x0a = con gap)

  // Imagen raster (GS v 0), en bandas ≤200 líneas (margen bajo el límite de buffer ~240)
  const MAX = 200
  for (let y0 = 0; y0 < alto; y0 += MAX) {
    const h = Math.min(MAX, alto - y0)
    await escribir(Uint8Array.of(
      0x1d, 0x76, 0x30, 0x00,
      bytesPorFila & 0xff, (bytesPorFila >> 8) & 0xff,
      h & 0xff, (h >> 8) & 0xff,
    ))
    await escribir(raster.subarray(y0 * bytesPorFila, (y0 + h) * bytesPorFila))
  }

  await sleep(300)   // dar tiempo a la M110 antes de finalizar
  await escribir(Uint8Array.of(0x1f, 0xf0, 0x05, 0x00, 0x1f, 0xf0, 0x03, 0x00))  // pie: imprime y avanza
  await sleep(500)
}

// ─── Impresión ───
// Imprime UNA etiqueta. Hasta 2 intentos: si el GATT se cae, reconecta y reintenta
// (el trabajo se reenvía completo, es seguro).
export async function imprimirEtiqueta(datos, opc) {
  const cv = lienzoEtiqueta(datos)
  for (let intento = 0; intento < 2; intento++) {
    if (!conectada()) {
      const ok = await reconectar()
      if (!ok) throw new Error('La impresora no está conectada. Pulse "Conectar impresora".')
    }
    try { await secuenciaImpresion(cv, opc); return }
    catch (e) {
      if (intento === 1) throw e
      caracteristica = null   // fuerza reconexión
      await sleep(500)
    }
  }
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
