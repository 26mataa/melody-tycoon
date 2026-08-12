import { notify } from "../notify.js";
import { app, safeRender } from "../render.js";
import { load, resetState, state } from "../state.js";
import { clearSavedState, hasSavedState } from "../storage.js";

export function renderHome(){
  const has = hasSavedState();
  const notes = ["🎵","🎤","💿","🎧","🎹","🎸","⭐","💰"];
  const floats = Array.from({length:14}, ()=>{
    const left = Math.round(Math.random()*100);
    const dur = (14 + Math.random()*14).toFixed(1);
    const delay = (-Math.random()*20).toFixed(1);
    const emoji = notes[Math.floor(Math.random()*notes.length)];
    return `<span class="float-note" style="left:${left}%;animation-duration:${dur}s;animation-delay:${delay}s">${emoji}</span>`;
  }).join("");

  app.innerHTML = `
  <div class="center">
    ${floats}
    <div class="bigtitle">MELODY <span>TYCOON</span></div>
    <div class="subtitle">Gérez un label musical. Signez des artistes. Produisez des sons. Affrontez vos rivaux. Devenez un empire.</div>
    <div class="row">
      <button class="primary" data-action="goProfile">🎬 Nouvelle partie</button>
      ${has ? `<button data-action="continueGame">▶️ Continuer</button>` : ``}
    </div>
    ${has ? `<button class="ghost small danger" data-action="wipeSave">Effacer la sauvegarde</button>` : ``}
  </div>`;
}

export function goProfile(){
  state.screen = "profile";
  state.startId = state.startId || "zero";
  safeRender();
}

export function wipeSave(){
  clearSavedState();
  resetState();
  safeRender();
}

export function continueGame(){
  if(load()){
    state.screen = "game";
    safeRender();
  }else{
    notify("Sauvegarde impossible à charger.");
  }
}

