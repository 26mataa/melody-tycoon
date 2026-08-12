import { DAILY_POOL } from "./dailychoices.js";
import { buildCuratedPool } from "./curated.js";
import { advanceChapter } from "./day.js";
import { choiceAbordable, choiceRequiredArgent, EVENT_DEFS, revealChoiceResult } from "./events.js";
import { getTier, impact } from "./economy.js";
import { playerStage, releaseDisponible, stageOf } from "./stages.js";
import { enregistrerChoix } from "./memory.js";
import { CAST_EPISODES } from "./cast.js";
import { DEBUT_EPISODES } from "./debuts.js";
import { mandatBloquant } from "./mandate.js";
import { adaptCost } from "./economy.js";
import { performRoll } from "./roll.js";
import { playSound } from "./sound.js";
import { notify } from "../notify.js";
import { log, state } from "../state.js";
import { pick, rint, shuffleArr } from "../utils.js";
import { DATA } from "../data.js";

/* ============================================================
   NARRATIF — un seul système, un seul épisode à la fois.

   V0.7 avait deux pools séparés (événements aléatoires d'un côté,
   "choix du jour" de l'autre) affichés en même temps à des endroits
   différents. Ils avaient exactement la même forme
   ({min,max,w,imp,when,make}) : ils ne font plus qu'un pool ici, et
   le jeu ne présente qu'UN épisode à la fois — c'est lui le cœur de
   l'écran d'accueil, et c'est lui qui fait avancer le temps.

   Chaque épisode résolu = un chapitre. Voir day.js.
============================================================ */

/* Pool unifié : les événements d'origine, les situations de vie, et la
   grande base fournie (data/events.json, adaptée par curated.js). On ne
   recopie aucune définition — on les assemble. */
let POOL = null;
export function getNarrativePool(){
  if(POOL) return POOL;
  POOL = EVENT_DEFS.map(d=>({...d, source:"event"}))
    .concat(DAILY_POOL.map(d=>({...d, source:"daily"})))
    .concat(buildCuratedPool().map(d=>({...d, source:"curated"})));
  return POOL;
}

/* ============================================================
   FLAGS NARRATIFS — la mémoire de la partie.
   C'est la pièce qui rend une run différente d'une autre : un choix
   pris tôt ouvre ou ferme des branches entières bien plus tard, via
   le simple `when()` que le pool utilise déjà.
============================================================ */

export function hasFlag(f){
  return Array.isArray(state.storyFlags) && state.storyFlags.includes(f);
}

export function addFlag(f){
  if(!f) return;
  if(!Array.isArray(state.storyFlags)) state.storyFlags = [];
  if(!state.storyFlags.includes(f)) state.storyFlags.push(f);
}

export function removeFlag(f){
  if(!f || !Array.isArray(state.storyFlags)) return;
  state.storyFlags = state.storyFlags.filter(x=>x !== f);
}

/* ============================================================
   GRAINE DE DÉPART — aucune run ne commence pareil.
   1 ou 2 circonstances tirées au sort à la création du label. Jamais
   économiques (tout le monde démarre avec les mêmes 50€) : ce sont
   des situations de vie, qui débloquent des épisodes spécifiques.
============================================================ */

export const STARTING_SEEDS = [
  {flag:"seed_contact_radio", txt:"Un pote d'enfance bosse à la radio locale. Il vous doit bien un service."},
  {flag:"seed_passif_rival", txt:"Vous traînez une vieille embrouille avec un label du quartier. Ils n'ont pas oublié."},
  {flag:"seed_repute_quartier", txt:"Dans le quartier, tout le monde sait qui vous êtes. Pour le meilleur et pour le pire."},
  {flag:"seed_ex_artiste", txt:"Vous avez tenté une carrière d'artiste avant ça. Ça s'est mal terminé."},
  {flag:"seed_dette_morale", txt:"Quelqu'un vous a sorti d'un mauvais pas il y a des années. Il s'en souviendra."},
  {flag:"seed_famille_contre", txt:"Votre famille trouve ce projet ridicule et ne s'en cache pas."},
  {flag:"seed_local", txt:"Un local vide vous a été prêté. Ça sent l'humidité, mais ça fait un studio."},
  {flag:"seed_casier", txt:"Une vieille histoire judiciaire traîne encore dans votre dossier."},
  {flag:"seed_oreille", txt:"Vous avez toujours eu l'oreille. Les gens le disent, vous n'y croyez pas trop."},
  {flag:"seed_reseau_nuit", txt:"Vous connaissez tous les videurs de la ville. La nuit vous appartient un peu."}
];

export function seedStartingFlags(){
  state.storyFlags = [];
  const n = rint(1,2);
  const picked = shuffleArr(STARTING_SEEDS).slice(0,n);
  picked.forEach(s=>{
    addFlag(s.flag);
    log(`📖 ${s.txt}`,"info");
  });
  return picked;
}

/* ============================================================
   ÉPISODES SPÉCIFIQUES AUX GRAINES — la preuve que la graine compte.
   Ces épisodes n'existent que dans les parties qui ont tiré le flag
   correspondant, et posent à leur tour de nouveaux flags.
============================================================ */

