import {describe,expect,it} from 'vitest';
import {CLUSTER_SIZE,declutter,type ScreenMark} from './marker-declutter';

const pin=(x:number,y:number):ScreenMark=>({x,y,width:38,height:43});
const box=(mark:ScreenMark)=>({...mark,width:Math.max(mark.width,CLUSTER_SIZE),height:Math.max(mark.height,CLUSTER_SIZE)});
const apart=(a:ScreenMark,b:ScreenMark)=>Math.abs(a.x-b.x)>=(a.width+b.width)/2||a.y-a.height>=b.y||b.y-b.height>=a.y;

describe('marker declutter',()=>{
  it('keeps separated pins on their own',()=>{
    expect(declutter([pin(100,100),pin(300,100),pin(100,300)])).toEqual([[0],[1],[2]]);
  });
  it('merges overlapping pins into the first placed one',()=>{
    expect(declutter([pin(100,100),pin(120,110),pin(400,400),pin(90,95)])).toEqual([[0,1,3],[2]]);
  });
  it('treats coincident records as one cluster',()=>{
    expect(declutter(Array.from({length:5},()=>pin(50,50)))).toEqual([[0,1,2,3,4]]);
  });
  it('never leaves two placed marks overlapping, even in dense chains',()=>{
    let seed=7;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
    const marks=Array.from({length:300},()=>pin(random()*800,random()*600));
    const placed=declutter(marks).map(group=>box(marks[group[0]]));
    for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++)expect(apart(placed[i],placed[j])).toBe(true);
    expect(declutter(marks).flat().sort((a,b)=>a-b)).toEqual(marks.map((_,index)=>index));
  });
});
