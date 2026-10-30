'use strict';
const $ = s => document.querySelector(s);
let featuredGalleries = [], countryAlbums = [];
const matchesCategory = p => category === 'All' || (category === 'Country Albums' ? !!p.albums?.length : (p.category === category || p.collections?.includes(category)));
let catalogPhotos = [], photos = [], category = 'All', place = null, lightboxPhotos = [], current = 0;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const photoSrc = p => p.largeSrc || p.src;
const thumbnailAttrs = (p,sizes) => {
 const variants=p.thumbnailVariants||[];
 const srcset=variants.length?' srcset="'+esc(variants.map(v=>v.src+' '+v.width+'w').join(', '))+'" sizes="'+esc(sizes)+'"':'';
 return 'src="'+esc(p.thumbnailSrc||photoSrc(p))+'"'+srcset+' decoding="async" draggable="false" data-full-src="'+esc(photoSrc(p))+'"';
};
const collectionSizes = grid => {
 const compact=grid.classList.contains('is-contact-sheet'),editorial=!!grid.dataset.editorial;
 return '(max-width:650px) '+(compact?'calc((100vw - 48px) / 2)':'calc(100vw - 36px)')+', (max-width:900px) calc((100vw - 84px) / 2), '+(compact||!editorial?'calc((100vw - 172px) / 3)':'calc((100vw - 132px) / 2)');
};
document.addEventListener('error',event=>{
 const image=event.target;
 if(image instanceof HTMLImageElement&&image.dataset.fullSrc){
  const original=image.dataset.fullSrc;delete image.dataset.fullSrc;
  image.removeAttribute('srcset');image.removeAttribute('sizes');image.src=original;
 }
},true);
// Discourage casual image saving while leaving normal text/link menus available.
function isPhotoInteraction(target){
 return target instanceof Element&&!!target.closest('img,.hero-image,.collection-cover-media,.gallery-photo,.preview-open');
}
for(const type of ['contextmenu','dragstart']){
 document.addEventListener(type,event=>{if(isPhotoInteraction(event.target))event.preventDefault();},true);
}
document.querySelectorAll('img').forEach(image=>{image.draggable=false;});
const photoTitle = p => / · \d+$/.test(p.title)?(p.location||p.country||p.title):p.title;
const photoPlace = p => {if((p.category==='National Parks'||p.collections?.includes('National Parks'))&&p.state)return p.state;if(p.category==='World Landmarks'||p.collections?.includes('World Landmarks'))return [p.city||p.location,p.country].filter(Boolean).join(', ');if(p.city)return p.city;const title=photoTitle(p),where=p.location===title?p.country:p.location;return where===title?'':where;};
const isWildlife = p => p.category==='Wildlife'||p.collections?.includes('Wildlife');
const wildlifeCountry = p => p.country;
const wildlifePlace = p => '<span class="wildlife-place-name">'+esc(p.location)+'</span><small class="wildlife-country">'+esc(wildlifeCountry(p))+'</small>';
const photoCaption = p => isWildlife(p)
 ? '<span class="tile-caption wildlife-caption"><span class="wildlife-subject"><span class="wildlife-common-name">'+esc(photoTitle(p))+'</span>'+(p.scientificName?'<i class="wildlife-scientific-name">'+esc(p.scientificName)+'</i>':'')+'</span><span class="wildlife-place">'+wildlifePlace(p)+'</span></span>'
 : '<span class="tile-caption"><span>'+esc(photoTitle(p))+'</span><span>'+esc(photoPlace(p)||'')+'</span></span>';