export const SEED_EPISODES = [
  {min:0,max:5,w:6,id:"seed_radio_favor",when:()=>hasFlag("seed_contact_radio"),make:()=>({
    title:"📻 Le pote de la radio",
    desc:"Votre pote animateur vous propose un passage à l'antenne. Il précise qu'après ça, vous serez quittes.",
    choices:[
      {t:"Prendre le passage antenne",d:{buzz:9,reseau:2},addFlag:"radio_favor_utilise",removeFlag:"seed_contact_radio",reason:"📻 Passage radio obtenu : gros coup de projecteur, et une dette effacée."},
      {t:"Garder le service pour plus tard",d:{},reason:"📻 Vous préférez garder cette carte en main."},
      {t:"Lui demander plutôt de placer un de vos sons en rotation",p:.45,sD:{buzz:14,popularite:3},fD:{reseau:-3},sMsg:"Il arrive à le caser.",fMsg:"La direction refuse.",sReason:"📻 Rotation obtenue : votre son tourne vraiment.",fReason:"📻 Refus de la direction, votre pote est gêné.",addFlag:"radio_favor_utilise",removeFlag:"seed_contact_radio"}
    ]
  })},
  {min:0,max:5,w:6,id:"seed_rival_retour",when:()=>hasFlag("seed_passif_rival"),make:()=>({
    title:"😠 Ils vous ont retrouvé",
    desc:"Le label du quartier avec qui vous avez un passif apprend que vous montez votre structure. Un message vous arrive.",
    choices:[
      {t:"Aller crever l'abcès en face à face",p:.5,sD:{reseau:6,reputation:2},fD:{reputation:-4,buzz:3},sMsg:"La discussion se passe étonnamment bien.",fMsg:"Ça part en clash.",sReason:"😠 Vieux contentieux réglé : le milieu apprécie.",fReason:"😠 Le clash se répand, votre nom circule mal.",addFlag:"rival_confronte",removeFlag:"seed_passif_rival"},
      {t:"Répondre publiquement, sans filtre",d:{buzz:8,reputation:-3},addFlag:"clash_public",removeFlag:"seed_passif_rival",reason:"😠 Vous répondez en public : ça fait du bruit, pas que du bon."},
      {t:"Ignorer complètement",d:{},addFlag:"a_ignore_rival",reason:"😠 Vous ne répondez pas. Le silence aussi, ça se remarque."}
    ]
  })},
  {min:0,max:5,w:5,id:"seed_famille_preuve",when:()=>hasFlag("seed_famille_contre"),make:()=>({
    title:"🍽️ Le repas de famille",
    desc:"Repas de famille. On vous redemande, une fois de plus, quand est-ce que vous allez « chercher un vrai travail ».",
    choices:[
      {t:"Défendre le projet point par point",p:.5,sD:{reseau:3},fD:{},sMsg:"Un oncle finit par hocher la tête.",fMsg:"Personne n'écoute vraiment.",sReason:"🍽️ Vous marquez des points : un soutien inattendu apparaît.",fReason:"🍽️ Le repas se termine dans le silence.",addFlag:"famille_convaincue",removeFlag:"seed_famille_contre"},
      {t:"Changer de sujet et manger",d:{},reason:"🍽️ Vous laissez couler. Le dessert était bon."},
      {t:"Claquer la porte",d:{reputation:-1},fn:()=>{ state.player.stress = Math.max(0, state.player.stress - 10); },addFlag:"rupture_familiale",removeFlag:"seed_famille_contre",reason:"🍽️ Vous partez avant le dessert. Ça soulage, ça coûte."}
    ]
  })},
  {min:0,max:5,w:5,id:"seed_local_probleme",when:()=>hasFlag("seed_local"),make:()=>({
    title:"🏚️ Le local a un souci",
    desc:"Le local prêté prend l'eau, et le propriétaire commence à parler de le récupérer.",
    choices:[
      {t:"Payer les réparations de votre poche",d:{argent:-350,reseau:3},addFlag:"local_securise",reason:"🏚️ Réparations payées : le local est à vous pour un moment."},
      {t:"Bricoler vous-même",p:.55,sD:{reseau:1},fD:{argent:-150},sMsg:"Ça tient.",fMsg:"Ça a empiré.",sReason:"🏚️ Bricolage réussi, le local tient debout.",fReason:"🏚️ Bricolage raté, il faudra payer un pro.",addFlag:"local_securise"},
      {t:"Laisser tomber le local",d:{},removeFlag:"seed_local",addFlag:"sans_local",reason:"🏚️ Vous rendez les clés. Retour à la chambre."}
    ]
  })},
  {min:0,max:5,w:5,id:"seed_casier_ressort",when:()=>hasFlag("seed_casier"),make:()=>({
    title:"⚖️ Le dossier ressort",
    desc:"Un partenaire potentiel a fait des recherches sur vous. Votre vieille affaire est remontée à la surface.",
    choices:[
      {t:"Assumer et tout raconter",d:{reputation:2,reseau:-1},addFlag:"passe_assume",removeFlag:"seed_casier",reason:"⚖️ Vous assumez : certains respectent, d'autres prennent leurs distances."},
      {t:"Minimiser",p:.5,sD:{reseau:3},fD:{reputation:-5},sMsg:"Ça passe.",fMsg:"Ça ne passe pas du tout.",sReason:"⚖️ Version allégée acceptée.",fReason:"⚖️ Le mensonge se voit : votre parole vaut moins."},
      {t:"Payer un avocat pour faire nettoyer ça",d:{argent:-800},removeFlag:"seed_casier",addFlag:"casier_efface",reason:"⚖️ Dossier nettoyé. Cher, mais définitif."}
    ]
  })},
  {min:0,max:5,w:5,id:"seed_dette_appel",when:()=>hasFlag("seed_dette_morale"),make:()=>({
    title:"📞 Il rappelle",
    desc:"La personne qui vous a sorti d'un mauvais pas il y a des années vous appelle. Elle a besoin d'un service, maintenant.",
    choices:[
      {t:"Rendre le service sans poser de question",d:{reseau:7,argent:-300},addFlag:"dette_remboursee",removeFlag:"seed_dette_morale",reason:"📞 Service rendu : cette personne vous sera fidèle."},
      {t:"Demander de quoi il s'agit d'abord",p:.6,sD:{reseau:4},fD:{reseau:-4},sMsg:"C'était un service normal.",fMsg:"La question a vexé.",sReason:"📞 Vous rendez le service en connaissance de cause.",fReason:"📞 La méfiance a blessé : la relation se refroidit.",removeFlag:"seed_dette_morale"},
      {t:"Refuser",d:{reseau:-6},addFlag:"dette_non_honoree",removeFlag:"seed_dette_morale",reason:"📞 Vous refusez. Dans ce milieu, ça se sait."}
    ]
  })},
  {min:0,max:5,w:4,id:"seed_ex_artiste_retour",when:()=>hasFlag("seed_ex_artiste"),make:()=>({
    title:"🎙️ Votre ancien projet refait surface",
    desc:"Un de vos vieux morceaux d'époque, celui que vous pensiez enterré, ressort quelque part sur les réseaux.",
    choices:[
      {t:"Le revendiquer et en rire",d:{buzz:6,popularite:1},addFlag:"passe_artiste_assume",reason:"🎙️ Vous assumez publiquement : le public trouve ça attachant."},
      {t:"Faire retirer le morceau",d:{reputation:-2},addFlag:"passe_artiste_cache",reason:"🎙️ Vous le faites retirer. Le silence intrigue."},
      {t:"Le réenregistrer proprement aujourd'hui",p:.5,sD:{buzz:12,reputation:3},fD:{reputation:-3},sMsg:"La nouvelle version marche.",fMsg:"Personne n'accroche.",sReason:"🎙️ Réenregistrement réussi : la boucle est bouclée.",fReason:"🎙️ La nouvelle version tombe à plat."}
    ]
  })},
  {min:0,max:5,w:4,id:"seed_nuit_opportunite",when:()=>hasFlag("seed_reseau_nuit"),make:()=>({
    title:"🌃 Une place en after",
    desc:"Un videur que vous connaissez vous fait entrer dans une soirée fermée où il y a du monde à rencontrer.",
    choices:[
      {t:"Passer la nuit à réseauter",d:{reseau:8},fn:()=>{ state.player.energy = Math.max(0, state.player.energy - 25); },addFlag:"reseau_nuit_actif",reason:"🌃 Nuit blanche productive : gros gain de réseau, grosse fatigue."},
      {t:"Y passer, boire un verre, rentrer tôt",d:{reseau:3},reason:"🌃 Petit passage, quelques contacts, une nuit correcte."},
      {t:"Ne pas y aller",d:{},fn:()=>{ state.player.energy = Math.min(100, state.player.energy + 10); },reason:"🌃 Vous rentrez dormir. Parfois c'est le bon choix."}
    ]
  })},
  {min:0,max:5,w:4,id:"seed_quartier_attente",when:()=>hasFlag("seed_repute_quartier"),make:()=>({
    title:"🏘️ Le quartier attend de voir",
    desc:"On vous arrête dans la rue : « alors, ce label, c'est du sérieux ou c'est du vent ? »",
    choices:[
      {t:"Promettre du lourd",d:{buzz:5,reputation:-1},addFlag:"promesse_quartier",reason:"🏘️ Vous promettez du lourd. Maintenant il faut livrer."},
      {t:"Rester humble",d:{reputation:3},addFlag:"humilite_quartier",reason:"🏘️ Vous restez mesuré : ça inspire confiance."},
      {t:"Proposer de faire écouter un son sur le champ",p:.5,sD:{buzz:8,popularite:2},fD:{buzz:-4},sMsg:"Ça plaît, ça circule.",fMsg:"Silence gêné.",sReason:"🏘️ Le son circule dans le quartier tout seul.",fReason:"🏘️ Écoute ratée : la rumeur n'est pas bonne."}
    ]
  })}
];

