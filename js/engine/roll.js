import { impact } from "./economy.js";
import { after, safeRender } from "../render.js";
import { save, state } from "../state.js";
import { chipsFromDeltas } from "../ui/chips.js";
import { chance, esc, rint } from "../utils.js";

export function rollSnapshot(){
  return {argent:state.argent,notoriete:state.notoriete,credibilite:state.credibilite};
}

export function rollDiff(before){
  const now = rollSnapshot();
  const deltas = {};
  Object.keys(before).forEach(k=>{
    const d = now[k]-before[k];
    if(Math.abs(d) > 0.01) deltas[k]=d;
  });
  return deltas;
}

/* onDone (optionnel) : joué une fois l'animation terminée et le résultat lu,
   avant le rerender. C'est là que le chapitre avance quand le roll vient d'un
   choix narratif — de cette façon les chips d'impact ne montrent que l'effet
   du choix, pas la dérive économique du chapitre qui suit. */
export function performRoll(p,onSuccess,onFail,winMsg,loseMsg,onDone){
  const bg = document.getElementById("rollBg");
  const em = document.getElementById("rollEmoji");
  const rs = document.getElementById("rollResult");
  const lb = document.getElementById("rollLabel");
  if(!bg || !em || !rs || !lb){
    if(chance(p)) onSuccess && onSuccess(); else onFail && onFail();
    if(onDone) onDone();
    after();
    return;
  }
  bg.classList.add("show");
  lb.textContent = "Le destin se joue...";
  rs.innerHTML = "";
  rs.className = "roll-result";
  em.className = "roll-emoji spin";
  em.textContent = "🎲";
  const before = rollSnapshot();
  const totalTicks = rint(4,5);
  let tick = 0;
  const iv = setInterval(()=>{
    tick++;
    em.textContent = tick % 2 === 0 ? "✅" : "🚫";
    if(tick >= totalTicks){
      clearInterval(iv);
      const s = chance(p);
      em.className = "roll-emoji reveal " + (s ? "good" : "bad");
      em.textContent = s ? "✅" : "🚫";
      if(s) onSuccess && onSuccess(); else onFail && onFail();
      const deltas = rollDiff(before);
      const chips = chipsFromDeltas(deltas);
      rs.innerHTML = `<div>${esc(s ? (winMsg || "GAGNÉ !") : (loseMsg || "PERDU..."))}</div>${chips ? `<div class="impacts" style="justify-content:center;margin-top:8px">${chips}</div>` : ``}`;
      rs.classList.add(s ? "good" : "bad");
      setTimeout(()=>{
        bg.classList.remove("show");
        if(onDone) onDone();
        safeRender();
        save();
      },900);
    }
  },220);
}

export function revealTalentAnimation(min, max, final, onDone){
  const bg = document.getElementById("rollBg");
  const em = document.getElementById("rollEmoji");
  const rs = document.getElementById("rollResult");
  const lb = document.getElementById("rollLabel");
  if(!bg || !em || !rs || !lb){ onDone(); return; }
  bg.classList.add("show");
  lb.textContent = "Révélation du talent...";
  rs.innerHTML = "";
  rs.className = "roll-result";
  em.className = "roll-emoji spin";
  em.textContent = "🎤";
  const totalTicks = 6;
  let tick = 0;
  const iv = setInterval(()=>{
    tick++;
    em.textContent = tick >= totalTicks ? String(final) : String(rint(min,max));
    if(tick >= totalTicks){
      clearInterval(iv);
      em.className = "roll-emoji reveal " + (final >= (min+max)/2 ? "good" : "bad");
      rs.innerHTML = `<div>Talent révélé : <b>${final}</b> (fourchette annoncée : ${min}-${max})</div>`;
      rs.classList.add("good");
      setTimeout(()=>{
        bg.classList.remove("show");
        onDone();
      },800);
    }
  },130);
}

/* ============================================================
   ACTIONS RAPIDES — chaque action affiche son impact avant d'être cliquée
============================================================ */

