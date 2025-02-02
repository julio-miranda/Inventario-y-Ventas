// assets/js/sales.js
const db = firebase.firestore();
const productSelect = document.getElementById('productSelect');
const saleForm = document.getElementById('saleForm');
const salesTable = document.getElementById('salesTable').getElementsByTagName('tbody')[0];
productName = "";

// Cargar productos en el selector para registrar ventas
function loadProducts() {
  db.collection("productos").get().then((querySnapshot) => {
    productSelect.innerHTML = '';  // Limpiar el selector antes de llenarlo
    querySnapshot.forEach((doc) => {
      const product = doc.data();
      const option = document.createElement('option');
      option.value = doc.id;  // Usamos el ID del producto como valor
      option.textContent = `${product.name} - $${product.price}`;
      productSelect.appendChild(option);
    });
  });
}

// Función para registrar una venta
saleForm.addEventListener('submit', function(e) {
  e.preventDefault();

  const productId = productSelect.value;
  const saleQuantity = parseInt(document.getElementById('saleQuantity').value);

  // Obtener datos del producto
  db.collection("productos").doc(productId).get().then((doc) => {
    const product = doc.data();
    productName = product.name;
    const productPrice = product.price;
    const productStock = product.quantity;

    // Verificar que haya suficiente stock
    if (saleQuantity > productStock) {
      alert('No hay suficiente stock para esta venta.');
      return;
    }

    // Calcular el total de la venta
    const totalSale = saleQuantity * productPrice;

    // Registrar la venta en la colección de ventas
    db.collection("ventas").add({
      productId: productId,
      productName: productName,
      quantity: saleQuantity,
      total: totalSale,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      // Actualizar el inventario
      db.collection("productos").doc(productId).update({
        quantity: productStock - saleQuantity
      }).then(() => {
        loadSales();  // Recargar la lista de ventas
        loadProducts();  // Recargar los productos disponibles
      });
    });
  });
});

// Cargar ventas realizadas
function loadSales() {
  db.collection("ventas").orderBy("timestamp", "desc").get().then((querySnapshot) => {
    salesTable.innerHTML = '';  // Limpiar la tabla de ventas
    querySnapshot.forEach((doc) => {
      const sale = doc.data();
      const row = salesTable.insertRow();
      row.innerHTML = `
        <td>${sale.productName}</td>
        <td>${sale.quantity}</td>
        <td>$${sale.total}</td>
      `;
    });
  });
}

// Cargar los productos y las ventas al cargar la página
loadProducts();
loadSales();