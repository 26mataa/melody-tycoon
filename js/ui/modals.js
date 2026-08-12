import { durationById, negoAcceptChance, negoArtistRef, negoBackToInitial, negoExposeCareer, negoOpenCustom, negoRefuse, negoSetDuration, negoSetField, negoSubmitCustom, negoValidate } from "../engine/contracts.js";
import { avgMoral, getTier, loanCeiling, MAMIE_COOLDOWN, mamieAvailable, mamieChaptersLeft, repayLoan, takeLoan } from "../engine/economy.js";
import { energyLabel, lifeStage, stressLabel } from "../engine/player.js";
import { castResume } from "../engine/cast.js";
import { conduiteDominante } from "../engine/memory.js";
import { notify } from "../notify.js";
import { safeRender } from "../render.js";
import { log, save, state } from "../state.js";
import { chance, clamp, esc, fmt } from "../utils.js";
import { DATA } from "../data.js";

/* ============================================================
   MAMIE HUGUETTE — son propre panneau, ouvert depuis la barre du haut.
   Ce n'est plus un revenu qui tombe tout seul : c'est un joker que le
   joueur décide d'utiliser, avec une recharge en épisodes. Elle dépanne,
   elle ne finance pas une carrière.
============================================================ */

export function renderMamiePanel(){
  const m = state.mamie;
  const dispo = mamieAvailable();
  const reste = mamieChaptersLeft();

  let etat, etatCls, action;
  if(!m.active){
    etat = "Mamie ne fait pas partie de cette partie.";
    etatCls = "muted";
    action = "";
  }else if(m.independant){
    etat = "Mamie a raccroché. Vous volez de vos propres ailes.";
    etatCls = "good";
    action = "";
  }else if(dispo){
    etat = "Mamie a de quoi vous dépanner.";
    etatCls = "good";
    action = `<button class="primary" data-action="useMamieHelp">👵 Lui demander un coup de main</button>`;
  }else{
    etat = `Elle vient de donner. Revenez dans ${reste} épisode${reste>1?"s":""}.`;
    etatCls = "warn";
    action = `<button disabled>👵 Encore ${reste} épisode${reste>1?"s":""}</button>`;
  }

  const pct = m.active && !m.independant
    ? Math.round(((MAMIE_COOLDOWN - reste) / MAMIE_COOLDOWN) * 100)
    : 100;

  return `
  <div class="modal-bg" data-close="mamie.panelOpen">
    <div class="modal mamie-modal">
      <div class="spread">
        <h2>👵 Mamie Huguette</h2>
        <button class="ghost" data-action="toggleMamiePanel">✕</button>
      </div>

      <div class="small ${etatCls}" style="margin-top:6px">${etat}</div>

      ${m.active && !m.independant ? `
        <div class="bar" style="margin:12px 0"><i style="width:${pct}%"></i></div>
        <div class="tiny muted">Recharge : ${MAMIE_COOLDOWN} épisodes entre deux coups de main.</div>
      ` : ``}

      ${m.lastPhrase ? `
        <div class="card" style="margin-top:14px;background:var(--panel2)">
          <div class="tiny muted">La dernière fois, elle a dit :</div>
          <div class="small" style="margin-top:4px;font-style:italic">« ${esc(m.lastPhrase)} »</div>
        </div>
      ` : ``}

      <div class="grid g2" style="margin-top:14px">
        <div class="stat"><div class="l">Total donné</div><div class="v">${fmt(m.totalRecu||0)}</div></div>
        <div class="stat"><div class="l">Coups de main</div><div class="v">${m.uses||0}</div></div>
      </div>

      <div class="row" style="margin-top:14px;justify-content:flex-end">${action}</div>
    </div>
  </div>`;
}

