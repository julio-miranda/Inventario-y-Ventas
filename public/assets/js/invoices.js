// assets/js/invoices.js
// Correcciones: uso de `firestore` en vez de redeclarar `db`,
// comprobaciones de dependencias (firebase/jsPDF), y protecciones DOM.

const jsPDFConstructor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF || null;
if (!jsPDFConstructor) {
  console.warn('jsPDF no disponible: las descargas de PDF no funcionarán hasta incluir la librería jsPDF.');
}

if (typeof firebase === 'undefined') {
  console.error('Firebase no encontrado. Asegúrate de cargar firebase antes de este script.');
}

const firestore = (typeof firebase !== 'undefined') ? firebase.firestore() : null;

const saleSelect = document.getElementById('saleSelect');
const invoiceForm = document.getElementById('invoiceForm');
const invoiceTableElem = document.getElementById('invoiceTable');
const invoiceTableBody = invoiceTableElem ? invoiceTableElem.getElementsByTagName('tbody')[0] : null;

// ---------- Utilidades ----------
function formatTimestamp(ts) {
  if (!ts) return '-';
  try {
    if (ts.toDate) return ts.toDate().toLocaleString();
    if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
    return new Date(ts).toLocaleString();
  } catch (err) {
    return String(ts);
  }
}

// ---------- Cargar ventas en el selector para generar facturas ----------
async function loadSalesForInvoice() {
  if (!saleSelect) return;
  if (!firestore) {
    saleSelect.innerHTML = '<option value="">Firestore no disponible</option>';
    return;
  }

  try {
    saleSelect.innerHTML = '<option value="">Cargando ventas...</option>';
    const snapshot = await firestore.collection("ventas").orderBy("date", "desc").get();
    saleSelect.innerHTML = '<option value="">-- Selecciona una venta --</option>';

    snapshot.forEach((doc) => {
      const sale = doc.data() || {};
      const option = document.createElement('option');
      option.value = doc.id;
      const total = (sale.total !== undefined) ? sale.total : 0;
      option.textContent = `Venta #${doc.id} - $${total}`;
      saleSelect.appendChild(option);
    });

    if (saleSelect.options.length <= 1) {
      saleSelect.innerHTML = '<option value="">No hay ventas disponibles</option>';
    }
  } catch (error) {
    console.error("Error al cargar ventas:", error);
    saleSelect.innerHTML = '<option value="">Error cargando ventas</option>';
  }
}

// ---------- Generar PDF de la factura ----------
function generatePDF(invoiceNumber, customerName, total, saleDetails, fecha) {
  if (!jsPDFConstructor) {
    alert('No se puede generar PDF: falta jsPDF. Revisa la consola.');
    return;
  }

  const doc = new jsPDFConstructor();

  doc.setFontSize(18);
  // Intento de usar tipografía segura
  try { doc.setFont("helvetica", "bold"); } catch (e) { /* ignore */ }
  doc.text("Factura Electrónica", 20, 20);

  doc.setFontSize(11);
  try { doc.setFont("helvetica", "normal"); } catch (e) { /* ignore */ }
  doc.text(`Factura #: ${invoiceNumber}`, 20, 36);
  doc.text(`Cliente: ${customerName}`, 20, 44);
  doc.text(`Fecha: ${fecha || new Date().toLocaleString()}`, 20, 52);
  doc.text(`Total: $${total}`, 20, 60);

  doc.setFontSize(12);
  doc.text("Detalles de la Venta", 20, 76);
  let y = 84;
  saleDetails.forEach(item => {
    const line = `${item.product} — $${item.price} x ${item.quantity} = $${item.total}`;
    doc.text(line, 20, y);
    y += 8;
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  });

  doc.setFontSize(10);
  doc.text("Gracias por su compra.", 20, y + 18);
  doc.text("www.empresa.com | contacto@empresa.com", 20, y + 26);

  doc.save(`${invoiceNumber}.pdf`);
}

