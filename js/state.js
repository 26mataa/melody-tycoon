import { genThemesPreferes } from "./engine/artists.js";
import { drawNextEpisode, seedStartingFlags } from "./engine/narrative.js";
import { creerCasting } from "./engine/cast.js";
import { rollSeasonLength } from "./engine/season.js";
import { artistMatchesChosenGenres, getMarketDataV4, refreshBeatmakerPool, refreshScout } from "./engine/market.js";
import { ensureDraft } from "./engine/production.js";
import { genRivalArtist } from "./engine/rivalite.js";
import { notify } from "./notify.js";
import { safeRender } from "./render.js";
import { loadState, saveState } from "./storage.js";
import { chapterStr, clone, rint } from "./utils.js";
import { DATA } from "./data.js";

/* ============================================================
   ÉTAT — un seul objet state partagé par tout le jeu.
   En modules ES, une liaison importée ne peut pas être réassignée
   depuis un autre fichier : resetState()/setPrevStats() existent pour
   ça (utilisées par ui/home.js et render.js, qui ne peuvent pas faire
   `state = ...` directement).
============================================================ */
export let state = null;
export let prevStats = null;

export function resetState(){
  state = newState();
}
export function setPrevStats(v){
  prevStats = v;
}

/* Compteurs cumulés sur la saison en cours, remis à zéro à chaque bilan. */
export function newSeasonStats(){
  return {inc:0,cost:0,chapters:0,streams:0,sorties:0,signes:0};
}

export function newState(){
  return {
    screen:"home",
    startId:"zero",
    managerName:"",
    label:"",
    tab:"dash",
    labelSub:"artistes",
    chapter:0,season:1,episodeInSeason:0,seasonLength:12,lastReleaseChapter:0,
    seasonStats:newSeasonStats(),seasonFinale:null,
    consecutiveCrisisSeasons:0,storyFlags:[],gameOverData:null,
    argent:0,notoriete:0,credibilite:5,
    totalStreams:0,
    currentEpisode:null,episodeQueue:[],recentEpisodeIds:[],mandate:null,
    conduite:{},retoursEnAttente:[],cast:[],
    careerArtistsSigned:0,careerHits:0,retired:false,
    retireConfirmOpen:false,epilogueData:null,profilePanelOpen:false,
    signed:[],market:[],scout:[],beatmakers:[],beatmakerPool:[],projects:[],releases:[],rivals:[],journal:[],cashHistory:[],
    scoutUsed:false,scoutPickedId:null,scoutMsg:null,scoutModal:null,
    artistSel:null,marketSel:null,beatmakerSel:null,rivalProfile:null,bankModal:false,
    audienceModal:null,
    beatmakerDrawerOpen:true,beatmakerDrawerMin:false,
    negotiation:null,
    mamie:{active:false,stopAt:100000,totalRecu:0,cooldownUntilChapter:0,independant:false,bag:[],musicBag:[],lastPhrase:"",panelOpen:false,uses:0},
    bank:{dette:0},
    sabotageUsed:false,
    stolenBeatBonus:0,
    marketDistrustUntil:0,
    adminMode:false,
    adminPanelOpen:false,
    marketFilter:"tous",
    marketSearch:"",
    marketGenre:"tous",
    marketPopBracket:"tous",
    marketTalentBracket:"tous",
    marketSalaireSort:"none",
    marketPage:0,
    journalFilter:"tous",
    seasonEventCount:0,
    lastEventSeason:-1,
    ui:{themeMode:"auto",soundOn:true},
    draft:null,
    cd:{},
    genres:[],
    look:"",
    lookHint:null,
    startFlavor:null,
    avatarPhoto:null,
    player:{age:24,energy:80,stress:15},
    pendingConsequences:[],
    financeBreakdownOpen:false,
    negotiationsCompleted:0
  };
}

