/* ============================================================
   DISPATCH — délégation d'événements.
   Le HTML du jeu est entièrement régénéré à chaque rendu (innerHTML),
   donc on ne peut pas attacher un listener par bouton : on en pose UN
   SEUL de chaque type sur #app (qui, lui, n'est jamais recréé), et on
   route vers la bonne fonction via des attributs data-action/data-args
   plutôt que des onclick="..." inline.

   Attributs reconnus, posés par les fichiers ui/*.js au rendu :
   - data-action="nom"        (+ data-args='[...]' optionnel) → clic
   - data-close="champ"       → clic direct sur le fond d'une modale
   - data-onchange="nom"      (+ data-args)  → événement change
   - data-oninput="nom"       (+ data-args)  → événement input
   - data-onchange-element="nom" → change, appelle nom(element) plutôt que nom(valeur)
   - data-oninput-set="chemin.pointé" → input texte "silencieux" (pas de rerender)
============================================================ */
import { app, gotoObjective, reopenBeatmakerDrawer, safeRender, setState, setStateSaved, setTab, toggleTheme } from "./render.js";
import { startGame, state } from "./state.js";
import { adminNudge, adminSetStat, patchNegoLive } from "./ui/modals.js";
import { confirmRetire, dismissEpilogue, restartFromEpilogue } from "./engine/player.js";
import { continueGame, goProfile, wipeSave } from "./ui/home.js";
import { clearAvatar, goLookStep, handleAvatarUpload, onLabelInput, onManagerInput, quitAdmin, rerollLookHint, rerollStart, selectStart, tapSecret } from "./ui/profile.js";
import { patchMarketResults } from "./ui/label.js";
import { confirmScout, marketGoPage, recruitBeatmaker, setMarketFilter, setMarketGenre, setMarketPopBracket, setMarketSalaireSort, setMarketSearch, setMarketTalentBracket } from "./engine/market.js";
import { confirmAudienceChange, giveBonus, giveRest, openAudienceChange, releaseArtist, setAudienceGenre, toggleAudienceTheme } from "./engine/artists.js";
import { negoBackToInitial, negoExposeCareer, negoOpenCustom, negoRefuse, negoSetDuration, negoSetField, negoSubmitCustom, negoValidate, openMarketNego } from "./engine/contracts.js";
import { chooseDraftMode, draftAdvance, draftGoStep, launchBeatProject, launchProject, openArtistProjectFromModal, regenerateDraftTitle, startDraft } from "./engine/production.js";
import { adminNextEpisode, resolveEpisodeChoice } from "./engine/narrative.js";
import { closeSeasonFinale } from "./engine/season.js";
import { rivalAttack, rivalDefend } from "./engine/rivalite.js";
import { openBank, repayLoan, takeLoan, toggleMamiePanel, useMamieHelp } from "./engine/economy.js";
import { goProduce } from "./engine/actions.js";
import { publier } from "./engine/social.js";
import { toggleSound as toggleSoundState, unlockAudio } from "./engine/sound.js";

/* Ces deux actions se déclenchent à CHAQUE frappe (recherche d'artiste,
   chiffres de négociation). Un rendu complet (safeRender/reRenderPreserveFocus)
   y recréait toute la page à chaque lettre : les animations d'entrée de la
   modale/des cartes rejouaient (effet de clignotement) et les <input>
   recréés perdaient leur curseur (la frappe semblait s'arrêter, surtout sur
   les champs numériques). On mute l'état normalement, puis on rafraîchit
   uniquement le fragment DOM concerné ; seul un état inattendu (modale
   fermée entre-temps, etc.) fait retomber sur un rendu complet classique. */
function negoSetFieldLive(key, val){
  negoSetField(key, val);
  if(!patchNegoLive()) safeRender();
}

function setMarketSearchLive(v){
  setMarketSearch(v);
  if(!patchMarketResults()) safeRender();
}

/* engine/sound.js reste volontairement indépendant de render.js (il ne
   connaît que l'état, pas le rendu) : c'est ici qu'on ajoute le rafraîchissement
   visuel de l'icône 🔊/🔇, comme pour les autres actions "Live" ci-dessus. */
function toggleSound(){
  toggleSoundState();
  safeRender();
}

