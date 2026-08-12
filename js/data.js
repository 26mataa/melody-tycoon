/* ============================================================
   DONNÉES CHARGÉES — objet partagé unique.
   Tous les modules font `import { DATA } from "./data.js"` et lisent
   DATA.MARKET_DATA, DATA.THEMES, etc. C'est le même objet partout
   (jamais réassigné), donc pas de problème d'ordre d'import : il est
   juste vide tant que initData() n'a pas été attendu dans main.js.
============================================================ */
import { loadGameData } from "./data-loader.js";

export const DATA = {};

export async function initData(){
  const loaded = await loadGameData();
  Object.assign(DATA, loaded);
  return DATA;
}
