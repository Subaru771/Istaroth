// Pure validation and crossing calculations shared by the Worker and tests.
export const RESIN_LIMIT=500;
export const VALID_STEPS=[1,2,5,10,20,25,40,50,100];
export function validAmount(value){return typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=RESIN_LIMIT;}
export function parseReminderInput(input){
  const mode=input?.mode;
  if(mode==='single'){
    if(!validAmount(input.threshold))throw Error('Choose a whole resin amount between 1 and 500.');
    return {mode,thresholds:[input.threshold],step:0};
  }
  if(mode==='multiple'){
    const values=input.thresholds;
    if(!Array.isArray(values)||values.length<1||values.length>40||values.some(v=>!validAmount(v)))
      throw Error('Choose 1 to 40 whole resin amounts between 1 and 500.');
    const sorted=[...new Set(values)].sort((a,b)=>a-b);
    return {mode,thresholds:sorted,step:0};
  }
  if(mode==='every'){
    if(!VALID_STEPS.includes(input.step))throw Error('Choose a valid resin interval.');
    return {mode,thresholds:[],step:input.step};
  }
  throw Error('Choose a valid reminder mode.');
}
export function storedRule(row){
  if(!row)return null;
  try{return parseReminderInput({mode:row.mode,threshold:JSON.parse(row.thresholds)[0],thresholds:JSON.parse(row.thresholds),step:row.step});}
  catch{return null;}
}
export function thresholdsCrossed(rule,previous,current,cap){
  if(!rule||!Number.isInteger(previous)||!Number.isInteger(current)||current<=previous)return [];
  const maximum=Math.min(RESIN_LIMIT,cap);
  let values;
  if(rule.mode==='every'){
    const step=rule.step;values=[];
    for(let n=Math.max(step,Math.ceil((previous+1)/step)*step);n<=Math.min(current,maximum);n+=step)values.push(n);
    // Full resin is always included even if the interval does not divide the cap.
    if(previous<maximum&&current>=maximum&&!values.includes(maximum))values.push(maximum);
  }else values=rule.thresholds.filter(n=>n<=maximum&&n>previous&&n<=current);
  return values.sort((a,b)=>a-b);
}
export function isRuleThreshold(rule,threshold,cap){
  if(!rule||!validAmount(threshold)||threshold>cap)return false;
  return rule.mode==='every'?(threshold===cap||threshold%rule.step===0):rule.thresholds.includes(threshold);
}
