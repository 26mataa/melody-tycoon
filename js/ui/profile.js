import { notify } from "../notify.js";
import { app, safeRender } from "../render.js";
import { canCreate, save, startGame, state } from "../state.js";
import { esc, fmt, pick, rint } from "../utils.js";
import { DATA } from "../data.js";

/* ============================================================
   CRÉATION DU LABEL — deux étapes, pas une de plus.
   1. Qui vous êtes + d'où vous partez.
   2. À quoi vous ressemblez.

   Le point de départ est toujours le même mécaniquement (50€, aucun
   artiste, Mamie qui dépanne) mais son histoire change à chaque fois :
   c'est la même logique roguelite que les graines narratives.
============================================================ */

function flavorCourant(){
  const pool = DATA.START_FLAVORS || [];
  if(!pool.length) return {icon:"🎬", name:"Le grand saut", desc:"Vous partez avec 50€ et rien d'autre."};
  if(!state.startFlavor || state.startFlavor.index === undefined || !pool[state.startFlavor.index]){
    state.startFlavor = {index: rint(0, pool.length-1)};
  }
  return pool[state.startFlavor.index];
}

export function rerollStart(){
  const pool = DATA.START_FLAVORS || [];
  if(pool.length < 2) return;
  const actuel = state.startFlavor ? state.startFlavor.index : -1;
  let i = actuel;
  while(i === actuel) i = rint(0, pool.length-1);
  state.startFlavor = {index:i};
  safeRender();
}

/* ============================================================
   LE MODE ADMIN N'EST PLUS UNE CASE À COCHER.
   Il faut taper dix fois sur le mot "label" du titre pour le trouver.
   Le compteur vit ici, pas dans l'état : c'est un geste, pas une
   donnée de partie, et il ne doit rien laisser derrière lui.
============================================================ */
const TAPS_REQUIS = 10;
let taps = 0;
let tapsTimer = null;

export function tapSecret(){
  if(state.startId === "admin") return;
  taps++;
  // Le compteur retombe si le joueur s'arrête en route.
  clearTimeout(tapsTimer);
  tapsTimer = setTimeout(()=>{ taps = 0; }, 2500);

  if(taps >= TAPS_REQUIS){
    taps = 0;
    state.startId = "admin";
    notify("🛠️ Bravo, tu viens de trouver le mode admin.");
    safeRender();
    return;
  }
  // On ne dit rien avant la moitié : il faut vraiment insister.
  const reste = TAPS_REQUIS - taps;
  if(reste <= 4) notify(`Encore ${reste}...`);
}

export function quitAdmin(){
  state.startId = "zero";
  taps = 0;
  safeRender();
}

/* ============================================================
   ÉTAPE 1 — identité et point de départ
============================================================ */

export function renderProfile(){
  const f = flavorCourant();
  const ok = canCreate();
  const isAdmin = state.startId === "admin";
  const admin = DATA.START_OPTIONS.find(o=>o.id === "admin");

  app.innerHTML = `
  <div class="onboard">
    <div class="onboard-head">
      <div class="onboard-title">Créer votre <span class="secret-tap" data-action="tapSecret">label</span></div>
      <div class="onboard-steps">
        <span class="ostep on">1<i>Identité</i></span>
        <span class="ostep-line"></span>
        <span class="ostep">2<i>Personnage</i></span>
      </div>
    </div>

    <div class="onboard-card">
      <div class="ofield-row">
        <label class="ofield">
          <span class="ofield-label">Nom du manager</span>
          <input type="text" id="inManager" placeholder="Alex Rivera" value="${esc(state.managerName||"")}" data-oninput="onManagerInput" autocomplete="off">
        </label>
        <label class="ofield">
          <span class="ofield-label">Nom du label</span>
          <input type="text" id="inLabel" placeholder="Nova Records" value="${esc(state.label||"")}" data-oninput="onLabelInput" autocomplete="off">
        </label>
      </div>
      <div id="formMsg" class="ofield-msg" style="display:${ok?"none":"block"}">Il faut un nom de manager et un nom de label pour continuer.</div>

      <div class="osection">
        <div class="osection-head">
          <span class="osection-label">D'où vous partez</span>
          <button class="reroll" data-action="rerollStart" title="Une autre histoire de départ"><span class="de">🎲</span></button>
        </div>

        ${isAdmin ? `
          <div class="start-hero admin">
            <div class="start-hero-icon">${admin.icon}</div>
            <div class="start-hero-body">
              <div class="start-hero-name">${admin.name}</div>
              <div class="start-hero-desc">${admin.desc}</div>
              <div class="start-hero-pills">
                <span class="pill">Argent illimité</span>
                <span class="pill">Tout débloqué</span>
                <span class="pill pve">Mode test</span>
              </div>
            </div>
          </div>
          <button class="ghost small" style="margin-top:10px" data-action="quitAdmin">Revenir à une vraie partie</button>
        ` : `
          <div class="start-hero">
            <div class="start-hero-icon">${f.icon}</div>
            <div class="start-hero-body">
              <div class="start-hero-name">${esc(f.name)}</div>
              <div class="start-hero-desc">${esc(f.desc)}</div>
              <div class="start-hero-pills">
                <span class="pill">${fmt(50)} en poche</span>
                <span class="pill">Aucun artiste</span>
                <span class="pill">👵 Mamie dépanne</span>
              </div>
            </div>
          </div>
          <p class="osection-note">Toutes les parties commencent avec les mêmes moyens. Jamais avec la même histoire.</p>
        `}
      </div>

      <button id="startBtn" class="primary obtn" ${ok?"":"disabled"} data-action="goLookStep">Continuer</button>
    </div>
  </div>`;
}

