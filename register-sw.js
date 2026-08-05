/* Registers the offline shell relative to this page, so it works from a
   project path like /chakula-chetu/ as well as from a domain root. */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
  });
}
