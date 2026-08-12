import { playSound } from "./engine/sound.js";

/* notify() ne sert qu'aux messages bloquants (fonds insuffisants, choix
   invalide...) — jamais aux bonnes nouvelles. Un seul point d'appel donc
   un seul endroit pour donner un retour sonore à chaque refus du jeu. */
export function notify(msg){
  playSound("refus");
  let n = document.getElementById("toast");
  if(!n){
    n = document.createElement("div");
    n.id = "toast";
    n.style.cssText = "position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--bad);color:#fff;padding:10px 16px;border-radius:10px;font-weight:700;z-index:200;box-shadow:0 8px 20px rgba(0,0,0,.3)";
    document.body.appendChild(n);
  }
  n.textContent = msg;
  n.style.display = "block";
  clearTimeout(n._t);
  n._t = setTimeout(()=>{ n.style.display="none"; }, 2600);
}

/* ============================================================
   PROGRESSION / TIER — tout scale là-dessus
============================================================ */