export function patchState(){
  if(!state) state = newState();
  const base = newState();
  for(const k in base){
    if(state[k] === undefined) state[k] = base[k];
  }
  if(typeof state.mamie !== "object" || state.mamie === null) state.mamie = clone(base.mamie);
  for(const k in base.mamie){
    if(state.mamie[k] === undefined) state.mamie[k] = base.mamie[k];
  }
  if(typeof state.bank !== "object" || state.bank === null) state.bank = {dette:0};
  if(state.bank.dette === undefined) state.bank.dette = 0;
  if(typeof state.ui !== "object" || state.ui === null) state.ui = {themeMode:"auto",soundOn:true};
  if(state.ui.themeMode === undefined) state.ui.themeMode = "auto";
  if(state.ui.soundOn === undefined) state.ui.soundOn = true;
  if(typeof state.player !== "object" || state.player === null) state.player = clone(base.player);
  for(const k in base.player){
    if(state.player[k] === undefined) state.player[k] = base.player[k];
  }

  ["signed","market","scout","beatmakers","beatmakerPool","projects","releases","rivals","journal","cashHistory","genres","pendingConsequences","episodeQueue","recentEpisodeIds","storyFlags","retoursEnAttente","cast"].forEach(k=>{
    if(!Array.isArray(state[k])) state[k]=[];
  });
  if(typeof state.conduite !== "object" || state.conduite === null) state.conduite = {};
  // Une partie en cours doit toujours avoir un épisode à l'écran : c'est lui
  // qui fait avancer le temps, sans lui le jeu serait bloqué.
  if(!state.currentEpisode && state.screen === "game"){
    drawNextEpisode();
  }

  state.signed.forEach(a=>{
    if(a.buzz === undefined) a.buzz = 0;
    if(a.potential === undefined) a.potential = rint(40,85);
    if(a.humeur === undefined) a.humeur = rint(60,85);
    if(a.hits === undefined) a.hits = 0;
    if(a.flops === undefined) a.flops = 0;
    if(a.projets === undefined) a.projets = 0;
    if(a.contractRemaining === undefined) a.contractRemaining = 60;
    if(a.contractChapters === undefined) a.contractChapters = a.contractRemaining;
    if(a.relations === undefined) a.relations = {};
    if(a.resting === undefined) a.resting = 0;
    if(a.projectsThisSeason === undefined) a.projectsThisSeason = 0;
    if(a.beatBonus === undefined) a.beatBonus = 0;
    if(!a.themesPreferes || !a.themesPreferes.length) a.themesPreferes = genThemesPreferes();
    if(a.audienceLockChapters === undefined) a.audienceLockChapters = 0;
  });

  state.releases.forEach(r=>{
    if(r.streams === undefined) r.streams = 0;
    if(r.dailyStreams === undefined) r.dailyStreams = 0;
    if(r.age === undefined) r.age = 0;
    if(r.decay === undefined) r.decay = .87;
    if(r.totalRevenue === undefined) r.totalRevenue = 0;
    if(r.reviews === undefined) r.reviews = [];
    if(r.lastHypeDate === undefined) r.lastHypeDate = -999;
    if(r.artistId === undefined){
      const found = state.signed.find(x=>x.name===r.artistName);
      r.artistId = found ? found.id : null;
    }
    if(r.history === undefined) r.history = [{age:0,streams:r.streams||0}];
  });

  state.projects.forEach(p=>{
    if(p.title === undefined) p.title = "Sans titre";
    if(p.reste === undefined) p.reste = 1;
    if(p.prediction === undefined) p.prediction = "Incertain";
    if(p.predictionScore === undefined) p.predictionScore = 50;
    if(p.chapitresTotal === undefined) p.chapitresTotal = (DATA.PTYPES[p.type]||{}).chapitres || Math.max(p.reste,1);
  });

  state.rivals.forEach(r=>{
    if(r.streamsWeek === undefined) r.streamsWeek = 0;
    if(r.rivalry === undefined) r.rivalry = 0;
    if(r.history === undefined) r.history = [];
  });

  state.beatmakers.forEach(b=>{
    if(b.skill === undefined) b.skill = 50;
    if(b.salaire === undefined) b.salaire = 6;
    if(b.projets === undefined) b.projets = 0;
    if(b.resting === undefined) b.resting = 0;
    if(b.hype === undefined) b.hype = rint(10,90);
  });

  if(state.draft) ensureDraft();
}

export function save(){
  if(!state) return;
  try{
    const cloneState = JSON.parse(JSON.stringify(state));
    cloneState.negotiation = null;
    cloneState.scoutModal = null;
    cloneState.bankModal = false;
    cloneState.rivalProfile = null;
    cloneState.artistSel = null;
    cloneState.marketSel = null;
    cloneState.beatmakerSel = null;
    saveState(cloneState);
  }catch(e){}
}

export function load(){
  const loaded = loadState();
  if(!loaded) return false;
  state = loaded;
  patchState();
  return true;
}

/* ============================================================
   ÉCONOMIE : IMPACT() CENTRALISÉ (règle d'or — tout passe par ici)
============================================================ */

export function log(m,t){
  state.journal.push({d:chapterStr(),m,t:t||"info"});
  if(state.journal.length > 160) state.journal.shift();
}

