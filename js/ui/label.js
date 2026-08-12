import { artistStatus, confirmAudienceChange, giveBonus, giveRest, moodEmoji, openAudienceChange, releaseArtist, setAudienceGenre, toggleAudienceTheme, topFlops, topStreamed } from "../engine/artists.js";
import { marketDistrustActive, openMarketNego } from "../engine/contracts.js";
import { getTier, impact, rosterCap, rosterFull } from "../engine/economy.js";
import { getRelation, relLabel } from "../engine/events.js";
import { beatmakerCap, confirmScout, externalAcceptChance, externalFee, marketFilteredList, marketGenreList, marketGoPage, recruitBeatmaker, setMarketFilter, setMarketGenre, setMarketPopBracket, setMarketSalaireSort, setMarketTalentBracket } from "../engine/market.js";
import { artistNameById, calcPrediction, chooseDraftMode, draftAdvance, draftCost, draftGoStep, draftStepNames, ensureDraft, getProductionStage, langueName, launchBeatProject, launchProject, projectLock, projectPredictionRange, projectProgress, releaseChapterStreams, startDraft, themeName } from "../engine/production.js";
import { safeRender, setTab } from "../render.js";
import { state } from "../state.js";
import { draftOptionChips, HIDDEN_STAT_NOTE } from "./chips.js";
import { chance, clamp, esc, fmt, fmtS, genTitle, langMatches } from "../utils.js";
import { DATA } from "../data.js";

export function renderProjectPrediction(p){
  const pr = projectPredictionRange(p);
  return `<div class="small muted">Attendu : ${pr.pctMin}-${pr.pctMax}% — ${esc(pr.label)} <span class="tiny">(estimation affinée à ${pr.progress}% de production, pas une garantie)</span></div>`;
}

export function renderLabel(){
  const subs=[
    ["artistes","🎤 Mes artistes",state.signed.length],
    ["recruter","🔍 Recruter",state.scoutUsed?0:1],
    ["production","🎛️ Production",state.projects.length],
    ["sorties","💿 Sorties",state.releases.length]
  ];
  let body;
  if(state.labelSub === "recruter") body = renderRecruter();
  else if(state.labelSub === "production") body = renderProduction();
  else if(state.labelSub === "sorties") body = renderSorties();
  else body = renderArtists();
  return `
  <div class="subnav">
    ${subs.map(s=>`
      <button class="${state.labelSub===s[0]?"active":""}" style="position:relative" data-action="setTab" data-args='${JSON.stringify(['label', `${s[0]}`])}'>
        ${s[1]}${s[2]>0?` <span class="pill">${s[2]}</span>`:``}
      </button>
    `).join("")}
  </div>
  ${body}`;
}

export function renderArtists(){
  if(!state.signed.length){
    return `<div class="card"><h2>Mes artistes</h2><p class="muted">Aucun artiste signé.</p><button class="primary" style="margin-top:10px" data-action="setTab" data-args='${JSON.stringify(['label', 'recruter'])}'>🔍 Recruter un artiste</button></div>`;
  }
  return `
  <div class="grid g3">
    ${state.signed.map(a=>`
      <div class="artist-card" data-action="setState" data-args='${JSON.stringify(["artistSel", `${a.id}`])}'>
        <div class="spread">
          <div style="font-weight:700">${esc(a.name)}</div>
          <span class="tag ${a.contrat}">${a.contrat==="valeur"?"valeur sûre":a.contrat}</span>
        </div>
        <div class="small muted">${esc(a.genre)} · ${esc(a.perso)}</div>
        <div class="small" style="margin-top:6px">Talent ${a.talent} · Potentiel ${a.potential} · Notoriété ${a.pop}</div>
        <div class="small">${moodEmoji(a.humeur)} Humeur ${a.humeur} · Élan <span class="${a.buzz>10?"good":a.buzz>-10?"warn":"bad"}">${a.buzz>0?"+":""}${a.buzz}</span></div>
        <div class="bar moral"><i style="width:${a.humeur}%"></i></div>
        <div class="small muted" style="margin-top:5px">📅 Contrat : ${a.contractRemaining} ép. · Salaire ${fmt(a.salaire)}/ép. ${a.resting>0?` · 😴 Repos (${a.resting} ép.)`:``}</div>
        ${a.beatBonus>0?`<div class="small good">🎚️ +${a.beatBonus} qualité prête (beat exclusif)</div>`:``}
      </div>
    `).join("")}
  </div>`;
}

