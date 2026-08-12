import { adaptCost } from "./economy.js";
import { hasFlag } from "./narrative.js";
import { state } from "../state.js";
import { clamp, pick } from "../utils.js";

/* ============================================================
   L'ARC DES DÉBUTS — ce qui manquait vraiment.

   La base de 254 situations suppose presque toujours un label en
   activité : un artiste à gérer, un son sorti, une réputation à
   défendre. Une fois le filtre par jalon posé, le constat était net :
   un joueur qui vient de fonder son label n'avait qu'une poignée
   d'épisodes disponibles, et tournait en rond avant même d'avoir signé
   qui que ce soit.

   Ces épisodes-ci ne parlent que de ça : le moment où il n'y a encore
   rien. Chercher de l'argent, se faire dire non, choisir ce qu'on veut
   être avant d'avoir les moyens de l'être. Ils posent des flags qui
   colorent la suite de la partie — c'est le tout début qui décide du
   genre de patron qu'on devient.

   Tous en jalon 0, aucun ne réclame d'artiste : ils sont là précisément
   quand il n'y a personne.
============================================================ */

export const DEBUT_EPISODES = [

  {min:0,max:5,w:5,stage:0,id:"debut_premier_non",make:()=>({
    title:"🚪 Le premier non",
    desc:`Vous avez appelé six personnes cette semaine pour parler de ${state.label || "votre label"}. Cinq n'ont pas rappelé. La sixième a été claire : « Reviens quand tu auras quelque chose à me faire écouter. »`,
    choices:[
      {t:"Encaisser et rappeler dans un mois",d:{credibilite:3},posture:"assume",addFlag:"encaisse_les_refus",
       reason:"🚪 Vous notez la date et vous rappellerez. C'est comme ça que ça marche."},
      {t:"Insister maintenant",p:.35,sD:{credibilite:5},fD:{credibilite:-4},
       sMsg:"Il vous accorde dix minutes.",fMsg:"Il vous raccroche au nez.",
       sReason:"🚪 Votre insistance paie : dix minutes obtenues, et un contact qui existe.",
       fReason:"🚪 Vous avez insisté une fois de trop. Ce numéro ne répondra plus.",posture:"refuser"},
      {t:"Chercher ailleurs, il y a d'autres portes",d:{},posture:"ignorer",
       reason:"🚪 Vous passez à la liste suivante. Il y a toujours une liste suivante."}
    ]
  })},

  {min:0,max:5,w:5,stage:0,id:"debut_nom_logo",make:()=>({
    title:"🎨 Une identité, avec 50 €",
    desc:`Il faut bien que ${state.label || "le label"} ressemble à quelque chose. Un ami graphiste propose de faire un logo gratuitement, un vrai studio demande une somme que vous n'avez pas, et vous savez à peu près vous servir d'un logiciel.`,
    choices:[
      {t:"Faire appel au copain graphiste",d:{credibilite:3},posture:"accepter",addFlag:"identite_bricolee",
       reason:"🎨 Le logo est fait par un ami. Vous lui devrez quelque chose un jour."},
      {t:"Payer un vrai studio",d:{argent:-Math.round(adaptCost("petit")),notoriete:4,credibilite:2},
       posture:"payer",addFlag:"identite_pro",
       reason:"🎨 Vous payez pour une identité propre. Ça se voit tout de suite."},
      {t:"Le faire vous-même, ce soir",d:{},fn:()=>{ state.player.energy = Math.max(0, state.player.energy - 12); },
       posture:"assume",addFlag:"identite_faite_maison",
       reason:"🎨 Trois heures dessus, un résultat correct. Ça fera l'affaire longtemps."}
    ]
  })},

  {min:0,max:5,w:4,stage:0,id:"debut_boulot_alimentaire",make:()=>({
    title:"🕐 Le boulot à côté",
    desc:"Un ancien collègue vous propose un temps partiel bien payé. Ça sécuriserait tout — et ça mangerait la moitié de votre semaine.",
    choices:[
      {t:"Accepter : il faut bien manger",d:{argent:Math.round(adaptCost("petit"))},
       posture:"accepter",addFlag:"a_un_boulot_a_cote",
       reason:"🕐 Vous prenez le temps partiel. La trésorerie respire, l'agenda beaucoup moins."},
      {t:"Refuser : tout ou rien",d:{credibilite:4},fn:()=>{ state.player.stress = Math.min(100, state.player.stress + 12); },
       posture:"refuser",addFlag:"tout_ou_rien",
       reason:"🕐 Vous refusez. Plus de filet, et ça se sent la nuit."},
      {t:"Négocier deux jours par semaine seulement",p:.6,
       sD:{argent:Math.round(adaptCost("petit")*0.5)},fD:{},
       sMsg:"Il accepte.",fMsg:"C'est temps plein ou rien.",
       sReason:"🕐 Deux jours par semaine : le bon compromis.",
       fReason:"🕐 Pas de demi-mesure possible. Vous laissez tomber.",posture:"negocier"}
    ]
  })},

  {min:0,max:5,w:4,stage:0,id:"debut_premiere_maquette",make:()=>({
    title:"🎧 Une maquette dans la messagerie",
    desc:"Quelqu'un que vous ne connaissez pas vous a envoyé trois morceaux. C'est brut, mal mixé, et il y a quelque chose dedans.",
    choices:[
      {t:"Répondre longuement, avec de vrais retours",d:{credibilite:6},
       posture:"soutenir",addFlag:"repond_a_tout_le_monde",
       reason:"🎧 Vous prenez une heure pour répondre sérieusement. Ça ne se fait presque plus."},
      {t:"Répondre trois mots polis",d:{},posture:"ignorer",
       reason:"🎧 Réponse courte et polie. Vous avez autre chose à faire."},
      {t:"Proposer de le rencontrer tout de suite",p:.5,
       sD:{credibilite:5,notoriete:3},fD:{argent:-Math.round(adaptCost("petit"))},
       sMsg:"Le courant passe.",fMsg:"Il ne vient même pas.",
       sReason:"🎧 La rencontre se passe bien. Vous gardez le contact au chaud.",
       fReason:"🎧 Vous avez payé le café et attendu une heure pour rien.",
       posture:"accepter",addFlag:"chasse_le_talent_brut"}
    ]
  })},

  {min:0,max:5,w:4,stage:0,id:"debut_famille_argent",make:()=>({
    title:"💶 Compter ce qu'il reste",
    desc:`Sur le compte du label : ${Math.round(state.argent)} €. Le tableur que vous venez d'ouvrir ne raconte pas une histoire très longue.`,
    choices:[
      {t:"Se fixer un budget strict et s'y tenir",d:{credibilite:4},posture:"negocier",addFlag:"gestionnaire",
       reason:"💶 Vous posez un budget et des limites. Ennuyeux, et ça sauve des labels."},
      {t:"Tout miser sur la première signature",d:{},posture:"assume",addFlag:"tout_sur_le_premier",
       reason:"💶 Vous décidez que tout ira au premier artiste. Pas de plan B."},
      {t:"Chercher un petit financement quelque part",p:.45,
       sD:{argent:Math.round(adaptCost("moyen"))},fD:{credibilite:-2},
       sMsg:"Un dispositif local accepte.",fMsg:"Dossier refusé.",
       sReason:"💶 Une aide locale tombe. Modeste, mais réelle.",
       fReason:"💶 Dossier refusé, et trois semaines de perdues.",posture:"accepter"}
    ]
  })},

  {min:0,max:5,w:4,stage:0,id:"debut_soiree_scene",make:()=>({
    title:"🎤 Une scène ouverte",
    desc:"Un bar programme une scène ouverte le jeudi. Il y a douze personnes dans la salle et probablement quelqu'un qui vaut le déplacement.",
    choices:[
      {t:"Y aller toutes les semaines",d:{credibilite:5,notoriete:2},
       fn:()=>{ state.player.energy = Math.max(0, state.player.energy - 10); },
       posture:"soutenir",addFlag:"ecume_les_scenes",
       reason:"🎤 Vous devenez un habitué. Les gens finissent par savoir qui vous êtes."},
      {t:"Y aller une fois pour voir",d:{notoriete:1},posture:"accepter",
       reason:"🎤 Une soirée, deux ou trois noms notés. C'est déjà ça."},
      {t:"Payer un verre à tout le monde pour se faire remarquer",
       d:{argent:-Math.round(adaptCost("petit")),notoriete:4,credibilite:-2},
       posture:"payer",addFlag:"achete_sa_place",
       reason:"🎤 Tournée générale. On se souvient de vous, pas forcément pour la musique."}
    ]
  })},

  {min:0,max:5,w:4,stage:0,id:"debut_conseil_ancien",make:()=>({
    title:"☕ Le conseil de quelqu'un qui a échoué",
    desc:"Un type qui a monté un label il y a quinze ans accepte de vous voir. Son label n'existe plus. Il parle deux heures sans s'arrêter.",
    choices:[
      {t:"Tout écouter et prendre des notes",d:{credibilite:6},posture:"soutenir",addFlag:"ecoute_les_anciens",
       reason:"☕ Vous notez tout. La moitié est amère, l'autre moitié est de l'or."},
      {t:"L'écouter poliment sans rien retenir",d:{},posture:"ignorer",
       reason:"☕ Vous hochez la tête. Vous ferez autrement, vous."},
      {t:"Le contredire sur ce qui l'a fait couler",p:.45,
       sD:{credibilite:5},fD:{credibilite:-4},
       sMsg:"Il reconnaît que vous avez raison.",fMsg:"Il se ferme d'un coup.",
       sReason:"☕ Vous mettez le doigt sur son erreur, il l'admet. Le respect est mutuel.",
       fReason:"☕ Vous avez appuyé là où ça fait mal. La conversation s'arrête là.",posture:"assume"}
    ]
  })},

  {min:0,max:5,w:3,stage:0,id:"debut_reseaux_lancement",make:()=>({
    title:"📱 Le premier post",
    desc:`Il faut bien annoncer que ${state.label || "le label"} existe. La page est vide, il n'y a rien à montrer, et tout le monde va le voir.`,
    choices:[
      {t:"Annoncer sobrement, sans promesse",d:{credibilite:4,notoriete:2},
       posture:"communiquer",addFlag:"communication_sobre",
       reason:"📱 Annonce sobre. Peu de likes, aucune dette envers personne."},
      {t:"Annoncer en grand, comme si tout était déjà lancé",
       d:{notoriete:8,credibilite:-4},posture:"exploiter",addFlag:"a_survendu_le_depart",
       reason:"📱 Vous annoncez du très lourd. Ça marche — et maintenant il faut livrer."},
      {t:"Ne rien publier tant qu'il n'y a rien",d:{credibilite:2},posture:"refuser",addFlag:"parle_quand_il_y_a_a_dire",
       reason:"📱 Page vide, volontairement. Vous parlerez quand il y aura à dire."}
    ]
  })},

  {min:0,max:5,w:3,stage:0,id:"debut_associe_propose",make:()=>({
    title:"🤝 Quelqu'un veut s'associer",
    desc:"Une connaissance propose de monter le label à deux : elle apporte un peu d'argent et un carnet d'adresses, contre la moitié de tout.",
    choices:[
      {t:"Refuser : c'est mon projet",d:{credibilite:3},posture:"refuser",addFlag:"seul_maitre_a_bord",
       reason:"🤝 Vous refusez de partager. Tout reposera sur vous, dans les deux sens."},
      {t:"Accepter l'association",d:{argent:Math.round(adaptCost("moyen")),credibilite:4},
       posture:"accepter",addFlag:"a_un_associe",
       reason:"🤝 Vous vous associez. Deux têtes, deux avis, et une signature de moins qui vous appartient."},
      {t:"Proposer une part minoritaire",p:.5,
       sD:{argent:Math.round(adaptCost("petit")),credibilite:5},fD:{credibilite:-2},
       sMsg:"Elle accepte.",fMsg:"Elle se vexe.",
       sReason:"🤝 Elle accepte une part minoritaire. Vous gardez la main.",
       fReason:"🤝 Elle refuse net et s'en va. Le contact est perdu.",posture:"negocier"}
    ]
  })},

  {min:0,max:5,w:3,stage:0,id:"debut_materiel",make:()=>({
    title:"🎛️ Du matériel d'occasion",
    desc:"Une petite annonce : une carte son et deux micros corrects, pour presque rien. Le vendeur veut du liquide, tout de suite, sans essai.",
    choices:[
      {t:"Acheter sans essayer",p:.55,
       sD:{credibilite:4},fD:{argent:-Math.round(adaptCost("petit"))},
       sMsg:"Le matériel est nickel.",fMsg:"La carte son est morte.",
       sReason:"🎛️ Excellente affaire. Vous avez de quoi enregistrer.",
       fReason:"🎛️ Matériel hors service, vendeur injoignable. Leçon apprise.",
       posture:"accepter",addFlag:"a_du_materiel"},
      {t:"Exiger un essai avant de payer",d:{},posture:"negocier",
       reason:"🎛️ Vous exigez d'essayer. Le vendeur disparaît. Ça valait mieux."},
      {t:"Louer du studio à l'heure plutôt que d'acheter",
       d:{argent:-Math.round(adaptCost("petit")),credibilite:2},posture:"payer",addFlag:"loue_du_studio",
       reason:"🎛️ Vous louez à l'heure. Plus cher au final, opérationnel tout de suite."}
    ]
  })},

  {min:0,max:5,w:3,stage:0,id:"debut_doute",make:()=>({
    title:"🌙 Trois heures du matin",
    desc:"Vous ne dormez pas. La question tourne en boucle : est-ce que tout ça a le moindre sens, ou est-ce que vous êtes juste en train de perdre deux ans de votre vie.",
    choices:[
      {t:"Se rappeler pourquoi vous avez commencé",d:{credibilite:2},
       fn:()=>{ state.player.stress = Math.max(0, state.player.stress - 15); },
       posture:"assume",addFlag:"sait_pourquoi",
       reason:"🌙 Vous retrouvez le fil. Ça ne règle rien, ça permet de continuer."},
      {t:"Se fixer une date limite personnelle",d:{credibilite:3},
       posture:"negocier",addFlag:"s_est_donne_une_limite",
       reason:"🌙 Vous vous donnez une échéance. Au moins, ce n'est plus infini."},
      {t:"Travailler jusqu'au lever du jour",d:{notoriete:2},
       fn:()=>{ state.player.energy = Math.max(0, state.player.energy - 20); state.player.stress = Math.min(100, state.player.stress + 8); },
       posture:"exploiter",
       reason:"🌙 Vous bossez jusqu'à l'aube. C'est une réponse comme une autre."}
    ]
  })},

  {min:0,max:5,w:3,stage:0,id:"debut_arnaque_debutant",make:()=>({
    title:"⚠️ « Je place ton label en playlist »",
    desc:"Un message privé, un profil crédible, une offre imbattable : de la playlist garantie contre un virement immédiat. Vous n'avez même pas encore de son à placer.",
    choices:[
      {t:"Refuser et le signaler",d:{credibilite:4},posture:"refuser",addFlag:"flaire_les_arnaques",
       reason:"⚠️ Vous refusez et signalez le compte. Vous ne serez pas le dernier à le voir passer."},
      {t:"Payer, on ne sait jamais",d:{argent:-Math.round(adaptCost("petit")),credibilite:-3},
       posture:"payer",addFlag:"s_est_fait_avoir",
       reason:"⚠️ Vous payez. Le compte disparaît dans l'heure. Ça s'appelle des frais de formation."},
      {t:"Faire semblant d'être intéressé pour comprendre l'arnaque",
       p:.6,sD:{credibilite:5},fD:{},
       sMsg:"Vous démontez tout le procédé.",fMsg:"Il coupe court.",
       sReason:"⚠️ Vous remontez le fil et publiez comment ça marche. Utile à tout le monde.",
       fReason:"⚠️ Il flaire le piège et disparaît avant que vous en sachiez plus.",posture:"communiquer"}
    ]
  })},

  {min:0,max:5,w:3,stage:0,id:"debut_ce_que_je_veux",make:()=>({
    title:"🧭 Quel genre de label",
    desc:"Un ami vous pose la question frontalement : c'est quoi le but, au juste. Gagner de l'argent, sortir des disques qui comptent, ou juste être dans le milieu.",
    choices:[
      {t:"Faire de l'argent, sans faux-semblant",d:{notoriete:4,credibilite:-2},
       posture:"assume",addFlag:"vise_l_argent",
       reason:"🧭 Vous l'assumez : c'est un business. Au moins c'est clair."},
      {t:"Sortir des choses qui comptent, même si ça ne paie pas",
       d:{credibilite:7,notoriete:-1},posture:"refuser",addFlag:"vise_l_oeuvre",
       reason:"🧭 Vous visez l'œuvre avant le chiffre. Ça vous suivra toute la partie."},
      {t:"Je ne sais pas encore, et c'est très bien",d:{credibilite:2},
       posture:"communiquer",addFlag:"cherche_encore",
       reason:"🧭 Vous ne tranchez pas. Il y a pire réponse à ce stade."}
    ]
  })},

  /* Deux suites, ouvertes par les flags posés ci-dessus : même à ce
     stade, le début de partie se ramifie déjà. */

  {min:0,max:5,w:4,stage:0,id:"debut_survente_retour",when:()=>hasFlag("a_survendu_le_depart"),make:()=>({
    title:"📱 « Alors, c'était quoi le lourd ? »",
    desc:"Votre annonce en grande pompe circule encore, et toujours rien derrière. Les commentaires commencent à être moqueurs.",
    choices:[
      {t:"Reconnaître publiquement que j'ai parlé trop vite",
       d:{credibilite:6,notoriete:-3},posture:"excuse",removeFlag:"a_survendu_le_depart",
       reason:"📱 Vous reconnaissez avoir vendu du vent. Rare, et bien pris."},
      {t:"Doubler la mise avec une nouvelle annonce",
       d:{notoriete:6,credibilite:-5},posture:"exploiter",addFlag:"fuite_en_avant",
       reason:"📱 Nouvelle annonce, encore plus grosse. La fuite en avant est lancée."},
      {t:"Supprimer le post et ne rien dire",d:{credibilite:-2},posture:"nier",
       reason:"📱 Post supprimé. Les captures, elles, existent toujours."}
    ]
  })},

  {min:0,max:5,w:4,stage:0,id:"debut_boulot_conflit",when:()=>hasFlag("a_un_boulot_a_cote"),make:()=>({
    title:"🕐 Le patron veut plus",
    desc:"Le temps partiel veut devenir un temps plein, avec une vraie augmentation à la clé. Il faut choisir maintenant.",
    choices:[
      {t:"Démissionner et tout miser sur le label",
       d:{credibilite:5},fn:()=>{ state.player.stress = Math.min(100, state.player.stress + 15); },
       posture:"refuser",removeFlag:"a_un_boulot_a_cote",addFlag:"a_tout_lache_pour_le_label",
       reason:"🕐 Vous démissionnez. Plus de filet du tout, et une clarté nouvelle."},
      {t:"Accepter le temps plein, mettre le label en pause",
       d:{argent:Math.round(adaptCost("moyen")),credibilite:-5},
       posture:"accepter",addFlag:"label_en_second_plan",
       reason:"🕐 Vous prenez le temps plein. Le label devient un projet du soir."},
      {t:"Refuser sans démissionner",p:.5,
       sD:{argent:Math.round(adaptCost("petit"))},fD:{argent:-Math.round(adaptCost("petit"))},
       sMsg:"Il accepte de garder le partiel.",fMsg:"Il vous remercie.",
       sReason:"🕐 Vous gardez le temps partiel. Fragile équilibre maintenu.",
       fReason:"🕐 Refus mal pris : vous êtes remercié dans la foulée.",posture:"negocier"}
    ]
  })}
];
