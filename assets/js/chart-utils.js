// assets/js/chart-utils.js
function drawSalesChart(salesData, salesGoal) {
  const ctx = document.getElementById('salesChart').getContext('2d');

  // Verifica si window.salesChart ya está definido antes de destruirlo
  if (window.salesChart instanceof Chart) {
    window.salesChart.destroy();
  }

  window.salesChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Ventas Realizadas', 'Ventas Restantes'],
      datasets: [{
        label: 'Proyección de Ventas',
        data: [salesData, Math.max(0, salesGoal - salesData)],
        backgroundColor: ['#4CAF50', '#FF5733'],
        borderColor: ['#4CAF50', '#FF5733'],
        borderWidth: 1,
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

function updateSalesGoal() {
  const newGoal = parseInt(document.getElementById('salesGoal').value) || 0;
  getSalesData(newGoal);
}

function getFirestoreTimestamp(date) {
  return firebase.firestore.Timestamp.fromDate(date);
}

function getSalesData(salesGoal) {
  const db = firebase.firestore();

  // Usar la colección "facturas" en lugar de "ventas"
  db.collection("facturas").onSnapshot((snapshot) => {
    let totalSales = 0;

    snapshot.forEach((doc) => {
      totalSales += doc.data().total; // Sumar el total de la factura
    });

    drawSalesChart(totalSales, salesGoal);
  });
}

// Obtener datos iniciales
const initialGoal = parseInt(document.getElementById('salesGoal').value) || 1000;
getSalesData(initialGoal);

// Función para cargar las ventas del mes
function loadSalesOfTheMonth() {
  const db = firebase.firestore();
  const salesTableBody = document.getElementById('salesTable').getElementsByTagName('tbody')[0];

  // Obtener la fecha actual y el primer día del mes
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  // Consulta para obtener las ventas del mes
  db.collection("facturas")
    .where("date", ">=", getFirestoreTimestamp(startOfMonth))
    .get()
    .then((querySnapshot) => {
      salesTableBody.innerHTML = '';

      querySnapshot.forEach((doc) => {
        const sale = doc.data();
        if (!sale.date || !sale.date.seconds) {
          console.error("Fecha inválida en documento:", doc.id, sale);
          return;
        }
        const saleDate = new Date(sale.date.seconds * 1000);
        const row = salesTableBody.insertRow();
        row.innerHTML = `
        <td>${sale.customerName}</td>
        <td>$${sale.total}</td>
        <td>${saleDate.toLocaleDateString("es-ES")}</td>
      `;
      });
      initializeDataTable();
    })
    .catch((error) => {
      console.error("Error al cargar las ventas del mes: ", error);
    });
}

function initializeDataTable() {
  if ($.fn.DataTable.isDataTable("#salesTable")) {
    $('#salesTable').DataTable().destroy();
  }
  $('#salesTable').DataTable({
    scrollX: true,
    destroy: true,
    "paging": true,
    "searching": true,
    "ordering": true,
    "language": {
      "lengthMenu": "Mostrar _MENU_ registros",
      "zeroRecords": "No se encontraron resultados",
      "info": "Mostrando _START_ a _END_ de _TOTAL_ productos",
      "infoFiltered": "(filtrado de _MAX_ total)",
      "search": "Buscar:",
      paginate: {
        first: "Primero",
        last: "Último",
        next: "Siguiente",
        previous: "Anterior"
      }
    }
  });
}

function formatDate(fecha) {
  const opciones = {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short"
  };

  return fecha.toLocaleDateString("es-ES", opciones);
}

// Cargar las ventas al cargar el dashboard
loadSalesOfTheMonth();
// Verificar si el usuario está autenticado
firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    // Redirigir al login si no está autenticado
    window.location.href = 'index.html';
  } else {
    //console.log('Usuario autenticado:', user);
  }
});