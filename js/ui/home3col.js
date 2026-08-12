import { avgMoral, dailyCost, getTier, MAMIE_COOLDOWN, mamieAvailable, mamieChaptersLeft, streamDailyIncome, tierScore } from "../engine/economy.js";
import { mandatActif, mandatEpisodesRestants } from "../engine/mandate.js";
import { getObjectives } from "../engine/player.js";
import { artistNameById, getProductionStage, projectProgress } from "../engine/production.js";
import { seasonTitle } from "../engine/season.js";
import { renderCashChart, renderJournal } from "./dashboard.js";
import { renderEpisode, renderNoArtistPush } from "./events.js";
import { renderProjectPrediction } from "./label.js";
import { prevStats, state } from "../state.js";
import { clamp, esc, fmt, fmtS, statDelta } from "../utils.js";
import { DATA } from "../data.js";

/* ============================================================
   ÉCRAN D'ACCUEIL — trois colonnes, d'après la maquette.

   Gauche  : l'argent et les statistiques globales du label.
   Centre  : l'arc narratif. C'est là que le joueur évolue.
   Droite  : objectifs, alertes, et le bouton Retraite (discret).

   Cette coquille est l'accueil UNIQUEMENT : Label et Rivalité
   restent des écrans pleine largeur, atteints depuis la nav du haut.
============================================================ */

/* ---------- Colonne gauche : finances et stats globales ---------- */

function statLine(label, valeur, delta, cls){
  return `
  <div class="side-stat">
    <span class="l">${label}</span>
    <span class="v ${cls||""}">${valeur}${delta||""}</span>
  </div>`;
}

function renderColFinance(){
  const prev = prevStats || {};
  const moral = avgMoral();
  const inc = Math.round(streamDailyIncome());
  const cost = dailyCost();
  const net = inc - cost;
  const tier = getTier();
  const next = DATA.TIERS[tier.id+1];
  const score = tierScore();
  const pct = next ? clamp(Math.round(((score - tier.min)/Math.max(1, next.min - tier.min))*100),0,100) : 100;

  return `
  <aside class="col col-finance">
    <div class="panel">
      <div class="panel-label">Trésorerie</div>
      <div class="big-money ${state.argent<0?"bad":""}">${fmt(state.argent)}</div>
      <div class="small ${net>=0?"good":"bad"}">${net>=0?"+":""}${fmt(net)} par épisode</div>
      ${state.bank.dette > 0 ? `<div class="small warn" style="margin-top:4px">🏦 Dette : ${fmt(state.bank.dette)}</div>` : ``}
      ${renderCashChart()}
      <div class="row" style="margin-top:10px;gap:6px">
        <button class="small" data-action="setTab" data-args='${JSON.stringify(["finance"])}'>Voir le détail</button>
        <button class="small" data-action="openBank">🏦 Banque</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-label">Le label</div>
      <div class="spread" style="margin-bottom:8px">
        <span class="tier-badge">${tier.icon} ${tier.name}</span>
        ${next ? `<span class="tiny muted">${next.icon} ${next.name} →</span>` : `<span class="tiny good">Palier max</span>`}
      </div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      ${statLine("📣 Notoriété", Math.round(state.notoriete), statDelta(prev.notoriete, state.notoriete))}
      ${statLine("🎖️ Crédibilité", Math.round(state.credibilite), statDelta(prev.credibilite, state.credibilite))}
      ${statLine("😊 Moral équipe", moral === null ? "—" : moral, statDelta(prev.moral, moral),
                 moral === null ? "" : (moral < 35 ? "bad" : moral < 60 ? "warn" : "good"))}
    </div>

    <div class="panel">
      <div class="panel-label">Depuis le début</div>
      ${statLine("🎤 Artistes signés", state.careerArtistsSigned || 0)}
      ${statLine("💿 Sorties", state.releases.length)}
      ${statLine("🔥 Hits", state.careerHits || 0)}
      ${statLine("🎧 Streams cumulés", fmtS(state.totalStreams))}
      ${statLine("🎬 Épisodes vécus", state.chapter)}
    </div>
  </aside>`;
}

