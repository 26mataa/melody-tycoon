import { finalizeSigned, genThemesPreferes } from "./artists.js";
import { marketDistrustActive } from "./contracts.js";
import { rosterCap, rosterFull } from "./economy.js";
import { revealTalentAnimation } from "./roll.js";
import { notify } from "../notify.js";
import { after, safeRender } from "../render.js";
import { log, save, state } from "../state.js";
import { chance, clamp, fmt, pick, rint } from "../utils.js";
import { DATA } from "../data.js";

/* Valeur d'un artiste sur le marché.

   Revalorisé nettement à la hausse : les anciens montants faisaient
   qu'un espoir se signait pour 300 € et coûtait 5 €/épisode — une fois
   la première sortie passée, plus rien ne pesait, et le roster n'était
   jamais un vrai arbitrage. Signer doit être un engagement, et un gros
   nom doit faire peur au budget. C'est ce qui remplace le plafond
   d'effectif comme frein : ce n'est plus une règle arbitraire qui vous
   limite, c'est ce que vous pouvez réellement payer tous les mois. */
export function deriveMarketStats(pop, talent){
  const score = pop*0.72 + talent*0.28;
  let contrat, prix, salaire;
  if(pop >= 85){
    contrat = "star";
    prix = Math.round(45000 + (score-70)*1500);
    salaire = Math.round(520 + (score-70)*11);
  }else if(pop >= 55){
    contrat = "valeur";
    prix = Math.round(6000 + (score-45)*320);
    salaire = Math.round(75 + (score-45)*2.4);
  }else{
    contrat = "espoir";
    prix = Math.round(900 + score*26);
    salaire = Math.round(12 + score*0.42);
  }
  return {contrat, prix:Math.max(600,prix), salaire:Math.max(10,salaire)};
}

/* Ne peut pas être une const calculée au chargement du module : DATA n'est
   rempli qu'après le fetch() de main.js, qui arrive après l'évaluation de
   ce fichier. On calcule donc à la demande (une seule fois, mise en cache). */
let _marketDataV4Cache = null;
export function getMarketDataV4(){
  if(_marketDataV4Cache) return _marketDataV4Cache;
  _marketDataV4Cache = DATA.MARKET_DATA_V4_RAW.map((a,i)=>{
  const d = deriveMarketStats(a.pop,a.talent);
  const slug = a.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
  return {
    id:"v4-"+i+"-"+slug,
    name:a.name,
    genre:a.genre,
    talent:a.talent,
    pop:a.pop,
    contrat:d.contrat,
    perso:pick(["ambitieux","discret","professionnel","excentrique","instable"]),
    prix:d.prix,
    salaire:d.salaire
  };
  });
  return _marketDataV4Cache;
}

export function genBeatmaker(){
  const pool = pick(DATA.BEATMAKER_POOL);
  const skill = rint(30,90);
  return {
    id:"bm-"+Date.now()+"-"+rint(0,9999),
    name:pick(pool.names),
    genre:pool.genre,
    skill,
    prix: Math.round(150 + skill*12),
    salaire: Math.round(3 + skill*.12),
    projets:0,
    resting:0,
    hype:rint(10,90)
  };
}

export function refreshBeatmakerPool(){
  state.beatmakerPool = [genBeatmaker(),genBeatmaker(),genBeatmaker()];
}

export function beatmakerCap(){
  return Math.max(1, Math.ceil(rosterCap()/2));
}

/* Paliers de progression du label — tout scale sur ce score */

/* Le repérage était limité à UN artiste par saison, soit un roster qui
   mettait dix saisons à se construire — beaucoup trop lent pour un jeu
   où une saison dure une douzaine d'épisodes. On passe à plusieurs
   repérages par saison, et le lot de candidats se renouvelle après
   chaque signature : il y a toujours quelqu'un à aller voir. Le frein
   n'est plus le compteur, ce sont les salaires à payer derrière. */
export const REPERAGES_PAR_SAISON = 3;

export function reperagesRestants(){
  return Math.max(0, REPERAGES_PAR_SAISON - (state.scoutsUsed || 0));
}

export function refreshScout(){
  state.scout = [genScout(),genScout(),genScout(),genScout()];
  state.scoutsUsed = 0;
  state.scoutPickedId = null;
  state.scoutMsg = null;
  state.scoutModal = null;
}

