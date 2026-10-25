let installed = false;
let activeGuard = null;
let restoringHistory = false;

export const installUnsavedNavigationGuard = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Install before BrowserRouter so a canceled browser Back/Forward event can
  // be stopped before React Router changes the active route.
  window.addEventListener('popstate', (event) => {
    if (restoringHistory) {
      restoringHistory = false;
      event.stopImmediatePropagation?.();
      return;
    }
    if (!activeGuard || activeGuard.allowNavigation()) return;

    event.stopImmediatePropagation?.();
    const currentIndex = Number(window.history.state?.idx);
    const targetIndex = Number(activeGuard.historyIndex);
    const delta = Number.isFinite(currentIndex) && Number.isFinite(targetIndex)
      ? targetIndex - currentIndex
      : 1;
    if (delta === 0) return;
    restoringHistory = true;
    window.history.go(delta);
  }, true);
};

export const setUnsavedNavigationGuard = (guard) => {
  activeGuard = guard;
};
