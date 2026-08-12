import { avgMoral, getTier, pveUnlocked, rosterFull } from "./economy.js";
import { getRelation } from "./events.js";
import { playSound } from "./sound.js";
import { resetState, save, state } from "../state.js";
import { safeRender } from "../render.js";
import { clearSavedState } from "../storage.js";

export const OBJECTIVE_DEFS=[
  {min:0,label:"Signer votre premier artiste",done:()=>state.signed.length>0,tab:"label",sub:"recruter"},
  {min:0,label:"Lancer votre premier projet",done:()=>state.projects.length>0 || state.releases.length>0,tab:"label",sub:"production"},
  {min:0,label:"Sortir votre première musique",done:()=>state.releases.length>0,tab:"label",sub:"production"},
  {min:0,label:"Atteindre 10 de Notoriété",done:()=>state.notoriete>=10,tab:"dash"},
  {min:1,label:"Recruter un beatmaker",done:()=>state.beatmakers.length>0,tab:"label",sub:"recruter"},
  {min:1,label:"Mener une négociation de contrat à son terme",done:()=>state.negotiationsCompleted>0,tab:"label",sub:"artistes"},
  {min:1,label:"Atteindre 25 de Crédibilité",done:()=>state.credibilite>=25,tab:"dash"},
  {min:2,label:"Nouer une relation forte entre deux artistes",done:()=>state.signed.some(a=>state.signed.some(b=>b.id!==a.id && getRelation(a,b).score>=40)),tab:"label",sub:"artistes"},
  {min:2,label:"Faire changer un artiste de public",done:()=>state.signed.some(a=>a.audienceChangedOnce),tab:"label",sub:"artistes"},
  {min:2,label:"Compléter votre effectif d'artistes pour ce palier",done:()=>rosterFull(),tab:"label",sub:"recruter"},
  {min:3,label:"Débloquer la Rivalité (PvE)",done:()=>pveUnlocked(),tab:"rivalite"},
  {min:3,label:"Consulter le détail de vos charges (Finance)",done:()=>state.financeBreakdownOpen,tab:"finance"},
  {min:3,label:"Cumuler 5 hits au total",done:()=>state.signed.reduce((s,a)=>s+a.hits,0)>=5,tab:"label",sub:"production"},
  {min:4,label:"Garder votre stress sous 50",done:()=>state.player.stress<50,tab:"dash"},
  {min:4,label:"Sortir un son à l'international",done:()=>state.releases.some(r=>r.marcheName==="International"),tab:"label",sub:"production"},
  {min:5,label:"Dépasser 500 000€ de trésorerie",done:()=>state.argent>=500000,tab:"finance"},
  {min:5,label:"Maintenir un moral d'équipe au-dessus de 70",done:()=>(avgMoral()||0)>=70,tab:"label",sub:"artistes"}
];

export function getObjectives(){
  const tier = getTier().id;
  const pool = OBJECTIVE_DEFS.filter(o=>tier>=o.min).map(o=>({label:o.label,done:o.done(),tab:o.tab,sub:o.sub}));
  pool.sort((a,b)=>(a.done===b.done)?0:(a.done?1:-1));
  return pool.slice(0,5);
}

export function energyLabel(e){
  if(e < 20) return {txt:"Épuisé",cls:"bad"};
  if(e < 45) return {txt:"Fatigué",cls:"warn"};
  if(e < 75) return {txt:"En forme",cls:""};
  return {txt:"Débordant d'énergie",cls:"good"};
}

export function stressLabel(s){
  if(s >= 80) return {txt:"Au bord du burnout",cls:"bad"};
  if(s >= 55) return {txt:"Sous pression",cls:"warn"};
  if(s >= 25) return {txt:"Tendu",cls:""};
  return {txt:"Zen",cls:"good"};
}

export function lifeStage(age){
  if(age < 23) return "Jeunesse";
  if(age < 30) return "Ascension";
  if(age < 36) return "Cap de la trentaine";
  if(age < 50) return "Maturité";
  return "Fin de règne";
}

/* ============================================================
   RETRAITE — mettre un point final à l'histoire (sans effacer la
   sauvegarde de force : le joueur choisit ensuite de continuer ou non).
============================================================ */
function epilogueFlavor(tier, age, years){
  if(tier <= 0) return "Vous raccrochez tôt, avant même d'avoir vraiment percé. Beaucoup abandonnent ici — vous, vous aurez au moins essayé, et ça, personne ne pourra vous l'enlever.";
  if(tier === 1) return "Le label n'a jamais vraiment décollé, mais il a existé, et pendant un temps, il a fait du bruit dans son coin. Pas mal pour un début.";
  if(tier === 2) return "Un label solide, connu du quartier au reste de la ville. Vous partez la tête haute, sans regrets, avec une belle histoire à raconter.";
  if(tier === 3) return "Votre nom circule bien au-delà de vos débuts. Vous quittez le jeu en patron respecté, et le silence qui suit une carrière comme la vôtre en dit long.";
  if(tier === 4) return "Un label international, un empire en construction que vous laissez à d'autres mains. Peu de gens montent aussi haut — vous, vous avez choisi de partir au sommet.";
  return `Après ${years} ans, vous quittez le jeu en légende vivante. Un empire musical, un nom que tout le monde connaît, et une vie entière consacrée à cette aventure. Peu écrivent une histoire pareille.`;
}

export function prepareEpilogue(){
  const tier = getTier();
  const years = Math.max(1, Math.round(state.chapter/365*10)/10);
  state.epilogueData = {
    label: state.label,
    manager: state.managerName,
    age: state.player.age,
    years,
    tierName: tier.name,
    tierIcon: tier.icon,
    artistsSigned: state.careerArtistsSigned||0,
    hits: state.careerHits||0,
    argent: state.argent,
    flavor: epilogueFlavor(tier.id, state.player.age, years)
  };
}

export function confirmRetire(){
  prepareEpilogue();
  state.retired = true;
  state.retireConfirmOpen = false;
  state.screen = "epilogue";
  playSound("retraite");
  safeRender();
  save();
}

export function dismissEpilogue(){
  state.retired = false;
  state.screen = "game";
  safeRender();
  save();
}

export function restartFromEpilogue(){
  clearSavedState();
  resetState();
  state.screen = "home";
  safeRender();
}

