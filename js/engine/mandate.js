import { impact } from "./economy.js";
import { addFlag } from "./narrative.js";
import { playerStage } from "./stages.js";
import { playSound } from "./sound.js";
import { log, state } from "../state.js";
import { clamp, rint } from "../utils.js";

/* ============================================================
   LES MANDATS — quand l'histoire ne propose plus, elle exige.

   Un épisode ordinaire pose une question et encaisse la réponse. Un
   mandat, lui, réclame un ACTE dans le jeu : signer quelqu'un, lancer
   une production, éponger une dette. Il ne bloque pas le récit — les
   épisodes continuent de tomber — mais un bandeau reste à l'écran avec
   un compte à rebours en épisodes, et si le compteur touche zéro, la
   sanction tombe pour de bon : un artiste s'en va, une dette explose,
   une porte se ferme.

   Chaque issue, tenue comme ratée, pose un flag durable : c'est ce qui
   fait que deux parties divergent réellement. Tenir ses engagements
   ouvre des branches que rater ferme, et réciproquement.

   Un seul mandat à la fois, volontairement : deux comptes à rebours
   simultanés transformeraient le jeu en liste de corvées.

   Le state est sérialisé en JSON : il ne retient donc qu'un identifiant
   et une échéance (`state.mandate`), jamais de fonction. Toute la
   logique vit dans ce registre.
============================================================ */

