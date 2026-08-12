import { impact } from "./economy.js";
import { enregistrerChoix } from "./memory.js";
import { addFlag } from "./narrative.js";
import { playSound } from "./sound.js";
import { notify } from "../notify.js";
import { after } from "../render.js";
import { log, state } from "../state.js";
import { chance, clamp, pick, rint } from "../utils.js";
import { DATA } from "../data.js";

/* ============================================================
   LES RÉSEAUX — la vitrine publique du label.

   Jusqu'ici, la réception publique n'existait qu'au moment d'une
   sortie : quelques avis s'affichaient, puis disparaissaient. Entre
   deux sorties, le joueur n'avait aucun lien avec son public et aucun
   levier pour agir dessus.

   Ici, l'audience devient un objet permanent : un nombre d'abonnés qui
   monte et descend, un fil qui se remplit tout seul avec ce qui se
   passe réellement dans la partie, et surtout des actions à jouer —
   publier, clasher, s'excuser, teaser. Chaque publication a une portée
   incertaine : c'est un pari, pas un bouton à spammer.

   Les abonnés ne sont pas une jauge de plus à surveiller : ils sont
   DÉRIVÉS de la notoriété et des streams. On ne les gagne pas
   directement, on les récolte.
============================================================ */

/* Nombre d'abonnés. Volontairement non stocké : c'est une lecture de
   l'état du label, pas une ressource parallèle qu'on pourrait faire
   diverger. Le bonus accumulé par les publications réussies, lui, est
   bien mémorisé — c'est la part que le joueur a gagnée à la main. */
export function followers(){
  const base = Math.round(
    state.notoriete * 1200 +
    (state.totalStreams || 0) * 0.04 +
    state.credibilite * 260
  );
  return Math.max(0, base + Math.round((state.social && state.social.bonusAbonnes) || 0));
}

export function formatFollowers(n){
  if(n >= 1000000) return (n/1000000).toFixed(1).replace(".0","") + " M";
  if(n >= 1000) return (n/1000).toFixed(1).replace(".0","") + " k";
  return String(n);
}

/* Palier d'audience — sert de repère au joueur et conditionne les
   opportunités médias plus bas. */
export function paliersSocial(){
  const f = followers();
  if(f >= 2000000) return {nom:"Phénomène", icone:"🌍"};
  if(f >= 400000)  return {nom:"Grand public", icone:"📺"};
  if(f >= 80000)   return {nom:"Bien installé", icone:"📈"};
  if(f >= 15000)   return {nom:"Communauté fidèle", icone:"👥"};
  if(f >= 2000)    return {nom:"Petit noyau", icone:"🌱"};
  return {nom:"Confidentiel", icone:"🫥"};
}

function ensureSocial(){
  if(!state.social || typeof state.social !== "object"){
    state.social = {posts:[], bonusAbonnes:0, lastPostChapter:-99, postsTotal:0};
  }
  if(!Array.isArray(state.social.posts)) state.social.posts = [];
  if(typeof state.social.bonusAbonnes !== "number") state.social.bonusAbonnes = 0;
  if(typeof state.social.lastPostChapter !== "number") state.social.lastPostChapter = -99;
  if(typeof state.social.postsTotal !== "number") state.social.postsTotal = 0;
  return state.social;
}

/* Le fil garde une longueur bornée : c'est une timeline, pas un journal
   d'archive — le journal du jeu existe déjà pour ça. */
const FIL_MAX = 40;

export function pousserPost(post){
  const s = ensureSocial();
  s.posts.unshift({
    chapitre: state.chapter,
    saison: state.season,
    ...post
  });
  if(s.posts.length > FIL_MAX) s.posts.length = FIL_MAX;
}

/* ============================================================
   LE FIL SE REMPLIT TOUT SEUL

   Appelé par le moteur quand il se passe quelque chose de public. Le
   fil ne raconte que des faits réels de la partie : c'est ce qui le
   rend crédible, par opposition à du texte d'ambiance générique.
============================================================ */

export function postSortie(release){
  const av = (release.reviews || []).filter(r=>r.tier === "social");
  const cite = av.length ? pick(av) : null;
  pousserPost({
    type:"sortie",
    auteur: state.label,
    icone:"💿",
    texte: `Nouveau : « ${release.title} » est disponible partout.`,
    reactions: Math.max(12, Math.round(followers() * 0.03)),
    citation: cite ? cite.txt : null,
    citationSrc: cite ? cite.src : null
  });
}

