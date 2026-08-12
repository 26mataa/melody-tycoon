import { state } from "./state.js";

export const fmt = n => {
  n = Math.round(n);
  const sign = n < 0 ? "-" : "";
  n = Math.abs(n);
  if(n >= 1e9) return sign + (n/1e9).toFixed(2) + "Md€";
  if(n >= 1e6) return sign + (n/1e6).toFixed(2) + "M€";
  if(n >= 1e3) return sign + (n/1e3).toFixed(1) + "k€";
  return sign + n + "€";
};

export const fmtS = n => {
  n = Math.round(n);
  if(Math.abs(n) >= 1e9) return (n/1e9).toFixed(2) + "Md";
  if(Math.abs(n) >= 1e6) return (n/1e6).toFixed(2) + "M";
  if(Math.abs(n) >= 1e3) return (n/1e3).toFixed(0) + "k";
  return String(n);
};

export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export const rand=(a,b)=>a+Math.random()*(b-a);

export const rint=(a,b)=>Math.floor(rand(a,b+1));

export const pick=a=>a[Math.floor(Math.random()*a.length)];

export const chance=p=>Math.random()<p;

export const clone=o=>JSON.parse(JSON.stringify(o));

export const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

export function errorHTML(err){
  const msg = err && err.message ? err.message : String(err);
  return `<div class="card error-box">⚠️ Erreur JavaScript :<br>${esc(msg)}<br><br>Ouvre la console (F12) pour plus de détails.</div>`;
}

/* ============================================================
   DONNÉES DE DÉPART
============================================================ */

export function shuffleArr(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

export function genTitle(){
  const adj=["Nuit","Ombre","Lumière","Flamme","Orage","Silence","Écho","Vertige","Aurore","Mirage"];
  const noun=["Éternelle","Perdue","Sauvage","Dorée","Nocturne","Ardente","Fragile","Immense","Secrète","Fatale"];
  return pick(adj)+" "+pick(noun);
}

/* Repère temporel du jeu : plus de calendrier, on situe par saison/épisode. */
export function chapterStr(){
  return `S${state.season||1}·É${Math.max(1,state.episodeInSeason||1)}`;
}

export function langMatches(langue,marche){
  if(langue === "fr" && marche === "fr") return true;
  if(langue === "en" && ["uk","usa","intl"].includes(marche)) return true;
  if(langue === "bi" && marche === "intl") return true;
  if(langue === "instru") return true;
  return false;
}

export function statDelta(prevVal, curVal){
  if(prevVal === null || prevVal === undefined || curVal === null || curVal === undefined) return "";
  const d = curVal - prevVal;
  if(Math.abs(d) < 0.05) return "";
  const cls = d > 0 ? "good" : "bad";
  const arrow = d > 0 ? "▲" : "▼";
  const rounded = Math.abs(d) < 1 ? d.toFixed(1) : Math.round(d);
  return ` <span class="stat-delta ${cls}">${arrow}${d>0?"+":""}${rounded}</span>`;
}

/* ============================================================
   ROLL CASINO
============================================================ */

