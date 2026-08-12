import { playSound } from "../engine/sound.js";

/* ============================================================
   LE SÉQUENCEUR — inspiré du step sequencer de FL Studio.

   La production de beats était la seule branche du jeu sans aucun
   moment joué : on payait, on attendait des chapitres, un chiffre
   tombait. C'est pourtant là que le geste de producteur est le plus
   évident à mettre en scène.

   Quatre pistes (kick, snare, hat, bass), seize pas. Le jeu affiche
   d'abord le motif à reproduire, puis l'efface : au joueur de le
   rejouer de mémoire en allumant les bonnes cases. Une tête de lecture
   balaie la grille en boucle pendant tout ce temps et fait sonner ce
   qui est allumé — on entend ce qu'on construit, donc on peut corriger
   à l'oreille autant qu'à la mémoire.

   Composant autonome, comme mixqte.js : il ne connaît rien du moteur,
   rend son résultat par callback, et rend immédiatement un résultat
   neutre s'il n'y a pas de DOM (bancs de test).
============================================================ */

const PAS = 16;

const PISTES = [
  {id:"kick",  nom:"Kick",  emoji:"🥁", freq:55,   type:"kick"},
  {id:"snare", nom:"Snare", emoji:"👏", freq:190,  type:"snare"},
  {id:"hat",   nom:"Hat",   emoji:"🎩", freq:9000, type:"hat"},
  {id:"bass",  nom:"Bass",  emoji:"🎸", freq:110,  type:"bass"}
];

/* Motifs de départ crédibles plutôt qu'un tirage purement aléatoire :
   une grille au hasard ne ressemble à aucune musique et n'est pas
   mémorisable. Ceux-ci sonnent comme de vrais patterns. */
