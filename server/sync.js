'use strict';
/* ============================================================
   Merging a kitchen that was edited in two places.

   The client stamps each section it touches with the time of the edit
   (`_ts`). When two devices have both moved on, the newer edit of each
   section wins — so a shopping list ticked off on a phone and a weekly
   menu made on a laptop both survive, because they are different
   sections.

   The limit, stated plainly: editing the SAME section on two devices
   while one is offline keeps only the later edit. Nothing is silently
   half-merged, and the loser is never a partial record.
   ============================================================ */

const SECTIONS = ['favs', 'plans', 'myFoods', 'filters', 'budget', 'recent', 'lang'];

/** Largest kitchen we will store, in bytes of JSON. */
const MAX_BYTES = 512 * 1024;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Strip anything that is not a section we know about, and enforce shapes. */
function sanitize(input) {
  const src = isObject(input) ? input : {};
  const out = {
    favs: Array.isArray(src.favs) ? src.favs.filter((f) => typeof f === 'string').slice(0, 500) : [],
    plans: isObject(src.plans) ? src.plans : {},
    myFoods: Array.isArray(src.myFoods) ? src.myFoods.filter(isObject).slice(0, 500) : [],
    filters: isObject(src.filters) ? src.filters : {},
    budget: isObject(src.budget) ? src.budget : {},
    recent: isObject(src.recent) ? src.recent : {},
    lang: src.lang === 'sw' ? 'sw' : 'en',
    _ts: {},
  };
  const ts = isObject(src._ts) ? src._ts : {};
  for (const key of SECTIONS) {
    const value = Number(ts[key]);
    if (Number.isFinite(value) && value > 0) out._ts[key] = Math.min(value, Date.now() + 60_000);
  }
  return out;
}

function tooBig(data) {
  return Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_BYTES;
}

/**
 * Combine the stored kitchen with one arriving from a device.
 * `incoming` wins a section when its timestamp is at least as new — it is
 * the edit the cook just made, so ties go to the person who is here now.
 */
function merge(stored, incoming) {
  const a = sanitize(stored);
  const b = sanitize(incoming);
  const out = { _ts: {} };
  for (const key of SECTIONS) {
    const tsA = a._ts[key] || 0;
    const tsB = b._ts[key] || 0;
    const takeIncoming = tsB >= tsA;
    out[key] = takeIncoming ? b[key] : a[key];
    const ts = Math.max(tsA, tsB);
    if (ts) out._ts[key] = ts;
  }
  return out;
}

module.exports = { SECTIONS, MAX_BYTES, sanitize, merge, tooBig };
