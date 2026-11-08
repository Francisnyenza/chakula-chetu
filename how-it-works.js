/* How it works — gentle reveal using Anime.js.
   If the library cannot load (for example, no internet), nothing is hidden
   and the section simply shows as plain text. */
(function () {
  const root = document.getElementById('how');
  if (!root) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  import('https://esm.sh/animejs@4.5.0').then(function (mod) {
    const animate = mod.animate, stagger = mod.stagger, scrambleText = mod.scrambleText;
    const items = Array.from(root.querySelectorAll('li'));
    const nums = Array.from(root.querySelectorAll('.num'));
    const title = root.querySelector('h3');
    root.classList.add('hiw-ready');

    function play() {
      try {
        animate(items, { opacity: [0, 1], y: [28, 0], delay: stagger(140), duration: 700, ease: 'outExpo' });
        animate(nums, { scale: [0.6, 1], delay: stagger(140, { start: 200 }), duration: 600, ease: 'outBack' });
      } catch (e) { root.classList.remove('hiw-ready'); return; }
      try { animate(title, { innerHTML: scrambleText({ duration: 900 }) }); } catch (e) { /* title just stays as is */ }
    }

    let played = false;
    const io = new IntersectionObserver(function (entries) {
      if (!played && entries.some(function (e) { return e.isIntersecting; })) {
        played = true; io.disconnect(); play();
      }
    }, { threshold: 0.25 });
    io.observe(root);
  }).catch(function () { /* offline: leave the section visible */ });
})();
