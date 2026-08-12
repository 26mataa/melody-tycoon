import { finalizeSigned } from "./artists.js";
import { impact, labelScore, myLabelScore, pveUnlocked } from "./economy.js";
import { queueEpisode } from "./narrative.js";
import { performRoll } from "./roll.js";
import { notify } from "../notify.js";
import { after } from "../render.js";
import { log, state } from "../state.js";
import { chance, clamp, pick, rint } from "../utils.js";
import { DATA } from "../data.js";

export function genRivalArtist(){
  const pool = pick(DATA.SCOUT_POOLS);
  return {
    id:"rv-"+Date.now()+"-"+rint(0,9999),
    name:pick(pool.names),
    genre:pool.genre,
    talent:rint(50,90),
    pop:rint(20,70),
    salaire:rint(20,100),
    hits:rint(0,3),
    flops:rint(0,2)
  };
}

export function findRival(name){ return state.rivals.find(r=>r.name===name); }

export function removeArtist(a){
  state.signed = state.signed.filter(x=>x.id !== a.id);
}

export function rivalAttack(name, action){
  if(state.sabotageUsed) return notify("Une seule action offensive par saison.");
  const r = findRival(name);
  if(!r) return;

  if(action === "rumeur"){
    state.sabotageUsed = true;
    performRoll(.55,()=>{
      r.rep = clamp(r.rep-8,0,100);
      r.history.push(`🗣️ Rumeur crédible lancée par ${state.label}.`);
      impact({reputation:2}, `🗣️ Rumeur efficace contre ${r.name} : sa réputation chute.`,"pos");
    },()=>{
      impact({reputation:-3}, `🗣️ Rumeur ratée contre ${r.name} : ça se retourne contre vous.`,"neg");
    },"Rumeur crédible !","Rumeur grillée");
    return;
  }
  if(action === "playlist"){
    if(state.argent < 300) return notify("Pas assez d'argent.");
    state.sabotageUsed = true;
    state.argent -= 300;
    performRoll(.45,()=>{
      r.buzz = clamp(r.buzz-12,0,100);
      r.history.push(`🕵️ Playlist piratée par ${state.label}.`);
      log(`🕵️ Piratage réussi (-300€) : le buzz de ${r.name} chute.`,"pos");
      after();
    },()=>{
      impact({reputation:-8}, `🕵️ Piratage raté (-300€) : ${r.name} vous accuse publiquement.`,"neg");
    },"Piratage réussi","Piratage détecté");
    return;
  }
  if(action === "beat"){
    state.sabotageUsed = true;
    performRoll(.5,()=>{
      state.stolenBeatBonus = 10;
      r.rep = clamp(r.rep-4,0,100);
      log(`🎹 Beat volé à ${r.name} : +qualité sur votre prochaine sortie.`,"pos");
      after();
    },()=>{
      impact({reseau:-8}, `🎹 Vol de beat raté : ${r.name} vous blackliste.`,"neg");
    },"Beat récupéré","Vol raté");
    return;
  }
  if(action === "debaucher"){
    if(state.argent < 1000) return notify("Pas assez d'argent.");
    state.sabotageUsed = true;
    state.argent -= 1000;
    performRoll(.4,()=>{
      if(r.roster.length){
        const idx = rint(0,r.roster.length-1);
        const stolen = r.roster.splice(idx,1)[0];
        finalizeSigned(stolen);
        state.signed.push(stolen);
        log(`💰 ${stolen.name} quitte ${r.name} pour rejoindre votre label !`,"pos");
      }else{
        log(`💰 ${r.name} n'a personne à débaucher pour l'instant (-1000€ dépensés pour rien).`,"info");
      }
      after();
    },()=>{
      impact({popularite:-4}, `💰 Débauchage raté (-1000€) : ${r.name} vous attaque en justice.`,"neg");
    },"Débauchage réussi","Débauchage raté");
    return;
  }
}

export function rivalDefend(name, action){
  const r = findRival(name);
  if(!r) return;
  if(action === "alliance"){
    if(state.credibilite < 10) return notify("Pas assez de Crédibilité pour qu'ils vous écoutent.");
    state.credibilite -= 10;
    r.aggro = clamp(r.aggro-25,0,100);
    r.rivalry = clamp((r.rivalry||0)-15,0,100);
    r.history.push(`🤝 Alliance proposée par ${state.label}.`);
    log(`🤝 Alliance proposée à ${r.name} (-10 Crédibilité : vous vous mouillez pour eux) : agressivité en forte baisse.`,"pos");
    after();
  }
}

/* ============================================================
   NÉGOCIATION DE CONTRAT — flux unifié renouvellement / achat marché
   1. L'artiste propose durée + salaire + coût de signature.
   2. Le joueur : Valider (garanti) / Refuser définitivement / Modifier
      (le joueur fixe ses propres chiffres, la chance d'acceptation
      est recalculée et affichée en temps réel selon le profil de l'artiste).
============================================================ */

export function rivalWeekly(weeks, quiet){
  for(let w=0;w<weeks;w++){
    if(state.market.length && chance(.08)){
      const r = pick(state.rivals);
      const a = pick(state.market);
      state.market = state.market.filter(x=>x.id !== a.id);
      r.roster.push({id:a.id,name:a.name,genre:a.genre,talent:a.talent,pop:a.pop,salaire:a.salaire,hits:0,flops:0});
      r.history.push(`📝 ${r.name} a signé ${a.name}.`);
      if(!quiet) log(`⚔️ ${r.name} signe ${a.name}.`,"neg");
    }

    if(!pveUnlocked()) continue;

    state.rivals.forEach(r=>{
      r.streamsWeek = Math.round((r.rep||40) * rint(400,900));
      r.buzz = clamp(r.buzz + rint(-4,4), 0, 100);
    });

    const myScore = myLabelScore();
    state.rivals.forEach(r=>{
      const rScore = labelScore({rep:r.rep,buzz:r.buzz});
      if(myScore > rScore) r.aggro = clamp(r.aggro + rint(2,6), 0, 100);
      else r.aggro = clamp(r.aggro - rint(0,3), 0, 100);
    });

    if(state.signed.length > 0 && chance(.15)){
      const r = pick(state.rivals);
      if(chance((r.aggro||20)/100)){
        queueEpisode({
          imp:2,
          title:`⚠️ ${r.name} essaie de vous saboter`,
          desc:`${r.name} tente une opération contre votre label.`,
          choices:[
            {t:"Porter plainte (-300€)",d:{argent:-300,reputation:3},reason:`⚖️ Plainte contre ${r.name}.`},
            {t:"Étouffer l'affaire",d:{buzz:-4,popularite:-2},reason:"🤫 Affaire étouffée."},
            {t:"Transformer en buzz",p:.5,sD:{buzz:8},fD:{popularite:-6},sMsg:"Vous retournez la tentative !",fMsg:"Le sabotage vous touche.",sReason:"⚔️ Sabotage transformé en buzz.",fReason:"⚔️ Le sabotage vous touche.",addFlag:"sabote_par_rival"}
          ]
        });
      }
    }
  }
}

/* ============================================================
   BOUCLE JOUR / SEMAINE
============================================================ */

