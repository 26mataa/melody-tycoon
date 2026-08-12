import { processBankSeason, processTaxSeason } from "./economy.js";
import { refreshBeatmakerPool, refreshScout } from "./market.js";
import { rivalWeekly } from "./rivalite.js";
import { queueEpisode } from "./narrative.js";
import { playSound } from "./sound.js";
import { log, newSeasonStats, save, state } from "../state.js";
import { safeRender } from "../render.js";
import { fmt, rint } from "../utils.js";

/* ============================================================
   SAISONS — la vie du label se raconte comme une série.
   Une saison = 10 à 15 épisodes (un épisode = un choix narratif résolu).
   Au bout, un bilan : les automatismes économiques passent d'un coup,
   le marché se renouvelle, et le joueur prend quelques années.

   Ce n'est jamais un compte à rebours : rien ici ne force la fin de
   partie. Seul le bouton Retraite met un point final à l'histoire.
============================================================ */

export const SEASON_MIN = 10;
export const SEASON_MAX = 15;

export function rollSeasonLength(){
  return rint(SEASON_MIN, SEASON_MAX);
}

/* Titre d'ambiance de la saison en cours, dérivé de l'état du label —
   c'est le "nom de l'arc" affiché en haut de la colonne narrative. */
export function seasonTitle(){
  const n = state.season || 1;
  if(state.signed.length === 0) return `Saison ${n} — Les débuts`;
  if(state.bank.dette > 0 && state.argent < 0) return `Saison ${n} — Le trou`;
  if(state.releases.length === 0) return `Saison ${n} — Avant le premier son`;
  // Deux jauges = quatre profils de saison, pas seulement "plus ou moins connu".
  if(state.notoriete >= 55 && state.credibilite < 35) return `Saison ${n} — Célèbre pour de mauvaises raisons`;
  if(state.credibilite >= 55 && state.notoriete < 35) return `Saison ${n} — Respecté, pas encore connu`;
  if(state.notoriete >= 60) return `Saison ${n} — L'ascension`;
  if(state.notoriete >= 30) return `Saison ${n} — On commence à vous connaître`;
  return `Saison ${n} — Dans l'ombre`;
}

/* ============================================================
   CRISE FINANCIÈRE — l'exception, pas la règle.
   Le bilan de saison est informatif dans l'immense majorité des cas.
   Un vrai choix de crise n'apparaît que si la trésorerie est
   réellement dans le rouge. Et il faut enchaîner PLUSIEURS saisons
   sans s'en sortir pour perdre : c'est rare, et toujours évitable.
============================================================ */

export const CRISIS_ARGENT = -2000;   // trésorerie en dessous de laquelle ça devient sérieux
export const GAMEOVER_SEASONS = 3;    // saisons de crise consécutives avant la fin

export function isFinancialCrisis(){
  if(state.argent < CRISIS_ARGENT) return true;
  // Endetté ET incapable de payer : le compte est bon aussi.
  if(state.bank.dette > 4000 && state.argent < 0) return true;
  return false;
}

function crisisEpisode(){
  const dette = state.bank.dette;
  const trou = Math.abs(Math.min(0, state.argent));
  return {
    imp:3,
    seasonFinale:true,
    title:"🏦 Le banquier veut vous voir",
    desc:`Fin de saison, comptes sur la table : ${fmt(state.argent)} en caisse${dette>0?`, ${fmt(dette)} de dette`:""}. Ça ne peut pas continuer comme ça. Il faut trancher maintenant.`,
    choices:[
      {t:"Emprunter pour tenir encore une saison",
       fn:()=>{ const amt = Math.max(1500, trou + 1200); state.bank.dette += amt; state.argent += amt; },
       d:{reputation:-1},
       addFlag:"a_emprunte_en_crise",
       reason:"🏦 Nouvel emprunt accordé : vous respirez, la dette grossit."},
      {t:"Couper dans les salaires : libérer l'artiste le mieux payé",
       fn:()=>{
         if(!state.signed.length) return;
         const cher = state.signed.slice().sort((a,b)=>(b.salaire||0)-(a.salaire||0))[0];
         if(cher){
           state.signed = state.signed.filter(a=>a.id !== cher.id);
           log(`✂️ ${cher.name} est libéré de son contrat pour alléger les charges.`,"neg");
         }
       },
       d:{reputation:-4,reseau:-3},
       addFlag:"a_licencie_en_crise",
       reason:"✂️ Vous coupez dans le vif : les charges baissent, votre nom en prend un coup."},
      {t:"Vendre des parts du catalogue",
       fn:()=>{
         const gain = Math.max(2000, Math.round(state.totalStreams * 0.002));
         state.argent += gain;
         state.releases.forEach(r=>{ r.dailyStreams = Math.round((r.dailyStreams||0) * 0.55); });
         log(`💼 Parts du catalogue vendues : +${fmt(gain)}, mais vos sorties rapportent moins désormais.`,"info");
       },
       d:{reputation:-2},
       addFlag:"a_vendu_catalogue",
       reason:"💼 Catalogue amputé : de l'argent tout de suite, moins de revenus ensuite."},
      {t:"Ne rien changer et croiser les doigts",
       d:{},
       addFlag:"a_ignore_la_crise",
       reason:"🎲 Vous ne changez rien. La saison prochaine dira si c'était courageux ou stupide."}
    ]
  };
}