export function eligibleScoutPools(){
  if(!state.genres || !state.genres.length) return DATA.SCOUT_POOLS;
  const filtered = DATA.SCOUT_POOLS.filter(p=>artistMatchesChosenGenres(p.genre));
  return filtered.length ? filtered : DATA.SCOUT_POOLS;
}

export function genScout(){
  const pool = pick(eligibleScoutPools());
  return {
    id:"sc-"+Date.now()+"-"+rint(0,9999),
    name:pick(pool.names),
    genre:pool.genre,
    perso:pool.perso,
    contrat:"espoir",
    talent:rint(pool.talent[0],pool.talent[1]),
    talentMin:pool.talent[0],
    talentMax:pool.talent[1],
    pop:0,
    prix:0,
    salaire:rint(2,9),
    humeur:rint(60,90),
    potential:rint(30,98),
    buzz:0,
    contractRemaining:8,
    contractChapters:8,
    hits:0,
    flops:0,
    projets:0,
    resting:0,
    relations:{},
    themesPreferes:genThemesPreferes(),
    audienceLockChapters:0
  };
}

export function externalFee(a){
  return Math.round(200 + a.pop*80 + a.talent*20);
}

export function externalAcceptChance(a){
  const main = state.signed.find(x=>x.id === (state.draft && state.draft.artist));
  let p = a.pop < 30 ? .75 : (a.pop < 60 ? .45 : .15);
  // Un featuring extérieur se décroche autant par le respect qu'on vous
  // porte que par la lumière que vous pouvez lui apporter.
  p += state.credibilite/250 + state.notoriete/400;
  if(main) p -= Math.max(0,(a.pop-main.pop)/100);
  if(marketDistrustActive()) p -= .15;
  return clamp(p,.05,.9);
}

export function genreMatchesCategory(rawGenre, category){
  const g = (rawGenre||"").toLowerCase();
  switch(category){
    case "Rap": return g.includes("rap") || g.includes("drill") || g.includes("rage") || g.includes("grime") || g.includes("crunk") || g.includes("plug");
    case "Pop": return g.includes("pop") && !g.includes("k-pop");
    case "K-pop": return g.includes("k-pop");
    case "Electro": return g.includes("electro") || g.includes("hyperpop") || g.includes("digicore");
    case "RnB": return g.includes("rnb") || g.includes("r&b") || g.includes("afro");
    case "Rock": return g.includes("rock");
    case "Metal": return g.includes("metal") || g.includes("core") || g.includes("blackgaze") || g.includes("death");
    case "Reggae": return g.includes("reggae") || g.includes("dub") || g.includes("dancehall");
    case "Jazz": return g.includes("jazz") || g.includes("classique") || g.includes("soul") || g.includes("ost") || g.includes("bossa");
    case "Techno": return g.includes("techno") || g.includes("edm") || g.includes("synth") || g.includes("disco") || g.includes("french-touch");
    case "Country": return g.includes("country") || g.includes("chanson") || g.includes("folk");
    case "Punk": return g.includes("punk") || g.includes("new-rave");
    case "Web": return g.includes("youtuber") || g.includes("insta-artist");
  }
  return false;
}

export function artistMatchesChosenGenres(rawGenre){
  if(!state.genres || !state.genres.length) return true;
  return state.genres.some(cat=>genreMatchesCategory(rawGenre,cat));
}

export function recruitBeatmaker(id){
  if(state.beatmakers.length >= beatmakerCap() && !state.adminMode) return notify("Effectif de beatmakers complet.");
  const b = state.beatmakerPool.find(x=>x.id===id);
  if(!b) return;
  if(state.argent < b.prix) return notify("Pas assez d'argent.");
  state.argent -= b.prix;
  state.beatmakerPool = state.beatmakerPool.filter(x=>x.id!==id);
  state.beatmakers.push(b);
  state.beatmakerSel = null;
  log(`🎚️ ${b.name} rejoint le label comme beatmaker (-${fmt(b.prix)}).`,"pos");
  after();
}

