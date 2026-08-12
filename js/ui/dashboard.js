import { state } from "../state.js";
import { esc, fmt } from "../utils.js";

/* ============================================================
   WIDGETS PARTAGÉS DE L'ACCUEIL.
   L'ancien grand dashboard a été remplacé par la coquille trois
   colonnes (ui/home3col.js). Il ne reste ici que les deux briques
   réutilisables qu'elle consomme : la courbe de trésorerie et le
   journal de bord.
============================================================ */

export function renderCashChart(){
  const hist = state.cashHistory;
  if(!hist.length) return `<div class="small muted" style="margin-top:8px">Pas encore d'historique — résolvez un épisode pour voir le flux de trésorerie.</div>`;

  const nets = hist.map(h=>h.inc-h.cost);
  const maxAbs = Math.max(1, ...nets.map(n=>Math.abs(n)));
  let topBars = "", botBars = "";

  hist.forEach(h=>{
    const n = h.inc - h.cost;
    const barH = Math.max(2, Math.round(Math.abs(n)/maxAbs*38));
    const title = `${n>=0?"+":""}${fmt(n)} net (entrées ${fmt(h.inc)} · sorties -${fmt(h.cost)})`;
    if(n >= 0){
      topBars += `<div class="cashbar good" style="height:${barH}px" title="${esc(title)}"></div>`;
      botBars += `<div class="cashbar empty" title="${esc(title)}"></div>`;
    }else{
      topBars += `<div class="cashbar empty" title="${esc(title)}"></div>`;
      botBars += `<div class="cashbar bad" style="height:${barH}px" title="${esc(title)}"></div>`;
    }
  });

  return `
  <div class="cashchart">
    <div class="cashchart-top">${topBars}</div>
    <div class="cashchart-mid"></div>
    <div class="cashchart-bot">${botBars}</div>
  </div>
  <div class="small muted" style="margin-top:4px">Flux net — ${hist.length} derniers épisodes</div>`;
}

/* Journal de bord : tout ce qui s'est passé, groupé par épisode. */
export function renderJournal(){
  const filters = ["tous","pos","neg","info"];
  const filterLabels = {tous:"Tout",pos:"✅ Bonnes nouvelles",neg:"⚠️ Alertes",info:"ℹ️ Neutre"};
  const filtered = (state.journalFilter==="tous" ? state.journal : state.journal.filter(j=>j.t===state.journalFilter)).slice().reverse().slice(0,60);

  const groups = [];
  filtered.forEach(j=>{
    const last = groups[groups.length-1];
    if(last && last.d === j.d) last.items.push(j);
    else groups.push({d:j.d, items:[j]});
  });

  return `
  <div class="filter-pills">
    ${filters.map(f=>`<button class="${state.journalFilter===f?"active":""}" data-action="setStateSaved" data-args='${JSON.stringify(["journalFilter", `${f}`])}'>${filterLabels[f]}</button>`).join("")}
  </div>
  <div class="log">
    ${groups.map(g=>`
      <div class="log-day">🎬 ${g.d}</div>
      ${g.items.map(j=>`<div class="log-item ${j.t}">${j.m}</div>`).join("")}
    `).join("") || `<div class="muted small">Rien pour l'instant.</div>`}
  </div>`;
}
