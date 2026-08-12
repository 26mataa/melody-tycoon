/* ============================================================
   CONTENU NARRATIF — situations de vie du manager.
   Ce fichier ne contient plus que des définitions : le tirage et la
   résolution vivent dans engine/narrative.js, qui fusionne ce pool
   avec celui des événements (EVENT_DEFS) en un seul flux d'épisodes.

   Argent gagné volontairement modeste : le vrai revenu du jeu doit
   venir du label (sorties, streams), pas d'un grind. Rien n'est connu
   d'une option avant de l'avoir choisie.
============================================================ */
import { rA } from "./artists.js";
import { state } from "../state.js";
import { clamp, rint } from "../utils.js";

export const DAILY_POOL = [
  // ---- Hustle modeste (jamais gratuit ni énorme) ----
  {min:0,max:5,w:3,id:"petit_taf",make:()=>({
    title:"💼 Un petit taf en plus",
    desc:"Un contact propose un coup de main payant sur un événement, rien à voir avec la musique.",
    choices:[
      {t:"Accepter, ça paie les factures",fn:()=>{ state.player.energy=clamp(state.player.energy-10,0,100); },d:{argent:rint(80,220)},reason:"💼 Petit boulot fait : quelques euros de plus, un peu d'énergie en moins."},
      {t:"Décliner, ce n'est pas votre truc",d:{},reason:"💼 Vous déclinez, votre temps vaut mieux que ça."}
    ]
  })},
  {min:0,max:5,w:2,id:"vide_dressing",make:()=>({
    title:"👕 Vide-dressing improvisé",
    desc:"Vous retombez sur du vieux merch et des goodies oubliés dans un carton.",
    choices:[
      {t:"Tout revendre en ligne",d:{argent:rint(40,150)},reason:"👕 Petite vente qui fait toujours plaisir."},
      {t:"Garder, ça a de la valeur sentimentale",d:{},fn:()=>{ state.player.stress=clamp(state.player.stress-4,0,100); },reason:"👕 Vous gardez vos souvenirs : un peu de sérénité."}
    ]
  })},
  {min:1,max:5,w:2,id:"consulting",make:()=>({
    title:"🎧 Demande de conseil",
    desc:"Un label plus petit que le vôtre demande vos conseils, moyennant rémunération.",
    choices:[
      {t:"Accepter la mission",p:.7,sD:{argent:rint(150,350),reseau:2},fD:{argent:rint(-50,0)},sMsg:"Mission réussie, ils sont ravis.",fMsg:"Vos conseils tombent à plat, ambiance froide.",sReason:"🎧 Conseil payant fructueux.",fReason:"🎧 Conseil qui ne passe pas."},
      {t:"Refuser, pas le temps",d:{},reason:"🎧 Vous refusez poliment."}
    ]
  })},

  // ---- Repos / énergie / stress ----
  {min:0,max:5,w:4,id:"grasse_matinee",make:()=>({
    title:"😴 Grasse matinée",
    desc:"Vous pourriez rester au lit un peu plus longtemps ce matin.",
    choices:[
      {t:"Rester au lit",fn:()=>{ state.player.energy=clamp(state.player.energy+18,0,100); state.player.stress=clamp(state.player.stress-6,0,100); },d:{},reason:"😴 Grasse matinée méritée : +Énergie, -Stress."},
      {t:"Se lever quand même, y'a du travail",fn:()=>{ state.player.stress=clamp(state.player.stress+3,0,100); },d:{},reason:"😴 Vous forcez le réveil : un peu plus de stress."}
    ]
  })},
  {min:0,max:5,w:3,id:"sport",make:()=>({
    title:"🏃 Séance de sport",
    desc:"Une salle vient d'ouvrir en bas de chez vous.",
    choices:[
      {t:"Y aller",fn:()=>{ state.player.stress=clamp(state.player.stress-10,0,100); },d:{argent:-30},reason:"🏃 Séance de sport : -Stress, -30€ d'abonnement."},
      {t:"Pas le temps",d:{},reason:"🏃 Vous remettez ça à plus tard."}
    ]
  })},
  {min:0,max:5,w:3,id:"soiree_amis",make:()=>({
    title:"🍻 Soirée entre amis",
    desc:"Vos amis d'avant le label vous invitent, ça fait longtemps.",
    choices:[
      {t:"Y aller à fond",fn:()=>{ state.player.stress=clamp(state.player.stress-12,0,100); state.player.energy=clamp(state.player.energy-8,0,100); },d:{argent:-40},reason:"🍻 Soirée qui fait du bien au moral : -Stress, un peu d'énergie et d'argent en moins."},
      {t:"Décliner pour bosser",fn:()=>{ state.player.stress=clamp(state.player.stress+5,0,100); },d:{},reason:"🍻 Vous restez bosser : un peu plus de stress, mais du temps gagné."}
    ]
  })},
  {min:1,max:5,w:2,id:"medecin",make:()=>({
    title:"🩺 Petit signal du corps",
    desc:"Rien de grave, mais votre corps vous envoie un signal qu'il vaudrait mieux écouter.",
    choices:[
      {t:"Prendre rendez-vous",d:{argent:-60},fn:()=>{ state.player.stress=clamp(state.player.stress-8,0,100); },reason:"🩺 Rendez-vous pris : tranquillité d'esprit, -60€."},
      {t:"Ignorer, ça va passer",fn:()=>{ state.player.stress=clamp(state.player.stress+6,0,100); },d:{},reason:"🩺 Vous ignorez le signal. Le doute reste en tête."}
    ]
  })},

  // ---- Réseau / relations pro ----
  {min:0,max:5,w:3,id:"cafe_pro",make:()=>({
    title:"☕ Café avec un contact",
    desc:"Une connaissance du milieu propose de prendre un café pour papoter.",
    choices:[
      {t:"Accepter",p:.6,sD:{reseau:3},fD:{},sMsg:"Bon contact, ça peut servir plus tard.",fMsg:"Discussion sympathique mais sans suite.",sReason:"☕ Café productif.",fReason:"☕ Café sympa, rien de plus."},
      {t:"Décliner",d:{},reason:"☕ Vous n'avez pas le temps aujourd'hui."}
    ]
  })},
  {min:1,max:5,w:2,id:"soiree_networking",make:()=>({
    title:"🥂 Soirée networking",
    desc:"Un événement professionnel a lieu ce soir, plein de monde à rencontrer.",
    choices:[
      {t:"Y passer",d:{argent:-50,reseau:3},reason:"🥂 Soirée utile, quelques cartes échangées."},
      {t:"Rester chez vous",fn:()=>{ state.player.stress=clamp(state.player.stress-5,0,100); },d:{},reason:"🥂 Vous préférez votre canapé : -Stress."}
    ]
  })},
  {min:2,max:5,w:2,id:"vieux_contact",make:()=>({
    title:"📇 Un vieux contact refait surface",
    desc:"Quelqu'un que vous n'avez pas vu depuis des années reprend contact.",
    choices:[
      {t:"Renouer",p:.5,sD:{reseau:3,buzz:2},fD:{reseau:-1},sMsg:"Retrouvailles chaleureuses et utiles.",fMsg:"C'était mieux avant, visiblement.",sReason:"📇 Contact renoué avec succès.",fReason:"📇 Retrouvailles décevantes."},
      {t:"Laisser filer",d:{},reason:"📇 Vous ne donnez pas suite."}
    ]
  })},

  // ---- Artistes / équipe ----
  {min:0,max:5,w:3,id:"appel_artiste",needsArtist:true,make:()=>{
    const a = rA();
    return {
      title:"📞 Coup de fil d'un artiste",
      desc:`${a?a.name:"Un de vos artistes"} appelle juste pour parler, sans raison précise.`,
      choices:[
        {t:"Prendre le temps de discuter",fn:()=>{ if(a) a.humeur=clamp(a.humeur+6,0,100); },d:{},reason:`📞 Belle discussion avec ${a?a.name:"l'artiste"} : +Moral.`},
        {t:"Écourter, vous êtes occupé",fn:()=>{ if(a) a.humeur=clamp(a.humeur-3,0,100); },d:{},reason:`📞 Appel écourté : ${a?a.name:"l'artiste"} le sent.`}
      ]
    };
  }},
  {min:0,max:5,w:2,id:"repas_artiste",needsArtist:true,make:()=>{
    const a = rA();
    return {
      title:"🍽️ Repas avec un artiste",
      desc:`${a?a.name:"Un artiste"} propose de manger ensemble pour faire le point.`,
      choices:[
        {t:"Accepter, ça crée du lien",d:{argent:-45},fn:()=>{ if(a) a.humeur=clamp(a.humeur+8,0,100); },reason:`🍽️ Repas convivial avec ${a?a.name:"l'artiste"} : +Moral, -45€.`},
        {t:"Reporter",d:{},reason:"🍽️ Vous reportez, trop de choses à gérer."}
      ]
    };
  }},
  {min:1,max:5,w:2,id:"conflit_ego",needsArtist:true,make:()=>{
    const a = rA();
    return {
      title:"😤 Petit accès d'ego",
      desc:`${a?a.name:"Un artiste"} râle sur les réseaux sans vous prévenir avant.`,
      choices:[
        {t:"Recadrer en privé",p:.6,sD:{},fD:{reputation:-1},sMsg:"Message bien reçu, le calme revient.",fMsg:"Mal pris, ça envenime les choses.",sFn:()=>{if(a)a.humeur=clamp(a.humeur+2,0,100);},fFn:()=>{if(a)a.humeur=clamp(a.humeur-5,0,100);},sReason:`😤 Recadrage efficace de ${a?a.name:"l'artiste"}.`,fReason:`😤 Le recadrage passe mal.`},
        {t:"Laisser passer",d:{},reason:"😤 Vous laissez passer, pas envie de conflit."}
      ]
    };
  }},
  {min:2,max:5,w:2,id:"formation",make:()=>({
    title:"📚 Formation professionnelle",
    desc:"Une formation courte sur le business de la musique est proposée en ligne.",
    choices:[
      {t:"La suivre",d:{argent:-80,reputation:2},fn:()=>{ state.player.energy=clamp(state.player.energy-10,0,100); },reason:"📚 Formation suivie : +Crédibilité, un peu de fatigue."},
      {t:"Passer son tour",d:{},reason:"📚 Vous passez votre tour cette fois."}
    ]
  })},

  // ---- Image publique / risqué ----
  {min:0,max:5,w:3,id:"interview_locale",make:()=>({
    title:"🎙️ Petite interview",
    desc:"Un média local propose une interview rapide sur votre label.",
    choices:[
      {t:"Accepter",p:.65,sD:{buzz:3,reputation:1},fD:{reputation:-1},sMsg:"Interview qui donne une bonne image.",fMsg:"Question piège mal négociée.",sReason:"🎙️ Interview réussie.",fReason:"🎙️ Interview maladroite."},
      {t:"Décliner",d:{},reason:"🎙️ Vous préférez rester discret."}
    ]
  })},
  {min:1,max:5,w:2,id:"post_polemique",make:()=>({
    title:"📱 Une prise de position ?",
    desc:"Un sujet chaud divise les réseaux, on vous demande votre avis.",
    choices:[
      {t:"Prendre position publiquement",p:.4,sD:{buzz:4,reseau:1},fD:{reputation:-3},sMsg:"Ça passe, votre image y gagne.",fMsg:"Bad buzz, mauvaise pioche.",sReason:"📱 Prise de position payante.",fReason:"📱 Prise de position qui se retourne contre vous."},
      {t:"Rester neutre",d:{},reason:"📱 Vous évitez soigneusement le sujet."}
    ]
  })},
  {min:2,max:5,w:2,id:"appel_journaliste",make:()=>({
    title:"📰 Un journaliste insiste",
    desc:"Un journaliste cherche des infos exclusives sur votre label, un peu trop indiscret.",
    choices:[
      {t:"Lui donner un scoop mineur",d:{buzz:2,reputation:-1},reason:"📰 Petit scoop lâché : un peu de buzz, un peu de discrétion en moins."},
      {t:"Ne rien dire",d:{},reason:"📰 Vous restez muet, comme toujours."}
    ]
  })},
  {min:3,max:5,w:2,id:"offre_sponsor",make:()=>({
    title:"🤝 Offre de sponsoring douteuse",
    desc:"Une marque un peu louche propose un partenariat bien payé pour le label.",
    choices:[
      {t:"Accepter l'argent",d:{argent:rint(300,700),reputation:-2},reason:"🤝 Contrat signé : argent facile, image ternie."},
      {t:"Refuser par principe",d:{reputation:1},reason:"🤝 Vous refusez : -argent potentiel, +Crédibilité."}
    ]
  })},

  // ---- Vie personnelle / famille / légèreté ----
  {min:0,max:5,w:3,id:"appel_famille",make:()=>({
    title:"📱 Appel de la famille",
    desc:"Vos proches prennent des nouvelles, comme toujours au bon (ou mauvais) moment.",
    choices:[
      {t:"Prendre le temps de répondre",fn:()=>{ state.player.stress=clamp(state.player.stress-6,0,100); },d:{},reason:"📱 Petit appel qui fait du bien : -Stress."},
      {t:"Rappeler plus tard",fn:()=>{ state.player.stress=clamp(state.player.stress+2,0,100); },d:{},reason:"📱 Vous rappellerez plus tard... peut-être."}
    ]
  })},
  {min:0,max:5,w:2,id:"menage",make:()=>({
    title:"🧹 Le bureau est un chantier",
    desc:"Votre espace de travail commence à ressembler à un dépotoir.",
    choices:[
      {t:"Tout ranger",fn:()=>{ state.player.stress=clamp(state.player.stress-5,0,100); },d:{},reason:"🧹 Rangement fait : tête plus claire, -Stress."},
      {t:"Laisser pour plus tard",fn:()=>{ state.player.stress=clamp(state.player.stress+2,0,100); },d:{},reason:"🧹 Le chantier attendra encore un peu."}
    ]
  })},
  {min:0,max:2,w:2,id:"mamie_passage",make:()=>({
    title:"👵 Petit passage de Mamie",
    desc:"Mamie Huguette passe voir comment vous vous en sortez.",
    choices:[
      {t:"L'accueillir comme il se doit",fn:()=>{ state.player.stress=clamp(state.player.stress-8,0,100); },d:{},reason:"👵 Visite de Mamie : réconfort garanti, -Stress."},
      {t:"Écourter, trop de travail",d:{},reason:"👵 Vous écourtez la visite, un peu coupable."}
    ]
  })},
  {min:2,max:5,w:2,id:"vacances",make:()=>({
    title:"🏖️ Tentation de vacances",
    desc:"Une offre de dernière minute pour quelques jours au calme, loin de tout.",
    choices:[
      {t:"Partir quelques jours",d:{argent:-200},fn:()=>{ state.player.energy=clamp(state.player.energy+25,0,100); state.player.stress=clamp(state.player.stress-20,0,100); },reason:"🏖️ Petite coupure salvatrice : -200€, gros gain d'énergie et de sérénité."},
      {t:"Rester concentré sur le label",d:{},reason:"🏖️ Vous restez, le label passe avant."}
    ]
  })},

  // ---- Fin de partie / plus haut palier ----
  {min:3,max:5,w:2,id:"heritage",make:()=>({
    title:"🏛️ Penser à l'héritage",
    desc:"Un ami vous fait remarquer que vous avez construit quelque chose de solide.",
    choices:[
      {t:"En prendre conscience",fn:()=>{ state.player.stress=clamp(state.player.stress-10,0,100); },d:{reputation:2},reason:"🏛️ Moment de recul mérité : +Crédibilité, -Stress."},
      {t:"Rester focus, pas le temps de souffler",fn:()=>{ state.player.stress=clamp(state.player.stress+5,0,100); },d:{buzz:2},reason:"🏛️ Vous restez à fond : +Notoriété, mais la fatigue s'accumule."}
    ]
  })},
  {min:4,max:5,w:2,id:"investisseur",make:()=>({
    title:"💰 Un investisseur approche",
    desc:"Un investisseur veut mettre de l'argent dans le label, avec son mot à dire en retour.",
    choices:[
      {t:"Accepter l'investissement",d:{argent:rint(2000,5000),reputation:-1},reason:"💰 Belle rentrée d'argent, un peu d'indépendance en moins."},
      {t:"Rester indépendant",d:{reputation:2},reason:"💰 Vous refusez : +Crédibilité, vous restez seul maître à bord."}
    ]
  })}
];