/* ============================================================
   PROFIL DU JOUEUR — ouvert en cliquant sur la carte profil de la
   barre du haut. Regroupe tout ce qui concerne le personnage (âge,
   forme, look) : ça vivait auparavant en permanence dans la colonne
   de droite de l'accueil, où ça prenait la place la plus visible du
   jeu pour des infos qu'on consulte rarement. Ici elles restent à
   une seule pression de clic, et la colonne de droite peut mettre
   en avant quelque chose qu'on utilise vraiment (Mamie).
============================================================ */

export function renderProfilePanel(){
  const p = state.player;
  const el = energyLabel(p.energy);
  const st = stressLabel(p.stress);
  const avatar = state.avatarPhoto
    ? `<img src="${state.avatarPhoto}" class="profile-modal-avatar">`
    : `<div class="profile-modal-avatar fallback">🧑‍🎤</div>`;

  return `
  <div class="modal-bg" data-close="profilePanelOpen">
    <div class="modal profile-modal">
      <div class="spread">
        <h2>Profil</h2>
        <button class="ghost" data-action="setState" data-args='${JSON.stringify(["profilePanelOpen", false])}'>✕</button>
      </div>

      <div class="profile-modal-head">
        ${avatar}
        <div>
          <div class="profile-modal-name">${esc(state.managerName)||"Vous"}</div>
          <div class="small muted">${esc(state.label)}</div>
          <div class="tiny muted" style="margin-top:2px">${p.age} ans · ${lifeStage(p.age)}</div>
        </div>
      </div>

      ${state.look ? `<div class="small" style="margin-top:12px;font-style:italic">« ${esc(state.look)} »</div>` : ``}

      <div class="divider"></div>

      <div style="margin-top:4px">
        <div class="spread tiny"><span>⚡ Énergie</span><span class="${el.cls}">${el.txt}</span></div>
        <div class="bar thin" style="margin-top:4px"><i style="width:${p.energy}%"></i></div>
      </div>
      <div style="margin-top:12px">
        <div class="spread tiny"><span>😤 Stress</span><span class="${st.cls}">${st.txt}</span></div>
        <div class="bar thin moral" style="margin-top:4px"><i style="width:${p.stress}%"></i></div>
      </div>

      <div class="grid g2" style="margin-top:16px">
        <div class="stat"><div class="l">Artistes signés</div><div class="v">${state.careerArtistsSigned||0}</div></div>
        <div class="stat"><div class="l">Hits</div><div class="v">${state.careerHits||0}</div></div>
      </div>

      ${renderCastBlock()}
      ${renderConduiteBlock()}
    </div>
  </div>`;
}

/* Les quatre personnes qui traversent la partie, et où en est votre
   relation avec chacune. Sans cet affichage, le casting resterait une
   mécanique invisible : le joueur verrait revenir des noms sans jamais
   savoir qu'il a une histoire chiffrée avec eux. */
function renderCastBlock(){
  const gens = castResume();
  if(!gens.length) return "";
  return `
  <div class="divider"></div>
  <div class="panel-label" style="margin-bottom:6px">Qui compte pour vous</div>
  ${gens.map(g=>`
    <div class="spread small" style="margin:6px 0">
      <span>${g.icone} <b>${esc(g.nom)}</b> <span class="tiny muted">${esc(g.titre)}</span></span>
      <span class="${g.etat.cls}">${g.etat.txt}</span>
    </div>
  `).join("")}`;
}

/* La mémoire de conduite, une fois qu'elle a pris. Ce n'est pas un
   journal exhaustif des choix — c'est ce que le milieu a retenu de
   votre façon de faire, ce qui est la seule chose qui ait un effet. */
function renderConduiteBlock(){
  const dom = conduiteDominante();
  if(!dom) return "";
  return `
  <div class="divider"></div>
  <div class="panel-label" style="margin-bottom:6px">Ce qu'on retient de vous</div>
  <div class="small">${dom.icone} Dans le milieu, vous êtes <b>${esc(dom.nom)}</b>.</div>
  <div class="tiny muted" style="margin-top:2px">${dom.n} fois que vous répondez comme ça. Ça vous ouvre des portes, et ça vous en ferme.</div>`;
}

