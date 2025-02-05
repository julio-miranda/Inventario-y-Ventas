const db = firebase.firestore();
const inventoryTable = document.getElementById('inventoryTable').getElementsByTagName('tbody')[0];

function loadInventory() {
  db.collection("productos").get().then((querySnapshot) => {
    inventoryTable.innerHTML = '';
    querySnapshot.forEach((doc) => {
      const product = doc.data();
      const row = inventoryTable.insertRow();
      row.innerHTML = `
                <td>${product.name}</td>
                <td>${product.quantity}</td>
                <td>${product.price}</td>
                <td>
                    <button onclick="editProduct('${doc.id}')" style="background-color:blue;">Editar</button>
                    <button onclick="deleteProduct('${doc.id}')" style="background-color:red;">Eliminar</button>
                </td>
            `;
    });
    initializeDataTable();
  });
}

function initializeDataTable() {
  if ($.fn.DataTable.isDataTable("#inventoryTable")) {
      $('#inventoryTable').DataTable().destroy();
  }
  $('#inventoryTable').DataTable({
      "paging": true,
      "searching": true,
      "ordering": true,
      "language": {
          "lengthMenu": "Mostrar _MENU_ registros",
          "zeroRecords": "No se encontraron resultados",
          "info": "Mostrando _START_ a _END_ de _TOTAL_ registros",
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

document.getElementById('productForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const name = document.getElementById('productName').value;
  const quantity = parseInt(document.getElementById('productQuantity').value);
  const price = parseFloat(document.getElementById('productPrice').value);

  db.collection("productos").where("name", "==", name).get().then(snapshot => {
    if (!snapshot.empty) {
      snapshot.forEach(doc => {
        let existingProduct = doc.data();
        let newQuantity = existingProduct.quantity + quantity;

        db.collection("productos").doc(doc.id).update({ quantity: newQuantity }).then(() => {
          loadInventory();
          hideAddProductForm();
        });
      });
    } else {
      db.collection("productos").add({ name, quantity, price }).then(() => {
        loadInventory();
        hideAddProductForm();
      });
    }
  });
});

// Editar producto
function editProduct(productId) {
  db.collection("productos").doc(productId).get().then((doc) => {
    let product = doc.data();
    document.getElementById('productId').value = productId;
    document.getElementById('productName').value = product.name;
    document.querySelector('.inventory').style.display = 'none';
    document.getElementById('productQuantity').value = product.quantity;
    document.getElementById('productPrice').value = product.price;

    document.getElementById('addProductForm').style.display = 'block';
    document.getElementById('formTitle').innerText = 'Actualizar Producto';
  });
}

// Eliminar producto
function deleteProduct(productId) {
  db.collection("productos").doc(productId).delete().then(() => {
    loadInventory();
  });
}

// Mostrar/Ocultar formulario
function showAddProductForm() {
  document.getElementById('addProductForm').style.display = 'block';
  document.querySelector('.inventory').style.display = 'none';
  document.getElementById('formTitle').innerText = 'Nuevo Producto';
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
}

function hideAddProductForm() {
  document.getElementById('addProductForm').style.display = 'none';
  document.querySelector('.inventory').style.display = 'block';
}

// Cargar inventario al inicio
loadInventory();

// Verificar si el usuario está autenticado
firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    // Redirigir al login si no está autenticado
    window.location.href = 'index.html';
  } else {
    //console.log('Usuario autenticado:', user);
  }
});