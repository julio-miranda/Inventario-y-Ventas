
import { auth } from "../config/firebase.js";

import {
  getCanonicalRole,
  roleRequiresLocal,
  getDefaultPageForRole
} from "../security/roles.js";

import {
  sessionState,
  setCurrentLocalContext,
  resetUserContextState
} from "../session/state.js";

import {
  clearSessionDataCache,
  setSessionContext
} from "../session/cache.js";

import {
  setStoredCurrentUser
} from "../session/storage.js";

import {
  getLocalIdFromData
} from "../session/local-context.js";

import {
  ensureCurrentUserContext,
  getCurrentUserContext,
  isObsoleteContextRequest
} from "../session/user-context.js";

import {
  ensureSessionDataLoaded
} from "../session/preload.js";

import {
  recordLoginAttempt
} from "./login-audit.js";

import {
  getCurrentPageFile
} from "../utils/page.js";

import {
  getRouteConfig,
  setSecureRouteState,
  runRegisteredControllers,
  redirectToLogin,
  redirectToRoute,
  isPublicRoute
} from "../routing/app-router.js";

import {
  redirectAccordingToRole,
  canAccessPage,
  renderNavigationForRole,
  setUserGreeting
} from "../ui/navigation.js";

import {
  bindMobileMenu,
  bindLogoutButtons
} from "../ui/global-ui.js";


/*
 * ============================================================
 * CONTROLADOR DE AUTENTICACIÓN
 * ============================================================
 */