export function confirmScout(id){
  if(reperagesRestants() <= 0) return notify(`Vous avez déjà repéré ${REPERAGES_PAR_SAISON} artistes cette saison. Nouveau lot à la saison prochaine.`);
  if(rosterFull() && !state.adminMode) return notify(`Effectif complet (${state.signed.length}/${rosterCap()}) pour votre palier actuel.`);
  const a = state.scout.find(x=>x.id===id);
  if(!a) return;

  const input = document.getElementById("scoutNameInput");
  const originalName = a.name;
  const requestedName = (input && input.value.trim()) ? input.value.trim() : originalName;
  let nameRefused = false;
  if(requestedName !== originalName && chance(.10)){
    nameRefused = true;
  }else{
    a.name = requestedName;
  }

  state.scoutModal = null;
  safeRender();

  revealTalentAnimation(a.talentMin, a.talentMax, a.talent, ()=>{
    state.scoutsUsed = (state.scoutsUsed || 0) + 1;
    state.scoutPickedId = a.id;
    finalizeSigned(a);
    state.signed.push(a);

    const maxTalent = Math.max(...state.scout.map(x=>x.talent));
    if(a.talent === maxTalent) state.scoutMsg = "Excellent flair ! Vous avez recruté une vraie pépite.";
    else if(maxTalent - a.talent >= 15) state.scoutMsg = "Aïe… un autre artiste avait plus de potentiel.";
    else state.scoutMsg = "Recrutement correct. À voir sur la durée.";
    if(nameRefused) state.scoutMsg += ` ${originalName} a refusé le pseudo "${requestedName}" et garde son nom de scène.`;

    log(`🔭 ${a.name} rejoint le label via le repérage (gratuit). Talent révélé : ${a.talent}.${nameRefused?` A refusé le pseudo "${requestedName}" proposé.`:``}`,"pos");

    // Lot renouvelé après chaque signature : tant qu'il reste des
    // repérages, il y a de nouvelles têtes à aller voir plutôt qu'une
    // liste figée dont on a déjà pris le meilleur.
    if(reperagesRestants() > 0){
      state.scout = [genScout(),genScout(),genScout(),genScout()];
    }
    safeRender();
    save();
  });
}

export function popBracket(pop){
  return pop >= 75 ? "intl" : pop >= 40 ? "pays" : "insta";
}

export function marketGenreList(){
  return Array.from(new Set(state.market.map(a=>a.genre))).sort();
}

/* Pure mutation, sans rendu : appelée à chaque frappe, elle ne doit surtout
   pas reconstruire toute la page (voir setMarketSearchLive dans dispatch.js,
   qui se charge d'un rafraîchissement local plutôt qu'un rendu complet). */
export function setMarketSearch(v){ state.marketSearch = v; state.marketPage = 0; }

export function setMarketGenre(v){ state.marketGenre = v; state.marketPage = 0; safeRender(); save(); }

export function setMarketPopBracket(v){ state.marketPopBracket = v; state.marketPage = 0; safeRender(); save(); }

export function setMarketTalentBracket(v){ state.marketTalentBracket = v; state.marketPage = 0; safeRender(); save(); }

export function setMarketSalaireSort(v){ state.marketSalaireSort = v; state.marketPage = 0; safeRender(); save(); }

export function setMarketFilter(v){ state.marketFilter = v; state.marketPage = 0; safeRender(); save(); }

export function marketGoPage(p){ state.marketPage = p; safeRender(); save(); }

export function marketFilteredList(){
  let list = state.market;
  if(state.marketFilter !== "tous") list = list.filter(a=>a.contrat === state.marketFilter);
  if(state.marketSearch && state.marketSearch.trim()) list = list.filter(a=>a.name.toLowerCase().includes(state.marketSearch.trim().toLowerCase()));
  if(state.marketGenre !== "tous") list = list.filter(a=>a.genre === state.marketGenre);
  if(state.marketPopBracket !== "tous") list = list.filter(a=>popBracket(a.pop) === state.marketPopBracket);
  if(state.marketTalentBracket !== "tous"){
    const [lo,hi] = state.marketTalentBracket.split("-").map(Number);
    list = list.filter(a=>a.talent >= lo && a.talent <= hi);
  }
  list = list.slice();
  if(state.marketSalaireSort === "asc") list.sort((a,b)=>a.salaire-b.salaire);
  else if(state.marketSalaireSort === "desc") list.sort((a,b)=>b.salaire-a.salaire);
  return list;
}

