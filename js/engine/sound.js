import { state } from "../state.js";

/* ============================================================
   SON — synthétisé en direct (Web Audio), aucun fichier à charger.
   Un petit clavier de primitives (tone/sweep/noiseHit/chord) et un
   catalogue de sons nommés au-dessus, pour que le reste du jeu se
   contente d'appeler playSound("argentGagne") sans jamais savoir
   comment le son est fabriqué.

   Règles :
   - Ne doit JAMAIS faire planter le jeu : tout est en try/catch, et
     l'API se comporte comme un no-op silencieux si l'audio n'est pas
     disponible ou si le joueur a coupé le son.
   - Le AudioContext ne démarre qu'au premier geste utilisateur (règle
     des navigateurs) : on le crée à la demande, jamais au chargement.
   - Volume doux par défaut (ce n'est pas un jeu d'arcade) : chaque son
     dure peu, pas de basses agressives, tout reste sous le seuil qui
     couvrirait la musique ou la voix de quelqu'un à côté.
============================================================ */

let ctx = null;
let master = null;

function getCtx(){
  if(ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

/* Le premier clic de la page ressuscite un contexte suspendu — appelé une
   fois depuis dispatch.js sur le tout premier geste, sans effet ensuite. */
export function unlockAudio(){
  try{
    const c = getCtx();
    if(c && c.state === "suspended") c.resume();
  }catch(e){}
}

export function isSoundOn(){
  return !!(state && state.ui && state.ui.soundOn !== false);
}

export function toggleSound(){
  if(!state.ui) return;
  state.ui.soundOn = !isSoundOn();
  if(state.ui.soundOn) unlockAudio();
}

/* ============================================================
   PRIMITIVES — de quoi construire n'importe quel petit son.
============================================================ */

function now(){ return ctx.currentTime; }

/* Une note simple : rampe d'amplitude douce (jamais de clic à l'attaque
   ni à la coupure), fréquence fixe ou glissée vers `slideTo`. */
function tone(freq, dur, {type="sine", gain=0.22, delay=0, slideTo=null, detune=0} = {}){
  const t0 = now() + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.detune.value = detune;
  if(slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1,slideTo), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.015, dur/4));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/* Plusieurs notes ensemble (accord) — pour les moments un peu plus riches
   (signature d'artiste, sortie réussie) sans que ce soit lourd. */
function chord(freqs, dur, opts={}){
  freqs.forEach((f,i)=>tone(f, dur, {...opts, delay:(opts.delay||0) + i*0.012, gain:(opts.gain||0.22) * (1 - i*0.12)}));
}

/* Une mélodie très courte : notes successives, chacune avec sa propre durée
   relative — pour les moments qui méritent un vrai petit motif (retraite,
   game over, fin de saison) plutôt qu'un simple bip. */
function motif(notes, {type="sine", gain=0.2, step=0.11} = {}){
  notes.forEach((f,i)=>tone(f, step*1.6, {type, gain, delay:i*step}));
}

/* Bruit filtré, pour les impacts secs (échec, alerte, crash) plutôt que
   les tons mélodiques ci-dessus. */
function noiseHit(dur, {freq=900, gain=0.18, delay=0} = {}){
  const t0 = now() + delay;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filt = ctx.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t0);
}

/* ============================================================
   CATALOGUE — un nom par situation de jeu. Palette pentatonique douce
   (do-ré-mi-sol-la) pour que rien ne sonne jamais faux ensemble, quel
   que soit l'ordre dans lequel les sons se déclenchent.
============================================================ */
const C5=523.25, D5=587.33, E5=659.25, G5=783.99, A5=880.00, C6=1046.5, E6=1318.5, G6=1568.0;
const A3=220.00, C4=261.63, D4=293.66, E4=329.63, G4=392.00, A4=440.00;