export function renderArtistModal(){
  const a = state.signed.find(x=>x.id===state.artistSel);
  if(!a) return "";
  const status = artistStatus(a);
  const top = topStreamed(a,5);
  const flops = topFlops(a,5);
  return `
  <div class="modal-bg" data-close="artistSel">
    <div class="modal">
      <div class="spread">
        <h2>${esc(a.name)}</h2>
        <div class="row" style="gap:6px">
          <span class="pill ${status.cls}">${status.icon} ${status.txt}</span>
          <button class="ghost" data-action="setState" data-args='${JSON.stringify(["artistSel", null])}'>✕</button>
        </div>
      </div>
      <div class="small muted">${esc(a.genre)} · ${esc(a.perso)}</div>
      <div class="small muted" style="margin-top:2px">🎨 Thèmes préférés : ${a.themesPreferes.map(t=>themeName(t)).join(", ")} <span class="tiny">(les respecter dans un projet augmente ses chances de réussite)</span></div>
      <div class="divider"></div>
      <div class="grid g3">
        <div class="stat"><div class="l">Talent</div><div class="v accent">${a.talent}</div></div>
        <div class="stat"><div class="l">Potentiel</div><div class="v">${a.potential}</div></div>
        <div class="stat"><div class="l">Notoriété de l'artiste</div><div class="v">${a.pop}</div></div>
        <div class="stat"><div class="l">Humeur</div><div class="v ${a.humeur<25?"bad":a.humeur<50?"warn":"good"}">${moodEmoji(a.humeur)} ${a.humeur}</div></div>
        <div class="stat"><div class="l">Élan</div><div class="v ${a.buzz>10?"good":a.buzz>-10?"warn":"bad"}">${a.buzz>0?"+":""}${a.buzz}</div></div>
        <div class="stat"><div class="l">Contrat</div><div class="v">${a.contractRemaining} ép.</div></div>
      </div>
      <div class="divider"></div>
      <div class="small muted">Hits ${a.hits} · Flops ${a.flops} · Projets ${a.projets} · Cette saison : ${a.projectsThisSeason||0}${a.resting>0?` · 😴 En repos (${a.resting} ép. restants)`:``}${a.audienceLockChapters>0?` · 🔄 Change de public (${a.audienceLockChapters} ép. restants)`:``}</div>
      ${a.humeur < 25 ? `<div class="small bad" style="margin-top:6px">⚠️ Moral au plus bas : ses prochains sons seront nettement moins bons tant qu'il/elle ne se sera pas reposé(e).</div>` : (a.projectsThisSeason>=2 ? `<div class="small warn" style="margin-top:6px">⚠️ Déjà ${a.projectsThisSeason} projets cette saison : chaque nouveau projet fait baisser son moral davantage.</div>` : ``)}
      ${(top.length || flops.length) ? `
      <div class="divider"></div>
      <div class="grid g2">
        <div>
          <h3>🏆 Top streams</h3>
          ${top.length ? top.map(r=>`<div class="small" style="margin:3px 0">${esc(r.title)} — <span class="good">${fmtS(r.streams)}</span></div>`).join("") : `<div class="small muted">Aucune sortie.</div>`}
        </div>
        <div>
          <h3>💀 Pires flops</h3>
          ${flops.length ? flops.map(r=>`<div class="small" style="margin:3px 0">${esc(r.title)} — <span class="bad">${fmtS(r.streams)}</span></div>`).join("") : `<div class="small muted">Aucune sortie.</div>`}
        </div>
      </div>` : ``}
      ${state.signed.length>1 ? `
      <div class="divider"></div>
      <h3>💬 Relations</h3>
      <div class="relations-list">
        ${state.signed.filter(x=>x.id!==a.id).map(other=>{
          const rel = getRelation(a,other);
          const lbl = relLabel(rel);
          return `<div class="spread small" style="margin:3px 0"><span>${esc(other.name)}</span><span class="${lbl.cls}">${lbl.label}</span></div>`;
        }).join("")}
      </div>
      ` : ``}
      <div class="row" style="margin-top:12px">
        <button class="primary" data-action="openArtistProjectFromModal" data-args='${JSON.stringify([a.id])}'>🎛️ Lancer un projet</button>
        <button data-action="giveBonus" data-args='${JSON.stringify([`${a.id}`])}'>💰 Verser une prime (-300€, +Moral)</button>
        <button data-action="giveRest" data-args='${JSON.stringify([`${a.id}`])}'>😴 Accorder un repos (+Moral, indispo 5j)</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button ${a.audienceLockChapters>0?"disabled":""} data-action="openAudienceChange" data-args='${JSON.stringify([`${a.id}`])}' title="${a.audienceLockChapters>0?"Déjà en cours de changement de public":"Change le genre et les thèmes préférés — indisponible quelque temps ensuite"}">🎭 Changer de public</button>
        <button class="danger" data-action="releaseArtist" data-args='${JSON.stringify([`${a.id}`])}'>🚪 Rompre le contrat</button>
      </div>
    </div>
  </div>`;
}

export function renderAudienceModal(){
  const m = state.audienceModal;
  if(!m) return "";
  const a = state.signed.find(x=>x.id===m.artistId);
  if(!a) return "";
  const genreChanged = m.genre !== a.genre;
  const overlap = a.themesPreferes.filter(t=>m.themes.includes(t)).length;
  const estLock = clamp(5 + (2-overlap)*4 + (genreChanged?14:0), 5, 35);
  return `
  <div class="modal-bg" data-close="audienceModal">
    <div class="modal">
      <div class="spread">
        <h2>🎭 Changer de public — ${esc(a.name)}</h2>
        <button class="ghost" data-action="setState" data-args='${JSON.stringify(["audienceModal", null])}'>✕</button>
      </div>
      <div class="small muted">Change le genre musical et les thèmes préférés de l'artiste. Plus le changement est radical, plus il/elle sera indisponible longtemps pour un nouveau projet.</div>
      <div class="divider"></div>
      <h3>Nouveau genre</h3>
      <div class="optgrid">
        ${DATA.ARTIST_GENRES.map(g=>`
          <button class="opt ${m.genre===g?"selected":""}" data-action="setAudienceGenre" data-args='${JSON.stringify([`${esc(g)}`])}'><div class="n">${esc(g)}</div></button>
        `).join("")}
      </div>
      <h3 style="margin-top:14px">Nouveaux thèmes préférés (2 max)</h3>
      <div class="optgrid">
        ${DATA.THEMES.map(t=>`
          <button class="opt ${m.themes.includes(t.id)?"selected":""}" data-action="toggleAudienceTheme" data-args='${JSON.stringify([`${t.id}`])}'><div class="n">${t.name}</div></button>
        `).join("")}
      </div>
      <div class="divider"></div>
      <div class="small muted">Indisponibilité estimée : <b class="warn">~${estLock} ép.</b></div>
      <div class="row" style="margin-top:12px">
        <button class="ghost" data-action="setState" data-args='${JSON.stringify(["audienceModal", null])}'>Annuler</button>
        <button class="primary" ${m.themes.length?"":"disabled"} data-action="confirmAudienceChange">Confirmer le changement</button>
      </div>
    </div>
  </div>`;
}

export function renderRecruter(){
  const cap = rosterCap();
  const full = rosterFull();
  return `
  <div class="card small" style="margin-bottom:10px;border-color:${full?"var(--bad)":"var(--border)"}">
    🎤 Effectif du label : <b class="${full?"bad":"accent"}">${state.signed.length} / ${cap}</b> artistes
    ${full ? ` — <span class="bad">limite atteinte pour votre palier (${getTier().name}). Progressez pour agrandir votre roster.</span>` : ` (limite liée à votre palier : ${getTier().name})`}
  </div>
  ${marketDistrustActive() ? `<div class="card small bad" style="margin-bottom:10px">⚠️ Le milieu se méfie de vous (${state.marketDistrustUntil - state.chapter} ép. restants) : négociations et feats externes plus difficiles.</div>` : ``}
  <div class="grid g2">
    <div class="card">
      <div class="spread">
        <h2 style="margin:0">🔭 Repérage</h2>
        <span class="pill">${state.scoutUsed ? "Fait — nouveau lot la saison prochaine" : "Gratuit, 1x/saison"}</span>
      </div>
      <div class="small muted" style="margin-top:6px">🎲 Talents bruts : gratuits, potentiel parfois très élevé, mais humeur imprévisible et talent révélé seulement après signature. Un seul choix par saison, pas de négociation.</div>
      <div class="divider"></div>
      ${renderScout()}
    </div>
    <div class="card">
      <h2>💼 Marché des artistes établis</h2>
      <div class="small muted" style="margin-top:2px">Plus chers et plus fiables (salaire stable, humeur moins volatile) que les talents bruts, mais avec moins de marge de progression.</div>
      <div class="divider"></div>
      ${renderMarket()}
    </div>
  </div>
  <div class="card" style="margin-top:12px">
    <div class="spread">
      <h2 style="margin:0">🎚️ Beatmakers</h2>
      <span class="pill">${state.beatmakers.length} / ${beatmakerCap()}</span>
    </div>
    <div class="small muted" style="margin-top:2px">Un beatmaker ne sort pas de musique en son nom : il produit des instrus (packs à vendre, exclusivités pour vos artistes, placements sync). Son statut change complètement l'écran « Nouveau projet ».</div>
    <div class="divider"></div>
    ${renderBeatmakerPool()}
  </div>`;
}

export function renderBeatmakerPool(){
  const full = state.beatmakers.length >= beatmakerCap();
  if(!state.beatmakerPool.length) return `<div class="small muted">Aucun beatmaker disponible cette saison.</div>`;
  return `
  ${full ? `<div class="small bad" style="margin-bottom:8px">Effectif de beatmakers complet pour votre palier.</div>` : ``}
  <div class="grid g3">
    ${state.beatmakerPool.map(b=>`
      <div class="artist-card" data-action="setState" data-args='${JSON.stringify(["beatmakerSel", `${b.id}`])}'>
        <div style="font-weight:700">${esc(b.name)}</div>
        <div class="small muted">${esc(b.genre)}</div>
        <div class="small" style="margin-top:5px">Skill <span class="accent">${b.skill}</span></div>
        <div class="small accent">${fmt(b.prix)} · ${fmt(b.salaire)}/ép.</div>
      </div>
    `).join("")}
  </div>`;
}

export function renderBeatmakerModal(){
  const b = state.beatmakerPool.find(x=>x.id===state.beatmakerSel);
  if(!b) return "";
  const full = state.beatmakers.length >= beatmakerCap() && !state.adminMode;
  return `
  <div class="modal-bg" data-close="beatmakerSel">
    <div class="modal">
      <div class="spread">
        <h2>${esc(b.name)}</h2>
        <button class="ghost" data-action="setState" data-args='${JSON.stringify(["beatmakerSel", null])}'>✕</button>
      </div>
      <div class="small muted">${esc(b.genre)}</div>
      <div class="divider"></div>
      <div class="grid g3">
        <div class="stat"><div class="l">Skill</div><div class="v accent">${b.skill}</div></div>
        <div class="stat"><div class="l">Prix</div><div class="v">${fmt(b.prix)}</div></div>
        <div class="stat"><div class="l">Salaire</div><div class="v">${fmt(b.salaire)}/ép.</div></div>
      </div>
      <div class="divider"></div>
      ${full ? `<div class="small bad">Effectif de beatmakers complet pour votre palier.</div>` : ``}
      <button class="primary" style="width:100%" ${(state.argent<b.prix || full)?"disabled":""} data-action="recruitBeatmaker" data-args='${JSON.stringify([`${b.id}`])}'>✍️ Recruter pour ${fmt(b.prix)}</button>
    </div>
  </div>`;
}

export function renderScout(){
  if(!state.scoutUsed){
    return `
    <div class="grid g2">
      ${state.scout.map(a=>`
        <div class="artist-card">
          <div style="font-weight:700">${esc(a.name)}</div>
          <div class="small muted">${esc(a.genre)}</div>
          <div class="small" style="margin-top:5px">Talent <span class="warn">${a.talentMin}-${a.talentMax}</span> (caché) · Pop 0</div>
          <button class="primary small" style="margin-top:8px" data-action="setState" data-args='${JSON.stringify(["scoutModal", `${a.id}`])}'>✍️ Recruter</button>
        </div>
      `).join("")}
    </div>`;
  }
  return `
  ${state.scoutMsg ? `<div class="card" style="margin-bottom:12px;border-color:var(--accent)"><b>${state.scoutMsg}</b></div>` : ``}
  <div class="grid g2">
    ${state.scout.map(a=>{
      const chosen = a.id === state.scoutPickedId;
      return `
      <div class="artist-card" style="${chosen?"border-color:var(--good)":""}">
        <div class="spread">
          <div style="font-weight:700">${esc(a.name)}</div>
          <span class="pill">${chosen ? "✅ Signé" : "Non recruté"}</span>
        </div>
        <div class="small muted">${esc(a.genre)}</div>
        <div class="small" style="margin-top:5px">Talent <span class="accent">${a.talent}</span> · Pop ${a.pop}</div>
      </div>`;
    }).join("")}
  </div>`;
}

export function renderScoutModal(){
  const a = state.scout.find(x=>x.id===state.scoutModal);
  if(!a) return "";
  return `
  <div class="modal-bg" data-close="scoutModal">
    <div class="modal">
      <div class="spread">
        <h2>Choisir le nom de scène</h2>
        <button class="ghost" data-action="setState" data-args='${JSON.stringify(["scoutModal", null])}'>✕</button>
      </div>
      <div class="small muted" style="margin:8px 0">Nom proposé : <b>${esc(a.name)}</b></div>
      <div class="small muted">Talent caché, estimé entre <b class="warn">${a.talentMin}</b> et <b class="warn">${a.talentMax}</b>.</div>
      <input type="text" id="scoutNameInput" value="${esc(a.name)}" style="margin-top:8px">
      <div class="row" style="margin-top:12px">
        <button class="primary" data-action="confirmScout" data-args='${JSON.stringify([`${a.id}`])}'>Confirmer le recrutement</button>
        <button class="ghost" data-action="setState" data-args='${JSON.stringify(["scoutModal", null])}'>Annuler</button>
      </div>
    </div>
  </div>`;
}

export function renderPager(page, totalPages, fn){
  if(totalPages <= 1) return "";
  const keep = new Set([0,1,totalPages-2,totalPages-1,page-1,page,page+1].filter(p=>p>=0 && p<totalPages));
  const sorted = Array.from(keep).sort((a,b)=>a-b);
  let out = `<div class="pager">`;
  out += `<button class="small" ${page<=0?"disabled":""} data-action="${fn}" data-args='${JSON.stringify([page-1])}'>‹</button>`;
  let prev = -1;
  sorted.forEach(p=>{
    if(prev >= 0 && p - prev > 1) out += `<span class="pager-dots">…</span>`;
    out += `<button class="small ${p===page?"active":""}" data-action="${fn}" data-args='${JSON.stringify([p])}'>${p+1}</button>`;
    prev = p;
  });
  out += `<button class="small" ${page>=totalPages-1?"disabled":""} data-action="${fn}" data-args='${JSON.stringify([page+1])}'>›</button>`;
  out += `</div>`;
  return out;
}

/* Le fragment "résultats" (compteur + grille + pager) est isolé dans sa
   propre fonction et son propre conteneur (#marketResultsBox) pour pouvoir
   être rafraîchi seul à chaque frappe dans la recherche, sans reconstruire
   le champ de recherche ni les filtres — voir patchMarketResults() plus bas
   et setMarketSearchLive() dans dispatch.js. */
export function renderMarketResultsFragment(){
  const all = marketFilteredList();
  const totalPages = Math.max(1, Math.ceil(all.length / DATA.MARKET_PAGE_SIZE));
  const page = clamp(state.marketPage, 0, totalPages-1);
  const pageItems = all.slice(page*DATA.MARKET_PAGE_SIZE, page*DATA.MARKET_PAGE_SIZE + DATA.MARKET_PAGE_SIZE);

  return `
  <div class="small muted" style="margin-bottom:6px">${all.length} artiste${all.length>1?"s":""} correspondant${all.length>1?"s":""}</div>
  ${pageItems.length === 0 ? `<div class="small muted">Aucun artiste ne correspond à cette recherche.</div>` : `
    <div class="grid g2">
      ${pageItems.map(a=>`
        <div class="artist-card" data-action="setState" data-args='${JSON.stringify(["marketSel", `${a.id}`])}'>
          <div class="spread">
            <div style="font-weight:700">${esc(a.name)}</div>
            <span class="tag ${a.contrat}">${a.contrat==="valeur"?"valeur sûre":a.contrat}</span>
          </div>
          <div class="small muted">${esc(a.genre)}</div>
          <div class="small" style="margin-top:5px">Talent ${a.talent} · Notoriété ${a.pop} · Élan ${a.buzz}</div>
          <div class="small accent" style="margin-top:5px">${fmt(a.prix)} · ${fmt(a.salaire)}/ép.</div>
        </div>
      `).join("")}
    </div>
  `}
  ${renderPager(page, totalPages, "marketGoPage")}`;
}

/* Rafraîchit uniquement #marketResultsBox. Renvoie false si le conteneur
   n'est pas dans le DOM (onglet fermé entre-temps) : l'appelant retombe
   alors sur un rendu complet classique. */
export function patchMarketResults(){
  const box = document.getElementById("marketResultsBox");
  if(!box) return false;
  box.innerHTML = renderMarketResultsFragment();
  return true;
}

export function renderMarket(){
  const filters=["tous","espoir","valeur","star"];

  return `
  <input type="text" id="marketSearchInput" placeholder="🔎 Rechercher par pseudo…" value="${esc(state.marketSearch||"")}" data-oninput="setMarketSearchLive" style="margin-bottom:8px">
  <div class="filter-pills">
    ${filters.map(f=>`
      <button class="${state.marketFilter===f?"active":""}" data-action="setMarketFilter" data-args='${JSON.stringify([`${f}`])}'>
        ${f==="tous"?"Tous":f==="espoir"?"Espoir":f==="valeur"?"Valeur sûre":"Star"}
      </button>
    `).join("")}
  </div>
  <div class="grid g4" style="margin-bottom:8px">
    <select data-onchange="setMarketGenre">
      <option value="tous" ${state.marketGenre==="tous"?"selected":""}>Tous genres</option>
      ${marketGenreList().map(g=>`<option value="${esc(g)}" ${state.marketGenre===g?"selected":""}>${esc(g)}</option>`).join("")}
    </select>
    <select data-onchange="setMarketPopBracket">
      ${Object.keys(DATA.POP_BRACKET_LABEL).map(k=>`<option value="${k}" ${state.marketPopBracket===k?"selected":""}>${DATA.POP_BRACKET_LABEL[k]}</option>`).join("")}
    </select>
    <select data-onchange="setMarketTalentBracket">
      ${Object.keys(DATA.TALENT_BRACKET_LABEL).map(k=>`<option value="${k}" ${state.marketTalentBracket===k?"selected":""}>${DATA.TALENT_BRACKET_LABEL[k]}</option>`).join("")}
    </select>
    <select data-onchange="setMarketSalaireSort">
      <option value="none" ${state.marketSalaireSort==="none"?"selected":""}>Salaire : pas de tri</option>
      <option value="asc" ${state.marketSalaireSort==="asc"?"selected":""}>Salaire croissant</option>
      <option value="desc" ${state.marketSalaireSort==="desc"?"selected":""}>Salaire décroissant</option>
    </select>
  </div>
  <div id="marketResultsBox">${renderMarketResultsFragment()}</div>`;
}

export function renderMarketModal(){
  const a = state.market.find(x=>x.id===state.marketSel);
  if(!a) return "";
  return `
  <div class="modal-bg" data-close="marketSel">
    <div class="modal">
      <div class="spread">
        <h2>${esc(a.name)}</h2>
        <button class="ghost" data-action="setState" data-args='${JSON.stringify(["marketSel", null])}'>✕</button>
      </div>
      <div class="small muted">${esc(a.genre)} · ${esc(a.perso)}</div>
      <div class="divider"></div>
      <div class="grid g3">
        <div class="stat"><div class="l">Talent</div><div class="v accent">${a.talent}</div></div>
        <div class="stat"><div class="l">Notoriété</div><div class="v">${a.pop}</div></div>
        <div class="stat"><div class="l">Élan actuel</div><div class="v">${a.buzz}</div></div>
        <div class="stat"><div class="l">Prix</div><div class="v">${fmt(a.prix)}</div></div>
      </div>
      <div class="divider"></div>
      <div class="row">
        <button class="primary" data-action="openMarketNego" data-args='${JSON.stringify([`${a.id}`])}'>💬 Négocier le contrat</button>
      </div>
      <div class="small muted" style="margin-top:8px">Signer un artiste établi passe toujours par une négociation : il/elle propose durée, salaire et coût de signature.</div>
    </div>
  </div>`;
}

/* ---- Production ---- */

export function renderProduction(){
  const enC = state.projects.length ? `
    <div class="grid g2">
      ${state.projects.map(p=>`
        <div class="artist-card">
          <div style="font-weight:700">${esc(p.title)}</div>
          <div class="small muted">${p.kind==="beat" ? `🎚️ ${esc(beatmakerNameById(p.beatmaker))}` : `${esc(artistNameById(p.artist))}${p.featName?` feat. ${esc(p.featName)}`:``}`}</div>
          <div class="bar xp" style="margin:6px 0"><i style="width:${projectProgress(p)}%"></i></div>
          <div class="small muted">Étape : ${p.kind==="beat" ? "Production" : getProductionStage(p)} · ${p.reste} ép. restants</div>
          ${p.kind!=="beat" ? renderProjectPrediction(p) : ``}
        </div>
      `).join("")}
    </div>
  ` : `<div class="small muted">Aucun projet en cours.</div>`;

  const canStart = state.signed.length>0 || state.beatmakers.length>0;
  const wiz = state.draft ? renderDraft() : `
    <button class="primary" data-action="startDraft" ${canStart?"":"disabled"}>➕ Nouveau projet</button>
    ${canStart?"":`<div class="small muted" style="margin-top:6px">Vous devez d'abord signer un artiste ou un beatmaker.</div>`}
  `;

  if(state.draft){
    return `
    <div class="card">${wiz}</div>
    <div class="card" style="margin-top:12px"><h2>En production</h2>${enC}</div>
    <div class="card" style="margin-top:12px">
      <h2>💿 Sorties</h2>
      ${renderReleases()}
    </div>`;
  }

  return `
  <div class="grid g2">
    <div class="card"><h2>Nouveau projet</h2>${wiz}</div>
    <div class="card"><h2>En production</h2>${enC}</div>
  </div>
  <div class="card" style="margin-top:12px">
    <h2>💿 Sorties</h2>
    ${renderReleases()}
  </div>`;
}

export function beatmakerNameById(id){
  const b = state.beatmakers.find(x=>x.id===id);
  return b ? b.name : "?";
}

export function renderDraft(){
  const d = state.draft;
  ensureDraft();

  if(!d.mode){
    const canArtist = state.signed.length > 0;
    const canBeat = state.beatmakers.length > 0;
    return `
    <h3>Qui produit ?</h3>
    <button class="opt opt-featured ${canArtist?"":"locked"}" ${canArtist?`data-action="chooseDraftMode" data-args='${JSON.stringify(['artist'])}'`:"disabled"} style="display:block;width:100%;margin-bottom:12px;position:relative;padding:18px">
      <span class="badge-reco">Le plus complet</span>
      <div class="n" style="font-size:1.08rem">🎤 Un artiste (chanson)</div>
      <div class="d" style="font-size:.82rem;margin-top:4px">Format, thème, langue, marché, production, promo… le pipeline complet de sortie, étape par étape.</div>
      ${canArtist?"":`<div class="d bad">Aucun artiste signé.</div>`}
    </button>
    <button class="opt ${canBeat?"":"locked"}" ${canBeat?`data-action="chooseDraftMode" data-args='${JSON.stringify(['beatmaker'])}'`:"disabled"} style="display:block;max-width:340px;opacity:${canBeat?".85":".4"}">
      <div class="n">🎚️ Un beatmaker (instru)</div>
      <div class="d">Pack de beats, exclusivité pour un artiste, ou placement sync.</div>
      ${canBeat?"":`<div class="d bad">Aucun beatmaker recruté.</div>`}
    </button>
    <button class="ghost" style="margin-top:12px" data-action="setState" data-args='${JSON.stringify(["draft", null])}'>Annuler</button>`;
  }

  const steps = draftStepNames(d);
  const crumbs = `
  <div class="subnav">
    ${steps.map((s,i)=>`
      <button class="${i===d.step?"active":""}" ${i<=(d.maxStep||0)?`data-action="draftGoStep" data-args='${JSON.stringify([i])}'`:"disabled"}>
        ${i<d.step?"✓ ":""}${s}
      </button>
    `).join("")}
  </div>`;

  const body = d.mode === "beatmaker" ? renderBeatDraftStep(d, steps) : renderArtistDraftStep(d, steps);
  return crumbs + body;
}

export function draftNav(canNext, isLast, nextLabel){
  return `
  <div class="row" style="margin-top:14px">
    <button class="ghost" data-action="setState" data-args='${JSON.stringify(["draft", null])}'>Annuler</button>
    ${state.draft.step>0 ? `<button data-action="draftGoStep" data-args='${JSON.stringify([state.draft.step-1])}'>◀ Précédent</button>` : ``}
    ${!isLast ? `<button class="primary" ${canNext?"":"disabled"} data-action="draftAdvance">${nextLabel||"Suivant ▶"}</button>` : ``}
  </div>`;
}

export function renderArtistDraftStep(d, steps){
  const step = d.step;

  if(step === 0){
    const types = Object.entries(DATA.PTYPES).map(([k,v])=>{
      const lock = projectLock(k);
      return `
      <button class="opt ${d.type===k?"selected":""} ${lock?"locked":""}" ${lock?"disabled":""} data-action="setState" data-args='${JSON.stringify(["draft.type", `${k}`])}'>
        <div class="n">${v.name}</div>
        <div class="d">${v.desc} · ${fmt(v.cost)} · ${v.chapitres} ép.${lock?` — ${lock}`:""}</div>
      </button>`;
    }).join("");
    const valid = !!(d.type && !projectLock(d.type));
    return `
    <h3>1 · Format du projet</h3><div class="optgrid">${types}</div>
    ${draftNav(valid,false)}`;
  }

  if(step === 1){
    const arts = state.signed.map(a=>{
      const unavailable = a.resting>0 || a.audienceLockChapters>0;
      return `
      <button class="opt ${d.artist===a.id?"selected":""} ${unavailable?"locked":""}" ${unavailable?"disabled":""} data-action="setState" data-args='${JSON.stringify(["draft.artist", `${a.id}`])}'>
        <div class="n">${esc(a.name)}${a.resting>0?" 😴":""}${a.audienceLockChapters>0?" 🔄":""}</div>
        <div class="d">Tal ${a.talent} · Notoriété ${a.pop} · Élan ${a.buzz}${a.resting>0?` · en repos (${a.resting} ép.)`:``}${a.audienceLockChapters>0?` · change de public (${a.audienceLockChapters} ép.)`:``}${a.projectsThisSeason>=2?` · ⚠️ ${a.projectsThisSeason} projets cette saison`:``}</div>
      </button>`;
    }).join("");
    let featHtml = `
    <button class="opt ${d.feat===null?"selected":""}" data-action="setState" data-args='${JSON.stringify(["draft.feat", null])}'>
      <div class="n">Aucun feat</div>
    </button>`;
    state.signed.filter(a=>a.id!==d.artist).forEach(a=>{
      featHtml += `
      <button class="opt ${d.feat===("int:"+a.id)?"selected":""}" data-action="setState" data-args='${JSON.stringify(["draft.feat", `int:${a.id}`])}'>
        <div class="n">${esc(a.name)}</div>
        <div class="d">Artiste du label</div>
      </button>`;
    });
    const extList = state.market.filter(a=>a.name.toLowerCase().includes((d.featSearch||"").toLowerCase())).slice(0,5);
    extList.forEach(a=>{
      const p = Math.round(externalAcceptChance(a)*100);
      const fee = externalFee(a);
      featHtml += `
      <button class="opt ${d.feat===("ext:"+a.id)?"selected":""}" data-action="setState" data-args='${JSON.stringify(["draft.feat", `ext:${a.id}`])}'>
        <div class="n">${esc(a.name)} (externe)</div>
        <div class="d">Chance : ${p}% · Coût estimé : ${fmt(fee)}</div>
      </button>`;
    });
    const valid = !!d.artist;
    return `
    <h3>2 · Artiste</h3><div class="optgrid">${arts}</div>
    <h3 style="margin-top:14px">Feat (optionnel)</h3>
    <input type="text" placeholder="Rechercher un artiste externe puis cliquer" value="${esc(d.featSearch||"")}" data-onchange="setState" data-args='${JSON.stringify(["draft.featSearch"])}'>
    <div class="optgrid" style="margin-top:8px">${featHtml}</div>
    ${draftNav(valid,false)}`;
  }

  if(step === 2){
    const artist = state.signed.find(x=>x.id===d.artist);
    const themes = d.themes.map(t=>{
      const preferred = artist && artist.themesPreferes && artist.themesPreferes.includes(t.id);
      return `
      <button class="opt ${d.theme===t.id?"selected":""}" data-action="setState" data-args='${JSON.stringify(["draft.theme", `${t.id}`])}'>
        <div class="n">${t.name}${preferred?` <span class="pill good">préféré de l'artiste</span>`:``}</div>
        <div class="d">${t.desc}</div>
        ${HIDDEN_STAT_NOTE}
      </button>`;
    }).join("");
    const valid = !!d.theme;
    return `
    <h3>3 · Thème</h3>
    ${artist ? `<div class="small muted" style="margin-bottom:8px">🎨 ${esc(artist.name)} donne le meilleur de lui/elle-même sur ses thèmes préférés (surlignés ci-dessous).</div>` : ``}
    <div class="optgrid">${themes}</div>
    ${draftNav(valid,false)}`;
  }

  if(step === 3){
    const langs = DATA.LANGUES.map(l=>`
      <button class="opt ${d.langue===l.id?"selected":""}" data-action="setState" data-args='${JSON.stringify(["draft.langue", `${l.id}`])}'>
        <div class="n">${l.name}</div>
        <div class="d">${l.desc}</div>
      </button>
    `).join("");
    const marches = DATA.MARCHES.map(m=>`
      <button class="opt ${d.marche===m.id?"selected":""}" data-action="setState" data-args='${JSON.stringify(["draft.marche", `${m.id}`])}'>
        <div class="n">${m.name}</div>
        <div class="d">${m.desc}</div>
        <div class="impacts">${draftOptionChips(m)}</div>
      </button>
    `).join("");
    const valid = !!(d.langue && d.marche);
    return `
    <h3>4 · Langue</h3><div class="optgrid">${langs}</div>
    <h3 style="margin-top:14px">Marché visé</h3><div class="optgrid">${marches}</div>
    ${d.langue && d.marche && !langMatches(d.langue,d.marche) ? `<div class="small warn" style="margin-top:6px">⚠️ Langue/marché risqué mais impact fort si ça marche.</div>` : ``}
    ${draftNav(valid,false)}`;
  }

  if(step === 4){
    const prods = DATA.PRODS.map(p=>{
      const lock = p.reseau && state.credibilite < p.reseau;
      return `
      <button class="opt ${d.prod===p.id?"selected":""} ${lock?"locked":""}" ${lock?"disabled":""} data-action="setState" data-args='${JSON.stringify(["draft.prod", `${p.id}`])}'>
        <div class="n">${p.name}</div>
        <div class="d">${p.desc}${lock?` · Crédibilité ${p.reseau} requise`:""}</div>
        <div class="impacts">${draftOptionChips(p)}</div>
      </button>`;
    }).join("");
    const covers = [`<button class="opt ${d.cover==="Cover maison"?"selected":""}" data-action="setState" data-args='${JSON.stringify(["draft.cover", 'Cover maison'])}'><div class="n">🆓 Cover maison</div><div class="d">Gratuit</div></button>`]
      .concat(d.covers.map(c=>`
        <button class="opt ${d.cover===c.name?"selected":""}" data-action="setState" data-args='${JSON.stringify(["draft.cover", `${c.name}`])}'>
          <div class="n">🎨 ${c.name}</div>
          <div class="d">${c.cost?fmt(c.cost):"Gratuit"}</div>
          ${HIDDEN_STAT_NOTE}
        </button>
      `)).join("");
    return `
    <h3>5 · Choix de la production</h3><div class="optgrid">${prods}</div>
    <h3 style="margin-top:14px">Artiste pour la cover</h3><div class="optgrid">${covers}</div>
    ${draftNav(true,false)}`;
  }

  if(step === 5){
    const promos = DATA.PROMO_OPTIONS.map(p=>`
      <button class="opt ${d.promo===p.id?"selected":""}" data-action="setState" data-args='${JSON.stringify(["draft.promo", `${p.id}`])}'>
        <div class="n">${p.name}</div>
        <div class="d">${p.desc}${p.cost?` · ${fmt(p.cost)}`:""}</div>
        ${HIDDEN_STAT_NOTE}
      </button>
    `).join("");
    const stunts = DATA.MARKETING_OPTIONS.map(s=>`
      <button class="opt ${d.stunt===s.id?"selected":""}" data-action="setState" data-args='${JSON.stringify(["draft.stunt", `${s.id}`])}'>
        <div class="n">${s.name}</div>
        <div class="d">${s.desc}${s.cost?` · ${fmt(s.cost)}`:""}</div>
        ${HIDDEN_STAT_NOTE}
      </button>
    `).join("");
    return `
    <h3>6 · Promotions choisies</h3><div class="optgrid">${promos}</div>
    <h3 style="margin-top:14px">Coup marketing</h3><div class="optgrid">${stunts}</div>
    ${draftNav(true,false)}`;
  }

  if(step === 6){
    const valid = !!(d.title && d.title.trim());
    return `
    <h3>7 · Titre</h3>
    <div class="row">
      <input type="text" value="${esc(d.title||"")}" data-oninput-set="draft.title">
      <button data-action="regenerateDraftTitle">🎲 Générer</button>
    </div>
    ${draftNav(valid,false,"Voir le récap ▶")}`;
  }

  // step 7 : récap
  const pred = calcPrediction();
  const baseCost = draftCost();
  let externalExtra = 0;
  if(d.feat && d.feat.startsWith("ext:")){
    const ext = state.market.find(x=>x.id === d.feat.replace("ext:",""));
    if(ext) externalExtra = externalFee(ext);
  }
  const total = baseCost + externalExtra;
  const artist = state.signed.find(x=>x.id===d.artist);
  const ready = d.type && d.artist && d.langue && d.theme && !projectLock(d.type);

  return `
  <h3>Récapitulatif</h3>
  <div class="card" style="background:var(--panel2)">
    <div class="small"><b>${esc(d.title)}</b> — ${artist?esc(artist.name):"?"}${d.feat?` (+ feat)`:``}</div>
    <div class="small muted" style="margin-top:4px">${DATA.PTYPES[d.type]?DATA.PTYPES[d.type].name:"?"} · ${themeName(d.theme)} · ${langueName(d.langue)} · ${DATA.MARCHES.find(m=>m.id===d.marche)?.name||"France"}</div>
  </div>
  <div class="card" style="margin-top:10px;background:var(--panel2)">
    <div class="spread">
      <span class="small muted">Estimation de succès (pas une garantie)</span>
      <span class="small ${pred.cls}" style="font-weight:800">${pred.pctMin}-${pred.pctMax}% — ${pred.label}</span>
    </div>
    <div class="bar"><i style="width:${pred.pct}%"></i></div>
    <div class="small muted" style="margin-top:6px">⚠️ Basée sur vos choix actuels, mais le talent, la chance et le public restent imprévisibles : un projet "Correct" peut flopper, un "Incertain" peut cartonner.</div>
  </div>
  <div class="divider"></div>
  <div class="spread">
    <div>
      <span class="small muted">Coût total : </span><b class="accent">${fmt(total)}</b>
      ${state.argent < total ? `<span class="small bad"> — fonds insuffisants</span>` : ``}
    </div>
    <div class="row">
      <button class="ghost" data-action="setState" data-args='${JSON.stringify(["draft", null])}'>Annuler</button>
      <button data-action="draftGoStep" data-args='${JSON.stringify([0])}'>◀ Modifier</button>
      <button class="primary" ${ready && state.argent >= total ? "" : "disabled"} data-action="launchProject">🚀 Lancer</button>
    </div>
  </div>`;
}

/* ---- Flux BEATMAKER ---- */

export function renderBeatDraftStep(d, steps){
  const step = d.step;
  const needsArtistStep = d.beatType && DATA.BEAT_PTYPES[d.beatType] && DATA.BEAT_PTYPES[d.beatType].needsArtist;

  if(step === 0){
    const bms = state.beatmakers.map(b=>`
      <button class="opt ${d.beatmaker===b.id?"selected":""} ${b.resting>0?"locked":""}" ${b.resting>0?"disabled":""} data-action="setState" data-args='${JSON.stringify(["draft.beatmaker", `${b.id}`])}'>
        <div class="n">${esc(b.name)}${b.resting>0?" 😴":""}</div>
        <div class="d">Skill ${b.skill} · ${esc(b.genre)}</div>
      </button>
    `).join("");
    const types = Object.entries(DATA.BEAT_PTYPES).map(([k,v])=>{
      const lock = v.rep && state.credibilite < v.rep ? `Crédibilité ≥ ${v.rep}` : null;
      return `
      <button class="opt ${d.beatType===k?"selected":""} ${lock?"locked":""}" ${lock?"disabled":""} data-action="setState" data-args='${JSON.stringify(["draft.beatType", `${k}`])}'>
        <div class="n">${v.name}</div>
        <div class="d">${v.desc}${v.cost?` · ${fmt(v.cost)}`:""} · ${v.chapitres} ép.${lock?` — ${lock}`:""}</div>
      </button>`;
    }).join("");
    const valid = !!(d.beatmaker && d.beatType && !(DATA.BEAT_PTYPES[d.beatType].rep && state.credibilite < DATA.BEAT_PTYPES[d.beatType].rep));
    return `
    <h3>1 · Beatmaker</h3><div class="optgrid">${bms || `<div class="small muted">Aucun beatmaker disponible.</div>`}</div>
    <h3 style="margin-top:14px">2 · Format</h3><div class="optgrid">${types}</div>
    ${draftNav(valid,false)}`;
  }

  if(step === 1){
    const valid = !!(d.title && d.title.trim());
    return `
    <h3>Titre</h3>
    <div class="row">
      <input type="text" value="${esc(d.title||"")}" data-oninput-set="draft.title">
      <button data-action="regenerateDraftTitle">🎲 Générer</button>
    </div>
    ${draftNav(valid,false)}`;
  }

  if(needsArtistStep && step === 2){
    const arts = state.signed.map(a=>`
      <button class="opt ${d.beatTarget===a.id?"selected":""}" data-action="setState" data-args='${JSON.stringify(["draft.beatTarget", `${a.id}`])}'>
        <div class="n">${esc(a.name)}</div>
        <div class="d">Recevra +qualité garantie sur son prochain projet</div>
      </button>
    `).join("");
    const valid = !!d.beatTarget;
    return `
    <h3>Pour quel artiste ?</h3><div class="optgrid">${arts}</div>
    ${draftNav(valid,false)}`;
  }

  // récap
  const bt = DATA.BEAT_PTYPES[d.beatType];
  const bm = state.beatmakers.find(x=>x.id===d.beatmaker);
  const total = bt ? bt.cost : 0;
  const ready = !!(d.beatmaker && d.beatType && d.title && (!needsArtistStep || d.beatTarget));
  return `
  <h3>Récapitulatif</h3>
  <div class="card" style="background:var(--panel2)">
    <div class="small"><b>${esc(d.title)}</b> — 🎚️ ${bm?esc(bm.name):"?"}</div>
    <div class="small muted" style="margin-top:4px">${bt?bt.name:"?"} · ${bt?bt.chapitres:"?"}j${needsArtistStep && d.beatTarget ? ` · pour ${esc(artistNameById(d.beatTarget))}` : ``}</div>
  </div>
  <div class="small muted" style="margin-top:8px">Pas de thème ni de promo ici : un instru n'a pas d'identité publique tant qu'un artiste ne pose pas dessus.</div>
  <div class="divider"></div>
  <div class="spread">
    <div>
      <span class="small muted">Coût total : </span><b class="accent">${fmt(total)}</b>
      ${state.argent < total ? `<span class="small bad"> — fonds insuffisants</span>` : ``}
    </div>
    <div class="row">
      <button class="ghost" data-action="setState" data-args='${JSON.stringify(["draft", null])}'>Annuler</button>
      <button data-action="draftGoStep" data-args='${JSON.stringify([0])}'>◀ Modifier</button>
      <button class="primary" ${ready && state.argent >= total ? "" : "disabled"} data-action="launchBeatProject">🚀 Lancer</button>
    </div>
  </div>`;
}

export function renderReleaseChart(r){
  if(!r.history || r.history.length < 2) return `<div class="small muted" style="margin-top:4px">Pas encore assez d'historique pour une courbe.</div>`;
  const max = Math.max(1, ...r.history.map(h=>h.streams));
  const bars = r.history.map(h=>{
    const hpx = Math.max(2, Math.round((h.streams/max)*32));
    return `<div class="rbar" style="height:${hpx}px" title="Épisode ${h.age} : ${fmtS(h.streams)} streams"></div>`;
  }).join("");
  return `<div class="release-chart">${bars}</div><div class="tiny muted">Streams/épisode — ${r.history.length} derniers</div>`;
}

