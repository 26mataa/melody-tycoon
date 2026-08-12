import { app } from "../render.js";
import { state } from "../state.js";
import { esc, fmt } from "../utils.js";

export function renderEpilogue(){
  const d = state.epilogueData || {};
  app.innerHTML = `
  <div class="center epilogue-screen">
    <div class="epilogue-icon">${d.tierIcon||"🌅"}</div>
    <div class="bigtitle">Fin de <span>l'histoire</span></div>
    <div class="subtitle">${esc(d.manager)} quitte ${esc(d.label)} après ${d.years} an${d.years>1?"s":""} à la tête du label.</div>

    <div class="epilogue-stats">
      <div class="epilogue-stat"><div class="v">${d.tierIcon} ${esc(d.tierName)}</div><div class="l">Palier atteint</div></div>
      <div class="epilogue-stat"><div class="v">${d.artistsSigned}</div><div class="l">Artistes signés dans sa carrière</div></div>
      <div class="epilogue-stat"><div class="v">${d.hits}</div><div class="l">Hits produits</div></div>
      <div class="epilogue-stat"><div class="v">${fmt(d.argent)}</div><div class="l">Trésorerie finale</div></div>
      <div class="epilogue-stat"><div class="v">${d.age} ans</div><div class="l">Âge au moment de la retraite</div></div>
    </div>

    <p class="epilogue-flavor">${esc(d.flavor)}</p>

    <div class="row">
      <button class="primary" data-action="restartFromEpilogue">🔄 Recommencer une nouvelle vie</button>
      <button data-action="dismissEpilogue">▶️ Continuer quand même</button>
    </div>
  </div>`;
}
