import { firebase } from "../config/firebase.js";

export function getLocalDayKey(
  date = new Date()
) {

  const y =
    date.getFullYear();


  const m =
    String(

      date.getMonth() +
      1

    ).padStart(
      2,
      "0"
    );


  const d =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );


  return `${y}-${m}-${d}`;

}


export function getTodayBounds(
  date = new Date()
) {

  const start =
    new Date(
      date
    );


  start.setHours(

    0,

    0,

    0,

    0

  );


  const end =
    new Date(
      date
    );


  end.setHours(

    23,

    59,

    59,

    999

  );


  return {

    start:

      firebase.firestore.Timestamp.fromDate(

        start

      ),

    end:

      firebase.firestore.Timestamp.fromDate(

        end

      ),

    dayKey:

      getLocalDayKey(
        date
      )

  };

}