export function initializeLoginController() {

  /*
   * ----------------------------------------------------------
   * CONTROL DE CONCURRENCIA
   * ----------------------------------------------------------
   */

  let loginAttemptSequence = 0;

  let authStateChangeSequence = 0;


  /*
   * ----------------------------------------------------------
   * ELEMENTOS DEL DOM
   * ----------------------------------------------------------
   */

  const loginForm =
    document.getElementById("loginForm");

  const btnLogin =
    document.getElementById("btnLogin");

  const btnText =
    document.getElementById("btnText");

  const btnSpinner =
    document.getElementById("btnSpinner");

  const errorElement =
    document.getElementById("error-message");

  const rememberCheckbox =
    document.getElementById("rememberMe");

  const forgotPasswordLink =
    document.getElementById("forgotPasswordLink");


  /*
   * ----------------------------------------------------------
   * CORREO RECORDADO
   * ----------------------------------------------------------
   */

  const savedEmail =
    localStorage.getItem("savedEmail");

  const emailInput =
    document.getElementById("email");

  if (savedEmail && emailInput) {

    emailInput.value = savedEmail;

    if (rememberCheckbox) {
      rememberCheckbox.checked = true;
    }

  }


  /*
   * ==========================================================
   * FUNCIONES AUXILIARES
   * ==========================================================
   */


  /**
   * Comprueba si el usuario continúa siendo
   * el usuario autenticado por Firebase.
   */
  function isCurrentAuthUser(user) {

    return Boolean(
      user?.uid &&
      auth.currentUser?.uid === user.uid
    );

  }


  /**
   * Comprueba si una solicitud de inicio de sesión
   * sigue siendo la última iniciada.
   */
  function isCurrentLoginAttempt(attemptId) {

    return (
      attemptId === loginAttemptSequence
    );

  }


  /**
   * Comprueba si una ejecución del observador
   * de autenticación continúa vigente.
   */
  function isCurrentAuthStateChange(runId) {

    return (
      runId === authStateChangeSequence
    );

  }


  /**
   * Limpia el estado local cuando ya no hay
   * un usuario autenticado.
   */
  function clearUnauthenticatedSession() {

    clearSessionDataCache();

    resetUserContextState();

  }


  /**
   * Registra un intento de acceso.
   *
   * Un fallo del registro de auditoría no debe
   * impedir el inicio de sesión ni la limpieza
   * de una sesión rechazada.
   */
  async function safelyRecordLoginAttempt(data) {

    try {

      await recordLoginAttempt(data);

    } catch (error) {

      console.warn(
        "No se pudo registrar el intento de inicio de sesión:",
        error
      );

    }

  }


  /**
   * Cierra únicamente la sesión que se está
   * validando. Nunca debe cerrar una sesión
   * diferente que haya iniciado posteriormente.
   */
  async function rejectAuthenticatedUser(user) {

    if (
      user &&
      auth.currentUser?.uid === user.uid
    ) {

      try {

        await auth.signOut();

      } catch (error) {

        console.error(
          "No se pudo cerrar la sesión rechazada:",
          error
        );

      }

    }


    /*
     * Solo limpiar el estado si realmente
     * no queda otro usuario autenticado.
     */
    if (!auth.currentUser) {

      clearUnauthenticatedSession();

      localStorage.removeItem("currentUser");

    }

  }


  /*
   * ==========================================================
   * INTERFAZ
   * ==========================================================
   */


  function setLoading(
    isLoading,
    text = "Validando..."
  ) {

    if (!btnLogin) {
      return;
    }

    btnLogin.disabled = isLoading;

    btnLogin.setAttribute(
      "aria-busy",
      isLoading ? "true" : "false"
    );


    if (btnText) {

      btnText.textContent = isLoading
        ? text
        : "Iniciar Sesión";

    }


    if (btnSpinner) {

      btnSpinner.style.display = isLoading
        ? "inline-block"
        : "none";

    }

  }


  function showError(msg) {

    if (errorElement) {

      errorElement.textContent = msg;

      errorElement.style.display = "block";

    }


    if (typeof Swal !== "undefined") {

      Swal.fire({

        toast: true,

        position: "top-end",

        icon: "error",

        title: msg,

        showConfirmButton: false,

        timer: 3000

      });

    }

  }


  function showSuccessToast(msg) {

    if (typeof Swal !== "undefined") {

      Swal.fire({

        toast: true,

        position: "top-end",

        icon: "success",

        title: msg,

        showConfirmButton: false,

        timer: 2500

      });

    }

  }


  function clearError() {

    if (errorElement) {

      errorElement.textContent = "";

      errorElement.style.display = "none";

    }

  }


  /*
   * ==========================================================
   * RECUPERACIÓN DE CONTRASEÑA
   * ==========================================================
   */

  async function handlePasswordReset() {

    if (typeof Swal === "undefined") {

      showError(
        "No está disponible el servicio de recuperación de contraseña."
      );

      return;

    }


    const currentEmail =
      document.getElementById("email")
        ?.value
        .trim() || "";


    const result = await Swal.fire({

      title: "Recuperar contraseña",

      text:
        "Ingresa el correo asociado a tu cuenta para enviarte el enlace de recuperación.",

      input: "email",

      inputValue: currentEmail,

      inputPlaceholder: "ejemplo@correo.com",

      showCancelButton: true,

      confirmButtonText: "Enviar enlace",

      cancelButtonText: "Cancelar",

      confirmButtonColor: "#4CAF50",

      cancelButtonColor: "#6b7280",

      inputValidator: value => {

        if (!value || !value.trim()) {

          return "Debes ingresar un correo válido.";

        }

        return undefined;

      }

    });


    if (!result.isConfirmed) {
      return;
    }


    const email =
      result.value.trim();


    try {

      await auth.sendPasswordResetEmail(email);


      Swal.fire({

        icon: "success",

        title: "Correo enviado",

        text:
          "Revisa tu bandeja de entrada y también la carpeta de spam.",

        confirmButtonColor: "#4CAF50"

      });

    } catch (error) {

      console.error(
        "Error enviando recuperación:",
        error
      );


      let mensaje =
        "No se pudo enviar el correo de recuperación.";


      switch (error.code) {

        case "auth/invalid-email":

          mensaje =
            "El correo ingresado no es válido.";

          break;


        case "auth/user-not-found":

          mensaje =
            "No existe una cuenta registrada con ese correo.";

          break;


        case "auth/network-request-failed":

          mensaje =
            "No se pudo conectar con Firebase. Revisa tu conexión.";

          break;


        default:

          mensaje =
            error.message || mensaje;

      }


      Swal.fire({

        icon: "error",

        title: "Error",

        text: mensaje,

        confirmButtonColor: "#4CAF50"

      });

    }

  }


  /*
   * ==========================================================
   * FORMULARIO DE INICIO DE SESIÓN
   * ==========================================================
   */

  if (loginForm) {

    loginForm.addEventListener(
      "submit",

      async event => {

        event.preventDefault();

        clearError();


        /*
         * Cada envío recibe un identificador.
         * Una solicitud anterior no debe continuar
         * controlando la interfaz de un intento nuevo.
         */

        const attemptId =
          ++loginAttemptSequence;


        const email =
          document.getElementById("email")
            ?.value
            .trim() || "";


        const password =
          document.getElementById("password")
            ?.value || "";


        if (!email || !password) {

          showError(
            "Por favor completa todos los campos."
          );

          return;

        }


        setLoading(true, "Validando...");


        let user = null;


        try {

          /*
           * --------------------------------------------------
           * AUTENTICACIÓN FIREBASE
           * --------------------------------------------------
           */

          const userCredential =
            await auth.signInWithEmailAndPassword(
              email,
              password
            );


          user = userCredential.user;


          /*
           * Verificar que este intento siga vigente
           * y que Firebase mantenga el mismo usuario.
           */

          if (
            !isCurrentLoginAttempt(attemptId) ||
            !isCurrentAuthUser(user)
          ) {

            setLoading(false);

            return;

          }


          /*
           * --------------------------------------------------
           * RESOLVER CONTEXTO
           * --------------------------------------------------
           *
           * No se debe borrar manualmente:
           *
           * currentUserContextPromise
           * currentUserContextPromiseUid
           * currentUserContextRequestToken
           *
           * El observador onAuthStateChanged puede haber
           * iniciado esta misma consulta.
           *
           * ensureCurrentUserContext reutiliza la promesa
           * pendiente cuando corresponde al mismo UID.
           */

          const context =
            await ensureCurrentUserContext(user);


          if (
            !isCurrentLoginAttempt(attemptId) ||
            !isCurrentAuthUser(user)
          ) {

            setLoading(false);

            return;

          }


          if (!context) {

            await rejectAuthenticatedUser(user);

            setLoading(false);

            showError(
              "El usuario no tiene perfil en la base de datos."
            );

            return;

          }


          /*
           * --------------------------------------------------
           * VALIDAR ROL
           * --------------------------------------------------
           */

          const role =
            getCanonicalRole(
              context.role ||
              context.position ||
              ""
            );


          if (!role) {

            await rejectAuthenticatedUser(user);

            setLoading(false);

            showError(
              "El usuario no tiene un rol válido configurado."
            );

            return;

          }


          /*
           * --------------------------------------------------
           * VALIDAR LOCAL
           * --------------------------------------------------
           */

          const requiresLocal =
            roleRequiresLocal(role);


          const id_local =
            getLocalIdFromData(context);


          if (
            requiresLocal &&
            !id_local
          ) {

            await rejectAuthenticatedUser(user);

            setLoading(false);

            showError(
              "El usuario no tiene un local asignado."
            );

            return;

          }


          /*
           * --------------------------------------------------
           * VALIDAR USUARIO BLOQUEADO O INACTIVO
           * --------------------------------------------------
           */

          if (
            context.blocked === true ||
            context.active === false
          ) {

            await safelyRecordLoginAttempt({

              email:
                context.email ||
                user.email ||
                email,

              uid:
                user.uid,

              id_local:
                requiresLocal
                  ? id_local
                  : "",

              localNombre:
                requiresLocal
                  ? context.localNombre
                  : "",

              success: false,

              reason: "usuario_bloqueado"

            });


            await rejectAuthenticatedUser(user);

            setLoading(false);

            showError(
              "Tu usuario está bloqueado o desactivado."
            );

            return;

          }


          /*
           * --------------------------------------------------
           * VALIDAR LOCAL BLOQUEADO
           * --------------------------------------------------
           */

          if (
            requiresLocal &&
            context.localBlocked === true
          ) {

            await safelyRecordLoginAttempt({

              email:
                context.email ||
                user.email ||
                email,

              uid:
                user.uid,

              id_local,

              localNombre:
                context.localNombre,

              success: false,

              reason: "local_bloqueado"

            });


            await rejectAuthenticatedUser(user);

            setLoading(false);

            showError(
              "El local asignado está bloqueado."
            );

            return;

          }


          /*
           * --------------------------------------------------
           * VERIFICAR NUEVAMENTE LA SESIÓN
           * --------------------------------------------------
           */

          if (
            !isCurrentLoginAttempt(attemptId) ||
            !isCurrentAuthUser(user)
          ) {

            setLoading(false);

            return;

          }


          /*
           * --------------------------------------------------
           * NORMALIZAR USUARIO
           * --------------------------------------------------
           */

          const currentUser = {

            uid:
              user.uid,

            employeeId:
              context.employeeId ||
              user.uid,

            name:
              context.name ||
              "",

            email:
              context.email ||
              user.email ||
              "",

            phone:
              context.phone ||
              "",

            role,

            position:
              role,

            active:
              context.active !== false,

            blocked: false,

            localBlocked: false,

            failedLoginAttempts:
              Number(
                context.failedLoginAttempts || 0
              ) || 0,

            id_local:
              requiresLocal
                ? id_local
                : "",

            localNombre:
              requiresLocal
                ? context.localNombre || ""
                : "",

            localNumeroDocumento:
              requiresLocal
                ? context.localNumeroDocumento || ""
                : "",

            localUbicacion:
              requiresLocal
                ? context.localUbicacion || ""
                : "",

            localContribuyente:
              requiresLocal
                ? context.localContribuyente || ""
                : "",

            localTipoDocumento:
              requiresLocal
                ? context.localTipoDocumento || ""
                : "",

            localNIT:
              requiresLocal
                ? context.localNIT || ""
                : "",

            localNRC:
              requiresLocal
                ? context.localNRC || ""
                : ""

          };


          /*
           * --------------------------------------------------
           * GUARDAR USUARIO Y CONTEXTO LOCAL
           * --------------------------------------------------
           */

          setStoredCurrentUser(currentUser);


          setCurrentLocalContext({

            id_local:
              currentUser.id_local,

            nombre:
              currentUser.localNombre,

            numeroDocumento:
              currentUser.localNumeroDocumento,

            ubicacion:
              currentUser.localUbicacion,

            contribuyente:
              currentUser.localContribuyente,

            tipoDocumento:
              currentUser.localTipoDocumento,

            nit:
              currentUser.localNIT,

            nrc:
              currentUser.localNRC

          });


          /*
           * Actualizar el contexto compartido.
           */

          sessionState.currentUserContextCache = {

            ...context,

            ...currentUser

          };


          sessionState.currentUserContextUid =
            user.uid;


          /*
           * Sincronizar el contexto actualizado
           * con la caché de sesión.
           */

          setSessionContext(
            sessionState.currentUserContextCache
          );


          /*
           * --------------------------------------------------
           * REGISTRAR INICIO DE SESIÓN EXITOSO
           * --------------------------------------------------
           */

          await safelyRecordLoginAttempt({

            email:
              currentUser.email ||
              email,

            uid:
              user.uid,

            id_local:
              requiresLocal
                ? id_local
                : "",

            localNombre:
              requiresLocal
                ? currentUser.localNombre
                : "",

            success: true,

            reason: "login_ok"

          });


          /*
           * --------------------------------------------------
           * VERIFICAR SESIÓN ANTES DE PRECARGAR
           * --------------------------------------------------
           */

          if (
            !isCurrentLoginAttempt(attemptId) ||
            !isCurrentAuthUser(user)
          ) {

            setLoading(false);

            return;

          }


          /*
           * --------------------------------------------------
           * PRECARGA DE DATOS
           * --------------------------------------------------
           *
           * Se utiliza ensureSessionDataLoaded en lugar
           * de forzar una segunda precarga.
           *
           * El observador onAuthStateChanged también puede
           * solicitar la carga. Ambas llamadas deben
           * reutilizar la misma promesa de precarga.
           */

          setLoading(
            true,
            "Preparando datos..."
          );


          await ensureSessionDataLoaded(
            user,
            {
              pageFile: getCurrentPageFile()
            }
          );


          /*
           * --------------------------------------------------
           * VALIDAR QUE LA SESIÓN SIGA VIGENTE
           * --------------------------------------------------
           */

          if (
            !isCurrentLoginAttempt(attemptId) ||
            !isCurrentAuthUser(user)
          ) {

            setLoading(false);

            return;

          }


          /*
           * --------------------------------------------------
           * RECORDAR CORREO
           * --------------------------------------------------
           */

          if (
            rememberCheckbox &&
            rememberCheckbox.checked
          ) {

            localStorage.setItem(
              "savedEmail",
              email
            );

          } else {

            localStorage.removeItem(
              "savedEmail"
            );

          }


          /*
           * --------------------------------------------------
           * FINALIZAR
           * --------------------------------------------------
           *
           * La navegación la administra
           * auth.onAuthStateChanged().
           *
           * Evitamos ejecutar un segundo redirect
           * desde el formulario.
           */

          setLoading(false);

          showSuccessToast(
            "Inicio de sesión correcto"
          );


        } catch (error) {

          /*
           * --------------------------------------------------
           * SOLICITUD OBSOLETA
           * --------------------------------------------------
           *
           * No debe borrar el contexto de una sesión nueva
           * ni provocar el cierre de una sesión válida.
           */

          if (
            isObsoleteContextRequest(error)
          ) {

            setLoading(false);


            if (
              user &&
              auth.currentUser?.uid === user.uid
            ) {

              console.info(
                "Se ignoró una solicitud de contexto obsoleta. La sesión actual continúa activa."
              );

            }

            return;

          }


          /*
           * --------------------------------------------------
           * INTENTO REEMPLAZADO
           * --------------------------------------------------
           */

          if (
            !isCurrentLoginAttempt(attemptId)
          ) {

            return;

          }


          /*
           * Si existe otro usuario autenticado,
           * no se debe limpiar su contexto ni su caché.
           */

          if (
            user &&
            auth.currentUser &&
            auth.currentUser.uid !== user.uid
          ) {

            setLoading(false);

            return;

          }


          console.error(
            "Error durante el inicio de sesión:",
            error
          );


          /*
           * Cuando Firebase no tiene un usuario autenticado,
           * limpiar únicamente el estado que quedó pendiente.
           *
           * Si el usuario sigue autenticado, se conserva
           * el contexto válido para no destruir una sesión
           * por un error de precarga.
           */

          if (!auth.currentUser) {

            clearUnauthenticatedSession();

          }


          setLoading(false);


          /*
           * --------------------------------------------------
           * MENSAJES DE ERROR
           * --------------------------------------------------
           */

          let mensajeError =
            "Ocurrió un error inesperado.";


          switch (error.code) {

            case "auth/user-not-found":

              mensajeError =
                "No se pudo validar el usuario.";

              break;


            case "auth/wrong-password":

              mensajeError =
                "La contraseña es incorrecta.";

              break;


            case "auth/invalid-credential":

              mensajeError =
                "El correo o la contraseña son incorrectos.";

              break;


            case "auth/invalid-email":

              mensajeError =
                "El formato del correo no es válido.";

              break;


            case "auth/user-disabled":

              mensajeError =
                "La cuenta ha sido deshabilitada.";

              break;


            case "auth/network-request-failed":

              mensajeError =
                "No se pudo conectar con Firebase. Revisa tu conexión.";

              break;


            case "auth/too-many-requests":

              mensajeError =
                "Se realizaron demasiados intentos. Intenta nuevamente más tarde.";

              break;


            default:

              mensajeError =
                error.message ||
                mensajeError;

          }


          showError(mensajeError);

        }

      }

    );

  }


  /*
   * ==========================================================
   * ENLACE DE RECUPERACIÓN DE CONTRASEÑA
   * ==========================================================
   */

  if (forgotPasswordLink) {

    forgotPasswordLink.addEventListener(
      "click",
      handlePasswordReset
    );

  }


  /*
   * ==========================================================
   * INTERFAZ GLOBAL
   * ==========================================================
   */

  bindMobileMenu();

  bindLogoutButtons();


  /*
   * ==========================================================
   * OBSERVADOR GLOBAL DE AUTENTICACIÓN
   * ==========================================================
   */

  auth.onAuthStateChanged(

    async user => {

      /*
       * Cada cambio de autenticación recibe
       * un identificador de ejecución.
       *
       * Evita que una respuesta anterior continúe
       * modificando el estado después de otro cambio.
       */

      const runId =
        ++authStateChangeSequence;


      const currentPage =
        getCurrentPageFile();


      const currentRoute =
        getRouteConfig(currentPage) || {};


      /*
       * ======================================================
       * SIN USUARIO AUTENTICADO
       * ======================================================
       */

      if (!user) {

        clearUnauthenticatedSession();


        if (
          !isCurrentAuthStateChange(runId)
        ) {

          return;

        }


        /*
         * Página pública:
         * permitir que se ejecuten sus controladores.
         */

        if (isPublicRoute(currentPage)) {

          setSecureRouteState({

            user: null,

            context: null,

            role: "",

            pageFile: currentPage,

            authorized: true

          });


          await runRegisteredControllers();


          return;

        }


        /*
         * Página protegida:
         * bloquear el acceso.
         */

        setSecureRouteState({

          user: null,

          context: null,

          role: "",

          pageFile: currentPage,

          authorized: false

        });


        redirectToLogin();

        return;

      }


      /*
       * ======================================================
       * USUARIO AUTENTICADO
       * ======================================================
       */

      try {

        /*
         * ----------------------------------------------------
         * RESOLVER CONTEXTO
         * ----------------------------------------------------
         *
         * Si el formulario ya inició esta consulta,
         * se reutiliza su promesa.
         */

        const resolved =
          await getCurrentUserContext(user);


        /*
         * Comprobar que la respuesta todavía pertenece
         * a la sesión y al observador actuales.
         */

        if (
          !isCurrentAuthStateChange(runId) ||
          !isCurrentAuthUser(user)
        ) {

          return;

        }


        if (!resolved) {

          throw new Error(
            "No se pudo resolver el perfil autenticado."
          );

        }


        /*
         * ----------------------------------------------------
         * VALIDAR ROL
         * ----------------------------------------------------
         */

        const role =
          getCanonicalRole(
            resolved.role ||
            resolved.position ||
            ""
          );


        if (!role) {

          throw new Error(
            "El usuario autenticado no tiene un rol válido."
          );

        }


        /*
         * ----------------------------------------------------
         * VALIDAR ESTADO DE USUARIO Y LOCAL
         * ----------------------------------------------------
         */

        if (
          resolved.blocked === true ||
          resolved.active === false ||
          resolved.localBlocked === true
        ) {

          await auth.signOut();

          return;

        }


        /*
         * ----------------------------------------------------
         * VALIDAR LOCAL ASIGNADO
         * ----------------------------------------------------
         */

        if (
          currentRoute.requiresLocal &&
          roleRequiresLocal(role) &&
          !getLocalIdFromData(resolved)
        ) {

          throw new Error(
            "El usuario autenticado no tiene un local asignado."
          );

        }


        /*
         * ----------------------------------------------------
         * PRECARGAR DATOS DE SESIÓN
         * ----------------------------------------------------
         *
         * Puede ejecutarse al mismo tiempo que el formulario
         * solicita la carga.
         *
         * El módulo preload.js debe reutilizar la promesa
         * pendiente para evitar lecturas duplicadas.
         */

        await ensureSessionDataLoaded(
          user,
          {
            pageFile: currentPage
          }
        );


        /*
         * No continuar si cambió la sesión durante
         * la precarga.
         */

        if (
          !isCurrentAuthStateChange(runId) ||
          !isCurrentAuthUser(user)
        ) {

          return;

        }


        /*
         * ----------------------------------------------------
         * ACTUALIZAR INTERFAZ
         * ----------------------------------------------------
         */

        const displayName =
          resolved.name ||
          "Usuario";


        setUserGreeting(
          displayName,
          role
        );


        renderNavigationForRole(role);


        /*
         * ----------------------------------------------------
         * PÁGINAS PÚBLICAS
         * ----------------------------------------------------
         */

        if (isPublicRoute(currentPage)) {

          /*
           * Si el usuario autenticado está en login
           * o en la página inicial, redirigir según su rol.
           */

          if (
            currentPage === "index.html" ||
            currentPage === "login.html"
          ) {

            redirectAccordingToRole(role);

            return;

          }


          setSecureRouteState({
            user,
            context: resolved,
            role,
            pageFile: currentPage,
            authorized: true
          });

          await runRegisteredControllers();

          return;
        }

        /*
         * ----------------------------------------------------
         * CONTROL DE ACCESO A PÁGINAS
         * ----------------------------------------------------
         */

        if (
          !canAccessPage(
            role,
            currentPage
          )
        ) {

          setSecureRouteState({

            user,
            context: resolved,
            role,
            pageFile: currentPage,
            authorized: false

          });


          redirectToRoute(
            getDefaultPageForRole(role)
          );

          return;

        }


        /*
         * ----------------------------------------------------
         * AUTORIZAR PÁGINA
         * ----------------------------------------------------
         */

        setSecureRouteState({

          user,

          context: resolved,

          role,

          pageFile: currentPage,

          authorized: true

        });


        /*
         * Ejecutar controladores registrados
         * únicamente después de resolver el contexto
         * y cargar los datos requeridos.
         */

        await runRegisteredControllers();


      } catch (error) {

        /*
         * ----------------------------------------------------
         * IGNORAR RESPUESTAS OBSOLETAS
         * ----------------------------------------------------
         */

        if (
          isObsoleteContextRequest(error) ||
          !isCurrentAuthStateChange(runId) ||
          !isCurrentAuthUser(user)
        ) {

          console.info(
            "Se ignoró una respuesta de autenticación perteneciente a una sesión anterior."
          );

          return;
        }


        /*
         * ----------------------------------------------------
         * ERROR REAL DE CONTEXTO O PRECARGA
         * ----------------------------------------------------
         */

        console.error(
          "Error resolviendo contexto del usuario:",
          error
        );

        /*
         * No borrar ni cerrar otra sesión que pudiera
         * haberse iniciado mientras se resolvía el error.
         */

        if (
          auth.currentUser?.uid !== user.uid
        ) {
          return;
        }

        clearUnauthenticatedSession();
        localStorage.removeItem("currentUser");

        /*
         * ----------------------------------------------------
         * CERRAR SESIÓN NO VÁLIDA
         * ----------------------------------------------------
         */

        try {
          await auth.signOut();
        } catch (signOutError) {
          console.error(
            "No se pudo cerrar la sesión después del error:",
            signOutError
          );
        }

        /*
         * Si el observador cambió mientras se cerraba
         * la sesión, dejar que la ejecución más reciente
         * controle la navegación.
         */

        if (
          !isCurrentAuthStateChange(runId)
        ) {
          return;
        }

        /*
         * ----------------------------------------------------
         * REDIRECCIÓN SEGÚN LA PÁGINA
         * ----------------------------------------------------
         */

        if (isPublicRoute(currentPage)) {

          setSecureRouteState({
            user: null,
            context: null,
            role: "",
            pageFile: currentPage,
            authorized: true
          });

          await runRegisteredControllers();
          return;
        }


        setSecureRouteState({
          user: null,
          context: null,
          role: "",
          pageFile: currentPage,
          authorized: false

        });

        redirectToLogin();
      }
    }
  );
}