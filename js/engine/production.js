import { getRelation } from "./events.js";
import { externalAcceptChance, externalFee } from "./market.js";
import { performRoll } from "./roll.js";
import { playSound } from "./sound.js";
import { notify } from "../notify.js";
import { safeRender } from "../render.js";
import { log, save, state } from "../state.js";
import { chance, clamp, chapterStr, fmt, fmtS, genTitle, langMatches, pick, rand, rint, shuffleArr } from "../utils.js";
import { DATA } from "../data.js";

/* Streams générés par une sortie sur un chapitre. La vie d'un morceau suit
   l'arc narratif : montée sur les deux premiers épisodes, puis décroissance
   continue — une sortie s'essouffle en 2 à 3 saisons. */
export function releaseChapterStreams(r){
  if(!r.dailyStreams) return 0;
  const age = r.age||0;
  const rampMult = age === 0 ? .55 : age === 1 ? .82 : 1;
  const factor = Math.pow(r.decay || .87, age/2);
  return Math.round(r.dailyStreams * factor * rampMult);
}

/* Événement rare (≈6%/épisode/sortie récente) : plantage ou décollage viral, avec grosse animation. */

export function rareReleaseEvent(r, quiet){
  const boost = chance(.5);
  const factor = boost ? rand(2.5,4.5) : rand(.15,.35);
  r.dailyStreams = Math.max(0, Math.round(r.dailyStreams * factor));
  const msg = boost
    ? `🚀 « ${r.title} » devient virale du jour au lendemain : streams multipliés par ${factor.toFixed(1)} !`
    : `💥 « ${r.title} » s'effondre brutalement (algorithme, bad buzz...) : streams divisés par ${(1/factor).toFixed(1)}.`;
  log(msg, boost?"pos":"neg");
  if(boost) state.notoriete = clamp(state.notoriete + rint(4,8), 0, 100);
  else state.notoriete = clamp(state.notoriete - rint(2,5), 0, 100);
  if(!quiet) triggerRocketAnimation(boost);
}

export function triggerRocketAnimation(boost){
  let el = document.getElementById("rocketFx");
  if(!el){
    el = document.createElement("div");
    el.id = "rocketFx";
    document.body.appendChild(el);
  }
  el.textContent = boost ? "🚀" : "💥";
  el.className = "rocket-fx " + (boost ? "boost" : "crash");
  document.body.classList.add("screen-shake");
  setTimeout(()=>{
    document.body.classList.remove("screen-shake");
    el.className = "rocket-fx";
  }, 1400);
}

export function calcPrediction(){
  const d = state.draft;
  if(!d || !d.type || !d.artist) return {pct:50,label:"Incertain",cls:"uncertain"};
  const a = state.signed.find(x=>x.id===d.artist);
  if(!a) return {pct:50,label:"Incertain",cls:"uncertain"};

  let score = 0;
  score += a.talent * .28;
  score += a.potential * .18;
  score += a.pop * .14;
  score += clamp(a.buzz,-20,20) * .35;
  score += (a.humeur-50) * .08;

  const prod = DATA.PRODS.find(x=>x.id===d.prod);
  if(prod) score += prod.bonus * .45;

  const theme = DATA.THEMES.find(x=>x.id===d.theme);
  if(theme) score += theme.pub*.35 + theme.buzz*.25 - theme.risk*.8;
  if(a.themesPreferes && a.themesPreferes.includes(d.theme)) score += 10;

  const cover = DATA.COVER_STYLES.find(x=>x.name===d.cover);
  if(cover) score += cover.pub*.4;

  const promo = DATA.PROMO_OPTIONS.find(x=>x.id===d.promo);
  if(promo) score += promo.mult*12;

  const stunt = DATA.MARKETING_OPTIONS.find(x=>x.id===d.stunt);
  if(stunt) score += stunt.bonus*.35 - stunt.risk*.6;

  if(langMatches(d.langue,d.marche)) score += 5;
  else score -= 5;

  score += rand(-14,14);
  score = clamp(Math.round(score),5,95);

  let label,cls;
  if(score < 25){ label="Flop probable"; cls="bad"; }
  else if(score < 45){ label="Incertain"; cls="warn"; }
  else if(score < 65){ label="Correct"; cls="good"; }
  else if(score < 82){ label="Potentiel hit"; cls="good"; }
  else{ label="Potentiel classique"; cls="accent"; }

  const pctMin = clamp(score-12,5,95);
  const pctMax = clamp(score+12,5,95);

  return {pct:score,pctMin,pctMax,label,cls};
}

