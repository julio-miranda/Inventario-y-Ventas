import { firebase } from "../config/firebase.js";
import { SALES_COLLECTION_NAME, EXPENSES_COLLECTION_NAME } from "../config/collections.js";
import { isDeveloperRole } from "../security/roles.js";
import { sessionState } from "../session/state.js";
import { getCurrentLocalId, matchesLocalContext } from "../session/local-context.js";
import { getSessionCollection } from "../session/cache.js";
import { getLocalDayKey, getTodayBounds } from "../utils/dates.js";
import { getTimestampMs } from "../utils/timestamps.js";

export function formatMoney(
  value
) {

  return new Intl.NumberFormat(

    "es-ES",

    {

      style:
        "currency",

      currency:
        "USD"

    }

  ).format(

    Number(

      value ||

      0

    )

  );

}


export function getDocumentsFromSessionOrEmpty(
  collectionName
) {

  return getSessionCollection(
    collectionName
  );

}


export function calculateDailyFinancialSummaryFromCache(
  date = new Date(),
  localId = getCurrentLocalId()
) {

  const targetLocalId =
    String(

      localId ||

      ""

    ).trim();


  const start =
    new Date(

      date.getFullYear(),

      date.getMonth(),

      date.getDate(),

      0,
      0,
      0,
      0

    );


  const end =
    new Date(

      date.getFullYear(),

      date.getMonth(),

      date.getDate(),

      23,
      59,
      59,
      999

    );


  let sales =
    0;


  let expenses =
    0;


  const salesDocs =
    getDocumentsFromSessionOrEmpty(

      SALES_COLLECTION_NAME

    );


  salesDocs.forEach(

    ({
      data
    }) => {

      if (

        targetLocalId &&

        !matchesLocalContext(

          data,

          targetLocalId

        )

      ) {

        return;

      }


      const timestamp =
        getTimestampMs(

          data.createdAt

        );


      if (

        timestamp >=
        start.getTime() &&

        timestamp <=
        end.getTime()

      ) {

        sales +=

          Number(

            data.total ||

            0

          );

      }

    }

  );


  const expenseDocs =
    getDocumentsFromSessionOrEmpty(

      EXPENSES_COLLECTION_NAME

    );


  expenseDocs.forEach(

    ({
      data
    }) => {

      if (

        targetLocalId &&

        !matchesLocalContext(

          data,

          targetLocalId

        )

      ) {

        return;

      }


      const timestamp =
        getTimestampMs(

          data.createdAt

        );


      if (

        timestamp >=
        start.getTime() &&

        timestamp <=
        end.getTime()

      ) {

        expenses +=

          Number(

            data.amount ||

            0

          );

      }

    }

  );


  return {

    sales,

    expenses,

    net:

      sales -
      expenses

  };

}


export async function getDailyFinancialSummary(

  date = new Date(),

  localId =
    getCurrentLocalId()

) {

  if (

    isDeveloperRole(

      sessionState.currentUserContextCache?.role ||

      ""

    )

  ) {

    return {

      sales:
        0,

      expenses:
        0,

      net:
        0

    };

  }


  return calculateDailyFinancialSummaryFromCache(

    date,

    localId

  );

}
