'use strict';

document.querySelectorAll('.portrait-carousel').forEach(carousel=>{
 const stage=carousel.querySelector('.portrait-stage');
 const images=[...stage.querySelectorAll('img')];
 const dots=[...carousel.querySelectorAll('.portrait-dots button')];
 const status=carousel.querySelector('.portrait-status');
 let current=0,gesture=null;
 function show(index){
  current=(index%images.length+images.length)%images.length;
  images.forEach((image,i)=>{image.hidden=i!==current;});
  dots.forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===current)));
  status.textContent='Portrait '+(current+1)+' of '+images.length;
 }
 carousel.querySelector('.portrait-prev').onclick=()=>show(current-1);
 carousel.querySelector('.portrait-next').onclick=()=>show(current+1);
 dots.forEach((dot,i)=>{dot.onclick=()=>show(i);});
 carousel.addEventListener('keydown',event=>{
  const index=event.key==='ArrowLeft'?current-1:event.key==='ArrowRight'?current+1:event.key==='Home'?0:event.key==='End'?images.length-1:null;
  if(index!==null){event.preventDefault();show(index);}
 });
 stage.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY};
  stage.setPointerCapture(event.pointerId);
 });
 stage.addEventListener('pointerup',event=>{
  if(!gesture||event.pointerId!==gesture.id)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  gesture=null;
  if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);
  if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))show(current+(dx<0?1:-1));
 });
 stage.addEventListener('pointercancel',()=>{gesture=null;});
 for(const type of ['contextmenu','dragstart']){
  carousel.addEventListener(type,event=>{if(event.target.closest('img'))event.preventDefault();});
 }
 const preload=()=>images.slice(1).forEach(image=>{image.loading='eager';});
 if(document.readyState==='complete')preload();else window.addEventListener('load',preload,{once:true});
});
