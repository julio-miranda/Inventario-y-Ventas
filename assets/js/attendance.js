const db = firebase.firestore();
const employeeSelect = document.getElementById('employeeSelect');
const attendanceForm = document.getElementById('attendanceForm');
const attendanceTable = document.getElementById('attendanceTable').getElementsByTagName('tbody')[0];
const addEmployeeButton = document.getElementById('addEmployeeButton');
const newEmployeeForm = document.getElementById('newEmployeeForm');
const saveEmployeeButton = document.getElementById('saveEmployeeButton');
const newEmployeeName = document.getElementById('newEmployeeName');
const newEmployeePosition = document.getElementById('newEmployeePosition');
const newEmployeePhone = document.getElementById('newEmployeePhone');

// Cargar empleados en el selector para registrar asistencia
function loadEmployees() {
    db.collection("empleados").get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            const employee = doc.data();
            const option = document.createElement("option");
            option.value = doc.id;
            option.textContent = employee.name;
            employeeSelect.appendChild(option);
        });
    });
}

// Cargar la asistencia desde Firestore
function loadAttendance() {
    // Limpiar las filas previas de la tabla
    while (attendanceTable.rows.length > 0) {
        attendanceTable.deleteRow(0);
    }

    db.collection("asistencia").orderBy("date", "desc").get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            const attendance = doc.data();
            db.collection("empleados").doc(attendance.employeeId).get().then((empDoc) => {
                const employee = empDoc.data();
                const row = attendanceTable.insertRow(); // Insertar una nueva fila
                const employeeCell = row.insertCell(0);
                const dateCell = row.insertCell(1);
                const statusCell = row.insertCell(2);

                employeeCell.textContent = employee.name;
                dateCell.textContent = new Date(attendance.date.seconds * 1000).toLocaleDateString("es-ES");
                statusCell.textContent = attendance.status;
            });
        });
    });
}

// Registrar asistencia
attendanceForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const employeeId = employeeSelect.value;
    const status = document.getElementById('attendanceStatus').value;
    const date = new Date();

    db.collection("asistencia").add({
        employeeId: employeeId,
        status: status,
        date: firebase.firestore.Timestamp.fromDate(date)
    }).then(() => {
        alert("Asistencia registrada");
        loadAttendance(); // Recargar la tabla de asistencia
    }).catch((error) => {
        alert("Error al registrar la asistencia: " + error);
    });
});

// Mostrar formulario para agregar un nuevo empleado
addEmployeeButton.addEventListener('click', () => {
    newEmployeeForm.style.display = 'block';
});

// Guardar nuevo empleado
saveEmployeeButton.addEventListener('click', () => {
    const name = newEmployeeName.value;
    const position = newEmployeePosition.value;
    const phone = newEmployeePhone.value;

    if (name && position && phone) {
        db.collection("empleados").add({
            name: name,
            position: position,
            phone: phone
        }).then(() => {
            alert("Empleado registrado");
            loadEmployees(); // Recargar empleados en el selector
            newEmployeeForm.style.display = 'none'; // Ocultar el formulario
        }).catch((error) => {
            alert("Error al registrar el empleado: " + error);
        });
    } else {
        alert("Por favor, complete todos los campos.");
    }
});

// Cargar datos al inicio
loadEmployees();
loadAttendance();

// Verificar si el usuario está autenticado
firebase.auth().onAuthStateChanged(user => {
    if (!user) {
        // Redirigir al login si no está autenticado
        window.location.href = 'index.html';
    } else {
        console.log('Usuario autenticado:', user);
    }
});