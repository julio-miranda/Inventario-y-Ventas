// Punto de entrada: coordina módulos, no concentra lógica de negocio.
import { installGlobalErrorHandlers } from "./core/errors.js";
import { exposeGlobalApi } from "./core/global-api.js";
import { startRouter } from "./core/start-router.js";
import { initializeLoginController } from "./auth/login-controller.js";

installGlobalErrorHandlers();
exposeGlobalApi();

function startApplication() {
  initializeLoginController();
  startRouter();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", startApplication, { once: true });
} else {
  startApplication();
}