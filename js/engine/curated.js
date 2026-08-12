import { rA } from "./artists.js";
import { adaptCost } from "./economy.js";
import { state } from "../state.js";
import { clamp, fmt, pick, rand, rint } from "../utils.js";
import { DATA } from "../data.js";

/* ============================================================
   BASE D'ÉVÉNEMENTS FOURNIE — 126 situations distinctes + 26
   situations paramétrées (data/events.json).

   Le contenu ne donne que le texte et les intitulés de choix. Les
   conséquences sont DÉRIVÉES ici, pas écrites une par une :
     - la CATÉGORIE dit quelles jauges sont en jeu et à quelle force
       (un scandale touche la réputation, une crise touche l'argent) ;
     - la POSTURE du choix ("Assumer", "S'excuser", "Payer"...) dit
       dans quel sens et de combien.

   C'est volontaire : ça garantit qu'une réponse "Assumer" a toujours
   le même sens dans tout le jeu, et ça permettra d'ajouter du contenu
   plus tard sans réécrire de bilans à la main. Les valeurs restent
   des points de départ, faciles à réajuster ici en un seul endroit.
============================================================ */

/* Ce que chaque catégorie met en jeu. `axes` limite les jauges touchées,
   `force` module l'amplitude, `tier` borne le palier économique, et
   `stage` dit à partir de quel JALON VÉCU la catégorie a seulement du
   sens (voir stages.js : 0 = rien encore, 1 = un artiste signé,
   2 = une sortie publiée, 3 = un vrai succès, 4 = label installé).

   C'est ce `stage` qui règle le problème de fond : on ne demande pas à
   un joueur qui n'a encore rien signé de gérer une crise financière
   mondiale, une enquête des services secrets ou une guerre de labels.
   Ces situations existent toujours — elles arrivent quand le joueur a
   quelque chose à perdre. */
const CATEGORIES = {
  // Vie personnelle : ça arrive à n'importe qui, dès le premier jour.
  "6_sante_accidents":          {axes:["moral","argent","reputation"],    force:1.0, tier:[0,5], stage:0, emoji:"🏥"},
  "7_histoires_amour":          {axes:["moral","buzz","popularite"],      force:0.8, tier:[0,5], stage:0, emoji:"💞"},
  "8_situations_absurdes":      {axes:["buzz","popularite","reputation"], force:0.8, tier:[0,5], stage:0, emoji:"🤯"},

  // Il faut une équipe : des salaires, des egos, des contrats, un studio.
  "3_argent_scams":             {axes:["argent","reputation","reseau"],   force:1.0, tier:[0,5], stage:1, emoji:"💰"},
  "5_relations_drames_internes":{axes:["moral","reseau","buzz"],          force:1.0, tier:[1,5], stage:1, emoji:"💔", needsRoster:true},
  "12_production_projets":      {axes:["argent","reputation","moral"],    force:0.9, tier:[0,5], stage:1, emoji:"🎛️", needsRoster:true},
  "13_contrats_negociations":   {axes:["reseau","argent","reputation"],   force:1.0, tier:[1,5], stage:1, emoji:"📄", needsRoster:true},

  // Il faut que quelque chose existe publiquement pour qu'on réagisse,
  // et de vraies charges pour qu'une crise d'argent veuille dire quelque chose.
  "11_reseaux_sociaux_medias":  {axes:["buzz","popularite","reputation"], force:1.0, tier:[0,5], stage:2, emoji:"📱"},
  "10_finances_crises":         {axes:["argent","reputation","reseau"],   force:1.3, tier:[0,5], stage:2, emoji:"🏦", needsRoster:true},

  // Il faut compter dans le paysage : on ne salit et on ne défie que
  // quelqu'un qui a déjà réussi quelque chose.
  "2_scandales_sexuels":        {axes:["reputation","buzz","popularite"], force:1.3, tier:[1,5], stage:3, emoji:"🚨"},
  "4_rivaux_competition":       {axes:["buzz","reseau","popularite"],     force:1.0, tier:[1,5], stage:3, emoji:"⚔️"},

  // On ne vient chercher que les structures installées pour ça.
  "1_politique_extremes":       {axes:["reputation","buzz","popularite"], force:1.2, tier:[0,5], stage:4, emoji:"🗳️"},
  "9_complots_services_secrets":{axes:["reseau","buzz","reputation"],     force:1.1, tier:[2,5], stage:4, emoji:"🕵️"}
};
/* needsRoster : catégories dont TOUTES les situations supposent un artiste
   sous contrat À CET INSTANT, même les quelques entrées qui ne mentionnent
   pas {artiste} dans leur texte ("Le studio brûle", "Le titre déjà pris",
   "les salaires ne sont pas tombés"...). Le jalon dit « ce chapitre de
   votre vie a commencé », ce drapeau dit « il y a quelqu'un à nommer là,
   maintenant » : les deux sont nécessaires, ils ne répondent pas à la
   même question. Les autres catégories restent gérées entrée par entrée
   via {artiste} dans le texte. */

