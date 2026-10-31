const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
test('map-only photographs stay out of galleries despite retaining their map category',()=>{
 const declaration=source.split('\n').find(line=>line.startsWith('const inCollection ='));
 const inCollection=vm.runInNewContext(declaration+'\ninCollection;');
 const retainedOnMap={category:'National Parks',collections:[],atlas:true};
 assert.equal(inCollection(retainedOnMap,'National Parks'),false);
 assert.equal(inCollection({category:'Country Albums',collections:['National Parks']},'National Parks'),true);
 assert.equal(inCollection({category:'Metros'},'Metros'),true);
 assert.ok(source.includes('inCollection(p,container.dataset.category)'));
});