/* ============================================================
   ÉTAPE 2 — le personnage
============================================================ */

function lookHint(){
  const pool = DATA.LOOK_PLACEHOLDERS || ["mon poto"];
  if(!state.lookHint || !pool.includes(state.lookHint)) state.lookHint = pick(pool);
  return state.lookHint;
}

export function rerollLookHint(){
  const pool = DATA.LOOK_PLACEHOLDERS || [];
  if(pool.length < 2) return;
  let h = state.lookHint;
  while(h === state.lookHint) h = pick(pool);
  state.lookHint = h;
  safeRender();
}

export function goLookStep(){
  if(!canCreate()) return notify("Il faut un nom de manager et un nom de label.");
  state.screen = "look";
  safeRender();
}

export function handleAvatarUpload(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(ev){
    const img = new Image();
    img.onload = function(){
      const size = 240;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      const scale = Math.max(size/img.width, size/img.height);
      const w = img.width*scale, h = img.height*scale;
      ctx.drawImage(img, (size-w)/2, (size-h)/2, w, h);
      state.avatarPhoto = canvas.toDataURL("image/jpeg", 0.85);
      safeRender();
      save();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

export function clearAvatar(){
  state.avatarPhoto = null;
  safeRender();
}

export function renderLookStep(){
  const hint = lookHint();

  app.innerHTML = `
  <div class="onboard">
    <div class="onboard-head">
      <div class="onboard-title">Votre <span>personnage</span></div>
      <div class="onboard-steps">
        <span class="ostep done" data-action="setState" data-args='${JSON.stringify(["screen","profile"])}'>1<i>Identité</i></span>
        <span class="ostep-line on"></span>
        <span class="ostep on">2<i>Personnage</i></span>
      </div>
    </div>

    <div class="onboard-card">
      <div class="avatar-block">
        <label class="avatar-drop ${state.avatarPhoto?"filled":""}">
          ${state.avatarPhoto ? `<img src="${state.avatarPhoto}" alt="">` : `<span class="avatar-drop-icon">🧑‍🎤</span><span class="avatar-drop-txt">Ajouter<br>une photo</span>`}
          <input type="file" accept="image/*" data-onchange-element="handleAvatarUpload">
        </label>
        <div class="avatar-side">
          <div class="avatar-side-title">Photo de profil</div>
          <div class="tiny muted">Facultatif. Recadrée en carré et allégée automatiquement — rien ne quitte votre navigateur.</div>
          ${state.avatarPhoto ? `<button class="ghost small" style="margin-top:8px" data-action="clearAvatar">Retirer la photo</button>` : ``}
        </div>
      </div>

      <div class="osection">
        <div class="osection-head">
          <span class="osection-label">À quoi vous ressemblez</span>
          <button class="reroll" data-action="rerollLookHint" title="Une autre suggestion"><span class="de">🎲</span></button>
        </div>
        <label class="ofield">
          <input type="text" id="lookInput" placeholder="Comme ${esc(hint)}" value="${esc(state.look||"")}" data-oninput-set="look" autocomplete="off">
        </label>
        <p class="osection-note">Deux mots suffisent. Ça n'a aucun effet sur le jeu, c'est juste vous.</p>
      </div>

      <div class="obtn-row">
        <button class="ghost" data-action="setState" data-args='${JSON.stringify(["screen","profile"])}'>Retour</button>
        <button class="primary obtn" data-action="startGame">Fonder le label</button>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   SAISIE — on ne re-rend pas à chaque frappe, on ajuste juste
   l'état du bouton et du message.
============================================================ */

export function onManagerInput(v){
  state.managerName = v;
  updateStartBtn();
}

export function onLabelInput(v){
  state.label = v;
  updateStartBtn();
}

export function updateStartBtn(){
  const btn = document.getElementById("startBtn");
  const msg = document.getElementById("formMsg");
  const ok = canCreate();
  if(btn) btn.disabled = !ok;
  if(msg) msg.style.display = ok ? "none" : "block";
}

export function selectStart(id){
  state.startId = id;
  safeRender();
}
