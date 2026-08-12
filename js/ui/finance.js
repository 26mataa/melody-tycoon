import { dailyCost, openBank, streamDailyIncome } from "../engine/economy.js";
import { safeRender } from "../render.js";
import { state } from "../state.js";
import { renderCashChart } from "./dashboard.js";
import { renderReleaseChart } from "./label.js";
import { esc, fmt } from "../utils.js";

export function renderFinance(){
  const inc = streamDailyIncome();
  const cost = dailyCost();
  const salaireArtistes = state.signed.reduce((s,a)=>s+(a.salaire||0),0);
  const salaireBeatmakers = state.beatmakers.reduce((s,b)=>s+(b.salaire||0),0);
  const lifetimeRevenue = state.releases.reduce((s,r)=>s+(r.totalRevenue||0),0);
  const topRelease = state.releases.slice().sort((a,b)=>b.totalRevenue-a.totalRevenue)[0];

  return `
  <div class="card" style="margin-bottom:12px">
    <h2>💰 Vue d'ensemble</h2>
    <div class="grid g3">
      <div class="stat"><div class="l">Revenus streams/ép.</div><div class="v good">${fmt(inc)}</div></div>
      <div class="stat"><div class="l">Charges/ép.</div><div class="v bad">${fmt(cost)}</div></div>
      <div class="stat"><div class="l">Solde/ép.</div><div class="v ${inc-cost>=0?"good":"bad"}">${fmt(inc-cost)}</div></div>
    </div>
    ${renderCashChart()}
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="spread">
      <h2 style="margin:0">📊 Répartition des charges</h2>
      <button class="small" data-action="setState" data-args='${JSON.stringify(["financeBreakdownOpen", !state.financeBreakdownOpen])}'>${state.financeBreakdownOpen?"▲ Masquer":"▼ Détailler"}</button>
    </div>
    ${state.financeBreakdownOpen ? `
      <div class="divider"></div>
      <div class="small">Salaires artistes : <b class="bad">${fmt(salaireArtistes)}/ép.</b> (${state.signed.length} artiste${state.signed.length>1?"s":""})</div>
      <div class="small">Salaires beatmakers : <b class="bad">${fmt(salaireBeatmakers)}/ép.</b> (${state.beatmakers.length})</div>
      <div class="divider"></div>
      ${state.signed.map(a=>`<div class="spread small" style="margin:2px 0"><span>${esc(a.name)}</span><span class="bad">-${fmt(a.salaire)}/ép.</span></div>`).join("")}
      ${state.beatmakers.map(b=>`<div class="spread small" style="margin:2px 0"><span>🎚️ ${esc(b.name)}</span><span class="bad">-${fmt(b.salaire)}/ép.</span></div>`).join("")}
    ` : ``}
  </div>

  <div class="grid g2">
    <div class="card">
      <h2>🏆 Meilleure vente</h2>
      ${topRelease ? `
        <div class="small"><b>${esc(topRelease.title)}</b> — ${esc(topRelease.artistName)}</div>
        <div class="small accent" style="margin-top:4px">${fmt(topRelease.totalRevenue)} générés</div>
        ${renderReleaseChart(topRelease)}
      ` : `<div class="small muted">Aucune sortie pour l'instant.</div>`}
      <div class="small muted" style="margin-top:8px">Revenus cumulés (toutes sorties) : <b class="accent">${fmt(lifetimeRevenue)}</b></div>
    </div>
    <div class="card">
      <h2>🏦 Trésorerie</h2>
      <div class="small muted">Solde actuel : <b class="${state.argent<0?"bad":"good"}">${fmt(state.argent)}</b></div>
      ${state.bank.dette>0 ? `<div class="small warn" style="margin-top:4px">Dette en cours : ${fmt(state.bank.dette)}</div>` : ``}
      <button class="primary" style="margin-top:10px;width:100%" data-action="openBank">🏦 Ouvrir la banque</button>
    </div>
  </div>`;
}