/* ============================================================
   LES SUITES DE GRAINES — une circonstance de départ n'est pas
   un one-shot, c'est le premier épisode d'un fil.

   Chaque graine pose un flag en se résolvant ; ce flag ouvre le
   deuxième épisode, qui en pose un autre, et ainsi de suite. Deux
   parties parties de la même graine peuvent donc bifurquer dès le
   deuxième épisode selon la réponse donnée au premier — c'est là que
   se joue l'essentiel de la divergence entre deux carrières.

   Tous en jalon 0 : ce sont les tout débuts, ils doivent pouvoir
   tomber avant même d'avoir signé qui que ce soit. C'est aussi ce qui
   garantit qu'un joueur qui n'a encore rien fait a de quoi jouer.
============================================================ */

export const SEED_CHAINS = [

  /* --- suite de la radio --- */
  {min:0,max:5,w:5,stage:0,id:"chain_radio_2",when:()=>hasFlag("radio_favor_utilise"),make:()=>({
    title:"📻 L'antenne rappelle",
    desc:"La radio a eu des retours. On vous propose de revenir — cette fois en payant votre place, comme tout le monde.",
    choices:[
      {t:"Payer le passage",d:{argent:-Math.round(adaptCost("petit")),notoriete:7},addFlag:"achete_sa_promo",posture:"payer",reason:"📻 Vous payez votre place à l'antenne. Ça marche, et ça se saura."},
      {t:"Négocier un échange de visibilité",p:.5,sD:{notoriete:6,credibilite:3},fD:{credibilite:-2},sMsg:"Ils acceptent le troc.",fMsg:"Ils veulent du cash.",sReason:"📻 Échange de bons procédés : vous passez sans payer.",fReason:"📻 Refus poli. La radio n'est pas une association.",addFlag:"troque_sa_promo",posture:"negocier"},
      {t:"Décliner : je ne paierai jamais pour passer",d:{credibilite:5},addFlag:"jamais_de_promo_payante",posture:"refuser",reason:"📻 Vous refusez le principe. Certains dans le milieu vous respectent pour ça."}
    ]
  })},
  {min:0,max:5,w:4,stage:1,id:"chain_radio_3",when:()=>hasFlag("jamais_de_promo_payante"),make:()=>({
    title:"📻 Votre principe se sait",
    desc:"Un collectif de petits labels vous contacte : votre refus de payer pour passer en radio a circulé. Ils veulent en faire un texte commun.",
    choices:[
      {t:"Signer et porter le texte",d:{credibilite:9,notoriete:4},addFlag:"figure_de_l_independance",posture:"assume",reason:"📻 Vous portez le texte. Vous devenez une voix dans ce débat."},
      {t:"Signer sans mettre mon nom devant",d:{credibilite:4},posture:"accepter",reason:"📻 Vous signez discrètement. Le texte sort, sans vous en vitrine."},
      {t:"Ne pas m'en mêler",d:{},posture:"ignorer",reason:"📻 Vous laissez passer. Ce n'est pas votre combat."}
    ]
  })},

  /* --- suite du passif avec le rival --- */
  {min:0,max:5,w:5,stage:0,id:"chain_rival_2",when:()=>hasFlag("clash_public"),make:()=>({
    title:"😠 Le clash prend de l'ampleur",
    desc:"Votre réponse publique a été reprise partout. Le label d'en face prépare la sienne, et tout le monde attend la suite comme un match.",
    choices:[
      {t:"Continuer, c'est de la lumière gratuite",d:{notoriete:11,credibilite:-6},addFlag:"vit_du_clash",posture:"exploiter",reason:"😠 Vous relancez. Le clash devient votre carte de visite."},
      {t:"Arrêter les frais publiquement",d:{credibilite:7,notoriete:-3},addFlag:"a_su_s_arreter",posture:"communiquer",reason:"😠 Vous mettez fin au clash de vous-même. Ça surprend, et ça vous grandit."},
      {t:"Proposer un morceau commun pour clore ça",p:.4,sD:{notoriete:14,credibilite:6},fD:{credibilite:-5},sMsg:"Ils acceptent.",fMsg:"Ils refusent et se moquent.",sReason:"😠 Le morceau de réconciliation devient l'événement de la saison.",fReason:"😠 Votre main tendue est publiquement moquée.",addFlag:"a_tendu_la_main",posture:"negocier"}
    ]
  })},
  {min:0,max:5,w:4,stage:0,id:"chain_rival_3",when:()=>hasFlag("a_ignore_rival"),make:()=>({
    title:"😠 Ils passent à l'acte",
    desc:"Ne pas répondre ne les a pas calmés. On vous a débauché un contact, annulé une date, et fait comprendre que ce n'était qu'un début.",
    choices:[
      {t:"Répondre enfin, frontalement",d:{notoriete:8,credibilite:-2},addFlag:"clash_public",posture:"assume",reason:"😠 Vous sortez enfin du silence. Tardif, mais net."},
      {t:"Régler ça en coulisses",p:.55,sD:{credibilite:6},fD:{credibilite:-4,argent:-Math.round(adaptCost("petit"))},sMsg:"Un accord se trouve.",fMsg:"Ils font monter les enchères.",sReason:"😠 Vous réglez ça sans bruit. Personne n'a rien vu, c'est le but.",fReason:"😠 Négocier en position de faiblesse coûte cher.",posture:"negocier"},
      {t:"Continuer d'ignorer",d:{credibilite:-4},addFlag:"encaisse_sans_broncher",posture:"ignorer",reason:"😠 Vous encaissez encore. Le milieu commence à trouver ça étrange."}
    ]
  })},

  /* --- suite de la famille --- */
  {min:0,max:5,w:4,stage:0,id:"chain_famille_2",when:()=>hasFlag("famille_convaincue"),make:()=>({
    title:"🍽️ L'oncle qui vous a soutenu",
    desc:"Celui qui avait hoché la tête au repas revient vers vous : il a un peu d'argent de côté et veut le mettre dans votre projet.",
    choices:[
      {t:"Accepter son aide",d:{argent:Math.round(adaptCost("moyen")),credibilite:-2},addFlag:"argent_familial",posture:"accepter",reason:"🍽️ Vous acceptez l'argent de la famille. Vous vous engagez au-delà du business."},
      {t:"Refuser : je ne mélange pas",d:{credibilite:5},addFlag:"ne_mele_pas_famille",posture:"refuser",reason:"🍽️ Vous refusez de mélanger famille et argent. Il insiste, vous tenez."},
      {t:"Accepter, mais comme un vrai prêt écrit",d:{argent:Math.round(adaptCost("petit")),credibilite:3},posture:"negocier",reason:"🍽️ Vous acceptez, sur papier, avec des échéances. Tout le monde dort mieux."}
    ]
  })},
  {min:0,max:5,w:4,stage:0,id:"chain_famille_3",when:()=>hasFlag("rupture_familiale"),make:()=>({
    title:"📵 Six mois sans nouvelles",
    desc:"Depuis que vous avez claqué la porte, plus personne n'appelle. Un cousin vous écrit : quelqu'un est à l'hôpital.",
    choices:[
      {t:"Y aller tout de suite",d:{credibilite:3},fn:()=>{ state.player.stress = Math.max(0, state.player.stress - 12); },addFlag:"a_renoue",removeFlag:"rupture_familiale",posture:"soutenir",reason:"📵 Vous y allez. Rien n'est dit, tout est réglé."},
      {t:"Envoyer de l'argent sans venir",d:{argent:-Math.round(adaptCost("petit"))},posture:"payer",reason:"📵 Vous envoyez de quoi aider. Vous ne venez pas."},
      {t:"Ne pas répondre",d:{},fn:()=>{ state.player.stress = Math.min(100, state.player.stress + 15); },addFlag:"a_coupe_les_ponts",posture:"ignorer",reason:"📵 Vous ne répondez pas. Ça vous travaille bien plus que prévu."}
    ]
  })},

  /* --- suite du local --- */
  {min:0,max:5,w:4,stage:0,id:"chain_local_2",when:()=>hasFlag("local_securise"),make:()=>({
    title:"🏚️ Le local devient un lieu",
    desc:"Des gens du quartier commencent à passer au studio pour enregistrer. Ça fait du monde, du bruit, et pas un centime.",
    choices:[
      {t:"Ouvrir le lieu à tout le monde",d:{credibilite:8,argent:-Math.round(adaptCost("petit"))},addFlag:"studio_ouvert",posture:"soutenir",reason:"🏚️ Le studio devient un lieu du quartier. Vous y perdez de l'argent, vous y gagnez une réputation."},
      {t:"Faire payer un tarif symbolique",d:{argent:Math.round(adaptCost("petit")),credibilite:2},posture:"negocier",reason:"🏚️ Un petit tarif : ça filtre un peu et ça finance le matériel."},
      {t:"Fermer les portes, c'est un outil de travail",d:{credibilite:-4},addFlag:"studio_ferme",posture:"refuser",reason:"🏚️ Vous fermez le studio aux visiteurs. Efficace, et mal pris dans le quartier."}
    ]
  })},
  {min:0,max:5,w:4,stage:0,id:"chain_local_3",when:()=>hasFlag("sans_local"),make:()=>({
    title:"🛏️ Enregistrer dans une chambre",
    desc:"Sans local, tout se fait chez vous. Le voisin du dessous a déposé une pétition, et le propriétaire a reçu une lettre.",
    choices:[
      {t:"Insonoriser à vos frais",d:{argent:-Math.round(adaptCost("moyen"))},addFlag:"chambre_studio",posture:"payer",reason:"🛏️ Vous insonorisez. Le voisin se calme, votre compte moins."},
      {t:"Aller voir le voisin en personne",p:.55,sD:{credibilite:4},fD:{credibilite:-3},sMsg:"Il se détend.",fMsg:"Il appelle la police.",sReason:"🛏️ Vous discutez, il comprend, il prête même une clé du garage.",fReason:"🛏️ La discussion tourne mal. Intervention, procès-verbal.",posture:"negocier"},
      {t:"Enregistrer la nuit, en silence",d:{},fn:()=>{ state.player.energy = Math.max(0, state.player.energy - 20); },addFlag:"travaille_la_nuit",posture:"ignorer",reason:"🛏️ Vous basculez sur des sessions nocturnes. Ça tient, vous non."}
    ]
  })},

  /* --- suite du casier --- */
  {min:0,max:5,w:4,stage:0,id:"chain_casier_2",when:()=>hasFlag("passe_assume"),make:()=>({
    title:"⚖️ On vous demande d'en parler",
    desc:"Une association qui travaille avec des jeunes sortis de prison vous propose d'intervenir. Ça veut dire raconter votre histoire en public, pour de bon.",
    choices:[
      {t:"Accepter et tout raconter",d:{credibilite:10,notoriete:5},addFlag:"parle_de_son_passe",posture:"communiquer",reason:"⚖️ Vous racontez tout devant une salle. C'est dur, et ça change votre image pour de bon."},
      {t:"Accepter, mais sans les détails",d:{credibilite:4},posture:"accepter",reason:"⚖️ Vous intervenez en gardant le plus dur pour vous."},
      {t:"Refuser : ce n'est pas une carte à jouer",d:{credibilite:3},addFlag:"garde_son_passe",posture:"refuser",reason:"⚖️ Vous refusez d'en faire un argument. Votre passé reste le vôtre."}
    ]
  })},
  {min:0,max:5,w:3,stage:0,id:"chain_casier_3",when:()=>hasFlag("casier_efface"),make:()=>({
    title:"⚖️ L'avocat rappelle",
    desc:"Le cabinet qui a nettoyé votre dossier vous propose une mission : ils cherchent quelqu'un du milieu pour orienter d'autres clients vers eux. Commission à la clé.",
    choices:[
      {t:"Accepter le partenariat",d:{argent:Math.round(adaptCost("moyen")),credibilite:-5},addFlag:"rabatteur",posture:"accepter",reason:"⚖️ Vous devenez leur apporteur d'affaires. L'argent rentre, l'image se ternit."},
      {t:"Refuser poliment",d:{credibilite:4},posture:"refuser",reason:"⚖️ Vous déclinez. Vous ne serez pas leur rabatteur."},
      {t:"Les recommander gratuitement, sans commission",d:{credibilite:6},addFlag:"recommande_sans_interet",posture:"soutenir",reason:"⚖️ Vous les recommandez quand c'est utile, sans rien prendre. Ça se sait."}
    ]
  })},

  /* --- suite de la dette morale --- */
  {min:0,max:5,w:4,stage:0,id:"chain_dette_2",when:()=>hasFlag("dette_remboursee"),make:()=>({
    title:"📞 Il vous rend au centuple",
    desc:"La personne à qui vous aviez rendu service revient — cette fois pour donner. Elle connaît quelqu'un, elle a un contact, elle veut vous ouvrir une porte.",
    choices:[
      {t:"Prendre le contact",d:{credibilite:8,notoriete:3},addFlag:"reseau_solide",posture:"accepter",reason:"📞 La porte s'ouvre. Le service rendu vous revient, multiplié."},
      {t:"Refuser : je ne veux rien lui devoir",d:{credibilite:2},posture:"refuser",reason:"📞 Vous refusez, pour rester quitte. Elle trouve ça idiot, et touchant."},
      {t:"Accepter et lui proposer un vrai partenariat",p:.5,sD:{credibilite:10,argent:Math.round(adaptCost("moyen"))},fD:{credibilite:-3},sMsg:"Elle est partante.",fMsg:"Elle préfère en rester là.",sReason:"📞 Vous montez quelque chose ensemble. Un vrai allié de long terme.",fReason:"📞 Elle décline : « Restons-en à l'amitié. »",posture:"negocier"}
    ]
  })},
  {min:0,max:5,w:4,stage:0,id:"chain_dette_3",when:()=>hasFlag("dette_non_honoree"),make:()=>({
    title:"📞 Ça se sait",
    desc:"Votre refus a circulé. Deux personnes qui devaient vous rappeler ne l'ont pas fait, et vous savez pourquoi.",
    choices:[
      {t:"Aller m'expliquer, quitte à ramper",d:{credibilite:5,argent:-Math.round(adaptCost("petit"))},removeFlag:"dette_non_honoree",addFlag:"a_repare_une_dette",posture:"excuse",reason:"📞 Vous allez vous expliquer. Ça coûte de l'orgueil et un peu d'argent."},
      {t:"Assumer : je ne devais rien",d:{credibilite:-4,notoriete:2},addFlag:"ne_doit_rien_a_personne",posture:"assume",reason:"📞 Vous assumez froidement. On vous fera moins de faveurs."},
      {t:"Reconstruire ailleurs, avec d'autres gens",d:{},addFlag:"repart_de_zero_relationnel",posture:"ignorer",reason:"📞 Vous laissez ce cercle derrière vous et allez chercher ailleurs."}
    ]
  })},

  /* --- suite de l'ancien projet d'artiste --- */
  {min:0,max:5,w:4,stage:0,id:"chain_exartiste_2",when:()=>hasFlag("passe_artiste_assume"),make:()=>({
    title:"🎙️ On vous demande de remonter sur scène",
    desc:"Puisque vous avez assumé vos vieux morceaux, on vous propose une scène. Une vraie. Vous n'êtes plus artiste depuis longtemps.",
    choices:[
      {t:"Y aller",p:.5,sD:{notoriete:12,credibilite:4},fD:{notoriete:-4,credibilite:-3},sMsg:"La salle est avec vous.",fMsg:"Le trou de mémoire en plein milieu.",sReason:"🎙️ Vous remontez sur scène et ça marche. Vous ne pensiez plus jamais ressentir ça.",fReason:"🎙️ La scène ne vous appartient plus. La vidéo tourne.",addFlag:"est_remonte_sur_scene",posture:"assume"},
      {t:"Refuser : ma place est derrière",d:{credibilite:4},addFlag:"assume_l_ombre",posture:"refuser",reason:"🎙️ Vous refusez. Votre place est en coulisses, vous en êtes sûr maintenant."},
      {t:"Y aller en invitant un de mes artistes",d:{credibilite:6,notoriete:5},posture:"soutenir",reason:"🎙️ Vous montez sur scène pour présenter quelqu'un d'autre. Élégant."}
    ]
  })},

  /* --- suite du réseau de nuit --- */
  {min:0,max:5,w:4,stage:0,id:"chain_nuit_2",when:()=>hasFlag("reseau_nuit_actif"),make:()=>({
    title:"🌃 La nuit a un prix",
    desc:"Trois mois de sorties tous les soirs. Le réseau est réel, la fatigue aussi, et on commence à vous croiser plus souvent en boîte qu'en studio.",
    choices:[
      {t:"Lever le pied",d:{credibilite:4},fn:()=>{ state.player.energy = Math.min(100, state.player.energy + 25); state.player.stress = Math.max(0, state.player.stress - 15); },removeFlag:"reseau_nuit_actif",addFlag:"a_leve_le_pied",posture:"refuser",reason:"🌃 Vous arrêtez les nuits. Le corps dit merci, le carnet d'adresses stagne."},
      {t:"Continuer, c'est là que tout se décide",d:{notoriete:7,credibilite:-3},fn:()=>{ state.player.energy = Math.max(0, state.player.energy - 20); },addFlag:"vit_la_nuit",posture:"assume",reason:"🌃 Vous continuez. Les contacts s'accumulent, vous vous consumez."},
      {t:"Déléguer les sorties à quelqu'un",d:{argent:-Math.round(adaptCost("petit")),credibilite:2},posture:"negocier",reason:"🌃 Vous payez quelqu'un pour tenir le réseau de nuit à votre place."}
    ]
  })},

  /* --- suite de la réputation de quartier --- */
  {min:0,max:5,w:4,stage:0,id:"chain_quartier_2",when:()=>hasFlag("promesse_quartier"),make:()=>({
    title:"🏘️ On attend le lourd promis",
    desc:"Vous aviez promis du lourd. Ça fait un moment. On vous le rappelle, et pas toujours gentiment.",
    choices:[
      {t:"Sortir quelque chose vite, quitte à bâcler",d:{notoriete:6,credibilite:-6},addFlag:"a_bacle_pour_tenir",posture:"exploiter",reason:"🏘️ Vous sortez quelque chose dans l'urgence. La promesse est tenue, la qualité non."},
      {t:"Assumer que ça prendra du temps",d:{credibilite:5,notoriete:-2},addFlag:"a_tenu_bon",posture:"communiquer",reason:"🏘️ Vous expliquez que ça prendra le temps qu'il faut. Certains décrochent, d'autres attendent."},
      {t:"Organiser un événement gratuit dans le quartier",d:{argent:-Math.round(adaptCost("petit")),credibilite:8,notoriete:4},addFlag:"a_rendu_au_quartier",posture:"soutenir",reason:"🏘️ Vous montez un événement gratuit. Le quartier vous le rendra."}
    ]
  })},
  {min:0,max:5,w:4,stage:0,id:"chain_quartier_3",when:()=>hasFlag("humilite_quartier"),make:()=>({
    title:"🏘️ Quelqu'un vous fait confiance",
    desc:"Parce que vous n'avez rien promis, un jeune du quartier vous fait écouter ses sons avant tout le monde. Il n'a rien montré à personne d'autre.",
    choices:[
      {t:"L'accompagner sérieusement",d:{credibilite:8},addFlag:"formateur",posture:"soutenir",reason:"🏘️ Vous prenez le temps de l'accompagner. Ça ne rapporte rien tout de suite."},
      {t:"Le rediriger vers quelqu'un de mieux placé",d:{credibilite:4},posture:"negocier",reason:"🏘️ Vous l'envoyez vers quelqu'un de plus adapté. Honnête."},
      {t:"Lui dire franchement que ce n'est pas prêt",d:{credibilite:3},addFlag:"franchise_brutale",posture:"communiquer",reason:"🏘️ Vous êtes franc, quitte à faire mal. Il reviendra ou pas."}
    ]
  })}
];

