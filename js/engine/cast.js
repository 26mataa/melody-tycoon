import { adaptCost } from "./economy.js";
import { addFlag, hasFlag } from "./narrative.js";
import { playerStage } from "./stages.js";
import { log, state } from "../state.js";
import { clamp, pick, rint, shuffleArr } from "../utils.js";

/* ============================================================
   LE CASTING RÉCURRENT — les gens qui restent.

   Les 254 situations de la base sont anonymes : un journaliste, un
   producteur, « quelqu'un ». Résolue, la situation disparaît et la
   personne avec elle. Rien ne se construit.

   Ici, quatre personnes sont tirées à la création du label et vous
   accompagnent toute la partie. Chacune a une relation chiffrée
   (-100 à +100) qui bouge à chaque fois que vous la croisez, et ses
   épisodes changent de nature selon ce chiffre : la même journaliste
   vous ouvre une double page ou vous démonte, selon ce que vous lui
   avez fait avant.

   Combiné aux graines de départ, c'est ce qui fait qu'une partie ne
   ressemble pas à une autre : ce ne sont pas les mêmes personnes, elles
   n'arrivent pas au même moment, et elles ne vous aiment pas pareil.
============================================================ */

const PRENOMS = ["Nadia","Samir","Élise","Karim","Léa","Yanis","Farah","Bruno","Inès","Théo",
                 "Awa","Mehdi","Clara","Rachid","Jeanne","Sofiane","Manon","Idriss","Lucie","Bastien"];
const NOMS = ["Bensaïd","Kessler","Moreau","Diallo","Fontaine","Aït-Larbi","Vasseur","Nguyen",
              "Perrin","Chaumette","Barka","Lemoine","Okonkwo","Ferrer","Dubost","Salhi"];

/* Les quatre rôles. `min` = jalon à partir duquel la personne entre
   vraiment dans votre vie (le patron de major ne vous connaît pas quand
   vous démarrez ; le pote du début, si). */
export const ROLES = [
  {id:"journaliste", titre:"journaliste", icone:"🎙️", stage:1,
   presente:"suit la scène depuis dix ans et écrit là où ça compte."},
  {id:"associe", titre:"ami des débuts", icone:"🤞", stage:0,
   presente:"était là avant tout le monde, quand il n'y avait rien."},
  {id:"major", titre:"directeur artistique en major", icone:"🏢", stage:2,
   presente:"décide des budgets chez un gros label. Vous l'intéressez, un peu."},
  {id:"ingenieur", titre:"ingénieur du son", icone:"🎚️", stage:1,
   presente:"a les mains d'or et un caractère de cochon."}
];

export function creerCasting(){
  const prenoms = shuffleArr(PRENOMS);
  const noms = shuffleArr(NOMS);
  state.cast = ROLES.map((r,i)=>({
    id: r.id,
    nom: `${prenoms[i]} ${noms[i]}`,
    // La relation de départ n'est pas neutre : certains vous aiment déjà
    // bien, d'autres vous ont dans le nez sans que vous sachiez pourquoi.
    relation: rint(-15, 25),
    rencontres: 0,
    dernierChapitre: -99
  }));
  return state.cast;
}

export function pnj(id){
  return (state.cast || []).find(c=>c.id === id) || null;
}

export function roleDe(id){
  return ROLES.find(r=>r.id === id);
}

export function ajusterRelation(id, delta){
  const p = pnj(id);
  if(!p) return;
  p.relation = clamp(p.relation + delta, -100, 100);
  p.rencontres++;
  p.dernierChapitre = state.chapter;
}

export function relationLabel(v){
  if(v >= 60) return {txt:"vous doit beaucoup", cls:"good"};
  if(v >= 25) return {txt:"vous apprécie", cls:"good"};
  if(v > -25) return {txt:"reste neutre", cls:""};
  if(v > -60) return {txt:"vous en veut", cls:"warn"};
  return {txt:"vous déteste", cls:"bad"};
}

/* Un PNJ ne revient pas deux épisodes de suite : on laisse respirer. */
function disponible(id){
  const p = pnj(id);
  const r = roleDe(id);
  if(!p || !r) return false;
  if(playerStage() < r.stage) return false;
  return (state.chapter - p.dernierChapitre) >= 6;
}

