import { ACTIONS_SOCIAL, COOLDOWN_POST, followers, formatFollowers, paliersSocial, postCooldownRestant, revuePresse } from "../engine/social.js";
import { state } from "../state.js";
import { esc, fmt } from "../utils.js";

/* ============================================================
   ÉCRAN RÉSEAUX — l'audience, le fil, la presse.

   Trois blocs, dans cet ordre parce que c'est l'ordre des questions
   que se pose le joueur : combien de gens me suivent, qu'est-ce que je
   peux faire, qu'est-ce qu'on dit de moi.
============================================================ */

export function renderReseaux(){
  const f = followers();
  const palier = paliersSocial();
  const s = state.social || {posts:[], postsTotal:0};
  const attente = postCooldownRestant();

  return `
  <div class="grid g2" style="align-items:start">
    <div>
      ${renderAudience(f, palier, s)}
      ${renderActions(attente)}
    </div>
    <div>
      ${renderFil(s)}
      ${renderPresse()}
    </div>
  </div>`;
}

function renderAudience(f, palier, s){
  return `
  <div class="card">
    <div class="spread">
      <h2 style="margin:0">📱 Votre audience</h2>
      <span class="pill">${palier.icone} ${esc(palier.nom)}</span>
    </div>
    <div class="social-count">${formatFollowers(f)}</div>
    <div class="small muted">abonnés, tous réseaux confondus</div>
    <div class="divider"></div>
    <div class="small muted">
      Votre audience suit ce que vaut le label : elle monte avec la notoriété,
      les streams et la crédibilité. Publier permet de la pousser à la main —
      dans un sens comme dans l'autre.
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="stat"><div class="l">Publications</div><div class="v">${s.postsTotal || 0}</div></div>
      <div class="stat"><div class="l">Gagnés en publiant</div><div class="v ${(s.bonusAbonnes||0) >= 0 ? "good" : "bad"}">${(s.bonusAbonnes||0) >= 0 ? "+" : ""}${formatFollowers(Math.abs(Math.round(s.bonusAbonnes||0)))}</div></div>
    </div>
  </div>`;
}

function renderActions(attente){
  const ids = Object.keys(ACTIONS_SOCIAL);
  return `
  <div class="card" style="margin-top:12px">
    <div class="spread">
      <h2 style="margin:0">✍️ Publier</h2>
      ${attente > 0
        ? `<span class="pill warn">Encore ${attente} ép.</span>`
        : `<span class="pill good">Prêt</span>`}
    </div>
    <div class="small muted" style="margin-top:4px">
      Une publication tous les ${COOLDOWN_POST} épisodes — au-delà, on vous
      lit moins. Chaque option est un pari : la portée n'est jamais garantie.
    </div>
    <div class="divider"></div>
    <div class="optgrid">
      ${ids.map(id=>{
        const a = ACTIONS_SOCIAL[id];
        const bloqueDelai = attente > 0;
        const bloqueExige = a.exige && !a.exige();
        const bloqueCout = a.cout && state.argent < a.cout;
        const lock = bloqueDelai || bloqueExige || bloqueCout;
        const raison = bloqueDelai ? `Encore ${attente} épisode(s)`
                     : bloqueExige ? a.exigeTexte
                     : bloqueCout ? "Trésorerie insuffisante"
                     : "";
        return `
        <button class="opt ${lock ? "locked" : ""}" ${lock ? "disabled" : ""}
                data-action="publier" data-args='${JSON.stringify([id])}'
                title="${esc(raison)}">
          <div class="n">${a.icone} ${esc(a.nom)}</div>
          <div class="d">${esc(a.desc)}</div>
          <div class="impacts">
            ${a.cout ? `<span class="impact-chip neg">€ -${fmt(a.cout)}</span>` : `<span class="impact-chip">Gratuit</span>`}
            ${lock ? `<span class="impact-chip risk">${esc(raison)}</span>` : ``}
          </div>
        </button>`;
      }).join("")}
    </div>
  </div>`;
}

function renderFil(s){
  const posts = s.posts || [];
  if(!posts.length){
    return `
    <div class="card">
      <h2>🧵 Le fil</h2>
      <p class="muted small">Rien pour l'instant. Vos publications et les réactions
      du public à vos sorties apparaîtront ici.</p>
    </div>`;
  }
  return `
  <div class="card">
    <h2>🧵 Le fil</h2>
    <div class="social-feed">
      ${posts.map(p=>`
        <div class="social-post ${p.bon === false ? "flop" : p.bon === true ? "hit" : ""}">
          <div class="social-post-head">
            <span class="social-post-auteur">${p.icone || "💬"} ${esc(p.auteur || "")}</span>
            <span class="tiny muted">S${p.saison}·É${p.chapitre}</span>
          </div>
          <div class="social-post-texte">${esc(p.texte)}</div>
          ${p.citation ? `<div class="social-post-cite">« ${esc(p.citation)} »${p.citationSrc ? ` <span class="tiny muted">— ${esc(p.citationSrc)}</span>` : ``}</div>` : ``}
          ${p.resultat ? `<div class="social-post-res ${p.bon ? "good" : "bad"}">${esc(p.resultat)}</div>` : ``}
          <div class="social-post-pied">
            <span class="tiny muted">💬 ${formatFollowers(p.reactions || 0)} réactions</span>
            ${p.gainAbonnes !== undefined
              ? `<span class="tiny ${p.gainAbonnes >= 0 ? "good" : "bad"}">${p.gainAbonnes >= 0 ? "+" : ""}${formatFollowers(Math.abs(p.gainAbonnes))} abonnés</span>`
              : ``}
          </div>
        </div>
      `).join("")}
    </div>
  </div>`;
}

function renderPresse(){
  const avis = revuePresse();
  if(!avis.length){
    return `
    <div class="card" style="margin-top:12px">
      <h2>📰 Revue de presse</h2>
      <p class="muted small">Aucun média n'a encore chroniqué vos sorties.
      Sortez de la musique et la presse finira par en parler.</p>
    </div>`;
  }
  return `
  <div class="card" style="margin-top:12px">
    <h2>📰 Revue de presse</h2>
    <div class="social-feed">
      ${avis.slice(0,14).map(v=>`
        <div class="social-presse">
          <div class="spread">
            <span class="social-presse-src">${esc(v.src)}</span>
            <span class="pill ${v.note >= 7 ? "good" : v.note >= 4 ? "" : "bad"}">${v.note}/10</span>
          </div>
          <div class="social-post-texte">« ${esc(v.txt)} »</div>
          <div class="tiny muted">à propos de « ${esc(v.titre)} »${v.artiste ? ` · ${esc(v.artiste)}` : ``}</div>
        </div>
      `).join("")}
    </div>
  </div>`;
}
