import { app } from "../render.js";
import { state } from "../state.js";
import { esc, fmt, fmtS } from "../utils.js";

/* ============================================================
   FIN DE SAISON — l'épisode final, façon série.
   Purement informatif dans l'immense majorité des cas : le joueur
   lit ce qui s'est passé, ferme, et la saison suivante commence.
   Si la trésorerie est en perdition, un choix de crise l'attend
   juste après (il est déjà en tête de la file d'épisodes).
============================================================ */

export function renderSeasonFinaleModal(){
  const d = state.seasonFinale;
  if(!d) return "";

  const netCls = d.net >= 0 ? "good" : "bad";

  return `
  <div class="modal-bg" data-close="seasonFinale">
    <div class="modal season-modal">
      <div class="season-modal-head">
        <div class="tiny muted">Fin de saison</div>
        <div class="bigtitle" style="font-size:1.6rem;margin:2px 0">Saison ${d.season}</div>
        <div class="small muted">${d.episodes} épisode${d.episodes>1?"s":""} · ${d.ans} an${d.ans>1?"s":""} passent · ${esc(state.managerName)} a ${d.age} ans</div>
      </div>

      <div class="season-grid">
        <div class="season-stat"><div class="l">Entrées</div><div class="v good">+${fmt(d.inc)}</div></div>
        <div class="season-stat"><div class="l">Charges</div><div class="v bad">-${fmt(d.cost)}</div></div>
        <div class="season-stat"><div class="l">Solde de saison</div><div class="v ${netCls}">${d.net>=0?"+":""}${fmt(d.net)}</div></div>
        <div class="season-stat"><div class="l">Streams cumulés</div><div class="v">${fmtS(d.streams)}</div></div>
        <div class="season-stat"><div class="l">Trésorerie</div><div class="v ${state.argent<0?"bad":""}">${fmt(d.argent)}</div></div>
        <div class="season-stat"><div class="l">Dette</div><div class="v ${d.dette>0?"warn":""}">${fmt(d.dette)}</div></div>
      </div>

      ${(d.interets>0 || d.taxes>0) ? `
        <div class="small muted" style="margin-top:10px">
          ${d.interets>0 ? `🏦 Intérêts de la saison : -${fmt(d.interets)}. ` : ``}
          ${d.taxes>0 ? `🧾 Impôts : -${fmt(d.taxes)}.` : ``}
        </div>
      ` : ``}

      ${d.crisis ? `
        <div class="card small bad" style="margin-top:12px">
          ⚠️ <b>Situation critique</b> — ${d.crisisStreak} saison${d.crisisStreak>1?"s":""} d'affilée dans le rouge.
          Un choix vous attend dès le prochain épisode. Trois saisons de suite sans redresser la barre et le label dépose le bilan.
        </div>
      ` : `
        <div class="small muted" style="margin-top:12px">Comptes à jour, salaires et charges réglés. La saison suivante peut commencer.</div>
      `}

      <div class="row" style="margin-top:14px;justify-content:flex-end">
        <button class="primary" data-action="closeSeasonFinale">▶️ Lancer la saison ${d.season+1}</button>
      </div>
    </div>
  </div>`;
}

export function renderGameOver(){
  const d = state.gameOverData || {};
  app.innerHTML = `
  <div class="center epilogue-screen gameover-screen">
    <div class="epilogue-icon">💀</div>
    <div class="bigtitle">Dépôt de <span>bilan</span></div>
    <div class="subtitle">${esc(d.label||"Le label")} ferme ses portes après ${d.seasons} saison${d.seasons>1?"s":""}.</div>

    <div class="epilogue-stats">
      <div class="epilogue-stat"><div class="v bad">${fmt(d.argent||0)}</div><div class="l">Trésorerie finale</div></div>
      <div class="epilogue-stat"><div class="v bad">${fmt(d.dette||0)}</div><div class="l">Dette laissée derrière</div></div>
      <div class="epilogue-stat"><div class="v">${d.artistes||0}</div><div class="l">Artistes signés</div></div>
      <div class="epilogue-stat"><div class="v">${d.hits||0}</div><div class="l">Hits produits</div></div>
      <div class="epilogue-stat"><div class="v">${d.age||0} ans</div><div class="l">Âge à la fermeture</div></div>
    </div>

    <p class="epilogue-flavor">Trois saisons dans le rouge sans redresser la barre. Les artistes sont partis les uns après les autres, la banque a fini par fermer le robinet. Ce n'est pas la fin que vous aviez choisie — mais rien ne vous empêche de recommencer, autrement.</p>

    <div class="row">
      <button class="primary" data-action="restartFromEpilogue">🔄 Repartir de zéro</button>
    </div>
  </div>`;
}
