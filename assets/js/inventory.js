// assets/js/inventory.js

const db = firebase.firestore();
const inventoryTable = document.getElementById('inventoryTable').getElementsByTagName('tbody')[0];

// Función para mostrar los productos en la tabla
function loadInventory() {
  db.collection("productos").get().then((querySnapshot) => {
    inventoryTable.innerHTML = '';  // Limpiar la tabla antes de llenarla
    querySnapshot.forEach((doc) => {
      const product = doc.data();
      const row = inventoryTable.insertRow();
      row.innerHTML = `
        <td>${product.name}</td>
        <td>${product.quantity}</td>
        <td>${product.price}</td>
        <td>
          <button onclick="editProduct('${doc.id}')">Editar</button>
          <button onclick="deleteProduct('${doc.id}')">Eliminar</button>
        </td>
      `;
    });
  });
}

// Función para eliminar un producto
function deleteProduct(productId) {
  db.collection("productos").doc(productId).delete().then(() => {
    loadInventory();  // Recargar el inventario después de eliminar el producto
  });
}

// Función para mostrar el formulario de añadir o editar producto
function showAddProductForm() {
  document.getElementById('addProductForm').style.display = 'block';
  document.getElementById('formTitle').innerText = 'Nuevo Producto';
  document.getElementById('productForm').reset();  // Limpiar el formulario
  document.getElementById('productId').value = '';  // Limpiar el campo de ID
}

// Función para ocultar el formulario
function hideAddProductForm() {
  document.getElementById('addProductForm').style.display = 'none';
}

// Función para manejar el formulario de añadir o actualizar producto
document.getElementById('productForm').addEventListener('submit', function(e) {
  e.preventDefault();

  const productId = document.getElementById('productId').value;
  const name = document.getElementById('productName').value;
  const quantity = parseInt(document.getElementById('productQuantity').value);
  const price = parseFloat(document.getElementById('productPrice').value);

  if (productId) {
    // Si hay un ID, estamos actualizando el producto
    db.collection("productos").doc(productId).update({
      name: name,
      quantity: quantity,
      price: price
    }).then(() => {
      loadInventory();  // Recargar inventario después de actualizar el producto
      hideAddProductForm();  // Ocultar el formulario
    });
  } else {
    // Si no hay ID, estamos añadiendo un nuevo producto
    db.collection("productos").add({
      name: name,
      quantity: quantity,
      price: price
    }).then(() => {
      loadInventory();  // Recargar inventario después de añadir un producto
      hideAddProductForm();  // Ocultar el formulario
    });
  }
});

// Función para editar un producto
function editProduct(productId) {
  db.collection("productos").doc(productId).get().then((doc) => {
    const product = doc.data();
    
    // Rellenar el formulario con los datos del producto
    document.getElementById('productId').value = productId;
    document.getElementById('productName').value = product.name;
    document.getElementById('productQuantity').value = product.quantity;
    document.getElementById('productPrice').value = product.price;
    
    // Mostrar el formulario con los datos del producto
    document.getElementById('addProductForm').style.display = 'block';
    document.getElementById('formTitle').innerText = 'Actualizar Producto';
  });
}

// Cargar los productos cuando se carga la página
loadInventory();