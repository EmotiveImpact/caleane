const presets={center:{x:50,y:50},top:{x:50,y:0},bottom:{x:50,y:100},left:{x:0,y:50},right:{x:100,y:50}};
export function imagePositionPoint(value='center'){
 if(typeof value!=='string')return null;
 if(Object.hasOwn(presets,value))return {...presets[value]};
 const match=/^(\d{1,3}(?:\.\d{1,2})?)% (\d{1,3}(?:\.\d{1,2})?)%$/.exec(value);
 if(!match)return null;
 const x=Number(match[1]),y=Number(match[2]);
 return x<=100&&y<=100?{x,y}:null;
}
export function imagePositionValue({x,y}){return `${Math.max(0,Math.min(100,Math.round(x)))}% ${Math.max(0,Math.min(100,Math.round(y)))}%`;}
