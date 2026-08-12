import { releaseChapterStreams } from "./production.js";
import { playSound } from "./sound.js";
import { notify } from "../notify.js";
import { after, safeRender } from "../render.js";
import { log, state } from "../state.js";
import { clamp, fmt, pick, rint } from "../utils.js";
import { DATA } from "../data.js";

export function adaptCost(tier){
  const brackets = state.argent < 1000
    ? {petit:[50,200],moyen:[200,500],gros:[500,1000]}
    : state.argent < 10000
    ? {petit:[200,500],moyen:[500,2000],gros:[2000,5000]}
    : {petit:[500,2000],moyen:[2000,5000],gros:[5000,15000]};
  const [a,b] = brackets[tier] || brackets.petit;
  return rint(a,b);
}

/* ============================================================
   LES DEUX SEULES JAUGES DU LABEL

   Avant, le joueur en lisait quatre (buzz, popularité, réputation,
   réseau) qui montaient et descendaient quasiment ensemble : quatre
   barres pour une seule information. Il n'en reste que deux, et elles
   disent vraiment deux choses différentes :

     NOTORIÉTÉ  — à quel point on vous connaît. Se gagne vite (un
                  carton, une polémique), se perd si on ne sort rien.
     CRÉDIBILITÉ — à quel point on vous respecte. Se gagne lentement,
                  ne s'érode pas toute seule : seuls vos actes la font
                  tomber. C'est elle qui ouvre les portes du milieu.

   Le contenu narratif (plus de 300 choix écrits) continue d'utiliser
   son vocabulaire d'origine à quatre nuances — c'est plus expressif à
   écrire — et cette table le replie sur les deux jauges réelles. Les
   coefficients conservent l'équilibrage d'origine : le buzz donnait de
   gros chiffres parce qu'il se dissipait vite, il pèse donc moins qu'un
   gain de popularité franc, qui lui était durable. */
export const STAT_MAP = {
  buzz:        {stat:"notoriete",   k:0.5},
  popularite:  {stat:"notoriete",   k:1.0},
  reputation:  {stat:"credibilite", k:1.0},
  reseau:      {stat:"credibilite", k:0.7},
  notoriete:   {stat:"notoriete",   k:1.0},
  credibilite: {stat:"credibilite", k:1.0}
};

export function impact(deltas, reason, type){
  let sum = 0;
  Object.keys(deltas).forEach(k=>{
    const v = deltas[k];
    if(!v) return;
    sum += (k==='argent') ? 0 : v;
    if(k==='argent'){
      state.argent += v;
      playSound(v > 0 ? "argentGagne" : "argentPerdu");
      return;
    }
    const m = STAT_MAP[k];
    if(!m) return;   // clé inconnue : on l'ignore plutôt que de créer un champ fantôme
    state[m.stat] = clamp((state[m.stat]||0) + v*m.k, 0, 100);
  });
  if(reason) log(reason, type || (sum > 0 ? "pos" : sum < 0 ? "neg" : "info"));
}

export function tierScore(){
  return state.notoriete*0.6 + state.credibilite*0.4;
}

export function getTier(){
  const s = tierScore();
  let t = DATA.TIERS[0];
  for(const tier of DATA.TIERS) if(s >= tier.min) t = tier;
  return t;
}

export function pveReqs(){
  return [
    {label:"Notoriété ≥ 25",ok:state.notoriete>=25,text:`${Math.round(state.notoriete)} / 25`},
    {label:"Crédibilité ≥ 20",ok:state.credibilite>=20,text:`${Math.round(state.credibilite)} / 20`},
    {label:"Trésorerie ≥ 3000€",ok:state.argent>=3000,text:`${fmt(state.argent)} / ${fmt(3000)}`}
  ];
}

/* Score comparatif label-contre-label (classement de la Rivalité).
   Accepte les deux formes en circulation : celle du joueur
   (notoriete/credibilite) et celle des labels rivaux, qui gardent leurs
   propres champs rep/buzz — ce sont des PNJ simulés, pas des labels
   jouables, leur modèle interne n'a pas besoin de suivre le nôtre. */
export function labelScore(entity){
  if(entity.notoriete !== undefined || entity.credibilite !== undefined){
    return Math.round((entity.notoriete||0)*0.6 + (entity.credibilite||0)*0.4);
  }
  const rep = entity.rep || 0;
  const buzz = entity.buzz || 0;
  return Math.round(rep*0.7 + buzz*0.3);
}

/* Le score du joueur, pour ne pas répéter la forme partout. */
export function myLabelScore(){
  return labelScore({notoriete:state.notoriete, credibilite:state.credibilite});
}

export function pveUnlocked(){
  return pveReqs().every(r=>r.ok);
}

/* Limite de recrutement d'artistes selon le palier du label */

export function rosterCap(){
  return DATA.ROSTER_CAPS[getTier().id] || 2;
}

export function rosterFull(){
  return state.signed.length >= rosterCap();
}

/* ============================================================
   HELPERS MÉTIER
============================================================ */

export function avgMoral(){
  if(state.signed.length === 0) return null;
  return Math.round(state.signed.reduce((s,a)=>s+a.humeur,0) / state.signed.length);
}

export function dailyCost(){
  return state.signed.reduce((s,a)=>s+(a.salaire||0),0) + state.beatmakers.reduce((s,b)=>s+(b.salaire||0),0);
}

export function streamDailyIncome(){
  if(state.signed.length === 0) return 0;
  return state.releases.reduce((s,r)=>s + releaseChapterStreams(r)*0.003, 0);
}