/* ============================================================
   LA VIE DES SORTIES MARQUANTES
   Seules les sorties marquantes (gros carton, polémique, flop
   humiliant) reviennent dans l'arc narratif : c'est là qu'on voit
   un titre percer à l'international, s'essouffler, ou s'arrêter
   définitivement. Les autres sorties ne polluent pas l'histoire —
   elles restent consultables dans le sous-onglet Sorties du Label.
============================================================ */

function citationSociale(r){
  const av = (r.reviews||[]).filter(x=>x.tier === "social");
  return av.length ? pick(av) : null;
}

function followUpHit(r){
  const cite = citationSociale(r);
  return {
    imp:1,
    title:`🚀 « ${r.title} » part loin`,
    desc:`Le titre continue de tourner bien après sa sortie${cite?`. Sur les réseaux : « ${cite.txt} »`:"."} Une porte s'ouvre à l'étranger.`,
    choices:[
      {t:"Pousser à l'international",d:{argent:-600,popularite:3},
       fn:()=>{ r.dailyStreams = Math.round(r.dailyStreams * 1.7); r.decay = Math.min(.97, (r.decay||.87) + .05); },
       addFlag:"perce_international",
       reason:`🌍 Campagne à l'étranger sur « ${r.title} » : le titre repart de plus belle.`},
      {t:"Capitaliser localement, c'est moins cher",d:{buzz:6},
       fn:()=>{ r.dailyStreams = Math.round(r.dailyStreams * 1.25); },
       reason:`📻 Vous consolidez le succès chez vous.`},
      {t:"Laisser le morceau vivre sa vie",d:{},
       reason:`🎧 Vous ne forcez rien. Le titre continuera tant qu'il continuera.`}
    ]
  };
}

