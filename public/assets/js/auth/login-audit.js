import { auth, db, firebase } from "../config/firebase.js";
import { LOGIN_ATTEMPTS_COLLECTION_NAME } from "../config/collections.js";
import { upsertSessionDocument } from "../session/cache.js";

export async function recordLoginAttempt(
  payload = {}
) {

  try {

    const user =
      auth.currentUser;


    if (
      !user
    ) {

      return;

    }


    if (

      payload.uid &&

      payload.uid !==
      user.uid

    ) {

      console.warn(

        "Intento de registrar auditoría con UID diferente al autenticado."

      );


      return;

    }


    const firestorePayload = {

      email:

        payload.email ||

        user.email ||

        "",

      uid:
        user.uid,

      id_local:

        payload.id_local ||

        "",

      localNombre:

        payload.localNombre ||

        "",

      success:

        Boolean(

          payload.success

        ),

      result:

        payload.success

          ? "exitoso"

          : "fallido",

      reason:

        payload.reason ||

        "",

      createdAt:

        firebase.firestore

          .FieldValue

          .serverTimestamp()

    };


    const ref =
      await db

        .collection(

          LOGIN_ATTEMPTS_COLLECTION_NAME

        )

        .add(

          firestorePayload

        );


    upsertSessionDocument(

      LOGIN_ATTEMPTS_COLLECTION_NAME,

      ref.id,

      {

        ...firestorePayload,

        createdAt:
          Date.now()

      }

    );

  } catch (
  error
  ) {

    console.error(

      "No se pudo registrar el intento de acceso:",

      error

    );

  }

}
