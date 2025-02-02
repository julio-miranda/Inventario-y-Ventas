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

function getSalesData(salesGoal) {
  const db = firebase.firestore();
  db.collection("ventas").get().then((querySnapshot) => {
      let totalSales = 0;
      querySnapshot.forEach((doc) => {
          totalSales += doc.data().total;
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
    .where("date", ">=", startOfMonth)  // Asegúrate de tener un campo `date` en cada venta
    .get()
    .then((querySnapshot) => {
      salesTableBody.innerHTML = '';  // Limpiar la tabla antes de llenarla
      
      querySnapshot.forEach((doc) => {
        const sale = doc.data();
        const saleDate = new Date(sale.date.seconds * 1000);  // Convierte la fecha Firestore a Date
        const row = salesTableBody.insertRow();
        row.innerHTML = `
          <td>${sale.customerName}</td>
          <td>$${sale.total}</td>
          <td>${saleDate.toLocaleDateString()}</td>
        `;
      });
    })
    .catch((error) => {
      console.error("Error al cargar las ventas del mes: ", error);
    });
}

// Cargar las ventas al cargar el dashboard
loadSalesOfTheMonth();