function followUpEssouffle(r){
  return {
    imp:1,
    title:`📉 « ${r.title} » s'essouffle`,
    desc:`Les écoutes retombent. Le morceau a fait son temps — sauf si vous décidez de le relancer.`,
    choices:[
      {t:"Sortir un remix / une version live",d:{argent:-400,buzz:5},
       fn:()=>{ r.dailyStreams = Math.round(r.dailyStreams * 1.6); r.age = Math.max(0, r.age - 4); },
       reason:`🔁 Nouvelle version de « ${r.title} » : deuxième souffle.`},
      {t:"Le laisser s'éteindre tranquillement",d:{},
       fn:()=>{ r.fini = true; },
       reason:`🌙 « ${r.title} » s'arrête là. C'était une belle histoire.`},
      {t:"Le ressortir en playlist nostalgie plus tard",p:.45,
       sD:{buzz:8,popularite:2},fD:{argent:-200},
       sMsg:"La playlist marche.",fMsg:"Personne ne rebranche.",
       sReason:`✨ « ${r.title} » retrouve un public.`,
       fReason:`💤 Tentative sans effet : le morceau reste en sommeil.`}
    ]
  };
}

function followUpPolemique(r){
  return {
    imp:2,
    title:`🔥 « ${r.title} » fait toujours parler`,
    desc:`La polémique autour du titre ne retombe pas. On vous demande de vous positionner.`,
    choices:[
      {t:"Assumer complètement",d:{buzz:10,reputation:-3},
       addFlag:"assume_polemiques",
       reason:`🔥 Vous assumez : ça fait du bruit, ça divise.`},
      {t:"Retirer le morceau des plateformes",d:{popularite:-4,reputation:4},
       fn:()=>{ r.dailyStreams = 0; r.fini = true; },
       addFlag:"a_censure_un_titre",
       reason:`🚫 « ${r.title} » retiré : la polémique s'arrête, les streams aussi.`},
      {t:"Publier une explication posée",p:.55,
       sD:{reputation:5,reseau:3},fD:{buzz:-6,reputation:-2},
       sMsg:"Le message passe.",fMsg:"Ça envenime.",
       sReason:`🕊️ Votre mise au point calme le jeu.`,
       fReason:`🥴 L'explication relance la machine à commentaires.`}
    ]
  };
}

