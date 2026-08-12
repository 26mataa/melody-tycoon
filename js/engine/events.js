import { finalizeSigned, rA } from "./artists.js";
import { adaptCost, getTier, pveUnlocked, rosterFull } from "./economy.js";
import { startCollabFromEvent } from "./production.js";
import { removeArtist } from "./rivalite.js";
import { queueEpisode } from "./narrative.js";
import { rollDiff, rollSnapshot } from "./roll.js";
import { after, safeRender } from "../render.js";
import { save, state } from "../state.js";
import { chipsFromDeltas } from "../ui/chips.js";
import { clamp, fmt, pick, rint, shuffleArr } from "../utils.js";
import { DATA } from "../data.js";

export const FOLLOWUP_EVENTS = {
  artist_revenge: (ctx) => ({
    title:"😤 Le retour de bâton",
    desc:`${ctx.name||"Un ancien artiste"} n'a jamais digéré votre coup bas. Une interview choc circule sur les réseaux.`,
    choices:[
      {t:"Présenter des excuses publiques",d:{reputation:2,popularite:-1},reason:`😤 Excuses publiques envers ${ctx.name||"l'artiste"} : image redorée, un peu de notoriété perdue.`},
      {t:"Nier en bloc",d:{reputation:-3},reason:"😤 Le déni ne convainc personne : -Crédibilité."},
      {t:"Ignorer et avancer",d:{},reason:"😤 Vous laissez l'orage passer sans réagir."}
    ]
  }),
  betrayal_fallout: (ctx) => ({
    title:"💔 Les retombées de la trahison",
    desc:`Le clash entre ${ctx.a||"vos artistes"} et ${ctx.b||"leur ancien binôme"} continue de faire parler dans les commentaires.`,
    choices:[
      {t:"Organiser une réconciliation médiatisée",d:{buzz:6,reputation:2},reason:"💔 Réconciliation mise en scène : bon coup médiatique."},
      {t:"Laisser le clash vivre sa vie",d:{buzz:4,reputation:-1},reason:"💔 Le clash continue de faire du bruit, pour le meilleur et le pire."},
      {t:"Couper court fermement en interne",d:{reseau:2},reason:"💔 Vous mettez fin à la polémique avant qu'elle n'enfle."}
    ]
  }),
  favor_called_in: (ctx) => ({
    title:"🤝 Une dette qui revient",
    desc:`${ctx.name||"Quelqu'un"} se souvient de ce que vous avez fait pour ${ctx.pronoun||"lui"} et vient réclamer un service en retour.`,
    choices:[
      {t:"Rendre le service (-du temps, +Crédibilité)",d:{reseau:5},reason:"🤝 Service rendu : la confiance grandit."},
      {t:"Refuser poliment",d:{reseau:-2},reason:"🤝 Refus qui refroidit un peu la relation."},
      {t:"Négocier une contrepartie",p:.55,sD:{reseau:4,argent:400},fD:{reseau:-3},sMsg:"Accord trouvé, tout le monde y gagne.",fMsg:"La négociation tourne court.",sReason:"🤝 Contrepartie obtenue.",fReason:"🤝 Négociation ratée : relation abîmée."}
    ]
  })
};

/* Retombée différée d'un choix : elle reviendra dans N chapitres, sous
   forme d'épisode imposé (il passe avant tout tirage aléatoire). */
export function scheduleFollowUp(chaptersFromNow, key, ctx){
  state.pendingConsequences.push({day: state.chapter + Math.max(1,chaptersFromNow), key, ctx: ctx||{}});
}

export function checkPendingConsequences(){
  if(!state.pendingConsequences.length) return;
  const due = state.pendingConsequences.filter(pc=>pc.day <= state.chapter);
  if(!due.length) return;
  state.pendingConsequences = state.pendingConsequences.filter(pc=>pc.day > state.chapter);
  due.forEach(pc=>{
    const gen = FOLLOWUP_EVENTS[pc.key];
    if(!gen) return;
    const ev = gen(pc.ctx||{});
    if(!ev) return;
    ev.imp = ev.imp || 2;
    queueEpisode(ev);
  });
}

/* ============================================================
   RELATIONS ENTRE ARTISTES — amitié, rivalité, amour, trahison.
   Petits drames au début, grosses histoires quand le label grandit.
============================================================ */

export function rTwo(){
  if(state.signed.length < 2) return [null,null];
  const pool = shuffleArr(state.signed);
  return [pool[0], pool[1]];
}

export function getRelation(a,b){
  if(!a || !b) return {score:0};
  if(!a.relations) a.relations = {};
  if(!a.relations[b.id]) a.relations[b.id] = {score: rint(-10,10), romance:false};
  return a.relations[b.id];
}

export function adjustRelation(a,b,delta){
  if(!a || !b || a.id===b.id) return;
  const rel = getRelation(a,b);
  rel.score = clamp(rel.score+delta,-100,100);
  const relB = getRelation(b,a);
  relB.score = clamp(relB.score+delta,-100,100);
}

export function relLabel(rel){
  if(!rel) return {label:"Inconnus",cls:""};
  if(rel.romance) return {label:"💞 En couple",cls:"good"};
  if(rel.score<=-60) return {label:"💥 Ennemis jurés",cls:"bad"};
  if(rel.score<=-20) return {label:"😒 Tensions",cls:"warn"};
  if(rel.score<20) return {label:"😐 Neutre",cls:""};
  if(rel.score<60) return {label:"🙂 Amis",cls:"good"};
  return {label:"🤝 Duo soudé",cls:"good"};
}

/* ============================================================
   ÉVÉNEMENTS — tout scale sur le palier du label (getTier())
   Chaque événement propose ≥3 choix radicalement différents.
   RÈGLE v0.5 : le joueur ne sait rien d'un choix avant de l'avoir cliqué.
============================================================ */

