import { finalizeSigned } from "./artists.js";
import { calcResignCost, impact, rosterCap, rosterFull } from "./economy.js";
import { scheduleFollowUp } from "./events.js";
import { removeArtist } from "./rivalite.js";
import { performRoll } from "./roll.js";
import { playSound } from "./sound.js";
import { notify } from "../notify.js";
import { safeRender } from "../render.js";
import { log, save, state } from "../state.js";
import { clamp, fmt, pick, rand, rint } from "../utils.js";
import { DATA } from "../data.js";

export function durationById(id){ return DATA.CONTRACT_DURATIONS.find(d=>d.id===id) || DATA.CONTRACT_DURATIONS[1]; }

export function pickDurationForProfile(pop){
  if(pop >= 65) return pick(["1a","1a","2a"]);
  if(pop >= 35) return pick(["6m","6m","1a"]);
  return pick(["3m","3m","6m"]);
}

export function openResign(artistId){
  const a = state.signed.find(x=>x.id===artistId);
  if(!a) return;
  const baseCost = calcResignCost(a);
  const baseSalaire = Math.round(a.salaire * rand(1.05,1.4));
  const durationId = pickDurationForProfile(a.pop);
  state.negotiation = {
    kind:"resign",
    artistId,
    marketId:null,
    perso:a.perso,
    humeur:a.humeur,
    pop:a.pop,
    phrase:pick(DATA.ARTIST_NEGO_PHRASES),
    baseCost, baseSalaire,
    proposal:{durationId, salaire:baseSalaire, cost:Math.round(baseCost*durationById(durationId).mult)},
    mode:"initial",
    custom:null,
    result:null,
    resultOk:false,
    done:false
  };
}

export function openMarketNego(marketId){
  const a = state.market.find(x=>x.id===marketId);
  if(!a) return;
  if(rosterFull() && !state.adminMode) return notify(`Effectif complet (${state.signed.length}/${rosterCap()}) pour votre palier actuel.`);
  const baseCost = a.prix;
  const baseSalaire = Math.round(a.salaire * rand(0.95,1.08));
  const durationId = pickDurationForProfile(a.pop);
  state.negotiation = {
    kind:"market",
    artistId:null,
    marketId,
    perso:a.perso,
    humeur:60,
    pop:a.pop,
    phrase:`« Voilà mes conditions pour rejoindre ${state.label}. »`,
    baseCost, baseSalaire,
    proposal:{durationId, salaire:baseSalaire, cost:Math.round(baseCost*durationById(durationId).mult)},
    mode:"initial",
    custom:null,
    result:null,
    resultOk:false,
    done:false
  };
  state.marketSel = null;
  safeRender();
}

export function negoArtistRef(n){
  return n.kind==="resign" ? state.signed.find(x=>x.id===n.artistId) : state.market.find(x=>x.id===n.marketId);
}

export function negoAcceptChance(n){
  if(!n.custom) return 1;
  const c = n.custom;
  const fairCost = Math.round(n.baseCost * durationById(c.durationId).mult);
  let p = .55;
  p += clamp((c.cost - fairCost) / Math.max(1,fairCost), -1, 1) * .25;
  p += clamp((c.salaire - n.baseSalaire) / Math.max(1,n.baseSalaire), -1, 1) * .35;
  const durIdx = DATA.CONTRACT_DURATIONS.findIndex(d=>d.id===c.durationId);
  const propIdx = DATA.CONTRACT_DURATIONS.findIndex(d=>d.id===n.proposal.durationId);
  if(n.perso === "ambitieux" || n.perso === "professionnel") p += (durIdx-propIdx)*.04;
  if(n.perso === "instable") p -= (durIdx-propIdx)*.05;
  p += (n.humeur-50)/400;
  // Un label qu'on respecte n'a pas besoin de sur-payer pour convaincre.
  p += state.credibilite/400;
  if(marketDistrustActive()) p -= .12;
  return clamp(p, .03, .97);
}

export function negoBackToInitial(){
  const n = state.negotiation;
  if(!n) return;
  n.mode = "initial";
  n.custom = null;
  safeRender();
}

