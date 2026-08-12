/* ============================================================
   LE MIX FINAL — le seul moment où le joueur a les mains dedans.

   Un projet se produit tout seul, chapitre après chapitre. Mais au
   moment de le livrer, il reste un geste : caler le mix. Une barre,
   un curseur qui va-et-vient, trois tentatives, une zone à viser.

   Volontairement UN seul moment fort par projet, à la fin — pas un
   QTE à chaque chapitre (insupportable sur un album de 8 chapitres).
   L'impact reste modeste (±10 sur la qualité) : c'est du gamefeel,
   pas un substitut au travail de production.

   Composant autonome : il ne connaît rien du moteur, il rend un
   résultat via un callback. Si le DOM n'est pas là (banc de test),
   il rend un résultat neutre immédiatement.
============================================================ */
import { playSound } from "../engine/sound.js";

const ESSAIS = 3;

/* Largeur de la zone parfaite/correcte selon la difficulté du format :
   plus le projet est ambitieux, plus le geste est exigeant.

   Nettement élargi : à l'ancienne échelle, un album (difficulté 4)
   n'offrait que 10 % de barre en zone parfaite avec un curseur qui
   traversait l'écran en moins d'une seconde — injouable autrement qu'au
   hasard, ce qui vidait le mini-jeu de son sens. On veut un geste
   d'adresse, pas une loterie : le joueur attentif doit réussir, le
   joueur distrait doit rater. */
function zonesPour(difficulte){
  const parfait = Math.max(14, 30 - difficulte * 3);   // % de la barre
  const correct = parfait * 2.4;
  return {parfait, correct};
}

export function launchMixQTE(opts, onDone){
  const titre = (opts && opts.titre) || "votre projet";
  const difficulte = (opts && opts.difficulte) || 1;
  const zones = zonesPour(difficulte);

  // On accroche l'overlay au <body>, pas à #app : #app est entièrement
  // reconstruit à chaque rendu, ce qui effacerait le mini-jeu en plein milieu.
  const host = document.body;
  if(!host || typeof requestAnimationFrame !== "function"){
    // Pas d'interface (tests, environnement sans DOM) : aucun bonus, aucun malus.
    onDone({bonus:0, label:"Mix standard", cls:"", score:0});
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "mixqte-bg";
  overlay.innerHTML = `
    <div class="mixqte-card">
      <div class="mixqte-title">🎚️ Mix final</div>
      <div class="mixqte-sub">« ${titre} » est prêt. Il reste à caler le mix.<br>Cliquez (ou Espace) quand le curseur passe dans la zone.</div>

      <div class="mixqte-bar" id="mixqteBar">
        <div class="mixqte-zone correct" style="left:${50 - zones.correct/2}%;width:${zones.correct}%"></div>
        <div class="mixqte-zone parfait" style="left:${50 - zones.parfait/2}%;width:${zones.parfait}%"></div>
        <div class="mixqte-cursor" id="mixqteCursor"></div>
      </div>

      <div class="mixqte-tries" id="mixqteTries"></div>
      <div class="mixqte-result" id="mixqteResult"></div>
      <button class="ghost small mixqte-skip" id="mixqteSkip">Laisser l'ingé son s'en charger</button>
    </div>`;
  host.appendChild(overlay);

  const bar = overlay.querySelector("#mixqteBar");
  const cursor = overlay.querySelector("#mixqteCursor");
  const triesEl = overlay.querySelector("#mixqteTries");
  const resultEl = overlay.querySelector("#mixqteResult");
  const skipBtn = overlay.querySelector("#mixqteSkip");

  let pos = 0;               // 0..1 le long de la barre
  let dir = 1;
  // Ralenti d'environ un tiers : le curseur reste lisible à l'œil.
  let vitesse = 0.0065 + difficulte * 0.0013;
  let essais = 0;
  let scores = [];
  let raf = null;
  let fini = false;

  function majEssais(){
    triesEl.innerHTML = Array.from({length:ESSAIS}, (_,i)=>{
      const s = scores[i];
      const cls = s === undefined ? "" : (s >= 2 ? "parfait" : s === 1 ? "correct" : "rate");
      return `<span class="mixqte-dot ${cls}"></span>`;
    }).join("");
  }
  majEssais();

  function boucle(){
    pos += dir * vitesse;
    if(pos >= 1){ pos = 1; dir = -1; }
    if(pos <= 0){ pos = 0; dir = 1; }
    cursor.style.left = (pos*100) + "%";
    raf = requestAnimationFrame(boucle);
  }
  raf = requestAnimationFrame(boucle);

  function frapper(){
    if(fini) return;
    const ecart = Math.abs(pos*100 - 50);          // distance au centre, en % de barre
    let s;
    if(ecart <= zones.parfait/2) s = 2;
    else if(ecart <= zones.correct/2) s = 1;
    else s = 0;

    scores.push(s);
    essais++;
    majEssais();
    playSound(s === 2 ? "mixParfait" : s === 1 ? "mixCorrect" : "mixRate");

    cursor.className = "mixqte-cursor " + (s === 2 ? "hit-parfait" : s === 1 ? "hit-correct" : "hit-rate");
    setTimeout(()=>{ if(!fini) cursor.className = "mixqte-cursor"; }, 220);

    // Ça accélère un peu à chaque essai : la tension monte, sans que le
    // troisième essai devienne un coup de dés.
    vitesse += 0.0012;

    if(essais >= ESSAIS) terminer();
  }

  function terminer(){
    if(fini) return;
    fini = true;
    cancelAnimationFrame(raf);
    document.removeEventListener("keydown", onKey);

    const total = scores.reduce((a,b)=>a+b, 0);   // 0 à 6
    let bonus, label, cls;
    if(total >= 5){ bonus = 10; label = "Mix impeccable"; cls = "good"; }
    else if(total >= 3){ bonus = 5;  label = "Bon mix"; cls = "good"; }
    else if(total >= 1){ bonus = 0;  label = "Mix correct"; cls = ""; }
    else { bonus = -8; label = "Mix bâclé"; cls = "bad"; }

    resultEl.className = "mixqte-result show " + cls;
    resultEl.innerHTML = `<b>${label}</b><br><span class="small">${bonus>0?`+${bonus}`:bonus===0?"±0":bonus} de qualité finale</span>`;
    skipBtn.style.display = "none";

    setTimeout(()=>{
      overlay.classList.add("out");
      setTimeout(()=>{
        if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
        onDone({bonus, label, cls, score:total});
      }, 220);
    }, 1100);
  }

  function onKey(e){
    if(e.code === "Space" || e.code === "Enter"){
      e.preventDefault();
      frapper();
    }
  }

  bar.addEventListener("click", frapper);
  document.addEventListener("keydown", onKey);
  skipBtn.addEventListener("click", ()=>{
    // Déléguer : pas de bonus, pas de malus. Toujours une porte de sortie.
    if(fini) return;
    fini = true;
    cancelAnimationFrame(raf);
    document.removeEventListener("keydown", onKey);
    if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
    onDone({bonus:0, label:"Mix délégué", cls:"", score:0});
  });
}