/* Reconnaissance de la posture d'un choix, d'après son intitulé.
   L'ordre compte : la première expression qui matche gagne. */
const POSTURES = [
  [/s'excuser|excuse|pardon/i,                                   "excuse"],
  [/assumer|revendiquer|confirmer|avouer/i,                      "assume"],
  [/d[ée]mentir|nier|supprimer|effacer|cacher|[ée]touffer/i,     "nier"],
  [/porter plainte|justice|avocat|attaquer|poursuivre/i,         "justice"],
  [/payer|rembourser|indemniser|d[ée]dommager|faire taire/i,     "payer"],
  [/n[ée]gocier|discuter|dialoguer|arranger|m[ée]dier/i,         "negocier"],
  [/licencier|virer|renvoyer|remplacer|rompre|r[ée]silier|annuler/i, "rompre"],
  [/soutenir|d[ée]fendre|prot[ée]ger|aider|accompagner|recadrer/i,  "soutenir"],
  [/clip|buzz|exploiter|profiter|surfer|disstrack|capitaliser/i, "exploiter"],
  [/refuser|dissuader|d[ée]cliner|s'opposer/i,                   "refuser"],
  [/accepter|signer|dire oui/i,                                  "accepter"],
  [/ignorer|ne rien|laisser|neutre|attendre|se taire/i,          "ignorer"],
  [/expliquer|communiquer|clarifier|conf[ée]rence|transparen/i,  "communiquer"]
];

/* Sens et force de chaque posture, par jauge. 0 = la posture ne touche
   pas cette jauge. `pari` marque les postures intrinsèquement risquées :
   elles deviennent un tirage plutôt qu'un résultat garanti. */
const EFFETS = {
  excuse:      {reputation: 1.0, buzz:-0.7, popularite:-0.3, reseau: 0.3, argent: 0,   moral: 0.4, txt:"Vous présentez des excuses publiques"},
  assume:      {reputation:-0.7, buzz: 1.3, popularite: 0.5, reseau:-0.2, argent: 0,   moral: 0.3, txt:"Vous assumez sans reculer"},
  nier:        {reputation:-0.5, buzz: 0.4, popularite:-0.2, reseau: 0,   argent: 0,   moral:-0.2, txt:"Vous démentez en bloc", pari:true},
  justice:     {reputation: 0.9, buzz: 0.3, popularite: 0,   reseau:-0.4, argent:-0.8, moral: 0.3, txt:"Vous portez l'affaire en justice", pari:true},
  payer:       {reputation: 0.4, buzz:-0.6, popularite: 0,   reseau: 0.3, argent:-1.2, moral: 0.2, txt:"Vous sortez le carnet de chèques"},
  negocier:    {reputation: 0.3, buzz: 0,   popularite: 0,   reseau: 0.9, argent:-0.3, moral: 0.3, txt:"Vous négociez une sortie honorable"},
  rompre:      {reputation:-0.3, buzz: 0.2, popularite: 0,   reseau:-0.6, argent: 0.4, moral:-1.1, txt:"Vous tranchez dans le vif"},
  soutenir:    {reputation: 0.5, buzz: 0.2, popularite: 0.1, reseau: 0.5, argent:-0.2, moral: 1.1, txt:"Vous prenez fait et cause"},
  exploiter:   {reputation:-0.6, buzz: 1.4, popularite: 0.6, reseau: 0,   argent: 0.3, moral:-0.2, txt:"Vous transformez ça en carburant médiatique", pari:true},
  refuser:     {reputation: 0.5, buzz:-0.3, popularite: 0,   reseau:-0.7, argent: 0,   moral: 0,   txt:"Vous refusez tout net"},
  accepter:    {reputation:-0.2, buzz: 0.3, popularite: 0.1, reseau: 0.8, argent: 0.7, moral: 0,   txt:"Vous acceptez"},
  ignorer:     {reputation:-0.3, buzz:-0.2, popularite: 0,   reseau: 0,   argent: 0,   moral:-0.2, txt:"Vous laissez passer sans réagir"},
  communiquer: {reputation: 0.8, buzz: 0.3, popularite: 0.1, reseau: 0.4, argent:-0.1, moral: 0.2, txt:"Vous mettez les choses au clair publiquement"},
  neutre:      {reputation: 0.1, buzz: 0.1, popularite: 0,   reseau: 0.1, argent: 0,   moral: 0,   txt:"Vous faites au mieux"}
};

function posturePour(libelle){
  for(const [re, key] of POSTURES){ if(re.test(libelle)) return key; }
  return "neutre";
}

/* Traduit une posture en deltas concrets, filtrés par les axes de la
   catégorie : un scandale ne fera jamais bouger la trésorerie si la
   catégorie ne met pas l'argent en jeu. */
function deltasPour(posture, cat){
  const e = EFFETS[posture] || EFFETS.neutre;
  const d = {};
  const base = 3 * cat.force * rand(.85, 1.2);

  ["reputation","buzz","popularite","reseau"].forEach(axe=>{
    if(!cat.axes.includes(axe) || !e[axe]) return;
    const v = Math.round(base * e[axe]);
    if(v !== 0) d[axe] = clamp(v, -12, 12);
  });

  if(cat.axes.includes("argent") && e.argent){
    const ampleur = Math.abs(e.argent) >= 1 ? "moyen" : "petit";
    const somme = Math.round(adaptCost(ampleur) * Math.abs(e.argent));
    d.argent = e.argent > 0 ? somme : -somme;
  }

  return d;
}

/* Le moral n'est pas une jauge globale : il vit chez chaque artiste.
   On le passe donc par un fn(), pas par impact(). */
function moralFn(posture, cat, artiste){
  const e = EFFETS[posture] || EFFETS.neutre;
  if(!cat.axes.includes("moral") || !e.moral) return null;
  const delta = Math.round(4 * cat.force * e.moral);
  if(!delta) return null;
  return ()=>{
    const cible = artiste ? state.signed.find(a=>a.id === artiste.id) : null;
    if(cible) cible.humeur = clamp(cible.humeur + delta, 0, 100);
    else state.signed.forEach(a=>{ a.humeur = clamp(a.humeur + Math.round(delta/2), 0, 100); });
  };
}

function construireChoix(libelleSource, cat, artiste){
  // La posture se lit sur le texte source (stable), mais le bouton affiché
  // au joueur est rempli avec les vraies données : « Virer {artiste} »
  // doit s'afficher avec le nom de la personne concernée.
  const posture = posturePour(libelleSource);
  const libelle = remplir(libelleSource, artiste);
  const e = EFFETS[posture] || EFFETS.neutre;
  const fn = moralFn(posture, cat, artiste);
  const reason = `${cat.emoji} ${e.txt}.`;

  // Les postures risquées deviennent un pari : même intention, résultat incertain.
  if(e.pari){
    const succes = deltasPour(posture, cat);
    const echec = {};
    Object.keys(succes).forEach(k=>{
      echec[k] = k === "argent" ? Math.round(-Math.abs(succes[k]) * .6) : -Math.abs(succes[k]);
    });
    return {
      t: libelle,
      p: .5,
      posture,
      sD: succes, fD: echec,
      sFn: fn, fFn: null,
      sMsg: "Ça passe.", fMsg: "Ça ne passe pas.",
      sReason: reason + " Et ça marche.",
      fReason: reason + " Ça se retourne contre vous."
    };
  }

  return {t: libelle, d: deltasPour(posture, cat), fn, reason, posture};
}

/* ============================================================
   SUBSTITUTION — l'épisode parle de VOTRE partie.

   Le texte source est écrit en générique ("le label", "votre artiste").
   Lu tel quel, il sonne systématiquement à côté de la partie en cours.
   On y injecte donc les vraies données du moment : le nom de l'artiste
   concerné, un titre réellement sorti, le vrai label rival, le nom du
   label, un montant à l'échelle de la trésorerie du joueur.

   Toutes les valeurs ont une porte de sortie : si la partie n'a pas
   encore de sortie ou de rival, le marqueur est remplacé par une
   tournure qui reste juste, jamais par un trou ni par un "{titre}" brut
   affiché à l'écran.
============================================================ */

function unTitreReel(){
  const rel = (state.releases || []).filter(r=>r.title);
  if(!rel.length) return null;
  // On privilégie les sorties encore vivantes : c'est d'elles qu'on parle.
  const vivantes = rel.filter(r=>!r.fini);
  return pick(vivantes.length ? vivantes : rel).title;
}

function unRivalReel(){
  const riv = state.rivals || [];
  if(!riv.length) return null;
  // Le rival le plus remonté contre vous est le plus crédible dans un texte.
  const tries = riv.slice().sort((a,b)=>(b.aggro||0)-(a.aggro||0));
  return (tries[0] && tries[0].name) || null;
}

/* La base source est écrite en générique. Avant toute substitution, on
   convertit ses tournures passe-partout en marqueurs, pour que la suite
   les remplisse avec les vraies données de la partie : « le label »
   devient le nom que le joueur a choisi, « un label rival » devient le
   concurrent qui lui en veut vraiment. Sans ça, l'histoire raconte
   n'importe quel label sauf le sien. */
function normaliser(texte){
  return String(texte)
    .replace(/\b(?:votre pire rival|un label rival|un rival|un label concurrent|un concurrent)\b/gi, "{rival}")
    .replace(/\ble label\b/g, "{label}")
    .replace(/\bvotre label\b/g, "{label}");
}

export function remplir(texte, artiste, mot){
  let t = normaliser(texte);

  /* {mot} EN PREMIER, et c'est important : certains mots de gabarit
     contiennent eux-mêmes un marqueur ("Un imposteur se faisant passer
     pour {artiste}"). Injecté après coup, ce marqueur-là n'était plus
     substitué et s'affichait tel quel à l'écran. */
  if(mot !== undefined) t = t.replace(/\{mot\}/g, mot);

  t = t.replace(/\{artiste\}/g, artiste ? artiste.name : "votre artiste");
  t = t.replace(/\{label\}/g, state.label || "votre label");

  const titre = unTitreReel();
  t = t.replace(/« ?\{titre\} ?»/g, titre ? `« ${titre} »` : "votre dernier son");
  t = t.replace(/\{titre\}/g, titre ? `« ${titre} »` : "votre dernier son");

  const rival = unRivalReel();
  t = t.replace(/\{rival\}/g, rival || "un label concurrent");

  const bm = (state.beatmakers || [])[0];
  t = t.replace(/\{beatmaker\}/g, bm ? bm.name : "votre beatmaker");

  // Un montant cité dans un texte doit rester crédible face à la trésorerie
  // du joueur : 50 000 € n'a aucun sens quand on en a 300 sur le compte.
  t = t.replace(/\{montant\}/g, ()=>fmt(adaptCost("moyen")));
  t = t.replace(/\{petitmontant\}/g, ()=>fmt(adaptCost("petit")));

  return t;
}

/* Les situations paramétrées n'ont pas de titre dans la base : un titre
   générique commun les ferait toutes se ressembler à l'écran alors que
   leur contenu diffère. On en dérive donc un depuis la phrase remplie,
   pour que chaque variante s'annonce différemment. */
function titreDepuisDesc(desc){
  let t = String(desc).split(/[.!?]/)[0].trim();
  if(t.length > 58){
    const coupe = t.slice(0, 58);
    const espace = coupe.lastIndexOf(" ");
    t = (espace > 24 ? coupe.slice(0, espace) : coupe) + "…";
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* Quelques situations sont écrites à une échelle qui dépasse leur
   catégorie : une chaîne nationale, un ministre, une tournée mondiale ne
   s'adressent pas à un label qui vient de sortir son premier son. Plutôt
   que de reclasser 254 entrées une par une, on relève le jalon des seules
   qui emploient ce vocabulaire-là. */
const MOTS_GRANDE_ECHELLE = /\b(mondial|international|gouvernement|ministre|pr[ée]sident|nations unies|arm[ée]e|milliardaire|multinational|stade de france|grammy|victoires de la musique)\w*/i;

function stagePour(cat, ev){
  const texte = `${ev.title || ""} ${ev.desc || ""}`;
  const base = cat.stage || 0;
  return MOTS_GRANDE_ECHELLE.test(texte) ? Math.max(base, 4) : base;
}

/* ============================================================
   CONSTRUCTION DU POOL — même forme que EVENT_DEFS, donc
   directement consommable par narrative.js.
============================================================ */

let CACHE = null;

export function buildCuratedPool(){
  if(CACHE) return CACHE;
  const src = DATA.CURATED_EVENTS;
  if(!src) return [];

  const defs = [];

  Object.keys(src).forEach(catKey=>{
    const cat = CATEGORIES[catKey];
    if(!cat) return;
    const bloc = src[catKey];

    (bloc.distinct || []).forEach((ev, i)=>{
      const besoinArtiste = /\{artiste\}/.test(ev.desc || "");
      defs.push({
        id: `cur_${catKey}_${i}`,
        min: cat.tier[0], max: cat.tier[1], w: 1,
        stage: stagePour(cat, ev),
        needsArtist: besoinArtiste || !!cat.needsRoster,
        make: ()=>{
          const a = besoinArtiste ? rA() : null;
          return {
            title: `${cat.emoji} ${remplir(ev.title, a)}`,
            desc: remplir(ev.desc, a),
            choices: (ev.choices || []).map(c=>construireChoix(c, cat, a))
          };
        }
      });
    });

    (bloc.templates || []).forEach((tp, i)=>{
      const besoinArtiste = /\{artiste\}/.test(tp.desc || "");
      const mots = tp.words || [];
      defs.push({
        // Poids double : un seul modèle couvre une dizaine de variantes,
        // il peut donc revenir plus souvent sans donner l'impression de répétition.
        id: `curt_${catKey}_${tp.id || i}`,
        min: cat.tier[0], max: cat.tier[1], w: 2,
        stage: stagePour(cat, tp),
        needsArtist: besoinArtiste || !!cat.needsRoster,
        make: ()=>{
          const a = besoinArtiste ? rA() : null;
          const mot = mots.length ? pick(mots) : "";
          const desc = remplir(tp.desc, a, mot);
          return {
            title: `${cat.emoji} ${tp.title ? remplir(tp.title, a) : titreDepuisDesc(desc)}`,
            desc,
            choices: (tp.choices || []).map(c=>construireChoix(c, cat, a))
          };
        }
      });
    });
  });

  CACHE = defs;
  return CACHE;
}