export function getProductionStage(p){
  const pt = DATA.PTYPES[p.type];
  if(!pt) return "Écriture";
  const pct = 1 - (p.reste / pt.chapitres);
  if(pct < .20) return "Écriture";
  if(pct < .45) return "Enregistrement";
  if(pct < .70) return "Mixage";
  if(pct < .90) return "Mastering";
  return "Finalisation";
}

/* La fourchette d'estimation se resserre progressivement à mesure que la sortie approche. */

export function projectPredictionRange(p){
  const total = p.chapitresTotal || (DATA.PTYPES[p.type]||{}).chapitres || 1;
  const progress = clamp(1 - (p.reste / total), 0, 1);
  const variance = Math.round(12 * (1 - progress)) + 1;
  const score = p.predictionScore !== undefined ? p.predictionScore : 50;
  return {
    pctMin: clamp(score - variance, 5, 95),
    pctMax: clamp(score + variance, 5, 95),
    label: p.prediction || "Incertain",
    progress: Math.round(progress*100)
  };
}

export function projectProgress(p){
  const pt = DATA.PTYPES[p.type];
  if(!pt) return 0;
  return Math.round((1 - p.reste / pt.chapitres) * 100);
}

export function projectLock(k){
  const pt = DATA.PTYPES[k];
  if(!pt) return "Projet invalide";
  const needA = pt.artists || 1;
  if(state.signed.length < needA) return `≥${needA} artiste(s)`;
  if(pt.rep && state.notoriete < pt.rep) return `Notoriété ≥ ${pt.rep}`;
  if(pt.releases && state.releases.length < pt.releases) return `≥${pt.releases} sorties`;
  return null;
}

export function ensureDraft(){
  const d = state.draft;
  if(!d) return;
  if(!Array.isArray(d.themes) || d.themes.length === 0 || d.themesFor !== d.artist){
    const artist = d.artist ? state.signed.find(x=>x.id===d.artist) : null;
    if(artist && artist.themesPreferes && artist.themesPreferes.length){
      const preferred = DATA.THEMES.filter(t=>artist.themesPreferes.includes(t.id));
      const others = shuffleArr(DATA.THEMES.filter(t=>!artist.themesPreferes.includes(t.id))).slice(0, Math.max(0,4-preferred.length));
      d.themes = shuffleArr(preferred.concat(others));
    }else{
      d.themes = shuffleArr(DATA.THEMES).slice(0,4);
    }
    d.themesFor = d.artist;
  }
  if(!Array.isArray(d.covers) || d.covers.length === 0) d.covers = shuffleArr(DATA.COVER_STYLES.filter(c=>c.cost>0)).slice(0,2);
  if(d.title === undefined || d.title === null) d.title = genTitle();
  if(d.type && !DATA.PTYPES[d.type]) d.type = null;
  if(d.featSearch === undefined) d.featSearch = "";
  if(d.feat === undefined) d.feat = null;
  if(d.langue === undefined) d.langue = null;
  if(d.theme === undefined) d.theme = null;
  if(d.marche === undefined) d.marche = "fr";
  if(d.prod === undefined) d.prod = "home";
  if(d.cover === undefined) d.cover = "Cover maison";
  if(d.promo === undefined) d.promo = "org";
  if(d.stunt === undefined) d.stunt = "none";
  if(d.mode === undefined) d.mode = null;
  if(d.step === undefined) d.step = 0;
  if(d.maxStep === undefined) d.maxStep = 0;
  if(d.beatmaker === undefined) d.beatmaker = null;
  if(d.beatType === undefined) d.beatType = null;
  if(d.beatTarget === undefined) d.beatTarget = null;
}

/* Liste des étapes affichées (fil d'ariane), selon le mode du projet en cours */

