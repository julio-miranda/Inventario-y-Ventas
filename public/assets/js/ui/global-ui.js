//js/ui/global-ui.js
import { auth } from "../config/firebase.js";
import { clearSessionDataCache } from "../session/cache.js";
import { sessionState, resetUserContextState } from "../session/state.js";

export function bindLogoutButtons() {

  const logoutButtons = [

    document.getElementById(
      "logoutButton"
    ),

    document.getElementById(
      "logoutButtonMobile"
    )

  ].filter(Boolean);


  logoutButtons.forEach(
    btn => {

      if (
        btn.dataset.appLogoutBound ===
        "1"
      ) {

        return;

      }


      btn.dataset.appLogoutBound =
        "1";


      btn.addEventListener(
        "click",
        async () => {

          try {

            clearSessionDataCache();
            resetUserContextState();

localStorage.removeItem(
              "currentUser"
            );


            await auth.signOut();

          } finally {

            window.location.href =
              "../index.html";

          }

        }
      );

    }
  );

}


/*
 * ============================================================
 * MENÚ MÓVIL
 * ============================================================
 */

export function bindMobileMenu() {

  const menuToggle =
    document.getElementById(
      "menuToggle"
    );


  const fullscreenMenu =
    document.getElementById(
      "fullscreenMenu"
    );


  const closeMenu =
    document.getElementById(
      "closeMenu"
    );


  if (

    menuToggle &&

    fullscreenMenu &&

    menuToggle.dataset.appMenuBound !==
    "1"

  ) {

    menuToggle.dataset.appMenuBound =
      "1";


    menuToggle.addEventListener(
      "click",
      () => {

        fullscreenMenu.classList.add(
          "active"
        );


        menuToggle.setAttribute(
          "aria-expanded",
          "true"
        );


        fullscreenMenu.setAttribute(
          "aria-hidden",
          "false"
        );

      }
    );

  }


  if (

    closeMenu &&

    fullscreenMenu &&

    closeMenu.dataset.appCloseMenuBound !==
    "1"

  ) {

    closeMenu.dataset.appCloseMenuBound =
      "1";


    closeMenu.addEventListener(
      "click",
      () => {

        fullscreenMenu.classList.remove(
          "active"
        );


        if (menuToggle) {

          menuToggle.setAttribute(
            "aria-expanded",
            "false"
          );

        }


        fullscreenMenu.setAttribute(
          "aria-hidden",
          "true"
        );

      }
    );


    closeMenu.addEventListener(
      "keydown",
      e => {

        if (

          e.key ===
          "Enter" ||

          e.key ===
          " "

        ) {

          e.preventDefault();

          closeMenu.click();

        }

      }
    );

  }

}
