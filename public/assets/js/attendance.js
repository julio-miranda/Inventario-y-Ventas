// attendance.js - versión mejorada
// Requiere: firebase (v8), SweetAlert2 y que app.js haya inicializado firebase, auth y db.

const employeeSelect = document.getElementById('employeeSelect');
const attendanceForm = document.getElementById('attendanceForm');
const attendanceTableBody = document.querySelector('#attendanceTable tbody');
const btnClearAttendance = document.getElementById('btnClearAttendance');
const attendanceFilter = document.getElementById('attendanceFilter');
const btnLogout = document.getElementById('logoutButton');
const userGreeting = document.querySelectorAll('.userGreeting');
const btnRegisterAttendance = document.getElementById('btnRegisterAttendance');

let employeesMap = new Map(); // id -> data
let currentUserRole = null;   // 'admin' | 'vendedor' | etc.

// Umbral de ejemplo (podrías mover a configuración)
const ATTENDANCE_LIMIT = 1000; // no usado ahora, placeholder

// --- Autenticación / protección de ruta y lectura del usuario ---
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  // Mostrar saludo desde localStorage (si existe)
  try {
    const stored = JSON.parse(localStorage.getItem('currentUser'));
    if (stored && stored.uid === user.uid) {
      userGreeting.forEach(b => b.textContent = `Hola, ${stored.name || 'Usuario'} (${stored.role || 'Empleado'})`);
      currentUserRole = (stored.role || '').toLowerCase();
    } else {
      // Intentar obtener perfil desde 'empleados' por email
      const snap = await db.collection('empleados').where('email', '==', user.email).limit(1).get();
      if (!snap.empty) {
        const d = snap.docs[0].data();
        const role = (d.position || d.role || 'empleado').toLowerCase();
        currentUserRole = role;
        const name = d.name || 'Usuario';
        userGreeting.forEach(b => b.textContent = `Hola, ${name} (${role})`);
        // guardar localmente
        localStorage.setItem('currentUser', JSON.stringify({ uid: user.uid, name, email: user.email, role }));
      } else {
        userGreeting.textContent = `Hola, ${user.email.split('@')[0]}`;
      }
    }
  } catch (err) {
    console.error('Error leyendo perfil local:', err);
  }

  // Inicializar listeners en tiempo real
  initEmployeesListener();
  initAttendanceListener();
});

// Logout
if (btnLogout) {
  btnLogout.addEventListener('click', () => {
    auth.signOut().then(() => {
      localStorage.removeItem('currentUser');
      window.location.href = 'index.html';
    });
  });
}

// --- LISTENERS EN TIEMPO REAL ---

function initEmployeesListener() {
  // Mantiene employeesMap y actualiza <select>
  db.collection('empleados')
    .orderBy('name')
    .onSnapshot(snapshot => {
      // limpiar
      employeesMap.clear();
      if (!employeeSelect) return;

      // Mantener la primera opción
      const prevValue = employeeSelect.value;
      employeeSelect.innerHTML = '<option value="">-- Seleccione un empleado --</option>';

      snapshot.forEach(doc => {
        const d = doc.data();
        employeesMap.set(doc.id, d);

        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = d.name || '(sin nombre)';
        employeeSelect.appendChild(opt);
      });

      // intentar restaurar selección previa (si aún existe)
      if (prevValue) {
        const exists = [...employeesMap.keys()].includes(prevValue);
        if (exists) employeeSelect.value = prevValue;
      }
    }, err => {
      console.error('Error escuchando empleados:', err);
      Swal.fire('Error', 'No se pudieron cargar los empleados en tiempo real.', 'error');
    });
}

