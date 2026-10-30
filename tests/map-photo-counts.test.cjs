const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');

test('overview shows photo totals for multi-photo places and clusters, and dots for singles',()=>{
 const element=()=>({attrs:{},dataset:{},children:[],setAttribute(k,v){this.attrs[k]=v;},append(x){this.children.push(x);},replaceChildren(){this.children=[];}});
 const points=element(),surface={namespaceURI:'svg',getScreenCTM:()=>({a:1})};
 const place=(name,x,count)=>({name,x,y:100,photos:Array.from({length:count},()=>({country:'Australia',coordinatePrecision:'City'}))});
 const context=vm.createContext({
  $:s=>s==='#world-map'?surface:points,
  document:{activeElement:null,createElementNS:element},
  mapPlaces:[place('Single',100,1),place('Multiple',200,2),place('Nearby A',400,3),place('Nearby B',405,4)],
  mapBounds:[0,0,1080,550],mapPointSignature:'',place:null
 });
 const start=source.indexOf('function drawMapPoints(){'),end=source.indexOf('\nlet previewIndex',start);
 assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end)+'\ndrawMapPoints();',context);
 const marker=name=>points.children.find(p=>p.dataset.location===name);
 const counts=p=>p.children.filter(c=>c.attrs.class==='map-cluster-count').map(c=>c.textContent);
 assert.deepEqual(counts(marker('Single')),[]);
 assert.deepEqual(counts(marker('Multiple')),['2']);
 assert.deepEqual(counts(points.children.find(p=>p.dataset.cluster)),['7']);
 context.place='Multiple';context.mapPointSignature='';
 vm.runInContext('drawMapPoints()',context);
 assert.deepEqual(counts(marker('Multiple')),['2']);
 assert.ok(marker('Multiple').children.some(c=>c.textContent==='Multiple'));
});

test('detailed map numbers every multi-photo place, including the selected place',()=>{
 const layers={};
 const context=vm.createContext({place:null,vectorMap:{addLayer:l=>{layers[l.id]=l;}}});
 const wanted=['place-points','selected-location','place-counts','place-photo-counts'];
 for(const line of source.split('\n')){
  if(wanted.some(id=>line.includes("id:'"+id+"'")))vm.runInContext(line,context);
 }
 function evaluate(e,p){
  if(!Array.isArray(e))return e;
  const [op,...args]=e;
  if(op==='get')return p[args[0]];
  if(op==='has')return Object.hasOwn(p,args[0]);
  if(op==='!')return !evaluate(args[0],p);
  if(op==='>')return evaluate(args[0],p)>evaluate(args[1],p);
  if(op==='all')return args.every(x=>evaluate(x,p));
  if(op==='case')return evaluate(args[0],p)?evaluate(args[1],p):evaluate(args[2],p);
  if(op==='to-string')return String(evaluate(args[0],p));
  throw Error(op);
 }
 const numbers=layers['place-photo-counts'];
 assert.equal(evaluate(numbers.filter,{count:1}),false);
 assert.equal(evaluate(numbers.filter,{count:2}),true);
 assert.equal(evaluate(numbers.filter,{count:7,point_count:2}),false);
 assert.equal(evaluate(numbers.layout['text-field'],{count:23}),'23');
 for(const id of ['place-points','selected-location']){
  assert.ok(evaluate(layers[id].paint['circle-radius'],{count:2})>evaluate(layers[id].paint['circle-radius'],{count:1}));
 }
 assert.equal(numbers.layout['text-allow-overlap'],true);
 assert.equal(layers['place-counts'].layout['text-allow-overlap'],true);
 assert.ok(source.indexOf("id:'place-photo-counts'")>source.indexOf("id:'selected-location'"));
});