export function renderRetireConfirmModal(){
  const tier = getTier();
  return `
  <div class="modal-bg" data-close="retireConfirmOpen">
    <div class="modal">
      <div class="spread">
        <h2>🏆 Prendre sa retraite ?</h2>
        <button class="ghost" data-action="setState" data-args='${JSON.stringify(["retireConfirmOpen", false])}'>✕</button>
      </div>
      <div class="small muted" style="margin-top:4px">Vous êtes actuellement ${tier.icon} <b>${tier.name}</b>. Ce n'est pas une fin forcée : votre sauvegarde reste intacte, vous pourrez toujours choisir de continuer après avoir lu votre épilogue.</div>
      <div class="row" style="margin-top:14px">
        <button class="primary" data-action="confirmRetire">Oui, c'est la fin de l'histoire</button>
        <button class="ghost" data-action="setState" data-args='${JSON.stringify(["retireConfirmOpen", false])}'>Non, pas encore</button>
      </div>
    </div>
  </div>`;
}

export function renderAdminPanel(){
  const moral = avgMoral();
  return `
  <div class="modal-bg" data-close="adminPanelOpen">
    <div class="modal">
      <div class="spread">
        <h2>🛠️ Panneau Admin</h2>
        <button class="ghost" data-action="setState" data-args='${JSON.stringify(["adminPanelOpen", false])}'>✕</button>
      </div>
      <div class="small muted">Modifie n'importe quelle statistique — l'effet est immédiat et réel sur la partie (palier, PvE, économie...).</div>
      <div class="divider"></div>
      ${adminRow("argent","💰 Argent",state.argent,-999999999,999999999)}
      ${adminRow("notoriete","📣 Notoriété",state.notoriete,0,100)}
      ${adminRow("credibilite","🎖️ Crédibilité",state.credibilite,0,100)}
      ${adminRow("moral","😊 Moral (tous les artistes)",moral===null?0:moral,0,100)}
      <div class="divider"></div>
      <div class="spread">
        <span class="small">🎲 Tester le pool narratif</span>
        <button class="small primary" data-action="adminNextEpisode">Tirer un autre épisode</button>
      </div>
    </div>
  </div>`;
}

export function adminRow(key,label,val,min,max){
  return `
  <div class="spread" style="margin:10px 0">
    <span class="small">${label}</span>
    <div class="row">
      <button class="small" data-action="adminNudge" data-args='${JSON.stringify([`${key}`, -10])}'>-10</button>
      <input type="number" id="admin_${key}" value="${Math.round(val)}" style="width:100px" min="${min}" max="${max}">
      <button class="small" data-action="adminNudge" data-args='${JSON.stringify([`${key}`, 10])}'>+10</button>
      <button class="small primary" data-action="adminSetStat" data-args='${JSON.stringify([`${key}`])}'>Appliquer</button>
    </div>
  </div>`;
}

/* Met à jour uniquement les chiffres du HUD, sans reconstruire tout le DOM.
   Évite que les popups ouvertes (ex: Panneau Admin) ne "rechargent"/rejouent
   leur animation d'apparition à chaque clic — c'était le bug remonté. */

export function updateHudLive(){
  const moral = avgMoral();
  const set = (id,val)=>{ const el = document.getElementById(id); if(el) el.textContent = val; };
  set("hud-argent", fmt(state.argent));
  set("hud-notoriete", Math.round(state.notoriete));
  set("hud-credibilite", Math.round(state.credibilite));
  set("hud-moral", moral === null ? "—" : moral);
}

export function adminNudge(key,delta){
  const input = document.getElementById("admin_"+key);
  if(!input) return;
  input.value = Number(input.value||0) + delta;
  adminSetStat(key);
}