const photoAlt = p => [photoTitle(p),isWildlife(p)?[p.location,wildlifeCountry(p)].filter(Boolean).join(', '):photoPlace(p)].filter(Boolean).join(' — ');
const hasLocation = p => !!p.location && Number.isFinite(p.lat) && Number.isFinite(p.lng);
const filtered = () => photos.filter(p => matchesCategory(p) && (!place || (place === '__unlocated__' ? !hasLocation(p) : p.location === place)));
function openPhoto(p, list = photos) {
 lightboxPhotos = list; current = Math.max(0,list.findIndex(x=>x.id===p.id));
 renderLightboxThumbnails();showPhoto();$('#lightbox').showModal();requestAnimationFrame(updateLightboxThumbnails);
}
function renderLightboxThumbnails(){
 const dialog=$('#lightbox');let rail=$('#lightbox-thumbnails');
 if(!rail){rail=document.createElement('div');rail.id='lightbox-thumbnails';rail.className='lightbox-thumbnails';rail.setAttribute('role','group');rail.setAttribute('aria-label','Choose a photograph');dialog.append(rail);}
 rail.replaceChildren();rail.hidden=lightboxPhotos.length<2;dialog.classList.toggle('has-thumbnails',!rail.hidden);
 if(rail.hidden)return;
 const fragment=document.createDocumentFragment();
 lightboxPhotos.forEach((p,index)=>{
  const button=document.createElement('button');button.type='button';
  button.setAttribute('aria-label','Show photograph '+(index+1)+': '+photoAlt(p));button.tabIndex=-1;
  button.innerHTML='<img '+thumbnailAttrs(p,'88px')+' alt="" loading="lazy">';
  button.onclick=()=>{current=index;showPhoto();};
  fragment.append(button);
 });
 rail.append(fragment);
}
function updateLightboxThumbnails(){
 const rail=$('#lightbox-thumbnails');if(!rail||rail.hidden)return;
 Array.from(rail.children).forEach((button,index)=>{
  const selected=index===current;button.setAttribute('aria-pressed',String(selected));button.tabIndex=selected?0:-1;
 });
 const button=rail.children[current];
 if(button&&rail.clientWidth)rail.scrollTo({left:button.offsetLeft-(rail.clientWidth-button.offsetWidth)/2,behavior:'instant'});
}
function showPhoto(){
 const p = lightboxPhotos[current]; if(!p)return;
 $('#lightbox-image').src=photoSrc(p); $('#lightbox-image').alt=photoAlt(p);
 let description=$('#lightbox-description');if(!description){description=document.createElement('p');description.id='lightbox-description';$('.lightbox-caption').append(description);}
 description.textContent=p.description||'';description.hidden=!p.description||p.description===photoTitle(p);
 $('#lightbox-title').textContent=photoTitle(p);$('#lightbox-title').title=p.title;
 let scientific=$('#lightbox-scientific-name');
 if(!scientific){scientific=document.createElement('p');scientific.id='lightbox-scientific-name';scientific.className='wildlife-scientific-name';$('#lightbox-title').after(scientific);}
 scientific.textContent=p.scientificName||'';scientific.hidden=!isWildlife(p)||!p.scientificName;
 const location=$('#lightbox-location');location.classList.toggle('wildlife-place',isWildlife(p));
 if(isWildlife(p))location.innerHTML=wildlifePlace(p);
 else if(p.category==='National Parks'&&p.state)location.textContent=p.state;
 else location.textContent=[p.city || p.location || (p.category==='Slideshow'?'From Daniel’s collection':'Location to confirm'),p.country].filter(Boolean).join(' · ');
 $('#lightbox-counter').textContent=`${String(current+1).padStart(2,'0')} / ${lightboxPhotos.length}`;
 updateLightboxThumbnails();
}
function movePhoto(delta){current=(current+delta+lightboxPhotos.length)%lightboxPhotos.length;showPhoto();}
$('#close-lightbox').onclick=()=>$('#lightbox').close();
$('#prev-photo').onclick=()=>movePhoto(-1);$('#next-photo').onclick=()=>movePhoto(1);
$('#lightbox').addEventListener('keydown',e=>{
 const inRail=!!e.target.closest('#lightbox-thumbnails');
 if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();movePhoto(e.key==='ArrowLeft'?-1:1);}
 else if(inRail&&(e.key==='Home'||e.key==='End')){e.preventDefault();current=e.key==='Home'?0:lightboxPhotos.length-1;showPhoto();}
 else return;
 if(inRail)$('#lightbox-thumbnails').children[current]?.focus({preventScroll:true});
});
function renderStories(){
 const stories=featuredGalleries,directory=!!$('#journal-stories').dataset.directory;
 const sizes=directory?'(max-width:650px) 100vw, 60vw':'(max-width:650px) calc(100vw - 36px), (max-width:1000px) calc((100vw - 84px) / 2), calc((100vw - 160px) / 3)';
 $('#journal-stories').innerHTML='';
 stories.forEach((s,i)=>{
  const p=catalogPhotos.find(p=>p.id===s.photo)||catalogPhotos.find(p=>p.category===s.category)||catalogPhotos[i+1]||catalogPhotos[0];if(!p)return;
  const b=document.createElement('a');b.className='story';b.href=s.page;b.setAttribute('aria-label',`Explore ${s.category} photographs`);
  b.innerHTML=`<div class="story-img"><img ${thumbnailAttrs(p,sizes)} alt="${esc(photoAlt(p))}" loading="${directory&&i===0?'eager':'lazy'}"></div><div class="story-meta"><span>${esc(s.label)}</span><span aria-hidden="true">↗</span></div><h3>${esc(s.displayTitle||s.title)}</h3><p>${esc(s.description)}</p>`;
  $('#journal-stories').append(b);
 });
 if($('#photography-status'))$('#photography-status').hidden=true;
}
function renderCollection(){
 const container=$('#collection-grid');if(!container)return;
 const list=catalogPhotos.filter(p=>!p.coverOnly&&(container.dataset.album ? p.albums?.includes(container.dataset.album) : (p.category===container.dataset.category||p.collections?.includes(container.dataset.category))));
 if(container.dataset.category)list.sort((a,b)=>(a.collectionOrder?.[container.dataset.category]??1e12)-(b.collectionOrder?.[container.dataset.category]??1e12));
 if(container.dataset.album)list.sort((a,b)=>a.albumOrder[container.dataset.album]-b.albumOrder[container.dataset.album]);
 if($('#collection-cover-open')&&list[0]){$('#collection-cover-open').onclick=()=>{const cover=catalogPhotos.find(p=>p.id===container.dataset.cover)||list[0];openPhoto(cover,cover.coverOnly?[cover]:list);};}
 if(container.dataset.category==='Wildlife'&&list[0]){
  const cover=catalogPhotos.find(p=>p.id===container.dataset.cover)||list[0],caption=$('#collection-cover-location');
  if(caption){caption.classList.add('wildlife-place');caption.innerHTML=wildlifePlace(cover);}
 }
 if(container.dataset.category==='National Parks'){
  const cover=catalogPhotos.find(p=>p.id===container.dataset.cover)||list[0],caption=$('#collection-cover-location');
  if(caption&&cover)caption.textContent=[cover.location,cover.state].filter(Boolean).join(', ');
 }
 container.replaceChildren();
 if(container.dataset.layout==='filmstrip'){renderFilmstrip(container,list);return;}
 list.forEach(p=>{
  const button=document.createElement('button');button.className='gallery-photo'+((p.displayHeight||p.height)>(p.displayWidth||p.width)?' portrait':' landscape')+(container.dataset.editorial&&p.width>p.height&&(p.largeSrc||p.width>=1000)&&(list.indexOf(p)===0||list.indexOf(p)%5===2)?' spread':'');
  button.setAttribute('aria-label','Open '+photoAlt(p));
  button.innerHTML='<img '+thumbnailAttrs(p,collectionSizes(container))+' alt="'+esc(photoAlt(p))+'" width="'+(p.displayWidth||p.width)+'" height="'+(p.displayHeight||p.height)+'" loading="lazy">'+photoCaption(p);
  button.onclick=()=>openPhoto(p,list);container.append(button);
 });
}
function renderFilmstrip(container,list){
 if(!list.length)return;
 container.classList.add('is-filmstrip');
 container.innerHTML='<div class="filmstrip-controls"><button class="filmstrip-browse" aria-expanded="true" aria-controls="filmstrip-drawer">Browse cities <span aria-hidden="true">−</span></button><div class="filmstrip-arrows"><button aria-label="Previous city" aria-controls="filmstrip-track">←</button><button aria-label="Next city" aria-controls="filmstrip-track">→</button></div></div><div id="filmstrip-drawer" class="filmstrip-drawer" role="group" aria-label="Jump to a city"></div><div id="filmstrip-track" class="filmstrip-track" role="region" aria-label="Cityscapes filmstrip" tabindex="0" aria-describedby="filmstrip-help"></div><p id="filmstrip-help" class="sr-only">Swipe or scroll horizontally to explore this looping gallery. Use the left and right arrow keys to change photographs, or Home and End to jump to the first and last. Select a photograph to open fullscreen.</p><p class="sr-only filmstrip-status" role="status" aria-live="polite"></p>';
 if(container.dataset.category==='Metros'){
  container.querySelector('.filmstrip-browse').firstChild.textContent='Browse stations ';
  container.querySelector('.filmstrip-track').setAttribute('aria-label','Metros filmstrip');
  container.querySelector('.filmstrip-drawer').setAttribute('aria-label','Jump to a station');
  container.querySelector('[aria-label="Previous city"]').setAttribute('aria-label','Previous station');
  container.querySelector('[aria-label="Next city"]').setAttribute('aria-label','Next station');
  container.querySelector('#filmstrip-help').textContent='Swipe or scroll horizontally to explore this looping gallery. Use the left and right arrow keys to change photographs, or Home and End to jump to the first and last. Select a photograph to open fullscreen.';
 }
 const track=container.querySelector('.filmstrip-track'),drawer=container.querySelector('.filmstrip-drawer');
 const browse=container.querySelector('.filmstrip-browse'),[previous,next]=container.querySelectorAll('.filmstrip-arrows button');
 const status=container.querySelector('.filmstrip-status');
 let selected=-1,frame=0,settleTimer=0,programmatic=false,drag=null,suppressClick=false;
 const slides=[],thumbs=[],physical=[];
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const wrap=index=>(index%list.length+list.length)%list.length;
 function select(index){
  if(selected===index)return;
  selected=index;
  previous.disabled=next.disabled=list.length<2;
  slides.forEach((slide,i)=>{if(i===index)slide.setAttribute('aria-current','true');else slide.removeAttribute('aria-current');});
  thumbs.forEach((thumb,i)=>thumb.setAttribute('aria-pressed',String(i===index)));
  if(!drawer.hidden){
   const thumb=thumbs[index],left=thumb.offsetLeft;
   if(left<drawer.scrollLeft)drawer.scrollTo({left,behavior:'instant'});
   else if(left+thumb.offsetWidth>drawer.scrollLeft+drawer.clientWidth)drawer.scrollTo({left:left+thumb.offsetWidth-drawer.clientWidth,behavior:'instant'});
  }
  status.textContent=photoAlt(list[index]);
 }
 function nearest(){
  return physical.reduce((best,item)=>Math.abs(item.node.offsetLeft-track.scrollLeft)<Math.abs(best.node.offsetLeft-track.scrollLeft)?item:best,physical[0]);
 }
 function settle(){
  clearTimeout(settleTimer);
  if(drag?.moved)return;
  programmatic=false;
  const item=nearest();select(item.index);
  // Identical neighboring cycles let swipes cross either end without a visible rewind.
  if(!item.canonical){
   const offset=track.scrollLeft-item.node.offsetLeft;
   track.scrollTo({left:slides[item.index].offsetLeft+offset,behavior:'instant'});
  }
 }
 function go(index,smooth=true){
  index=wrap(index);
  const target=physical.filter(item=>item.index===index).reduce((best,item)=>Math.abs(item.node.offsetLeft-track.scrollLeft)<Math.abs(best.node.offsetLeft-track.scrollLeft)?item:best);
  select(index);programmatic=true;
  const animate=smooth&&!reduced()&&Math.abs(track.scrollLeft-target.node.offsetLeft)>1;
  track.scrollTo({left:target.node.offsetLeft,behavior:animate?'smooth':'instant'});
  clearTimeout(settleTimer);
  if(animate)settleTimer=setTimeout(settle,180);else settle();
 }
 // Only the middle cycle participates in keyboard and screen-reader navigation.
 for(let cycle=0;cycle<3;cycle++){
  list.forEach((p,i)=>{
   const slide=document.createElement('button');slide.className='gallery-photo filmstrip-slide';
   const canonical=cycle===1;
   slide.style.setProperty('--photo-ratio',String((p.displayWidth||p.width)/(p.displayHeight||p.height)));
   slide.setAttribute('aria-label','Open '+photoAlt(p));
   if(!canonical){slide.setAttribute('aria-hidden','true');slide.tabIndex=-1;}
   slide.innerHTML='<img src="'+esc(photoSrc(p))+'" alt="'+esc(photoAlt(p))+'" width="'+(p.displayWidth||p.width)+'" height="'+(p.displayHeight||p.height)+'" loading="'+(canonical&&i===0?'eager':'lazy')+'" decoding="async" draggable="false"><span class="tile-caption"><span>'+esc(photoTitle(p))+'</span><span>'+esc(photoPlace(p))+'</span></span>';
   if(container.dataset.category==='Metros'){
    const mat=document.createElement('span');mat.className='filmstrip-mat';
    slide.querySelector('img').before(mat);mat.append(slide.querySelector('img'));
   }
   slide.onclick=()=>{go(i,false);slides[i].focus({preventScroll:true});openPhoto(p,list);};
   track.append(slide);physical.push({node:slide,index:i,canonical});
   if(canonical)slides.push(slide);
  });
 }
 list.forEach((p,i)=>{
  const thumb=document.createElement('button');thumb.setAttribute('aria-label','Jump to '+photoAlt(p));
  thumb.innerHTML='<img '+thumbnailAttrs(p,'96px')+' alt="" loading="lazy"><span>'+esc(photoTitle(p))+'</span>';
  thumb.onclick=()=>go(i);drawer.append(thumb);thumbs.push(thumb);
 });
 previous.onclick=()=>go(selected-1);next.onclick=()=>go(selected+1);
 browse.onclick=()=>{const expanded=browse.getAttribute('aria-expanded')!=='true';browse.setAttribute('aria-expanded',String(expanded));browse.querySelector('span').textContent=expanded?'−':'＋';drawer.hidden=!expanded;};
 track.addEventListener('scroll',()=>{
  cancelAnimationFrame(frame);
  frame=requestAnimationFrame(()=>{if(!programmatic)select(nearest().index);});
  clearTimeout(settleTimer);settleTimer=setTimeout(settle,180);
 },{passive:true});
 track.addEventListener('scrollend',settle);
 track.addEventListener('keydown',event=>{
  const index=event.key==='ArrowLeft'?selected-1:event.key==='ArrowRight'?selected+1:event.key==='Home'?0:event.key==='End'?list.length-1:null;
  if(index!==null){event.preventDefault();go(index);}
 });
 track.addEventListener('pointerdown',event=>{
  programmatic=false;clearTimeout(settleTimer);
  track.scrollTo({left:track.scrollLeft,behavior:'instant'});
  if(event.pointerType==='mouse'&&event.button===0)drag={id:event.pointerId,x:event.clientX,left:track.scrollLeft,moved:false};
 });
 track.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  const delta=event.clientX-drag.x;
  if(!drag.moved&&Math.abs(delta)>8){drag.moved=true;track.classList.add('is-dragging');track.setPointerCapture(event.pointerId);}
  if(drag.moved){event.preventDefault();track.scrollLeft=drag.left-delta;}
 });
 function finishDrag(){
  if(!drag)return;
  const moved=drag.moved,id=drag.id;drag=null;track.classList.remove('is-dragging');
  if(track.hasPointerCapture(id))track.releasePointerCapture(id);
  if(moved){suppressClick=true;go(nearest().index);setTimeout(()=>{suppressClick=false;},0);}
 }
 track.addEventListener('pointerup',finishDrag);track.addEventListener('pointercancel',finishDrag);
 track.addEventListener('lostpointercapture',finishDrag);
 track.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();}},{capture:true});
 new ResizeObserver(()=>go(selected<0?0:selected,false)).observe(track);
 select(0);track.scrollTo({left:slides[0].offsetLeft,behavior:'instant'});
}
const worldBounds = [0, 0, 1080, 550];
function mapViewportAspect(){
 const rect=$('#world-map')?.getBoundingClientRect();return rect?.width?rect.height/rect.width:550/1080;
}
let atlasProjection=null,overviewMap=null,detailActive=false;
let atlasTransitionId=0,cancelAtlasTransition=()=>{};
function projectAtlas(lng,lat){return atlasProjection?atlasProjection([lng,lat]):[(lng+180)*3,(90-lat)*550/180];}
function showWorldOverview(){
 ++atlasTransitionId;cancelAtlasTransition();vectorMap?.stop();
 const panel=$('#detailed-map').closest('.map-panel');panel.classList.remove('is-map-preparing');panel.dataset.view='overview';
 detailActive=false;place=null;previewScope='';cameraPlace=undefined;vectorCameraPlace=null;vectorExplored=false;
 $('#detailed-map').closest('.map-panel').classList.remove('is-detailed-map');
 mapSurface.removeAttribute('aria-hidden');$('#detailed-map').setAttribute('aria-hidden','true');
 cancelAnimationFrame(cameraFrame);mapTarget=[...worldBounds];mapBounds=[...worldBounds];render();mapSurface.focus({preventScroll:true});
}
function showDetail(center,zoom=4,bounds=null){
 if(!vectorReady)return false;
 ++atlasTransitionId;cancelAtlasTransition();cancelAnimationFrame(cameraFrame);
 const token=atlasTransitionId,container=$('#detailed-map'),panel=container.closest('.map-panel');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let frame=0,timer=0,started=false;
 detailActive=true;vectorExplored=true;
 panel.classList.add('is-map-preparing');panel.dataset.view='preparing';
 vectorMap.stop();vectorMap.resize();
 if(bounds)vectorMap.fitBounds(bounds,{padding:atlasCameraPadding(),maxZoom:10,duration:0});
 else vectorMap.jumpTo({center,zoom,padding:atlasCameraPadding(!!place)});
 const valid=()=>token===atlasTransitionId&&detailActive;
 function fade(){
  if(!valid())return;
  panel.classList.add('is-detailed-map');panel.classList.remove('is-map-preparing');panel.dataset.view=reduced?'detail':'fading';
  mapSurface.setAttribute('aria-hidden','true');container.removeAttribute('aria-hidden');
  vectorMap.getCanvas().focus({preventScroll:true});
  clearTimeout(timer);
  timer=setTimeout(()=>{if(valid())panel.dataset.view='detail';},reduced?0:600);
 }
 function ready(){
  if(!valid()||started||vectorMap.isMoving()||!vectorMap.areTilesLoaded())return;
  started=true;vectorMap.off('idle',ready);clearTimeout(timer);
  // Match the visible location and scale before blending the two projections.
  const center=vectorMap.getCenter(),epsilon=center.lng>179.9?-.01:.01;
  const projected=projectAtlas(center.lng,center.lat),near=projectAtlas(center.lng+epsilon,center.lat);
  const screen=vectorMap.project(center),nextScreen=vectorMap.project([center.lng+epsilon,center.lat]);
  const scale=(near[0]-projected[0])/(nextScreen.x-screen.x),rect=mapSurface.getBoundingClientRect();
  const target=[projected[0]-screen.x*scale,projected[1]-screen.y*scale,rect.width*scale,rect.height*scale];
  if(!target.every(Number.isFinite)||scale<=0){fade();return;}
  const start=[...mapBounds],begin=performance.now();
  const duration=reduced?0:Math.min(650,Math.max(180,Math.abs(Math.log2(start[2]/target[2]))*140));
  function align(now){
   if(!valid())return;
   const t=duration?Math.min(1,(now-begin)/duration):1,eased=t*t*(3-2*t);
   setMapBounds(start.map((v,i)=>v+(target[i]-v)*eased));
   if(t<1)frame=requestAnimationFrame(align);else fade();
  }
  frame=requestAnimationFrame(align);
 }
 cancelAtlasTransition=()=>{
  cancelAnimationFrame(frame);clearTimeout(timer);vectorMap?.off('idle',ready);
 };
 vectorMap.on('idle',ready);frame=requestAnimationFrame(ready);
 // Keep the regional outline usable if detail tiles cannot finish loading.
 timer=setTimeout(()=>{
  if(!valid()||started)return;
  cancelAtlasTransition();detailActive=false;panel.classList.remove('is-map-preparing');panel.dataset.view='overview';
  container.setAttribute('aria-hidden','true');mapSurface.removeAttribute('aria-hidden');mapSurface.focus({preventScroll:true});
 },8000);
 $('#reset-map').hidden=false;
 return true;
}
let mapPlaces = [], mapPointSignature = '';
let vectorMap=null,vectorReady=false,vectorCameraPlace,vectorExplored=false;
let mapBounds = [...worldBounds], mapTarget = [...worldBounds], cameraFrame = 0, cameraPlace, dragState = null, suppressMapClick = false;
function setMapBounds(bounds){
 mapBounds = bounds;
 $('#reset-map').hidden = !place && bounds.every((n,i)=>Math.abs(n-worldBounds[i])<.01);
 $('#world-map').setAttribute('viewBox', bounds.join(' '));
 drawMapPoints();overviewMap?.update(bounds);
 // Keep markers and their touch targets the same visual size while the land zooms.
 const scale = 1/($('#world-map').getScreenCTM()?.a || 1);
 document.querySelectorAll('.map-point').forEach(point=>point.setAttribute('transform',`translate(${point.dataset.x},${point.dataset.y}) scale(${scale})`));
}
window.addEventListener('resize',()=>{if(mapSurface&&!detailActive)setMapBounds(mapBounds)});
function updateMapCamera(){
 if(vectorReady&&place&&!detailActive){const p=photos.find(p=>p.location===place&&hasLocation(p));if(p)showDetail([p.lng,p.lat],4);}
 if(detailActive){if(vectorCameraPlace!==place){vectorCameraPlace=place;focusVectorMap();}return;}
 if(cameraPlace===place){setMapBounds(mapBounds);return;}
 cameraPlace=place;
 const selected = photos.find(p=>p.location===place && Number.isFinite(p.lat) && Number.isFinite(p.lng));
 const width = selected?.coordinatePrecision==='Landmark'?1.8:selected?.coordinatePrecision==='Park'?18:selected?.coordinatePrecision==='Region'?24:selected?.coordinatePrecision==='Country'?240:6, height = Math.min(550,width*mapViewportAspect()), point=selected?projectAtlas(selected.lng,selected.lat):null;
 const target = selected ? [Math.max(0,Math.min(1080-width,point[0]-width/2)),Math.max(0,Math.min(550-height,point[1]-height/2)),width,height] : [...worldBounds];
 if(target.every((n,i)=>n===mapTarget[i])){setMapBounds(mapBounds);return;}
 mapTarget = target;
 cancelAnimationFrame(cameraFrame);
 if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches){setMapBounds(target);return;}
 const start = [...mapBounds], started = performance.now();
 function frame(now){
  const t=Math.min(1,(now-started)/650), eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  setMapBounds(start.map((value,i)=>value+(target[i]-value)*eased));
  if(t<1)cameraFrame=requestAnimationFrame(frame);
 }
 cameraFrame=requestAnimationFrame(frame);
}
function clampMapBounds(bounds){
 const width=Math.max(.03,Math.min(1080,bounds[2])), height=Math.min(550,width*mapViewportAspect());
 return [Math.max(0,Math.min(1080-width,bounds[0])),Math.max(0,Math.min(550-height,bounds[1])),width,height];
}
function exploreMap(bounds){
 cancelAnimationFrame(cameraFrame);
 mapTarget=clampMapBounds(bounds);
 setMapBounds(mapTarget);
}
function zoomMap(factor,clientX,clientY){
 const svg=$('#world-map'), matrix=svg.getScreenCTM();
 if(!matrix)return;
 const rect=svg.getBoundingClientRect();
 const anchor=new DOMPoint(clientX??rect.left+rect.width/2,clientY??rect.top+rect.height/2).matrixTransform(matrix.inverse());
 const nextWidth=Math.max(.03,Math.min(1080,mapBounds[2]*factor)),nextHeight=Math.min(550,nextWidth*mapViewportAspect());
 const fx=((clientX??rect.left+rect.width/2)-rect.left)/rect.width,fy=((clientY??rect.top+rect.height/2)-rect.top)/rect.height;
 const next=clampMapBounds([anchor.x-fx*nextWidth,anchor.y-fy*nextHeight,nextWidth,nextHeight]);
 // Keep regional exploration detailed even when users zoom without selecting a pin.
 if(vectorReady&&nextWidth<=135&&atlasProjection){
  const center=atlasProjection.invert([next[0]+next[2]/2,next[1]+next[3]/2]);
  const west=atlasProjection.invert([next[0],next[1]+next[3]/2]),east=atlasProjection.invert([next[0]+next[2],next[1]+next[3]/2]);
  if(center&&west&&east&&center.every(Number.isFinite)){
   const span=Math.abs(east[0]-west[0]);
   const zoom=Math.max(3,Math.min(12,Math.log2(rect.width/(512*Math.max(.00001,span/360)))));
   place=null;vectorCameraPlace=null;renderPreview([]);exploreMap(next);showDetail(center,zoom);return;
  }
 }
 exploreMap(next);
}
const mapSurface=$('#world-map');
if(mapSurface){
mapSurface.addEventListener('wheel',event=>{
 event.preventDefault();
 const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?mapSurface.clientHeight:1);
 zoomMap(Math.exp(Math.max(-600,Math.min(600,delta))*.0015),event.clientX,event.clientY);
},{passive:false});
mapSurface.addEventListener('pointerdown',event=>{
 if(!event.isPrimary||event.button!==0)return;
 suppressMapClick=false;
 const matrix=mapSurface.getScreenCTM();if(!matrix)return;
 dragState={id:event.pointerId,x:event.clientX,y:event.clientY,bounds:[...mapBounds],scale:matrix.a,moved:false};
});
mapSurface.addEventListener('pointermove',event=>{
 if(!dragState||dragState.id!==event.pointerId)return;
 const dx=event.clientX-dragState.x,dy=event.clientY-dragState.y;
 if(!dragState.moved&&Math.hypot(dx,dy)<5)return;
 if(!dragState.moved){
  dragState.moved=true;suppressMapClick=true;
  mapSurface.setPointerCapture(event.pointerId);mapSurface.classList.add('is-panning');
 }
 event.preventDefault();
 const [x,y,w,h]=dragState.bounds;
 exploreMap([x-dx/dragState.scale,y-dy/dragState.scale,w,h]);
});
function endMapDrag(event){
 if(!dragState||dragState.id!==event.pointerId)return;
 if(mapSurface.hasPointerCapture(event.pointerId))mapSurface.releasePointerCapture(event.pointerId);
 dragState=null;mapSurface.classList.remove('is-panning');
}
mapSurface.addEventListener('pointerup',endMapDrag);
mapSurface.addEventListener('pointercancel',endMapDrag);
mapSurface.addEventListener('lostpointercapture',()=>{dragState=null;mapSurface.classList.remove('is-panning')});
mapSurface.addEventListener('pointerleave',()=>{if(dragState&&!dragState.moved)dragState=null});
mapSurface.addEventListener('click',event=>{if(suppressMapClick){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
mapSurface.addEventListener('keydown',event=>{
 if(event.key==='+'||event.key==='='||event.key==='-'){event.preventDefault();zoomMap(event.key==='-'?1.3:1/1.3);return;}
 if(event.target!==mapSurface)return;
 const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
 if(moves[event.key]){event.preventDefault();const [dx,dy]=moves[event.key];exploreMap([mapBounds[0]+dx*mapBounds[2]*.12,mapBounds[1]+dy*mapBounds[3]*.12,mapBounds[2],mapBounds[3]])}
});
}
function renderPoints(){
 const groups=new Map();
 photos.filter(p=>matchesCategory(p)&&hasLocation(p)).forEach(p=>{
  if(!groups.has(p.location))groups.set(p.location,{name:p.location,photos:[],x:0,y:0});
  const group=groups.get(p.location);group.photos.push(p);const [x,y]=projectAtlas(p.lng,p.lat);group.x+=x;group.y+=y;
 });
 mapPlaces=[...groups.values()].map(g=>({...g,x:g.x/g.photos.length,y:g.y/g.photos.length}));
 mapPointSignature='';drawMapPoints();if(vectorReady)updateVectorPoints();
}
function drawMapPoints(){
 const surface=$('#world-map'),points=$('#map-points');if(!surface||!points)return;
 const pixelScale=surface.getScreenCTM()?.a||1,cellSize=38/pixelScale;
 const cells=new Map(),selected=[];
 mapPlaces.forEach(p=>{
  if(p.x<mapBounds[0]-cellSize||p.x>mapBounds[0]+mapBounds[2]+cellSize||p.y<mapBounds[1]-cellSize||p.y>mapBounds[1]+mapBounds[3]+cellSize)return;
  if(p.name===place){selected.push([p]);return;}
  const key=Math.floor(p.x/cellSize)+','+Math.floor(p.y/cellSize);
  if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);
 });
 const groups=[...cells.values(),...selected];
 const signature=groups.map(g=>g.map(p=>p.name).join('|')).join(';;')+'::'+place;
 if(signature===mapPointSignature)return;
 mapPointSignature=signature;
 const focused=document.activeElement?.dataset.location,focusedCluster=document.activeElement?.dataset.cluster;
 points.replaceChildren();
 groups.forEach(group=>{
  const clustered=group.length>1,first=group[0],x=group.reduce((n,p)=>n+p.x,0)/group.length,y=group.reduce((n,p)=>n+p.y,0)/group.length;
  const list=group.flatMap(p=>p.photos),countries=[...new Set(list.map(p=>p.country))];
  const label=clustered?(countries.length===1?countries[0]+': ':'')+group.length+' places, '+list.length+' photographs. Zoom to explore.':first.name+', '+list.length+' photographs';
  const g=document.createElementNS(surface.namespaceURI,'g');g.setAttribute('class','map-point'+(list.length>1?' map-cluster':'')+(place===first.name&&!clustered?' selected':''));
  g.dataset.x=x;g.dataset.y=y;
  if(clustered)g.dataset.cluster=group.map(p=>p.name).join('|');else g.dataset.location=first.name;
  g.setAttribute('transform',`translate(${x},${y}) scale(${1/pixelScale})`);
  g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label',label);g.setAttribute('aria-pressed',String(!clustered&&place===first.name));
  const hit=document.createElementNS(surface.namespaceURI,'circle');hit.setAttribute('r','19');hit.setAttribute('class','point-hit');g.append(hit);
  const circle=document.createElementNS(surface.namespaceURI,'circle');circle.setAttribute('r',list.length>1?'12':place===first.name?'7':'5');g.append(circle);
  const title=document.createElementNS(surface.namespaceURI,'title');title.textContent=clustered?label:first.name+' · approximate '+(first.photos[0].coordinatePrecision||'city').toLowerCase()+' position';g.append(title);
  if(list.length>1){
   const text=document.createElementNS(surface.namespaceURI,'text');text.setAttribute('class','map-cluster-count');text.setAttribute('text-anchor','middle');text.setAttribute('dy','.35em');text.textContent=String(list.length);g.append(text);
  }
  if(!clustered&&place===first.name){
   const text=document.createElementNS(surface.namespaceURI,'text');text.setAttribute('y',list.length>1?'-19':'-13');text.setAttribute('text-anchor','middle');text.textContent=first.name;g.append(text);
  }
  function select(){
   if(clustered){
    const lngs=list.map(p=>p.lng),lats=list.map(p=>p.lat);
    if(showDetail([list[0].lng,list[0].lat],4,[[Math.min(...lngs)-.1,Math.min(...lats)-.1],[Math.max(...lngs)+.1,Math.max(...lats)+.1]])){renderPreview([]);return;}
    const xs=group.map(p=>p.x),ys=group.map(p=>p.y);
    const width=Math.max(.03,Math.min(mapBounds[2]*.6,Math.max((Math.max(...xs)-Math.min(...xs))*1.8,(Math.max(...ys)-Math.min(...ys))*1.8/mapViewportAspect())));
    if(mapBounds[2]<=.031){openPhoto(list[0],list);return;}
    const height=Math.min(550,width*mapViewportAspect());
    place=null;cameraPlace=null;render();exploreMap([x-width/2,y-height/2,width,height]);surface.focus();
   }else{
    cameraPlace=undefined;place=first.name;render();if(!detailActive)[...points.children].find(el=>el.dataset.location===first.name)?.focus();
   }
  }
  g.onclick=select;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};points.append(g);
 });
 if(focused)[...points.children].find(g=>g.dataset.location===focused)?.focus({preventScroll:true});
 else if(focusedCluster)[...points.children].find(g=>g.dataset.cluster===focusedCluster)?.focus({preventScroll:true});
}
let previewIndex=0,previewScope='';
function closePlacePreview(){
 place=null;previewScope='';vectorCameraPlace=null;cameraPlace=null;render();
 if(detailActive){
  vectorMap.resize();vectorMap.easeTo({padding:atlasCameraPadding(),duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:350});
  vectorMap.getCanvas().focus({preventScroll:true});
 }else mapSurface.focus({preventScroll:true});
}
function renderPreview(list){
 const panel=$('#place-preview');panel.replaceChildren();
 if(!place||!list.length){panel.hidden=true;return;}
 const scope=category+'|'+place+'|'+list.map(p=>p.id).join(',');
 if(scope!==previewScope){previewScope=scope;previewIndex=0;}
 previewIndex=Math.min(previewIndex,list.length-1);
 const p=list[previewIndex];panel.hidden=false;
 const heading=document.createElement('div');heading.className='preview-header';
 heading.innerHTML='<div class="preview-country">'+esc(p.country)+'</div><h2 class="preview-heading">'+esc(place)+'</h2>';
 const close=document.createElement('button');close.type='button';close.className='preview-close';close.setAttribute('aria-label','Close photo preview');close.textContent='×';close.onclick=closePlacePreview;heading.append(close);panel.append(heading);
 const open=document.createElement('button');open.type='button';open.className='preview-open';open.setAttribute('aria-label','Open '+photoAlt(p));
 open.innerHTML='<img class="preview-photo" '+thumbnailAttrs(p,'(max-width:650px) calc(100vw - 64px), 292px')+' alt="'+esc(photoAlt(p))+'"><span class="preview-open-label">View photograph ↗</span>';
 open.onclick=()=>openPhoto(p,list);panel.append(open);
 if(photoTitle(p)!==place){const caption=document.createElement('p');caption.className='preview-caption';caption.textContent=photoTitle(p);panel.append(caption);}
 const controls=document.createElement('div');controls.className='preview-navigation';
 function step(delta){
  previewIndex=(previewIndex+delta+list.length)%list.length;renderPreview(list);
  panel.querySelector(delta<0?'[data-preview-step="previous"]':'[data-preview-step="next"]')?.focus({preventScroll:true});
 }
 const previous=document.createElement('button');previous.type='button';previous.dataset.previewStep='previous';previous.setAttribute('aria-label','Previous location photograph');previous.textContent='←';previous.onclick=()=>step(-1);
 const next=document.createElement('button');next.type='button';next.dataset.previewStep='next';next.setAttribute('aria-label','Next location photograph');next.textContent='→';next.onclick=()=>step(1);
 const counter=document.createElement('span');counter.textContent=String(previewIndex+1).padStart(2,'0')+' / '+String(list.length).padStart(2,'0');counter.setAttribute('aria-label','Photograph '+(previewIndex+1)+' of '+list.length);
 if(list.length>1){controls.append(previous,counter,next);panel.append(controls);}
 const thumbs=document.createElement('div');thumbs.className='preview-thumbs';
 if(list.length>1)list.forEach((photo,index)=>{
  const button=document.createElement('button');button.type='button';button.dataset.previewIndex=index;button.setAttribute('aria-label','Preview '+photoAlt(photo));button.setAttribute('aria-pressed',String(index===previewIndex));
  button.innerHTML='<img '+thumbnailAttrs(photo,'44px')+' alt="" loading="lazy">';
  button.onclick=()=>{previewIndex=index;renderPreview(list);panel.querySelector('[data-preview-index="'+index+'"]')?.focus({preventScroll:true});};thumbs.append(button);
 });
 panel.append(thumbs);
}
function render(){
 const list=filtered();
 document.querySelectorAll('.filters [data-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===category)));
 renderPoints();renderPreview(list);updateMapCamera();
 const message=$('#atlas-message');
 if(message)message.textContent=place?place+'. Photo preview available.':category==='All'?'Explore the photographic atlas. Select a marked place to view photographs.':'Map filtered to '+category+'.';
 if(detailActive)requestAnimationFrame(()=>vectorMap.resize());
}
document.querySelectorAll('.filters [data-category]').forEach(button=>button.onclick=()=>{category=button.dataset.category;showWorldOverview();});
if(mapSurface){
 $('#reset-map').onclick=showWorldOverview;
 $('#outline-zoom-in').onclick=()=>detailActive?vectorMap.zoomIn():zoomMap(1/1.5);
 $('#outline-zoom-out').onclick=()=>detailActive?vectorMap.zoomOut():zoomMap(1.5);
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&place&&!$('#lightbox').open&&!document.querySelector('.site-header.nav-open')){
   event.preventDefault();closePlacePreview();
  }
 });
}

