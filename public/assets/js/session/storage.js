export function getStoredCurrentUser() {

  try {

    return JSON.parse(

      localStorage.getItem(
        "currentUser"
      ) || "null"

    );

  } catch {

    return null;

  }

}


export function setStoredCurrentUser(
  next
) {

  try {

    localStorage.setItem(

      "currentUser",

      JSON.stringify(
        next
      )

    );

  } catch {

    // ignore

  }

}


export function patchStoredCurrentUser(
  patch = {}
) {

  try {

    const current =
      getStoredCurrentUser() ||
      {};


    setStoredCurrentUser({

      ...current,

      ...patch

    });

  } catch {

    // ignore

  }

}
