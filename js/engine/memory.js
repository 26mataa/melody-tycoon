import { adaptCost } from "./economy.js";
import { addFlag, hasFlag, queueEpisode } from "./narrative.js";
import { log, state } from "../state.js";
import { clamp, rint } from "../utils.js";

/* ============================================================
   LA MÉMOIRE DE CONDUITE — « l'histoire se souvient de vos choix »

   Le problème : le jeu compte 254 situations écrites en générique, et
   il n'était pas envisageable d'écrire à la main une conséquence
   différée pour chacune. Sans ça, chaque choix disparaissait dès qu'il
   était résolu — d'où l'impression, juste, que les choix ne servent à
   rien.

   La solution ne compte pas les épisodes mais la MANIÈRE de répondre.
   Chaque choix a déjà une posture reconnue (curated.js : assumer,
   nier, payer, trancher, protéger, exploiter, ignorer...). On tient
   simplement le compte de ces postures. Au bout de quelques fois, ce
   n'est plus un choix isolé : c'est une réputation. Le jeu la nomme,
   pose un flag durable qui rouvre et referme des branches entières, et
   envoie quelqu'un vous le dire en face.

   C'est ce qui fait que deux parties divergent vraiment : deux joueurs
   traversant exactement les mêmes 254 situations n'y répondent pas de
   la même façon, et ne deviennent donc pas le même personnage.
============================================================ */

/* Combien de fois faut-il répéter une posture pour qu'elle devienne
   votre réputation. Assez bas pour arriver dans une partie normale,
   assez haut pour que ce soit un vrai pli et pas un accident. */
export const SEUIL_REPUTATION = 4;

export const CONDUITES = {
  assume:      {flag:"reput_franc",        nom:"celui qui assume",        icone:"🪨"},
  nier:        {flag:"reput_menteur",      nom:"celui qui nie tout",      icone:"🎭"},
  payer:       {flag:"reput_acheteur",     nom:"celui qui paie",          icone:"💸"},
  rompre:      {flag:"reput_couperet",     nom:"celui qui tranche",       icone:"🔪"},
  soutenir:    {flag:"reput_protecteur",   nom:"celui qui protège",       icone:"🛡️"},
  exploiter:   {flag:"reput_charognard",   nom:"celui qui exploite",      icone:"🦅"},
  ignorer:     {flag:"reput_absent",       nom:"celui qui regarde ailleurs", icone:"🌫️"},
  excuse:      {flag:"reput_conciliant",   nom:"celui qui s'excuse",      icone:"🙇"},
  justice:     {flag:"reput_procedurier",  nom:"celui qui attaque en justice", icone:"⚖️"},
  negocier:    {flag:"reput_diplomate",    nom:"celui qui négocie",       icone:"🤝"},
  communiquer: {flag:"reput_transparent",  nom:"celui qui parle clair",   icone:"📢"},
  refuser:     {flag:"reput_intraitable",  nom:"celui qui dit non",       icone:"🚫"},
  accepter:    {flag:"reput_arrangeant",   nom:"celui qui dit oui à tout", icone:"👐"}
};

export function conduiteCompte(posture){
  return (state.conduite && state.conduite[posture]) || 0;
}

/* La posture dominante de la partie, s'il y en a une. Sert au bilan de
   fin de saison et à l'épilogue de retraite. */
export function conduiteDominante(){
  const c = state.conduite || {};
  let best = null, n = 0;
  Object.keys(c).forEach(k=>{
    if(c[k] > n && CONDUITES[k]){ n = c[k]; best = k; }
  });
  return n >= SEUIL_REPUTATION ? {posture:best, n, ...CONDUITES[best]} : null;
}

/* Appelé à chaque choix résolu. Incrémente, et au franchissement du
   seuil : pose le flag durable + envoie la confrontation. Le flag ne se
   pose qu'une fois — mais le compteur, lui, continue de monter (c'est
   lui que lit l'épilogue). */