function renderCountryDirectory(){
 const cards=$('#country-cards');if(!cards)return;
 cards.replaceChildren();
 countryAlbums.forEach(a=>{
  const link=document.createElement('a');link.className='country-card';link.href=a.page;
  const cover=catalogPhotos.find(p=>p.id===a.coverPhoto)||{src:a.cover};
  link.innerHTML='<img '+thumbnailAttrs(cover,'(max-width:650px) calc((100vw - 50px) / 2), (max-width:900px) calc((100vw - 84px) / 2), calc((100vw - 168px) / 3)')+' alt="" loading="lazy"><span class="country-card-body"><span>'+esc(a.name)+'</span><small>'+a.count+' photographs ↗</small></span>';
  link.querySelector('img').style.objectPosition=a.coverPosition||'50% 50%';
  cards.append(link);
 });
}
function initReveal(){
 if(!('IntersectionObserver' in window)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');observer.unobserve(e.target);}}),{threshold:.08});
 document.querySelectorAll('.story,.collection-editorial .gallery-photo,.home-about .section-heading').forEach(el=>{el.classList.add('reveal');observer.observe(el);});
}
function initCarousel(slides){
 const region=document.querySelector('.hero');let image=$('#hero-photo');if(!region||!image||!slides.length)return;
 const controls=$('.carousel-controls'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let index=0,requestedIndex=0,request=0,loading=false,timer=null,paused=reduced.matches,hovering=false,focused=false,startX=null,startY=null,swiped=false,inView=true;
 const dots=$('#carousel-dots');
 slides.forEach((p,i)=>{const b=document.createElement('button');b.setAttribute('aria-label','Show photograph '+(i+1)+': '+p.location);b.onclick=()=>show(i);dots?.append(b);});
 function schedule(){clearInterval(timer);if(!loading&&inView&&!paused&&!hovering&&!focused&&!document.hidden&&!$('#lightbox').open)timer=setInterval(()=>show(index+1,false),6500);}
 async function loadSlide(p){
  // Decode a detached image first; never replace a working photo with an unfinished request.
  for(const src of [...new Set([photoSrc(p),p.src].filter(Boolean))]){
   const candidate=new Image();candidate.decoding='async';candidate.alt=p.title;candidate.draggable=false;
   try{
    await new Promise((resolve,reject)=>{candidate.onload=resolve;candidate.onerror=reject;candidate.src=src;});
    await candidate.decode();
    if(candidate.naturalWidth)return candidate;
   }catch(error){/* Try the original-sized local copy if the larger asset fails. */}
  }
  throw Error('Photograph could not be loaded');
 }
 async function show(next,announce=true){
  const target=(next+slides.length)%slides.length,p=slides[target],token=++request;
  requestedIndex=target;loading=true;clearInterval(timer);region.setAttribute('aria-busy','true');
  let nextImage;
  try{nextImage=await loadSlide(p);}
  catch(error){
   if(token!==request)return;
   loading=false;requestedIndex=index;region.setAttribute('aria-busy','false');
   $('#carousel-announcement').textContent='That photograph could not be loaded. Please try again.';
   schedule();return;
  }
  if(token!==request)return;
  // Only the latest selection may update the image, caption, counter, and viewer together.
  region.querySelectorAll('.carousel-previous').forEach(el=>el.remove());
  image.getAnimations().forEach(animation=>animation.cancel());
  const old=image,animate=old.complete&&old.naturalWidth>0&&old.currentSrc!==nextImage.src&&!reduced.matches;
  nextImage.id='hero-photo';old.replaceWith(nextImage);image=nextImage;
  if(animate){
   old.removeAttribute('id');old.setAttribute('aria-hidden','true');old.classList.add('carousel-previous');
   image.before(old);
   image.animate([{opacity:0},{opacity:1}],{duration:650,easing:'ease-out'});
   old.animate([{opacity:1},{opacity:0}],{duration:650,fill:'forwards'}).finished.catch(()=>{}).finally(()=>old.remove());
  }
  index=target;loading=false;region.setAttribute('aria-busy','false');
  $('#hero-caption').textContent=p.title;
  if($('.hero-byline'))$('.hero-byline').textContent=[p.location,p.country].filter(Boolean).join(', ');
  $('#hero-open').setAttribute('aria-label','Open featured photograph '+(index+1)+' of '+slides.length);
  $('#carousel-count').textContent=String(index+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0');
  [...(dots?.children||[])].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  if(announce)$('#carousel-announcement').textContent=p.location+', photograph '+(index+1)+' of '+slides.length;
  const preload=new Image();preload.src=photoSrc(slides[(index+1)%slides.length]);schedule();
 }
 function syncPlay(){const b=$('#carousel-play');b.textContent=paused?'Play':'Pause';b.setAttribute('aria-label',paused?'Play slideshow':'Pause slideshow');b.setAttribute('aria-pressed',String(paused));schedule();}
 $('#carousel-prev').onclick=()=>show(requestedIndex-1);$('#carousel-next').onclick=()=>show(requestedIndex+1);
 $('#carousel-play').onclick=()=>{paused=!paused;syncPlay();};
 $('#hero-open').onclick=()=>{if(swiped){swiped=false;return;}clearInterval(timer);openPhoto(slides[index],slides);};
 $('#lightbox').addEventListener('close',schedule);
 controls.addEventListener('mouseenter',()=>{hovering=true;schedule();});controls.addEventListener('mouseleave',()=>{hovering=false;schedule();});
 region.addEventListener('focusin',()=>{focused=true;schedule();});region.addEventListener('focusout',e=>{if(!region.contains(e.relatedTarget)){focused=false;schedule();}});
 region.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();show(requestedIndex+(e.key==='ArrowRight'?1:-1));}});
 region.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;startY=e.touches[0].clientY;swiped=false;},{passive:true});
 region.addEventListener('touchcancel',()=>{startX=null;startY=null;},{passive:true});
 region.addEventListener('touchend',e=>{if(startX!==null){const distance=e.changedTouches[0].clientX-startX;const vertical=e.changedTouches[0].clientY-startY;if(Math.abs(distance)>55&&Math.abs(distance)>Math.abs(vertical)*1.3){swiped=true;show(requestedIndex+(distance<0?1:-1));}startX=null;startY=null;}},{passive:true});
 if('IntersectionObserver' in window)new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;schedule();},{threshold:.05}).observe(region);
 document.addEventListener('visibilitychange',schedule);reduced.addEventListener('change',()=>{if(reduced.matches){paused=true;syncPlay();}});
 show(0,false);syncPlay();
}

