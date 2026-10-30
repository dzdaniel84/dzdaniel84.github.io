/* Robinson overview geometry and labels, independent of the detailed tile map. */
(function(root){
 'use strict';
 const overlaps=(a,b,gap=5)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
 function labelFits(country,scale,width,height,font=11){
  return country.area*scale*scale>=width*height*1.2 &&
   (country.bounds[1][0]-country.bounds[0][0])*scale>=width*.72 &&
   (country.bounds[1][1]-country.bounds[0][1])*scale>=font*1.45;
 }
 function create(geography,surface){
  const ns='http://www.w3.org/2000/svg',land=surface.querySelector('#map-land');
  const projection=d3.geoRobinson().fitExtent([[8,5],[1072,545]],{type:'Sphere'});
  const path=d3.geoPath(projection).digits(2),countries=[],water=[],cities=[];
  function shape(parent,geometry,cls){
   const element=document.createElementNS(ns,'path');element.setAttribute('d',path(geometry));
   if(cls)element.setAttribute('class',cls);parent.append(element);return element;
  }
  function group(cls){const g=document.createElementNS(ns,'g');g.setAttribute('class',cls);g.setAttribute('aria-hidden','true');land.append(g);return g;}
  function normalize(feature){
   if(d3.geoArea(feature)<=2*Math.PI)return;
   const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
   polygons.forEach(rings=>rings.forEach(ring=>ring.reverse()));
  }
  shape(land,{type:'Sphere'},'map-ocean');
  shape(land,d3.geoGraticule10(),'map-graticule');
  const borders=group('map-countries');
  geography.countries.features.forEach(feature=>{
   normalize(feature);shape(borders,feature);
   const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
   const mainland=polygons.map(coordinates=>({type:'Polygon',coordinates})).sort((a,b)=>d3.geoArea(b)-d3.geoArea(a))[0];
   const props=feature.properties,anchor=Number.isFinite(props.LABEL_X)&&Number.isFinite(props.LABEL_Y)?[props.LABEL_X,props.LABEL_Y]:d3.geoCentroid(mainland);
   countries.push({name:props.NAME,point:projection(anchor),area:path.area(mainland),bounds:path.bounds(mainland),mainland});
  });
  const lakes=group('map-lakes');
  geography.lakes.features.forEach(feature=>{normalize(feature);const element=shape(lakes,feature);water.push({element,minZoom:Math.max(0,(feature.properties.min_zoom??2)-1.5)});});
  const rivers=group('map-rivers');
  geography.rivers.features.forEach(feature=>{const element=shape(rivers,feature);water.push({element,minZoom:Math.max(0,(feature.properties.min_zoom??3)-1.5)});});
  const labels=group('map-country-labels');
  countries.sort((a,b)=>b.area-a.area).forEach(country=>{
   const text=document.createElementNS(ns,'text');text.textContent=country.name;text.setAttribute('dominant-baseline','middle');labels.append(text);country.element=text;
  });
  const cityLabels=group('map-city-labels');
  geography.cities.features.sort((a,b)=>b.properties.pop_max-a.properties.pop_max).forEach(feature=>{
   const g=document.createElementNS(ns,'g'),dot=document.createElementNS(ns,'circle'),text=document.createElementNS(ns,'text');
   dot.setAttribute('r','1.8');text.setAttribute('x','7');text.setAttribute('y','3');text.textContent=feature.properties.name;
   g.append(dot,text);cityLabels.append(g);cities.push({element:g,name:feature.properties.name,point:projection(feature.geometry.coordinates),minZoom:Math.max(2.4,feature.properties.min_zoom-1)});
  });
  function update(bounds){
   const matrix=surface.getScreenCTM();if(!matrix)return;
   const scale=matrix.a,rect=surface.getBoundingClientRect(),zoom=Math.log2(1080/bounds[2])+1;
   const screen=point=>({x:point[0]*matrix.a+matrix.e,y:point[1]*matrix.d+matrix.f});
   const occupied=Array.from(surface.querySelectorAll('.map-point')).map(el=>{
    const p=screen([Number(el.dataset.x),Number(el.dataset.y)]);
    return{x:p.x-15,y:p.y-15,width:30,height:30};
   });
   function visible(box){return box.x>=rect.left+5&&box.y>=rect.top+5&&box.x+box.width<=rect.right-5&&box.y+box.height<=rect.bottom-5;}
   // Read text metrics together before changing transforms to avoid repeated layout.
   countries.forEach(country=>{country.width=country.element.getComputedTextLength()||country.name.length*6.3;});
   for(const country of countries){
    const {element,point,width}=country,p=screen(point),font=11;
    let placement=null;
    if(labelFits(country,scale,width,14,font)){
     for(const [dx,dy] of [[0,0],[0,-28],[0,28],[-24,0],[24,0],[-24,-20],[24,-20],[-24,20],[24,20],[0,-40],[0,40],[-48,0],[48,0],[-48,-20],[48,-20],[-48,20],[48,20]]){
      const anchor=[point[0]+dx/scale,point[1]+dy/scale],coordinate=projection.invert(anchor);
      const box={x:p.x+dx-width/2,y:p.y+dy-7,width,height:14};
      if(visible(box)&&!occupied.some(other=>overlaps(box,other,5))&&coordinate&&d3.geoContains(country.mainland,coordinate)){
       placement={anchor,box};break;
      }
     }
    }
    element.setAttribute('transform','translate('+(placement?.anchor||point).join(',')+') scale('+(1/scale)+')');
    element.classList.toggle('is-visible',!!placement);
    if(placement)occupied.push(placement.box);
   }
   for(const city of cities){
    const {element,point}=city,p=screen(point),width=city.name.length*5.8+8,box={x:p.x+5,y:p.y-7,width,height:14};
    element.setAttribute('transform','translate('+point.join(',')+') scale('+(1/scale)+')');
    const show=zoom>=city.minZoom&&visible(box)&&!occupied.some(other=>overlaps(box,other,7));
    element.classList.toggle('is-visible',show);if(show)occupied.push(box);
   }
   water.forEach(({element,minZoom})=>{element.style.display=zoom>=minZoom?'':'none';});
  }
  return{projection,update};
 }
 root.AtlasOverview={create,labelFits,overlaps};
})(globalThis);
