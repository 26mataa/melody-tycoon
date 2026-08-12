/* ============================================================
   CHARGEMENT DES DONNÉES STATIQUES (data/*.json)
   Un seul point d'entrée : loadGameData(). Fait les fetch() en
   parallèle et fusionne le tout en un seul objet plat, exactement
   comme les anciennes constantes globales de script.js.
============================================================ */

const DATA_FILES = [
  "data/artists.json",
  "data/dialogues.json",
  "data/actions.json",
  "data/contracts.json",
  "data/reviews.json",
  "data/events.json"
];

async function fetchJson(path){
  const res = await fetch(path);
  if(!res.ok){
    throw new Error(`Impossible de charger ${path} (HTTP ${res.status}). Le jeu doit être servi via un serveur local (ex: ./serve.ps1), pas ouvert en double-clic.`);
  }
  return res.json();
}

export async function loadGameData(){
  const parts = await Promise.all(DATA_FILES.map(fetchJson));
  return Object.assign({}, ...parts);
}