export function postSignature(artiste){
  pousserPost({
    type:"signature",
    auteur: state.label,
    icone:"✍️",
    texte: `Bienvenue à ${artiste.name} — nouvelle signature chez ${state.label}.`,
    reactions: Math.max(8, Math.round(followers() * 0.02))
  });
}

export function postReaction(texte, icone){
  pousserPost({
    type:"reaction",
    auteur:"Le public",
    icone: icone || "💬",
    texte,
    reactions: Math.max(4, Math.round(followers() * 0.01))
  });
}

/* ============================================================
   LES ACTIONS DU JOUEUR

   Quatre postures, calquées sur celles du système narratif, pour que
   la mémoire de conduite (memory.js) enregistre aussi ce que le joueur
   fait en ligne. Chacune a un coût, une portée incertaine et un risque
   propre — publier n'est jamais gratuit en réputation.
============================================================ */

export const COOLDOWN_POST = 3;   // chapitres entre deux publications

export function postCooldownRestant(){
  const s = ensureSocial();
  return Math.max(0, COOLDOWN_POST - (state.chapter - s.lastPostChapter));
}

export const ACTIONS_SOCIAL = {
  teaser: {
    icone:"🎬",
    nom:"Teaser du prochain son",
    desc:"Trois secondes d'extrait, aucune date. Ça marche si les gens attendent déjà quelque chose.",
    posture:"exploiter",
    cout:0,
    /* Un teaser ne vaut que s'il y a réellement un projet derrière :
       teaser dans le vide est le meilleur moyen de lasser. */
    exige:()=>state.projects.length > 0,
    exigeTexte:"Il faut un projet en cours à teaser.",
    jouer:()=>{
      const bon = chance(.62);
      const gain = bon ? rint(400, 2200) : -rint(100, 600);
      appliquerPost({
        icone:"🎬",
        texte:`Extrait balancé sans prévenir. « Vous saurez quand vous saurez. »`,
        gain,
        bon,
        reussite:"Le teaser tourne, les commentaires s'emballent.",
        echec:"Personne ne relaie. L'extrait passe inaperçu."
      });
      if(bon) impact({notoriete:4}, "🎬 Le teaser prend : on attend la suite.", "pos");
      else impact({notoriete:-1}, "🎬 Teaser dans le vide.", "neg");
    }
  },

  coulisses: {
    icone:"🎥",
    nom:"Montrer les coulisses",
    desc:"Le studio, les nuits blanches, les gens derrière. Lent à payer, mais ça construit une vraie relation.",
    posture:"communiquer",
    cout:0,
    jouer:()=>{
      const bon = chance(.78);
      const gain = bon ? rint(200, 1100) : rint(0, 150);
      appliquerPost({
        icone:"🎥",
        texte:`Une session filmée sans filtre. Ni montage, ni promesse.`,
        gain,
        bon,
        reussite:"Les gens répondent. Ce sont ceux-là qui restent.",
        echec:"Peu de vues, mais rien de perdu."
      });
      impact({credibilite: bon ? 3 : 1}, "🎥 Vous montrez le travail réel. Ça se respecte.", "pos");
    }
  },

  clash: {
    icone:"🔥",
    nom:"Répondre à un rival, publiquement",
    desc:"Énorme portée, coût certain en crédibilité. Le genre de post qu'on ne peut pas reprendre.",
    posture:"assume",
    cout:0,
    exige:()=>(state.rivals || []).length > 0,
    exigeTexte:"Aucun rival identifié pour l'instant.",
    jouer:()=>{
      const r = pick(state.rivals);
      const bon = chance(.5);
      const gain = bon ? rint(3000, 18000) : rint(800, 4000);
      appliquerPost({
        icone:"🔥",
        texte:`Message adressé à ${r.name}, sans citer de nom mais tout le monde a compris.`,
        gain,
        bon,
        reussite:"Le post explose. Tout le monde en parle.",
        echec:"Ça fait du bruit, surtout contre vous."
      });
      r.aggro = clamp((r.aggro||0) + rint(10,25), 0, 100);
      if(bon) impact({notoriete:9, credibilite:-4}, "🔥 Le clash vous met en pleine lumière.", "info");
      else impact({notoriete:5, credibilite:-8}, "🔥 Le clash se retourne : vous passez pour l'agresseur.", "neg");
      addFlag("clash_en_ligne");
    }
  },

  miseAuPoint: {
    icone:"📄",
    nom:"Publier une mise au point",
    desc:"Poser les choses calmement quand ça chauffe. Peu de portée, mais ça éteint des incendies.",
    posture:"communiquer",
    cout:0,
    jouer:()=>{
      const bon = chance(.7);
      const gain = bon ? rint(50, 700) : -rint(50, 400);
      appliquerPost({
        icone:"📄",
        texte:`Un texte long, posé, sans emoji. Vous mettez les choses au clair.`,
        gain,
        bon,
        reussite:"Le message passe. Le sujet retombe.",
        echec:"Trop long, mal lu, mal repris."
      });
      if(bon) impact({credibilite:6, notoriete:-1}, "📄 Votre mise au point calme le jeu.", "pos");
      else impact({credibilite:-2}, "📄 Votre mise au point relance la machine.", "neg");
    }
  },

  campagne: {
    icone:"💸",
    nom:"Payer une campagne de promo",
    desc:"De la portée achetée. Efficace, immédiat, et parfaitement visible pour ceux qui savent regarder.",
    posture:"payer",
    cout:1500,
    jouer:()=>{
      const bon = chance(.85);
      const gain = bon ? rint(4000, 20000) : rint(500, 3000);
      appliquerPost({
        icone:"💸",
        texte:`Campagne sponsorisée sur toutes les plateformes.`,
        gain,
        bon,
        reussite:"La portée achetée fait son travail.",
        echec:"Ciblage raté : beaucoup d'impressions, peu d'intérêt."
      });
      impact({notoriete: bon ? 7 : 2, credibilite:-2}, "💸 Campagne payée : la portée monte, l'authenticité descend un peu.", "info");
      addFlag("achete_sa_promo");
    }
  }
};

