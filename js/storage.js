/* ============================================================
   STOCKAGE — seul fichier autorisé à toucher localStorage.
   Aucun autre fichier du jeu ne doit appeler localStorage directement.
   API principale : loadState() / saveState(state).
   (+ deux petits utilitaires pour "existe-t-il une sauvegarde ?" et
   "effacer la sauvegarde", pour que vraiment TOUT accès passe par ici.)
============================================================ */

/* Chaque refonte qui change la forme du state en profondeur prend sa propre
   clé : une vieille sauvegarde rechargée dans un moteur qui ne l'attend plus
   donnerait un état bâtard, et les sauvegardes des versions précédentes
   restent intactes de leur côté.
   v3 = V0.8 (chapitres/saisons au lieu de jours, épisode unique).
   v4 = V0.9 (deux jauges Notoriété/Crédibilité au lieu de quatre, jalons
        vécus, mandats, PNJ persistants). */
const SAVE_KEY = "melody_tycoon_v4";

function safeGetItem(key){
  try{ return localStorage.getItem(key); }
  catch(e){ return null; }
}
function safeSetItem(key, value){
  try{ localStorage.setItem(key, value); return true; }
  catch(e){ return false; }
}
function safeRemoveItem(key){
  try{ localStorage.removeItem(key); }
  catch(e){}
}

/* Lit et parse l'état sauvegardé. Retourne null si rien n'est sauvegardé
   ou si la sauvegarde est corrompue (jamais d'exception qui remonte). */
export function loadState(){
  const raw = safeGetItem(SAVE_KEY);
  if(!raw) return null;
  try{
    return JSON.parse(raw);
  }catch(e){
    return null;
  }
}

/* Sérialise et écrit l'état tel quel. C'est à l'appelant de préparer
   l'objet à sauvegarder (ex: nettoyer les champs transitoires) — ce
   fichier ne connaît rien à la forme du state du jeu. */
export function saveState(state){
  try{
    return safeSetItem(SAVE_KEY, JSON.stringify(state));
  }catch(e){
    return false;
  }
}

export function hasSavedState(){
  return !!safeGetItem(SAVE_KEY);
}

export function clearSavedState(){
  safeRemoveItem(SAVE_KEY);
}