async function init(){
 const [response,landResponse]=await Promise.all([fetch('generated/content.json',{cache:'no-cache'}),mapSurface?fetch('assets/world-atlas.json'):null]);
 if(!response.ok)throw Error('Photo data could not be loaded. Run python3 scripts/sync_content.py.');
 const content=await response.json();
 catalogPhotos=content.photos;photos=catalogPhotos.filter(p=>p.atlas!==false);
 countryAlbums=content.countryAlbums;featuredGalleries=content.galleries.filter(g=>g.featured);
 renderCountryDirectory();
 if($('#hero-photo'))initCarousel(content.carousel);
 if(mapSurface){
  const filterGroup=$('.filters');
  for(const name of new Set(photos.flatMap(p=>[p.category,...(p.collections||[])]))){
   if([...filterGroup.querySelectorAll('[data-category]')].some(b=>b.dataset.category===name))continue;
   const button=document.createElement('button');button.type='button';button.dataset.category=name;button.textContent=name;button.setAttribute('aria-pressed','false');button.onclick=()=>{category=name;showWorldOverview();};filterGroup.append(button);
  }
  overviewMap=AtlasOverview.create(await landResponse.json(),mapSurface);
  atlasProjection=overviewMap.projection;
 }
 if($('#journal-stories'))renderStories();
 renderCollection();initReveal();
 if(mapSurface){const requested=new URLSearchParams(location.search).get('category');if([...document.querySelectorAll('.filters [data-category]')].some(b=>b.dataset.category===requested))category=requested;render();initVectorAtlas();}
 $('#year').textContent=new Date().getFullYear();
}
init().catch(error=>{console.error(error);if($('#photography-status'))$('#photography-status').textContent='The galleries could not be loaded. Please reload.';if($('#collection-grid'))$('#collection-grid').textContent='The photographs could not be loaded. Please reload.';if($('#atlas-message')){$('#atlas-message').textContent='The photographs could not be loaded. Please reload.';$('#atlas-message').className='atlas-error';}});