export function noterConduite(posture){
  if(!posture || !CONDUITES[posture]) return;
  if(!state.conduite || typeof state.conduite !== "object") state.conduite = {};
  state.conduite[posture] = (state.conduite[posture] || 0) + 1;

  const def = CONDUITES[posture];
  if(state.conduite[posture] === SEUIL_REPUTATION && !hasFlag(def.flag)){
    addFlag(def.flag);
    log(`${def.icone} On commence à vous connaître comme ${def.nom}.`,"info");
    const ep = CONFRONTATIONS[posture];
    if(ep) queueEpisode(ep(), true);
  }
}

/* ============================================================
   LES CONFRONTATIONS — le moment où on vous renvoie votre pli.
   Chacune propose de persévérer (renforce le flag et ses branches),
   de s'en défendre, ou de changer (retire le flag : une réputation
   peut se rattraper, mais ça coûte).
============================================================ */

function romprePli(flag, cout){
  return ()=>{
    state.storyFlags = (state.storyFlags||[]).filter(f=>f !== flag);
    addFlag("a_change_de_methode");
    if(cout) state.argent -= cout;
  };
}

const CONFRONTATIONS = {
  assume: ()=>({
    imp:2,
    title:"🪨 « Tu ne recules jamais, toi »",
    desc:"Un vieux de la profession vous coince en fin de soirée. « J'ai remarqué. Tu assumes toujours, même quand tu as tort. C'est rare. C'est utile. C'est aussi comme ça qu'on se fait des ennemis pour la vie. »",
    choices:[
      {t:"C'est comme ça que je fonctionne", d:{credibilite:5, notoriete:2}, addFlag:"assume_jusqu_au_bout",
       reason:"🪨 Vous revendiquez votre façon de faire. Le milieu sait maintenant à quoi s'attendre avec vous."},
      {t:"Reconnaître que ça m'a coûté cher", d:{credibilite:2}, addFlag:"lucide_sur_soi",
       reason:"🪨 Vous reconnaissez le prix payé. Ça se respecte aussi."},
      {t:"Apprendre à me taire de temps en temps", d:{}, fn:romprePli("reput_franc"),
       reason:"🪨 Vous décidez de choisir vos combats. Nouvelle méthode."}
    ]
  }),

  nier: ()=>({
    imp:2,
    title:"🎭 Le dossier qu'on a sur vous",
    desc:"Une journaliste vous montre son carnet : trois démentis de votre part, trois fois où les faits lui ont donné raison. « Je ne publie pas encore. Je voulais juste que vous sachiez que je compte. »",
    choices:[
      {t:"Nier une fois de plus", p:.35, sD:{notoriete:4}, fD:{credibilite:-12, notoriete:6},
       sMsg:"Elle lâche l'affaire.", fMsg:"Elle publie tout.",
       sReason:"🎭 Vous niez encore, et ça passe encore. Un jour ça ne passera plus.",
       fReason:"🎭 L'article sort : trois mensonges alignés noir sur blanc. Votre parole ne vaut plus rien.",
       addFlag:"menteur_confirme"},
      {t:"Tout lui raconter, en off", d:{credibilite:6, notoriete:-3}, fn:romprePli("reput_menteur"),
       addFlag:"a_dit_la_verite_une_fois",
       reason:"🎭 Vous videz votre sac en off. Elle ne publie pas. Vous, vous avez changé quelque chose."},
      {t:"Lui proposer un deal", d:{argent:-Math.round(adaptCost("moyen"))}, addFlag:"achete_la_presse",
       reason:"🎭 Vous achetez son silence. Elle prend. Elle garde le carnet."}
    ]
  }),

  payer: ()=>({
    imp:2,
    title:"💸 « Tu paies toujours, en fait »",
    desc:"Votre comptable pose les chiffres sur la table : les sommes sorties pour éteindre des incendies dépassent ce que vous avez investi en musique. « À un moment il va falloir arrêter d'acheter la paix. »",
    choices:[
      {t:"C'est le prix de la tranquillité", d:{credibilite:-3}, addFlag:"achete_toujours_la_paix",
       reason:"💸 Vous assumez : payer, c'est votre façon de régler les choses. Ça se sait, et les prix montent."},
      {t:"Refuser de payer la prochaine fois", d:{credibilite:4}, fn:romprePli("reput_acheteur"),
       addFlag:"ne_paie_plus",
       reason:"💸 Vous fermez le robinet. La prochaine crise, il faudra la traverser autrement."},
      {t:"Mettre en place un vrai budget de crise", d:{argent:-Math.round(adaptCost("petit")), credibilite:3},
       addFlag:"gestionnaire",
       reason:"💸 Vous professionnalisez la chose : au moins, c'est prévu et cadré."}
    ]
  }),

  rompre: ()=>({
    imp:2,
    title:"🔪 La liste de ceux que vous avez virés",
    desc:"Elle circule. Quelqu'un l'a écrite pour rire, elle n'est plus drôle. Un artiste que vous vouliez signer vous l'a envoyée avant de décliner.",
    choices:[
      {t:"Assumer : un label n'est pas une famille", d:{credibilite:-4, notoriete:3},
       addFlag:"couperet_assume",
       reason:"🔪 Vous assumez la méthode. Vous recruterez moins facilement, mais personne ne se trompera sur le contrat."},
      {t:"Renouer avec l'un d'eux", d:{credibilite:6, argent:-Math.round(adaptCost("petit"))},
       fn:romprePli("reput_couperet"), addFlag:"a_repare_une_rupture",
       reason:"🔪 Vous rappelez quelqu'un que vous aviez viré. La conversation est dure, elle répare quelque chose."},
      {t:"Ne rien faire, ça passera", d:{credibilite:-2}, addFlag:"reput_absent",
       reason:"🔪 Vous laissez la liste vivre sa vie. Elle vous suivra un moment."}
    ]
  }),

  soutenir: ()=>({
    imp:1,
    title:"🛡️ On parle de vous en bien",
    desc:"Un artiste que vous ne connaissez pas vous écrit : il a entendu comment vous défendez les vôtres, et c'est pour ça qu'il veut travailler avec vous. Pas pour l'argent.",
    choices:[
      {t:"C'est exactement le label que je veux", d:{credibilite:8}, addFlag:"maison_de_confiance",
       reason:"🛡️ Votre réputation de patron protecteur devient un vrai argument de recrutement."},
      {t:"Le prévenir que ça a ses limites", d:{credibilite:3}, addFlag:"honnete_sur_les_limites",
       reason:"🛡️ Vous refusez de survendre. Il apprécie encore plus."},
      {t:"En faire un axe de communication", d:{notoriete:6, credibilite:-2}, addFlag:"communique_sur_ses_valeurs",
       reason:"🛡️ Vous en faites un argument public. Efficace — et un peu moins sincère d'un coup."}
    ]
  }),

  exploiter: ()=>({
    imp:2,
    title:"🦅 « Vous vivez des malheurs des autres »",
    desc:"Un plateau télé, une question qui ne prévient pas : chaque drame de votre entourage a fini en contenu, en clip, en punchline. On vous demande de vous justifier en direct.",
    choices:[
      {t:"Assumer : c'est le métier", d:{notoriete:10, credibilite:-8},
       addFlag:"charognard_assume",
       reason:"🦅 Vous assumez en direct. Le clip du passage tourne partout. On vous déteste un peu plus, on vous regarde beaucoup plus."},
      {t:"Reconnaître que je suis allé trop loin", d:{credibilite:7, notoriete:-4},
       fn:romprePli("reput_charognard"), addFlag:"a_fait_son_mea_culpa",
       reason:"🦅 Vous reconnaissez publiquement être allé trop loin. Ça surprend, et ça répare."},
      {t:"Retourner la question au journaliste", p:.5,
       sD:{notoriete:8, credibilite:3}, fD:{credibilite:-6},
       sMsg:"Le retournement fait mouche.", fMsg:"Ça passe pour de la fuite.",
       sReason:"🦅 Vous renvoyez la question au média qui vit des mêmes drames. Le public adore.",
       fReason:"🦅 Votre esquive se voit. Personne n'est dupe."}
    ]
  }),

  ignorer: ()=>({
    imp:2,
    title:"🌫️ Personne ne vous a vu venir",
    desc:"Un de vos proches du milieu le dit sans méchanceté : quand ça chauffe, vous n'êtes jamais là. « On ne te reproche rien. C'est juste qu'on ne compte plus sur toi. »",
    choices:[
      {t:"Me réveiller, maintenant", d:{credibilite:5}, fn:romprePli("reput_absent"),
       addFlag:"a_repris_la_main",
       reason:"🌫️ Vous décidez de reprendre position. Il faudra le prouver plusieurs fois."},
      {t:"Assumer : je ne suis pas là pour les drames", d:{credibilite:-2}, addFlag:"reste_a_l_ecart",
       reason:"🌫️ Vous assumez votre retrait. Certains respectent, la plupart passent à autre chose."},
      {t:"Payer une tournée générale et faire semblant", d:{argent:-Math.round(adaptCost("petit"))},
       reason:"🌫️ Vous payez le bar. Ça ne règle rien, mais la soirée était bonne."}
    ]
  })
};