const CATALOGUE = {
  // Navigation légère : un tout petit tic, seulement sur les actions qui
  // font vraiment avancer la partie (pas sur chaque clic de menu).
  clic: ()=>tone(A4, 0.05, {type:"triangle", gain:0.08}),

  // Un choix narratif se résout : succès net / échec doux (jamais punitif).
  choixSucces: ()=>chord([C5,E5,G5], 0.5, {type:"triangle", gain:0.16}),
  choixEchec:  ()=>{ tone(A3, 0.22, {type:"sine", gain:0.16}); tone(G4, 0.28, {type:"sine", gain:0.1, delay:0.05, slideTo:D4}); },
  choixNeutre: ()=>tone(C5, 0.16, {type:"sine", gain:0.14}),

  // Argent : montée courte quand ça rentre, descente sourde quand ça sort.
  argentGagne: ()=>tone(C5, 0.16, {type:"triangle", gain:0.16, slideTo:G5}),
  argentPerdu: ()=>tone(G4, 0.18, {type:"sine", gain:0.14, slideTo:C4}),

  // Notification bloquante (notify()) : un petit "non" discret, pas alarmant.
  refus: ()=>tone(D4, 0.09, {type:"square", gain:0.07}),

  // Recrutement / signature de contrat : le plus beau petit motif du jeu,
  // c'est un moment fort (premier artiste, en particulier).
  signature: ()=>motif([C5,E5,G5,C6], {type:"triangle", gain:0.19, step:0.09}),

  // Sortie d'un projet : un vrai petit "ta-da", modulé par la qualité —
  // meilleur son pour un hit, plus terne pour un flop.
  sortieHit:  ()=>motif([E5,G5,C6,E6], {type:"triangle", gain:0.2, step:0.08}),
  sortieFlop: ()=>{ tone(E4, 0.3, {type:"sine", gain:0.13, slideTo:C4}); },
  sortieOk:   ()=>chord([C5,E5], 0.3, {type:"sine", gain:0.15}),

  // Mamie : chaleureux, familier — une petite tierce qui monte.
  mamie: ()=>chord([E5,G5], 0.35, {type:"sine", gain:0.17}),

  // Mix final (QTE) : trois issues bien différenciées au clic.
  mixParfait: ()=>chord([C5,E5,G5,C6], 0.35, {type:"triangle", gain:0.2}),
  mixCorrect: ()=>tone(E5, 0.18, {type:"triangle", gain:0.16}),
  mixRate:    ()=>noiseHit(0.14, {freq:400, gain:0.16}),

  // Passage de saison : cadence descendante, façon générique de fin d'épisode.
  finSaison: ()=>motif([G5,E5,C5], {type:"sine", gain:0.17, step:0.14}),

  // Crise financière : tendu mais pas violent.
  crise: ()=>{ tone(D4, 0.35, {type:"sawtooth", gain:0.09, slideTo:A3}); noiseHit(0.2, {freq:250, gain:0.08, delay:0.05}); },

  // Game over : le seul moment vraiment sombre du jeu.
  gameOver: ()=>{ motif([G4,E4,D4,C4], {type:"sine", gain:0.18, step:0.22}); noiseHit(0.5, {freq:180, gain:0.1, delay:0.05}); },

  // Retraite choisie : chaleureux, résolu, jamais triste — c'est une victoire.
  retraite: ()=>motif([C5,E5,G5,C6,G5,C6], {type:"triangle", gain:0.18, step:0.1}),

  // Un nouvel épisode s'affiche : à peine audible, juste une respiration.
  episode: ()=>tone(G4, 0.06, {type:"sine", gain:0.05})
};

/* API publique : jamais d'exception qui remonte au jeu, jamais de son si
   le joueur a coupé le son ou si l'audio n'est simplement pas disponible. */
export function playSound(name){
  if(!isSoundOn()) return;
  const fn = CATALOGUE[name];
  if(!fn) return;
  try{
    const c = getCtx();
    if(!c) return;
    if(c.state === "suspended") return; // pas encore débloqué par un geste utilisateur
    fn();
  }catch(e){}
}
