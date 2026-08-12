import { avgMoral, mamieAvailable, mamieChaptersLeft, pveUnlocked } from "./engine/economy.js";
import { isSoundOn } from "./engine/sound.js";
import { newState, patchState, save, setPrevStats, state } from "./state.js";
import { renderHome3Col } from "./ui/home3col.js";
import { renderEpilogue } from "./ui/epilogue.js";
import { renderGameOver, renderSeasonFinaleModal } from "./ui/season.js";
import { renderFinance } from "./ui/finance.js";
import { renderHome } from "./ui/home.js";
import { renderArtistModal, renderAudienceModal, renderBeatmakerModal, renderLabel, renderMarketModal, renderScoutModal } from "./ui/label.js";
import { renderAdminPanel, renderBankModal, renderBeatmakerDrawer, renderMamiePanel, renderNegotiationModal, renderProfilePanel, renderRetireConfirmModal } from "./ui/modals.js";
import { renderLookStep, renderProfile } from "./ui/profile.js";
import { renderRivalite, renderRivaliteLocked, renderRivalProfileModal } from "./ui/rivalite.js";
import { chapterStr, errorHTML, esc } from "./utils.js";

export const app = document.getElementById("app");

export function after(){
  safeRender();
  save();
}

/* Geste combinant deux champs d'état à la fois — ne rentre pas dans le
   setState() générique (une seule valeur), gardé comme petite fonction dédiée. */
export function reopenBeatmakerDrawer(){
  state.beatmakerDrawerOpen = true;
  state.beatmakerDrawerMin = false;
  safeRender();
}

/* Primitives génériques utilisées par le répartiteur d'événements (dispatch.js)
   pour les innombrables boutons qui se contentaient de faire
   `state.chemin.imbriqué = valeur; safeRender()` en ligne. Remplace un chemin
   pointé ("draft.type") sur l'objet state, puis ré-affiche (et sauvegarde
   pour la variante *Saved*). */
function resolveStatePath(path){
  const parts = path.split(".");
  let target = state;
  for(let i=0;i<parts.length-1;i++){ target = target[parts[i]]; }
  return {target, key: parts[parts.length-1]};
}
export function setState(path, value){
  const {target, key} = resolveStatePath(path);
  target[key] = value;
  safeRender();
}
export function setStateSaved(path, value){
  const {target, key} = resolveStatePath(path);
  target[key] = value;
  safeRender();
  save();
}

/* Animation rapide de révélation du talent (repérage) — réutilise l'overlay du roll */

/* Trois états : "auto" suit la préférence système (aucun attribut posé),
   "light" et "dark" forcent le thème et gagnent sur le système. */
function applyTheme(){
  const mode = state.ui.themeMode;
  if(mode === "light" || mode === "dark") document.documentElement.setAttribute("data-theme", mode);
  else document.documentElement.removeAttribute("data-theme");
}

export function render(){
  if(!state) state = newState();
  patchState();
  applyTheme();

  if(state.screen === "home") renderHome();
  else if(state.screen === "profile") renderProfile();
  else if(state.screen === "look") renderLookStep();
  else if(state.screen === "epilogue") renderEpilogue();
  else if(state.screen === "gameover") renderGameOver();
  else renderGame();
}

export function safeRender(){
  try{ render(); }catch(err){ app.innerHTML = errorHTML(err); }
}

/* Re-rendu qui conserve le focus/curseur d'un champ texte en cours d'édition
   (utile pour les formulaires "temps réel" comme la négociation de contrat) */

export function reRenderPreserveFocus(){
  const active = document.activeElement;
  const id = active && active.id;
  let selStart = null, selEnd = null;
  try{ selStart = active.selectionStart; selEnd = active.selectionEnd; }catch(e){}
  safeRender();
  if(id){
    const el = document.getElementById(id);
    if(el){
      el.focus();
      if(selStart !== null && el.setSelectionRange){
        try{ el.setSelectionRange(selStart, selEnd); }catch(e){}
      }
    }
  }
}