function initAttendanceListener() {
  // Escucha la colección asistencia y re-renderiza la tabla automáticamente
  db.collection('asistencia')
    .orderBy('date', 'desc')
    .onSnapshot(snapshot => {
      attendanceTableBody.innerHTML = '';

      if (snapshot.empty) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="4" style="text-align:center; color:#6b7280;">No hay registros de asistencia.</td>';
        attendanceTableBody.appendChild(tr);
        return;
      }

      snapshot.forEach(doc => {
        const at = doc.data();
        const tr = document.createElement('tr');

        // Empleado (resuelto desde employeesMap)
        const tdName = document.createElement('td');
        const emp = employeesMap.get(at.employeeId);
        tdName.textContent = emp ? (emp.name || 'Sin nombre') : 'Empleado eliminado / desconocido';
        tr.appendChild(tdName);

        // Fecha / hora
        const tdDate = document.createElement('td');
        let dt = at.date && at.date.toDate ? at.date.toDate() : (at.date ? new Date(at.date) : new Date());
        tdDate.textContent = dt.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
        tr.appendChild(tdDate);

        // Estado
        const tdStatus = document.createElement('td');
        tdStatus.textContent = at.status || '-';
        tr.appendChild(tdStatus);

        // Acciones (solo admin puede eliminar desde UI)
        const tdActions = document.createElement('td');
        if (currentUserRole === 'admin' || currentUserRole === 'administrador') {
          const delBtn = document.createElement('button');
          delBtn.className = 'btn-outline';
          delBtn.type = 'button';
          delBtn.innerHTML = '<i class="fas fa-trash"></i> Eliminar';
          delBtn.addEventListener('click', () => confirmDeleteAttendance(doc.id, tdName.textContent));
          tdActions.appendChild(delBtn);
        } else {
          const info = document.createElement('span');
          info.style.color = '#6b7280';
          info.textContent = '—';
          tdActions.appendChild(info);
        }
        tr.appendChild(tdActions);

        attendanceTableBody.appendChild(tr);
      });

      // Aplicar filtro actual si hay
      if (attendanceFilter && attendanceFilter.value.trim()) {
        applyAttendanceFilter(attendanceFilter.value.trim().toLowerCase());
      }
    }, err => {
      console.error('Error escuchando asistencia:', err);
      Swal.fire('Error', 'No se pudieron cargar los registros de asistencia en tiempo real.', 'error');
    });
}

// --- OPERACIONES (Registrar / Eliminar / Añadir Empleado) ---

// Registrar asistencia
if (attendanceForm) {
  attendanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const empId = employeeSelect.value;
    const status = document.getElementById('attendanceStatus').value;

    if (!empId) {
      Swal.fire({ icon: 'warning', title: 'Seleccione un empleado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
      return;
    }

    try {
      btnRegisterAttendance.disabled = true;
      btnRegisterAttendance.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';

      await db.collection('asistencia').add({
        employeeId: empId,
        status,
        date: firebase.firestore.Timestamp.fromDate(new Date())
      });

      // Toast éxito
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Asistencia registrada', showConfirmButton: false, timer: 1600 });

      // limpiar selección (opcional)
      attendanceForm.reset();
      employeeSelect.value = '';
    } catch (err) {
      console.error('Error registrando asistencia:', err);
      Swal.fire('Error', 'No se pudo registrar la asistencia.', 'error');
    } finally {
      btnRegisterAttendance.disabled = false;
      btnRegisterAttendance.innerHTML = '<i class="fas fa-check"></i> Registrar Asistencia';
    }
  });
}

// Limpiar formulario
if (btnClearAttendance) {
  btnClearAttendance.addEventListener('click', () => {
    attendanceForm.reset();
    employeeSelect.value = '';
  });
}

// Confirmar y eliminar registro de asistencia
async function confirmDeleteAttendance(docId, empName) {
  const res = await Swal.fire({
    title: `Eliminar registro de ${empName}?`,
    text: 'Esta acción no se puede deshacer.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (!res.isConfirmed) return;

  try {
    await db.collection('asistencia').doc(docId).delete();
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Registro eliminado', showConfirmButton: false, timer: 1400 });
  } catch (err) {
    console.error('Error eliminando registro:', err);
    Swal.fire('Error', 'No se pudo eliminar el registro.', 'error');
  }
}

// --- FILTRADO LOCAL (cliente-side) ---
if (attendanceFilter) {
  attendanceFilter.addEventListener('input', () => {
    applyAttendanceFilter(attendanceFilter.value.trim().toLowerCase());
  });
}

function applyAttendanceFilter(query) {
  const rows = Array.from(attendanceTableBody.querySelectorAll('tr'));
  if (!query) {
    rows.forEach(r => r.style.display = '');
    return;
  }

  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
}