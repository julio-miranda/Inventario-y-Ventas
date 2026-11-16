export function getCurrentPageFile() {

  const file =
    window.location.pathname
      .split("/")
      .pop()
      .toLowerCase();


  return (
    file ||
    "index.html"
  );

}
