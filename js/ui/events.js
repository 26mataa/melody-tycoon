import { choiceAbordable, choiceRequiredArgent } from "../engine/events.js";
import { episodeChoices } from "../engine/narrative.js";
import { seasonTitle } from "../engine/season.js";
import { state } from "../state.js";

/* ============================================================
   L'ÉPISODE EN COURS — le cœur du jeu.
   Un seul épisode affiché à la fois : c'est lui que le joueur lit,
   c'est son choix qui fait avancer le temps d'un chapitre.
============================================================ */

export function renderEpisode(){
  const ep = state.currentEpisode;

  if(!ep){
    // Il ne devrait jamais rien manquer ici : si le pool est vide, on le dit
    // franchement plutôt que d'afficher un écran mort.
    return `
    <div class="episode-card">
      <div class="episode-meta">${seasonTitle()}</div>
      <div class="t">Un moment de calme</div>
      <div class="small muted">Rien ne se passe pour l'instant. Occupez-vous de votre label — les choses reprendront d'elles-mêmes.</div>
    </div>`;
  }

  const badge = (ep.imp||1) >= 3 ? `<span class="ev-badge critical">Moment critique</span>`
              : (ep.imp||1) >= 2 ? `<span class="ev-badge important">Moment important</span>`
              : ``;

  return `
  <div class="episode-card imp${ep.imp||1}">
    <div class="episode-meta">
      <span>${seasonTitle()}</span>
      <span class="pill">Épisode ${Math.max(1,(state.episodeInSeason||0)+1)} / ${state.seasonLength}</span>
    </div>
    ${badge}
    <div class="t">${ep.title}</div>
    <div class="d">${ep.desc}</div>
    <div class="choices">
      ${episodeChoices(ep).map((c,ci)=>{
        const need = choiceRequiredArgent(c);
        const can = choiceAbordable(c);
        return `
        <button class="episode-choice" ${can?`data-action="resolveEpisodeChoice" data-args='${JSON.stringify([ci])}'`:"disabled"} title="${can?"":"Fonds insuffisants pour cette option"}">
          <div>${c.t}</div>
          ${c.p !== undefined ? `<div class="impacts"><span class="pill">🎲 Pari incertain</span></div>` : ``}
        </button>`;
      }).join("")}
    </div>
  </div>`;
}

/* Rappel affiché quand le label n'a encore aucune voix : c'est la première
   chose que le joueur doit régler. */
export function renderNoArtistPush(){
  return `
  <div class="episode-card push">
    <div class="t">🎤 Votre label n'a pas encore de voix</div>
    <div class="d">Vous avez un nom, une idée, et pas grand-chose d'autre. La première étape est de trouver quelqu'un à signer.</div>
    <div class="choices">
      <button class="episode-choice primary" data-action="setTab" data-args='${JSON.stringify(["label","recruter"])}'>
        <div>Aller chercher un artiste</div>
      </button>
    </div>
  </div>`;
}