export const MANDATE_DEFS = {

  signer_premier: {
    icone:"🎤",
    /* BLOQUANT : tant qu'il n'y a personne à produire, l'histoire
       s'arrête. Sans ça, on pouvait traverser des saisons entières, voir
       défiler des dizaines d'épisodes et vieillir de dix ans sans avoir
       jamais signé un artiste — le jeu tournait à vide et récompensait
       de ne rien faire. Le repérage étant gratuit, il n'existe aucun
       état où le joueur serait coincé sans issue. */
    bloquant:true,
    titre:"Un label sans personne dedans",
    texte:()=>`Vous avez un nom, des cartes de visite et zéro voix. Il n'y a rien à raconter tant qu'il n'y a personne à produire. Le repérage est gratuit — allez chercher quelqu'un.`,
    delai:()=>rint(5,7),
    cta:{label:"Aller chercher un artiste", tab:"label", sub:"recruter"},
    rempli:()=>state.signed.length > 0,
    quandTenu:()=>{
      addFlag("a_demarre_vite");
      impact({credibilite:4}, "🎤 Vous avez signé sans traîner : le milieu note que vous savez décider.", "pos");
    },
    quandRate:()=>{
      addFlag("a_tarde_a_demarrer");
      impact({credibilite:-5}, "🎤 Des mois sans signer personne : dans le milieu, on commence à vous prendre pour un rêveur.", "neg");
    }
  },

  produire_premier: {
    icone:"🎛️",
    /* Volontairement NON bloquant, contrairement au recrutement. Un
       blocage rendrait sa sanction inatteignable — on ne peut pas rater
       une échéance qu'on est empêché de dépasser — et c'est justement
       cette sanction qui a de la valeur ici : l'artiste laissé en
       vitrine finit par claquer la porte. Le drame vaut mieux que le
       mur. Le blocage dur reste réservé au seul cas où le jeu n'a
       littéralement rien à raconter : un label sans personne. */
    titre:"Votre artiste tourne en rond",
    texte:()=>{
      const a = artisteCible();
      return `${a ? a.name : "Votre artiste"} a signé et attend. Pas de studio, pas de projet, rien. On ne garde pas quelqu'un en vitrine indéfiniment.`;
    },
    delai:()=>rint(5,8),
    cta:{label:"Lancer un projet", tab:"label", sub:"production"},
    rempli:()=>state.projects.length > 0 || state.releases.length > 0,
    quandTenu:()=>{
      addFlag("met_les_artistes_au_travail");
      const a = artisteCible();
      if(a) a.humeur = clamp(a.humeur + 12, 0, 100);
      log("🎛️ Vous mettez enfin votre artiste en studio : le moral remonte d'un coup.","pos");
    },
    quandRate:()=>{
      const a = artisteCible();
      addFlag("a_laisse_tomber_un_artiste");
      if(a){
        state.signed = state.signed.filter(x=>x.id !== a.id);
        log(`💔 ${a.name} claque la porte : « J'ai signé pour faire de la musique, pas pour attendre. »`,"neg");
      }
      impact({credibilite:-6}, "💔 Un artiste laissé à l'abandon, ça se raconte vite.", "neg");
    }
  },

  eponger_dette: {
    icone:"🏦",
    titre:"La banque ne rigole plus",
    texte:()=>`Votre trésorerie est dans le rouge et la dette court. Le conseiller a été clair : remontez au-dessus de zéro, ou les conditions changent.`,
    delai:()=>rint(6,9),
    cta:{label:"Voir les finances", tab:"finance"},
    rempli:()=>state.argent >= 0,
    quandTenu:()=>{
      addFlag("a_redresse_la_barre");
      impact({credibilite:5}, "🏦 Vous avez redressé la trésorerie dans les temps : la banque vous regarde autrement.", "pos");
    },
    quandRate:()=>{
      addFlag("a_coule_une_fois");
      const penalite = Math.round(Math.max(500, state.bank.dette * 0.3));
      state.bank.dette += penalite;
      log(`🏦 Délai dépassé : pénalités et intérêts majorés, la dette grimpe de ${penalite} €.`,"neg");
      impact({credibilite:-4}, "🏦 Un label qui ne paie pas, ça circule.", "neg");
    }
  },

  sauver_moral: {
    icone:"😔",
    titre:"Quelqu'un est à bout",
    texte:()=>{
      const a = artisteCible();
      return `${a ? a.name : "Un de vos artistes"} ne va pas bien du tout. Ça se voit en studio, ça s'entend sur les prises. Il faut faire quelque chose maintenant.`;
    },
    delai:()=>rint(4,6),
    cta:{label:"Voir l'artiste", tab:"label", sub:"artistes"},
    rempli:()=>{
      const a = artisteCible();
      return !a || a.humeur >= 45;
    },
    quandTenu:()=>{
      addFlag("prend_soin_de_son_monde");
      impact({credibilite:4}, "🤝 Vous avez tenu la main à quelqu'un au bon moment. Ça ne s'oublie pas.", "pos");
    },
    quandRate:()=>{
      const a = artisteCible();
      addFlag("a_laisse_tomber_un_artiste");
      if(a){
        a.humeur = clamp(a.humeur - 20, 0, 100);
        log(`😔 ${a.name} s'enfonce : plus personne n'y croit dans l'équipe.`,"neg");
      }
      impact({credibilite:-5}, "😔 On vous a vu regarder ailleurs pendant que quelqu'un coulait.", "neg");
    }
  },

  repondre_polemique: {
    icone:"🔥",
    titre:"Le silence commence à peser",
    texte:()=>`La polémique enfle et vous n'avez toujours rien dit. Chaque jour de silence est lu comme un aveu.`,
    delai:()=>rint(3,5),
    cta:{label:"Voir le label", tab:"label", sub:"artistes"},
    // Se règle par un choix narratif : dès qu'un flag de prise de position
    // existe, le mandat est considéré rempli.
    rempli:()=>["assume_polemiques","a_censure_un_titre","autoderision"].some(f=>(state.storyFlags||[]).includes(f)),
    quandTenu:()=>{
      addFlag("sait_gerer_une_crise");
      impact({credibilite:3}, "🔥 Vous avez pris position. Peu importe laquelle : vous avez parlé.", "pos");
    },
    quandRate:()=>{
      addFlag("fuit_les_polemiques");
      impact({notoriete:-4, credibilite:-6}, "🔥 Votre silence a duré trop longtemps : l'histoire s'est écrite sans vous.", "neg");
    }
  },

  recruter_beatmaker: {
    icone:"🎚️",
    titre:"Personne ne fabrique vos instrus",
    texte:()=>`Vos artistes rappent sur des prods achetées à droite à gauche, et ça s'entend. Un beatmaker maison, c'est ce qui donne un son au label.`,
    delai:()=>rint(7,10),
    cta:{label:"Recruter un beatmaker", tab:"label", sub:"recruter"},
    rempli:()=>state.beatmakers.length > 0,
    quandTenu:()=>{
      addFlag("a_un_son_maison");
      impact({credibilite:5}, "🎚️ Un beatmaker maison : votre label commence à avoir une identité sonore.", "pos");
    },
    quandRate:()=>{
      addFlag("son_de_seconde_main");
      impact({credibilite:-4}, "🎚️ Toujours pas de prod maison. On reconnaît vos sons à leur absence de signature.", "neg");
    }
  },

  poster_reseaux: {
    icone:"📱",
    titre:"Vous n'existez pas en ligne",
    texte:()=>`Vous avez sorti de la musique et vos comptes sont morts. Aujourd'hui, un label muet sur les réseaux est un label qui n'existe pas.`,
    delai:()=>rint(5,8),
    cta:{label:"Ouvrir les réseaux", tab:"label", sub:"reseaux"},
    rempli:()=>(state.social && state.social.posts || []).length > 0,
    quandTenu:()=>{
      addFlag("presence_en_ligne");
      impact({notoriete:5}, "📱 Vous prenez enfin la parole en ligne. Les gens répondent.", "pos");
    },
    quandRate:()=>{
      addFlag("absent_des_reseaux");
      impact({notoriete:-5}, "📱 Silence complet en ligne. D'autres occupent l'espace à votre place.", "neg");
    }
  },

  negocier_contrat: {
    icone:"📄",
    titre:"Un contrat arrive à son terme",
    texte:()=>{
      const a = (state.signed || []).slice().sort((x,y)=>(x.contractRemaining||99)-(y.contractRemaining||99))[0];
      return `${a ? a.name : "Un de vos artistes"} arrive en fin de contrat. Si vous ne vous asseyez pas à la table, il partira sans que vous ayez rien tenté.`;
    },
    delai:()=>rint(3,5),
    cta:{label:"Voir mes artistes", tab:"label", sub:"artistes"},
    rempli:()=>(state.negotiationsCompleted || 0) > 0 ||
               !(state.signed || []).some(a=>(a.contractRemaining||99) <= 6),
    quandTenu:()=>{
      addFlag("sait_negocier");
      impact({credibilite:4}, "📄 Vous avez traité le contrat avant qu'il ne vous explose entre les mains.", "pos");
    },
    quandRate:()=>{
      addFlag("laisse_filer_les_contrats");
      impact({credibilite:-5}, "📄 Un contrat laissé pourrir jusqu'au bout. Les agents s'en souviendront.", "neg");
    }
  },

  reveiller_le_label: {
    icone:"💤",
    titre:"Plus rien ne sort",
    texte:()=>`Aucun projet en studio, aucune sortie depuis un moment. Un label qui ne sort rien disparaît des conversations en une saison.`,
    delai:()=>rint(5,7),
    cta:{label:"Lancer un projet", tab:"label", sub:"production"},
    rempli:()=>state.projects.length > 0,
    quandTenu:()=>{
      impact({notoriete:3}, "🎛️ La machine repart : quelque chose est de nouveau en studio.", "pos");
    },
    quandRate:()=>{
      addFlag("label_en_sommeil");
      impact({notoriete:-6, credibilite:-3}, "💤 Des mois sans rien produire. On parle de vous au passé.", "neg");
    }
  }
};

