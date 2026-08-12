import { state } from "../state.js";

/* ============================================================
   LES JALONS VÉCUS — ce que le joueur a RÉELLEMENT traversé.

   Le bug de fond de la V0.8 : la disponibilité d'un épisode était
   décidée par un score de statistiques (`getTier()`). Or un score peut
   monter sans qu'il ne se soit rien passé. Résultat : « une crise
   financière mondiale touche le label » pouvait tomber à l'épisode 2,
   sans artiste, sans sortie, sans salaire à payer — rien à couler.

   Ici, l'échelle ne mesure pas la performance mais l'HISTOIRE : le
   joueur a-t-il signé quelqu'un, sorti un son, connu un succès, monté
   une vraie structure. Chaque marche est franchie une fois pour toutes
   (elle s'appuie sur les compteurs de carrière, qui ne redescendent
   jamais) : perdre son dernier artiste ne vous renvoie pas au monde
   narratif de quelqu'un qui n'en a jamais eu.

   À ne pas confondre avec les deux autres filtres, qui restent en place
   et répondent à une autre question :
     - `needsArtist` / `needsRelease` : l'épisode peut-il seulement se
       RACONTER maintenant (a-t-on un artiste sous la main à nommer) ;
     - `min`/`max` de palier : le contexte économique du label.
   Le jalon dit « ce chapitre de votre vie a-t-il commencé », les autres
   disent « cette phrase a-t-elle un sens à l'instant T ».
============================================================ */

export const STAGES = [
  {id:0, nom:"Rien encore",        desc:"Vous, un nom de label, et pas grand-chose d'autre."},
  {id:1, nom:"Un artiste signé",   desc:"Quelqu'un a signé. Il y a une équipe, des frais, des egos."},
  {id:2, nom:"Une sortie publiée", desc:"Il existe une musique à votre nom. Le public peut réagir."},
  {id:3, nom:"Un vrai succès",     desc:"Quelque chose a marché. Le milieu vous a repéré."},
  {id:4, nom:"Label installé",     desc:"Une structure qui pèse. On vient vous chercher pour autre chose que la musique."}
];

/* Le jalon atteint. Basé sur des faits acquis, jamais sur des jauges :
   `careerArtistsSigned`, `releases`, `careerHits` ne redescendent pas. */
export function playerStage(){
  const aSigne   = (state.careerArtistsSigned || 0) > 0 || state.signed.length > 0;
  const aSorti   = (state.releases || []).length > 0;
  const aPerce   = (state.careerHits || 0) > 0;
  // « Installé » demande une vraie structure, pas un seul coup de chance :
  // plusieurs artistes passés par la maison ET un catalogue qui existe.
  const installe = (state.careerArtistsSigned || 0) >= 3 && (state.releases || []).length >= 4 && aPerce;

  if(installe) return 4;
  if(aPerce)   return 3;
  if(aSorti)   return 2;
  if(aSigne)   return 1;
  return 0;
}

export function stageInfo(){
  return STAGES[playerStage()] || STAGES[0];
}

/* Jalon exigé par une définition d'épisode. Explicite si l'entrée porte
   un `stage`, sinon déduit de ce qu'elle réclame déjà :
     - un épisode "admin" est écrit pour le tout début → jalon 0 ;
     - un épisode qui nomme un artiste suppose d'en avoir eu un → 1 ;
     - à défaut, le palier minimum de l'entrée sert d'approximation
       (les entrées historiques encodaient déjà leur avancement là).
   Les entrées qui comptent portent un `stage` explicite : cette
   déduction n'est qu'un filet, pas la règle. */
export function stageOf(def){
  if(def.stage !== undefined) return def.stage;
  if(def.admin) return 0;
  if(def.needsRelease) return 2;
  if(def.needsArtist) return 1;
  return Math.min(4, def.min || 0);
}

/* Un épisode qui parle d'une sortie a besoin qu'il en existe une, même
   si le jalon 2 est acquis depuis longtemps (catalogue vidé par un
   retrait, partie chargée...). Pendant du `needsArtist`. */
export function releaseDisponible(){
  return (state.releases || []).some(r=>!r.fini);
}