/* ---------- Colonne centrale : l'arc narratif ---------- */

function renderColStory(){
  // Le rappel générique « allez signer quelqu'un » et le mandat disent la
  // même chose avec le même bouton : quand le mandat est là, il l'emporte —
  // lui a une échéance et une sanction, l'autre n'est qu'une invitation.
  const noArtist = state.signed.length === 0;
  const projets = state.projects.slice(0,2);

  return `
  <main class="col col-story">
    <div class="story-head">
      <div class="story-season">${esc(seasonTitle())}</div>
      <div class="story-progress">
        <div class="bar thin"><i style="width:${Math.round(((state.episodeInSeason||0)/Math.max(1,state.seasonLength))*100)}%"></i></div>
        <span class="tiny muted">Épisode ${Math.max(1,(state.episodeInSeason||0)+1)} / ${state.seasonLength}</span>
      </div>
    </div>

    ${renderMandat()}
    ${noArtist && !mandatActif() ? renderNoArtistPush() : ``}
    ${renderEpisode()}

    ${projets.length ? `
      <div class="panel" style="margin-top:14px">
        <div class="panel-label">En production</div>
        ${projets.map(p=>`
          <div class="prod-strip">
            <div class="spread">
              <b>🎛️ ${esc(p.title)}</b>
              <span class="tiny muted">${p.reste} ép. restants</span>
            </div>
            <div class="tiny muted">${esc(artistNameById(p.artist))} · ${p.kind==="beat" ? "Production" : getProductionStage(p)}</div>
            <div class="bar xp" style="margin:6px 0"><i style="width:${projectProgress(p)}%"></i></div>
            ${p.kind!=="beat" ? renderProjectPrediction(p) : ``}
          </div>
        `).join("")}
        ${state.signed.length ? `<button class="small ghost" style="margin-top:8px" data-action="goProduce">🎛️ Lancer un autre projet</button>` : ``}
      </div>
    ` : (state.signed.length ? `
      <div class="panel" style="margin-top:14px;text-align:center">
        <div class="small muted" style="margin-bottom:8px">Aucun projet en cours. Vos artistes attendent.</div>
        <button class="primary" data-action="goProduce">🎛️ Lancer un projet</button>
      </div>
    ` : ``)}
  </main>`;
}

/* Le mandat en cours : l'histoire n'attend pas une réponse, elle attend
   un acte. Le bandeau reste en tête de la colonne narrative tant que ce
   n'est pas fait, avec le compte à rebours et le bouton qui emmène
   directement là où l'action se joue. Il devient rouge sur la fin — le
   joueur doit sentir l'échéance arriver, pas la découvrir. */
function renderMandat(){
  const def = mandatActif();
  if(!def) return "";
  const reste = mandatEpisodesRestants();
  const urgent = reste <= 2;
  const cta = def.cta || {};
  const args = JSON.stringify([cta.tab || "dash", cta.sub || null]);

  return `
  <div class="mandat ${urgent ? "urgent" : ""}">
    <div class="spread">
      <span class="mandat-tag">${def.icone} Mandat en cours</span>
      <span class="mandat-compte ${urgent ? "bad" : ""}">${reste} épisode${reste > 1 ? "s" : ""}</span>
    </div>
    <div class="mandat-titre">${esc(def.titre)}</div>
    <div class="mandat-texte">${esc(def.texte())}</div>
    <button class="primary mandat-cta" data-action="gotoObjective" data-args='${args}'>${esc(cta.label || "Y aller")}</button>
  </div>`;
}

/* ---------- Colonne droite : objectifs, alertes, retraite ---------- */

