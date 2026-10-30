const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),context={};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'atlas-overview.js'),'utf8'),context);
const {labelFits,overlaps}=context.AtlasOverview;

test('small-country labels appear only after sufficient zoom',()=>{
 const country={area:100,bounds:[[0,0],[20,10]]};
 assert.equal(labelFits(country,1,40,14),false);
 assert.equal(labelFits(country,4,40,14),true);
});
test('a long narrow country needs room across the label as well as enough area',()=>{
 const country={area:600,bounds:[[0,0],[10,90]]};
 assert.equal(labelFits(country,2,60,14),false);
 assert.equal(labelFits(country,5,60,14),true);
});
test('large countries can be labeled in the world overview',()=>{
 assert.equal(labelFits({area:9000,bounds:[[0,0],[160,80]]},.8,80,14),true);
});
test('label collisions include a legibility gap and are symmetric',()=>{
 const a={x:0,y:0,width:40,height:14},near={x:44,y:0,width:35,height:14},far={x:50,y:0,width:35,height:14};
 assert.equal(overlaps(a,near),true);
 assert.equal(overlaps(near,a),true);
 assert.equal(overlaps(a,far),false);
 assert.equal(overlaps(a,{x:0,y:25,width:40,height:14}),false);
});
test('the atlas includes small countries, Antarctica and physical geography',()=>{
 const atlas=JSON.parse(fs.readFileSync(path.join(root,'assets/world-atlas.json')));
 assert.ok(atlas.countries.features.length>220);
 assert.ok(atlas.countries.features.some(f=>f.properties.ADMIN==='Antarctica'));
 assert.ok(atlas.countries.features.some(f=>f.properties.ADMIN==='Maldives'));
 assert.ok(atlas.lakes.features.length>400);
 assert.ok(atlas.rivers.features.length>400);
 assert.ok(atlas.cities.features.length>200);
 let vertices=0;
 function count(coordinates){if(typeof coordinates[0]==='number')vertices++;else coordinates.forEach(count);}
 atlas.countries.features.forEach(f=>count(f.geometry.coordinates));
 assert.ok(vertices>75000,'coastlines should retain regional detail');
});