/* L'artiste concerné par le mandat en cours (mémorisé à l'ouverture pour
   que la sanction frappe bien la bonne personne, même si le roster bouge). */
function artisteCible(){
  const m = state.mandate;
  if(!m || !m.artistId) return state.signed[0] || null;
  return state.signed.find(a=>a.id === m.artistId) || null;
}

export function mandatActif(){
  if(!state.mandate) return null;
  const def = MANDATE_DEFS[state.mandate.id];
  return def ? def : null;
}

export function mandatEpisodesRestants(){
  if(!state.mandate) return 0;
  return Math.max(0, state.mandate.dueChapter - state.chapter);
}

/* Y a-t-il un mandat qui SUSPEND le récit ?

   Un mandat ordinaire vit en arrière-plan : les épisodes continuent de
   tomber, le compte à rebours court, une sanction finit par tomber. Un
   mandat bloquant, lui, arrête tout — aucun épisode n'est tiré tant que
   l'acte n'est pas fait.

   Conséquence voulue : le temps ne passe plus non plus (c'est la
   résolution d'un épisode qui fait avancer un chapitre), donc rien ne
   se dégrade pendant que le joueur est bloqué. Il n'est pas puni
   d'être là, il est simplement obligé d'agir. Ces mandats ne visent que
   des actions toujours réalisables — le repérage d'artiste est gratuit,
   lancer un projet aussi — il n'existe donc aucun cul-de-sac. */
export function mandatBloquant(){
  const def = mandatActif();
  return def && def.bloquant ? def : null;
}

/* Ouvre un mandat. Refuse silencieusement s'il y en a déjà un en cours
   (un seul compte à rebours à la fois) ou si l'objectif est déjà atteint. */
