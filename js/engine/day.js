import { openResign } from "./contracts.js";
import { dailyCost } from "./economy.js";
import { checkPendingConsequences } from "./events.js";
import { checkReleaseFollowUps } from "./narrative.js";
import { tickMandats } from "./mandate.js";
import { checkRetours } from "./memory.js";
import { rareReleaseEvent, releaseChapterStreams, resolveBeatProject, resolveRelease } from "./production.js";
import { resolveSeasonFinale } from "./season.js";
import { launchMixQTE } from "../ui/mixqte.js";
import { safeRender } from "../render.js";
import { log, save, state } from "../state.js";
import { chance, clamp, rint } from "../utils.js";
import { DATA } from "../data.js";

/* ============================================================
   LE TEMPS — il n'y a plus de bouton "Jour" ni "Semaine".
   Le temps avance uniquement parce que le joueur résout un choix
   narratif : 1 choix résolu = 1 chapitre = 1 épisode de la série.

   advanceChapter() fait exactement ce que faisait processDay() avant :
   projets qui avancent, streams, charges, dérive du moral et de la
   forme. Ce qui change, c'est QUAND on l'appelle — et le fait que le
   bloc hebdomadaire est devenu un bilan de fin de saison.
============================================================ */

export function advanceChapter(quiet){
  state.chapter++;
  state.episodeInSeason++;
  if(!state.seasonStats) state.seasonStats = {inc:0,cost:0,chapters:0,streams:0,sorties:0,signes:0};
  state.seasonStats.chapters++;

  checkPendingConsequences();
  checkReleaseFollowUps();
  // Les mandats se soldent AVANT le reste du chapitre : une sanction qui
  // retire un artiste doit être prise en compte par les salaires et les
  // projets du chapitre en cours, pas au suivant.
  tickMandats();
  checkRetours();

  // Projets en cours : un chapitre de travail en moins.
  const done = [];
  state.projects.forEach(p=>{
    p.reste--;
    if(p.reste <= 0) done.push(p);
  });
  const aMixer = [];
  done.forEach(p=>{
    state.projects = state.projects.filter(x=>x !== p);
    if(p.kind === "beat") resolveBeatProject(p);
    else aMixer.push(p);
  });

  // Revenus des sorties déjà en ligne.
  let inc = 0;
  let rareEventFired = false;
  if(state.signed.length > 0){
    state.releases.forEach(r=>{
      const ds = releaseChapterStreams(r);
      state.totalStreams += ds;
      state.seasonStats.streams += ds;
      const rev = Math.round(ds * 0.003);
      inc += rev;
      r.totalRevenue = (r.totalRevenue || 0) + rev;

      if(!r.history) r.history = [];
      r.history.push({age:r.age||0,streams:ds});
      if(r.history.length > 7) r.history.shift();

      if(r.age < 20 && chance(.06)){
        rareReleaseEvent(r, quiet || rareEventFired);
        rareEventFired = true;
      }
    });
  }

  const cost = dailyCost();
  state.argent += inc;
  state.argent -= cost;
  state.seasonStats.inc += inc;
  state.seasonStats.cost += cost;

  state.cashHistory.push({inc,cost});
  if(state.cashHistory.length > 14) state.cashHistory.shift();

  state.releases.forEach(r=>r.age++);

  // Artistes
  const inDebt = state.argent < 0;
  state.signed.forEach(a=>{
    a.humeur = clamp(a.humeur + rint(-2,2), 0, 100);
    if(a.resting > 0){
      a.resting--;
      a.humeur = clamp(a.humeur + 2, 0, 100);
    }
    if(a.audienceLockChapters > 0) a.audienceLockChapters--;
    if(inDebt) a.humeur = clamp(a.humeur - 1, 0, 100);

    if(a.contractRemaining > 0) a.contractRemaining--;
    if(a.contractRemaining === 0 && !state.negotiation){
      openResign(a.id);
    }

    if(a.buzz > 0) a.pop = clamp(a.pop + Math.round(a.buzz * .03), 0, 100);
    if(a.buzz < 0) a.pop = clamp(a.pop + Math.round(a.buzz * .03), 0, 100);

    if(a.buzz < -25 && state.chapter % 10 === 0){
      a.talent = clamp(a.talent - 1, 20, 100);
      log(`🔻 ${a.name} perd confiance à cause du bad buzz.`,"neg");
    }

    if(a.potential > 75 && chance(.02)){
      a.talent = clamp(a.talent + 1, 0, 100);
    }
  });

  if(inDebt && state.signed.length && !quiet){
    log("💸 Salaires impayés : le moral de vos artistes se dégrade.","neg");
  }

  /* Dérive des deux jauges. La notoriété est la seule à s'éroder toute
     seule : on vous oublie si vous ne sortez rien, et d'autant plus vite
     que vous étiez haut (une petite notoriété locale, elle, ne bouge
     presque pas). La crédibilité ne s'érode jamais passivement — elle ne
     se perd que par des actes, jamais par l'inactivité. */
  const silence = state.chapter - state.lastReleaseChapter;
  if(state.signed.length > 0 && silence > 6){
    const oubli = 0.25 + state.notoriete * 0.012;
    state.notoriete = clamp(state.notoriete - oubli, 0, 100);
  }else{
    state.notoriete = clamp(state.notoriete - 0.15, 0, 100);
  }

  // Le joueur : forme et pression. L'âge, lui, n'avance qu'entre deux saisons.
  state.player.energy = clamp(state.player.energy + rint(1,4), 0, 100);
  state.player.stress = clamp(state.player.stress + (inDebt?2:-1), 0, 100);

  // Fin de saison : le bilan tombe après le dernier épisode.
  if(state.episodeInSeason >= state.seasonLength){
    resolveSeasonFinale();
  }

  // Un projet arrivé à terme passe par le mix final avant d'exister vraiment.
  if(aMixer.length) mixerPuisSortir(aMixer, quiet);

  return {inc,cost};
}

/* Chaîne les sorties une par une : chaque projet a droit à son mix final,
   puis se résout avec le bonus (ou le malus) obtenu. En mode silencieux
   (bilan de saison, tests), on saute le mini-jeu : pas de bonus, pas de malus. */
function mixerPuisSortir(list, quiet){
  const p = list.shift();
  if(!p) return;

  if(quiet){
    resolveRelease(p, 0);
    mixerPuisSortir(list, quiet);
    return;
  }

  const chapitres = (DATA.PTYPES[p.type] || {}).chapitres || 1;
  launchMixQTE({
    titre: p.title,
    difficulte: Math.min(4, Math.max(1, Math.ceil(chapitres/3)))
  }, res=>{
    resolveRelease(p, res.bonus);
    if(list.length){
      mixerPuisSortir(list, quiet);
    }else{
      safeRender();
      save();
    }
  });
}
