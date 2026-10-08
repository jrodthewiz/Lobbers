import type { VehicleDesign,VectorPoint } from "./vehicleDesign";
export function convexOutline(points:VectorPoint[]):VectorPoint[] {
  const sorted=[...new Map(points.map(p=>[`${p.x},${p.y}`,p])).values()].sort((a,b)=>a.x-b.x||a.y-b.y);
  const cross=(a:VectorPoint,b:VectorPoint,c:VectorPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const lower:VectorPoint[]=[],upper:VectorPoint[]=[];
  for(const p of sorted){while(lower.length>=2&&cross(lower[lower.length-2]!,lower[lower.length-1]!,p)<=0)lower.pop();lower.push(p);}
  for(const p of [...sorted].reverse()){while(upper.length>=2&&cross(upper[upper.length-2]!,upper[upper.length-1]!,p)<=0)upper.pop();upper.push(p);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
export function demolitionBlueprint(design:VehicleDesign) {
  const hull=design.strokes.find(s=>s.filled)?.points??design.strokes.flatMap(s=>s.points);
  let vertices=convexOutline(hull.map(p=>({x:p.x*.65,y:p.y*.65})));
  let area=Math.abs(vertices.reduce((sum,p,i)=>{const q=vertices[(i+1)%vertices.length]!;return sum+p.x*q.y-q.x*p.y;},0)/2);
  if(vertices.length<3||area<450){vertices=[{x:-45,y:-20},{x:45,y:-20},{x:45,y:15},{x:-45,y:15}];area=3150;}
  const signed=vertices.reduce((sum,p,i)=>{const q=vertices[(i+1)%vertices.length]!;return sum+p.x*q.y-q.x*p.y;},0);
  const center=vertices.reduce((sum,p,i)=>{const q=vertices[(i+1)%vertices.length]!,cross=p.x*q.y-q.x*p.y;return {x:sum.x+(p.x+q.x)*cross/(3*signed),y:sum.y+(p.y+q.y)*cross/(3*signed)};},{x:0,y:0});
  const width=Math.max(...vertices.map(p=>p.x))-Math.min(...vertices.map(p=>p.x));
  const height=Math.max(...vertices.map(p=>p.y))-Math.min(...vertices.map(p=>p.y));
  const wheels=design.parts.filter(p=>p.kind==="wheel");const hammer=design.parts.find(p=>p.kind==="cannon");
  const massFactor=Math.max(.65,Math.min(1.8,area/4000));
  const cost=Math.round(massFactor*28+(hammer?.size??18)*1.2+Math.min(4,wheels.length)*8+(design.parts.find(p=>p.kind==="thruster")?.size??14)*.8);
  return {vertices,center,width,height,massFactor,cost,efficiency:Math.min(1,100/cost),reach:100+(hammer?.size??18)*5,
    wheelbase:wheels.length>1?(Math.max(...wheels.map(p=>p.x))-Math.min(...wheels.map(p=>p.x)))*.65:70};
}