export const EVENT_DEFS=[
  // ADMIN — avant le premier artiste
  {admin:true,id:"papier",imp:1,w:3,when:()=>state.signed.length===0,make:()=>({
    title:"🧾 Paperasse administrative",
    desc:"Il faut enregistrer des documents pour que le label existe officiellement.",
    choices:[
      {t:"Le faire sérieusement",d:{reseau:1},reason:"🧾 Paperasse réglée : +1 Réseau."},
      {t:"Repousser",d:{},reason:"🧾 Vous repoussez la paperasse."},
      {t:"Payer un comptable (-30€)",d:{argent:-30,reseau:2,reputation:1},reason:"🧾 Comptable engagé : dossier impeccable."}
    ]
  })},
  {admin:true,id:"reflection",imp:1,w:3,when:()=>state.signed.length===0,make:()=>({
    title:"🤔 Réflexion du manager",
    desc:"Vous réfléchissez à la direction du label.",
    choices:[
      {t:"Étudier le marché",d:{reputation:1},reason:"🤔 Vous étudiez le marché : +1 Réputation."},
      {t:"Se reposer",d:{},reason:"😴 Vous soufflez un peu."},
      {t:"Prendre un risque créatif",p:.5,sD:{reputation:3,buzz:2},fD:{reseau:-1},sMsg:"Une idée forte émerge !",fMsg:"L'idée tombe à plat.",sReason:"🤔 Idée créative payante.",fReason:"🤔 Idée créative ratée."}
    ]
  })},
  {admin:true,id:"petit_reseau",imp:1,w:2,when:()=>state.signed.length===0,make:()=>({
    title:"🤝 Petite opportunité",
    desc:"Une connaissance parle d'un petit événement local.",
    choices:[
      {t:"S'y rendre",d:{reseau:2},reason:"🤝 Vous rencontrez quelques personnes utiles."},
      {t:"Ignorer",d:{},reason:"🚶 Vous ne donnez pas suite."},
      {t:"Payer une tournée (-40€)",d:{argent:-40,reseau:5},reason:"🤝 La tournée générale paie : réseau élargi."}
    ]
  })},

  // TIER 0
  {min:0,max:0,id:"bouche",imp:1,w:3,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"💬 Bouche-à-oreille local",
      desc:`Des proches parlent de ${a?a.name:"votre artiste"} dans leur quartier.`,
      choices:[
        {t:"Encourager",d:{buzz:3},fn:()=>{if(a)a.buzz=clamp(a.buzz+2,-50,50);},reason:"💬 Le bouche-à-oreille fonctionne."},
        {t:"Ignorer",d:{},reason:"💬 Vous laissez faire."},
        {t:"Recentrer sur l'artistique",d:{reputation:2},fn:()=>{if(a)a.humeur=clamp(a.humeur+3,0,100);},reason:"💬 Vous misez sur le fond plutôt que le buzz."}
      ]
    };
  }},
  {min:0,max:1,id:"forum",imp:1,w:2,when:()=>state.releases.length>0,make:()=>{
    const r=pick(state.releases); return {
      title:"🖥️ Petit forum",
      desc:`Un forum local parle de « ${r.title} ».`,
      choices:[
        {t:"Partager",d:{buzz:2,reputation:1},reason:"🖥️ Le forum vous donne un peu de visibilité."},
        {t:"Ignorer",d:{},reason:"🖥️ Vous laissez la discussion suivre son cours."},
        {t:"Modérer le débat (-20€)",d:{argent:-20,reputation:3},reason:"🖥️ Débat recadré avec soin."}
      ]
    };
  }},
  {min:0,max:1,id:"fan_content",imp:1,w:2,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🎬 Un fan crée du contenu",
      desc:`Un fan a fait une vidéo sur ${a?a.name:"votre artiste"}.`,
      choices:[
        {t:"Partager",d:{buzz:4},fn:()=>{if(a)a.buzz=clamp(a.buzz+2,-50,50);},reason:"🎬 Contenu fan partagé."},
        {t:"Ignorer",d:{},reason:"🎬 Vous ne relayez pas."},
        {t:"Remercier le fan publiquement",d:{reseau:2},fn:()=>{if(a)a.humeur=clamp(a.humeur+2,0,100);},reason:"🎬 Le fan est mis à l'honneur."}
      ]
    };
  }},

  // TIER 1
  {min:1,max:2,id:"blog",imp:1,w:3,when:()=>state.releases.length>0,make:()=>{
    const r=pick(state.releases); return {
      title:"📝 Blog local",
      desc:`Un blog local écrit un article sur « ${r.title} ».`,
      choices:[
        {t:"Partager l'article",d:{buzz:4,reputation:2},reason:"📝 Article de blog partagé."},
        {t:"Ignorer",d:{},reason:"📝 Vous laissez passer."},
        {t:"Proposer une interview exclusive",p:.6,sD:{reputation:6,buzz:3},fD:{},sMsg:"L'interview cartonne !",fMsg:"L'interview tombe à plat.",sReason:"📝 Interview exclusive réussie.",fReason:"📝 Interview sans impact."}
      ]
    };
  }},
  {min:1,max:2,id:"radio_locale",imp:1,w:2,when:()=>state.releases.length>0,make:()=>{
    const r=pick(state.releases); return {
      title:"📻 Radio locale",
      desc:`Une radio locale veut diffuser « ${r.title} ».`,
      choices:[
        {t:"Accepter",d:{buzz:5,popularite:2},reason:"📻 Diffusion radio locale."},
        {t:"Décliner",d:{},reason:"📻 Vous déclinez la diffusion."},
        {t:"Négocier une meilleure case horaire",p:.5,sD:{buzz:8,popularite:4},fD:{reseau:-1},sMsg:"Créneau en prime time obtenu !",fMsg:"La négociation échoue.",sReason:"📻 Créneau premium décroché.",fReason:"📻 Négociation ratée."}
      ]
    };
  }},
  {min:1,max:2,id:"petit_influenceur",imp:1,w:2,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🤳 Petit influenceur",
      desc:`Un petit influenceur veut parler de ${a?a.name:"votre artiste"}.`,
      choices:[
        {t:"Accepter",p:.6,sD:{buzz:7},fD:{},sMsg:"Le post perce !",fMsg:"Le post passe inaperçu.",sReason:"🤳 Le post influenceur fonctionne.",fReason:"🤳 Le post influenceur ne donne rien."},
        {t:"Ignorer",d:{},reason:"🤳 Vous ignorez la proposition."},
        {t:"Payer un post sponsorisé (-60€)",d:{argent:-60,buzz:5},reason:"🤳 Post sponsorisé garanti."}
      ]
    };
  }},

  // TIER 2
  {min:2,max:3,id:"presse_spec",imp:2,w:2,when:()=>state.releases.length>0 && state.credibilite>=25,make:()=>{
    const r=pick(state.releases); return {
      title:"📰 Presse spécialisée",
      desc:`Un média spécialisé veut chroniquer « ${r.title} ».`,
      choices:[
        {t:"Accepter l'interview",d:{reputation:4,buzz:4},reason:"📰 Chronique presse spécialisée."},
        {t:"Décliner",d:{},reason:"📰 Vous déclinez la chronique."},
        {t:"Répondre uniquement par écrit",d:{reputation:2},reason:"📰 Réponse écrite prudente."}
      ]
    };
  }},
  {min:2,max:3,id:"playlist_mineure",imp:2,w:2,when:()=>state.releases.length>0,make:()=>{
    const r=pick(state.releases); return {
      title:"🎧 Playlist indépendante",
      desc:`Une playlist indépendante propose d'ajouter « ${r.title} ».`,
      choices:[
        {t:"Accepter",d:{},fn:()=>{const amt=rint(20000,80000);r.streams+=amt;state.totalStreams+=amt;state.argent+=Math.round(amt*0.003);},reason:`🎧 Playlist : streams en hausse.`},
        {t:"Décliner",d:{},reason:"🎧 Vous déclinez la playlist."},
        {t:"Négocier une exclusivité (-100€)",d:{argent:-100},fn:()=>{const amt=rint(60000,150000);r.streams+=amt;state.totalStreams+=amt;state.argent+=Math.round(amt*0.003);},reason:`🎧 Exclusivité négociée : gros gain de streams.`}
      ]
    };
  }},
  {min:2,max:3,id:"petite_polemique",imp:2,w:2,when:()=>state.signed.length>0 && state.notoriete>=20,make:()=>{
    const a=rA(); return {
      title:"⚠️ Petite polémique locale",
      desc:`${a?a.name:"Votre artiste"} est critiqué sur les réseaux.`,
      choices:[
        {t:"Calmer le jeu",d:{popularite:-2,reseau:2},reason:"⚠️ Vous calmez la polémique."},
        {t:"Assumer",p:.5,sD:{buzz:10},fD:{popularite:-6},sMsg:"Le buzz devient positif !",fMsg:"La polémique s'aggrave.",sReason:"⚠️ La polémique crée du buzz.",fReason:"⚠️ La polémique s'aggrave."},
        {t:"Étouffer via le réseau (-200€)",d:{argent:-200,reseau:-3,popularite:1},reason:"⚠️ Affaire étouffée grâce à vos contacts."}
      ]
    };
  }},
  {min:2,max:4,id:"debauchage_rival",imp:2,w:2,when:()=>state.signed.length>0 && pveUnlocked(),make:()=>{
    const a=rA(); const rv=state.rivals.length?pick(state.rivals):null;
    if(!a||!rv) return {title:"⚔️ Rumeur",desc:"Un rival vous observe.",choices:[{t:"Ignorer",d:{},reason:"⚔️ Vous ignorez la rumeur."}]};
    return {
      title:`⚔️ ${rv.name} tente de débaucher ${a.name}`,
      desc:`${rv.name} propose plus d'argent à ${a.name} pour qu'il change de label.`,
      choices:[
        {t:"Laisser partir",d:{popularite:-3},fn:()=>{removeArtist(a);rv.roster.push({id:a.id,name:a.name,genre:a.genre,talent:a.talent,pop:a.pop,salaire:a.salaire,hits:0,flops:0});},reason:`⚔️ ${a.name} rejoint ${rv.name}.`},
        {t:"Contre-offre (-800€)",d:{argent:-800},fn:()=>{a.humeur=clamp(a.humeur+10,0,100);},reason:`⚔️ Contre-offre acceptée : ${a.name} reste, moral au top.`},
        {t:"Dénoncer la manœuvre publiquement",p:.5,sD:{buzz:8,reputation:3},fD:{reseau:-4},sMsg:"L'opinion vous soutient !",fMsg:"Ça se retourne contre vous.",sReason:`⚔️ Vous dénoncez ${rv.name} publiquement, le public vous soutient.`,fReason:"⚔️ La dénonciation passe pour un coup bas."}
      ]
    };
  }},

  // TIER 3
  {min:3,max:4,id:"tv_nationale",imp:3,w:2,when:()=>state.notoriete>=55,make:()=>{
    const a=rA(); return {
      title:"📺 TV nationale",
      desc:`Une émission TV veut inviter ${a?a.name:"votre artiste"}.`,
      choices:[
        {t:"Accepter",p:.65,sD:{popularite:8,buzz:12},fD:{popularite:-4},sMsg:"L'émission se passe bien !",fMsg:"L'interview est maladroite.",sReason:"📺 Passage TV réussi.",fReason:"📺 Passage TV maladroit."},
        {t:"Décliner poliment",d:{},reason:"📺 Vous déclinez l'invitation."},
        {t:"Négocier les conditions (-500€)",d:{argent:-500,popularite:4,buzz:5},reason:"📺 Passage TV cadré et sécurisé."}
      ]
    };
  }},
  {min:3,max:5,id:"rival_attack",imp:3,w:2,when:()=>state.notoriete>=38,make:()=>{
    const r=state.rivals.length?pick(state.rivals):null;
    if(!r) return {title:"⚔️ Tension",desc:"Un rival vous observe.",choices:[{t:"Ignorer",d:{},reason:"⚔️ Vous ignorez la tension."}]};
    return {
      title:`⚠️ ${r.name} vous attaque`,
      desc:`${r.name} essaie de vous discréditer.`,
      choices:[
        {t:"Porter plainte (-300€)",d:{argent:-300,reputation:3},reason:`⚖️ Plainte contre ${r.name}.`},
        {t:"Transformer en buzz",p:.5,sD:{buzz:10},fD:{popularite:-6},sMsg:"Vous retournez l'attaque !",fMsg:"L'attaque vous touche.",sReason:"⚔️ Attaque transformée en buzz.",fReason:"⚔️ L'attaque vous touche."},
        {t:"Contre-attaquer via le réseau",d:{reseau:-4},fn:()=>{r.rep=clamp((r.rep||50)-6,0,100);},reason:`⚔️ Vous ripostez discrètement contre ${r.name}.`}
      ]
    };
  }},

  // TIER 4-5 — gros enjeux, forte popularité/réputation requise
  {min:4,max:5,id:"international",imp:3,w:2,when:()=>state.notoriete>=72,make:()=>{
    const a=rA(); return {
      title:"🌍 Opportunité internationale",
      desc:`Un média international parle de ${a?a.name:"votre label"}.`,
      choices:[
        {t:"Capitaliser",d:{buzz:15,popularite:8},reason:"🌍 Exposition internationale."},
        {t:"Rester discret",d:{},reason:"🌍 Vous restez discret."},
        {t:"Négocier un partenariat (-2000€)",d:{argent:-2000,buzz:20,popularite:12},reason:"🌍 Partenariat international signé."}
      ]
    };
  }},
  {min:4,max:5,id:"documentaire",imp:3,w:1,when:()=>state.releases.length>=3,make:()=>({
    title:"🎬 Proposition de documentaire",
    desc:"Une plateforme veut faire un documentaire sur votre label.",
    choices:[
      {t:"Accepter",d:{reputation:6},fn:()=>{state.argent+=rint(3000,10000);},reason:"🎬 Documentaire signé."},
      {t:"Refuser",d:{},reason:"🎬 Vous refusez le documentaire."},
      {t:"Négocier un cachet plus élevé",p:.5,sD:{reputation:8},fD:{reseau:-2},sMsg:"Négociation gagnante !",fMsg:"La plateforme se retire.",sFn:()=>{state.argent+=rint(12000,20000);},sReason:"🎬 Documentaire signé à des conditions premium.",fReason:"🎬 La plateforme se retire, contact grillé."}
    ]
  })},
  {min:5,max:5,id:"rachat",imp:3,w:1,when:()=>state.argent>=15000,make:()=>({
    title:"👑 Offre de rachat",
    desc:"Une major internationale propose de racheter une part de votre label.",
    choices:[
      {t:"Accepter l'offre totale",d:{},fn:()=>{state.argent+=rint(40000,90000);state.credibilite=clamp(state.credibilite-10,0,100);},reason:"👑 Rachat accepté : trésorerie énorme, mais indépendance créative entamée."},
      {t:"Refuser, rester indépendant",d:{reputation:6,reseau:3},reason:"👑 Vous refusez : votre indépendance renforce votre crédibilité."},
      {t:"Négocier un partenariat minoritaire (-Crédibilité)",p:.5,sD:{argent:25000,reseau:5},fD:{reseau:-6},sMsg:"Accord équilibré trouvé !",fMsg:"Les négociations tournent court.",sReason:"👑 Partenariat minoritaire signé : argent frais sans perdre le contrôle.",fReason:"👑 Les négociations échouent, contact grillé."}
    ]
  })},

  // --- Lot supplémentaire d'événements (variété) ---
  {min:0,max:2,id:"panne_studio",imp:1,w:2,when:()=>state.signed.length>0,make:()=>({
    title:"🔌 Panne de studio",
    desc:"Le matériel d'enregistrement lâche en pleine session.",
    choices:[
      {t:"Réparer soi-même",p:.5,sD:{},fD:{argent:-150},sMsg:"Réparé !",fMsg:"Il faut payer un technicien.",sReason:"🔌 Panne réparée gratuitement.",fReason:"🔌 Panne coûteuse : -150€."},
      {t:"Appeler un technicien (-100€)",d:{argent:-100},reason:"🔌 Studio remis en état rapidement."},
      {t:"Reporter la session",d:{buzz:-2},reason:"🔌 Session reportée : un peu d'élan perdu."}
    ]
  })},
  {min:1,max:3,id:"fuite_son",imp:2,w:2,when:()=>state.projects.length>0,make:()=>{
    const p = pick(state.projects.filter(pr=>pr.kind!=="beat"));
    if(!p) return {title:"🕵️ Fuite évitée",desc:"Une tentative de fuite est bloquée à temps.",choices:[{t:"Ouf",d:{},reason:"🕵️ Rien à signaler."}]};
    return {
      title:"🕵️ Fuite d'un son en cours de production",
      desc:`Des extraits de « ${p.title} » circulent avant sa sortie officielle.`,
      choices:[
        {t:"Porter plainte pour la source (-200€)",d:{argent:-200,reputation:2},reason:"🕵️ Plainte déposée, l'affaire est prise au sérieux."},
        {t:"Ignorer, ça fait parler",d:{buzz:6,reputation:-2},reason:"🕵️ La fuite crée un buzz inattendu, au prix d'un peu de sérieux."},
        {t:"Sortir le son en urgence",p:.5,sD:{buzz:10},fD:{argent:-300},sMsg:"Sortie surprise réussie !",fMsg:"Sortie précipitée bâclée.",sReason:"🕵️ Vous transformez la fuite en sortie surprise réussie.",fReason:"🕵️ La sortie précipitée coûte cher en rattrapage."}
      ]
    };
  }},
  {min:0,max:2,id:"panne_reseaux",imp:1,w:2,when:()=>state.signed.length>0,make:()=>({
    title:"📵 Panne des réseaux sociaux",
    desc:"Une panne mondiale empêche de poster pendant 24h.",
    choices:[
      {t:"Attendre patiemment",d:{},reason:"📵 Vous attendez que ça revienne."},
      {t:"Miser sur l'email / SMS aux fans (-30€)",d:{argent:-30,buzz:2},reason:"📵 Contact direct avec les fans malgré la panne."},
      {t:"En profiter pour préparer du contenu",d:{reputation:1},reason:"📵 Temps mis à profit pour préparer la suite."}
    ]
  })},
  {min:1,max:3,id:"sponsoring",imp:2,w:2,when:()=>state.releases.length>0,make:()=>({
    title:"🥤 Proposition de sponsoring",
    desc:"Une marque de boissons énergisantes veut sponsoriser votre label.",
    choices:[
      {t:"Accepter (image commerciale)",d:{argent:2500,reputation:-3},reason:"🥤 Sponsoring accepté : cash immédiat, un peu d'image indé perdue."},
      {t:"Refuser, garder son image",d:{reputation:3},reason:"🥤 Vous refusez pour préserver votre crédibilité."},
      {t:"Négocier une collab créative",p:.5,sD:{argent:1200,buzz:8},fD:{},sMsg:"Collab créative acceptée !",fMsg:"La marque se retire.",sReason:"🥤 Partenariat créatif original signé.",fReason:"🥤 La marque décline la contre-proposition."}
    ]
  })},
  {min:1,max:3,id:"concert_annule",imp:2,w:2,when:()=>state.notoriete>=25,make:()=>{
    const a = rA();
    return {
      title:"🌧️ Concert menacé d'annulation",
      desc:`Un problème de dernière minute menace la date de ${a?a.name:"votre artiste"}.`,
      choices:[
        {t:"Annuler et rembourser (-400€)",d:{argent:-400},reason:"🌧️ Concert annulé proprement, remboursement des billets."},
        {t:"Maintenir coûte que coûte",p:.5,sD:{buzz:9,argent:600},fD:{reputation:-6},sMsg:"Le concert sauve la soirée !",fMsg:"L'improvisation tourne mal.",sReason:"🌧️ Concert maintenu et réussi malgré tout.",fReason:"🌧️ Le concert improvisé tourne au fiasco."},
        {t:"Reporter à une date ultérieure",d:{reseau:2},reason:"🌧️ Concert reporté, le public comprend."}
      ]
    };
  }},
  {min:2,max:4,id:"prix_recompense",imp:2,w:1,when:()=>state.credibilite>=35 && state.releases.length>=2,make:()=>({
    title:"🏆 Nomination à un prix musical",
    desc:"Un de vos titres est nommé pour un prix de la profession.",
    choices:[
      {t:"Faire campagne (-500€)",p:.6,sD:{reputation:10,buzz:8},fD:{argent:-500},sMsg:"Le prix est remporté !",fMsg:"Nommé mais pas gagnant.",sReason:"🏆 Prix remporté après campagne active !",fReason:"🏆 Nomination seulement, malgré la campagne."},
      {t:"Rester discret sur la nomination",d:{reputation:3},reason:"🏆 Nomination valorisée sobrement."},
      {t:"En faire un argument marketing",d:{buzz:6,argent:-100},reason:"🏆 Nomination exploitée à fond dans la promo."}
    ]
  })},
  {min:1,max:3,id:"litige_ancien",imp:2,w:1,when:()=>state.chapter>30,make:()=>({
    title:"⚖️ Litige avec un ancien artiste",
    desc:"Un ancien artiste du label réclame des royalties impayées.",
    choices:[
      {t:"Payer à l'amiable (-600€)",d:{argent:-600,reseau:2},reason:"⚖️ Litige réglé à l'amiable."},
      {t:"Contester devant un tribunal",p:.5,sD:{},fD:{argent:-1500,reputation:-6},sMsg:"Vous gagnez le procès !",fMsg:"Vous perdez le procès.",sReason:"⚖️ Procès gagné, aucune charge.",fReason:"⚖️ Procès perdu : dommages et intérêts lourds."},
      {t:"Ignorer la réclamation",d:{reputation:-4},reason:"⚖️ Vous ignorez, l'histoire circule mal dans le milieu."}
    ]
  })},
  {min:2,max:4,id:"vol_studio",imp:2,w:1,when:()=>state.argent>=1000,make:()=>({
    title:"🚨 Cambriolage du studio",
    desc:"Du matériel a été volé pendant la nuit.",
    choices:[
      {t:"Racheter du matériel (-800€)",d:{argent:-800},reason:"🚨 Matériel neuf racheté, l'activité reprend normalement."},
      {t:"Faire une assurance (-100€, remboursement partiel)",d:{argent:-100},fn:()=>{state.argent+=rint(300,500);},reason:"🚨 Assurance activée, une partie des pertes est couverte."},
      {t:"Faire sans, le temps de rebondir",d:{buzz:-3},reason:"🚨 Vous travaillez avec les moyens du bord, un peu d'élan perdu."}
    ]
  })},
  {min:2,max:4,id:"retour_ancien",imp:2,w:1,when:()=>!rosterFull(),make:()=>{
    const pool = DATA.SCOUT_POOLS;
    const p = pick(pool);
    const name = pick(p.names);
    return {
      title:"🔙 Un ancien espoir frappe à nouveau",
      desc:`${name}, croisé il y a longtemps, aimerait rejoindre votre label.`,
      choices:[
        {t:"L'accueillir (-200€)",d:{argent:-200},fn:()=>{
          const na = {id:"ret-"+Date.now(),name,genre:p.genre,perso:p.perso,contrat:"espoir",talent:rint(p.talent[0],p.talent[1]),pop:rint(0,10),prix:0,salaire:rint(3,8)};
          finalizeSigned(na);
          state.signed.push(na);
        },reason:`🔙 ${name} rejoint le label.`},
        {t:"Décliner poliment",d:{},reason:"🔙 Vous déclinez, sans rancune."},
        {t:"Le renvoyer vers un rival",d:{reseau:2},fn:()=>{ if(state.rivals.length){ const r=pick(state.rivals); r.roster.push({id:"ret-"+Date.now(),name,genre:p.genre,talent:rint(p.talent[0],p.talent[1]),pop:rint(0,10),salaire:rint(3,8),hits:0,flops:0}); } },reason:`🔙 Vous orientez ${name} vers un label concurrent : bon point réseau.`}
      ]
    };
  }},
  {min:3,max:5,id:"feat_star",imp:3,w:1,when:()=>state.signed.length>0 && state.notoriete>=55,make:()=>{
    const a = rA();
    return {
      title:"🌟 Une star internationale propose un featuring",
      desc:`Une pointure du game contacte ${a?a.name:"votre label"} pour un feat.`,
      choices:[
        {t:"Accepter (-3000€ de cachet)",p:.7,sD:{buzz:20,popularite:10,reputation:5},fD:{argent:-3000},sMsg:"Feat monumental !",fMsg:"Le feat déçoit, cachet perdu.",sReason:"🌟 Feat avec une star : exposition énorme.",fReason:"🌟 Le feat sort mais déçoit, cachet perdu quand même."},
        {t:"Décliner, pas le bon moment",d:{},reason:"🌟 Vous déclinez poliment."},
        {t:"Négocier un cachet réduit",p:.4,sD:{buzz:14,popularite:6,argent:-1200},fD:{reseau:-3},sMsg:"Accord trouvé à prix réduit !",fMsg:"La star se vexe du montant proposé.",sReason:"🌟 Cachet négocié à la baisse, accord trouvé.",fReason:"🌟 La négociation vexe la star : contact grillé."}
      ]
    };
  }},
  {min:2,max:4,id:"greve_technique",imp:2,w:1,when:()=>state.projects.length>0,make:()=>({
    title:"🛠️ Grève des techniciens du son",
    desc:"Les techniciens de la ville se mettent en grève, ralentissant toute la production.",
    choices:[
      {t:"Payer un tarif d'urgence (-350€)",d:{argent:-350},reason:"🛠️ Production maintenue au rythme normal."},
      {t:"Ralentir la production",d:{},fn:()=>{ state.projects.forEach(p=>{ p.reste += 2; }); },reason:"🛠️ Tous les projets en cours prennent 2 jours de retard."},
      {t:"Soutenir publiquement la grève",d:{reputation:4,reseau:2},reason:"🛠️ Soutien apprécié par la profession."}
    ]
  })},
  {min:0,max:2,id:"subvention",imp:1,w:2,when:()=>state.signed.length>0,make:()=>({
    title:"🏛️ Subvention culturelle locale",
    desc:"La mairie propose une aide pour soutenir la scène musicale locale.",
    choices:[
      {t:"Faire le dossier (-20€ de frais)",p:.6,sD:{argent:600},fD:{argent:-20},sMsg:"Subvention obtenue !",fMsg:"Dossier refusé.",sReason:"🏛️ Subvention obtenue, dossier accepté.",fReason:"🏛️ Dossier refusé, frais perdus."},
      {t:"Ignorer, trop de paperasse",d:{},reason:"🏛️ Vous laissez passer l'opportunité."},
      {t:"Demander de l'aide à votre réseau",d:{reseau:-2},fn:()=>{state.argent+=300;},reason:"🏛️ Un contact aide à monter le dossier rapidement."}
    ]
  })},
  {min:1,max:3,id:"hater_influenceur",imp:2,w:2,when:()=>state.notoriete>=15,make:()=>{
    const a = rA();
    return {
      title:"👎 Un influenceur descend votre artiste",
      desc:`Une vidéo critique très négative sur ${a?a.name:"votre artiste"} devient virale.`,
      choices:[
        {t:"Répondre publiquement",p:.5,sD:{buzz:8,reputation:3},fD:{reputation:-6},sMsg:"La réponse fait mouche !",fMsg:"La réponse envenime tout.",sReason:"👎 Réponse maligne, le vent tourne.",fReason:"👎 La réponse aggrave la polémique."},
        {t:"Ignorer complètement",d:{},reason:"👎 Vous ne répondez pas, ça finit par retomber."},
        {t:"Envoyer une mise en demeure (-250€)",d:{argent:-250,reseau:-2},reason:"👎 Mise en demeure envoyée, l'influenceur se calme mais garde rancune."}
      ]
    };
  }},
  {min:0,max:3,id:"collab_interne",imp:1,w:2,when:()=>state.signed.length>=2,make:()=>{
    const a1 = pick(state.signed);
    const others = state.signed.filter(x=>x.id!==a1.id);
    const a2 = others.length ? pick(others) : null;
    if(!a2) return {title:"🎧 Idée de collab",desc:"Pas assez d'artistes pour une collab interne.",choices:[{t:"Dommage",d:{},reason:"🎧 Rien à faire pour l'instant."}]};
    return {
      title:"🎧 Deux artistes du label veulent collaborer",
      desc:`${a1.name} et ${a2.name} proposent spontanément un featuring interne.`,
      choices:[
        {t:"Encourager le projet",d:{reseau:2},fn:()=>{a1.humeur=clamp(a1.humeur+4,0,100);a2.humeur=clamp(a2.humeur+4,0,100);},reason:"🎧 Collab encouragée : moral des deux artistes en hausse."},
        {t:"Laisser faire sans s'impliquer",d:{},reason:"🎧 Vous laissez les artistes s'organiser seuls."},
        {t:"Financer une session dédiée (-300€)",d:{argent:-300},fn:()=>{a1.humeur=clamp(a1.humeur+8,0,100);a2.humeur=clamp(a2.humeur+8,0,100);},reason:"🎧 Session financée : moral au top pour les deux."}
      ]
    };
  }},
  {min:2,max:4,id:"scandale_rival",imp:2,w:1,when:()=>pveUnlocked() && state.rivals.length>0,make:()=>{
    const r = pick(state.rivals);
    return {
      title:`📰 Scandale chez ${r.name}`,
      desc:`Un scandale interne éclate chez ${r.name}. L'occasion est là.`,
      choices:[
        {t:"Récupérer des artistes déçus",p:.4,sD:{},fD:{argent:-200},sMsg:"Un artiste du rival rejoint votre label !",fMsg:"La tentative échoue, frais de démarchage perdus.",sFn:()=>{
          if(r.roster.length){ const idx=rint(0,r.roster.length-1); const stolen=r.roster.splice(idx,1)[0]; finalizeSigned(stolen); state.signed.push(stolen); }
        },fFn:()=>{ state.argent-=200; },sReason:`📰 Vous profitez du chaos chez ${r.name}.`,fReason:"📰 Tentative de récupération infructueuse."},
        {t:"Rester neutre",d:{},reason:"📰 Vous n'intervenez pas dans les affaires du rival."},
        {t:"En faire un exemple publiquement",d:{reputation:3,reseau:-2},reason:`📰 Vous commentez le scandale, ce qui vous rend crédible mais froisse le milieu.`}
      ]
    };
  }},

  // ===================== V4 : humour noir / complots / politique (impacts réduits, taux cachés) =====================

  // --- 1. Complots & services secrets ---
  {min:2,max:4,id:"v4_mossad",imp:2,w:1,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🕵️ Agent du Mossad",
      desc:`${a?a.name:"Votre artiste"} est en réalité un agent du Mossad en mission. Il doit quitter le label pour 3 semaines.`,
      choices:[
        {t:"Le couvrir",d:{reseau:2,reputation:-1},reason:`🕵️ Vous couvrez ${a?a.name:"l'artiste"}, discrétion assurée.`},
        {t:"Le dénoncer",d:{buzz:1,reputation:-2},reason:"🕵️ L'affaire fuite, ça fait jaser."},
        {t:"Lui demander un service",p:.5,sD:{reseau:2},fD:{reputation:-2},sMsg:pick(DATA.EVENT_SUCCESS_PHRASES),fMsg:pick(DATA.EVENT_FAIL_PHRASES),sReason:"🕵️ Service rendu, contact précieux.",fReason:"🕵️ Ça se passe mal."}
      ]
    };
  }},
  {min:2,max:4,id:"v4_dgse",imp:2,w:1,when:()=>state.signed.length>0,make:()=>({
    title:"🕶️ Le DGSE vous contacte",
    desc:"Un agent de la DGSE vous propose une collaboration discrète.",
    choices:[
      {t:"Accepter",d:{argent:adaptCost("moyen"),reputation:-2},reason:"🕶️ Collaboration discrète acceptée."},
      {t:"Refuser poliment",d:{reputation:1},reason:"🕶️ Vous déclinez, prudence oblige."},
      {t:"Le dénoncer à la presse",d:{buzz:2,reputation:-2},reason:"🕶️ L'histoire fait le tour des médias."}
    ]
  })},
  {min:1,max:4,id:"v4_cryptos",imp:1,w:2,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"₿ L'artiste et les cryptos",
      desc:`${a?a.name:"Votre artiste"} est accusé d'avoir des liens avec des groupes extrémistes via des cryptos.`,
      choices:[
        {t:"Démentir fermement",d:{reputation:1},reason:"₿ Démenti clair et net."},
        {t:"Se taire",d:{reputation:-2,buzz:1},reason:"₿ Le silence alimente les rumeurs."},
        {t:`Porter plainte (-${fmt(adaptCost("petit"))})`,d:{argent:-adaptCost("petit"),reputation:2},reason:"₿ Plainte déposée, image protégée."}
      ]
    };
  }},
  {min:1,max:3,id:"v4_usb",imp:1,w:2,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"💾 La clé USB",
      desc:`${a?a.name:"Votre artiste"} trouve une clé USB contenant des documents classifiés.`,
      choices:[
        {t:"Rendre à la police",d:{reputation:2},reason:"💾 Geste citoyen salué."},
        {t:"La vendre à un média",d:{argent:adaptCost("moyen"),reputation:-3},reason:"💾 Vendue, mais ça jase."},
        {t:"La garder",p:.5,sD:{reseau:2},fD:{reputation:-2},sMsg:pick(DATA.EVENT_SUCCESS_PHRASES),fMsg:pick(DATA.EVENT_FAIL_PHRASES),sReason:"💾 Contact influent obtenu.",fReason:"💾 Ça se sait, mauvais genre."}
      ]
    };
  }},
  {min:2,max:5,id:"v4_espion_russe",imp:2,w:1,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🇷🇺 L'espion russe",
      desc:`${a?a.name:"Votre artiste"} est soupçonné d'être un agent dormant russe.`,
      choices:[
        {t:"Déclaration patriotique",d:{reputation:2,buzz:-1},reason:"🇷🇺 Déclaration qui rassure."},
        {t:"En faire un buzz",d:{buzz:3,reputation:-2},reason:"🇷🇺 Le buzz explose, la réputation trinque."},
        {t:"Le licencier",d:{reputation:1},fn:()=>{ removeArtist(a); },reason:`🇷🇺 ${a?a.name:"L'artiste"} quitte le label.`}
      ]
    };
  }},

  // --- 2. Politique & extrêmes ---
  {min:1,max:4,id:"v4_tweet_trop",imp:1,w:2,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🐦 Le tweet de trop",
      desc:`${a?a.name:"Votre artiste"} tweete une phrase qui divise tout le pays.`,
      choices:[
        {t:"S'excuser",d:{reputation:1},reason:"🐦 Excuses publiques, l'affaire se calme."},
        {t:"Assumer",d:{buzz:2,reputation:-2},reason:"🐦 Assumé à fond, ça clive."},
        {t:"Le faire taire",fn:()=>{ a.humeur=clamp(a.humeur-2,0,100); },d:{},reason:`🐦 ${a?a.name:"L'artiste"} est prié de se taire, moral en baisse.`}
      ]
    };
  }},
  {min:2,max:4,id:"v4_lfi_studio",imp:2,w:1,when:()=>state.signed.length>0,make:()=>({
    title:"🚩 Un politique veut votre studio",
    desc:"Un député veut utiliser votre studio pour tourner un clip de campagne.",
    choices:[
      {t:"Accepter",d:{buzz:2,reputation:-1},reason:"🚩 Studio prêté, ça fait parler."},
      {t:"Refuser",d:{reputation:1},reason:"🚩 Vous restez à l'écart de la politique."},
      {t:`Le faire payer (+${fmt(adaptCost("petit"))})`,d:{argent:adaptCost("petit"),buzz:1,reputation:-2},reason:"🚩 Location facturée, image écornée."}
    ]
  })},
  {min:2,max:5,id:"v4_politique_concert",imp:2,w:1,when:()=>state.notoriete>=20,make:()=>{
    const a=rA(); return {
      title:"🎤 Personnalité politique au concert",
      desc:`Une personnalité politique très clivante assiste à un concert de ${a?a.name:"votre artiste"}.`,
      choices:[
        {t:"L'accueillir normalement",d:{buzz:2,reputation:-2},reason:"🎤 Accueil neutre, mais ça se voit."},
        {t:"L'exclure",d:{reputation:2,buzz:-2},reason:"🎤 Exclusion assumée."},
        {t:"En faire une photo",d:{buzz:3,reputation:-3},reason:"🎤 La photo fait le tour du web."}
      ]
    };
  }},
  {min:3,max:5,id:"v4_meeting",imp:2,w:1,when:()=>state.notoriete>=25,make:()=>{
    const a=rA(); return {
      title:"🎙️ Le meeting politique",
      desc:`${a?a.name:"Votre artiste"} est invité à chanter à un meeting politique très clivant.`,
      choices:[
        {t:"Accepter",d:{argent:adaptCost("gros"),reputation:-3},reason:"🎙️ Cachet encaissé, réputation entamée."},
        {t:"Refuser publiquement",d:{reputation:2,reseau:-1},reason:"🎙️ Refus assumé publiquement."},
        {t:"Y aller déguisé",d:{buzz:3,reputation:-3},reason:"🎙️ Repéré quand même, ça jase."}
      ]
    };
  }},
  {min:1,max:3,id:"v4_11sept",imp:1,w:1,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"📅 Le post ambigu",
      desc:`${a?a.name:"Votre artiste"} poste une story très ambiguë un jour de commémoration nationale.`,
      choices:[
        {t:"Supprimer et s'excuser",d:{reputation:1},reason:"📅 Story supprimée, excuses faites."},
        {t:"Assumer en second degré",d:{buzz:2,reputation:-2},reason:"📅 Second degré mal reçu par certains."},
        {t:"Ignorer",d:{reputation:-2},reason:"📅 Le silence est pris pour un aveu."}
      ]
    };
  }},
  {min:1,max:4,id:"v4_voile_clip",imp:1,w:1,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🧕 Le symbole religieux dans le clip",
      desc:`${a?a.name:"Votre artiste"} porte un symbole religieux fort dans un clip.`,
      choices:[
        {t:"Laisser",d:{buzz:2,reputation:-2},reason:"🧕 Ça fait débat, mais ça tourne."},
        {t:"Couper la scène",d:{reputation:1},reason:"🧕 Scène coupée, polémique évitée."},
        {t:"Doubler la mise",d:{buzz:3,reputation:-3},reason:"🧕 Assumé à fond, le clivage grandit."}
      ]
    };
  }},
  {min:2,max:4,id:"v4_portrait",imp:1,w:1,when:()=>state.signed.length>0,make:()=>({
    title:"🖼️ Le tableau qui dérange",
    desc:"Un tableau d'une figure historique très controversée est aperçu dans le studio.",
    choices:[
      {t:"Le retirer discrètement",d:{},reason:"🖼️ Retiré sans bruit."},
      {t:"Faire une déclaration",d:{buzz:2,reputation:-2},reason:"🖼️ Déclaration qui met le feu aux poudres."},
      {t:`Le revendre (+${fmt(adaptCost("petit"))})`,d:{argent:adaptCost("petit"),reputation:-1},reason:"🖼️ Vendu discrètement à un collectionneur."}
    ]
  })},

  // --- 3. Religion & sectes ---
  {min:2,max:4,id:"v4_secte",imp:2,w:1,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🕯️ La secte de l'artiste",
      desc:`On découvre que ${a?a.name:"votre artiste"} a fondé une petite secte spirituelle.`,
      choices:[
        {t:"Le soutenir",d:{buzz:2,reputation:-3},reason:"🕯️ Soutien affiché, ça choque."},
        {t:"Le dénoncer",d:{reputation:2,reseau:-1},reason:"🕯️ Dénonciation publique, image sauvée."},
        {t:"Prendre 10% des dons",d:{argent:adaptCost("petit"),reputation:-2},reason:"🕯️ Petit à-côté discutable mais lucratif."}
      ]
    };
  }},
  {min:1,max:3,id:"v4_imam",imp:1,w:1,when:()=>state.signed.length>0,make:()=>({
    title:"🙏 La bénédiction controversée",
    desc:"Une figure religieuse radicale vient bénir le studio devant les caméras.",
    choices:[
      {t:"Accepter",d:{buzz:2,reputation:-2},reason:"🙏 Bénédiction filmée, ça fait débat."},
      {t:"Refuser",d:{reputation:1},reason:"🙏 Refus discret, tension évitée."},
      {t:`Le filmer (+${fmt(adaptCost("moyen"))})`,d:{argent:adaptCost("moyen"),reputation:-3},reason:"🙏 Vidéo vendue à un média, ça dérange."}
    ]
  })},
  {min:0,max:2,id:"v4_tag",imp:1,w:2,when:()=>state.releases.length>0,make:()=>({
    title:"🎨 Le tag controversé",
    desc:"Un fan a tagué un symbole polémique sur une pochette d'album.",
    choices:[
      {t:"Supprimer",d:{},reason:"🎨 Pochette nettoyée."},
      {t:"Déclaration anti-extrême",d:{reputation:2},reason:"🎨 Déclaration ferme, bien reçue."},
      {t:"Garder comme street art",d:{buzz:2,reputation:-2},reason:"🎨 Gardé, ça divise les fans."}
    ]
  })},

  // --- 4. Scandales & moral ---
  {min:2,max:5,id:"v4_sextape",imp:2,w:1,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"📱 La vidéo qui fuite",
      desc:`Une vidéo très privée de ${a?a.name:"votre artiste"} fuite sur les réseaux.`,
      choices:[
        {t:`Nier (-${fmt(adaptCost("moyen"))})`,d:{argent:-adaptCost("moyen"),reputation:2},reason:"📱 Démenti musclé, avocats mobilisés."},
        {t:"Assumer",d:{buzz:3,reputation:-3},reason:"📱 Assumé publiquement, ça fait du bruit."},
        {t:"La monétiser",d:{argent:adaptCost("gros"),reputation:-4},reason:"📱 Monétisée honteusement, mais rentable."}
      ]
    };
  }},
  {min:2,max:4,id:"v4_accusation",imp:2,w:1,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"⚠️ Accusations graves",
      desc:`${a?a.name:"Votre artiste"} fait l'objet d'accusations très graves relayées par la presse.`,
      choices:[
        {t:"Le soutenir publiquement",d:{reputation:-3},reason:"⚠️ Soutien risqué tant que rien n'est prouvé."},
        {t:"Le suspendre le temps de l'enquête",d:{reputation:2},fn:()=>{ a.humeur=clamp(a.humeur-3,0,100); },reason:`⚠️ ${a?a.name:"L'artiste"} suspendu, moral en baisse.`},
        {t:"Rompre le contrat",d:{reputation:3},fn:()=>{ removeArtist(a); },reason:`⚠️ Contrat rompu par précaution.`}
      ]
    };
  }},
  {min:0,max:2,id:"v4_fan_loge",imp:1,w:1,when:()=>state.notoriete>=10,make:()=>({
    title:"🚪 Intrusion en loge",
    desc:"Un fan un peu trop excité s'introduit dans la loge.",
    choices:[
      {t:"Appeler la sécurité",d:{},reason:"🚪 Sécurité gérée sans histoire."},
      {t:"Faire une photo souvenir",d:{buzz:2,reputation:-1},reason:"🚪 Photo virale, un peu gênante."},
      {t:"Le prendre comme stagiaire",d:{reseau:1,reputation:-2},reason:"🚪 Improbable mais amusant."}
    ]
  })},

  // --- 5. Médias & réseaux sociaux ---
  {min:1,max:3,id:"v4_live_derape",imp:1,w:2,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"📡 Le live qui dérape",
      desc:`${a?a.name:"Votre artiste"} lâche une phrase malheureuse en direct.`,
      choices:[
        {t:"Couper le live",d:{reputation:-1},reason:"📡 Live coupé en urgence."},
        {t:"Assumer et débattre",d:{buzz:2,reputation:-2},reason:"📡 Débat houleux mais suivi."},
        {t:`Payer un community manager (-${fmt(adaptCost("petit"))})`,d:{argent:-adaptCost("petit"),reputation:2},reason:"📡 Gestion de crise professionnelle."}
      ]
    };
  }},
  {min:1,max:3,id:"v4_tweet_supprime",imp:1,w:1,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🗑️ Le tweet supprimé",
      desc:`${a?a.name:"Votre artiste"} tweete un slogan politique puis le supprime aussitôt.`,
      choices:[
        {t:"Assumer",d:{buzz:2,reputation:-2},reason:"🗑️ Assumé finalement, ça clive."},
        {t:"Démentir",d:{reputation:1,buzz:-1},reason:"🗑️ Démenti accepté par la majorité."},
        {t:"En faire un tee-shirt",d:{argent:adaptCost("moyen"),reputation:-2},reason:"🗑️ Produit dérivé qui se vend bien."}
      ]
    };
  }},
  {min:1,max:3,id:"v4_onlyfans",imp:1,w:1,when:()=>state.beatmakers.length>0,make:()=>{
    const b=pick(state.beatmakers); return {
      title:"💻 Le compte pas très net",
      desc:`On découvre que ${b.name} tient un compte payant assez... particulier.`,
      choices:[
        {t:"Le soutenir",d:{buzz:1,reputation:-1},reason:`💻 Soutien discret à ${b.name}.`},
        {t:"L'obliger à arrêter",d:{reputation:1},reason:"💻 Compte fermé, tranquillité retrouvée."},
        {t:"Prendre un pourcentage",d:{argent:adaptCost("petit"),reputation:-2},reason:"💻 Petit revenu régulier, mais douteux."}
      ]
    };
  }},

  // --- 6. Situations absurdes ---
  {min:1,max:4,id:"v4_sosie",imp:1,w:1,when:()=>state.signed.length>0,make:()=>({
    title:"🎭 Le sosie improbable",
    desc:"Le sosie troublant d'une figure historique très controversée se présente au casting.",
    choices:[
      {t:"Le prendre",d:{buzz:2,reputation:-3},reason:"🎭 Casting osé, ça fait scandale."},
      {t:"Le refuser",d:{reputation:1},reason:"🎭 Refus sans regret."},
      {t:"Le faire en featuring",d:{buzz:3,reputation:-4},reason:"🎭 Featuring qui choque tout le monde."}
    ]
  })},
  {min:0,max:3,id:"v4_paroles",imp:1,w:2,when:()=>state.releases.length>0,make:()=>{
    const r=pick(state.releases); return {
      title:"📝 Paroles ambiguës",
      desc:`« ${r.title} » contient des paroles que certains jugent limites.`,
      choices:[
        {t:"La retirer",d:{reputation:1},reason:"📝 Titre retiré des plateformes."},
        {t:"La garder",d:{reputation:-3,buzz:2},reason:"📝 Gardée telle quelle, ça buzz."},
        {t:"La réécrire",d:{reputation:1,buzz:1},reason:"📝 Version corrigée bien reçue."}
      ]
    };
  }},
  {min:3,max:5,id:"v4_coree",imp:2,w:1,when:()=>state.notoriete>=30,make:()=>{
    const a=rA(); return {
      title:"🌏 L'invitation qui interpelle",
      desc:`${a?a.name:"Votre artiste"} est invité à se produire dans un pays sous très forte dictature.`,
      choices:[
        {t:"Accepter",d:{argent:5000,reputation:-4},reason:"🌏 Cachet énorme, réputation en chute libre."},
        {t:"Refuser",d:{reputation:2},reason:"🌏 Refus salué par la profession."},
        {t:"Y aller en cachette",d:{argent:3000,reputation:-3,buzz:2},reason:"🌏 Voyage discret, mais ça se sait toujours."}
      ]
    };
  }},
  {min:1,max:4,id:"v4_cannabis",imp:1,w:1,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🌿 Interpellation",
      desc:`${a?a.name:"Votre artiste"} est interpellé pour possession de cannabis.`,
      choices:[
        {t:`Payer une caution (-${fmt(adaptCost("moyen"))})`,d:{argent:-adaptCost("moyen"),reseau:2,reputation:-2},reason:"🌿 Sorti rapidement grâce à vos contacts."},
        {t:"Le laisser assumer",fn:()=>{ a.humeur=clamp(a.humeur-2,0,100); },d:{reputation:2},reason:`🌿 ${a?a.name:"L'artiste"} assume seul, moral en baisse.`},
        {t:"En faire un titre",d:{buzz:3,argent:adaptCost("petit")},reason:"🌿 Transformé en single, ironie assumée."}
      ]
    };
  }},
  {min:3,max:5,id:"v4_dictateur",imp:2,w:1,when:()=>state.credibilite>=25,make:()=>{
    const a=rA(); return {
      title:"🍽️ Le dîner qui pose question",
      desc:`${a?a.name:"Votre artiste"} est invité à dîner avec un dirigeant très autoritaire.`,
      choices:[
        {t:"Accepter",d:{argent:adaptCost("gros"),reputation:-3},reason:"🍽️ Dîner accepté, ça fait jaser."},
        {t:"Refuser",d:{reputation:2},reason:"🍽️ Refus salué."},
        {t:"Y aller déguisé",d:{buzz:3,reputation:-4},reason:"🍽️ Repéré quand même, scandale garanti."}
      ]
    };
  }},

  // --- 7. Décisions de management ---
  {min:1,max:4,id:"v4_feat_controverse",imp:1,w:2,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🤝 Feat avec un artiste clivant",
      desc:`${a?a.name:"Votre artiste"} veut faire un feat avec un artiste très controversé.`,
      choices:[
        {t:"Accepter",d:{buzz:2,reputation:-3},reason:"🤝 Feat validé, ça clive les fans."},
        {t:"Refuser",fn:()=>{ a.humeur=clamp(a.humeur-2,0,100); },d:{reputation:1},reason:`🤝 Refusé, ${a?a.name:"l'artiste"} est déçu.`},
        {t:"Le faire en secret",d:{buzz:2,reputation:-2},reason:"🤝 Fait en douce, risqué si ça sort."}
      ]
    };
  }},
  {min:2,max:5,id:"v4_sponsor_politique",imp:2,w:1,when:()=>state.signed.length>0,make:()=>({
    title:"💰 Sponsor encombrant",
    desc:"Un groupe politique très clivant vous propose de financer votre prochain projet.",
    choices:[
      {t:"Accepter",d:{argent:5000,reputation:-5},reason:"💰 Financement accepté, image ternie."},
      {t:"Refuser",d:{reputation:2},reason:"💰 Refus qui vous grandit."},
      {t:"Accepter anonymement",d:{argent:5000,reputation:-3},reason:"💰 Discret pour l'instant, risque si ça sort."}
    ]
  })},
  {min:1,max:3,id:"v4_photo_arme",imp:1,w:1,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🔫 Photo malaisante",
      desc:`${a?a.name:"Votre artiste"} poste une photo avec une arme, pour le style.`,
      choices:[
        {t:"Supprimer",d:{},reason:"🔫 Photo supprimée rapidement."},
        {t:"Assumer",d:{buzz:2,reputation:-2},reason:"🔫 Assumé, ça fait causer."},
        {t:"Se rendre à la police",d:{reputation:2,buzz:-2},reason:"🔫 Démarche volontaire saluée."}
      ]
    };
  }},

  // --- 8. Événements légers (bonus fréquents, impacts minimes) ---
  {min:0,max:3,id:"v4_fan_saitout",imp:1,w:3,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🤓 Le fan qui sait tout",
      desc:`Un fan prétend connaître le vrai nom de ${a?a.name:"votre artiste"}.`,
      choices:[
        {t:"Ignorer",d:{},reason:"🤓 Vous laissez dire."},
        {t:"Confirmer",d:{buzz:1},reason:"🤓 Confirmé, ça amuse la toile."},
        {t:"Démentir",d:{buzz:1},reason:"🤓 Démenti qui alimente le mystère."}
      ]
    };
  }},
  {min:0,max:2,id:"v4_chien",imp:1,w:3,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🐕 Le chien indiscipliné",
      desc:`Le chien de ${a?a.name:"l'artiste"} aboie en pleine prise d'enregistrement.`,
      choices:[
        {t:"Garder la prise",d:{buzz:1},reason:"🐕 Gardé tel quel, ça fait sourire."},
        {t:"Recommencer",d:{},reason:"🐕 Nouvelle prise, plus propre."},
        {t:"Feat avec le chien",d:{buzz:2},reason:"🐕 Le chien aboie sur le refrain, ça marche."}
      ]
    };
  }},
  {min:0,max:2,id:"v4_micro",imp:1,w:2,when:()=>state.notoriete>=10,make:()=>({
    title:"🎙️ Le micro capricieux",
    desc:"Le micro grésille en plein concert.",
    choices:[
      {t:"Continuer",d:{reputation:-1},reason:"🎙️ Concert terminé tant bien que mal."},
      {t:"Changer de micro",d:{},reason:"🎙️ Changement rapide, personne ne remarque."},
      {t:"En faire un sketch",d:{buzz:2},reason:"🎙️ Improvisation qui fait rire la salle."}
    ]
  })},
  {min:0,max:2,id:"v4_huitre",imp:1,w:2,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"🦪 L'allergie inattendue",
      desc:`${a?a.name:"Votre artiste"} tombe sur un plateau-repas allergène.`,
      choices:[
        {t:`Porter plainte (+${fmt(Math.round(adaptCost("petit")/2))})`,d:{argent:Math.round(adaptCost("petit")/2),reputation:-1},reason:"🦪 Petit dédommagement obtenu."},
        {t:"En rire sur les réseaux",d:{buzz:2},reason:"🦪 Anecdote qui amuse les fans."},
        {t:"Changer de traiteur",fn:()=>{ a.humeur=clamp(a.humeur+1,0,100); },d:{},reason:`🦪 ${a?a.name:"L'artiste"} rassuré, léger mieux au moral.`}
      ]
    };
  }},
  {min:0,max:3,id:"v4_sosie_star",imp:1,w:2,when:()=>state.signed.length>0,make:()=>{
    const a=rA(); return {
      title:"⭐ Confondu avec une célébrité",
      desc:`${a?a.name:"Votre artiste"} est confondu avec une star internationale dans la rue.`,
      choices:[
        {t:"En profiter",d:{buzz:2},reason:"⭐ Le quiproquo fait bien rire les fans."},
        {t:"Se fâcher",d:{buzz:-1},reason:"⭐ Mauvaise humeur, l'anecdote retombe."},
        {t:"Faire un duo avec la vraie star",d:{buzz:2,reputation:1},reason:"⭐ Le quiproquo débouche sur une vraie collab."}
      ]
    };
  }},

  // ===================== RELATIONS ENTRE ARTISTES =====================
  {min:0,max:5,id:"rel_jalousie",imp:2,w:3,when:()=>state.signed.length>=2,make:()=>{
    const [a,b] = rTwo();
    return {
      title:"😒 Jalousie en interne",
      desc:`${a.name} trouve que ${b.name} reçoit trop d'attention en ce moment. L'ambiance devient électrique.`,
      choices:[
        {t:"Organiser une discussion à trois",fn:()=>{ adjustRelation(a,b,10); a.humeur=clamp(a.humeur+3,0,100); },d:{},reason:`😒 Discussion apaisée entre ${a.name} et ${b.name}.`},
        {t:"Laisser couver",fn:()=>{ adjustRelation(a,b,-12); },d:{},reason:`😒 La tension entre ${a.name} et ${b.name} s'installe.`},
        {t:"Prendre parti pour l'un des deux",fn:()=>{ adjustRelation(a,b,-20); b.humeur=clamp(b.humeur-5,0,100); },d:{reseau:-1},reason:`😒 Vous prenez parti : ${b.name} le vit mal, la relation se dégrade.`}
      ]
    };
  }},
  {min:0,max:5,id:"rel_reconciliation",imp:1,w:2,when:()=>{ const [a,b]=rTwo(); return a && b && getRelation(a,b).score<=-20; },make:()=>{
    const signedWithTension = state.signed.filter(x=>state.signed.some(y=>y.id!==x.id && getRelation(x,y).score<=-20));
    const a = signedWithTension.length ? pick(signedWithTension) : rA();
    const other = state.signed.filter(x=>x.id!==a.id && getRelation(a,x).score<=-20);
    const b = other.length ? pick(other) : rA();
    return {
      title:"🕊️ Occasion de réconciliation",
      desc:`${a.name} et ${b.name} pourraient enterrer la hache de guerre... ou pas.`,
      choices:[
        {t:"Organiser une session studio commune",p:.6,sD:{buzz:5},fD:{},sMsg:"Le courant repasse, la session est un succès !",fMsg:"La session tourne court, gênant pour tout le monde.",sFn:()=>adjustRelation(a,b,25),fFn:()=>adjustRelation(a,b,-8),sReason:`🕊️ ${a.name} et ${b.name} se réconcilient en studio.`,fReason:`🕊️ La tentative de réconciliation échoue.`},
        {t:"Ne rien forcer",fn:()=>{},d:{},reason:"🕊️ Vous laissez le temps faire son œuvre."},
        {t:"Écrire un morceau ensemble sur leur histoire",fn:()=>{ adjustRelation(a,b,15); },d:{buzz:3},reason:`🕊️ ${a.name} et ${b.name} transforment leur histoire en morceau.`}
      ]
    };
  }},
  {min:1,max:5,id:"rel_romance",imp:2,w:2,when:()=>state.signed.length>=2,make:()=>{
    const [a,b] = rTwo();
    return {
      title:"💞 Une étincelle",
      desc:`Des rumeurs circulent : ${a.name} et ${b.name} se rapprochent dangereusement.`,
      choices:[
        {t:"Laisser faire, tant que c'est pro",fn:()=>{ const rel=getRelation(a,b); rel.romance=true; adjustRelation(a,b,20); },d:{buzz:4},reason:`💞 ${a.name} et ${b.name} officialisent, le buzz s'emballe.`},
        {t:"Recommander la prudence",fn:()=>{ adjustRelation(a,b,5); },d:{},reason:`💞 Vous recommandez de rester discrets pour l'instant.`},
        {t:"Monter une fausse rumeur pour le buzz",p:.5,sD:{buzz:8},fD:{reputation:-4},sMsg:"Le coup marketing fonctionne à merveille.",fMsg:"Le public sent le coup monté et le fait savoir.",sReason:"💞 Rumeur habilement entretenue.",fReason:"💞 Rumeur qui se retourne contre le label."}
      ]
    };
  }},
  {min:1,max:5,id:"rel_trahison",imp:3,w:2,when:()=>state.signed.length>=2,make:()=>{
    const [a,b] = rTwo();
    return {
      title:"🔪 Vol en studio",
      desc:`${a.name} accuse ${b.name} d'avoir piqué une de ses idées de son sans le créditer.`,
      choices:[
        {t:"Organiser une médiation officielle",fn:()=>{ adjustRelation(a,b,-15); },d:{reseau:2},reason:`🔪 Médiation officielle : le calme revient en surface, mais la confiance est entamée.`},
        {t:"Trancher en faveur de "+a.name,fn:()=>{ adjustRelation(a,b,-40); scheduleFollowUp(rint(12,22),"betrayal_fallout",{a:a.name,b:b.name}); },d:{},reason:`🔪 Vous donnez raison à ${a.name} : ${b.name} ne le digère pas.`},
        {t:"Étouffer l'affaire",fn:()=>{ adjustRelation(a,b,-25); },d:{reputation:-2},reason:"🔪 L'affaire étouffée finit par fuiter : -Crédibilité."}
      ]
    };
  }},
  {min:2,max:5,id:"rel_duo_hype",imp:2,w:2,when:()=>{ const [a,b]=rTwo(); return a && b && getRelation(a,b).score>=40; },make:()=>{
    const strong = state.signed.filter(x=>state.signed.some(y=>y.id!==x.id && getRelation(x,y).score>=40));
    const a = strong.length ? pick(strong) : rA();
    const other = state.signed.filter(x=>x.id!==a.id && getRelation(a,x).score>=40);
    const b = other.length ? pick(other) : rA();
    return {
      title:"🤝 Alchimie parfaite",
      desc:`${a.name} et ${b.name} s'entendent tellement bien que l'idée d'un morceau commun tombe sous le sens.`,
      choices:[
        {t:"Lancer le projet tout de suite",fn:()=>{ startCollabFromEvent(a.id,b.id); },d:{},reason:`🤝 Vous lancez un projet réunissant ${a.name} et ${b.name}.`},
        {t:"Garder l'idée de côté pour plus tard",d:{},reason:"🤝 L'idée est notée, pour une prochaine fois."},
        {t:"Proposer une tournée commune",d:{popularite:2,argent:-Math.round(adaptCost("moyen"))},reason:`🤝 Petite tournée commune organisée pour ${a.name} et ${b.name}.`}
      ]
    };
  }},

  // ===================== ÂGE / ÉNERGIE / STRESS DU MANAGER =====================
  {min:0,max:5,id:"age_jeunesse",imp:1,w:2,when:()=>state.player.age<23,make:()=>({
    title:"🌱 L'énergie de la jeunesse",
    desc:"Vous vous sentez capable de tout enchaîner sans dormir. Le monde vous appartient.",
    choices:[
      {t:"Enchaîner les sessions jusqu'au bout de la nuit",fn:()=>{ state.player.energy=clamp(state.player.energy-15,0,100); state.player.stress=clamp(state.player.stress+5,0,100); },d:{buzz:5},reason:"🌱 Nuit blanche productive : +Notoriété, mais énergie et stress en paient le prix."},
      {t:"Rester raisonnable",fn:()=>{ state.player.stress=clamp(state.player.stress-3,0,100); },d:{},reason:"🌱 Vous restez raisonnable pour une fois."},
      {t:"Foncer tête baissée dans un pari risqué",p:.5,sD:{buzz:10,popularite:2},fD:{reputation:-3},sFn:()=>{state.player.stress=clamp(state.player.stress+10,0,100);},fFn:()=>{state.player.stress=clamp(state.player.stress+10,0,100);},sMsg:"Le culot de la jeunesse paie !",fMsg:"Le pari se retourne contre vous.",sReason:"🌱 Pari audacieux gagnant.",fReason:"🌱 Pari audacieux perdant."}
    ]
  })},
  {min:0,max:5,id:"age_trentaine",imp:2,w:2,when:()=>state.player.age>=29 && state.player.age<36,make:()=>({
    title:"🥲 Le cap de la trentaine",
    desc:"Vous vous surprenez à douter : est-ce vraiment la vie que vous vouliez ? Vos proches vous posent la question sans détour.",
    choices:[
      {t:"Se remettre en question, ralentir un peu",fn:()=>{ state.player.stress=clamp(state.player.stress-15,0,100); state.player.energy=clamp(state.player.energy-5,0,100); },d:{},reason:"🥲 Vous prenez du recul : -Stress."},
      {t:"Tout donner pour prouver que ça valait le coup",fn:()=>{ state.player.stress=clamp(state.player.stress+12,0,100); },d:{popularite:2,buzz:4},reason:"🥲 Vous redoublez d'efforts pour prouver votre choix de vie : +Stress."},
      {t:"En parler ouvertement dans une interview",d:{reputation:3},fn:()=>{ state.player.stress=clamp(state.player.stress-5,0,100); },reason:"🥲 Vous en parlez publiquement : ça résonne, +Crédibilité."}
    ]
  })},
  {min:1,max:5,id:"age_maturite",imp:1,w:2,when:()=>state.player.age>=36 && state.player.age<50,make:()=>({
    title:"🧭 La sagesse du métier",
    desc:"L'expérience commence à vraiment payer : vous voyez venir les problèmes avant qu'ils n'éclatent.",
    choices:[
      {t:"Transmettre votre expérience à vos artistes",fn:()=>{ state.signed.forEach(a=>{a.humeur=clamp(a.humeur+3,0,100);}); },d:{},reason:"🧭 Vos artistes profitent de votre expérience : +Moral général."},
      {t:"Capitaliser en silence",fn:()=>{ state.player.stress=clamp(state.player.stress-8,0,100); },d:{},reason:"🧭 Vous gérez avec calme et assurance."},
      {t:"Prendre un jeune associé pour préparer la suite",d:{argent:-Math.round(adaptCost("moyen")),reseau:4},reason:"🧭 Vous investissez dans la relève du label."}
    ]
  })},
  {min:1,max:5,id:"age_retraite",imp:2,w:2,when:()=>state.player.age>=50,make:()=>({
    title:"👑 Penser à la suite",
    desc:"Un journaliste vous demande, mi-sérieux mi-taquin, quand vous comptez passer la main.",
    choices:[
      {t:"Répondre que vous ne lâcherez jamais",fn:()=>{ state.player.stress=clamp(state.player.stress+6,0,100); },d:{buzz:3,reputation:2},reason:"👑 Réponse combative très commentée."},
      {t:"Évoquer sincèrement la transmission",fn:()=>{ state.player.stress=clamp(state.player.stress-10,0,100); },d:{reputation:3},reason:"👑 Discours touchant sur la transmission : +Crédibilité, -Stress."},
      {t:"Éluder la question avec humour",d:{buzz:2},reason:"👑 Vous évitez le sujet avec une pirouette qui fait rire."}
    ]
  })},
  {min:0,max:5,id:"stress_burnout",imp:3,w:3,when:()=>state.player.stress>=75,make:()=>({
    title:"🔥 Signal d'alarme",
    desc:"Vous ne dormez plus, vous criez pour un rien. Votre entourage s'inquiète sérieusement pour vous.",
    choices:[
      {t:"Tout lâcher une semaine pour souffler",fn:()=>{ state.player.stress=clamp(state.player.stress-35,0,100); state.player.energy=clamp(state.player.energy+20,0,100); },d:{buzz:-4},reason:"🔥 Semaine de coupure totale : -Stress, +Énergie, un peu de Notoriété perdue."},
      {t:"Serrer les dents et continuer",fn:()=>{ state.player.stress=clamp(state.player.stress+5,0,100); },d:{},reason:"🔥 Vous serrez les dents. Le stress reste au maximum."},
      {t:"Déléguer une partie de la charge (-argent)",fn:()=>{ state.player.stress=clamp(state.player.stress-15,0,100); },d:{argent:-Math.round(adaptCost("petit"))},reason:"🔥 Vous déléguez une partie du travail : -Stress."}
    ]
  })},
  {min:0,max:5,id:"energy_coup_de_barre",imp:1,w:2,when:()=>state.player.energy<=15,make:()=>({
    title:"😴 Coup de barre",
    desc:"Vous vous endormez en pleine réunion. Votre corps vous envoie un message clair.",
    choices:[
      {t:"Dormir enfin une nuit complète",fn:()=>{ state.player.energy=clamp(state.player.energy+30,0,100); },d:{},reason:"😴 Nuit complète enfin : +Énergie."},
      {t:"Enchaîner au café",fn:()=>{ state.player.energy=clamp(state.player.energy+8,0,100); state.player.stress=clamp(state.player.stress+6,0,100); },d:{},reason:"😴 Tenu au café : un peu d'énergie, plus de stress."},
      {t:"Ignorer et continuer comme si de rien n'était",fn:()=>{ state.player.stress=clamp(state.player.stress+10,0,100); },d:{},reason:"😴 Vous ignorez les signaux. Le corps encaisse."}
    ]
  })}
];