function vectorData(){
 return {type:'FeatureCollection',features:mapPlaces.map((g,i)=>({type:'Feature',id:i,geometry:{type:'Point',coordinates:[g.photos.reduce((n,p)=>n+p.lng,0)/g.photos.length,g.photos.reduce((n,p)=>n+p.lat,0)/g.photos.length]},properties:{location:g.name,count:g.photos.length,country:g.photos[0].country,cover:g.photos[0].thumbnailSrc||photoSrc(g.photos[0])}}))};
}
function updateVectorPoints(){
 if(!vectorReady)return;
 vectorMap.getSource('photographs')?.setData(vectorData());
 vectorMap.setFilter('selected-location',['==',['get','location'],place||'']);
}
function atlasCameraPadding(selected=false){
 const mobile=matchMedia('(max-width:650px)').matches,container=$('#detailed-map'),panel=$('#place-preview');
 if(!selected)return{top:0,left:0,right:0,bottom:0};
 if(mobile)return{top:104,left:20,right:20,bottom:Math.min(panel.offsetHeight+16,Math.max(140,container.clientHeight-140))};
 return{top:120,left:24,right:panel.offsetWidth+56,bottom:24};
}
function fitWorldVectorMap(duration=0){
 vectorExplored=false;
 vectorMap.fitBounds([[-175,-55],[180,75]],{padding:atlasCameraPadding(),maxZoom:1.5,duration});
}
function focusVectorMap(){
 if(!vectorReady)return;
 const duration=document.hidden||!document.hasFocus()||matchMedia('(prefers-reduced-motion: reduce)').matches?0:950;
 const selected=photos.find(p=>p.location===place&&hasLocation(p));
 if(selected){
  vectorExplored=true;
  const zoom={Landmark:13,City:10,'City-level':10,Park:8,Region:7,Country:3}[selected.coordinatePrecision]||10;
  vectorMap.flyTo({center:[selected.lng,selected.lat],zoom,padding:atlasCameraPadding(true),duration,essential:false});
 }else fitWorldVectorMap(duration);
}
function initVectorAtlas(){
 if(!mapSurface||!window.maplibregl)return;
 const container=$('#detailed-map'),panel=container.closest('.map-panel');
 let readyTimer;
 function fallback(){
  if(vectorReady)return;
  clearTimeout(readyTimer);container.hidden=true;panel.classList.remove('is-detailed-map');mapSurface.removeAttribute('aria-hidden');
  if(vectorMap){vectorMap.remove();vectorMap=null;}
 }
 async function selectFeature(feature){
  if(!feature)return;
  vectorExplored=true;
  if(feature.properties.cluster_id!==undefined){
   try{
    const zoom=await vectorMap.getSource('photographs').getClusterExpansionZoom(feature.properties.cluster_id);
    vectorMap.easeTo({center:feature.geometry.coordinates,zoom:Math.min(17,zoom+.35),padding:atlasCameraPadding(),duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:700});
   }catch(error){console.warn('Map cluster could not be expanded',error);}
  }else{place=feature.properties.location;vectorCameraPlace=undefined;cameraPlace=undefined;render();}
 }
 try{
  container.hidden=false;
  vectorMap=new maplibregl.Map({container,style:'https://tiles.openfreemap.org/styles/dark',center:[10,20],zoom:0,minZoom:-1.5,maxZoom:17,attributionControl:true,renderWorldCopies:false,dragRotate:false,touchPitch:false});
  readyTimer=setTimeout(fallback,15000);
  new ResizeObserver(()=>{if(vectorMap)vectorMap.resize();}).observe(container);
  const canvas=vectorMap.getCanvas();
  canvas.setAttribute('aria-label','Photographic atlas. Drag to pan and scroll or pinch to zoom. Arrow keys pan; plus and minus zoom; Enter selects the nearest visible pin.');
  vectorMap.once('load',()=>{
   clearTimeout(readyTimer);vectorReady=true;container.setAttribute('aria-hidden','true');
   vectorMap.addSource('photographs',{type:'geojson',data:vectorData(),cluster:true,clusterMaxZoom:13,clusterRadius:45,clusterProperties:{photos:['+',['get','count']]}});
   vectorMap.addLayer({id:'place-clusters',type:'circle',source:'photographs',filter:['has','point_count'],paint:{'circle-color':'#d2b27b','circle-radius':['step',['get','photos'],17,50,21,200,26],'circle-stroke-color':'#eed6aa','circle-stroke-opacity':.22,'circle-stroke-width':5}});
   vectorMap.addLayer({id:'place-counts',type:'symbol',source:'photographs',filter:['has','point_count'],layout:{'text-field':['to-string',['get','photos']],'text-font':['Noto Sans Regular'],'text-size':11,'text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#14202a'}});
   vectorMap.addLayer({id:'place-hits',type:'circle',source:'photographs',filter:['!',['has','point_count']],paint:{'circle-radius':19,'circle-color':'#d2b27b','circle-opacity':0}});
   vectorMap.addLayer({id:'place-points',type:'circle',source:'photographs',filter:['!',['has','point_count']],paint:{'circle-radius':['case',['>', ['get','count'],1],14,6],'circle-color':'#e7c68b','circle-stroke-color':'#15232d','circle-stroke-width':2}});
   vectorMap.addLayer({id:'selected-location',type:'circle',source:'photographs',filter:['==',['get','location'],place||''],paint:{'circle-radius':['case',['>', ['get','count'],1],17,10],'circle-color':'#edcc8d','circle-stroke-color':'#fff4dd','circle-stroke-width':2}});
   vectorMap.addLayer({id:'place-photo-counts',type:'symbol',source:'photographs',filter:['all',['!',['has','point_count']],['>',['get','count'],1]],layout:{'text-field':['to-string',['get','count']],'text-font':['Noto Sans Regular'],'text-size':11,'text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#14202a'}});
   vectorMap.addLayer({id:'place-labels',type:'symbol',source:'photographs',filter:['!',['has','point_count']],minzoom:5,layout:{'text-field':['get','location'],'text-font':['Noto Sans Regular'],'text-size':11,'text-offset':[0,1.5],'text-anchor':'top','text-max-width':15},paint:{'text-color':'#d7e0df','text-halo-color':'#111b24','text-halo-width':1.5}});
   vectorMap.on('click','place-clusters',event=>selectFeature(event.features?.[0]));
   vectorMap.on('click','place-hits',event=>selectFeature(event.features?.[0]));
   ['place-clusters','place-hits'].forEach(layer=>{
    vectorMap.on('mouseenter',layer,()=>{canvas.style.cursor='pointer';});
    vectorMap.on('mouseleave',layer,()=>{canvas.style.cursor='';});
   });
   vectorMap.on('click',event=>{
    if(place&&!vectorMap.queryRenderedFeatures(event.point,{layers:['place-clusters','place-hits']}).length)closePlacePreview();
   });
   canvas.addEventListener('keydown',event=>{
    if(event.key!=='Enter')return;
    event.preventDefault();
    const features=vectorMap.queryRenderedFeatures({layers:['place-clusters','place-points']});
    const center={x:canvas.clientWidth/2,y:canvas.clientHeight/2};
    features.sort((a,b)=>{
     const pa=vectorMap.project(a.geometry.coordinates),pb=vectorMap.project(b.geometry.coordinates);
     return Math.hypot(pa.x-center.x,pa.y-center.y)-Math.hypot(pb.x-center.x,pb.y-center.y);
    });
    selectFeature(features[0]);
   });
   vectorMap.on('zoomend',()=>{if(detailActive&&vectorMap.getZoom()<1.8)showWorldOverview();});
   vectorMap.on('dragstart',()=>{vectorExplored=true;});
   vectorMap.on('zoomstart',event=>{if(event.originalEvent)vectorExplored=true;});
   vectorMap.on('moveend',()=>{if(detailActive)$('#reset-map').hidden=!place&&!vectorExplored;});
   vectorMap.resize();vectorCameraPlace=place;if(place){const p=photos.find(p=>p.location===place&&hasLocation(p));if(p)showDetail([p.lng,p.lat],4);focusVectorMap();}
  });
  vectorMap.on('error',event=>{if(!vectorReady&&event.error?.message?.includes('style'))fallback();});
 }catch(error){fallback();console.warn('Detailed map unavailable; using the outline map.',error);}
}