function renderAlertes(){
  const out = [];

  state.signed.filter(a=>a.contractRemaining <= 4).forEach(a=>{
    out.push(`<div class="alerte warn">📄 <b>${esc(a.name)}</b> arrive en fin de contrat (${a.contractRemaining} ép.)</div>`);
  });
  state.signed.filter(a=>a.buzz < -15).forEach(a=>{
    out.push(`<div class="alerte bad">🔻 <b>${esc(a.name)}</b> est en bad buzz (${a.buzz})</div>`);
  });
  state.signed.filter(a=>a.humeur < 25).forEach(a=>{
    out.push(`<div class="alerte bad">😞 <b>${esc(a.name)}</b> est au bout du rouleau (moral ${a.humeur})</div>`);
  });
  if(state.argent < 0){
    out.push(`<div class="alerte bad">💸 Trésorerie négative : les salaires ne suivent plus</div>`);
  }
  if((state.consecutiveCrisisSeasons||0) > 0){
    const reste = 3 - state.consecutiveCrisisSeasons;
    out.push(`<div class="alerte bad">🏦 ${state.consecutiveCrisisSeasons} saison(s) dans le rouge — ${reste} avant le dépôt de bilan</div>`);
  }
  if(state.player.stress >= 80){
    out.push(`<div class="alerte warn">😤 Vous êtes au bord du burnout</div>`);
  }

  if(!out.length) return `<div class="small muted">Rien d'urgent. Profitez-en.</div>`;
  return out.join("");
}

/* Mamie a maintenant la meilleure place de la colonne : c'est un vrai
   raccourci de jeu (un joker qu'on active), contrairement à la fiche du
   personnage qui ne se consulte presque jamais — celle-ci a déménagé dans
   le panneau ouvert en cliquant la carte profil de la barre du haut. */
function renderMamieCard(){
  const m = state.mamie;
  if(!m.active) return "";

  const dispo = mamieAvailable();
  const reste = mamieChaptersLeft();
  const pct = m.independant ? 100 : Math.round(((MAMIE_COOLDOWN - reste) / MAMIE_COOLDOWN) * 100);

  let sousTitre;
  if(m.independant) sousTitre = `<span class="good">A raccroché — vous volez de vos propres ailes</span>`;
  else if(dispo) sousTitre = `<span class="good">Prête à vous dépanner</span>`;
  else sousTitre = `<span class="muted">Revient dans ${reste} épisode${reste>1?"s":""}</span>`;

  return `
  <div class="panel mamie-card" data-action="toggleMamiePanel">
    <div class="mamie-card-head">
      <div class="mamie-card-icon ${dispo && !m.independant?"ready":""}">👵</div>
      <div style="min-width:0">
        <div class="mamie-card-name">Mamie Huguette</div>
        <div class="tiny">${sousTitre}</div>
      </div>
    </div>
    ${!m.independant ? `<div class="bar thin" style="margin-top:10px"><i style="width:${pct}%"></i></div>` : ``}
    ${dispo && !m.independant ? `<button class="primary small" style="width:100%;margin-top:10px" data-action="useMamieHelp">👵 Lui demander un coup de main</button>` : ``}
  </div>`;
}

function renderColTracking(){
  const objectives = getObjectives();
  const restants = objectives.filter(o=>!o.done);

  return `
  <aside class="col col-tracking">
    ${renderMamieCard()}

    ${restants.length ? `
      <div class="panel">
        <div class="panel-label">Objectifs</div>
        ${objectives.map(o=>`
          <div class="objective ${o.done?"done":""}" data-action="gotoObjective" data-args='${JSON.stringify([o.tab, o.sub||null])}'>
            <span class="check">${o.done?"✓":""}</span>
            <span>${o.label}</span>
          </div>
        `).join("")}
      </div>
    ` : ``}

    <div class="panel">
      <div class="panel-label">Alertes</div>
      ${renderAlertes()}
    </div>

    <div class="panel panel-journal">
      <div class="panel-label">Suivi</div>
      ${renderJournal()}
    </div>

    <button class="retire-link" data-action="setState" data-args='${JSON.stringify(["retireConfirmOpen", true])}' title="Vous seul décidez quand l'histoire s'arrête">
      🏆 Prendre sa retraite
    </button>
  </aside>`;
}

export function renderHome3Col(){
  return `
  <div class="home3">
    ${renderColFinance()}
    ${renderColStory()}
    ${renderColTracking()}
  </div>`;
}
