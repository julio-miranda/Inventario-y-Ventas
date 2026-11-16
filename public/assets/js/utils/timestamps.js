export function getTimestampMs(
  value
) {

  if (

    value ===
    null ||

    value ===
    undefined ||

    value ===
    ""

  ) {

    return 0;

  }


  if (
    typeof value.toMillis ===
    "function"
  ) {

    return value.toMillis();

  }


  if (
    typeof value.toDate ===
    "function"
  ) {

    const date =
      value.toDate();


    return Number.isFinite(

      date.getTime()

    )

      ? date.getTime()

      : 0;

  }


  if (

    typeof value ===
    "object" &&

    typeof value.seconds ===
    "number"

  ) {

    return (

      value.seconds *
      1000

    );

  }


  if (
    typeof value ===
    "number"
  ) {

    return value;

  }


  if (
    value instanceof
    Date
  ) {

    return value.getTime();

  }


  const date =
    new Date(
      value
    );


  return Number.isFinite(

    date.getTime()

  )

    ? date.getTime()

    : 0;

}
