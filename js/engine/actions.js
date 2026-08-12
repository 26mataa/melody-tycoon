import { startDraft } from "./production.js";
import { safeRender } from "../render.js";
import { save, state } from "../state.js";

/* Raccourci "lancer un projet" depuis le Dashboard — reste toujours disponible
   (ce n'est pas un grind, juste un raccourci de navigation vers la Production). */
export function goProduce(){
  if(state.signed.length === 0) return;
  state.tab = "label";
  state.labelSub = "production";
  if(!state.draft) startDraft(state.signed[0].id);
  safeRender();
  save();
}
