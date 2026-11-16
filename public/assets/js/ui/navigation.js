import { getCanonicalRole, ROLE_NAV, ROLE_ALLOWED_PAGES, getDefaultPageForRole } from "../security/roles.js";
import { getRouteConfig, redirectToRoute } from "../routing/app-router.js";

export function getNavByRole(
  role = ""
) {

  const canonical =
    getCanonicalRole(
      role
    );


  return (

    ROLE_NAV[
    canonical
    ] ||

    [

      {
        label:
          "Inicio",

        href:
          "dashboard.html"
      }

    ]

  );

}


export function canAccessPage(
  role = "",
  pageFile = ""
) {

  const canonical =
    getCanonicalRole(
      role
    );


  const route =
    getRouteConfig(
      pageFile
    );


  if (
    route.public
  ) {

    return true;

  }


  if (
    route.roles?.length
  ) {

    return route.roles.includes(
      canonical
    );

  }


  const allowed =
    ROLE_ALLOWED_PAGES[
    canonical
    ] || [];


  return allowed.includes(
    String(
      pageFile
    )
      .trim()
      .toLowerCase()
  );

}


export function renderLinks(
  container,
  links,
  closeMenuAfterClick = false
) {

  if (!container) {
    return;
  }


  container.innerHTML =
    links
      .map(
        link => `

          <li>

            <a href="${link.href}">

              ${link.label}

            </a>

          </li>

        `
      )
      .join("");


  if (
    closeMenuAfterClick
  ) {

    container
      .querySelectorAll("a")
      .forEach(
        a => {

          a.addEventListener(
            "click",
            () => {

              const fullscreenMenu =
                document.getElementById(
                  "fullscreenMenu"
                );


              const menuToggle =
                document.getElementById(
                  "menuToggle"
                );


              if (fullscreenMenu) {

                fullscreenMenu.classList.remove(
                  "active"
                );


                fullscreenMenu.setAttribute(
                  "aria-hidden",
                  "true"
                );

              }


              if (menuToggle) {

                menuToggle.setAttribute(
                  "aria-expanded",
                  "false"
                );

              }

            }
          );

        }
      );

  }

}


export function renderNavigationForRole(
  role = ""
) {

  const links =
    getNavByRole(
      role
    );


  renderLinks(

    document.querySelector(
      ".navbar-links ul"
    ),

    links,

    false

  );


  renderLinks(

    document.querySelector(
      ".menu-links"
    ),

    links,

    true

  );

}


export function setUserGreeting(
  name = "Usuario",
  role = ""
) {

  const greetingEls =
    document.querySelectorAll(
      ".userGreeting"
    );


  const roleText =
    role
      ? ` (${role})`
      : "";


  greetingEls.forEach(
    el => {

      el.textContent =
        `Hola, ${name}${roleText}`;

    }
  );

}


export function redirectAccordingToRole(
  role = ""
) {

  redirectToRoute(

    getDefaultPageForRole(
      role
    )

  );

}
