// HTML documents can be replaced inside an existing view without a workspace event.
// Keep the compatibility poll only while such a view exists.
function createViewObservation({ hasViews, observe, setTimer = setInterval, clearTimer = clearInterval }) {
  let timer = null, disposed = false;
  const sync = () => {
    if (disposed) return;
    observe();
    if (hasViews()) {
      if (timer === null) timer = setTimer(sync, 750);
    } else if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };
  return { sync, dispose() {
    disposed = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
  } };
}
module.exports = { createViewObservation };