function releaseCard(r){
  const daily = releaseChapterStreams(r);
  const trendCls = daily > (r.dailyStreams*0.6) ? "up" : daily > (r.dailyStreams*0.25) ? "stable" : "down";
  const marqueeBadge = r.marquee
    ? (r.marqueeReason === "hit" ? `<span class="pill good">⭐ Marquante</span>`
     : r.marqueeReason === "polemique" ? `<span class="pill warn">🔥 Polémique</span>`
     : `<span class="pill bad">🪦 Flop mémorable</span>`)
    : ``;
  const etat = r.fini ? `<span class="pill muted">Terminée</span>`
             : daily <= 0 ? `<span class="pill muted">Éteinte</span>`
             : ``;
  return `
  <div class="card ${r.marquee?"release-marquee":""}">
    <div class="spread">
      <div style="font-weight:700">${esc(r.title)}</div>
      <div class="row" style="gap:4px">${marqueeBadge}${etat}<span class="pill">${esc(r.date)}</span></div>
    </div>
    <div class="small muted">${esc(r.artistName)}${r.featName?` feat. ${esc(r.featName)}`:``} · ${esc(r.marcheName)}</div>
    <div class="small" style="margin-top:5px">Qualité ${Math.round(r.quality)} · Score public ${Math.round(r.score)}</div>
    <div class="small">Streams totaux ${fmtS(r.streams)} · <span class="release-trend ${trendCls}">${fmtS(daily)}/ép.</span></div>
    <div class="small accent">Revenus cumulés : ${fmt(r.totalRevenue)}</div>
    ${renderReleaseChart(r)}
    ${r.reviews && r.reviews.length ? `
      <div class="divider"></div>
      ${r.reviews.map(rv=>`<div class="small muted review-line ${rv.tier==="social"?"social":"presse"}">« ${esc(rv.txt)} » — ${esc(rv.src)} (${esc(rv.note)})</div>`).join("")}
    ` : ``}
  </div>`;
}