function followUpFlop(r){
  return {
    imp:1,
    title:`🪦 Le cas « ${r.title} »`,
    desc:`Le morceau est devenu une petite blague dans le milieu. Personne ne l'a oublié, et pas pour les bonnes raisons.`,
    choices:[
      {t:"En rire publiquement",d:{buzz:6,reputation:1},
       addFlag:"autoderision",
       reason:`😅 Vous en rigolez le premier : ça désamorce, et ça plaît.`},
      {t:"Ne jamais en reparler",d:{},
       fn:()=>{ r.fini = true; },
       reason:`🤐 Le sujet est clos. On passe à autre chose.`},
      {t:"Le retravailler entièrement",d:{argent:-800},
       fn:()=>{ r.dailyStreams = Math.round(Math.max(50, r.dailyStreams) * 2.2); r.age = 0; r.fini = false; },
       addFlag:"a_reparé_un_flop",
       reason:`🛠️ Version retravaillée de « ${r.title} » : vous y croyez encore.`}
    ]
  };
}

/* Appelé à chaque chapitre : une sortie marquante et mûre déclenche
   son épisode de suivi. Une seule à la fois, pour ne jamais noyer
   l'arc narratif sous les retombées. */
export function checkReleaseFollowUps(){
  if(!Array.isArray(state.releases)) return;
  const due = state.releases.find(r=>
    r.marquee && !r.fini &&
    r.nextFollowUpChapter !== null && r.nextFollowUpChapter !== undefined &&
    state.chapter >= r.nextFollowUpChapter
  );
  if(!due) return;

  due.followUps = (due.followUps||0) + 1;

  let ep;
  if(due.marqueeReason === "polemique" && due.followUps === 1) ep = followUpPolemique(due);
  else if(due.marqueeReason === "flop") ep = followUpFlop(due);
  else if(due.marqueeReason === "hit" && due.followUps === 1) ep = followUpHit(due);
  else ep = followUpEssouffle(due);

  // Au bout de trois retombées, on arrête : le morceau a assez vécu.
  due.nextFollowUpChapter = due.followUps >= 3 ? null : state.chapter + rint(4,8);
  if(due.followUps >= 3) due.fini = true;

  queueEpisode(ep);
}