export function ouvrirMandat(id, artistId){
  if(state.mandate) return false;
  const def = MANDATE_DEFS[id];
  if(!def) return false;
  if(def.rempli()) return false;

  state.mandate = {
    id,
    dueChapter: state.chapter + def.delai(),
    artistId: artistId || (state.signed[0] ? state.signed[0].id : null),
    ouvertAu: state.chapter
  };
  // Un mandat bloquant chasse l'épisode affiché : on ne laisse pas le
  // joueur résoudre un choix qui contournerait l'obligation.
  if(def.bloquant) state.currentEpisode = null;
  log(def.bloquant
    ? `${def.icone} ${def.titre} — l'histoire attend que ce soit fait.`
    : `${def.icone} ${def.titre} — vous avez ${mandatEpisodesRestants()} épisodes.`, "info");
  playSound("episode");
  return true;
}

/* Appelé une fois par chapitre, depuis advanceChapter(). Trois issues :
   rempli à temps, échéance dépassée, ou rien encore (on laisse courir). */
export function checkMandat(){
  if(!state.mandate) return;
  const def = MANDATE_DEFS[state.mandate.id];
  if(!def){ state.mandate = null; return; }

  if(def.rempli()){
    state.mandate = null;
    def.quandTenu();
    playSound("choixSucces");
    return;
  }

  // Un mandat bloquant n'a pas d'échéance qui tombe : le temps ne passe
  // pas tant qu'il est là, et sanctionner quelqu'un qu'on empêche
  // d'avancer n'aurait aucun sens. Il reste jusqu'à ce que ce soit fait.
  if(def.bloquant) return;

  if(state.chapter >= state.mandate.dueChapter){
    state.mandate = null;
    def.quandRate();
    playSound("choixEchec");
  }
}

/* ============================================================
   DÉCLENCHEMENT AUTOMATIQUE

   Les mandats ne tombent pas au hasard : ils naissent de la situation
   réelle du joueur. C'est l'autre moitié du correctif de cohérence —
   là où le filtre par jalon empêche les épisodes absurdes, ceci fait
   apparaître ceux que la partie appelle vraiment.

   L'ordre compte : c'est un ordre d'urgence. Le premier qui s'applique
   gagne, les autres attendront leur tour.
============================================================ */
export function peutDeclencherMandat(){
  if(state.mandate) return null;
  const stage = playerStage();

  // Quelqu'un est en train de sombrer : ça passe avant tout le reste.
  const detresse = state.signed.find(a=>a.humeur < 30);
  if(detresse) return {id:"sauver_moral", artistId:detresse.id};

  // La trésorerie coule et il y a une dette derrière.
  if(state.argent < 0 && state.bank.dette > 0) return {id:"eponger_dette"};

  // Un label sans personne, passé les tout premiers épisodes.
  if(stage === 0 && state.chapter >= 3 && state.signed.length === 0) return {id:"signer_premier"};

  // Un artiste sous contrat depuis un moment et toujours rien en studio.
  if(state.signed.length > 0 && state.projects.length === 0 && state.releases.length === 0 && state.chapter >= 6){
    return {id:"produire_premier", artistId: state.signed[0].id};
  }

  // Une polémique en cours à laquelle personne n'a répondu.
  const polemique = (state.releases||[]).some(r=>r.marquee && r.marqueeReason === "polemique" && !r.fini);
  if(polemique && !MANDATE_DEFS.repondre_polemique.rempli()) return {id:"repondre_polemique"};

  return null;
}

/* Point d'entrée unique appelé par le moteur à chaque chapitre :
   on solde d'abord le mandat en cours, puis on regarde si la situation
   en réclame un nouveau. */
export function tickMandats(){
  checkMandat();
  const suivant = peutDeclencherMandat();
  if(suivant) ouvrirMandat(suivant.id, suivant.artistId);
}

/* Un mandat bloquant crée un paradoxe qu'il faut traiter à part : tant
   qu'il est là, aucun épisode ne se résout, donc aucun chapitre
   n'avance, donc tickMandats() — appelé depuis advanceChapter() — ne
   tourne jamais. Le mandat resterait affiché pour toujours, même une
   fois l'artiste signé.

   D'où ce point d'entrée séparé, appelé à chaque rendu : il ne fait
   qu'une chose, refermer un mandat bloquant dont l'objectif vient
   d'être atteint. Il n'ouvre rien et ne sanctionne rien. */
export function libererSiMandatRempli(){
  const def = mandatBloquant();
  if(!def) return false;
  if(!def.rempli()) return false;
  state.mandate = null;
  def.quandTenu();
  playSound("choixSucces");
  return true;
}
