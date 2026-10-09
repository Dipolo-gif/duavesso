// Gráficos do painel da duavesso e de Minha Marca, em SVG feito à mão (a CSP do site não libera
// bibliotecas de fora). Regras: um eixo só; barras finas (até 24px) com ponta arredondada e base reta;
// linhas de 2px; legenda quando há duas séries; dica ao passar o mouse (montada com textContent) e
// a mesma informação numa tabela, para quem não usa o mouse.
// Cores validadas para fundo claro (validate_palette.js): azul #3a5bff e laranja #eb6834.
export const VIZ={in:'#3a5bff',out:'#eb6834',current:'#3a5bff',previous:'#a3a7b0'};
const W=640,H=232,PL=70,PR=10,PT=14,PB=30;
const vizEsc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tipAttr=(title,rows)=>vizEsc(JSON.stringify({title,rows}));

// Eixo com números redondos: 0 até um teto "bonito", em 4 ou 5 passos
export function niceScale(max){
 if(!(max>0))return {max:1,ticks:[0]};
 const raw=max/4,p=10**Math.floor(Math.log10(raw)),n=raw/p;
 const step=(n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p,top=Math.ceil(max/step)*step,ticks=[];
 for(let v=0;v<=top+step/1e6;v+=step)ticks.push(Math.round(v));
 return {max:top,ticks};
}
// Coluna com 4px de raio no topo e base reta (cresce a partir da linha de base)
function colPath(x,y,w,base){
 const h=base-y;if(h<=0.5)return '';
 const r=Math.min(4,h,w/2);
 return `M${x},${base}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${base}Z`;
}
function legendHTML(series,shape){
 return `<div class="viz-legend">${series.map(s=>`<span><i class="viz-key ${shape}${s.dashed?' dashed':''}" style="--k:${s.color}"></i>${vizEsc(s.name)}</span>`).join('')}</div>`;
}
function gridSVG(scale,y,axis){
 return scale.ticks.map(t=>`<line class="viz-grid" x1="${PL}" x2="${W-PR}" y1="${y(t)}" y2="${y(t)}"/><text class="viz-axis" x="${PL-8}" y="${y(t)+4}" text-anchor="end">${vizEsc(axis(t))}</text>`).join('');
}
function xLabelsSVG(groups,cx){
 const every=Math.max(1,Math.ceil(groups.length/8));
 return groups.map((g,i)=>i%every===0||i===groups.length-1&&groups.length<=12?`<text class="viz-axis" x="${cx(i)}" y="${H-10}" text-anchor="middle">${vizEsc(g.label)}</text>`:'').join('');
}
function tableHTML(caption,head,rows){
 return `<details class="viz-table"><summary>Ver em tabela</summary><table><caption class="sr-only">${vizEsc(caption)}</caption><thead><tr>${head.map(h=>`<th scope="col">${vizEsc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>i?`<td>${vizEsc(c)}</td>`:`<th scope="row">${vizEsc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table></details>`;
}

// Colunas agrupadas: groups=[{label,title,values:[...],extra:[[nome,valor]]}], series=[{name,color}]
export function columnsChart({label,groups,series,format,axis}){
 const max=Math.max(0,...groups.flatMap(g=>g.values)),scale=niceScale(max);
 const plotW=W-PL-PR,base=H-PB,slot=plotW/Math.max(groups.length,1);
 const bw=Math.max(2,Math.min(24,(slot*0.72-2*(series.length-1))/series.length));
 const y=v=>base-(v/scale.max)*(base-PT),cx=i=>PL+slot*i+slot/2;
 const focusable=groups.length<=14;
 const bars=groups.map((g,i)=>{
  const total=bw*series.length+2*(series.length-1),x0=cx(i)-total/2;
  const marks=g.values.map((v,s)=>{const d=colPath(x0+s*(bw+2),y(v),bw,base);return d?`<path d="${d}" fill="${series[s].color}"/>`:'';}).join('');
  const rows=[...series.map((s,k)=>[s.name,format(g.values[k]),s.color]),...(g.extra||[]).map(([n,v])=>[n,v,''])];
  return `<g>${marks}</g><rect class="viz-hit" x="${PL+slot*i}" y="${PT}" width="${slot}" height="${base-PT}" data-tip="${tipAttr(g.title||g.label,rows)}"${focusable?' tabindex="0"':''}/>`;
 }).join('');
 return `<figure class="viz" aria-label="${vizEsc(label)}">${legendHTML(series,'rect')}<div class="viz-plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${vizEsc(label)}">${gridSVG(scale,y,axis)}<line class="viz-base" x1="${PL}" x2="${W-PR}" y1="${base}" y2="${base}"/>${bars}${xLabelsSVG(groups,cx)}</svg><div class="viz-tip" hidden></div></div>${tableHTML(label,['Período',...series.map(s=>s.name),...(groups[0]?.extra||[]).map(e=>e[0])],groups.map(g=>[g.title||g.label,...g.values.map(format),...(g.extra||[]).map(e=>e[1])]))}</figure>`;
}

// Linhas: points=[{label,title,values:[...]}], series=[{name,color,dashed}] (a primeira é a principal)
export function lineChart({label,points,series,format,axis}){
 const max=Math.max(0,...points.flatMap(p=>p.values)),scale=niceScale(max);
 const plotW=W-PL-PR,base=H-PB,n=points.length,step=n>1?plotW/(n-1):0;
 const y=v=>base-(v/scale.max)*(base-PT),cx=i=>n>1?PL+step*i:PL+plotW/2;
 const lines=series.map((s,k)=>`<polyline points="${points.map((p,i)=>`${cx(i).toFixed(1)},${y(p.values[k]).toFixed(1)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dashed?' stroke-dasharray="5 4"':''}/>`).reverse().join('');
 const last=n-1,end=n?`<circle cx="${cx(last)}" cy="${y(points[last].values[0])}" r="4" fill="${series[0].color}" stroke="#fff" stroke-width="2"/>`:'';
 const band=n>1?step:plotW,focusable=n<=14;
 const hits=points.map((p,i)=>`<rect class="viz-hit viz-band" x="${Math.max(PL,cx(i)-band/2)}" y="${PT}" width="${band}" height="${base-PT}" data-cx="${cx(i)}" data-tip="${tipAttr(p.title||p.label,series.map((s,k)=>[s.name,format(p.values[k]),s.color]))}"${focusable?' tabindex="0"':''}/>`).join('');
 return `<figure class="viz" aria-label="${vizEsc(label)}">${legendHTML(series,'line')}<div class="viz-plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${vizEsc(label)}">${gridSVG(scale,y,axis)}<line class="viz-base" x1="${PL}" x2="${W-PR}" y1="${base}" y2="${base}"/><line class="viz-cross" x1="0" x2="0" y1="${PT}" y2="${base}" style="display:none"/>${lines}${end}${hits}${xLabelsSVG(points,cx)}</svg><div class="viz-tip" hidden></div></div>${tableHTML(label,['Período',...series.map(s=>s.name)],points.map(p=>[p.title||p.label,...p.values.map(format)]))}</figure>`;
}

// Barras horizontais de um tom só (quanto cada categoria pesa): rows=[{label,value}]
export function hbars(rows,format,color=VIZ.in){
 if(!rows.length)return '<p class="viz-empty">Nada neste período.</p>';
 const max=Math.max(...rows.map(r=>r.value),1);
 return `<ul class="viz-hbars">${rows.map(r=>`<li><span class="viz-hl">${vizEsc(r.label)}</span><span class="viz-ht"><i style="width:${Math.max(2,r.value/max*100).toFixed(1)}%;background:${color}"></i></span><b>${vizEsc(format(r.value))}</b></li>`).join('')}</ul>`;
}

// Dica: segue o ponteiro (e o foco do teclado), mostra todas as séries do ponto e realça a faixa
export function wireCharts(root){
 root.querySelectorAll('.viz-plot').forEach(plot=>{
  if(plot.dataset.wired)return;plot.dataset.wired='1';
  const tip=plot.querySelector('.viz-tip'),cross=plot.querySelector('.viz-cross'),svg=plot.querySelector('svg');
  const show=hit=>{
   let d;try{d=JSON.parse(hit.dataset.tip);}catch{return;}
   const title=document.createElement('strong');title.textContent=d.title;tip.replaceChildren(title);
   for(const [name,value,color] of d.rows){
    const row=document.createElement('div');row.className='viz-tip-row';
    const key=document.createElement('i');if(color)key.style.background=color;else key.className='none';
    const v=document.createElement('b');v.textContent=value;const n=document.createElement('span');n.textContent=name;
    row.append(key,v,n);tip.append(row);
   }
   tip.hidden=false;
   const box=plot.getBoundingClientRect(),hb=hit.getBoundingClientRect(),half=(tip.offsetWidth||140)/2;
   const x=hb.left+hb.width/2-box.left;tip.style.left=`${Math.min(Math.max(x,half),Math.max(half,box.width-half))}px`;
   if(cross&&hit.dataset.cx){cross.setAttribute('x1',hit.dataset.cx);cross.setAttribute('x2',hit.dataset.cx);cross.style.display='';}
   svg.querySelectorAll('.viz-hit.on').forEach(h=>h.classList.remove('on'));hit.classList.add('on');
  };
  const hide=()=>{tip.hidden=true;if(cross)cross.style.display='none';svg.querySelectorAll('.viz-hit.on').forEach(h=>h.classList.remove('on'));};
  svg.querySelectorAll('.viz-hit').forEach(h=>{h.addEventListener('pointerenter',()=>show(h));h.addEventListener('focus',()=>show(h));h.addEventListener('blur',hide);});
  plot.addEventListener('pointerleave',hide);
 });
}