const MOTIFS = [
  {
    nom:"Boom bap",
    kick: [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
    snare:[0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    bass: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0]
  },
  {
    nom:"Trap",
    kick: [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0],
    snare:[0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:  [1,1,1,0, 1,1,1,1, 1,1,1,0, 1,1,1,1],
    bass: [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0]
  },
  {
    nom:"Drill",
    kick: [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],
    snare:[0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    hat:  [1,0,1,1, 0,1,0,1, 1,0,1,1, 0,1,0,1],
    bass: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]
  },
  {
    nom:"House",
    kick: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare:[0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:  [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    bass: [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,0,0]
  },
  {
    nom:"Afro",
    kick: [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,0,0],
    snare:[0,0,1,0, 0,1,0,0, 0,0,1,0, 0,1,0,0],
    hat:  [1,1,0,1, 1,0,1,1, 1,1,0,1, 1,0,1,0],
    bass: [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0]
  }
];

/* ============================================================
   SYNTHÈSE — mêmes principes que engine/sound.js : pas de fichier
   audio, tout est fabriqué à la volée. Chaque piste a son timbre.
============================================================ */
let ctx = null;
function getCtx(){
  try{
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ctx = new AC();
    }
    return ctx;
  }catch(e){ return null; }
}

function frappe(type){
  const c = getCtx();
  if(!c || c.state === "suspended") return;
  try{
    const t = c.currentTime;
    const g = c.createGain();
    g.connect(c.destination);

    if(type === "hat" || type === "snare"){
      // Bruit filtré : un oscillateur ne fait pas une caisse claire.
      const len = Math.floor(c.sampleRate * (type === "hat" ? 0.035 : 0.13));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for(let i=0;i<len;i++) d[i] = (Math.random()*2-1) * (1 - i/len);
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = type === "hat" ? "highpass" : "bandpass";
      f.frequency.value = type === "hat" ? 7000 : 1900;
      src.connect(f); f.connect(g);
      g.gain.setValueAtTime(type === "hat" ? 0.16 : 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (type === "hat" ? 0.04 : 0.15));
      src.start(t); src.stop(t + 0.2);
      return;
    }

    const o = c.createOscillator();
    o.connect(g);
    if(type === "kick"){
      o.type = "sine";
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
      g.gain.setValueAtTime(0.42, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.start(t); o.stop(t + 0.25);
    }else{
      o.type = "triangle";
      o.frequency.setValueAtTime(110, t);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      o.start(t); o.stop(t + 0.22);
    }
  }catch(e){}
}

/* ============================================================
   LE MINI-JEU
   opts : {titre, difficulte 1-4}
   onDone({bonus, label, cls, score})
============================================================ */
export function launchStepQTE(opts, onDone){
  const titre = (opts && opts.titre) || "votre beat";
  const difficulte = Math.min(4, Math.max(1, (opts && opts.difficulte) || 1));

  const host = document.body;
  if(!host || typeof requestAnimationFrame !== "function"){
    onDone({bonus:0, label:"Beat standard", cls:"", score:0});
    return;
  }

  const motif = MOTIFS[Math.floor(Math.random()*MOTIFS.length)];

  /* La difficulté joue sur le nombre de pistes à reproduire et sur le
     temps d'observation, pas sur la vitesse : un séquenceur trop rapide
     devient illisible au lieu d'être exigeant. */
  const nbPistes = Math.min(PISTES.length, 1 + difficulte);
  const pistes = PISTES.slice(0, nbPistes);
  const memoMs = Math.max(2600, 5200 - difficulte * 550);

  const cible = {};
  pistes.forEach(p=>{ cible[p.id] = motif[p.id].slice(); });
  const joueur = {};
  pistes.forEach(p=>{ joueur[p.id] = new Array(PAS).fill(0); });

  const overlay = document.createElement("div");
  overlay.className = "stepqte-bg";
  overlay.innerHTML = `
    <div class="stepqte-card">
      <div class="stepqte-title">🎹 Séquenceur — « ${titre} »</div>
      <div class="stepqte-sub" id="stepqteSub">
        Motif <b>${motif.nom}</b>. Mémorisez-le : il va disparaître.
      </div>

      <div class="stepqte-grid" id="stepqteGrid">
        ${pistes.map(p=>`
          <div class="stepqte-row" data-piste="${p.id}">
            <div class="stepqte-lab">${p.emoji} ${p.nom}</div>
            <div class="stepqte-steps">
              ${Array.from({length:PAS}, (_,i)=>`
                <button class="stepqte-cell ${i%4===0?"beat":""}" data-piste="${p.id}" data-pas="${i}" type="button"></button>
              `).join("")}
            </div>
          </div>
        `).join("")}
        <div class="stepqte-head" id="stepqteHead"></div>
      </div>

      <div class="stepqte-foot">
        <div class="stepqte-timer" id="stepqteTimer"></div>
        <div class="stepqte-actions">
          <button class="ghost small" id="stepqteSkip" type="button">Laisser le beatmaker gérer</button>
          <button class="primary small" id="stepqteValid" type="button" disabled>Valider le motif</button>
        </div>
      </div>
      <div class="stepqte-result" id="stepqteResult"></div>
    </div>`;
  host.appendChild(overlay);

  const grid    = overlay.querySelector("#stepqteGrid");
  const head    = overlay.querySelector("#stepqteHead");
  const sub     = overlay.querySelector("#stepqteSub");
  const timerEl = overlay.querySelector("#stepqteTimer");
  const validBtn= overlay.querySelector("#stepqteValid");
  const skipBtn = overlay.querySelector("#stepqteSkip");
  const resEl   = overlay.querySelector("#stepqteResult");

  const cellules = {};
  pistes.forEach(p=>{
    cellules[p.id] = Array.from(overlay.querySelectorAll(`.stepqte-cell[data-piste="${p.id}"]`));
  });

  let phase = "memo";        // memo -> saisie -> fini
  let pasCourant = 0;
  let dernierPas = 0;
  let raf = null;
  let fini = false;
  const debut = performance.now();
  const TEMPO_MS = 125;      // 16 pas ≈ 2 s par boucle, soit 120 BPM

  function peindre(source){
    pistes.forEach(p=>{
      cellules[p.id].forEach((el,i)=>{
        el.classList.toggle("on", !!source[p.id][i]);
      });
    });
  }
  peindre(cible);

  function boucle(now){
    const t = now - debut;
    const pas = Math.floor(t / TEMPO_MS) % PAS;
    if(pas !== dernierPas){
      dernierPas = pas;
      pasCourant = pas;
      head.style.left = `calc(var(--stepqte-lab-w) + ${pas} * var(--stepqte-cell))`;
      const source = phase === "memo" ? cible : joueur;
      pistes.forEach(p=>{
        if(source[p.id][pas]){
          frappe(p.type);
          const el = cellules[p.id][pas];
          el.classList.add("flash");
          setTimeout(()=>el.classList.remove("flash"), 90);
        }
      });
    }

    if(phase === "memo"){
      const reste = Math.max(0, memoMs - t);
      timerEl.textContent = `Mémorisation — ${(reste/1000).toFixed(1)} s`;
      if(reste <= 0) passerEnSaisie();
    }

    raf = requestAnimationFrame(boucle);
  }
  raf = requestAnimationFrame(boucle);

  function passerEnSaisie(){
    phase = "saisie";
    peindre(joueur);
    grid.classList.add("saisie");
    sub.innerHTML = `À vous : rejouez le motif <b>${motif.nom}</b>. Cliquez les cases, vous entendez ce que vous construisez.`;
    timerEl.textContent = "Aucun chronomètre — prenez le temps qu'il faut.";
    validBtn.disabled = false;
  }

  grid.addEventListener("click", (e)=>{
    if(phase !== "saisie" || fini) return;
    const cell = e.target.closest(".stepqte-cell");
    if(!cell) return;
    const p = cell.dataset.piste;
    const i = Number(cell.dataset.pas);
    joueur[p][i] = joueur[p][i] ? 0 : 1;
    cell.classList.toggle("on", !!joueur[p][i]);
    if(joueur[p][i]) frappe((PISTES.find(x=>x.id===p)||{}).type);
  });

  function terminer(deleguer){
    if(fini) return;
    fini = true;
    phase = "fini";
    cancelAnimationFrame(raf);

    if(deleguer){
      overlay.remove();
      onDone({bonus:0, label:"Beat délégué", cls:"", score:0});
      return;
    }

    /* Score : on compare case à case. Un pas correctement allumé vaut
       autant qu'un pas correctement laissé éteint — sinon tout allumer
       serait une stratégie gagnante. */
    let justes = 0, total = 0;
    pistes.forEach(p=>{
      for(let i=0;i<PAS;i++){
        total++;
        if(!!cible[p.id][i] === !!joueur[p.id][i]) justes++;
      }
    });
    const pct = Math.round((justes/total)*100);

    let bonus, label, cls;
    if(pct >= 95){ bonus = 14; label = "Motif parfait"; cls = "good"; }
    else if(pct >= 85){ bonus = 9;  label = "Très bon groove"; cls = "good"; }
    else if(pct >= 72){ bonus = 4;  label = "Ça tient la route"; cls = ""; }
    else if(pct >= 55){ bonus = 0;  label = "Approximatif"; cls = ""; }
    else { bonus = -6; label = "Hors sujet"; cls = "bad"; }

    playSound(bonus >= 9 ? "mixParfait" : bonus > 0 ? "mixCorrect" : "mixRate");

    // On révèle la bonne réponse : c'est la moitié du plaisir, et ça
    // apprend le motif pour la prochaine fois.
    pistes.forEach(p=>{
      cellules[p.id].forEach((el,i)=>{
        el.classList.remove("on");
        if(cible[p.id][i]) el.classList.add(cible[p.id][i] === joueur[p.id][i] ? "juste" : "manque");
        else if(joueur[p.id][i]) el.classList.add("faux");
      });
    });

    resEl.className = "stepqte-result show " + cls;
    resEl.innerHTML = `<b>${label}</b> — ${pct}% du motif<br><span class="small">${bonus>0?`+${bonus}`:bonus===0?"±0":bonus} de qualité</span>`;
    validBtn.disabled = true;
    skipBtn.style.display = "none";
    timerEl.textContent = "";

    setTimeout(()=>{
      overlay.classList.add("out");
      setTimeout(()=>{
        overlay.remove();
        onDone({bonus, label, cls, score:pct});
      }, 240);
    }, 1900);
  }

  validBtn.addEventListener("click", ()=>terminer(false));
  skipBtn.addEventListener("click", ()=>terminer(true));
}
