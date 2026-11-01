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


test('national parks map filter includes the requested international parks',()=>{
 const declaration=source.split('\n').find(line=>line.startsWith('const matchesCategory ='));
 const matches=vm.runInNewContext("let category='National Parks';\n"+declaration+"\nmatchesCategory;");
 for(const location of ['Kilimanjaro','Serengeti National Park','Blue Mountains National Park']){
  assert.equal(matches({category:'Country Albums',collections:[],location}),true);
 }
 assert.equal(matches({category:'Country Albums',collections:[],location:'Sydney'}),false);
 assert.equal(matches({category:'National Parks',location:'Yosemite'}),true);
});

test('chapter anchors use readable place names',()=>{
 const declaration=source.split('\n').find(line=>line.startsWith('const chapterAnchor ='));
 const anchor=vm.runInNewContext(declaration+'\nchapterAnchor;');
 assert.equal(anchor('Salzburg'),'salzburg');
 assert.equal(anchor('Blue Mountains'),'blue-mountains');
 assert.equal(anchor('Québec City'),'quebec-city');
 assert.equal(anchor('Kyoto & Uji'),'kyoto-and-uji');
});

test('country covers account for portrait cropping and offer the full-sized source',()=>{
 const declaration=source.slice(source.indexOf('function countryCoverAttrs('),source.indexOf('function renderCountryDirectory('));
 const attrs=vm.runInNewContext("const photoSrc=p=>p.src;const thumbnailAttrs=(photo,sizes)=>({photo,sizes});\n"+declaration+"\ncountryCoverAttrs;");
 const result=attrs({src:'large.jpeg',width:2500,height:1667,thumbnailVariants:[{src:'small.webp',width:960,height:640}]});
 assert.equal(result.photo.thumbnailVariants.at(-1).src,'large.jpeg');
 assert.ok(result.sizes.includes('2.249'));
 assert.equal(result.photo.thumbnailVariants.at(-1).width,2500);
 const portrait=attrs({src:'portrait.jpeg',width:1000,height:1500,thumbnailVariants:[]});
 assert.ok(portrait.sizes.includes('* 1)'));
});
