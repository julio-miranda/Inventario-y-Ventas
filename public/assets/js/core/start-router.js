import { router } from "../router.js";

let started = false;

export function startRouter() {
  if (started) return;
  started = true;

  const safeRouter = () => {
    router().catch(error => {
      console.error("Error no controlado en router:", error);
    });
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", safeRouter, { once: true });
  } else {
    safeRouter();
  }

  window.addEventListener("hashchange", safeRouter);
}