// ---------- Registrar factura (submit) ----------
if (invoiceForm) {
  invoiceForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const saleId = saleSelect ? saleSelect.value : '';
    const customerName = document.getElementById('customerName') ? document.getElementById('customerName').value?.trim() : '';

    if (!saleId) {
      alert('Selecciona una venta válida antes de generar la factura.');
      return;
    }
    if (!customerName) {
      alert('Ingresa el nombre del cliente.');
      return;
    }
    if (!firestore) {
      alert('No es posible generar factura: Firestore no está disponible.');
      return;
    }

    try {
      const saleDoc = await firestore.collection("ventas").doc(saleId).get();
      if (!saleDoc.exists) {
        alert('Venta no encontrada. Refresca la página y vuelve a intentarlo.');
        return;
      }
      const sale = saleDoc.data() || {};
      const saleTotal = (sale.total !== undefined) ? sale.total : 0;

      const productosSnapshot = await firestore.collection("ventas").doc(saleId).collection("productos").get();
      const saleDetails = [];
      productosSnapshot.forEach((productoDoc) => {
        const producto = productoDoc.data() || {};
        saleDetails.push({
          product: producto.nombre || 'Producto',
          price: producto.precio || 0,
          quantity: producto.cantidad || 0,
          total: (producto.precio || 0) * (producto.cantidad || 0)
        });
      });

      const invoiceNumber = `INV-${new Date().getTime()}`;

      await firestore.collection("facturas").add({
        invoiceNumber: invoiceNumber,
        customerName: customerName,
        saleId: saleId,
        total: saleTotal,
        date: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log("Factura registrada correctamente:", invoiceNumber);

      const fechaString = new Date().toLocaleString();
      generatePDF(invoiceNumber, customerName, saleTotal, saleDetails, fechaString);

      // Refrescar historial (si existe función)
      loadInvoices();

      invoiceForm.reset();
      if (saleSelect) saleSelect.selectedIndex = 0;

      /* 
         Envío por email DESACTIVADO (comentado). Mantener como referencia.
         Si lo activas, descomenta y configura emailjs/init...
      */

    } catch (err) {
      console.error("Error generando la factura:", err);
      alert('Ocurrió un error al generar la factura. Revisa la consola para más detalles.');
    }
  });
}

// ---------- Cargar historial de facturación ----------
async function loadInvoices() {
  if (!invoiceTableBody) return;
  if (!firestore) {
    invoiceTableBody.innerHTML = '<tr><td colspan="5">Firestore no disponible</td></tr>';
    return;
  }

  try {
    invoiceTableBody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
    const snapshot = await firestore.collection("facturas").orderBy("date", "desc").get();
    invoiceTableBody.innerHTML = '';

    if (snapshot.empty) {
      invoiceTableBody.innerHTML = '<tr><td colspan="5">No hay facturas registradas.</td></tr>';
      return;
    }

    snapshot.forEach((doc) => {
      const invoice = doc.data() || {};
      const fechaTexto = formatTimestamp(invoice.date);

      const tr = invoiceTableBody.insertRow();
      tr.innerHTML = `
        <td>${invoice.invoiceNumber || '-'}</td>
        <td>${invoice.customerName || '-'}</td>
        <td>$${(invoice.total !== undefined) ? invoice.total : '0'}</td>
        <td>${fechaTexto}</td>
        <td>
          <button class="action-btn" data-inv="${invoice.invoiceNumber || ''}" data-action="download">Descargar</button>
          <button class="action-btn" disabled title="Envío por email desactivado">Enviar</button>
        </td>
      `;
    });

    invoiceTableBody.querySelectorAll('button[data-action="download"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const invNumber = e.currentTarget.getAttribute('data-inv');
        if (invNumber) downloadInvoice(invNumber);
      });
    });

  } catch (err) {
    console.error('Error cargando facturas:', err);
    invoiceTableBody.innerHTML = '<tr><td colspan="5">Error cargando facturas</td></tr>';
  }
}

// ---------- Descargar la factura en PDF (por número) ----------
async function downloadInvoice(invoiceNumber) {
  if (!firestore) {
    alert('No es posible descargar la factura: Firestore no disponible.');
    return;
  }

  try {
    console.log("Buscando factura con número:", invoiceNumber);
    const querySnapshot = await firestore.collection("facturas").where("invoiceNumber", "==", invoiceNumber).get();
    if (querySnapshot.empty) {
      console.error('No se encontró la factura con el número:', invoiceNumber);
      alert('Factura no encontrada.');
      return;
    }

    const invoiceDoc = querySnapshot.docs[0];
    const invoice = invoiceDoc.data() || {};

    if (!invoice.saleId) {
      console.error('El campo saleId no está disponible en la factura');
      alert('Factura incompleta: falta referencia a la venta.');
      return;
    }

    const productosSnapshot = await firestore.collection("ventas").doc(invoice.saleId).collection("productos").get();
    const saleDetails = [];
    productosSnapshot.forEach((productoDoc) => {
      const producto = productoDoc.data() || {};
      saleDetails.push({
        product: producto.nombre || 'Producto',
        price: producto.precio || 0,
        quantity: producto.cantidad || 0,
        total: (producto.precio || 0) * (producto.cantidad || 0)
      });
    });

    const fechaTexto = formatTimestamp(invoice.date);
    generatePDF(invoice.invoiceNumber, invoice.customerName, invoice.total, saleDetails, fechaTexto);

  } catch (err) {
    console.error('Error al obtener la factura:', err);
    alert('Error al descargar la factura. Revisa la consola.');
  }
}

// Inicialización (si la página tiene los elementos)
if (saleSelect) loadSalesForInvoice();
if (invoiceTableBody) loadInvoices();