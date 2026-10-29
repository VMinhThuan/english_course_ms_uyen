// iPadOS Safari does not consistently honour `body { overflow: hidden }`.
// Keeping the body fixed also preserves the reader's exact position while a
// dialog or navigation drawer is open. The small reference count means that
// closing one overlay cannot accidentally re-enable page scrolling under
// another overlay.
const activeLocks = new Set();
let savedState = null;

export function acquireDocumentScrollLock() {
  const lock = Symbol('document-scroll-lock');
  activeLocks.add(lock);

  if (activeLocks.size === 1) {
    const body = document.body;
    const html = document.documentElement;
    savedState = {
      scrollY: window.scrollY,
      bodyCssText: body.style.cssText,
      htmlCssText: html.style.cssText,
    };

    html.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${savedState.scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeLocks.delete(lock);
    if (activeLocks.size || !savedState) return;

    const { scrollY, bodyCssText, htmlCssText } = savedState;
    document.body.style.cssText = bodyCssText;
    document.documentElement.style.cssText = htmlCssText;
    savedState = null;
    window.scrollTo(0, scrollY);
  };
}