export function adminSetStat(key){
  const input = document.getElementById("admin_"+key);
  if(!input) return;
  const v = Number(input.value);
  if(Number.isNaN(v)) return;
  if(key === "argent"){
    state.argent = v;
  }else if(key === "moral"){
    state.signed.forEach(a=>{ a.humeur = clamp(v,0,100); });
  }else{
    state[key] = clamp(v,0,100);
  }
  log(`🛠️ [Admin] ${key} défini à ${v}.`,"info");
  updateHudLive();
  save();
}


/* Le tutoriel modal a été retiré en V0.9. Il décrivait un jeu qui n'existe
   plus (jours, semaines, quatre jauges) et s'imposait par-dessus l'écran
   avant même que le joueur ait pu regarder quoi que ce soit.
   Ce qui le remplace est intégré au jeu : le rappel de recrutement dans la
   colonne narrative, et surtout les mandats (engine/mandate.js), qui disent
   quoi faire au moment où ça compte, dans le contexte réel de la partie,
   plutôt qu'un mur de texte lu une fois puis oublié.
   Un vrai tutoriel interactif reste à écrire. */

export function renderBeatmakerDrawer(){
  const n = state.beatmakers.length;
  if(n === 0) return "";

  if(!state.beatmakerDrawerOpen){
    return `<button class="beatmaker-reopen" data-action="reopenBeatmakerDrawer">🎚️ ${n} beatmaker${n>1?"s":""}</button>`;
  }

  return `
  <div class="beatmaker-drawer">
    <div class="beatmaker-drawer-head" data-action="setState" data-args='${JSON.stringify(["beatmakerDrawerMin", !state.beatmakerDrawerMin])}'>
      <span>🎚️ Beatmakers <span class="badge" style="position:static;margin-left:4px">${n}</span></span>
      <div class="row" style="gap:4px">
        <button class="small ghost" title="${state.beatmakerDrawerMin?"Agrandir":"Réduire"}" data-action="setState" data-args='${JSON.stringify(["beatmakerDrawerMin", !state.beatmakerDrawerMin])}'>${state.beatmakerDrawerMin?"▲":"▼"}</button>
        <button class="small ghost" title="Fermer" data-action="setState" data-args='${JSON.stringify(["beatmakerDrawerOpen", false])}'>✕</button>
      </div>
    </div>
    ${!state.beatmakerDrawerMin ? `
      <div class="beatmaker-drawer-body">
        ${state.beatmakers.map(b=>{
          const hypeCls = b.hype>=70?"good":b.hype>=40?"warn":"bad";
          const hypeTxt = b.hype>=70?"🔥 Hype cette saison — le prendre vaut le coup aujourd'hui" : b.hype>=40?"Régulier cette saison" : "😴 Peu hype cette saison";
          return `
          <div class="beatmaker-row">
            <div class="spread">
              <b>${esc(b.name)}</b>
              <span class="small ${hypeCls}">${b.hype}% hype</span>
            </div>
            <div class="tiny muted">${esc(b.genre)} · Skill ${b.skill}${b.resting>0?` · 😴 Repos (${b.resting} ép.)`:``}</div>
            <div class="tiny ${hypeCls}">${hypeTxt}</div>
          </div>`;
        }).join("")}
      </div>
    ` : ``}
  </div>`;
}

/* ============================================================
   RIVALITÉ — PvE débloqué par la progression du label
============================================================ */

