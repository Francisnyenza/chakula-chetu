/* Install the offline shell. Harmless where service workers are unavailable
   (older browsers, or opening the files without a server). */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* the app works without it */ });
  });
}
