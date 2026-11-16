export function installGlobalErrorHandlers() {
  if (window.__bioxGlobalErrorsInstalled) return;
  window.__bioxGlobalErrorsInstalled = true;

  window.addEventListener("error", event => {
    console.error("ERROR GLOBAL:", event.error || event.message);
  });

  window.addEventListener("unhandledrejection", event => {
    console.error("PROMESA RECHAZADA:", event.reason);
  });
}
