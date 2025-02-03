// assets/js/invoices.js
const { jsPDF } = window.jspdf; // Asegúrate de que jsPDF esté disponible globalmente
const db = firebase.firestore();
const saleSelect = document.getElementById('saleSelect');
const invoiceForm = document.getElementById('invoiceForm');
const invoiceTable = document.getElementById('invoiceTable').getElementsByTagName('tbody')[0];

// Cargar ventas en el selector para generar facturas
function loadSalesForInvoice() {
    db.collection("ventas").get().then((querySnapshot) => {
        saleSelect.innerHTML = '';  // Limpiar el selector antes de llenarlo
        querySnapshot.forEach((doc) => {
            const sale = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;  // Usamos el ID de la venta como valor
            option.textContent = `Venta #${doc.id} - $${sale.total}`;
            saleSelect.appendChild(option);
        });
    });
}

// Función para generar una factura
invoiceForm.addEventListener('submit', function (e) {
    e.preventDefault();

    const saleId = saleSelect.value;
    const customerName = document.getElementById('customerName').value;

    // Obtener la venta seleccionada
    db.collection("ventas").doc(saleId).get().then((doc) => {
        const sale = doc.data();
        const saleTotal = sale.total;

        // Obtener los detalles de los productos vendidos
        db.collection("ventas").doc(saleId).collection("productos").get().then((productosSnapshot) => {
            const saleDetails = [];
            productosSnapshot.forEach((productoDoc) => {
                const producto = productoDoc.data();
                saleDetails.push({
                    product: producto.nombre,
                    price: producto.precio,
                    quantity: producto.cantidad,
                    total: producto.precio * producto.cantidad
                });
            });

            // Generar el número de factura
            const invoiceNumber = `INV-${new Date().getTime()}`;

            // Registrar la factura en la colección de facturas
            db.collection("facturas").add({
                invoiceNumber: invoiceNumber,
                customerName: customerName,
                saleId: saleId,  // Este campo debe estar presente
                total: saleTotal,
                date: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                console.log("Factura registrada correctamente");
                db.collection("facturas").where("invoiceNumber", "==", invoiceNumber).get().then((querySnapshot) => {
                    querySnapshot.forEach((doc) => {
                        const invoice = doc.data();
                        generatePDF(invoiceNumber, customerName, saleTotal, saleDetails, new Date(invoice.date.seconds * 1000).toLocaleString());
                    });
                });
                loadInvoices();  // Recargar el historial de facturación
            }).catch((error) => {
                console.error("Error al registrar la factura: ", error);
            });
            console.log("Sale ID:", saleId);
        });
    });
});

// Función para generar PDF de la factura
function generatePDF(invoiceNumber, customerName, total, saleDetails, fecha) {
    const doc = new jsPDF();

    // Configuración de la fuente y tamaño
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Factura Electrónica", 20, 20);

    // Información de la factura
    doc.setFontSize(12);
    doc.text(`Factura #: ${invoiceNumber}`, 20, 40);
    doc.text(`Cliente: ${customerName}`, 20, 50);
    doc.text(`Fecha: ${fecha}`, 20, 60);
    doc.text(`Total: $${total}`, 20, 70);

    // Detalles de la venta (productos, cantidades, precios)
    doc.text("Detalles de la Venta", 20, 90);
    let y = 100;
    saleDetails.forEach(item => {
        doc.text(`${item.product} - $${item.price} x ${item.quantity} = $${item.total}`, 20, y);
        y += 10;
    });

    // Pie de página (Información de contacto de la empresa)
    doc.text("Gracias por su compra.", 20, y + 20);
    doc.text("www.empresa.com | contacto@empresa.com", 20, y + 30);

    // Descargar el archivo PDF
    doc.save(`${invoiceNumber}.pdf`);
}

// Cargar historial de facturación
function loadInvoices() {
    db.collection("facturas").orderBy("date", "desc").get().then((querySnapshot) => {
        invoiceTable.innerHTML = '';  // Limpiar la tabla de facturas
        querySnapshot.forEach((doc) => {
            const invoice = doc.data();
            const row = invoiceTable.insertRow();
            row.innerHTML = `
        <td>${invoice.invoiceNumber}</td>
        <td>${invoice.customerName}</td>
        <td>$${invoice.total}</td>
        <td>${new Date(invoice.date.seconds * 1000).toLocaleString()}</td>
        <td><button onclick="downloadInvoice('${invoice.invoiceNumber}')">Descargar</button></td>
      `;
        });
    });
}

// Descargar la factura en PDF
function downloadInvoice(invoiceNumber) {
    console.log("Buscando factura con número:", invoiceNumber);  // Verifica el valor de invoiceNumber

    // Realizamos una consulta para encontrar el documento con el invoiceNumber
    db.collection("facturas").where("invoiceNumber", "==", invoiceNumber).get()
    .then((querySnapshot) => {
        if (!querySnapshot.empty) {  // Verifica que haya resultados
            const invoice = querySnapshot.docs[0].data();  // Obtenemos el primer documento que coincida
            console.log(invoice);  // Verifica el contenido del documento

            // Verifica si existe el campo 'saleId'
            if (invoice.saleId) {
                // Obtener los detalles de los productos de la venta
                db.collection("ventas").doc(invoice.saleId).collection("productos").get().then((productosSnapshot) => {
                    const saleDetails = [];
                    productosSnapshot.forEach((productoDoc) => {
                        const producto = productoDoc.data();
                        saleDetails.push({
                            product: producto.nombre,
                            price: producto.precio,
                            quantity: producto.cantidad,
                            total: producto.precio * producto.cantidad
                        });
                    });

                    // Generar el PDF de la factura
                    generatePDF(invoice.invoiceNumber, invoice.customerName, invoice.total, saleDetails, new Date(invoice.date.seconds * 1000).toLocaleString());
                });
            } else {
                console.error('El campo saleId no está disponible en la factura');
            }
        } else {
            console.error('No se encontró la factura con el número:', invoiceNumber);
        }
    }).catch((error) => {
        console.error('Error al obtener la factura:', error);
    });
}

// Cargar las ventas y facturas al cargar la página
loadSalesForInvoice();
loadInvoices();