export function canCreate(){
  return (state.managerName || "").trim().length > 0 && (state.label || "").trim().length > 0;
}

export function startGame(){
  if(!canCreate()) return notify("Veuillez renseigner le nom du manager et le nom du label.");

  const start = DATA.START_OPTIONS.find(s=>s.id===state.startId) || DATA.START_OPTIONS[0];
  state.managerName = state.managerName.trim();
  state.label = state.label.trim();

  state.argent = start.budget;
  state.adminMode = start.id === "admin";
  // On démarre inconnu (notoriété 0) mais pas à zéro de crédibilité : on a
  // au moins la parole de quelqu'un qui n'a encore rien fait de mal.
  state.notoriete = start.id === "zero" ? 0 : 100;
  state.credibilite = start.id === "zero" ? 5 : 100;
  state.totalStreams = 0;
  state.currentEpisode = null; state.episodeQueue = []; state.recentEpisodeIds = []; state.mandate = null;
  state.conduite = {}; state.retoursEnAttente = [];
  state.careerArtistsSigned = 0; state.careerHits = 0; state.retired = false;
  state.chapter = 0;
  state.season = 1;
  state.episodeInSeason = 0;
  state.seasonLength = rollSeasonLength();
  state.lastReleaseChapter = 0;
  state.seasonStats = newSeasonStats();
  state.seasonFinale = null;
  state.consecutiveCrisisSeasons = 0;
  state.storyFlags = [];
  state.gameOverData = null;
  state.signed = [];
  let marketPool = DATA.MARKET_DATA.concat(getMarketDataV4());
  if(state.genres && state.genres.length){
    const filtered = marketPool.filter(a=>artistMatchesChosenGenres(a.genre));
    marketPool = filtered.length ? filtered : marketPool;
  }
  state.market = clone(marketPool).map(a=>{
    a.buzz = a.contrat==="star" ? rint(28,55) : a.contrat==="valeur" ? rint(10,26) : rint(0,8);
    a.themesPreferes = genThemesPreferes();
    a.audienceLockChapters = 0;
    return a;
  });
  state.projects = [];
  state.releases = [];
  state.journal = [];
  state.cashHistory = [];
  state.draft = null;
  state.negotiation = null;
  state.sabotageUsed = false;
  state.stolenBeatBonus = 0;
  state.seasonEventCount = 0;
  state.lastEventSeason = -1;
  state.tab = "dash";
  state.labelSub = "artistes";
  state.bank = {dette:0};
  state.mamie = {
    active: !!start.mamie,
    stopAt: 100000,
    totalRecu: 0,
    cooldownUntilChapter: 0,
    independant: false,
    bag: [],
    musicBag: [],
    lastPhrase: "",
    panelOpen: false,
    uses: 0
  };

  state.rivals = DATA.RIVAL_NAMES.map(r=>{
    const roster = [];
    const cnt = rint(2,5);
    for(let i=0;i<cnt;i++) roster.push(genRivalArtist());
    return {
      ...r,
      argent: rint(5000,80000),
      rep: rint(40,75),
      buzz: rint(20,70),
      aggro: rint(10,30),
      rivalry: 0,
      streamsWeek: 0,
      roster,
      history: []
    };
  });

  refreshScout();
  refreshBeatmakerPool();
  state.beatmakers = [];
  state.player = {age: rint(19,27), energy:85, stress:10};
  state.pendingConsequences = [];
  state.screen = "game";
  log(`🏁 ${state.label} est fondé par ${state.managerName}. Objectif : signer un artiste, produire, devenir indépendant — puis dominer le game.`,"info");

  // Le point de départ tiré à la création ouvre le journal : c'est la
  // première ligne de l'histoire de cette partie-là.
  const flavors = DATA.START_FLAVORS || [];
  const f = state.startFlavor && flavors[state.startFlavor.index];
  if(f) log(`${f.icon} ${f.name} — ${f.desc}`,"info");

  // Graine narrative : une ou deux circonstances de départ tirées au sort.
  // Tout le monde démarre avec le même argent ; personne ne démarre avec la
  // même histoire.
  seedStartingFlags();
  // Les quatre personnes qui traverseront toute la partie. Tirées ici, à
  // la fondation du label : avant, il n'y a pas encore de label à suivre.
  creerCasting();
  drawNextEpisode();

  safeRender();
  save();
}

/* ============================================================
   JEU : RENDER PRINCIPAL — navigation instinctive à 3 destinations
============================================================ */