export function draftStepNames(d){
  if(d.mode === "beatmaker"){
    const steps = ["Qui & Format","Titre"];
    if(d.beatType && DATA.BEAT_PTYPES[d.beatType] && DATA.BEAT_PTYPES[d.beatType].needsArtist) steps.push("Bénéficiaire");
    steps.push("Récap");
    return steps;
  }
  if(d.mode === "artist"){
    return ["Format","Artiste","Thème","Langue & Marché","Production","Marketing","Titre","Récap"];
  }
  return ["Qui produit ?"];
}

export function draftGoStep(n){
  state.draft.step = n;
  safeRender();
}

export function themeName(id){
  const t = DATA.THEMES.find(x=>x.id===id);
  return t ? t.name : "?";
}

export function langueName(id){
  const l = DATA.LANGUES.find(x=>x.id===id);
  return l ? l.name : "?";
}

export function draftCost(){
  const d = state.draft;
  if(!d || !d.type) return 0;
  let c = DATA.PTYPES[d.type].cost || 0;
  const prod = DATA.PRODS.find(x=>x.id===d.prod); if(prod) c += prod.cost;
  const marche = DATA.MARCHES.find(x=>x.id===d.marche); if(marche) c += marche.cost;
  const cover = DATA.COVER_STYLES.find(x=>x.name===d.cover); if(cover) c += cover.cost;
  const promo = DATA.PROMO_OPTIONS.find(x=>x.id===d.promo); if(promo) c += promo.cost;
  const stunt = DATA.MARKETING_OPTIONS.find(x=>x.id===d.stunt); if(stunt) c += stunt.cost;
  return c;
}

export function artistNameById(id){
  const a = state.signed.find(x=>x.id === id);
  return a ? a.name : "?";
}

export function startDraft(artistId){
  if(state.signed.length === 0 && state.beatmakers.length === 0) return notify("Vous devez d'abord signer un artiste ou un beatmaker.");
  state.tab = "label";
  state.labelSub = "production";
  state.draft = {
    mode: artistId ? "artist" : (state.signed.length===0 ? "beatmaker" : (state.beatmakers.length===0 ? "artist" : null)),
    step: 0,
    type:null,
    artist:artistId || null,
    title:genTitle(),
    theme:null,
    langue:null,
    marche:"fr",
    prod:"home",
    cover:"Cover maison",
    promo:"org",
    stunt:"none",
    feat:null,
    featSearch:"",
    beatmaker:null,
    beatType:null,
    beatTarget:null
  };
  ensureDraft();
  safeRender();
  save();
}

/* Une opportunité née d'un événement (relation, clash, tendance...) peut
   déboucher directement sur un projet de chanson pré-rempli. */

export function startCollabFromEvent(artistId, featArtistId){
  startDraft(artistId);
  if(state.draft) state.draft.feat = "int:"+featArtistId;
  safeRender();
  save();
}

/* Petits gestes qui combinaient plusieurs instructions dans un onclick=
   inline (impossible à conserver tel quel avec la délégation d'événements). */
export function regenerateDraftTitle(){
  state.draft.title = genTitle();
  safeRender();
}

export function openArtistProjectFromModal(artistId){
  state.artistSel = null;
  startDraft(artistId);
}

export function chooseDraftMode(mode){
  state.draft.mode = mode;
  state.draft.step = 0;
  safeRender();
}

export function draftAdvance(){
  const d = state.draft;
  d.step++;
  d.maxStep = Math.max(d.maxStep||0, d.step);
  safeRender();
}

/* ---- Flux ARTISTE ---- */

export function launchProject(){
  const d = state.draft;
  if(!d || !d.type || !d.artist || !d.langue || !d.theme) return notify("Complétez le projet.");
  const lock = projectLock(d.type);
  if(lock) return notify(lock);
  const artist = state.signed.find(x=>x.id===d.artist);
  if(artist && artist.resting > 0) return notify(`${artist.name} est en repos, indisponible.`);
  if(artist && artist.audienceLockChapters > 0) return notify(`${artist.name} change de public, indisponible pour ${artist.audienceLockChapters} ép..`);

  const baseCost = draftCost();

  if(d.feat && d.feat.startsWith("ext:")){
    const external = state.market.find(x=>x.id === d.feat.replace("ext:",""));
    if(!external){
      d.feat = null;
      return launchProject();
    }
    const fee = externalFee(external);
    const chanceAccept = externalAcceptChance(external);
    if(state.argent < baseCost + fee) return notify("Pas assez d'argent pour payer le feat externe.");

    performRoll(chanceAccept,()=>{
      log(`🤝 ${external.name} accepte le feat !`,"pos");
      buildProject(baseCost + fee, external.name);
    },()=>{
      log(`🚫 ${external.name} a décliné l'invitation. Le projet continue sans feat.`,"info");
      buildProject(baseCost, null);
    },"Feat accepté","Feat refusé");
    return;
  }

  let featName = null;
  if(d.feat && d.feat.startsWith("int:")){
    const fa = state.signed.find(x=>x.id === d.feat.replace("int:",""));
    featName = fa ? fa.name : null;
  }

  if(state.argent < baseCost) return notify("Pas assez d'argent.");
  buildProject(baseCost, featName);
}