/* ============================================================
   TIRAGE ET RÉSOLUTION
============================================================ */

function poolAll(){
  // Les graines et leurs suites sont, par définition, les circonstances de
  // départ : elles doivent pouvoir tomber dès le premier épisode. Le
  // casting récurrent, lui, porte son propre jalon d'entrée en scène.
  return getNarrativePool()
    .concat(SEED_EPISODES.map(d=>({...d, source:"seed", stage: d.stage === undefined ? 0 : d.stage})))
    .concat(SEED_CHAINS.map(d=>({...d, source:"chain"})))
    .concat(DEBUT_EPISODES.map(d=>({...d, source:"debut"})))
    .concat(CAST_EPISODES.map(d=>({...d, source:"cast", min:0, max:5})));
}

/* Trois filtres, trois questions différentes — c'est leur superposition
   qui rend l'histoire cohérente avec la partie réellement jouée :

   1. LE JALON (stages.js) — « ce chapitre de votre vie a-t-il commencé ? »
      Strict, sans exception : tant que le joueur n'a pas sorti de musique,
      aucun épisode de jalon 2+ ne peut sortir, quelle que soit sa
      pondération. C'est ce qui empêche la crise financière mondiale de
      tomber à l'épisode 2 sur un label qui n'a ni artiste ni charges.

   2. L'ÉTAT VIVANT (needsArtist / needsRelease) — « y a-t-il quelqu'un
      ou quelque chose à nommer, là, maintenant ? » Un jalon est acquis
      pour toujours, un roster peut se vider.

   3. LE PALIER ÉCONOMIQUE (min/max) — le contexte de moyens du label. */
export function getEpisodePool(){
  // Mandat bloquant : le récit est suspendu, pas ralenti. Aucun épisode
  // n'est éligible tant que le joueur n'a pas fait ce qu'on lui demande —
  // c'est ce qui rend l'obligation réelle plutôt que suggérée.
  if(mandatBloquant()) return [];

  const tier = getTier().id;
  const stage = playerStage();
  const noRoster = state.signed.length === 0;
  const noRelease = !releaseDisponible();
  return poolAll().filter(d=>{
    if(stageOf(d) > stage) return false;
    if(tier < (d.min||0) || tier > (d.max === undefined ? 5 : d.max)) return false;
    if(noRoster && d.needsArtist) return false;
    if(noRelease && d.needsRelease) return false;
    if(noRoster){
      // Les événements d'origine non marqués `admin` supposent tous une
      // activité de label en cours ; ils restent hors-jeu sans personne.
      if(d.source === "event" && !d.admin) return false;
    }else if(d.admin){
      // Épisodes réservés au tout début, quand il n'y a encore personne.
      return false;
    }
    if(d.when && !d.when()) return false;
    return true;
  });
}

function pickWeighted(pool){
  const total = pool.reduce((s,d)=>s+(d.w||1),0);
  let roll = Math.random()*total;
  let def = pool[0];
  for(const d of pool){
    roll -= (d.w||1);
    if(roll <= 0){ def = d; break; }
  }
  return def;
}

