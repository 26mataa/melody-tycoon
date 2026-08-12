import { impact, labelScore, myLabelScore, pveReqs } from "../engine/economy.js";
import { findRival, rivalAttack, rivalDefend } from "../engine/rivalite.js";
import { safeRender } from "../render.js";
import { log, state } from "../state.js";
import { clamp, esc, fmt } from "../utils.js";

export function renderRivaliteLocked(){
  const reqs = pveReqs();
  return `
  <div class="locked-panel">
    <div class="lockicon">🔒</div>
    <h2>Rivalité pas encore débloquée</h2>
    <p class="muted" style="max-width:480px;margin:6px auto 0">Votre label doit d'abord se faire un nom avant d'attirer l'attention — et l'hostilité — des labels rivaux. Continuez à produire et à sortir de la musique pour remplir ces conditions.</p>
    <div class="progress-locks">
      ${reqs.map(r=>`
        <div class="lock-req">
          <span>${r.label}</span>
          <span class="${r.ok?'ok':'ko'}">${r.ok?'✓ atteint':r.text}</span>
        </div>
      `).join("")}
    </div>
  </div>`;
}

export function renderRivalite(){
  const board = [
    {name:`${state.label} (vous)`,score:myLabelScore(),me:true}
  ].concat(state.rivals.map(r=>({name:r.name,score:labelScore({rep:r.rep,buzz:r.buzz}),me:false})))
   .sort((a,b)=>b.score-a.score);

  return `
  <div class="card" style="margin-bottom:12px">
    <h2>🏆 Classement des labels</h2>
    <div class="small muted" style="margin-bottom:8px">Score = Notoriété et Crédibilité pondérées (Standing et Élan pour les labels rivaux, qui ne se mesurent pas comme vous). Grimper au classement augmente l'agressivité des rivaux envers vous.</div>
    <div class="leaderboard">
      ${board.map((row,i)=>`
        <div class="lb-row ${row.me?'me':''}">
          <span class="lb-rank">#${i+1}</span>
          <span class="lb-name">${esc(row.name)}</span>
          <span class="lb-score">${row.score} pts</span>
        </div>
      `).join("")}
    </div>
  </div>

  <div class="grid g2">
    ${state.rivals.map(r=>renderRivalCard(r)).join("")}
  </div>`;
}

export function renderRivalCard(r){
  const aggroCls = r.aggro>=60?"bad":r.aggro>=30?"warn":"good";
  const atkLock = state.sabotageUsed;
  return `
  <div class="rival-card">
    <div class="spread">
      <div style="font-weight:700">${esc(r.name)}</div>
      <span class="pill">${esc(r.style)}</span>
    </div>
    <div class="small muted" style="margin-top:4px">Trésorerie ${fmt(r.argent)} · Standing ${Math.round(r.rep)} · Élan ${Math.round(r.buzz)}</div>
    <div class="small">Agressivité <span class="${aggroCls}">${Math.round(r.aggro)}</span></div>
    <div class="bar aggro-bar"><i style="width:${clamp(r.aggro,0,100)}%"></i></div>
    <div class="row" style="margin-top:10px">
      <button class="small" data-action="setState" data-args='${JSON.stringify(["rivalProfile", `${esc(r.name)}`])}'>👁️ Voir le roster</button>
    </div>
    <div class="divider"></div>
    <div class="small muted" style="margin-bottom:5px">⚔️ Attaques (1 action offensive / saison)</div>
    <div class="optgrid">
      <button class="opt ${atkLock?'locked':''}" ${atkLock?'disabled':''} data-action="rivalAttack" data-args='${JSON.stringify([`${esc(r.name)}`, 'rumeur'])}'>
        <div class="n">🗣️ Rumeur ciblée</div>
        <div class="impacts"><span class="pill">🎲 55%</span><span class="impact-chip pos">Crédibilité +2</span></div>
      </button>
      <button class="opt ${atkLock?'locked':''}" ${atkLock?'disabled':''} data-action="rivalAttack" data-args='${JSON.stringify([`${esc(r.name)}`, 'playlist'])}'>
        <div class="n">🕵️ Piratage playlist (-300€)</div>
        <div class="impacts"><span class="pill">🎲 45%</span><span class="impact-chip neg">-Notoriété rivale</span></div>
      </button>
      <button class="opt ${atkLock?'locked':''}" ${atkLock?'disabled':''} data-action="rivalAttack" data-args='${JSON.stringify([`${esc(r.name)}`, 'beat'])}'>
        <div class="n">🎹 Vol de beat</div>
        <div class="impacts"><span class="pill">🎲 50%</span><span class="impact-chip pos">+Qualité sortie</span></div>
      </button>
      <button class="opt ${atkLock?'locked':''}" ${atkLock?'disabled':''} data-action="rivalAttack" data-args='${JSON.stringify([`${esc(r.name)}`, 'debaucher'])}'>
        <div class="n">💰 Débauchage (-1000€)</div>
        <div class="impacts"><span class="pill">🎲 40%</span><span class="impact-chip pos">Vole un artiste</span></div>
      </button>
    </div>
    <div class="small muted" style="margin:8px 0 5px">🛡️ Défense (pas de limite hebdomadaire)</div>
    <div class="optgrid">
      <button class="opt" data-action="rivalDefend" data-args='${JSON.stringify([`${esc(r.name)}`, 'alliance'])}'>
        <div class="n">🤝 Proposer une alliance (-10 Crédibilité)</div>
        <div class="d">Fait chuter durablement son agressivité</div>
      </button>
    </div>
  </div>`;
}

export function renderRivalProfileModal(){
  const r = findRival(state.rivalProfile);
  if(!r) return "";
  return `
  <div class="modal-bg" data-close="rivalProfile">
    <div class="modal">
      <div class="spread">
        <h2>${esc(r.name)}</h2>
        <button class="ghost" data-action="setState" data-args='${JSON.stringify(["rivalProfile", null])}'>✕</button>
      </div>
      <div class="small muted">${esc(r.style)}</div>
      <div class="divider"></div>
      <div class="small muted">Roster (${r.roster.length})</div>
      <div class="grid g3" style="margin-top:8px">
        ${r.roster.map(a=>`
          <div class="artist-card" style="cursor:default">
            <div style="font-weight:700">${esc(a.name)}</div>
            <div class="small muted">${esc(a.genre)}</div>
            <div class="small">Talent ${a.talent} · Pop ${a.pop}</div>
          </div>
        `).join("") || `<div class="small muted">Roster vide.</div>`}
      </div>
      <div class="divider"></div>
      <div class="small muted">Historique récent</div>
      <div class="log" style="margin-top:6px">
        ${(r.history||[]).slice().reverse().slice(0,10).map(h=>`<div class="log-item info">${esc(h)}</div>`).join("") || `<div class="small muted">Rien à signaler.</div>`}
      </div>
    </div>
  </div>`;
}

