const { jsPDF } = window.jspdf;
const db = firebase.firestore();
const saleSelect = document.getElementById('saleSelect');
const invoiceForm = document.getElementById('invoiceForm');
const invoiceTable = document.getElementById('invoiceTable').getElementsByTagName('tbody')[0];

// 🔹 Cargar ventas disponibles para facturación
function loadSalesForInvoice() {
    db.collection("ventas").get().then((querySnapshot) => {
        saleSelect.innerHTML = '';
        document.getElementById("customerName").value = "";
        document.getElementById("customerEmail").value = "";

        db.collection("facturas").get().then((facturasSnapshot) => {
            const facturadas = facturasSnapshot.docs.map(factura => factura.data().saleId);

            querySnapshot.forEach((doc) => {
                if (!facturadas.includes(doc.id)) {
                    const sale = doc.data();
                    const option = document.createElement('option');
                    option.value = doc.id;
                    option.textContent = `Venta #${doc.id} - $${sale.total}`;
                    saleSelect.appendChild(option);
                }
            });
        });
    });
}

// 🔹 Generar y registrar la factura
invoiceForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const customerName = document.getElementById("customerName").value;
    const customerEmail = document.getElementById("customerEmail").value;
    const saleId = saleSelect.value;
    let saleData = "";
    let invoiceNumber = "";

    if (!customerEmail) {
        alert("Por favor, ingrese el correo del cliente.");
        return;
    }

    try {
        const saleDoc = await db.collection("ventas").doc(saleId).get();
        if (!saleDoc.exists) throw new Error("Venta no encontrada");

        saleData = saleDoc.data();
        invoiceNumber = `INV-${Date.now()}`;

        // 🔹 Guardar factura en Firestore
        await db.collection('facturas').add({
            invoiceNumber,
            customerName,
            customerEmail,
            total: saleData.total,
            saleId,
            date: saleDoc.data().date
        });
        // 🔹 Generar PDF y enviarlo por correo
        generateAndSendInvoicePDF(invoiceNumber, customerName, customerEmail, saleData.total, new Date(saleDoc.data().date.seconds * 1000).toLocaleString("es-ES"));

    } catch (error) {
        console.error("Error al generar o enviar la factura:", error);
        alert("Hubo un problema al generar o enviar la factura.");
    }
});

// 🔹 Generar el PDF y enviarlo por correo
function generateAndSendInvoicePDF(invoiceNumber, customerName, customerEmail, total, date) {
    const invoiceElement = document.getElementById("invoice-pdf");

    // Llenar los datos en la factura antes de hacer la captura
    document.getElementById("span").innerText = invoiceNumber;
    document.getElementById("pdf-client-name").innerText = customerName;
    document.getElementById("pdf-client-email").innerText = customerEmail;
    document.getElementById("pdf-total").innerText = `$${total}`;
    document.getElementById("pdf-total2").innerText = `$${total}`;
    document.getElementById("pdf-date").innerText = date.split(",")[0];

    // Asegurar que la factura es visible temporalmente
    invoiceElement.style.display = "block";

    setTimeout(() => {
        html2canvas(invoiceElement, {
            scale: 3, // Mejor resolución
            useCORS: true, // Permite cargar imágenes externas
            allowTaint: true, // Permite imágenes de diferentes dominios
            logging: false
        }).then(canvas => {
            const imgData = canvas.toDataURL("image/png");

            const pdf = new jsPDF("p", "mm", "a4");
            const imgWidth = 210;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
            pdf.save(`Factura-${invoiceNumber}.pdf`);

            // Convertir PDF a Base64 para enviar por EmailJS
            const pdfBase64 = pdf.output("datauristring").split(",")[1];

            // Enviar el email con la factura adjunta
            emailjs.send("service_hbt9app", "template_2wmhlc3", {
                from_Fact: invoiceNumber,
                to_email: customerEmail,
                from_name: customerName,
                totalf: total,
                datef: date.split(",")[0]
            }).then(() => {
                alert("Factura generada y enviada al correo del cliente.");
                window.location.href = 'invoices.html';
            }).catch(error => {
                console.error("Error al enviar el correo:", error);
            });
            // Ocultar la factura después de capturarla
            invoiceElement.style.display = "none";
        }).catch(error => {
            console.error("Error al generar la imagen de la factura:", error);
            alert("Hubo un problema al generar la factura en PDF.");
            invoiceElement.style.display = "none"; // Asegurar que se oculta
        });
    }, 500); // Espera 500ms para que se renderice antes de capturar
}