export function buildProject(totalCost, featName){
  const d = state.draft;
  if(!d) return;
  const pt = DATA.PTYPES[d.type];
  if(!pt) return;
  const a = state.signed.find(x=>x.id===d.artist);
  if(!a) return;

  const overworked = state.projects.some(pr=>pr.artist===a.id);
  a.projectsThisSeason = (a.projectsThisSeason||0) + 1;

  state.argent -= totalCost;
  const prediction = calcPrediction();
  const title = (d.title && d.title.trim()) ? d.title.trim() : genTitle();
  const marche = DATA.MARCHES.find(x=>x.id===d.marche);

  state.projects.push({
    kind:"song",
    type:d.type,
    artist:a.id,
    featName:featName || null,
    featId:(d.feat && d.feat.startsWith("int:")) ? d.feat.replace("int:","") : null,
    title,
    theme:d.theme,
    langue:d.langue,
    marche:d.marche,
    marcheName:marche ? marche.name : "France",
    prod:d.prod,
    cover:d.cover,
    promo:d.promo,
    stunt:d.stunt,
    reste:pt.chapitres,
    chapitresTotal:pt.chapitres,
    investi:totalCost,
    prediction:prediction.label,
    predictionScore:prediction.pct
  });

  a.projets++;
  if(overworked){
    a.humeur = clamp(a.humeur - rint(3,6), 0, 100);
    log(`😓 ${a.name} enchaîne les projets sans repos : moral en baisse.`,"neg");
  }
  if(a.projectsThisSeason >= 2){
    const penalty = Math.min(24, (a.projectsThisSeason-1) * 7);
    a.humeur = clamp(a.humeur - penalty, 0, 100);
    log(`😩 ${a.name} enchaîne un ${a.projectsThisSeason}ᵉ projet cette saison : -${penalty} Moral (surmenage). Un moral bas dégrade directement la qualité des prochains sons.`,"neg");
  }
  log(`🎛️ « ${title} » lancé avec ${a.name} (${fmt(totalCost)}).`,"info");
  state.draft = null;
  safeRender();
  save();
}

export function launchBeatProject(){
  const d = state.draft;
  if(!d || !d.beatmaker || !d.beatType) return notify("Complétez le projet.");
  const bt = DATA.BEAT_PTYPES[d.beatType];
  if(bt.needsArtist && !d.beatTarget) return notify("Choisissez un artiste bénéficiaire.");
  if(bt.rep && state.credibilite < bt.rep) return notify(`Crédibilité ≥ ${bt.rep} requise.`);
  const bm = state.beatmakers.find(x=>x.id===d.beatmaker);
  if(!bm) return notify("Beatmaker introuvable.");
  if(bm.resting > 0) return notify(`${bm.name} est en repos.`);
  if(state.argent < bt.cost) return notify("Pas assez d'argent.");

  state.argent -= bt.cost;
  const title = (d.title && d.title.trim()) ? d.title.trim() : genTitle();

  state.projects.push({
    kind:"beat",
    type:d.beatType,
    beatmaker:bm.id,
    beatTarget:d.beatTarget || null,
    title,
    reste:bt.chapitres,
    investi:bt.cost,
    beatHype:bm.hype
  });

  bm.projets = (bm.projets||0) + 1;
  log(`🎚️ « ${title} » (${bt.name}) lancé avec ${bm.name} (${fmt(bt.cost)}).`,"info");
  state.draft = null;
  safeRender();
  save();
}

