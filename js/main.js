/* ============================================================
   POINT D'ENTRÉE — charge les données, prépare l'état, branche les
   événements, puis lance le premier affichage.
   Chargé depuis index.html via <script type="module" src="js/main.js">.
============================================================ */
import { initData } from "./data.js";
import { app, safeRender } from "./render.js";
import { patchState } from "./state.js";
import { initDispatch } from "./dispatch.js";
import { errorHTML } from "./utils.js";

window.addEventListener("error", function(e){
  try{
    if(app) app.innerHTML = errorHTML(e.error || e.message || e);
  }catch(err){}
});

async function boot(){
  try{
    await initData();
    patchState();
    initDispatch();
    safeRender();
  }catch(err){
    if(app) app.innerHTML = errorHTML(err);
  }
}

boot();
