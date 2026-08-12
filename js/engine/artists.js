import { impact } from "./economy.js";
import { scheduleFollowUp } from "./events.js";
import { postSignature } from "./social.js";
import { notify } from "../notify.js";
import { after, safeRender } from "../render.js";
import { log, state } from "../state.js";
import { chance, clamp, pick, rand, rint, shuffleArr } from "../utils.js";
import { DATA } from "../data.js";

export function genThemesPreferes(){
  const shuffled = shuffleArr(DATA.THEMES);
  return [shuffled[0].id, shuffled[1].id];
}

export function moodEmoji(h){
  if(h < 20) return "😭";
  if(h < 40) return "😔";
  if(h < 60) return "😐";
  if(h < 80) return "🙂";
  return "🤩";
}

export function artistStatus(a){
  if(a.resting > 0) return {icon:"😴",txt:"En repos",cls:"warn"};
  if(a.audienceLockChapters > 0) return {icon:"🔄",txt:"Change de public",cls:"warn"};
  if(a.humeur < 30) return {icon:"⚠️",txt:"Besoin de repos",cls:"bad"};
  if(a.buzz > 15 || a.humeur > 75) return {icon:"🔥",txt:"En pleine hype",cls:"good"};
  return {icon:"😌",txt:"Stable",cls:""};
}

export function artistReleases(a){
  return state.releases.filter(r=>r.artistId===a.id || (!r.artistId && r.artistName===a.name));
}

export function topStreamed(a,n){
  return artistReleases(a).slice().sort((x,y)=>y.streams-x.streams).slice(0,n);
}

export function topFlops(a,n){
  return artistReleases(a).slice().sort((x,y)=>x.streams-y.streams).slice(0,n);
}

export function rA(){
  return state.signed.length ? pick(state.signed) : null;
}

export function finalizeSigned(a){
  a.id = a.id || ("a"+Date.now()+Math.floor(Math.random()*9999));
  if(a.buzz === undefined){
    // Un talent brut du repérage part de zéro. Un artiste du marché est déjà connu :
    // il a déjà un peu de buzz réel, proportionné à sa notoriété (contrat).
    a.buzz = a.contrat==="star" ? rint(28,55) : a.contrat==="valeur" ? rint(10,26) : a.contrat==="espoir" ? rint(0,8) : 0;
  }
  a.potential = a.potential || rint(40,85);
  a.humeur = a.humeur || rint(60,85);
  a.hits = a.hits || 0;
  a.flops = a.flops || 0;
  a.projets = a.projets || 0;
  a.contractRemaining = a.contractRemaining || pick([30,60,90]);
  a.contractChapters = a.contractChapters || a.contractRemaining;
  a.salaire = a.salaire || 5;
  a.perso = a.perso || "ambitieux";
  a.contrat = a.contrat || "espoir";
  a.genre = a.genre || "Musique";
  a.relations = a.relations || {};
  a.resting = 0;
  a.projectsThisSeason = 0;
  a.themesPreferes = (a.themesPreferes && a.themesPreferes.length) ? a.themesPreferes : genThemesPreferes();
  a.audienceLockChapters = a.audienceLockChapters || 0;
  state.careerArtistsSigned = (state.careerArtistsSigned||0) + 1;
  postSignature(a);
  return a;
}

export function openAudienceChange(id){
  const a = state.signed.find(x=>x.id===id);
  if(!a) return;
  if(a.audienceLockChapters > 0) return notify("Changement de public déjà en cours.");
  state.audienceModal = {artistId:id, genre:a.genre, themes:a.themesPreferes.slice()};
  state.artistSel = null;
  safeRender();
}

export function setAudienceGenre(g){
  if(!state.audienceModal) return;
  state.audienceModal.genre = g;
  safeRender();
}

export function toggleAudienceTheme(id){
  const m = state.audienceModal;
  if(!m) return;
  const i = m.themes.indexOf(id);
  if(i >= 0) m.themes.splice(i,1);
  else if(m.themes.length < 2) m.themes.push(id);
  safeRender();
}

export function confirmAudienceChange(){
  const m = state.audienceModal;
  if(!m) return;
  const a = state.signed.find(x=>x.id===m.artistId);
  if(!a) return;
  const genreChanged = m.genre !== a.genre;
  const overlap = a.themesPreferes.filter(t=>m.themes.includes(t)).length;
  let lock = clamp(Math.round((5 + (2-overlap)*4 + (genreChanged?14:0)) * rand(.85,1.15)), 5, 35);
  a.genre = m.genre;
  a.themesPreferes = m.themes.length ? m.themes.slice() : a.themesPreferes;
  a.audienceLockChapters = lock;
  a.audienceChangedOnce = true;
  log(`🎭 ${a.name} change de public : nouveau genre "${a.genre}", nouveaux thèmes de prédilection. Indisponible pour un nouveau projet pendant ${lock} jours.`,"info");
  state.audienceModal = null;
  after();
}

export function giveBonus(id){
  const a = state.signed.find(x=>x.id===id);
  if(!a) return;
  if(state.argent < 300) return notify("Pas assez d'argent.");
  state.argent -= 300;
  a.humeur = clamp(a.humeur + 8, 0, 100);
  log(`💰 Prime versée à ${a.name} (-300€) : +8 Moral (${a.name}).`,"pos");
  if(chance(.25)) scheduleFollowUp(rint(20,45), "favor_called_in", {name:a.name, pronoun:"elle/lui"});
  after();
}

export function giveRest(id){
  const a = state.signed.find(x=>x.id===id);
  if(!a) return;
  if(a.resting > 0) return notify(`${a.name} est déjà en repos.`);
  a.resting = 5;
  a.humeur = clamp(a.humeur + 5, 0, 100);
  log(`😴 ${a.name} part se reposer 5 jours : +5 Moral immédiat, indisponible pour un projet pendant ce temps.`,"pos");
  after();
}

export function releaseArtist(id){
  const a = state.signed.find(x=>x.id===id);
  if(!a) return;
  state.signed = state.signed.filter(x=>x.id !== id);
  state.market.unshift(a);
  impact({popularite:-4}, `🚪 Contrat de ${a.name} rompu : -Notoriété.`,"neg");
  state.artistSel = null;
  after();
}

/* ---- Recruter : talents bruts (repérage) vs artistes établis (marché) ---- */