/* ============================================================
   AVIS — piochés dans la vraie base (data/reviews.json, 355 entrées
   presse + réseaux). On sélectionne par proximité de note plutôt que
   par palier de texte figé : un son à 82 de qualité récolte des avis
   qui tournent autour de 8/10, un son raté récolte les avis assassins.
============================================================ */

function pickReviewsNear(note, tier, count, exclude){
  const all = (DATA.REVIEWS || []).filter(r=>
    r.tier === tier && typeof r.score === "number" && !exclude.has(r.quote)
  );
  if(!all.length) return [];

  // Fenêtre qui s'élargit tant qu'on n'a pas de quoi choisir.
  let fenetre = 1.0;
  let dans = [];
  while(dans.length < count && fenetre <= 10){
    dans = all.filter(r=>Math.abs(r.score - note) <= fenetre);
    fenetre += 1.0;
  }
  if(!dans.length) dans = all;

  const out = [];
  const restants = shuffleArr(dans);
  for(const r of restants){
    if(out.length >= count) break;
    if(exclude.has(r.quote)) continue;
    exclude.add(r.quote);
    out.push({src:r.source, txt:r.quote, note:`${r.score}/10`, tier:r.tier});
  }
  return out;
}

export function buildReviews(q, ptype, marquee){
  // La qualité est sur 100, les avis notent sur 10.
  const note = clamp(q/10, 0, 10);
  const big = DATA.PTYPES[ptype] && DATA.PTYPES[ptype].cost >= 1800;

  // Une sortie marquante (ou un gros format) attire davantage de monde.
  const nPresse = (marquee || big || state.credibilite >= 60) ? 2 : 1;
  const nSocial = (marquee || state.notoriete >= 35) ? 2 : 1;

  const vus = new Set();
  const out = pickReviewsNear(note, "presse", nPresse, vus)
    .concat(pickReviewsNear(note, "social", nSocial, vus));

  // Filet de sécurité si la base n'a pas été chargée.
  if(!out.length){
    return [{src:"La critique", txt: q>=70 ? "Solide et inspiré." : "Honnête sans plus.", note:`${Math.round(note)}/10`, tier:"presse"}];
  }
  return shuffleArr(out);
}

export function resolveBeatProject(p){
  const bm = state.beatmakers.find(x=>x.id===p.beatmaker);
  if(!bm){
    log(`⚠️ Projet de beats annulé : le beatmaker a quitté le label.`,"neg");
    return;
  }
  const bt = DATA.BEAT_PTYPES[p.type] || DATA.BEAT_PTYPES.pack;
  bm.projets = (bm.projets||0) + 1;
  const hype = p.beatHype !== undefined ? p.beatHype : bm.hype;
  const hypeMult = 1 + (hype-50)/250;

  if(p.type === "exclusif"){
    const target = state.signed.find(x=>x.id===p.beatTarget);
    if(target){
      target.beatBonus = Math.round((10 + bm.skill*0.15) * hypeMult);
      log(`🎚️ « ${p.title} » livré par ${bm.name}${hype>=70?` (hype à ${hype}% au lancement, bonus renforcé)`:``} : ${target.name} bénéficiera d'un bonus de qualité (+${target.beatBonus}) sur son prochain projet.`,"pos");
    }else{
      log(`🎚️ « ${p.title} » livré par ${bm.name}, mais l'artiste destinataire a quitté le label : beat perdu.`,"neg");
    }
    return;
  }

  const mult = (0.6 + bm.skill/100) * hypeMult;
  const revenue = Math.round((bt.base||0) * mult * rand(0.8,1.3));
  state.argent += revenue;
  log(`🎚️ « ${p.title} » (${bt.name}) livré par ${bm.name}${hype>=70?` (était hype au lancement)`:``} : +${fmt(revenue)}.`,"pos");
}

/* mixBonus : résultat du mini-jeu de mix final (voir ui/mixqte.js).
   Volontairement modeste (±10) — c'est le geste final du producteur,
   pas un raccourci qui remplacerait le travail de production. */