function appliquerPost({icone, texte, gain, bon, reussite, echec}){
  const s = ensureSocial();
  s.bonusAbonnes += gain;
  s.lastPostChapter = state.chapter;
  s.postsTotal++;
  pousserPost({
    type:"post",
    auteur: state.label,
    icone,
    texte,
    resultat: bon ? reussite : echec,
    bon,
    gainAbonnes: gain,
    reactions: Math.max(5, Math.round(Math.abs(gain) * 0.35))
  });
  playSound(bon ? "choixSucces" : "choixEchec");
  log(`${icone} Publication : ${bon ? reussite : echec} (${gain >= 0 ? "+" : ""}${gain} abonnés).`, bon ? "pos" : "neg");
}

/* Action appelée depuis l'interface. Contrôle le délai entre deux
   publications et le coût, puis délègue à la définition. */
export function publier(id){
  const def = ACTIONS_SOCIAL[id];
  if(!def) return;
  ensureSocial();

  const reste = postCooldownRestant();
  if(reste > 0){
    return notify(`Vous venez de publier. Laissez respirer ${reste} épisode${reste>1?"s":""}.`);
  }
  if(def.exige && !def.exige()){
    return notify(def.exigeTexte || "Impossible pour l'instant.");
  }
  if(def.cout && state.argent < def.cout){
    return notify("Pas assez d'argent pour cette campagne.");
  }
  if(def.cout) state.argent -= def.cout;

  def.jouer();

  // La posture compte dans la mémoire de conduite, comme un choix
  // narratif : ce que vous faites en ligne fait partie de qui vous êtes.
  enregistrerChoix(def.posture);
  after();
}

/* ============================================================
   LA PRESSE — le pendant "médias" du fil social.
   Rassemble les avis presse déjà attachés aux sorties, pour qu'il
   existe enfin un endroit où lire ce que la critique dit de vous.
============================================================ */
export function revuePresse(){
  const out = [];
  (state.releases || []).forEach(r=>{
    (r.reviews || []).filter(v=>v.tier === "presse").forEach(v=>{
      out.push({...v, titre:r.title, artiste:r.artistName});
    });
  });
  return out.reverse();
}