/* Épisode imposé : conséquence différée, fin de contrat, retombée d'une
   sortie marquante. Il passe avant tout tirage aléatoire.
   Avec `front`, il passe même devant l'épisode déjà affiché : celui-ci
   n'est pas perdu, il repasse juste derrière. C'est ce qui garantit
   qu'un moment critique (crise financière) ne reste jamais coincé
   derrière une situation anodine. */
export function queueEpisode(ep, front){
  if(!ep) return;
  if(!Array.isArray(state.episodeQueue)) state.episodeQueue = [];
  ep.imp = ep.imp || 2;
  if(front){
    if(state.currentEpisode){
      state.episodeQueue.unshift(state.currentEpisode);
      state.currentEpisode = null;
    }
    state.episodeQueue.unshift(ep);
  }else{
    state.episodeQueue.push(ep);
  }
  if(!state.currentEpisode) drawNextEpisode();
}

/* ============================================================
   TOUJOURS UNE PORTE DE SORTIE

   Un choix dont le coût dépasse la trésorerie est refusé, et le temps
   n'avance pas. Si TOUS les choix d'un épisode coûtent de l'argent et
   que le joueur est à sec, plus rien n'est jouable : l'épisode reste à
   l'écran et la partie est bloquée pour de bon — Mamie en recharge et
   plafond d'emprunt atteint, ça arrive.

   Volontairement calculé À CHAQUE LECTURE, jamais figé dans l'épisode :
   la trésorerie peut très bien tomber APRÈS que l'épisode soit affiché
   (charges de fin de saison, salaires, intérêts). Un filet posé au
   moment du tirage laisserait exactement ce trou-là.

   C'est la seule source de vérité sur les choix d'un épisode : le rendu
   et la résolution passent tous les deux par ici, donc les index
   affichés et les index résolus ne peuvent pas diverger.
============================================================ */
const SORTIE_SECOURS = {
  t:"Vous n'avez pas les moyens — laisser filer",
  d:{credibilite:-1},
  posture:"ignorer",
  secours:true,
  reason:"💸 Faute de trésorerie, vous laissez passer. Ça se remarque."
};

export function episodeChoices(ep){
  const e = ep || state.currentEpisode;
  if(!e || !Array.isArray(e.choices) || !e.choices.length) return [];
  return e.choices.some(choiceAbordable) ? e.choices : e.choices.concat([SORTIE_SECOURS]);
}

export function drawNextEpisode(){
  if(state.currentEpisode) return state.currentEpisode;

  if(Array.isArray(state.episodeQueue) && state.episodeQueue.length){
    state.currentEpisode = state.episodeQueue.shift();
    playSound("episode");
    return state.currentEpisode;
  }

  const pool = getEpisodePool();
  if(!pool.length){ state.currentEpisode = null; return null; }

  // On évite de reservir un épisode déjà vu récemment : c'est ce qui empêche
  // une partie de tourner en rond. La fenêtre s'adapte à la taille du pool
  // disponible — inutile de bloquer 30 épisodes quand il n'y en a que 20.
  const recent = Array.isArray(state.recentEpisodeIds) ? state.recentEpisodeIds : [];
  const fenetre = Math.max(6, Math.min(30, Math.floor(pool.length * 0.6)));
  const bloques = recent.slice(0, fenetre);
  let candidates = pool.filter(d=>!bloques.includes(d.id));
  if(!candidates.length) candidates = pool;

  /* Quelques générateurs peuvent ne rien produire selon l'état de la
     partie. Plutôt que d'abandonner — ce qui laisse le joueur sans
     épisode, donc sans moyen de faire avancer le temps — on retire le
     candidat fautif et on retire au sort. */
  let def = null, ep = null, restants = candidates.slice();
  for(let essai=0; essai<8 && restants.length; essai++){
    def = pickWeighted(restants);
    ep = def.make();
    if(ep && Array.isArray(ep.choices) && ep.choices.length) break;
    restants = restants.filter(d=>d !== def);
    ep = null;
  }
  if(!ep) return null;
  ep.imp = def.imp || 1;
  ep.defId = def.id;
  ep.source = def.source;
  state.currentEpisode = ep;
  state.recentEpisodeIds = [def.id].concat(recent).slice(0,30);
  playSound("episode");
  return ep;
}

export function resolveEpisodeChoice(ci){
  const ep = state.currentEpisode;
  if(!ep) return;
  // Même source de vérité que le rendu : l'index cliqué désigne forcément
  // le bon choix, y compris la porte de secours ajoutée en fin de liste.
  const c = episodeChoices(ep)[ci];
  if(!c) return;
  if(!choiceAbordable(c)) return notify("Pas assez d'argent pour cette option.");

  state.currentEpisode = null;

  const applyFlags = ()=>{
    if(c.addFlag) addFlag(c.addFlag);
    if(c.removeFlag) removeFlag(c.removeFlag);
    if(ep.addFlag) addFlag(ep.addFlag);
    // La mémoire de conduite : ce n'est pas l'épisode qui est retenu,
    // c'est la MANIÈRE d'y avoir répondu. Répétée, elle devient une
    // réputation qui rouvre et referme des branches entières.
    enregistrerChoix(c.posture);
  };

  // Un choix résolu = un chapitre. C'est la seule chose qui fait avancer
  // le temps, et le prochain épisode est tiré juste après.
  // (non silencieux : chaque chapitre est un moment vécu par le joueur,
  // avec ses animations et ses retombées visibles)
  const next = ()=>{
    advanceChapter(false);
    drawNextEpisode();
  };

  if(c.p !== undefined){
    performRoll(c.p,()=>{
      if(c.sFn) c.sFn();
      applyFlags();
      impact(c.sD||{}, c.sReason,"pos");
      playSound("choixSucces");
    },()=>{
      if(c.fFn) c.fFn();
      applyFlags();
      impact(c.fD||{}, c.fReason,"neg");
      playSound("choixEchec");
    },c.sMsg || pick(DATA.EVENT_SUCCESS_PHRASES), c.fMsg || pick(DATA.EVENT_FAIL_PHRASES), next);
  }else{
    revealChoiceResult(()=>{
      if(c.fn) c.fn();
      applyFlags();
      impact(c.d||{}, c.reason);
      playSound("choixNeutre");
    }, next);
  }
}

/* Bouton de test admin : force le tirage d'un nouvel épisode. */
export function adminNextEpisode(){
  state.currentEpisode = null;
  drawNextEpisode();
}