export function resolveRelease(p, mixBonus){
  const a = state.signed.find(x=>x.id===p.artist);
  if(!a){
    log("⚠️ Projet annulé : artiste parti.","neg");
    return;
  }

  const pt = DATA.PTYPES[p.type] || DATA.PTYPES.maquette;
  const theme = DATA.THEMES.find(t=>t.id===p.theme) || {pub:0,crit:0,buzz:0,risk:0};
  const prod = DATA.PRODS.find(x=>x.id===p.prod) || {bonus:0};
  const cover = DATA.COVER_STYLES.find(x=>x.name===p.cover) || {pub:0,crit:0,risk:0};
  const promo = DATA.PROMO_OPTIONS.find(x=>x.id===p.promo) || {mult:0,risk:0};
  const stunt = DATA.MARKETING_OPTIONS.find(x=>x.id===p.stunt) || {bonus:0,risk:0};
  const market = DATA.MARCHES.find(x=>x.id===p.marche) || {reach:1,name:"France"};
  const langue = p.langue || "fr";

  let langMult = 1;
  let variance = .10;

  if(langue === "fr" && p.marche === "fr"){ langMult = 1.15; variance = .06; }
  else if(langue === "en" && ["uk","usa","intl"].includes(p.marche)){ langMult = 1.15; variance = .06; }
  else if(langue === "bi"){ langMult = 1.05; variance = .08; }
  else if(langue === "instru"){ langMult = .95; variance = .05; }
  else{ langMult = .9; variance = .15; }

  if(!langMatches(langue,p.marche)) variance += .12;

  const themeMatch = a.themesPreferes && a.themesPreferes.includes(p.theme);
  const featArtist = p.featId ? state.signed.find(x=>x.id===p.featId) : null;
  const chemistry = featArtist ? getRelation(a,featArtist).score : 0;
  const chemistryBonus = featArtist ? clamp(chemistry*.15, -10, 8) : 0;
  let quality = a.talent*.45 + a.potential*.20 + prod.bonus*1.2 + theme.crit*.5 + cover.crit*.4 + (a.humeur-50)*.35 + state.stolenBeatBonus + (a.beatBonus||0) + (themeMatch?8:0) + chemistryBonus + rand(-10,10);
  if(a.humeur < 25) quality -= 10; // burnout : en dessous d'un certain moral, la qualité décroche franchement
  if(mixBonus){
    quality += mixBonus;
    log(mixBonus > 0
      ? `🎚️ Le mix final de « ${p.title} » est réussi : +${mixBonus} qualité.`
      : `🎚️ Le mix final de « ${p.title} » est bâclé : ${mixBonus} qualité.`,
      mixBonus > 0 ? "pos" : "neg");
  }
  quality = clamp(quality,5,100);
  if(a.beatBonus){
    log(`🎚️ Bonus de beat exclusif consommé pour « ${p.title} » (+${a.beatBonus} qualité).`,"info");
    a.beatBonus = 0;
  }
  if(themeMatch) log(`🎨 Le thème colle aux goûts de ${a.name} : +8 qualité.`,"info");
  if(featArtist && Math.abs(chemistryBonus) >= 3){
    log(chemistryBonus>0
      ? `🤝 L'alchimie entre ${a.name} et ${featArtist.name} se ressent sur « ${p.title} » (+${Math.round(chemistryBonus)} qualité).`
      : `⚠️ La tension entre ${a.name} et ${featArtist.name} se ressent sur « ${p.title} » (${Math.round(chemistryBonus)} qualité).`,
      chemistryBonus>0?"pos":"neg");
  }

  let publicScore = quality*.45 + a.pop*.20 + theme.pub*.7 + cover.pub*.6 + promo.mult*18 + stunt.bonus*.6 + a.buzz*.2 + (a.humeur-50)*.1 + rand(-10,10);
  publicScore = clamp(publicScore,0,100);

  let streams = Math.round(
    pt.base *
    (quality/60) *
    market.reach *
    langMult *
    (1 + promo.mult) *
    (0.4 + a.pop/120) *
    rand(1-variance,1+variance) *
    (1 + stunt.bonus*.01)
  );

  const initialStreams = Math.round(streams * .5);
  const revenue = Math.round(initialStreams * .003);

  state.argent += revenue;
  state.totalStreams += initialStreams;

  const hit = publicScore >= 68;
  const flop = publicScore < 38;
  let decay = hit ? .96 : (flop ? .65 : .87);
  playSound(hit ? "sortieHit" : flop ? "sortieFlop" : "sortieOk");

  if(hit){
    a.hits++;
    state.careerHits = (state.careerHits||0) + 1;
    a.buzz = clamp(a.buzz + rint(5,15), -50, 50);
    a.pop = clamp(a.pop + rint(4,9), 0, 100);
    a.humeur = clamp(a.humeur + rint(3,8), 0, 100);
    // Gains de label volontairement modérés : les jauges ne doivent pas exploser en 2-3 sons.
    state.notoriete = clamp(state.notoriete + rint(4,8), 0, 100);
    // Un carton fait aussi monter la crédibilité, mais bien moins vite :
    // le milieu attend de voir si ça se confirme.
    state.credibilite = clamp(state.credibilite + rint(1,2), 0, 100);
  }else if(flop){
    a.flops++;
    a.buzz = clamp(a.buzz - rint(3,8), -50, 50);
    a.pop = clamp(a.pop - rint(2,5), 0, 100);
    a.humeur = clamp(a.humeur - rint(3,7), 0, 100);
    state.notoriete = clamp(state.notoriete - rint(1,3), 0, 100);
    log(`📉 « ${p.title} » fait un flop : -Notoriété (mauvaise réception publique), moral de ${a.name} en baisse.`,"neg");
  }else{
    a.pop = clamp(a.pop + rint(0,3), 0, 100);
    a.buzz = clamp(a.buzz + rint(1,4), -50, 50);
    state.notoriete = clamp(state.notoriete + rint(1,2), 0, 100);
  }

  if(quality < 45){
    state.credibilite = clamp(state.credibilite - rint(1,4), 0, 100);
    log(`📰 « ${p.title} » est jugé médiocre par la critique : -Crédibilité.`,"neg");
  }

  let polemique = false;
  if(theme.risk && chance(theme.risk/20)){
    // Une polémique, c'est le cas d'école des deux jauges : on parle de
    // vous (la notoriété monte), mais on vous respecte moins.
    state.notoriete = clamp(state.notoriete + rint(2,5), 0, 100);
    state.credibilite = clamp(state.credibilite - rint(2,5), 0, 100);
    log(`⚠️ Le thème ${theme.name} crée une petite polémique autour de ${a.name} : on en parle, mais pas en bien.`,"neg");
    polemique = true;
  }

  /* Une sortie "marquante" est celle dont on va reparler dans l'arc narratif :
     un vrai carton, une polémique, ou un flop assez humiliant pour laisser
     une trace. Les autres sorties vivent leur vie silencieusement — elles
     restent consultables dans le sous-onglet Sorties, mais ne viennent pas
     encombrer l'histoire. */
  const marquee = publicScore >= 78 || polemique || (flop && publicScore < 25);

  const reviews = buildReviews(quality, p.type, marquee);
  state.lastReleaseChapter = state.chapter;
  if(state.seasonStats) state.seasonStats.sorties++;

  const release = {
    id:Date.now()+Math.random(),
    title:p.title,
    artistId:a.id,
    artistName:a.name,
    featName:p.featName || null,
    type:p.type,
    quality,
    score:publicScore,
    streams:initialStreams,
    dailyStreams:Math.round(streams * .5 / 20),
    age:0,
    decay,
    date:chapterStr(),
    season:state.season,
    marcheName:market.name,
    langue,
    reviews,
    totalRevenue:revenue,
    lastHypeDate:-999,
    history:[],
    marquee,
    marqueeReason: publicScore >= 78 ? "hit" : (polemique ? "polemique" : "flop"),
    followUps:0,
    nextFollowUpChapter: marquee ? state.chapter + rint(3,6) : null,
    fini:false
  };
  state.releases.push(release);

  if(marquee){
    log(`⭐ « ${p.title} » ne va pas passer inaperçu. On va en reparler.`,"info");
  }

  state.stolenBeatBonus = 0;

  log(`💿 « ${p.title} » de ${a.name}${p.featName?` feat. ${p.featName}`:""} : ${fmtS(initialStreams)} streams, ${fmt(revenue)} encaissés.`, hit ? "pos" : flop ? "neg" : "info");
}

/* ============================================================
   CONSÉQUENCES DIFFÉRÉES — un choix peut revenir plus tard.
   On ne peut pas stocker de fonctions dans le state (sauvegarde JSON),
   donc on stocke une clé + un contexte sérialisable, résolus via ce registre.
============================================================ */

