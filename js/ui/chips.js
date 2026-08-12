import { STAT_MAP } from "../engine/economy.js";
import { fmt } from "../utils.js";
import { DATA } from "../data.js";

/* Le joueur ne voit que deux jauges : les pastilles d'impact doivent parler
   la même langue que lui. Un choix écrit `{buzz:9, reseau:2}` n'affiche donc
   pas deux libellés fantômes, il affiche le total réellement appliqué sur
   Notoriété et Crédibilité — exactement le repli fait par impact(). */
export function foldDeltas(deltas){
  const out = {};
  Object.keys(deltas||{}).forEach(k=>{
    const v = deltas[k];
    if(!v) return;
    if(k === "argent"){ out.argent = (out.argent||0) + v; return; }
    const m = STAT_MAP[k];
    if(!m) return;
    out[m.stat] = (out[m.stat]||0) + v*m.k;
  });
  return out;
}

export function chipsFromDeltas(deltas){
  const folded = foldDeltas(deltas);
  return Object.keys(folded).map(k=>{
    const v = k === "argent" ? folded[k] : Math.round(folded[k]);
    if(!v) return "";
    const cls = v>0?"pos":"neg";
    const label = DATA.IMPACT_LABELS[k]||k;
    const val = k==='argent' ? (v>0?"+":"")+fmt(v) : (v>0?"+":"")+v;
    return `<span class="impact-chip ${cls}">${label} ${val}</span>`;
  }).join("");
}

/* Affiche uniquement le coût — sert pour les choix "créatifs" (thème/cover/promo/marketing)
   dont l'effet réel sur les stats est volontairement caché jusqu'à la sortie du son. */

export const HIDDEN_STAT_NOTE = `<div class="tiny muted">🔒 Effet réel révélé à la sortie du son</div>`;

export function draftOptionChips(o){
  const chips=[];
  if(o.cost) chips.push(`<span class="impact-chip neg">€ -${fmt(o.cost)}</span>`);
  // pub et buzz jouent tous deux sur l'accueil du public, crit sur la critique :
  // même vocabulaire à l'écran que les deux jauges du label.
  const notoPreview = (o.pub||0) + (o.buzz||0);
  if(notoPreview) chips.push(`<span class="impact-chip ${notoPreview>0?"pos":"neg"}">Notoriété ${notoPreview>0?"+":""}${notoPreview}</span>`);
  if(o.crit) chips.push(`<span class="impact-chip ${o.crit>0?"pos":"neg"}">Crédibilité ${o.crit>0?"+":""}${o.crit}</span>`);
  if(o.risk) chips.push(`<span class="impact-chip risk">Risque ${o.risk}</span>`);
  if(o.bonus) chips.push(`<span class="impact-chip pos">Qualité +${o.bonus}</span>`);
  if(o.mult) chips.push(`<span class="impact-chip pos">Portée x${(1+o.mult).toFixed(1)}</span>`);
  if(o.reach) chips.push(`<span class="impact-chip pos">Reach x${o.reach}</span>`);
  return chips.join("");
}

