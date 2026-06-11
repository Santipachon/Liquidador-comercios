# 📖 Manual de la plataforma — base de conocimiento del asistente

> Documentación en lenguaje sencillo de CADA función. La consulta el asistente virtual
> (la burbuja flotante) para responder cualquier duda del usuario.
> **REGLA: cada vez que se añade o cambia una función, se actualiza aquí.**
> Tono: explicar como a una persona que nunca ha usado un computador. Nada de tecnicismos.

---

## ¿Qué es esta plataforma?
Es el sistema del Almacén El Acero para: anotar lo que piden los clientes, hacer pedidos a
los proveedores, liquidar las facturas (calcular a cómo se vende cada producto) y ver
reportes del negocio. Se usa desde el navegador (Chrome) en computador o celular.

---

## Entrar (inicio de sesión)
- **¿Cómo entro?** En la pantalla de inicio toque su nombre y escriba su PIN de 4 números.
- **¿Cuál es mi PIN?** Nayibe y cada empleado tienen el suyo. Si no lo recuerda, pregúntele a Nayibe.
- **Me equivoqué de usuario:** toque "Cambiar usuario" y elija de nuevo.
- **Salir:** botón "Salir ✕" arriba a la derecha.

## Pantalla de inicio
Son botones grandes, uno por cada tarea: *Lo que pide la gente, Catálogo, Pedidos, Créditos,
Liquidar factura, Reportes*. Toque el de la tarea que va a hacer. Arriba aparece un aviso rojo
si hay créditos por vencer.

## Lo que pide la gente (Pendientes)
- **¿Para qué sirve?** Para anotar lo que un cliente pide y no hay en el momento, y así pedirlo
  después y avisarle cuando llegue. Reemplaza el cuaderno.
- **¿Cómo anoto un pedido de un cliente?** Toque el recuadro "Cliente pidió…", escriba el
  producto (puede escribir palabras sueltas, ej: "cuña 8"), elíjalo de la lista o use el texto
  tal cual; ponga la cantidad y, si quiere avisarle, el nombre y teléfono del cliente. Toque
  "Agregar pendiente".
- **Los estados:** 🟡 Pendiente (falta pedirlo) → 🔵 Pedido (ya se pidió al proveedor) →
  🟢 Llegó (¡hay que avisarle al cliente!) → 🟣 Avisado. Se cambian con los botones de cada fila.
- **La lista está muy larga:** use el buscador, o los botones de arriba (Activos esconde los ya
  atendidos), o filtre por proveedor.
- **¿Borré algo sin querer?** Al borrar pide confirmación. Si ya pasó, vuelva a anotarlo.

## Catálogo de productos
- **¿Qué es?** La lista de todos los productos que han entrado por las facturas. Se llena solo.
- **Buscar:** escriba nombre, código o medida (palabras sueltas). Se ordena por relevancia.
- **Ver un producto:** tóquelo para ver su historial de precios (gráfica) y cuántas unidades
  han llegado.

## Pedidos a proveedores
- **¿Para qué?** Para armar el comprobante de un pedido y mandárselo al proveedor en PDF.
- **¿Cómo hago un pedido?** Verá tarjetas con cuántos pendientes tiene cada proveedor. Toque la
  del proveedor → revise los productos (el código y el costo salen solos) → en "Condiciones"
  elija si es de contado o a crédito → toque "Generar comprobante PDF".
- **Pedido en blanco:** botón para un proveedor sin pendientes.
- **Datos del almacén:** abajo se editan (nombre, NIT, dirección) — salen en el encabezado del PDF.

## Créditos
- **¿Para qué?** Lleva el control de los pedidos a crédito y avisa antes de que venzan.
- **Marcar pagado:** toque "Marcar pagado", ponga la fecha y **adjunte el comprobante de pago**
  (obligatorio). Pasa a la lista de pagados.
- **Aviso de vencimiento:** los que vencen pronto salen en amarillo; los vencidos, en rojo; y
  aparece un aviso en la pantalla de inicio.

## Liquidar factura
- **📥 Facturas por liquidar (la bandeja):** Arriba de todo hay una lista azul con las facturas
  que están esperando. Cada una muestra el proveedor, el número, el NIT y cuándo llegó. Toque
  **"Liquidar →"** en una para cargarla y trabajarla; al terminar sale de la bandeja sola. Con
  **"➕ Agregar facturas"** puede meter varias de una vez (XML o ZIP). Más adelante estas
  facturas llegarán solas desde el correo del almacén, sin tener que buscarlas ni descargarlas.
- **¿Para qué (subir manual)?** Sube la factura electrónica del proveedor (XML o ZIP) y calcula a cómo vender
  cada producto, con su código en letras y sus etiquetas.
- **¿Cómo?** Toque "Subir factura" y elija el archivo. Aparecen los productos. Ajuste el margen
  (% de ganancia), el redondeo y cuántas etiquetas imprimir. Toque "Imprimir / Excel" para bajar
  el Excel, y "Guardar en historial" para que quede en el sistema.
- **El margen a todos:** escriba un % y toque "% Margen a todos".
- **Redondeo:** "Auto" sube el precio a una cifra cómoda según el valor (ej: 470 → 500).
- **Etiquetas:** cuántas veces se imprime cada producto. Los tornillos/tuercas salen en rojo
  porque normalmente no se imprime una etiqueta por unidad.
- **El código de proveedor (sigla):** se asigna solo según el NIT de la factura; si no lo
  reconoce, lo escribe usted en el resumen.

## Reportes
Muestra: total invertido, ganancia potencial, lo más pedido por los clientes, qué productos
subieron de precio, cuánto sube cada proveedor, productos sin resurtir hace rato, compras por
mes y clientes por avisar. Sirve para tomar decisiones (qué surtir, con quién negociar).

---

## Preguntas frecuentes
- **¿Se pierde la información si cierro?** No, queda guardada. (Próximamente en la nube para
  verla desde varios equipos.)
- **¿Funciona sin internet?** La app abre sin internet, pero para guardar en la nube y usar el
  asistente sí se necesita.
- **¿Me equivoqué en algo, lo daño?** No fácilmente: las acciones que borran piden confirmación
  y casi todo se puede corregir. Ante la duda, pregúnteme.
