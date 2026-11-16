/*
 * Inicialización única del SDK Firebase compat.
 * Conexión directa al entorno de producción.
 */

const firebase = window.firebase;

/*
 * ============================================================
 * VALIDACIÓN DEL SDK
 * ============================================================
 */

if (typeof window.firebase === "undefined") {
  console.error("Firebase no se ha cargado correctamente.");

  if (typeof Swal !== "undefined") {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "Firebase no se cargó. Revisa la conexión o los scripts."
    });
  }

  throw new Error("Firebase no está disponible.");
}

console.log("Firebase SDK cargado correctamente.");

/*
 * ============================================================
 * CONFIGURACIÓN DEL PROYECTO DE PRODUCCIÓN
 * ============================================================
 */

export const firebaseConfig = {
  apiKey: "AIzaSyAMsdmYEeH_zOQfXj55SURnp1Nkk8mhj4M",
  authDomain: "inventario-y-venta.firebaseapp.com",
  databaseURL: "https://inventario-y-venta-default-rtdb.firebaseio.com",
  projectId: "inventario-y-venta",
  storageBucket: "inventario-y-venta.firebasestorage.app",
  messagingSenderId: "220141957917",
  appId: "1:220141957917:web:1af57bde6709dffdf327f4",
  measurementId: "G-ELPGSV8ZLP"
};

/*
 * ============================================================
 * INICIALIZACIÓN DE FIREBASE
 * ============================================================
 */

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);

  console.info(
    "[Firebase] Proyecto de producción inicializado correctamente:",
    firebaseConfig.projectId
  );
} else {
  console.info(
    "[Firebase] Se utilizará la instancia existente:",
    firebase.app().options.projectId
  );
}

/*
 * ============================================================
 * SERVICIOS DE FIREBASE
 * ============================================================
 */

export const auth = firebase.auth();
export const db = firebase.firestore();

/*
 * ============================================================
 * PERSISTENCIA LOCAL DE FIRESTORE
 * ============================================================
 *
 * Utiliza IndexedDB para conservar datos en caché.
 * No cambia la conexión al servidor de producción.
 *
 * Si la persistencia no está disponible, la aplicación
 * continúa funcionando sin ella.
 */

export const firestoreReady = db.enablePersistence({
  synchronizeTabs: true
}).then(() => {
  console.info(
    "[Firebase] Persistencia IndexedDB habilitada."
  );

  return true;

}).catch(error => {

  if (error?.code === "failed-precondition") {
    console.warn(
      "[Firebase] No se pudo habilitar IndexedDB: otra pestaña ya controla la persistencia."
    );

  } else if (error?.code === "unimplemented") {
    console.warn(
      "[Firebase] Este navegador no admite persistencia IndexedDB de Firestore."
    );

  } else {
    console.warn(
      "[Firebase] La persistencia IndexedDB no está disponible:",
      error
    );
  }

  return false;
});

/*
 * ============================================================
 * DISPONIBILIDAD GLOBAL DE FIRESTORE
 * ============================================================
 */

if (typeof window !== "undefined") {
  window.BIOX_FIRESTORE_READY = firestoreReady;
}

/*
 * ============================================================
 * EXPORTACIONES
 * ============================================================
 */

export { firebase };