export function renderGame(){
  const negAlert = state.argent < 0 ? `<button class="hud-alert" data-action="openBank">⚠️ Trésorerie négative</button>` : "";
  const themeBtn = state.ui.themeMode === "light" ? "☀️" : state.ui.themeMode === "dark" ? "🌙" : "🌗";
  const themeTitle = state.ui.themeMode === "light" ? "Thème clair (cliquer pour le sombre)"
                   : state.ui.themeMode === "dark" ? "Thème sombre (cliquer pour suivre le système)"
                   : "Thème automatique — suit votre système (cliquer pour forcer le clair)";
  const soundOn = isSoundOn();
  const soundBtn = soundOn ? "🔊" : "🔇";
  const soundTitle = soundOn ? "Son activé (cliquer pour couper)" : "Son coupé (cliquer pour activer)";

  // Instantané des stats pour les petites flèches de variation. Les colonnes
  // lisent prevStats pendant le rendu : on ne le met à jour qu'APRÈS avoir
  // construit le HTML, sinon il n'y aurait jamais d'écart à afficher.
  const cur = {
    argent:state.argent, notoriete:state.notoriete,
    credibilite:state.credibilite, moral:avgMoral()
  };

  const pveOn = pveUnlocked();
  const rivalBadge = pveOn ? state.rivals.filter(r=>(r.aggro||0) >= 55).length : 0;

  // Trois destinations, comme sur la maquette. Finance n'est plus un onglet
  // à part entière : on y accède depuis la colonne des finances de l'accueil.
  const nav=[
    ["dash","🏠","Accueil",0,false],
    ["label","🎤","Label",state.projects.length,false],
    ["rivalite","⚔️","Rivalité",rivalBadge,!pveOn]
  ];

  const avatar = state.avatarPhoto
    ? `<img src="${state.avatarPhoto}" class="topbar-avatar">`
    : `<div class="topbar-avatar fallback">🧑‍🎤</div>`;

  const html = `
  <header class="topbar">
    <div class="topbar-brand">
      <span class="logo">MELODY<b>TYCOON</b></span>
      <span class="label-name">${esc(state.label)}</span>
    </div>

    <nav class="topnav">
      ${nav.map(t=>`
        <button class="${state.tab===t[0]?"active":""} ${t[4]?"locked":""}" data-action="setTab" data-args='${JSON.stringify([`${t[0]}`])}'>
          <span class="ic">${t[1]}</span><span class="tx">${t[2]}</span>
          ${t[4] ? `<span class="lock">🔒</span>` : ``}
          ${t[3] > 0 ? `<span class="badge">${t[3]}</span>` : ``}
        </button>
      `).join("")}
    </nav>

    <div class="topbar-side">
      ${negAlert}
      ${state.mamie.active && !state.mamie.independant
        ? `<button class="icon-btn ${mamieAvailable()?"mamie-ready":""}" data-action="toggleMamiePanel" title="${mamieAvailable()?"Mamie peut vous dépanner":`Mamie a déjà donné — encore ${mamieChaptersLeft()} épisode(s)`}">👵${mamieAvailable()?`<span class="dot"></span>`:``}</button>`
        : ``}
      ${state.mamie.independant ? `<span class="pill good">Indépendant</span>` : ``}
      ${state.adminMode ? `<button class="icon-btn admin" data-action="setState" data-args='${JSON.stringify(["adminPanelOpen", true])}' title="Mode Admin">🛠️</button>` : ``}
      <button class="icon-btn" data-action="toggleSound" title="${soundTitle}">${soundBtn}</button>
      <button class="icon-btn" data-action="toggleTheme" title="${themeTitle}">${themeBtn}</button>
      <div class="topbar-profile" data-action="setState" data-args='${JSON.stringify(["profilePanelOpen", true])}' title="${esc(state.managerName)} · ${state.player.age} ans — voir le profil">
        ${avatar}
        <div class="topbar-id">
          <b>${esc(state.managerName)||"Vous"}</b>
          <span class="tiny muted">${chapterStr()} · ${state.player.age} ans</span>
        </div>
      </div>
    </div>
  </header>

  ${state.seasonFinale ? renderSeasonFinaleModal() : ``}
  ${state.negotiation ? renderNegotiationModal() : ``}
  ${state.bankModal ? renderBankModal() : ``}
  ${state.artistSel ? renderArtistModal() : ``}
  ${state.audienceModal ? renderAudienceModal() : ``}
  ${state.marketSel ? renderMarketModal() : ``}
  ${state.beatmakerSel ? renderBeatmakerModal() : ``}
  ${state.scoutModal ? renderScoutModal() : ``}
  ${state.rivalProfile !== null ? renderRivalProfileModal() : ``}
  ${state.adminPanelOpen ? renderAdminPanel() : ``}
  ${state.mamie.panelOpen ? renderMamiePanel() : ``}
  ${state.profilePanelOpen ? renderProfilePanel() : ``}
  ${state.retireConfirmOpen ? renderRetireConfirmModal() : ``}

  <div id="tabContent">${renderTab()}</div>
  ${renderBeatmakerDrawer()}
  `;

  setPrevStats(cur);
  app.innerHTML = html;
}

/* ============================================================
   PANNEAU ADMIN — toute stat modifiable, avec impact réel
============================================================ */

export function setTab(t, sub){
  if(t === "rivalite" && !pveUnlocked()){
    state.tab = "rivalite";
    safeRender(); save();
    return;
  }
  state.tab = t;
  if(sub && t === "label") state.labelSub = sub;
  safeRender();
  save();
}

export function renderTab(){
  switch(state.tab){
    // L'accueil est la coquille 3 colonnes. Les autres écrans restent
    // en pleine largeur, comme avant.
    case "dash": return renderHome3Col();
    case "label": return renderLabel();
    case "finance": return renderFinance();
    case "rivalite": return pveUnlocked() ? renderRivalite() : renderRivaliteLocked();
  }
  return "";
}

/* ============================================================
   FINANCE — onglet interactif à part (plus une simple carte diluée)
============================================================ */

/* Cycle Auto → Clair → Sombre → Auto. "Auto" est le défaut : le jeu suit
   le thème du système tant que le joueur ne tranche pas lui-même. */
export function toggleTheme(){
  const ordre = ["auto","light","dark"];
  const i = ordre.indexOf(state.ui.themeMode);
  state.ui.themeMode = ordre[(i + 1) % ordre.length] || "auto";
  safeRender();
  save();
}

/* ============================================================
   DASHBOARD
============================================================ */

export function gotoObjective(tab, sub){
  state.tab = tab;
  if(sub && tab === "label") state.labelSub = sub;
  safeRender();
  setTimeout(()=>{
    const el = document.getElementById("tabContent");
    if(el){
      el.classList.add("flash-highlight");
      setTimeout(()=>el.classList.remove("flash-highlight"), 3300);
    }
  },60);
}

