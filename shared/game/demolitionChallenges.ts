export type DemolitionChallenge = {
  index:number; name:string; hint:string; goal:number; layout:number;
  chapter:number; reinforcement:number; gate:boolean; time:number;
};
const names=["The leaning bakery","Water under the bridge","Absolutely no dominoes"];
export function demolitionChallenge(index:number):DemolitionChallenge {
  const safe=Math.max(0,Math.min(9999,Math.floor(Number.isFinite(index)?index:0)));
  const chapter=Math.floor(safe/3),layout=safe%3;
  return {index:safe,name:chapter?`${names[layout]} · ${chapter+1}`:names[layout]!,layout,chapter,
    goal:layout===2?4:3,reinforcement:Math.min(2,chapter*.22),gate:chapter>0&&layout===1,time:60+Math.min(30,chapter*3),
    hint:chapter>0&&layout===1?"Fit beneath the arch. A low hull and a forward hammer can reach the hidden supports.":chapter>0?"Reinforced supports need a heavier machine or repeated charged swings.":["Hit the red supports. Let gravity handle the paperwork.","Break the blue tank. Wash the bridge into tomorrow.","One good swing can start a very bad chain reaction."][layout]!};
}
export type DemolitionProgress={unlocked:number;best:Record<string,number>};
export function parseDemolitionProgress(raw:unknown):DemolitionProgress {
  try {const p=typeof raw==="string"?JSON.parse(raw):raw;if(!p||typeof p!=="object")return {unlocked:0,best:{}};
    const unlocked=Number.isInteger(p.unlocked)?Math.max(0,Math.min(9999,p.unlocked)):0;
    const best:Record<string,number>={};if(p.best&&typeof p.best==="object")for(const [key,value]of Object.entries(p.best))if(/^\d{1,4}$/.test(key)&&typeof value==="number"&&Number.isFinite(value)&&value>=0)best[key]=Math.min(value,100000);
    return {unlocked,best};
  }catch{return {unlocked:0,best:{}};}
}
export function completeDemolition(progress:DemolitionProgress,index:number,points:number,won:boolean):DemolitionProgress {
  const stage=demolitionChallenge(index).index;
  return {unlocked:won&&stage<=progress.unlocked?Math.min(9999,Math.max(progress.unlocked,stage+1)):progress.unlocked,
    best:{...progress.best,[stage]:Math.max(progress.best[stage]??0,Math.max(0,Math.min(100000,Math.floor(points))))}};
}