export function choiceRequiredArgent(c){
  return Math.max(0, -(c.d?.argent||0), -(c.sD?.argent||0), -(c.fD?.argent||0));
}

/* Peut-on prendre ce choix, là, maintenant ?

   Attention au piège qui était là : comparer bêtement `argent >= requis`
   interdit AUSSI les choix gratuits (requis = 0) dès que la trésorerie
   est négative. Or le jeu autorise explicitement le découvert — dette
   bancaire, saisons de crise, alerte « trésorerie négative ». Un joueur
   dans le rouge se retrouvait donc avec la totalité des options grisées,
   plus aucun épisode résoluble, et le temps arrêté : la partie était
   morte sans que rien ne le dise.

   Un choix qui ne coûte rien est toujours disponible. Seul un choix qui
   demande de sortir de l'argent réclame d'en avoir. */
export function choiceAbordable(c){
  const requis = choiceRequiredArgent(c);
  return requis <= 0 || state.argent >= requis;
}

/* Révélation générique des conséquences d'un choix déterministe, une fois cliqué —
   réutilise l'overlay du roll pour rester cohérent avec les paris. */

export function revealChoiceResult(applyFn, onDone){
  const bg = document.getElementById("rollBg");
  const em = document.getElementById("rollEmoji");
  const rs = document.getElementById("rollResult");
  const lb = document.getElementById("rollLabel");
  if(!bg || !em || !rs || !lb){ applyFn(); if(onDone) onDone(); after(); return; }
  const before = rollSnapshot();
  applyFn();
  const deltas = rollDiff(before);
  const chips = chipsFromDeltas(deltas);
  bg.classList.add("show");
  lb.textContent = "Conséquences...";
  em.className = "roll-emoji reveal good";
  em.textContent = "📜";
  rs.className = "roll-result good";
  rs.innerHTML = chips ? `<div class="impacts" style="justify-content:center">${chips}</div>` : `<div class="small muted">Pas d'impact direct sur vos statistiques.</div>`;
  setTimeout(()=>{
    bg.classList.remove("show");
    if(onDone) onDone();
    safeRender();
    save();
  },1300);
}

/* ============================================================
   WIDGET BEATMAKERS — fenêtre compacte fermable en bas d'écran (gauche)
   Hype hebdomadaire : un beatmaker hype la semaine en cours vaut plus
   la peine d'être pris pour un projet ce jour-là.
============================================================ */