/* ============================================================
   LEURS ÉPISODES

   Chaque personne a deux versants : ce qu'elle vous propose quand elle
   vous apprécie, et ce qu'elle vous fait quand elle vous en veut. C'est
   le même personnage, avec le même nom, d'un bout à l'autre de la
   partie — c'est ça qui rend le retour marquant.
============================================================ */

export const CAST_EPISODES = [

  /* ---------- La journaliste ---------- */
  {id:"cast_journaliste_ok", w:3, stage:1, when:()=>disponible("journaliste") && pnj("journaliste").relation >= 25,
   make:()=>{
     const p = pnj("journaliste");
     return {
       title:`🎙️ ${p.nom} vous propose un portrait`,
       desc:`${p.nom}, ${roleDe("journaliste").presente} Elle a suivi ce que vous faites et veut vous consacrer un long format. « Je te laisse relire les citations, pas le reste. »`,
       choices:[
         {t:"Accepter, sans conditions", d:{notoriete:9, credibilite:5}, posture:"accepter",
          fn:()=>ajusterRelation("journaliste", 15), addFlag:"a_eu_son_portrait",
          reason:`🎙️ Le portrait signé ${p.nom} sort et fait du bruit. Elle ne vous oubliera pas.`},
         {t:"Accepter, mais exiger un droit de regard", p:.45,
          sD:{notoriete:6, credibilite:2}, fD:{credibilite:-5},
          sFn:()=>ajusterRelation("journaliste", 3), fFn:()=>ajusterRelation("journaliste", -25),
          sMsg:"Elle accepte du bout des lèvres.", fMsg:"Elle annule tout.",
          sReason:`🎙️ ${p.nom} accepte vos conditions. Le portrait est plus lisse, il sort quand même.`,
          fReason:`🎙️ ${p.nom} refuse et le fait savoir : « Il voulait écrire l'article lui-même. »`,
          posture:"negocier"},
         {t:"Refuser : ce n'est pas le moment", d:{}, posture:"refuser",
          fn:()=>ajusterRelation("journaliste", -8),
          reason:`🎙️ Vous déclinez. ${p.nom} note, sans insister.`}
       ]
     };
   }},

  {id:"cast_journaliste_ko", w:3, stage:1, when:()=>disponible("journaliste") && pnj("journaliste").relation <= -25,
   make:()=>{
     const p = pnj("journaliste");
     return {
       title:`🎙️ ${p.nom} prépare un papier sur vous`,
       desc:`Elle a appelé trois de vos anciens collaborateurs cette semaine. Ce n'est pas un portrait bienveillant qui se prépare. Elle vous laisse quarante-huit heures pour répondre.`,
       choices:[
         {t:"Répondre à tout, point par point", p:.55,
          sD:{credibilite:7}, fD:{credibilite:-6, notoriete:5},
          sFn:()=>ajusterRelation("journaliste", 30), fFn:()=>ajusterRelation("journaliste", -10),
          sMsg:"Vos réponses tiennent.", fMsg:"Elles se retournent contre vous.",
          sReason:`🎙️ Vous répondez à tout. L'article sort équilibré — ${p.nom} vous respecte un peu plus.`,
          fReason:`🎙️ Vos réponses fournissent les citations qui manquaient à l'article.`,
          posture:"communiquer"},
         {t:"Ne pas répondre", d:{credibilite:-7, notoriete:6}, posture:"ignorer",
          fn:()=>ajusterRelation("journaliste", -10),
          reason:`🎙️ « Contacté, l'intéressé n'a pas donné suite. » L'article sort quand même, en pire.`},
         {t:"Menacer de poursuites", d:{credibilite:-4, notoriete:8}, posture:"justice",
          fn:()=>ajusterRelation("journaliste", -30), addFlag:"a_menace_la_presse",
          reason:`🎙️ Votre mise en demeure fuite avant l'article. Effet Streisand garanti.`}
       ]
     };
   }},

  /* ---------- L'ami des débuts ---------- */
  {id:"cast_associe_service", w:3, stage:0, when:()=>disponible("associe"),
   make:()=>{
     const p = pnj("associe");
     const bon = p.relation >= 0;
     return {
       title:`🤞 ${p.nom} a besoin de vous`,
       desc: bon
         ? `${p.nom}, qui ${roleDe("associe").presente.replace(/^était/,"était")} vous appelle un dimanche soir. Il ne demande jamais rien. Là, il demande.`
         : `${p.nom} vous rappelle après des mois de silence. Le ton est sec : « J'ai besoin d'un service. Tu me le dois. »`,
       choices:[
         {t:"Aider sans poser de question", d:{argent:-Math.round(adaptCost("petit")), credibilite:4},
          posture:"soutenir", fn:()=>ajusterRelation("associe", 20), addFlag:"fidele_aux_debuts",
          reason:`🤞 Vous aidez ${p.nom} sans discuter. Ce genre de chose ne s'oublie pas.`},
         {t:"Aider, mais poser mes limites", d:{credibilite:2}, posture:"negocier",
          fn:()=>ajusterRelation("associe", 5),
          reason:`🤞 Vous aidez, en cadrant. ${p.nom} comprend, à moitié.`},
         {t:"Refuser", d:{}, posture:"refuser",
          fn:()=>ajusterRelation("associe", -25), addFlag:"a_lache_un_ami",
          reason:`🤞 Vous dites non à ${p.nom}. Il raccroche sans un mot.`}
       ]
     };
   }},

  {id:"cast_associe_retour", w:2, stage:2, when:()=>disponible("associe") && pnj("associe").relation >= 45,
   make:()=>{
     const p = pnj("associe");
     return {
       title:`🤞 ${p.nom} veut vous rejoindre`,
       desc:`${p.nom} a suivi votre montée de loin. Il propose de venir travailler avec vous — pas pour l'argent, pour être là. Vous savez qu'il n'a pas d'expérience.`,
       choices:[
         {t:"L'embaucher : la loyauté vaut l'expérience", d:{credibilite:8, argent:-Math.round(adaptCost("moyen"))},
          posture:"accepter", fn:()=>ajusterRelation("associe", 20), addFlag:"a_pris_un_proche",
          reason:`🤞 ${p.nom} rejoint la maison. Vous savez pourquoi vous l'avez fait.`},
         {t:"Refuser, en lui expliquant pourquoi", d:{credibilite:2}, posture:"communiquer",
          fn:()=>ajusterRelation("associe", -10),
          reason:`🤞 Vous refusez en face, sans vous cacher. Il encaisse.`},
         {t:"Lui trouver une place ailleurs", d:{credibilite:4, argent:-Math.round(adaptCost("petit"))},
          posture:"negocier", fn:()=>ajusterRelation("associe", 12),
          reason:`🤞 Vous lui décrochez un poste chez quelqu'un d'autre. C'est peut-être mieux pour tout le monde.`}
       ]
     };
   }},

  /* ---------- Le directeur artistique en major ---------- */
  {id:"cast_major_offre", w:2, stage:2, when:()=>disponible("major"),
   make:()=>{
     const p = pnj("major");
     const chaud = p.relation >= 20;
     return {
       title:`🏢 ${p.nom} vous invite à déjeuner`,
       desc: chaud
         ? `${p.nom}, ${roleDe("major").presente} Le déjeuner est un prétexte : il y a une proposition de distribution sur la table.`
         : `${p.nom} vous convoque plus qu'il ne vous invite. Le ton laisse entendre que vous devriez être flatté d'être là.`,
       choices:[
         {t:"Signer la distribution", d:{argent:Math.round(adaptCost("gros")), credibilite:-4, notoriete:6},
          posture:"accepter", fn:()=>ajusterRelation("major", 20), addFlag:"distribue_par_une_major",
          reason:`🏢 Vous signez avec ${p.nom}. De l'argent, de la portée — et un peu moins les mains libres.`},
         {t:"Refuser et rester indépendant", d:{credibilite:9}, posture:"refuser",
          fn:()=>ajusterRelation("major", -15), addFlag:"a_refuse_une_major",
          reason:`🏢 Vous refusez. Dans le milieu indépendant, ça se sait vite et ça vous grandit.`},
         {t:"Négocier des conditions bien meilleures", p:.4,
          sD:{argent:Math.round(adaptCost("gros")*1.6), credibilite:3}, fD:{credibilite:-3},
          sFn:()=>ajusterRelation("major", 10), fFn:()=>ajusterRelation("major", -20),
          sMsg:"Il cède sur tout.", fMsg:"Il se lève et part.",
          sReason:`🏢 ${p.nom} plie : vous obtenez des conditions que personne n'obtient.`,
          fReason:`🏢 ${p.nom} met fin au déjeuner. Le dossier est classé.`,
          posture:"negocier"}
       ]
     };
   }},

  {id:"cast_major_debauche", w:2, stage:3,
   when:()=>disponible("major") && pnj("major").relation <= 0 && state.signed.length > 0,
   make:()=>{
     const p = pnj("major");
     const a = pick(state.signed);
     return {
       title:`🏢 ${p.nom} tourne autour de ${a.name}`,
       desc:`On vous rapporte que ${p.nom} a déjeuné deux fois avec ${a.name} ce mois-ci. Personne ne vous a rien dit.`,
       choices:[
         {t:`En parler franchement à ${a.name}`, d:{credibilite:4}, posture:"communiquer",
          fn:()=>{ const x = state.signed.find(s=>s.id===a.id); if(x) x.humeur = clamp(x.humeur + 8, 0, 100); },
          reason:`🏢 Vous posez la question directement. ${a.name} apprécie de ne pas être traité en suspect.`},
         {t:"Surenchérir immédiatement sur son contrat",
          d:{argent:-Math.round(adaptCost("gros"))}, posture:"payer",
          fn:()=>{ const x = state.signed.find(s=>s.id===a.id); if(x){ x.humeur = clamp(x.humeur + 15, 0, 100); x.salaire = Math.round(x.salaire*1.3); } },
          reason:`🏢 Vous alignez une offre que ${p.nom} ne suivra pas. Ça coûte cher, tous les mois.`},
         {t:"Appeler directement le DA pour le recadrer", p:.45,
          sD:{credibilite:6}, fD:{credibilite:-5},
          sFn:()=>ajusterRelation("major", -10), fFn:()=>ajusterRelation("major", -25),
          sMsg:"Il recule.", fMsg:"Il rit au téléphone.",
          sReason:`🏢 ${p.nom} lâche l'affaire. Vous vous êtes fait un ennemi propre.`,
          fReason:`🏢 ${p.nom} vous raccroche au nez. La chasse continue, en pire.`,
          posture:"refuser"}
       ]
     };
   }},

  /* ---------- L'ingénieur du son ---------- */
  {id:"cast_ingenieur_exigence", w:3, stage:1, when:()=>disponible("ingenieur"),
   make:()=>{
     const p = pnj("ingenieur");
     const bon = p.relation >= 20;
     return {
       title:`🎚️ ${p.nom} n'est pas content`,
       desc: bon
         ? `${p.nom}, ${roleDe("ingenieur").presente} Il vous prend à part : le matériel du studio le limite, et il commence à s'ennuyer.`
         : `${p.nom} rend un mix en retard et sans un mot d'explication. C'est la troisième fois.`,
       choices:[
         {t:"Investir dans le studio", d:{argent:-Math.round(adaptCost("moyen")), credibilite:3},
          posture:"payer", fn:()=>ajusterRelation("ingenieur", 20), addFlag:"studio_equipe",
          reason:`🎚️ Vous équipez le studio. ${p.nom} retrouve le sourire et le niveau monte.`},
         {t:"Lui parler d'homme à homme", p:.55,
          sD:{credibilite:4}, fD:{},
          sFn:()=>ajusterRelation("ingenieur", 15), fFn:()=>ajusterRelation("ingenieur", -10),
          sMsg:"Il se confie.", fMsg:"Il se braque.",
          sReason:`🎚️ La conversation débloque quelque chose. ${p.nom} rembraye.`,
          fReason:`🎚️ ${p.nom} se referme. Vous n'avez rien réglé.`,
          posture:"soutenir"},
         {t:"Chercher quelqu'un d'autre", d:{credibilite:-3}, posture:"rompre",
          fn:()=>ajusterRelation("ingenieur", -35), addFlag:"a_change_d_inge",
          reason:`🎚️ Vous commencez à chercher un remplaçant à ${p.nom}. Le studio devient silencieux.`}
       ]
     };
   }}
];

/* Récapitulatif lisible pour le panneau profil et l'épilogue : qui compte
   dans cette partie, et dans quel sens. */
export function castResume(){
  return (state.cast || []).map(c=>{
    const r = roleDe(c.id) || {};
    return {...c, icone:r.icone, titre:r.titre, etat:relationLabel(c.relation)};
  });
}