export function negoOpenCustom(){
  const n = state.negotiation;
  if(!n) return;
  n.mode = "custom";
  n.custom = {durationId:n.proposal.durationId, salaire:n.proposal.salaire, cost:n.proposal.cost};
  safeRender();
}

export function negoSetDuration(id){
  const n = state.negotiation;
  if(!n || !n.custom) return;
  n.custom.durationId = id;
  safeRender();
}

/* Pure mutation, sans rendu : le rafraîchissement visuel (barre de chance,
   coût total) est fait localement par patchNegoLive() dans dispatch.js — un
   plein reRenderPreserveFocus() ici recréait la modale entière à chaque
   frappe (l'animation d'entrée rejouait, l'input perdait le curseur, la
   frappe semblait s'arrêter). */
export function negoSetField(key, val){
  const n = state.negotiation;
  if(!n || !n.custom) return;
  n.custom[key] = clamp(Math.round(Number(val)||0), 0, 999999999);
}

export function negoApplySigning(a, terms, log1){
  const dur = durationById(terms.durationId);
  a.salaire = terms.salaire;
  a.contractRemaining = dur.chapitres;
  a.contractChapters = dur.chapitres;
  playSound("signature");
  if(state.negotiation.kind === "market"){
    state.market = state.market.filter(x=>x.id!==a.id);
    finalizeSigned(a);
    a.salaire = terms.salaire;
    a.contractRemaining = dur.chapitres;
    a.contractChapters = dur.chapitres;
    state.signed.push(a);
    impact({buzz:a.contrat==="star"?12:a.contrat==="valeur"?6:3}, log1,"pos");
  }else{
    a.humeur = clamp(a.humeur + 5, 0, 100);
    log(log1,"pos");
  }
}

export function negoValidate(){
  const n = state.negotiation;
  if(!n || n.done) return;
  const a = negoArtistRef(n);
  if(!a){ state.negotiation = null; safeRender(); return; }
  if(state.argent < n.proposal.cost){
    n.result = "Vous n'avez pas assez d'argent pour accepter ces conditions.";
    n.resultOk = false; n.done = true;
    safeRender(); save();
    return;
  }
  if(n.kind==="market" && rosterFull() && !state.adminMode){
    n.result = `Effectif complet (${state.signed.length}/${rosterCap()}) : impossible de signer.`;
    n.resultOk = false; n.done = true;
    safeRender(); save();
    return;
  }
  state.argent -= n.proposal.cost;
  const dur = durationById(n.proposal.durationId);
  negoApplySigning(a, n.proposal, n.kind==="market"
    ? `✍️ ${a.name} rejoint ${state.label} pour ${fmt(n.proposal.cost)} (contrat ${dur.name}, ${fmt(n.proposal.salaire)}/ép.).`
    : `🔄 ${a.name} resigné pour ${fmt(n.proposal.cost)} : contrat ${dur.name}, salaire ${fmt(n.proposal.salaire)}/ép., +5 Moral.`);
  n.result = n.kind==="market"
    ? `« Marché conclu, à nous deux. » ${a.name} rejoint le label pour ${dur.name}.`
    : `« Bon ok, tu m'as convaincu. Je reste. » Contrat prolongé de ${dur.name}.`;
  n.resultOk = true; n.done = true;
  state.negotiationsCompleted = (state.negotiationsCompleted||0) + 1;
  safeRender(); save();
}

export function negoRefuse(){
  const n = state.negotiation;
  if(!n || n.done) return;
  const a = negoArtistRef(n);
  if(!a){ state.negotiation = null; safeRender(); return; }

  if(n.kind === "market"){
    n.result = `Vous déclinez son offre. ${a.name} reste disponible sur le marché.`;
    n.resultOk = true; n.done = true;
    log(`💬 Négociation avec ${a.name} rompue par vos soins : il/elle reste sur le marché.`,"info");
    safeRender(); save();
    return;
  }

  state.credibilite = clamp(state.credibilite+3,0,100);
  removeArtist(a);
  n.result = `« Merci pour tout, je te revaudrai ça. » Départ à l'amiable.`;
  n.resultOk = true; n.done = true;
  log(`👋 ${a.name} part en bons termes : +3 Crédibilité.`,"pos");
  safeRender(); save();
}