export function renderNegotiationModal(){
  const n = state.negotiation;
  if(!n) return "";
  const a = negoArtistRef(n);
  if(!a){ return ""; }

  const title = n.kind==="market" ? "💼 Négociation d'un nouvel artiste" : "🔄 Fin de contrat";
  const closeBtn = n.done ? `<button class="ghost" data-action="setState" data-args='${JSON.stringify(["negotiation", null])}'>✕</button>` : (n.kind==="market" ? `<button class="ghost" data-action="setState" data-args='${JSON.stringify(["negotiation", null])}'>✕</button>` : ``);

  if(n.done){
    return `
    <div class="modal-bg">
      <div class="modal">
        <div class="spread"><h2>${title}</h2>${closeBtn}</div>
        <div class="small muted">${esc(a.name)}</div>
        <div class="small ${n.resultOk?"good":"bad"}" style="margin-top:10px">${n.result}</div>
        <div class="row" style="margin-top:12px">
          <button class="primary" data-action="setState" data-args='${JSON.stringify(["negotiation", null])}'>Continuer</button>
        </div>
      </div>
    </div>`;
  }

  if(n.mode === "custom"){
    const c = n.custom;
    const chance = Math.round(negoAcceptChance(n)*100);
    const chanceCls = chance>=65?"good":chance>=35?"warn":"bad";
    return `
    <div class="modal-bg">
      <div class="modal">
        <div class="spread"><h2>${title}</h2>${closeBtn}</div>
        <div class="small muted">${esc(a.name)} — proposition initiale : ${durationById(n.proposal.durationId).name}, ${fmt(n.proposal.salaire)}/ép., ${fmt(n.proposal.cost)} de signature.</div>
        <div class="divider"></div>
        <h3>Durée du contrat</h3>
        <div class="optgrid">
          ${DATA.CONTRACT_DURATIONS.map(d=>`
            <button class="opt ${c.durationId===d.id?"selected":""}" data-action="negoSetDuration" data-args='${JSON.stringify([`${d.id}`])}'>
              <div class="n">${d.name}</div>
            </button>
          `).join("")}
        </div>
        <h3 style="margin-top:14px">Salaire proposé (par épisode)</h3>
        <input type="text" inputmode="numeric" pattern="[0-9]*" id="negoSalaireInput" value="${c.salaire}" data-oninput="negoSetFieldLive" data-args='${JSON.stringify(['salaire'])}'>
        <h3 style="margin-top:14px">Coût de signature proposé</h3>
        <input type="text" inputmode="numeric" pattern="[0-9]*" id="negoCostInput" value="${c.cost}" data-oninput="negoSetFieldLive" data-args='${JSON.stringify(['cost'])}'>
        <div class="divider"></div>
        <div class="spread">
          <span class="small muted">Chance d'acceptation (temps réel)</span>
          <span class="small ${chanceCls}" id="negoChanceVal" style="font-weight:800">${chance}%</span>
        </div>
        <div class="bar"><i id="negoChanceBar" style="width:${chance}%"></i></div>
        <div class="small muted" style="margin-top:8px" id="negoCostNote">Coût total si accepté : <b class="accent">${fmt(c.cost)}</b>${state.argent<c.cost?` <span class="bad">— fonds insuffisants</span>`:``}</div>
        <div class="row" style="margin-top:12px">
          <button class="ghost" data-action="negoBackToInitial">◀ Revenir à l'offre initiale</button>
          <button class="primary" id="negoSubmitBtn" ${state.argent<c.cost?"disabled":""} data-action="negoSubmitCustom">📨 Proposer ce contrat</button>
        </div>
      </div>
    </div>`;
  }

  const dur = durationById(n.proposal.durationId);
  return `
  <div class="modal-bg">
    <div class="modal">
      <div class="spread"><h2>${title}</h2>${closeBtn}</div>
      <div class="small muted">${n.kind==="market" ? `${esc(a.name)} souhaite rejoindre le label.` : `${esc(a.name)} arrive en fin de contrat.`}</div>
      <div class="nego-phrase">« ${esc(n.phrase)} »</div>
      <div class="grid g3" style="margin-top:8px">
        <div class="stat"><div class="l">Durée proposée</div><div class="v">${dur.name}</div></div>
        <div class="stat"><div class="l">Salaire/ép.</div><div class="v">${fmt(n.proposal.salaire)}</div></div>
        <div class="stat"><div class="l">Coût de signature</div><div class="v accent">${fmt(n.proposal.cost)}</div></div>
      </div>
      <div class="small muted" style="margin-top:10px">Valider ou refuser définitivement sont des décisions fermes et garanties. Modifier le contrat permet de fixer vos propres chiffres — la chance d'acceptation de l'artiste sera alors affichée en temps réel.</div>
      <div class="row" style="margin-top:10px">
        <button class="primary" ${state.argent<n.proposal.cost?"disabled":""} data-action="negoValidate">✅ Valider (garanti, -${fmt(n.proposal.cost)})</button>
        <button data-action="negoRefuse">🚫 Refuser définitivement</button>
        <button data-action="negoOpenCustom">✏️ Modifier le contrat</button>
      </div>
      ${n.kind==="resign" ? `
      <div class="row" style="margin-top:8px">
        <button class="danger" data-action="negoExposeCareer">😈 Exposer sa carrière — 🎲 50/50</button>
      </div>` : ``}
    </div>
  </div>`;
}