export function triggerGameOver(){
  state.gameOverData = {
    label: state.label,
    manager: state.managerName,
    age: state.player.age,
    seasons: state.season - 1,
    argent: state.argent,
    dette: state.bank.dette,
    artistes: state.careerArtistsSigned || 0,
    hits: state.careerHits || 0
  };
  state.screen = "gameover";
  log(`💀 ${state.label} dépose le bilan. L'aventure s'arrête ici.`,"neg");
  playSound("gameOver");
  safeRender();
  save();
}

export function resolveSeasonFinale(){
  const st = state.seasonStats || newSeasonStats();
  const num = state.season;
  const argentAvant = state.argent;
  const detteAvant = state.bank.dette;

  // Automatismes : une seule passe, silencieuse pour le joueur.
  const interets = processBankSeason();
  const taxes = processTaxSeason();
  rivalWeekly(1, true);

  // Le milieu tourne entre deux saisons : nouveaux talents, nouveaux beatmakers.
  refreshScout();
  refreshBeatmakerPool();
  state.beatmakers.forEach(b=>{ b.hype = rint(10,95); });
  state.sabotageUsed = false;
  state.signed.forEach(a=>{ a.projectsThisSeason = 0; });

  // Le temps passe pour de bon entre deux saisons.
  const ans = rint(2,4);
  state.player.age += ans;

  state.seasonFinale = {
    season: num,
    episodes: st.chapters,
    inc: st.inc,
    cost: st.cost,
    net: st.inc - st.cost,
    streams: st.streams,
    sorties: st.sorties,
    signes: st.signes,
    interets,
    taxes,
    ans,
    age: state.player.age,
    argent: state.argent,
    argentDelta: state.argent - argentAvant,
    dette: state.bank.dette,
    detteDelta: state.bank.dette - detteAvant,
    crisis: false,
    crisisStreak: 0,
    gameOver: false
  };

  log(`🎬 Fin de la saison ${num} — ${st.chapters} épisodes. ${ans} ans passent, ${state.managerName} a ${state.player.age} ans.`,"info");
  playSound("finSaison");

  // Saison suivante.
  state.season = num + 1;
  state.episodeInSeason = 0;
  state.seasonLength = rollSeasonLength();
  state.seasonStats = newSeasonStats();
  state.seasonEventCount = 0;

  // Crise : uniquement si la trésorerie est réellement en perdition.
  if(isFinancialCrisis()){
    state.consecutiveCrisisSeasons = (state.consecutiveCrisisSeasons||0) + 1;
    state.seasonFinale.crisis = true;
    state.seasonFinale.crisisStreak = state.consecutiveCrisisSeasons;
    playSound("crise");

    if(state.consecutiveCrisisSeasons >= GAMEOVER_SEASONS){
      state.seasonFinale.gameOver = true;
      triggerGameOver();
      return;
    }
    // Le choix de crise passe en tête : c'est le premier épisode de la saison qui s'ouvre.
    queueEpisode(crisisEpisode(), true);
  }else{
    state.consecutiveCrisisSeasons = 0;
  }
}

export function closeSeasonFinale(){
  state.seasonFinale = null;
  safeRender();
  save();
}