export function negoSubmitCustom(){
  const n = state.negotiation;
  if(!n || n.done || !n.custom) return;
  const a = negoArtistRef(n);
  if(!a){ state.negotiation = null; safeRender(); return; }
  if(state.argent < n.custom.cost) return notify("Pas assez d'argent pour proposer ce montant.");
  if(n.kind==="market" && rosterFull() && !state.adminMode) return notify(`Effectif complet (${state.signed.length}/${rosterCap()}) pour votre palier actuel.`);

  const p = negoAcceptChance(n);
  const dur = durationById(n.custom.durationId);
  performRoll(p,()=>{
    state.argent -= n.custom.cost;
    negoApplySigning(a, n.custom, n.kind==="market"
      ? `✍️ ${a.name} accepte votre contre-offre et rejoint ${state.label} pour ${fmt(n.custom.cost)} (${dur.name}, ${fmt(n.custom.salaire)}/ép.).`
      : `🔄 ${a.name} accepte votre contre-offre : contrat ${dur.name}, salaire ${fmt(n.custom.salaire)}/ép.`);
    n.result = `« C'est d'accord pour ces conditions-là. »`;
    n.resultOk = true; n.done = true;
    state.negotiationsCompleted = (state.negotiationsCompleted||0) + 1;
  },()=>{
    if(n.kind==="market"){
      a.prix = Math.round(a.prix * 1.05);
      n.result = `« Ces conditions ne me conviennent pas. » ${a.name} reste sur le marché (attentes revues à la hausse).`;
      n.resultOk = false; n.done = true;
      log(`💬 ${a.name} refuse votre contre-offre.`,"neg");
    }else{
      state.credibilite = clamp(state.credibilite-2,0,100);
      removeArtist(a);
      n.result = `« Ces conditions ne me conviennent pas, je m'en vais. » -Crédibilité (rupture mal négociée).`;
      n.resultOk = false; n.done = true;
      log(`💬 ${a.name} refuse votre contre-offre et quitte le label : -Crédibilité.`,"neg");
    }
  },"Offre acceptée !","Offre refusée");
}

export function negoExposeCareer(){
  const n = state.negotiation;
  if(!n || n.done || n.kind!=="resign") return;
  const a = negoArtistRef(n);
  if(!a){ state.negotiation = null; safeRender(); return; }
  performRoll(.5,()=>{
    state.notoriete = clamp(state.notoriete+3,0,100);
    state.credibilite = clamp(state.credibilite-10,0,100);
    state.marketDistrustUntil = state.chapter + 7;
    const exposedName = a.name;
    scheduleFollowUp(rint(12,22), "artist_revenge", {name: exposedName});
    removeArtist(a);
    n.result = `Vous salissez son image avec succès : +Notoriété, -Crédibilité. Le milieu retient votre méthode — les autres artistes et labels se méfient de vous pendant un temps (négociations plus dures). ${exposedName} ne l'oubliera pas.`;
    n.resultOk = true; n.done = true;
    log(`😈 Campagne de dénigrement contre ${a.name} réussie : +Notoriété, -Crédibilité. Méfiance du marché pendant 7 épisodes. Ça pourrait bien lui revenir un jour.`,"info");
  },()=>{
    state.credibilite = clamp(state.credibilite-18,0,100);
    removeArtist(a);
    n.result = `Ça se retourne contre vous : -Crédibilité.`;
    n.resultOk = false; n.done = true;
    log(`😈 Campagne de dénigrement contre ${a.name} ratée : ça se retourne contre vous.`,"neg");
  },"Manipulation réussie","Manipulation exposée");
}

export function marketDistrustActive(){
  return (state.marketDistrustUntil||0) > state.chapter;
}

/* ============================================================
   BANQUE
============================================================ */