/* Rafraîchissement local de la modale de négociation en mode "custom" :
   on ne touche que la barre de chance, le texte associé, la note de coût et
   l'état du bouton — jamais la modale entière. Appelée à chaque frappe dans
   les champs salaire/coût (voir negoSetFieldLive dans dispatch.js) : ça
   évite de recréer les deux <input>, qui perdraient sinon le focus et le
   curseur, et de rejouer l'animation d'entrée de la modale à chaque lettre.
   Renvoie false si la modale n'est pas dans l'état attendu (l'appelant
   retombe alors sur un rendu complet classique). */
export function patchNegoLive(){
  const n = state.negotiation;
  if(!n || n.mode !== "custom" || !n.custom) return false;
  const valEl = document.getElementById("negoChanceVal");
  const barEl = document.getElementById("negoChanceBar");
  const noteEl = document.getElementById("negoCostNote");
  const btnEl = document.getElementById("negoSubmitBtn");
  if(!valEl || !barEl || !noteEl || !btnEl) return false;

  const c = n.custom;
  const chance = Math.round(negoAcceptChance(n)*100);
  const chanceCls = chance>=65?"good":chance>=35?"warn":"bad";

  valEl.className = `small ${chanceCls}`;
  valEl.textContent = `${chance}%`;
  barEl.style.width = `${chance}%`;
  const short = state.argent < c.cost;
  noteEl.innerHTML = `Coût total si accepté : <b class="accent">${fmt(c.cost)}</b>${short?` <span class="bad">— fonds insuffisants</span>`:``}`;
  btnEl.disabled = short;
  return true;
}

export function renderBankModal(){
  const maxLoan = loanCeiling();
  return `
  <div class="modal-bg" data-close="bankModal">
    <div class="modal">
      <div class="spread">
        <h2>🏦 Banque</h2>
        <button class="ghost" data-action="setState" data-args='${JSON.stringify(["bankModal", false])}'>✕</button>
      </div>
      <div class="small muted">Dette actuelle : <b class="${state.bank.dette>0?'bad':''}">${fmt(state.bank.dette)}</b></div>
      <div class="small muted">Intérêt : +6% par saison. Remboursement automatique de 15% par saison si trésorerie positive.</div>
      <div class="divider"></div>
      <div class="row">
        <button class="primary" data-action="takeLoan" data-args='${JSON.stringify([1000])}'>Emprunter 1 000€</button>
        <button class="primary" data-action="takeLoan" data-args='${JSON.stringify([5000])}'>Emprunter 5 000€</button>
        <button data-action="repayLoan">Rembourser maintenant</button>
      </div>
      <div class="small muted" style="margin-top:8px">Plafond estimé : ${fmt(maxLoan)} (lié surtout à votre Notoriété).</div>
    </div>
  </div>`;
}