/* ============================================================
   LE RETOUR DE BÂTON — un choix précis qui revient vous chercher.

   Complément individuel de la mémoire de conduite : les postures
   risquées (nier, exploiter, acheter le silence, trancher) laissent une
   trace qui peut ressurgir 3 à 8 épisodes plus tard. Pas
   systématiquement — sinon le jeu devient punitif et prévisible.
============================================================ */

const RETOURS = {
  nier: ()=>({
    imp:2,
    title:"🕳️ Ça ressort",
    desc:"L'affaire que vous aviez démentie refait surface, avec des preuves cette fois. Quelqu'un avait gardé les captures.",
    choices:[
      {t:"Avouer maintenant", d:{credibilite:-4, notoriete:3}, addFlag:"a_fini_par_avouer",
       reason:"🕳️ Vous finissez par reconnaître les faits. Tard, mais vous le faites."},
      {t:"Nier encore", p:.3, sD:{notoriete:5}, fD:{credibilite:-10, notoriete:8},
       sMsg:"Incroyablement, ça tient.", fMsg:"Cette fois personne n'y croit.",
       sReason:"🕳️ Vous tenez votre version. Ça passe de justesse.",
       fReason:"🕳️ Le double démenti vous achève : plus personne ne vous croit sur rien."},
      {t:"Faire retirer les preuves à prix d'or", d:{argent:-Math.round(adaptCost("gros"))},
       addFlag:"achete_le_silence",
       reason:"🕳️ Vous payez très cher pour que ça disparaisse. Pour l'instant."}
    ]
  }),
  exploiter: ()=>({
    imp:1,
    title:"↩️ Le boomerang",
    desc:"Le drame que vous aviez transformé en contenu revient dans la conversation — mais cette fois c'est vous qu'on met en scène.",
    choices:[
      {t:"Jouer le jeu jusqu'au bout", d:{notoriete:7, credibilite:-4}, addFlag:"joue_le_jeu_mediatique",
       reason:"↩️ Vous rentrez dans le jeu. Le cirque continue, à vos dépens et à votre profit."},
      {t:"Couper court publiquement", d:{credibilite:4, notoriete:-3},
       reason:"↩️ Vous mettez fin au cirque. On vous laisse tranquille, on parle moins de vous."},
      {t:"Ne plus jamais recommencer", d:{credibilite:3}, addFlag:"a_change_de_methode",
       reason:"↩️ Vous vous fixez une limite. Il faudra s'y tenir."}
    ]
  }),
  payer: ()=>({
    imp:1,
    title:"💰 Il revient",
    desc:"La personne que vous aviez payée pour se taire est de retour. Elle a réfléchi : la somme lui paraît un peu basse, avec le recul.",
    choices:[
      {t:"Repayer, plus cher", d:{argent:-Math.round(adaptCost("gros"))}, addFlag:"paie_encore",
       reason:"💰 Vous repayez. Il y aura une troisième fois."},
      {t:"Refuser et assumer les conséquences", p:.5,
       sD:{credibilite:5}, fD:{credibilite:-8, notoriete:6},
       sMsg:"Elle n'ose pas aller plus loin.", fMsg:"Elle balance tout.",
       sReason:"💰 Vous tenez bon et le chantage s'effondre.",
       fReason:"💰 Elle publie tout. Le silence acheté vous coûte finalement bien plus cher."},
      {t:"Porter plainte pour chantage", d:{credibilite:3, notoriete:4}, addFlag:"a_porte_plainte",
       reason:"💰 Vous judiciarisez. L'affaire devient publique, mais vous n'êtes plus le coupable."}
    ]
  }),
  rompre: ()=>({
    imp:1,
    title:"🚪 Celui que vous aviez viré",
    desc:"La personne que vous aviez écartée sans ménagement a rebondi ailleurs. Et elle est maintenant en position de vous rendre service — ou pas.",
    choices:[
      {t:"L'appeler et reconnaître mes torts", p:.55,
       sD:{credibilite:7}, fD:{credibilite:-2},
       sMsg:"Elle accepte de vous parler.", fMsg:"Elle raccroche.",
       sReason:"🚪 La conversation répare quelque chose. Elle vous ouvre une porte.",
       fReason:"🚪 Elle raccroche. Vous aviez laissé trop de casse.",
       addFlag:"a_repare_une_rupture"},
      {t:"Passer par quelqu'un d'autre", d:{argent:-Math.round(adaptCost("moyen"))},
       reason:"🚪 Vous contournez. Ça coûte, ça évite la conversation."},
      {t:"S'en passer", d:{}, reason:"🚪 Vous vous en passez. Vous vous en passerez encore."}
    ]
  })
};

