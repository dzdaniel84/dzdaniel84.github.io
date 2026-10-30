// Keep saved prototype URLs useful while presenting clean directory URLs.
if (location.pathname.endsWith('.html') && !location.pathname.endsWith('/404.html')) {
 const name = location.pathname.split('/').pop().slice(0,-5);
 const slug = name.startsWith('country-') ? name.slice(8) : ({photography:'albums','world-albums':'country-albums',work:'about'}[name] || name);
 const path = name === 'index' ? '/' : '/' + slug + '/';
 location.replace(path + location.search + (location.hash || (name === 'work' ? '#engineering' : '')));
}
// Keep phone navigation compact without hiding links when JavaScript is unavailable.
function initNavigation(){
 const header=document.querySelector('.site-header'),button=document.querySelector('.menu-toggle'),nav=document.querySelector('#main-navigation');
 if(!header||!button||!nav)return;
 button.hidden=false;header.classList.add('has-menu');
 const setOpen=open=>{header.classList.toggle('nav-open',open);button.setAttribute('aria-expanded',String(open));button.innerHTML=(open?'Close':'Menu')+' <span aria-hidden="true">'+(open?'−':'＋')+'</span>';};
 button.addEventListener('click',()=>setOpen(button.getAttribute('aria-expanded')!=='true'));
 nav.addEventListener('click',e=>{if(e.target.closest('a'))setOpen(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&header.classList.contains('nav-open')){setOpen(false);button.focus();}});
 document.addEventListener('click',e=>{if(!header.contains(e.target))setOpen(false);});
 matchMedia('(max-width:760px)').addEventListener('change',()=>setOpen(false));
}
initNavigation();