/* Registre : nom (tel qu'écrit dans data-action="...") -> fonction réelle. */
const ACTIONS = {
  adminNextEpisode, adminNudge, adminSetStat, chooseDraftMode, closeSeasonFinale, confirmAudienceChange, confirmScout, continueGame, draftAdvance,
  draftGoStep, giveBonus, giveRest, goLookStep, goProfile, clearAvatar,
  gotoObjective, launchBeatProject, launchProject, negoBackToInitial,
  negoExposeCareer, negoOpenCustom, negoRefuse, negoSetDuration, negoSubmitCustom,
  negoValidate, openArtistProjectFromModal, openAudienceChange, openBank,
  openMarketNego, goProduce, publier, recruitBeatmaker, regenerateDraftTitle, releaseArtist,
  reopenBeatmakerDrawer, repayLoan, resolveEpisodeChoice, rivalAttack, rivalDefend,
  selectStart, setAudienceGenre, setMarketFilter, setState, setStateSaved, setTab,
  startDraft, startGame, takeLoan, toggleAudienceTheme, tapSecret, quitAdmin,
  toggleTheme, toggleSound, toggleMamiePanel, useMamieHelp, wipeSave, marketGoPage, confirmRetire, dismissEpilogue, restartFromEpilogue,
  // data-onchange / data-oninput
  setMarketGenre, setMarketPopBracket, setMarketSalaireSort, setMarketTalentBracket,
  negoSetFieldLive, onLabelInput, onManagerInput, setMarketSearchLive, rerollStart, rerollLookHint,
  // data-onchange-element
  handleAvatarUpload
};

function readArgs(el){
  const raw = el.getAttribute("data-args");
  if(!raw) return [];
  try{ return JSON.parse(raw); }catch(e){ return []; }
}

function resolveStatePathLocal(path){
  const parts = path.split(".");
  let target = state;
  for(let i=0;i<parts.length-1;i++){ target = target[parts[i]]; }
  return {target, key: parts[parts.length-1]};
}

export function initDispatch(){
  app.addEventListener("click", (e)=>{
    // Les navigateurs n'autorisent l'audio qu'après un geste utilisateur :
    // le tout premier clic sur l'appli débloque le contexte. Sans effet
    // ensuite (l'appel est sans risque à répéter).
    unlockAudio();
    // Fond de modale cliqué directement (pas un de ses enfants) : fermeture.
    // Chemin pointé accepté ("mamie.panelOpen") comme pour data-oninput-set,
    // sinon la fermeture d'un état imbriqué posait null sur un nouveau champ
    // plat au lieu du champ réel (le clic hors-modale ne fermait rien).
    if(e.target.dataset && e.target.dataset.close){
      const {target, key} = resolveStatePathLocal(e.target.dataset.close);
      target[key] = null;
      safeRender();
      return;
    }
    const el = e.target.closest("[data-action]");
    if(!el) return;
    const name = el.getAttribute("data-action");
    const fn = ACTIONS[name];
    if(typeof fn !== "function"){
      console.error(`[dispatch] action inconnue: "${name}"`);
      return;
    }
    fn(...readArgs(el));
  });

  app.addEventListener("input", (e)=>{
    const setEl = e.target.closest("[data-oninput-set]");
    if(setEl){
      const path = setEl.getAttribute("data-oninput-set");
      const {target, key} = resolveStatePathLocal(path);
      target[key] = e.target.value;
      return; // pas de rerender ici, volontairement (comme avant)
    }
    const el = e.target.closest("[data-oninput]");
    if(!el) return;
    const name = el.getAttribute("data-oninput");
    const fn = ACTIONS[name];
    if(typeof fn !== "function"){
      console.error(`[dispatch] action inconnue (oninput): "${name}"`);
      return;
    }
    fn(...readArgs(el), e.target.value);
  });

  app.addEventListener("change", (e)=>{
    const elElement = e.target.closest("[data-onchange-element]");
    if(elElement){
      const name = elElement.getAttribute("data-onchange-element");
      const fn = ACTIONS[name];
      if(typeof fn === "function") fn(e.target);
      return;
    }
    const el = e.target.closest("[data-onchange]");
    if(!el) return;
    const name = el.getAttribute("data-onchange");
    const fn = ACTIONS[name];
    if(typeof fn !== "function"){
      console.error(`[dispatch] action inconnue (onchange): "${name}"`);
      return;
    }
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    fn(...readArgs(el), value);
  });
}