export function calcResignCost(a){
  if(a.hits > a.flops && a.pop > 60) return rint(2000,8000);
  if(a.pop > 30) return rint(500,1500);
  return rint(100,300);
}

export function openBank(){
  state.bankModal = true;
  safeRender();
}

/* Ce que la banque accepte de vous prêter. Elle regarde surtout ce que
   vous pouvez rapporter (notoriété), un peu ce que vous valez comme
   interlocuteur (crédibilité). Défini ici, lu aussi par la modale banque
   pour que le plafond affiché soit forcément celui appliqué. */
export function loanCeiling(){
  return 5000 + Math.round(state.notoriete*70 + state.credibilite*30);
}

export function takeLoan(amt){
  const maxLoan = loanCeiling();
  if(state.bank.dette + amt > maxLoan) return notify("Plafond de prêt atteint.");
  state.bank.dette += amt;
  state.argent += amt;
  log(`🏦 Emprunt de ${fmt(amt)} (dette totale : ${fmt(state.bank.dette)}).`,"info");
  after();
}

export function repayLoan(){
  if(state.bank.dette<=0) return notify("Aucune dette à rembourser.");
  const pay = Math.min(state.bank.dette, state.argent);
  if(pay<=0) return notify("Pas d'argent disponible.");
  state.argent -= pay;
  state.bank.dette -= pay;
  log(`🏦 Remboursement de ${fmt(pay)}.`,"pos");
  after();
}

/* ============================================================
   MAMIE HUGUETTE — le vrai départ
============================================================ */

/* Mamie n'est plus un revenu passif : c'est un joker que le joueur active
   lui-même, avec un temps de recharge en épisodes. Elle dépanne, elle ne
   finance pas une carrière — et le jour où le label tient debout tout seul,
   elle raccroche pour de bon. */

export const MAMIE_COOLDOWN = 10;   // épisodes entre deux appels
export const MAMIE_SEUIL_ADIEU = 25000;  // au-delà, elle estime que vous n'avez plus besoin d'elle

export function mamieAvailable(){
  if(!state.mamie.active || state.mamie.independant) return false;
  return state.chapter >= (state.mamie.cooldownUntilChapter || 0);
}

export function mamieChaptersLeft(){
  return Math.max(0, (state.mamie.cooldownUntilChapter || 0) - state.chapter);
}

export function useMamieHelp(){
  if(!state.mamie.active) return notify("Mamie Huguette ne fait pas partie de cette partie.");
  if(state.mamie.independant) return notify("Mamie a raccroché : vous volez de vos propres ailes maintenant.");
  if(!mamieAvailable()){
    const n = mamieChaptersLeft();
    return notify(`Mamie a déjà donné récemment. Rappelez-la dans ${n} épisode${n>1?"s":""}.`);
  }

  // Le montant suit très légèrement le palier : elle donne ce qu'elle a,
  // ça n'a jamais vocation à sauver un label.
  const amt = rint(60, 140) + getTier().id * 25;
  state.argent += amt;
  state.mamie.totalRecu += amt;
  state.mamie.uses = (state.mamie.uses || 0) + 1;
  state.mamie.cooldownUntilChapter = state.chapter + MAMIE_COOLDOWN;

  const pool = (DATA.MAMIE_JOKER_PHRASES && DATA.MAMIE_JOKER_PHRASES.length)
    ? DATA.MAMIE_JOKER_PHRASES
    : (state.signed.length ? DATA.MAMIE_MUSIQUE_PHRASES : DATA.MAMIE_PHRASES);
  const phrase = pick(pool);
  state.mamie.lastPhrase = phrase;
  log(`👵 Mamie Huguette : « ${phrase} » (+${fmt(amt)}).`,"pos");
  playSound("mamie");

  if(state.mamie.totalRecu >= state.mamie.stopAt || state.argent >= MAMIE_SEUIL_ADIEU){
    state.mamie.independant = true;
    log(`👵 ${pick(DATA.MAMIE_FINAL_PHRASES)}`,"info");
  }

  after();
}

export function toggleMamiePanel(){
  state.mamie.panelOpen = !state.mamie.panelOpen;
  safeRender();
}

/* ============================================================
   BANQUE / IMPÔTS — une seule passe par saison, au moment du bilan.
   Ces automatismes ne demandent jamais rien au joueur : ils se contentent
   d'apparaître dans le récap de fin de saison. Le seul cas où ils
   deviennent un vrai choix, c'est la crise financière (voir season.js).
============================================================ */

export function processBankSeason(){
  if(state.bank.dette <= 0) return 0;
  const avant = state.bank.dette;
  state.bank.dette = Math.round(state.bank.dette * 1.06);
  const interets = state.bank.dette - avant;
  if(state.argent > 0){
    const repay = Math.min(state.bank.dette, Math.round(state.bank.dette * .15), state.argent);
    if(repay > 0){
      state.argent -= repay;
      state.bank.dette -= repay;
      log(`🏦 Remboursement automatique de ${fmt(repay)} sur la saison.`,"info");
    }
  }
  return interets;
}

export function processTaxSeason(){
  if(state.mamie.active && !state.mamie.independant) return 0;
  if(state.argent <= 5000) return 0;
  const tax = Math.round(state.argent * 0.05);
  state.argent -= tax;
  log(`🧾 Impôts de la saison sur la trésorerie : -${fmt(tax)}.`,"neg");
  return tax;
}