export function renderReleases(){
  if(!state.releases.length) return `<div class="small muted">Aucune sortie pour le moment.</div>`;
  return `<div class="grid g2">${state.releases.slice().reverse().map(releaseCard).join("")}</div>`;
}

/* ============================================================
   SOUS-ONGLET SORTIES — la discographie complète du label.
   TOUTES les sorties sont ici, marquantes ou non : celles qui
   alimentent l'arc narratif comme celles qui vivent leur vie sans
   qu'on en reparle jamais.
============================================================ */

export function renderSorties(){
  if(!state.releases.length){
    return `<div class="card"><h2>💿 Sorties</h2><p class="muted">Aucune sortie pour le moment. Lancez un projet depuis l'onglet Production.</p>
      <button class="primary" style="margin-top:10px" data-action="setTab" data-args='${JSON.stringify(['label','production'])}'>🎛️ Aller produire</button></div>`;
  }

  const list = state.releases.slice().reverse();
  const marquantes = list.filter(r=>r.marquee);
  const autres = list.filter(r=>!r.marquee);
  const totalStreams = state.releases.reduce((s,r)=>s+(r.streams||0),0);
  const totalRevenus = state.releases.reduce((s,r)=>s+(r.totalRevenue||0),0);
  const actives = state.releases.filter(r=>releaseChapterStreams(r) > 0).length;

  return `
  <div class="card" style="margin-bottom:12px">
    <h2>💿 Discographie</h2>
    <div class="stats" style="margin-top:8px">
      <div class="stat"><div class="l">Sorties</div><div class="v">${state.releases.length}</div></div>
      <div class="stat"><div class="l">Encore actives</div><div class="v">${actives}</div></div>
      <div class="stat"><div class="l">Marquantes</div><div class="v accent">${marquantes.length}</div></div>
      <div class="stat"><div class="l">Streams cumulés</div><div class="v">${fmtS(totalStreams)}</div></div>
      <div class="stat"><div class="l">Revenus cumulés</div><div class="v good">${fmt(totalRevenus)}</div></div>
    </div>
  </div>

  ${marquantes.length ? `
    <h2 style="margin:14px 0 8px">⭐ Sorties marquantes</h2>
    <div class="small muted" style="margin-bottom:8px">Ces titres reviennent dans votre histoire : ils percent, s'essoufflent, ou continuent de faire parler.</div>
    <div class="grid g2">${marquantes.map(releaseCard).join("")}</div>
  ` : ``}

  ${autres.length ? `
    <h2 style="margin:18px 0 8px">Le reste du catalogue</h2>
    <div class="small muted" style="margin-bottom:8px">Sorties qui vivent leur vie sans faire de bruit — elles rapportent, sans revenir dans l'arc narratif.</div>
    <div class="grid g2">${autres.map(releaseCard).join("")}</div>
  ` : ``}
  `;
}

