const db = firebase.firestore();
const auth = firebase.auth();

const employeeSearch = document.getElementById('employeeSearch');
const employeeTableBody = document.getElementById('employeeTableBody');
const addEmployeeButton = document.getElementById('addEmployeeButton');
const newEmployeeForm = document.getElementById('newEmployeeForm');
const saveEmployeeButton = document.getElementById('saveEmployeeButton');
const cancelButton = document.getElementById('cancelButton');
const newEmployeeName = document.getElementById('newEmployeeName');
const newEmployeePosition = document.getElementById('newEmployeePosition');
const newEmployeePhone = document.getElementById('newEmployeePhone');
const newEmployeeEmail = document.getElementById('newEmployeeEmail');
const newEmployeePassword = document.getElementById('newEmployeePassword');

// Función para cargar empleados desde Firestore
function loadEmployees() {
    db.collection("empleados").get().then((querySnapshot) => {
        employeeTableBody.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const employee = doc.data();
            const row = employeeTableBody.insertRow();
            const nameCell = row.insertCell(0);
            const positionCell = row.insertCell(1);
            const phoneCell = row.insertCell(2);
            const actionsCell = row.insertCell(3);

            nameCell.textContent = employee.name;
            positionCell.textContent = employee.position;
            phoneCell.textContent = employee.phone;
            actionsCell.innerHTML = `
                <button class="editButton" data-id="${doc.id}" style="background-color:blue;">Editar</button>
                <button class="deleteButton" data-id="${doc.id}" style="background-color:red;">Eliminar</button>
            `;
        });
        initializeDataTable();
    });
}

function initializeDataTable() {
    if ($.fn.DataTable.isDataTable("#employeeTable")) {
        $('#employeeTable').DataTable().destroy();
    }
    $('#employeeTable').DataTable({
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

// Función para registrar un nuevo empleado
saveEmployeeButton.addEventListener('click', () => {
    const name = newEmployeeName.value;
    const position = newEmployeePosition.value;
    const phone = newEmployeePhone.value;
    const email = newEmployeeEmail.value;
    const password = newEmployeePassword.value;

    if (name && position && phone && email && password) {
        // Registrar en Firebase Authentication
        auth.createUserWithEmailAndPassword(email, password).then((userCredential) => {
            const user = userCredential.user;
            // Registrar los datos del empleado en Firestore
            db.collection("empleados").add({
                name: name,
                position: position,
                phone: phone,
                uid: user.uid
            }).then(() => {
                alert("Empleado registrado");
                loadEmployees();
                newEmployeeForm.style.display = 'none';
            }).catch((error) => {
                alert("Error al registrar el empleado: " + error.message);
            });
        }).catch((error) => {
            alert("Error al registrar usuario: " + error.message);
        });
    } else {
        alert("Por favor complete todos los campos.");
    }
});

// Mostrar el formulario de nuevo empleado
addEmployeeButton.addEventListener('click', () => {
    // Mostrar el formulario y ocultar la vista de empleados
    newEmployeeForm.style.display = 'block';
    document.querySelector('.employees').style.display = 'none';
});


// Cancelar el registro de nuevo empleado
cancelButton.addEventListener('click', () => {
    newEmployeeForm.style.display = 'none';
    document.querySelector('.employees').removeAttribute("style",'display:none;');
});

// Cargar empleados al inicio
loadEmployees();

// Función para eliminar un empleado
employeeTableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('deleteButton')) {
        const employeeId = e.target.getAttribute('data-id');
        db.collection("empleados").doc(employeeId).delete().then(() => {
            alert("Empleado eliminado");
            loadEmployees();
        }).catch((error) => {
            alert("Error al eliminar el empleado: " + error.message);
        });
    }
});

const editEmployeeForm = document.getElementById('editEmployeeForm');
const editEmployeeName = document.getElementById('editEmployeeName');
const editEmployeePosition = document.getElementById('editEmployeePosition');
const editEmployeePhone = document.getElementById('editEmployeePhone');
const editEmployeeEmail = document.getElementById('editEmployeeEmail');
const updateEmployeeButton = document.getElementById('updateEmployeeButton');
const cancelEditButton = document.getElementById('cancelEditButton');

let employeeIdToEdit = null; // Variable para almacenar el ID del empleado a editar

// Función para mostrar el formulario de edición
function showEditForm(employee) {
    editEmployeeName.value = employee.name;
    editEmployeePosition.value = employee.position;
    editEmployeePhone.value = employee.phone;
    editEmployeeEmail.value = employee.email;
    employeeIdToEdit = employee.id; // Guardar el ID del empleado a editar
    editEmployeeForm.style.display = 'block';
    document.querySelector('.employees').style.display = 'none'; // Ocultar la vista principal
}

// Función para actualizar los datos del empleado
updateEmployeeButton.addEventListener('click', () => {
    const name = editEmployeeName.value;
    const position = editEmployeePosition.value;
    const phone = editEmployeePhone.value;
    const email = editEmployeeEmail.value;

    if (name && position && phone && email) {
        // Actualizar los datos en Firestore
        db.collection("empleados").doc(employeeIdToEdit).update({
            name: name,
            position: position,
            phone: phone,
            email: email
        }).then(() => {
            alert("Empleado actualizado");
            loadEmployees(); // Recargar la lista de empleados
            editEmployeeForm.style.display = 'none'; // Ocultar el formulario de edición
            document.querySelector('.employees').style.display = 'block'; // Mostrar la vista principal
        }).catch((error) => {
            alert("Error al actualizar el empleado: " + error.message);
        });
    } else {
        alert("Por favor complete todos los campos.");
    }
});

// Cancelar la edición
cancelEditButton.addEventListener('click', () => {
    editEmployeeForm.style.display = 'none'; // Ocultar el formulario de edición
    document.querySelector('.employees').style.display = 'block'; // Mostrar la vista principal
});

// Función para manejar el clic en el botón de editar
employeeTableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('editButton')) {
        const employeeId = e.target.getAttribute('data-id');

        // Obtener los datos del empleado de Firestore
        db.collection("empleados").doc(employeeId).get().then((doc) => {
            if (doc.exists) {
                const employee = {
                    id: doc.id,
                    name: doc.data().name,
                    position: doc.data().position,
                    phone: doc.data().phone,
                    email: doc.data().email
                };
                showEditForm(employee); // Mostrar el formulario de edición con los datos del empleado
            } else {
                alert("Empleado no encontrado");
            }
        }).catch((error) => {
            alert("Error al obtener el empleado: " + error.message);
        });
    }
});

// Verificar si el usuario está autenticado
firebase.auth().onAuthStateChanged(user => {
    if (!user) {
        // Redirigir al login si no está autenticado
        window.location.href = 'index.html';
    } else {
        //console.log('Usuario autenticado:', user);
    }
});