/* Programme un retour de bâton pour une posture donnée. Le délai (3 à 8
   épisodes) est assez long pour qu'on ait oublié le choix d'origine, et
   assez court pour qu'on fasse le lien quand ça revient. */
export function programmerRetour(posture){
  if(!RETOURS[posture]) return;
  if(!Array.isArray(state.retoursEnAttente)) state.retoursEnAttente = [];
  // Un seul retour en attente par posture : on ne veut pas quatre fois
  // le même boomerang parce que le joueur a menti quatre fois.
  if(state.retoursEnAttente.some(r=>r.posture === posture)) return;
  state.retoursEnAttente.push({posture, dueChapter: state.chapter + rint(3,8)});
}

/* Appelé à chaque chapitre depuis advanceChapter(). */
export function checkRetours(){
  if(!Array.isArray(state.retoursEnAttente) || !state.retoursEnAttente.length) return;
  const du = state.retoursEnAttente.filter(r=>r.dueChapter <= state.chapter);
  if(!du.length) return;
  state.retoursEnAttente = state.retoursEnAttente.filter(r=>r.dueChapter > state.chapter);
  du.forEach(r=>{
    const gen = RETOURS[r.posture];
    if(gen) queueEpisode(gen());
  });
}

/* Point d'entrée appelé à chaque choix résolu, depuis narrative.js.
   `posture` vient du choix curaté ; les épisodes écrits à la main la
   déclarent explicitement s'ils veulent compter dans la mémoire. */
export function enregistrerChoix(posture){
  if(!posture) return;
  noterConduite(posture);
  // Les postures qui laissent une dette morale peuvent revenir. Une fois
  // sur trois : assez pour qu'on s'en méfie, pas assez pour que ce soit
  // une punition mécanique.
  if(RETOURS[posture] && Math.random() < .34) programmerRetour(posture);
}
