/* assets/js/chart-utils.js
Utilidades para gráficos del dashboard

* Mantiene compatibilidad con el uso anterior.
* Si se pasa el monto de gastos, muestra un gráfico financiero con:
  Ventas, Gastos y Neto.
* Si no se pasan gastos, conserva el comportamiento clásico de:
  Ventas realizadas vs ventas restantes.
  */

(function () {
  function numberOrZero(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numberOrZero(value));
  }

  function destroyExistingChart() {
    if (window.salesChart instanceof Chart) {
      window.salesChart.destroy();
      window.salesChart = null;
    }
  }

  /*
  Uso compatible:
  - drawSalesChart('salesChart', totalVentas, remaining)
  => gráfico clásico: Ventas Realizadas / Ventas Restantes
  
  
  Nuevo uso:
  - drawSalesChart('salesChart', totalVentas, salesGoalOrRemaining, totalExpenses)
    => gráfico financiero: Ventas / Gastos / Neto
  
  
  */
  function drawSalesChart(ctxElementId, salesData, salesGoalOrRemaining, expensesData = null) {
    const canvas = document.getElementById(ctxElementId);


    if (!canvas) {
      console.warn(`No se encontró el canvas con id "${ctxElementId}".`);
      return;
    }

    const ctx = canvas.getContext('2d');
    destroyExistingChart();

    const sales = numberOrZero(salesData);

    if (expensesData !== null && expensesData !== undefined) {
      const expenses = Math.max(0, numberOrZero(expensesData));
      const net = sales - expenses;

      window.salesChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Ventas', 'Gastos', 'Neto'],
          datasets: [{
            label: 'Resumen financiero',
            data: [sales, expenses, net],
            backgroundColor: ['#16a34a', '#ef4444', '#2563eb'],
            borderColor: ['#16a34a', '#ef4444', '#2563eb'],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  return ` ${formatCurrency(context.parsed.y)} `;
                }
              }
            }
          }
        }
      });

      return;
    }

    const salesGoal = numberOrZero(salesGoalOrRemaining);
    const remaining = Math.max(0, salesGoal - sales);

    window.salesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Ventas Realizadas', 'Ventas Restantes'],
        datasets: [{
          label: 'Proyección de Ventas',
          data: [sales, remaining],
          backgroundColor: ['#4CAF50', '#FF8A65'],
          borderColor: ['#4CAF50', '#FF8A65'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                return ` ${formatCurrency(context.parsed.y)} `;
              }
            }
          }
        }
      }
    });


  }

  window.appChartUtils = {
    drawSalesChart,
    formatCurrency
  };
})();