function generatePDF(invoiceNumber, customerName, customerEmail, total, date) {
    const invoiceElement = document.getElementById("invoice-pdf");

    // Llenar los datos en la factura antes de hacer la captura
    document.getElementById("span").innerText = invoiceNumber;
    document.getElementById("pdf-client-name").innerText = customerName;
    document.getElementById("pdf-client-email").innerText = customerEmail;
    document.getElementById("pdf-total").innerText = `$${total}`;
    document.getElementById("pdf-total2").innerText = `$${total}`;
    document.getElementById("pdf-date").innerText = date.split(",")[0];

    // Asegurar que la factura es visible temporalmente
    invoiceElement.style.display = "block";

    setTimeout(() => {
        html2canvas(invoiceElement, {
            scale: 3, // Mejor resolución
            useCORS: true, // Permite cargar imágenes externas
            allowTaint: true, // Permite imágenes de diferentes dominios
            logging: false
        }).then(canvas => {
            const imgData = canvas.toDataURL("image/png");

            const pdf = new jsPDF("p", "mm", "a4");
            const imgWidth = 210;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
            pdf.save(`Factura-${invoiceNumber}.pdf`);

            // Ocultar la factura después de capturarla
            invoiceElement.style.display = "none";
        }).catch(error => {
            console.error("Error al generar la imagen de la factura:", error);
            alert("Hubo un problema al generar la factura en PDF.");
            invoiceElement.style.display = "none"; // Asegurar que se oculta
        });
    }, 500); // Espera 500ms para que se renderice antes de capturar
}

// 🔹 Cargar historial de facturación
function loadInvoices() {
    db.collection("facturas").orderBy("date", "desc").get().then((querySnapshot) => {
        invoiceTable.innerHTML = '';

        querySnapshot.forEach((doc) => {
            const invoice = doc.data();
            const row = invoiceTable.insertRow();
            row.innerHTML = `
                <td>${invoice.invoiceNumber}</td>
                <td>${invoice.customerName}</td>
                <td>$${invoice.total}</td>
                <td>${new Date(invoice.date.seconds * 1000).toLocaleString("es-ES")}</td>
                <td><button onclick="downloadInvoice('${invoice.invoiceNumber}')">Descargar</button></td>
            `;
        });

        initializeDataTable();
    });
}

// 🔹 Descargar factura en PDF
function downloadInvoice(invoiceNumber) {
    db.collection("facturas").where("invoiceNumber", "==", invoiceNumber).get()
        .then(querySnapshot => {
            if (!querySnapshot.empty) {
                const invoice = querySnapshot.docs[0].data();
                if (invoice.saleId) {
                    db.collection("ventas").doc(invoice.saleId).collection("productos").get()
                        .then(productosSnapshot => {
                            const saleDetails = productosSnapshot.docs.map(doc => doc.data());
                            generatePDF(invoice.invoiceNumber, invoice.customerName, invoice.customerEmail, invoice.total, invoice.date);
                        });
                } else {
                    console.error('El campo saleId no está disponible en la factura');
                }
            } else {
                console.error('No se encontró la factura con el número:', invoiceNumber);
            }
        }).catch(error => {
            console.error('Error al obtener la factura:', error);
        });
}

// 🔹 Inicializar DataTable para la tabla de facturas
function initializeDataTable() {
    if ($.fn.DataTable.isDataTable("#invoiceTable")) {
        $('#invoiceTable').DataTable().destroy();
    }
    $('#invoiceTable').DataTable({
        scrollX: true,
        destroy: true,
        Response: true,
        autoWidth: false,
        "paging": true,
        "searching": true,
        "ordering": true,
        "language": {
            "lengthMenu": "Mostrar _MENU_ registros",
            "zeroRecords": "No se encontraron resultados",
            "info": "Mostrando _START_ a _END_ de _TOTAL_ registros",
            "infoFiltered": "(filtrado de _MAX_ total)",
            "search": "Buscar:",
            "paginate": {
                "next": "Siguiente",
                "previous": "Anterior"
            }
        }
    });
}

// 🔹 Verificar autenticación y cargar datos iniciales
firebase.auth().onAuthStateChanged(user => {
    if (!user) window.location.href = 'index.html';
});

loadSalesForInvoice();
loadInvoices();