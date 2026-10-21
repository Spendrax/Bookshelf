const $=id=>document.getElementById(id),LS='bookshelf-hosted-v1';
/* ---------- languages ---------- */
const LANGS={en:'English',fr:'Fran\u00e7ais',es:'Espa\u00f1ol',ht:'Krey\u00f2l ayisyen',pt:'Portugu\u00eas',de:'Deutsch',it:'Italiano'};
let lang='';try{lang=localStorage.getItem('bookshelf-lang')||''}catch(e){}
if(!LANGS[lang]){const n=(navigator.language||'en').slice(0,2).toLowerCase();lang=LANGS[n]?n:'en'}
function L(k,v){let s=(TR[lang]&&TR[lang][k])||TR.en[k]||k;if(v)s=s.replace(/\{(\w+)\}/g,(m,n)=>v[n]!=null?v[n]:m);return s}
function applyLang(){
 document.documentElement.lang=lang;
 document.querySelectorAll('[data-i18n]').forEach(el=>{const tn=[...el.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());if(!tn)return;if(!el.dataset.k)el.dataset.k=el.getAttribute('data-i18n')||tn.textContent.trim();const t=tn.textContent;tn.textContent=t.match(/^\s*/)[0]+L(el.dataset.k)+t.match(/\s*$/)[0]});
 document.querySelectorAll('[data-i18n-ph]').forEach(el=>{if(!el.dataset.kph)el.dataset.kph=el.getAttribute('data-i18n-ph')||el.placeholder;el.placeholder=L(el.dataset.kph)});
 document.querySelectorAll('[data-i18n-aria]').forEach(el=>{if(!el.dataset.ka)el.dataset.ka=el.getAttribute('data-i18n-aria')||el.getAttribute('aria-label');el.setAttribute('aria-label',L(el.dataset.ka))})}
let books=[],cur=null,draft={},timer,booksReady=false;
/* a backup made by hand or by another app can have odd fields: one bad book must never blank the whole shelf */
function fixBooks(a){return (Array.isArray(a)?a:[]).filter(b=>b&&typeof b==='object'&&!Array.isArray(b)).map((b,i)=>{
 b.title=String(b.title==null?'':b.title);if(b.author!=null)b.author=String(b.author);b.id=String(b.id||'b'+Date.now().toString(36)+i);
 ['tags','genres'].forEach(k=>{if(b[k]!=null&&!Array.isArray(b[k]))b[k]=typeof b[k]==='string'?b[k].split(',').map(x=>x.trim()).filter(Boolean):[]});
 if(b.reads!=null)b.reads=Array.isArray(b.reads)?b.reads.filter(r=>r&&typeof r==='object'):[];
 ['pages','page','seriesNo','seriesOf','stars'].forEach(k=>{if(b[k]!=null&&b[k]!==''){if(isFinite(+b[k]))b[k]=+b[k];else delete b[k]}});return b})}
try{books=fixBooks(JSON.parse(localStorage.getItem(LS)||'[]'))}catch(e){}
let useIDB=false;
function store(){keepSafe();markChange();
 if(useIDB){IDB.set('books',JSON.parse(JSON.stringify(books))).catch(()=>{useIDB=false;saveLS()});return}saveLS()}
function saveLS(){try{localStorage.setItem(LS,JSON.stringify(books))}catch(e){toast(L('Storage full: export a backup and remove some images'))}}
function toast(m){const t=$('toast');t.textContent=m;t.style.display='block';setTimeout(()=>t.style.display='none',3000)}
/* books of the same series share one height (the first book's); pocket editions are shorter */
let SERH={};const serKey=b=>(b.series||'').trim().toLowerCase();
function computeSeriesH(){SERH={};const g={};books.forEach(b=>{const k=serKey(b);if(k)(g[k]=g[k]||[]).push(b)});
 for(const k in g){const l=g[k].slice().sort((a,c)=>((a.seriesNo||999)-(c.seriesNo||999))||((a.createdAt||0)-(c.createdAt||0)));SERH[k]=l[0].h||180}}
const effH=b=>(serKey(b)&&SERH[serKey(b)])||b.h||180;
const sw=b=>Math.round(22+((b.w||40)-30)*.45),/* the format decides how tall a book stands: hardcovers tallest, then paperbacks, ebooks, pocket editions, and audiobooks shortest (like a CD case). No format, or "other": its own height, as before */
FMTH={hardcover:258,paperback:232,ebook:214,pocket:196,audio:178},sh=b=>FMTH[b.format]||Math.round(205+(effH(b)-150)*.9);
const st=b=>b.status||'read',today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const FR4={.25:'\u00bc',.5:'\u00bd',.75:'\u00be'},fq=v=>Math.round((v%1)*4)/4;
const fmtStars=v=>(Math.floor(v)||(fq(v)?'':'0'))+(FR4[fq(v)]||'');
const starStr=v=>v?'\u2605'.repeat(Math.floor(v))+(FR4[fq(v)]||'')+'\u2606'.repeat(5-Math.ceil(v)):'';
const HTM=['janv.','fevr.','mas','avr.','me','jen','jiy.','out','sept.','okt.','nov.','des.'];
const fmtDate=d=>{try{const x=new Date(d+'T12:00');if(lang==='ht')return x.getDate()+' '+HTM[x.getMonth()]+' '+x.getFullYear();return x.toLocaleDateString(lang,{day:'numeric',month:'short',year:'numeric'})}catch(e){return d}};
const hue=t=>{let h=7;for(const c of t.toLowerCase())h=(h*31+c.charCodeAt(0))%360;return h};
function migrate(){books.forEach(b=>{if(b.stars==null&&b.rating)b.stars=Math.max(.5,Math.round(+b.rating)/2);if(!Array.isArray(b.tags))b.tags=[]})}
const lum=h=>{const n=parseInt(h.slice(1),16);return .299*(n>>16)+.587*(n>>8&255)+.114*(n&255)};
async function shrink(blob,max=520){const bm=await createImageBitmap(blob),s=Math.min(1,max/Math.max(bm.width,bm.height)),c=document.createElement('canvas');c.width=Math.round(bm.width*s);c.height=Math.round(bm.height*s);c.getContext('2d').drawImage(bm,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.78)}
async function fromUrl(u,mx){const r=await fetch(u);if(!r.ok)throw 0;const b=await r.blob();if(b.size<1500)throw 0;return shrink(b,mx)}
function avgColor(data){return new Promise(res=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=c.height=4;const x=c.getContext('2d');x.drawImage(i,0,0,4,4);const d=x.getImageData(0,0,4,4).data;let r=0,g=0,b=0;for(let k=0;k<64;k+=4){r+=d[k];g+=d[k+1];b+=d[k+2]}
 res('#'+[r,g,b].map(v=>Math.round(v/16*.75).toString(16).padStart(2,'0')).join(''))};i.onerror=()=>res(null);i.src=data})}
function makeSpine(b){
 const s=document.createElement('button');s.className='spine';s.dataset.id=b.id;
 s.style.cssText=`min-width:${sw(b)}px;max-width:62px;min-height:${sh(b)}px;background-color:${b.color};color:${lum(b.color)>150?'#222':'#fff'}`;
 s.setAttribute('aria-label',b.title+(st(b)==='read'&&b.stars?L(', {s} out of 5 stars',{s:fmtStars(b.stars)}):'')+(b.tags&&b.tags.length?L(', tagged {tags}',{tags:b.tags.join(', ')}):''));
 const rateEl=()=>{if(!(st(b)==='read'&&b.stars))return null;const rt=document.createElement('span');rt.className='r';const si=document.createElement('i');si.textContent='\u2605';rt.append(si,fmtStars(b.stars));return rt};
 if(b.spine){s.classList.add('img');s.style.backgroundImage=`url(${b.spine})`;const H=sh(b),W=b.spineAR?Math.max(18,Math.min(62,Math.round(H*b.spineAR))):sw(b);s.style.width=W+'px';s.style.minWidth=W+'px';s.style.height=H+'px';
  if(!b.spineAR){const im=new Image();im.onload=()=>{if(im.naturalHeight){b.spineAR=im.naturalWidth/im.naturalHeight;const W2=Math.max(18,Math.min(62,Math.round(H*b.spineAR)));s.style.width=W2+'px';s.style.minWidth=W2+'px'}};im.src=b.spine}
  /* keep the photo's title visible: the series number and stars sit together at the bottom */
  const ib=document.createElement('span');ib.className='ib';
  if(b.series&&b.seriesNo){const sn=document.createElement('span');sn.className='sn';sn.textContent='#'+b.seriesNo;ib.append(sn)}
  const rt=rateEl();if(rt)ib.append(rt);s.append(document.createElement('span'));if(ib.childNodes.length)s.append(ib)}
 else{const t=document.createElement('span');t.className='t';t.textContent=b.title;
  t.style.height=(sh(b)-42-(st(b)==='read'&&b.stars?8:0))+'px';t.style.fontSize=(b.title.length>70?11:b.title.length>40?12:13)+'px';
  if(b.series&&b.seriesNo){const sn=document.createElement('span');sn.className='sn';sn.textContent='#'+b.seriesNo;s.insertBefore(sn,s.firstChild);t.style.height=(parseFloat(t.style.height)-14)+'px'}
  s.append(t);const rt=rateEl();if(rt)s.append(rt)}
 return s}
function coverEl(b){
 const d=document.createElement('div');d.className='fcv';d.style.backgroundColor=b.color;
 if(b.cover)d.style.backgroundImage=`url(${b.cover})`;
 else{const t=document.createElement('b');t.textContent=b.title;const a=document.createElement('i');a.textContent=b.author||'';d.append(t,a)}
 return d}
function makeCover(b){
 const c=document.createElement('button');c.className='cov';c.dataset.id=b.id;
 c.style.backgroundColor=b.color;c.style.color=lum(b.color)>150?'#222':'#fff';
 if(b.cover){c.classList.add('img');c.style.backgroundImage=`url(${b.cover})`}
 const t=document.createElement('b');t.textContent=b.title;c.append(t);
 const rb=document.createElement('i');rb.className='rb';c.append(rb);
 let lbl=b.title+L(', currently reading');
 if(b.pages>0){const pc=Math.max(0,Math.min(100,Math.round((b.page||0)/b.pages*100)));const pb=document.createElement('span');pb.className='pb';const f=document.createElement('i');f.style.width=pc+'%';pb.append(f);c.append(pb);lbl+=L(', page {p} of {n}',{p:b.page||0,n:b.pages})}
 c.setAttribute('aria-label',lbl);c.title=lbl;
 return c}
function itemFor(b){
 const el=st(b)==='reading'?makeCover(b):makeSpine(b);el.classList.add('bk');
 if(st(b)==='dnf'){el.classList.add('mini');el.style.cssText+=`;width:${Math.round(11+((b.w||40)-30)*.25)}px;height:${FMTH[b.format]?Math.round(FMTH[b.format]*.3):Math.round(58+(effH(b)-150)*.35)}px`}
 if(b.lentTo){el.classList.add('lent');const n=document.createElement('i');n.className='lnote';
  n.innerHTML='<svg viewBox="0 0 26 22" aria-hidden="true"><path d="M13 12 C 2 -2, 24 -6, 15 6 S 13 16, 13 22"/></svg>';
  const tg=document.createElement('b');tg.className='ltag';tg.textContent=b.lentTo;n.append(tg);el.append(n);
  const t=el.classList.contains('spine')&&!el.classList.contains('img')&&!el.classList.contains('mini')&&el.querySelector('.t');if(t){el.style.paddingTop='72px';t.style.height=Math.max(30,parseFloat(t.style.height)-62)+'px'}el.title=L('Lent to {name}',{name:b.lentTo})}
 el.onclick=()=>{if(!justDragged)openModal(b,el)};return el}
const ZONES={dnf:['dnfbox','Books you gave up on go in this crate.'],read:['shelf','Books you’ve finished go here.'],want:['want','Books you want to read go here.'],reading:['reading','Nothing on the go. Drag a book here to start it.']};
/* a shelf is only rebuilt when something on it changed: with a few hundred books, rebuilding all four after every change was slow */
let ZS={};const zRep=(k,v)=>typeof v==='string'&&v.length>160?v.length+':'+v.slice(-24):v;
function renderZone(zone){
 const [id,emptyTxt]=ZONES[zone],box=$(id),list=books.filter(b=>st(b)===zone),wall=zone==='reading',gap=wall?12:2;
 {let sig='';try{sig=[lang,JSON.stringify(look),box.clientWidth,today(),list.map(b=>sw(b)+','+sh(b)+JSON.stringify(b,zRep)).join('|')].join('~')}catch(e){sig=''}
  const z=ZS[zone];if(sig&&z&&z.sig===sig&&z.refs.length===list.length&&box.firstChild&&list.every((b,i)=>b===z.refs[i]))return;ZS[zone]={sig,refs:list}}
 box.replaceChildren();
 if(zone==='dnf'){const row=document.createElement('div');row.className='row dz dnfrow';row.dataset.zone='dnf';
  if(!list.length){const e=document.createElement('div');e.className='dnfhint';e.textContent=L(emptyTxt);row.append(e)}
  list.forEach(b=>row.append(itemFor(b)));box.append(row);$('crlab').textContent=L("Didn't finish")+(list.length?' \u00b7 '+list.length:'');return}
 const meas=document.createElement('div');
 meas.style.cssText=`position:absolute;left:-9999px;top:0;visibility:hidden;display:flex;align-items:flex-end;gap:${gap}px;width:max-content`;
 document.body.append(meas);
 const els=list.map(b=>{const e=itemFor(b);meas.append(e);return e});
 const W=Math.max(wall?90:120,box.clientWidth-(wall?26:34)),rows=[[]];let x=0;
 els.forEach(e=>{const w=e.offsetWidth+gap;if(x+w>W&&rows.at(-1).length){rows.push([]);x=0}rows.at(-1).push(e);x+=w});
 rows.forEach(r=>{
  const row=document.createElement('div');row.className=(wall?'rrow':'row')+' dz';row.dataset.zone=zone;
  if(!list.length){const e=document.createElement('div');e.className=wall?'rempty':'empty';e.textContent=L(emptyTxt);row.append(e)}
  r.forEach(e=>row.append(e));
  if(wall){const bd=document.createElement('div');bd.className='wboard';box.append(row,bd)}
  else{const u=document.createElement('div');u.className='unit';const bd=document.createElement('div');bd.className='board';u.append(row,bd);box.append(u)}});
 meas.remove()}
let dataVer=0,wallVer=-1,wallAt=0,wallLang='';
function render(){
 try{petSync()}catch(e){}
 dataVer++;try{computeSeriesH()}catch(e){}
 migrate();
 ['reading','want','read','dnf'].forEach(renderZone);
 drawTagBar();applyFilter();
 try{const ae=document.activeElement,typing=ae&&/INPUT|TEXTAREA|SELECT/.test(ae.tagName);if(view==='stats'&&!(typing&&$('statsv').contains(ae)))renderStats();else if(view==='goals'&&!(typing&&$('goalsv').contains(ae)))renderGoals();checkBackup();checkWrapped()}catch(e){}
 if(typeof petAfterRender==='function')try{petAfterRender()}catch(e){}
 const n=z=>books.filter(b=>st(b)===z).length,yr=String(new Date().getFullYear()),ty=books.filter(b=>st(b)==='read'&&(b.finished||'').startsWith(yr)).length;
 const parts=[L('{n} read',{n:n('read')})];if(ty)parts[0]+=' '+L('({n} this year)',{n:ty});if(n('reading'))parts.push(L('{n} reading',{n:n('reading')}));if(n('want'))parts.push(L('{n} to read',{n:n('want')}));if(n('dnf'))parts.push(L('{n} not finished',{n:n('dnf')}));
 $('count').textContent=books.length?parts.join(' · ')+(books.length>1?' \u00b7 '+L('drag books between shelves'):''):''
}
function pv(){
 const c=$('color').value;$('book').style.setProperty('--c',c);
 $('fT').textContent=$('title').value||L('Untitled');{const sr=$('series').value.trim(),no=$('seriesNo').value,of=$('seriesOf').value;$('fS').textContent=sr&&no?(of?L('Book {n} of {m} · {s}',{n:no,m:of,s:sr}):L('Book {n} · {s}',{n:no,s:sr})):sr}$('fA').textContent=$('author').value;$('fR').textContent=fStatus==='read'?(starStr(fStars)||L('Not rated yet'))+($('finished').value?'\n'+L('Finished {d}',{d:fmtDate($('finished').value)}):''):fStatus==='dnf'?L("Didn't finish"):fStatus==='reading'?(+$('pages').value?L('p. {p} / {n}',{p:+$('page').value||0,n:$('pages').value}):L('Reading')):L('Want to read');
 const f=$('front');f.classList.toggle('img',!!draft.cover);f.style.backgroundImage=draft.cover?`url(${draft.cover})`:'';
 /* the book takes the proportions of its cover picture, so the picture is shown whole and centred instead of having its edges cut */
 {const bw=w=>$('book').style.setProperty('--bw',w+'px'),src=draft.cover;if(!src){pv.src='';bw(150)}else if(pv.src!==src){pv.src=src;const im=new Image();im.onload=()=>{if(draft.cover===src&&im.naturalHeight)bw(Math.round(Math.max(118,Math.min(190,220*im.naturalWidth/im.naturalHeight))))};im.src=src}}
 /* a long title is made smaller until everything fits on the cover */
 {const t=$('fT');t.style.fontSize='';if(!draft.cover){let s=19;while(f.scrollHeight>f.clientHeight+1&&s>11){s--;t.style.fontSize=s+'px'}}}
 const k=$('bk');k.classList.toggle('img',!!draft.back);k.style.backgroundImage=draft.back?`url(${draft.back})`:'';k.textContent=draft.back?'':($('blurb').value||L('No blurb yet.'));
 $('sp').style.backgroundImage=draft.spine?`url(${draft.spine})`:'';drawStars();
 document.querySelectorAll('.slot').forEach(s=>{const n=s.dataset.k;s.querySelector('.th').style.backgroundImage=draft[n]?`url(${draft[n]})`:'';s.querySelector('.rm').style.display=draft[n]?'':'none'})
}
function buildSlots(){
 const box=$('slots');box.replaceChildren();
 [['cover','Cover'],['back','Back'],['spine','Spine']].forEach(([k,l])=>{
  const s=document.createElement('div');s.className='slot';s.dataset.k=k;
  s.innerHTML='<div class="th"></div>'+L(l)+'<br><button type="button" class="cam">📷 '+L('Photo')+'</button><button type="button" class="up">'+L('Upload')+'</button><button type="button" class="rm">'+L('Remove')+'</button><input type="file" accept="image/*" hidden><input type="file" accept="image/*" capture="environment" hidden>';
  const [f,fc]=s.querySelectorAll('input');s.querySelector('.up').onclick=()=>f.click();s.querySelector('.cam').onclick=()=>fc.click();
  const use=async inp=>{const file=inp.files[0];inp.value='';if(!file)return;try{const cut=await cropPhoto(file,k);if(!cut)return;draft[k]=await shrink(cut,k==='spine'?400:520);if(k==='cover'&&!draft.spine&&!draft.colorSet){const c=await avgColor(draft.cover);if(c)$('color').value=c}pv()}catch(e){toast(L('Could not read that image'))}};
  f.onchange=()=>use(f);fc.onchange=()=>use(fc);
  s.querySelector('.rm').onclick=()=>{delete draft[k];pv()};box.append(s)})
}
let fStatus='read';
function setFormStatus(s,auto){
 fStatus=s;document.querySelectorAll('#seg button').forEach(x=>{const on=x.dataset.s===s;x.classList.toggle('on',on);x.setAttribute('aria-checked',on)});
 $('wishL').hidden=s!=='want';$('ratingL').hidden=s!=='read';$('progL').hidden=s!=='reading'&&s!=='dnf';$('rereadL').hidden=!(cur&&s==='read'&&st(cur)==='read');$('startread').hidden=!(cur&&s==='reading');$('datesL').hidden=s==='want';$('finL').hidden=s!=='read';
 $('pastL').hidden=s!=='read';if(auto)$('pastread').checked=s==='read'&&!cur;
 const past=s==='read'&&$('pastread').checked;if(past)$('datesL').hidden=true;
 if(auto&&!past){if(s!=='want'&&!$('started').value)$('started').value=today();if(s==='read'&&!$('finished').value)$('finished').value=today()}
 pv()}
document.querySelectorAll('#seg button').forEach(x=>x.onclick=()=>setFormStatus(x.dataset.s,true));
$('pastread').onchange=()=>{const p=$('pastread').checked;$('datesL').hidden=p||fStatus==='want';if(!p&&fStatus==='read'&&!$('finished').value)$('finished').value=today();pv()};
['page','pages'].forEach(i=>$(i).addEventListener('input',pv));
function openModal(b,src,status){
 try{coverShot=null}catch(e){}
 if(busy)return;if(b)try{sfx('flip')}catch(e){}
 saveLock=false;cur=b||null;lastQ=b?(b.title||'').trim():'';draft=b?{cover:b.cover,back:b.back,spine:b.spine}:{};Object.keys(draft).forEach(k=>draft[k]||delete draft[k]);draft.colorSet=!!b;$('series').value=b&&b.series||'';$('seriesNo').value=b&&b.seriesNo||'';$('seriesOf').value=b&&b.seriesOf||'';$('lentTo').value=b&&b.lentTo||'';$('format').value=b&&b.format||'';$('pastread').checked=!!(b&&b.past);$('lentOn').value=b&&b.lentOn||'';$('recBy').value=b&&b.recBy||'';$('site').value=b&&b.site||'';siteShow(b);$('price').value=b&&b.price||'';drawFormExtras(b);if(b&&b.genres&&b.genres.length)draft.genres=b.genres.slice();
 $('title').value=b?b.title:'';$('isbn').value=b?b.isbn||'':'';$('author').value=b?b.author||'':'';fStars=b&&b.stars?b.stars:0;formTags=b&&b.tags?b.tags.slice():[];$('page').value=b&&b.page?b.page:'';$('pages').value=b&&b.pages?b.pages:'';$('started').value=b?b.started||'':'';$('finished').value=b?b.finished||'':'';$('note').value=b?b.note||'':'';$('blurb').value=b?b.blurb||'':'';
 $('color').value=b?b.color:'#'+Math.floor(Math.random()*0x777777+0x111111).toString(16).padStart(6,'0');
 $('del').style.display=b?'':'none';$('seradd').hidden=!!b;$('snote').textContent='';try{fillSeriesList()}catch(e){}$('res').replaceChildren();$('st').textContent='';$('book').classList.remove('flip');
 {const sh0=$('ov').querySelector('.sheet');sh0.scrollTop=0;requestAnimationFrame(()=>{sh0.scrollTop=0})}
 drawTagRow();drawQuoteBtn();buildSlots();setFormStatus(b?st(b):(status||'read'),!b);
 const go=!!(b&&src&&!reduce),from=go?src.getBoundingClientRect():null;
 $('book').style.visibility=go?'hidden':'';
 $('ov').classList.add('on');
 if(go){const to=bookRect();src.style.visibility='hidden';flyBook(b,from,to,true,()=>{$('book').style.visibility='';src.style.visibility=''})}
 else if(!b)$('title').focus()
}
async function search(q){
 $('st').textContent=L('Searching\u2026');
 try{const [ol,gbk]=await Promise.all([tfetch('https://openlibrary.org/search.json?limit=6&fields=key,title,author_name,cover_i,first_publish_year,number_of_pages_median,subject&q='+encodeURIComponent(q),8000).then(j=>j.docs||[],()=>null),gbSearch(q)]);
  if(ol===null&&!gbk.length)throw 0;
  const nk=d=>(d.title+'|'+((d.author_name||[])[0]||'')).toLowerCase().normalize('NFD').replace(/[^a-z0-9|]/g,''),seen=new Set(),docs=[],a=(ol||[]).slice(),b=gbk.slice();
  while((a.length||b.length)&&docs.length<8)for(const l of [a,b]){const d=l.shift();if(d&&!seen.has(nk(d))){seen.add(nk(d));docs.push(d)}}
  const res=$('res');res.replaceChildren();
  $('st').textContent=docs.length?L('Pick the right edition:'):L('No results \u2013 you can fill everything in manually.');var found=docs.length;
  docs.forEach(d=>{const b=document.createElement('button');b.type='button';
   const im=document.createElement('img');if(d.cover_i)im.src=`https://covers.openlibrary.org/b/id/${d.cover_i}-S.jpg`;else if(d.thumb)im.src=d.thumb;
   const tx=document.createElement('span');tx.textContent=d.title+' ';const sm=document.createElement('small');sm.textContent=[(d.author_name||[])[0],d.first_publish_year].filter(Boolean).join(' \u00b7 ');
   tx.append(sm);b.append(im,tx);b.onclick=()=>pick(d);res.append(b)});return found
 }catch(e){$('st').textContent=L('Search unavailable (offline?). Fill in manually.');return -1}
}
async function pick(d){
 $('res').replaceChildren();$('title').value=d.title;$('author').value=(d.author_name||[])[0]||'';$('st').textContent=L('Fetching cover and description…');try{pv()}catch(e){}
 let desc='',cover=null,gb=null,subj=(d.subjects||d.subject||[]).slice(),cats=[];
 const np=d.pages||d.number_of_pages_median;if(np&&!$('pages').value)$('pages').value=np;
 if(d.desc)desc=d.desc;
 /* description, cover and extra details are fetched together, each with a time limit */
 const to=(p,ms)=>Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(0),ms))]);
 const pW=d.key&&(!desc||!subj.length)?tfetch('https://openlibrary.org'+d.key+'.json',6000).catch(()=>null):Promise.resolve(null);
 const pC=(async()=>{if(d.cover_i){try{return await to(fromUrl(`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg?default=false`),8000)}catch(e){}}
  if(d.isbn){try{return await to(fromUrl(`https://covers.openlibrary.org/b/isbn/${d.isbn}-L.jpg?default=false`),8000)}catch(e){}}return null})();
 const pG=d.gb?Promise.resolve(d.gb):tfetch('https://www.googleapis.com/books/v1/volumes?maxResults=1&q='+encodeURIComponent(d.isbn?'isbn:'+d.isbn:'intitle:'+d.title+(d.author_name?' inauthor:'+d.author_name[0]:'')),6000).then(g=>((g.items||[])[0]||{}).volumeInfo||null).catch(()=>null);
 const [w,c0,g0]=await Promise.all([pW,pC,pG]);cover=c0;gb=g0;
 if(w){if(!desc)desc=typeof w.description==='string'?w.description:(w.description&&w.description.value)||'';if(w.subjects)subj=subj.concat(w.subjects)}
 if(gb){if(gb.categories)cats=gb.categories;if(gb.pageCount&&!$('pages').value)$('pages').value=gb.pageCount;if(!desc)desc=gb.description||'';if(!$('author').value&&gb.authors)$('author').value=gb.authors[0]||'';
  if(!cover&&gb.imageLinks&&gb.imageLinks.thumbnail){try{cover=await to(fromUrl(gb.imageLinks.thumbnail.replace('http:','https:').replace('zoom=1','zoom=0')),8000)}catch(e){}}}
 desc=desc.replace(/<[^>]+>/g,'').replace(/\r?\n?\s*-{3,}[\s\S]*$/,'').trim();
 if(desc)$('blurb').value=desc.slice(0,1200);
 /* found from a cover photo and no cover online: keep the photo you took */
 if(!cover&&coverShot)cover=coverShot;coverShot=null;
 if(cover){draft.cover=cover;if(!draft.spine){const c=await avgColor(cover);if(c){$('color').value=c;draft.colorSet=true}}}
 draft.genres=guessGenres(subj,cats);drawTagRow();
 $('st').textContent=(cover?L('Cover found.'):L('No cover found \u2013 upload one below.'))+' '+(desc?L('Blurb added.'):L('No blurb found.'));pv();try{autoSeries()}catch(e){}
}

/* ---------- find a book from a photo of its front cover: read the words printed on it, then search with them ---------- */
let tess=null,coverShot=null;
const OCRL={fr:'fra',es:'spa',pt:'por',de:'deu',it:'ita',ht:'fra'};
function getTess(){if(tess)return tess;tess=new Promise((res,rej)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';sc.integrity='sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F';sc.crossOrigin='anonymous';sc.onload=()=>res(window.Tesseract);sc.onerror=()=>{tess=null;rej(new Error('load'))};document.head.append(sc)});return tess}
/* the biggest words on a cover are almost always the title, then the author: keep the well-read words, biggest lines first */
function coverLines(data){
 const out=[];(data.lines||[]).forEach(l=>{const ws=(l.words||[]).filter(w=>w.confidence>=55).map(w=>({t:w.text.replace(/[^\p{L}\p{N}'’-]/gu,''),h:w.bbox.y1-w.bbox.y0})).filter(w=>w.t.replace(/[^\p{L}]/gu,'').length>=2);
  if(!ws.length)return;const hs=ws.map(w=>w.h).sort((a,b)=>a-b);out.push({t:ws.map(w=>w.t).join(' '),h:hs[hs.length>>1],y:l.bbox.y0})});
 return out.sort((a,b)=>b.h-a.h)}
async function scanCover(f){
 const st=$('st');$('res').replaceChildren();st.textContent=L('Getting the text reader ready (first time only)…');
 let T;try{T=await getTess()}catch(e){st.textContent=L('The text reader couldn’t be loaded. Check your connection.');return}
 try{
  const bm=await createImageBitmap(f),sc=Math.min(1,1600/Math.max(bm.width,bm.height)),cv=document.createElement('canvas');
  cv.width=Math.round(bm.width*sc);cv.height=Math.round(bm.height*sc);cv.getContext('2d').drawImage(bm,0,0,cv.width,cv.height);
  try{coverShot=await shrink(f)}catch(e){coverShot=null}
  const lg=['eng'];if(OCRL[lang])lg.push(OCRL[lang]);
  const worker=await T.createWorker(lg,1,{logger:m=>{if(m.status==='recognizing text')st.textContent=L('Reading the cover… {p}%',{p:Math.round(m.progress*100)})}});
  let lines=coverLines((await worker.recognize(cv)).data);
  /* light letters on a dark cover read badly: try again with the colours flipped and keep the better reading */
  if(lines.reduce((n,l)=>n+l.t.split(' ').length,0)<3){const x=cv.getContext('2d');x.globalCompositeOperation='difference';x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);
   const l2=coverLines((await worker.recognize(cv)).data),cnt=a=>a.reduce((n,l)=>n+l.t.length,0);if(cnt(l2)>cnt(lines))lines=l2}
  worker.terminate();
  if(!lines.length){st.textContent=L('Couldn’t read any words on that cover. Try a straighter, brighter photo, or type the title.');return}
  /* try the biggest lines together first, then fewer words, until the book sites find something */
  const cut=s=>s.split(' ').slice(0,8).join(' '),tries=[...new Set([cut(lines.slice(0,3).map(l=>l.t).join(' ')),cut(lines.slice(0,2).map(l=>l.t).join(' ')),cut(lines[0].t)])].filter(Boolean);
  for(const q of tries){const n=await search(q);if(n>0){st.textContent=L('Read from the cover: “{q}”. Pick the right book:',{q});return}if(n<0)return}
  $('title').value=tries[tries.length-1];st.textContent=L('Read “{q}” but found no matching book. Fix the title above to search again.',{q:tries[0]});try{pv()}catch(e){}
 }catch(e){st.textContent=L('Couldn’t read any words on that cover. Try a straighter, brighter photo, or type the title.')}}
$('coverbtn').onclick=()=>$('coverin').click();
$('coverin').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)scanCover(f)};
let lastQ='';
$('title').addEventListener('input',e=>{clearTimeout(timer);const t=$('title'),q=t.value.trim();if(q.length<3){$('res').replaceChildren();$('st').textContent='';lastQ='';return}
 /* only look things up while typing at the end of the title: fixing a letter in the middle shouldn't pop up results under your finger */
 if(t.selectionEnd<t.value.length||q===lastQ)return;
 timer=setTimeout(()=>{if(document.activeElement===t&&t.selectionEnd<t.value.length)return;lastQ=q;search(q)},700)});
['title','author','blurb','finished','series','seriesNo','seriesOf'].forEach(i=>$(i).addEventListener('input',pv));
$('color').addEventListener('input',()=>{draft.colorSet=true;pv()});
$('stage').onclick=()=>$('book').classList.toggle('flip');$('stage').tabIndex=0;$('stage').setAttribute('role','button');$('stage').addEventListener('keydown',e=>{if(e.target===$('stage')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();$('stage').click()}});
$('addBtn').onclick=()=>openModal(null);document.querySelectorAll('[data-add]').forEach(x=>x.onclick=()=>openModal(null,null,x.dataset.add));$('close').onclick=()=>closeModal();
$('ov').onclick=e=>{if(e.target===$('ov'))closeModal()};document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
$('del').onclick=()=>{if(cur&&confirm(L('Remove this book from your shelf?'))){books=books.filter(x=>x.id!==cur.id);store();render();closeModal()}};
let saveLock=false;
$('form').onsubmit=e=>{e.preventDefault();saveBook()};
function saveBook(){
 if(!$('ov').classList.contains('on')||saveLock)return;const title=$('title').value.trim();if(!title){$('title').focus();return}
 saveLock=true;
 const b=cur?{...cur}:{id:'b'+Date.now().toString(36),w:30+Math.floor(Math.random()*24),h:150+Math.floor(Math.random()*62),createdAt:Date.now()};
 const past=fStatus==='read'&&$('pastread').checked;
 Object.assign(b,{isbn:$('isbn').value.replace(/[^0-9Xx]/g,''),title,author:$('author').value.trim(),status:fStatus,stars:fStatus==='read'?(fStars||null):(cur&&cur.stars?cur.stars:null),tags:formTags.slice(),series:normSeries($('series').value),seriesNo:+$('seriesNo').value||0,seriesOf:+$('seriesOf').value||0,recBy:$('recBy').value.trim(),price:$('price').value.trim(),lentTo:$('lentTo').value.trim(),site:cleanUrl($('site').value),format:$('format').value,lentOn:$('lentTo').value.trim()?($('lentOn').value||today()):'',genres:draft.genres||(cur&&cur.genres)||[],page:+$('page').value||0,pages:+$('pages').value||0,started:past?'':$('started').value,finished:past?'':fStatus==='read'?$('finished').value:'',past,note:$('note').value.trim(),blurb:$('blurb').value.trim(),color:$('color').value,cover:draft.cover||'',back:draft.back||'',spine:draft.spine||''});
 if(b.pages&&b.page>=b.pages&&st(b)!=='read'){moveTo(b,'read');fStatus='read'}
 if(!cur||cur.spine!==b.spine)delete b.spineAR;
 const i=books.findIndex(x=>x.id===b.id);if(i>=0)books[i]=b;else books.push(b);
 placeInSeries(b);const wasRead=cur&&st(cur)==='read';
 store();render();closeModal(b.id);if(fStatus==='read')setTimeout(()=>{try{checkUnlocks()}catch(e){}},3500);if(fStatus==='read'&&!wasRead){const sm=seriesMsg(b);if(sm)setTimeout(()=>toast(sm),700)}
};
$('imp').onclick=()=>$('impf').click();
/* on phones the keyboard closing can shift the Save button away from your finger before the tap lands: submit as soon as it's pressed */
{const sv=$('savebtn');sv.addEventListener('pointerdown',e=>{if(e.button>0)return;e.preventDefault();saveBook()});sv.addEventListener('click',()=>saveBook());}
/* the phone keyboard changes only the height: re-drawing then would close the keyboard, so redraw only when the width changes */
let lastW=innerWidth;window.addEventListener('resize',()=>{if(Math.abs(innerWidth-lastW)<2)return;lastW=innerWidth;clearTimeout(window._r);window._r=setTimeout(render,120)});
const cat=document.querySelector('.cat');
cat.onclick=()=>{
 if(petDragged)return;try{const pt=sid('pet');sfx(pt==='cat'?'purr':pt==='bird'||pt==='owl'?'chirp':pt==='dog'||pt==='fox'?'boof':'pop')}catch(e){}
 const woke=catw.classList.contains('sleeping');
 if(woke){catw.classList.remove('sleeping');petNext(3000+Math.random()*3000)}
 const h=document.createElement('b');h.className='heart';h.textContent='\u2665';cat.parentNode.append(h);setTimeout(()=>h.remove(),1100);
 setTimeout(()=>{cat.classList.remove('hop');void cat.getBoundingClientRect();cat.classList.add('hop')},woke?550:0)};
const catw=$('catw'),LK='bookshelf-look-v1',CK='bookshelf-catspot-v1';
let look={},lastSpot='';
try{look=JSON.parse(localStorage.getItem(LK)||'{}');lastSpot=localStorage.getItem(CK)||''}catch(e){}
const POT='<path class="pot" d="M22 72h36l-5 34H27z"/><rect class="pot2" x="19" y="66" width="42" height="9" rx="2"/>';
const PLANTS={
 leafy:'<g fill="#3b6f43"><ellipse cx="40" cy="42" rx="8" ry="26" transform="rotate(-62 40 70)"/><ellipse cx="40" cy="42" rx="8" ry="26" transform="rotate(62 40 70)"/></g><g fill="#4f8a55"><ellipse cx="40" cy="38" rx="9" ry="30"/><ellipse cx="40" cy="42" rx="9" ry="28" transform="rotate(-32 40 70)"/><ellipse cx="40" cy="42" rx="9" ry="28" transform="rotate(32 40 70)"/></g>'+POT,
 cactus:'<g fill="#4f8a55"><rect x="32" y="22" width="16" height="50" rx="8"/><rect x="17" y="34" width="10" height="26" rx="5"/><rect x="17" y="52" width="22" height="8" rx="4"/><rect x="53" y="28" width="10" height="26" rx="5"/><rect x="41" y="46" width="22" height="8" rx="4"/></g><circle cx="40" cy="22" r="5" fill="#e86a92"/>'+POT,
 flowers:'<g stroke="#4f8a55" stroke-width="3" fill="none" stroke-linecap="round"><path d="M40 70V28M40 70Q26 56 24 38M40 70Q54 54 58 34"/></g><ellipse cx="30" cy="60" rx="9" ry="4" fill="#4f8a55" transform="rotate(-25 30 60)"/><ellipse cx="50" cy="58" rx="9" ry="4" fill="#4f8a55" transform="rotate(25 50 58)"/><circle cx="40" cy="26" r="9" fill="#f2c94c"/><circle cx="24" cy="34" r="8" fill="#e86a92"/><circle cx="58" cy="30" r="8" fill="#f08a5d"/><circle cx="40" cy="26" r="3.5" fill="#a86b1c"/>'+POT,
 succulent:'<g fill="#6fae8a"><ellipse cx="40" cy="50" rx="7" ry="17" transform="rotate(-62 40 68)"/><ellipse cx="40" cy="50" rx="7" ry="17" transform="rotate(62 40 68)"/><ellipse cx="40" cy="50" rx="7" ry="17" transform="rotate(-32 40 68)"/><ellipse cx="40" cy="50" rx="7" ry="17" transform="rotate(32 40 68)"/></g><ellipse cx="40" cy="48" rx="8" ry="19" fill="#8cc7a3"/>'+POT};
const ANIMALS={
 alpaca:['--a:#ead9bd;--a2:#a98a66;--a3:#fbf5ea','<ellipse cx="31" cy="54.7" rx="17" ry="2.1" fill="rgba(0,0,0,.16)"/><circle class="tail c" cx="47.5" cy="37.5" r="3.6"/><path class="ct" d="M23 45v7.5M28.5 46v6.5M38.5 46v6.5M43.5 45v7.5" fill="none" stroke-width="4.2" stroke-linecap="round"/><path class="st" d="M21.4 53.6h3.2M26.9 53.6h3.2M36.9 53.6h3.2M41.9 53.6h3.2" fill="none" stroke-width="1.9" stroke-linecap="round"/><g class="body"><ellipse class="c" cx="33.5" cy="40" rx="14" ry="9.5"/><circle class="c" cx="23" cy="36.5" r="5"/><circle class="c" cx="29" cy="32.5" r="5.4"/><circle class="c" cx="36" cy="31.5" r="5.4"/><circle class="c" cx="42.5" cy="33.5" r="5"/><circle class="c" cx="46" cy="39.5" r="4.4"/><path class="st" d="M28 38c1.500-1.500 3.500-1.500 5 0M36 37c1.500-1.500 3.500-1.500 5 0M32 43.500c1.500-1.500 3.500-1.500 5 0M40 43c1.500-1.500 3.500-1.500 5 0" fill="none" stroke-width="1" stroke-linecap="round" opacity=".5"/></g><path class="c" d="M16.500 41C15.500 32 15.500 24 16.500 17L25.500 17C25.500 25 26.500 33 29 41z"/><circle class="c" cx="16.200" cy="31" r="3.2"/><circle class="c" cx="16.200" cy="25" r="3"/><circle class="c" cx="26.300" cy="29" r="3"/><circle class="c" cx="25.800" cy="23" r="2.8"/><circle class="c" cx="18" cy="37.5" r="3.6"/><path class="st" d="M19 28c1.200-1.200 2.800-1.200 4 0M19.500 34c1.200-1.200 2.800-1.200 4 0" fill="none" stroke-width="1" stroke-linecap="round" opacity=".5"/><path class="c" d="M15.500 11L12.500 1.500L19.500 7z"/><path d="M15.700 9L14.200 4.300L17.600 7z" fill="#f0b4b0"/><g class="ear2"><path class="c" d="M24.500 10.500L28.500 1.500L21.500 7z"/><path d="M24.500 8.600L26.600 4.200L23 7z" fill="#f0b4b0"/></g><ellipse class="c" cx="20" cy="14.5" rx="7.4" ry="6.8"/><circle class="c" cx="16.800" cy="8.600" r="3"/><circle class="c" cx="20.500" cy="7.400" r="3.4"/><circle class="c" cx="24" cy="8.800" r="2.8"/><ellipse class="c2" cx="15.200" cy="17.600" rx="5.200" ry="3.900"/><circle cx="24.300" cy="17" r="1.900" fill="#f0a6a0" opacity=".5"/><path d="M11.700 16.200h2.600l-1.300 1.400z" fill="#9a7462"/><path class="nose" d="M13 17.600v.9M13 18.500c-.7.800-1.600.7-2 .2M13 18.500c.7.800 1.600.7 2 .2" fill="none" stroke-width=".8" stroke-linecap="round"/><g class="eye"><ellipse cx="17.400" cy="13" rx="1.550" ry="1.950"/><circle cx="17.950" cy="12.250" r=".6" fill="#fff"/></g><g class="eye"><ellipse cx="23.600" cy="12.600" rx="1.550" ry="1.950"/><circle cx="24.150" cy="11.850" r=".6" fill="#fff"/></g>'],
 cat:['--a:#d98a3d;--a2:#b06a25;--a3:#f6e3c4','<ellipse cx="29" cy="54.6" rx="19" ry="2.1" fill="rgba(0,0,0,.16)"/><g class="tail"><path class="ct" d="M44 50c14-2 14-20 4-24" fill="none" stroke-width="6" stroke-linecap="round"/><path class="st" d="M49.6 27.4c-.5-.5-1-.9-1.6-1.4" fill="none" stroke-width="6" stroke-linecap="round"/></g><g class="body"><ellipse class="c" cx="29" cy="40" rx="17" ry="14.5"/><path class="st" d="M33 28.6v5.5M38.5 30.4v5.5M43 34v4.5" fill="none" stroke-width="2.3" stroke-linecap="round"/><ellipse class="c2" cx="21" cy="43.5" rx="7" ry="9"/><path class="st" d="M37 53.2c4.6-1 7.6-4.6 6.8-9.6" fill="none" stroke-width="1.5" stroke-linecap="round" opacity=".55"/></g><ellipse class="c2" cx="17" cy="53.2" rx="4.6" ry="2.4"/><ellipse class="c2" cx="27" cy="53.5" rx="4.6" ry="2.4"/><path class="c" d="M13 14l1-12.5 10 7.5z"/><path d="M15.4 11.6l.6-6.4 5.2 3.9z" fill="#f0a6a0"/><g class="ear2"><path class="c" d="M35 14l-1-12.5-10 7.5z"/><path d="M32.6 11.6l-.6-6.4-5.2 3.9z" fill="#f0a6a0"/></g><circle class="c" cx="24" cy="20" r="12"/><path class="st" d="M21 9.6v3.6M24.4 9v4.2M27.8 9.6v3.6" fill="none" stroke-width="1.7" stroke-linecap="round"/><ellipse class="c2" cx="23.5" cy="25.2" rx="6.6" ry="4.4"/><circle cx="14.6" cy="23.4" r="2.1" fill="#f0a6a0" opacity=".5"/><circle cx="32.6" cy="23.4" r="2.1" fill="#f0a6a0" opacity=".5"/><g class="eye"><ellipse cx="19" cy="19" rx="2" ry="2.5"/><circle cx="19.7" cy="18.1" r=".75" fill="#fff"/></g><g class="eye"><ellipse cx="28.4" cy="19" rx="2" ry="2.5"/><circle cx="29.1" cy="18.1" r=".75" fill="#fff"/></g><path d="M22 22.7h3l-1.5 1.7z" fill="#e8848a"/><path class="nose" d="M23.5 24.4v1.1M23.5 25.5c-.9 1.3-2.3 1.2-2.8.4M23.5 25.5c.9 1.3 2.3 1.2 2.8.4" fill="none" stroke-width=".9" stroke-linecap="round"/><path class="st" d="M16.5 25l-6.5-1M16.5 26.6l-6.3 1.2M30.5 25l6.5-1M30.5 26.6l6.3 1.2" fill="none" stroke-width=".55" stroke-linecap="round" opacity=".6"/>'],
 dog:['--a:#c48a4e;--a2:#8a5a2b;--a3:#f3e2c8','<ellipse cx="29" cy="54.7" rx="19" ry="2.1" fill="rgba(0,0,0,.16)"/><path class="tail ct" d="M44 46c8-2 10-10 6-14" fill="none" stroke-width="5" stroke-linecap="round"/><g class="body"><ellipse class="c" cx="28" cy="40" rx="17" ry="15"/><ellipse class="d" cx="37" cy="33.5" rx="5.5" ry="4" opacity=".5"/><ellipse class="c2" cx="20.5" cy="44.5" rx="7" ry="8.5"/><path class="st" d="M37 53.4c4.6-1 7.4-4.8 6.6-9.6" fill="none" stroke-width="1.5" stroke-linecap="round" opacity=".5"/></g><ellipse class="c2" cx="17" cy="53" rx="5" ry="2.8"/><ellipse class="c2" cx="30" cy="53" rx="5" ry="2.8"/><path class="st" d="M15.4 53v1.4M18.2 53v1.4M28.4 53v1.4M31.2 53v1.4" fill="none" stroke-width=".7" stroke-linecap="round" opacity=".5"/><path d="M13.5 30.5q8.5 5 17.5-.5" fill="none" stroke="#c0392b" stroke-width="2.6" stroke-linecap="round"/><circle cx="21" cy="34.6" r="1.7" fill="#f2c14a"/><circle class="c" cx="22" cy="21" r="11"/><ellipse class="d" cx="20.5" cy="17.5" rx="4.4" ry="4.8" opacity=".35"/><ellipse class="c2" cx="15" cy="25" rx="6.6" ry="5"/><path class="d ear2" d="M28 13q10 3 6 17q-8-3-9-12z"/><ellipse cx="14.6" cy="29.6" rx="1.8" ry="2.5" fill="#ea7a86"/><path class="nose" d="M11 25q2.6 3.6 7 1.8" fill="none" stroke-width="1" stroke-linecap="round"/><ellipse cx="10.6" cy="23" rx="2.2" ry="1.8" fill="#222"/><circle cx="10" cy="22.4" r=".5" fill="#fff" opacity=".7"/><g class="eye"><ellipse cx="20.6" cy="18" rx="1.9" ry="2.28"/><circle cx="21.27" cy="17.13" r="0.72" fill="#fff"/></g><circle cx="25.6" cy="24.2" r="2.1" fill="#f0a6a0" opacity="0.5"/>'],
 bird:['--a:#4aa3df;--a2:#2f78b0;--a3:#f6f4e6','<ellipse cx="30" cy="54.7" rx="13" ry="2.1" fill="rgba(0,0,0,.16)"/><g class="btail"><path class="d" d="M37 41c7 1 13 5 17 12-6 0-12-2-17-6z"/><path class="c" d="M37 38c8 0 14 3 19 9-7 1-13 0-19-4z"/></g><g class="body"><ellipse class="c" cx="28" cy="36" rx="14" ry="16"/><ellipse class="c2" cx="23.5" cy="40" rx="8" ry="11"/><path class="st" d="M19.5 41.5l1.6 1.2 1.6-1.2M23.5 45l1.6 1.2 1.6-1.2M19 47.5l1.6 1.2 1.6-1.2" fill="none" stroke-width=".7" stroke-linecap="round" opacity=".35"/></g><g class="ear2"><path class="d" d="M26 28q14 2 14 20q-14-2-14-20z"/><path d="M29.5 33q6.5 3 8 9.5M30 38.5q4.5 2 5.6 6.5" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".35"/></g><path d="M24 50v5M31 50v5M21.6 55.4h4.8M28.6 55.4h4.8" fill="none" stroke="#d69a4a" stroke-width="1.8" stroke-linecap="round"/><g class="bob"><path class="d" d="M21.5 9q.6-4.2 4.2-5q-1.4 3 .2 5.4z"/><circle class="c" cx="22" cy="18" r="10"/><ellipse class="c2" cx="17.5" cy="21.5" rx="4.6" ry="3.6" opacity=".55"/><path d="M12.4 17.2l-7.4 3.6h7.4z" fill="#f6bd45"/><path d="M12.4 20.8h-7.4l7.4 2.6z" fill="#d9952a"/><circle cx="18.2" cy="21.6" r="2" fill="#f6a56b" opacity="0.75"/><g class="eye"><ellipse cx="19" cy="16" rx="2.1" ry="2.52"/><circle cx="19.73" cy="15.04" r="0.80" fill="#fff"/></g></g>'],
 turtle:['--a:#5c9a58;--a2:#3d6e3b;--a3:#b9c98a','<ellipse cx="31" cy="55" rx="25" ry="2.1" fill="rgba(0,0,0,.16)"/><path class="tail ct" d="M54 52l5 2" fill="none" stroke-width="3" stroke-linecap="round"/><ellipse class="c2" cx="16" cy="54" rx="5" ry="3"/><ellipse class="c2" cx="42" cy="54" rx="5" ry="3"/><path class="st" d="M13.6 54.6v1.4M16 55v1.4M18.4 54.6v1.4M39.6 54.6v1.4M42 55v1.4M44.4 54.6v1.4" fill="none" stroke-width=".7" stroke-linecap="round" opacity=".6"/><g class="body"><path class="c" d="M8 51A22 22 0 0 1 52 51z"/><path d="M13 45A18 18 0 0 1 29 31.5q-11 3-12.5 13.5z" fill="#fff" opacity=".16"/><path class="st" d="M24 36.5l6-3 6 3v7l-6 3-6-3zM24 36.5l-7-3.5M36 36.5l7-3.5M24 43.5l-10 3.5M36 43.5l10 3.5M30 33.5V29.4M30 46.5V51" fill="none" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></g><ellipse class="c2" cx="30" cy="52" rx="24" ry="3.5"/><g class="bob"><circle class="c2" cx="8" cy="44" r="6.2"/><circle cx="10" cy="46.4" r="1.7" fill="#e58c7a" opacity="0.55"/><path class="nose" d="M3.4 46.4q2.2 1.8 4.6.4" fill="none" stroke-width=".9" stroke-linecap="round"/><g class="eye"><ellipse cx="6.2" cy="42.4" rx="1.5" ry="1.80" fill="#222"/><circle cx="6.72" cy="41.72" r="0.57" fill="#fff"/></g></g>'],
 fox:['--a:#e0742f;--a2:#3a2a22;--a3:#f8efe2','<ellipse cx="31" cy="54.7" rx="19" ry="2.1" fill="rgba(0,0,0,.16)"/><g class="tail"><path class="c" d="M40 52C52 54 60 44 59 30C58 25 56 21 53 18C52 28 48 36 39 42z"/><path class="c2" d="M53 18C56 21 58 25 59 30C56 30 52 28 51 25C52 23 52 20 53 18z"/></g><g class="body"><ellipse class="c" cx="29" cy="42" rx="14" ry="13"/></g><ellipse class="c2" cx="18" cy="43" rx="5.5" ry="8"/><ellipse class="d" cx="37" cy="54" rx="5" ry="2.5"/><path class="st" d="M19 49v4M27 50v4" fill="none" stroke-width="5" stroke-linecap="round"/><g class="ear2"><path class="c" d="M27 14L35 4L35 20z"/><path class="d" d="M30 12L34 7L34 16z"/></g><ellipse class="c" cx="24" cy="23" rx="11" ry="9"/><path class="c" d="M15 18L14 3L24 13z"/><path class="d" d="M16 15L15.6 7L20.5 12z"/><path class="c" d="M14 20L4 28C9 32 15 32 20 31z"/><path class="c2" d="M4 28C9 32 15 33 21 32C27 32 33 30 35 26C31 29 26 28 21 29C14 29 8 30 4 28z"/><circle cx="4.5" cy="28" r="1.8" fill="#222"/><circle cx="29.5" cy="25.2" r="2" fill="#f6b08a" opacity="0.6"/><g class="eye"><ellipse cx="17" cy="21.8" rx="1.7" ry="2.04"/><circle cx="17.59" cy="21.02" r="0.65" fill="#fff"/></g><g class="eye"><ellipse cx="25.2" cy="20.8" rx="1.7" ry="2.04"/><circle cx="25.79" cy="20.02" r="0.65" fill="#fff"/></g>'],
 hedgehog:['--a:#9a7652;--a2:#4a3626;--a3:#ecd2ae','<ellipse cx="31" cy="54.7" rx="23" ry="2.1" fill="rgba(0,0,0,.16)"/><g class="body"><path class="d" d="M15.2 43.9L11.3 42.9L14.6 40.9L11.0 39.2L14.7 37.8L11.7 35.6L15.8 34.8L13.5 32.2L17.6 32.1L16.1 29.1L20.2 29.7L19.5 26.6L23.3 27.8L23.6 24.6L26.9 26.5L28.1 23.4L30.8 25.8L32.8 23.0L34.8 25.8L37.5 23.4L38.7 26.4L42.0 24.5L42.4 27.7L46.1 26.4L45.6 29.5L49.6 28.8L48.2 31.9L52.3 31.9L50.1 34.6L54.1 35.3L51.2 37.5L55.0 38.9L51.5 40.6L54.8 42.5L50.9 43.6L53.5 46.1L49.4 46.5L51.4 49.4L47.2 49.1L48.3 52.2L44.4 51.3L40 53.5L16 53.5z"/><ellipse class="c" cx="33" cy="42" rx="18.5" ry="12.5"/><path class="st" d="M24 34l1.2 3M30 32l.8 3.2M36 32l.2 3.2M42 33.6l-.8 3M47 37l-1.6 2.6M27 39l1 2.6M33 37.6l.6 2.8M39 38l.2 2.8M44.5 41l-1 2.4" fill="none" stroke-width="1.3" stroke-linecap="round" opacity=".7"/></g><ellipse class="c2" cx="14" cy="44.5" rx="11" ry="8.8"/><ellipse class="c2" cx="19" cy="53" rx="5" ry="2.8"/><ellipse class="c2" cx="35" cy="53" rx="5" ry="2.8"/><g class="bob"><ellipse cx="4.4" cy="45" rx="2.4" ry="2.1" fill="#222"/><circle cx="3.8" cy="44.3" r=".55" fill="#fff" opacity=".7"/></g><g class="ear2"><circle class="c2" cx="19.5" cy="37" r="3.7"/><circle cx="19.5" cy="37.3" r="2" fill="#f0a6a0" opacity=".7"/></g><path class="nose" d="M6.6 48.2q2.8 2 5.6.3" fill="none" stroke-width=".9" stroke-linecap="round"/><circle cx="15.6" cy="46.6" r="2.1" fill="#f0a6a0" opacity="0.5"/><g class="eye"><ellipse cx="12" cy="41.6" rx="1.7" ry="2.04" fill="#222"/><circle cx="12.60" cy="40.82" r="0.65" fill="#fff"/></g>'],
 axolotl:['--a:#f2a7b8;--a2:#d97b93;--a3:#fbdde4','<ellipse cx="32" cy="54.7" rx="24" ry="2.1" fill="rgba(0,0,0,.16)"/><g class="tail"><path class="c" d="M48 43c8-5 12-2 11 4.2c-2 4-7 3.2-11 1z"/><path class="st" d="M50.5 41.6c4-2.6 7.2-2 8 .8" fill="none" stroke-width="1.1" stroke-linecap="round" opacity=".7"/></g><g class="body"><ellipse class="c" cx="32" cy="44" rx="20" ry="9"/><ellipse class="c2" cx="31" cy="48.4" rx="14" ry="4"/><circle class="d" cx="38" cy="40" r=".8" opacity=".6"/><circle class="d" cx="42.5" cy="41.5" r=".7" opacity=".6"/><circle class="d" cx="34.5" cy="38.6" r=".6" opacity=".6"/></g><ellipse class="c2" cx="24" cy="53" rx="4.2" ry="2.5"/><ellipse class="c2" cx="40" cy="53" rx="4.2" ry="2.5"/><g class="ear2"><path class="st" d="M18 33l-5-8.5M21 34.5l-1-9.5M24.5 36.5l3-8.5" fill="none" stroke-width="2.6" stroke-linecap="round"/><circle class="d" cx="12.6" cy="23.6" r="2.4"/><circle class="d" cx="20" cy="24" r="2.4"/><circle class="d" cx="27.8" cy="27.2" r="2.4"/><circle class="d" cx="14.2" cy="28" r="1.5"/><circle class="d" cx="22.2" cy="29" r="1.5"/></g><circle class="c" cx="15" cy="40" r="10.2"/><circle cx="7.6" cy="42.4" r="1.9" fill="#e8708a" opacity="0.5"/><circle cx="21.6" cy="42.4" r="1.9" fill="#e8708a" opacity="0.5"/><path class="nose" d="M10.6 43.2q4 3 8 0" fill="none" stroke-width="1.1" stroke-linecap="round"/><g class="eye"><ellipse cx="9.8" cy="38.4" rx="1.7" ry="2.04"/><circle cx="10.40" cy="37.62" r="0.65" fill="#fff"/></g><g class="eye"><ellipse cx="19.2" cy="38.4" rx="1.7" ry="2.04"/><circle cx="19.79" cy="37.62" r="0.65" fill="#fff"/></g>'],
 frog:['--a:#5aa84a;--a2:#3a7a30;--a3:#eaf2c4','<ellipse cx="31" cy="54.7" rx="22" ry="2.1" fill="rgba(0,0,0,.16)"/><ellipse class="c" cx="47" cy="50" rx="8" ry="5"/><ellipse class="c2" cx="50.5" cy="54" rx="4.4" ry="2"/><g class="body"><ellipse class="c" cx="30" cy="42" rx="18" ry="13"/><circle class="d" cx="41" cy="37.5" r="2" opacity=".5"/><circle class="d" cx="44.6" cy="43" r="1.4" opacity=".5"/><circle class="d" cx="37.6" cy="33.6" r="1.2" opacity=".5"/><ellipse class="c2" cx="28" cy="48" rx="11" ry="6"/></g><ellipse class="c2" cx="17" cy="54" rx="5" ry="2.5"/><ellipse class="c2" cx="28" cy="54" rx="5" ry="2.5"/><path class="st" d="M15 54.2v1.4M17.4 54.5v1.4M19.6 54.2v1.4M26 54.2v1.4M28.4 54.5v1.4M30.6 54.2v1.4" fill="none" stroke-width=".7" stroke-linecap="round" opacity=".55"/><circle class="c" cx="19" cy="27" r="6.2"/><circle class="c" cx="35" cy="27" r="6.2"/><circle class="c2" cx="19" cy="27" r="4.3"/><circle class="c2" cx="35" cy="27" r="4.3"/><g class="eye"><ellipse cx="18.4" cy="27" rx="2.3" ry="2.50" fill="#222"/><circle cx="19.20" cy="26.05" r="0.87" fill="#fff"/></g><g class="eye"><ellipse cx="34.4" cy="27" rx="2.3" ry="2.50" fill="#222"/><circle cx="35.20" cy="26.05" r="0.87" fill="#fff"/></g><circle class="d" cx="25.6" cy="35.6" r=".6"/><circle class="d" cx="28.6" cy="35.6" r=".6"/><circle cx="14.6" cy="38.6" r="2.2" fill="#ffc2b8" opacity="0.8"/><circle cx="41" cy="38.6" r="2.2" fill="#ffc2b8" opacity="0.8"/><path class="nose" d="M15.5 40.5q12.5 7.5 25 0" fill="none" stroke-width="1.5" stroke-linecap="round"/>'],
 owl:['--a:#8a6a4a;--a2:#5a432c;--a3:#efe2c8','<ellipse cx="30" cy="54.7" rx="15" ry="2.1" fill="rgba(0,0,0,.16)"/><g class="body"><ellipse class="c" cx="30" cy="34" rx="16" ry="20"/><ellipse class="c2" cx="30" cy="42" rx="10" ry="12"/><path class="st" d="M24.4 38l2 1.6 2-1.6M31.6 38l2 1.6 2-1.6M28 42.4l2 1.6 2-1.6M24.4 46.8l2 1.6 2-1.6M31.6 46.8l2 1.6 2-1.6" fill="none" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></g><path class="d" d="M14 30q-4 12 4 20q3-10-4-20z"/><path class="d" d="M46 30q4 12-4 20q-3-10 4-20z"/><path d="M14.6 36q1 6 3 10M45.4 36q-1 6-3 10" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".25"/><path d="M23.4 54h5.2M33.4 54h5.2M24 54v1.6M26 54v1.8M28 54v1.6M34 54v1.6M36 54v1.8M38 54v1.6" fill="none" stroke="#f2b134" stroke-width="1.6" stroke-linecap="round"/><path class="c" d="M15 12l7 8-9 2z"/><path class="c ear2" d="M45 12l-7 8 9 2z"/><g class="bob"><path class="d" d="M15.5 17.5q8-1.5 14.5 5q6.500-6.500 14.500-5q-8 1-14.500 8q-6.500-7-14.500-8z" opacity=".85"/><circle class="c2" cx="23" cy="24.5" r="7"/><circle class="c2" cx="37" cy="24.5" r="7"/><circle cx="23" cy="24.5" r="4.6" fill="#f2b134"/><circle cx="37" cy="24.5" r="4.6" fill="#f2b134"/><g class="eye"><ellipse cx="23" cy="24.5" rx="3" ry="3.00" fill="#222"/><circle cx="24.05" cy="23.36" r="1.14" fill="#fff"/></g><g class="eye"><ellipse cx="37" cy="24.5" rx="3" ry="3.00" fill="#222"/><circle cx="38.05" cy="23.36" r="1.14" fill="#fff"/></g><path d="M28 27.4l2 5.6 2-5.6z" fill="#f2b134"/><path d="M30 27.4l0 5.600 2-5.600z" fill="#d9952a"/></g>'],
 bunny:['--a:#c9b8a6;--a2:#9b8874;--a3:#f8f1e8','<ellipse cx="30" cy="54.7" rx="18" ry="2.1" fill="rgba(0,0,0,.16)"/><circle class="tail c2" cx="46" cy="46" r="5.2"/><g class="body"><ellipse class="c" cx="30" cy="41" rx="15" ry="14"/><ellipse class="c2" cx="21.5" cy="44.5" rx="6" ry="8"/><path class="st" d="M36 53.6c4.6-1 7.6-4.6 6.8-9.4" fill="none" stroke-width="1.4" stroke-linecap="round" opacity=".5"/></g><ellipse class="c2" cx="18" cy="54" rx="6" ry="2.5"/><ellipse class="c2" cx="33" cy="54" rx="6" ry="2.5"/><path class="c" d="M13 19C9 8 12 1 16 2C19 3 19 12 19 19z"/><path d="M14.4 17.5C11.8 10 13.4 5 15.6 5.200C17.4 5.800 17.300 12 17.200 17.500z" fill="#f0b4b0"/><g class="ear2"><path class="c" d="M22 19C21 11 23 3 27 3C31 4 28 13 26 19z"/><path d="M23.6 17.5C23.100 11.500 24.600 6 26.800 5.800C28.800 6.400 26.800 12.600 25.300 17.500z" fill="#f0b4b0"/></g><circle class="c" cx="20" cy="26" r="9.2"/><ellipse class="c2" cx="14.4" cy="29.2" rx="4.6" ry="3.4"/><circle cx="20.6" cy="29.4" r="2" fill="#f0a6a0" opacity="0.5"/><path d="M11.2 27.2h2.4l-1.2 1.400z" fill="#e8848a"/><path class="nose" d="M12.4 28.600v.9M12.400 29.500c-.7.900-1.700.8-2.100.2M12.400 29.500c.7.900 1.700.8 2.100.2" fill="none" stroke-width=".85" stroke-linecap="round"/><path class="st" d="M9.500 28.800l-5.500-.800M9.600 30.200l-5.200 1.200" fill="none" stroke-width=".5" stroke-linecap="round" opacity=".6"/><g class="eye"><ellipse cx="16.6" cy="24" rx="1.8" ry="2.16"/><circle cx="17.23" cy="23.18" r="0.68" fill="#fff"/></g>']
};
/* the secret dragon is drawn with the other animals, so it is there when the room is first drawn */
const drShade=h=>'#'+[1,3,5].map(i=>Math.round(parseInt(h.slice(i,i+2),16)*.55).toString(16).padStart(2,'0')).join('');
const drLight=h=>'#'+[1,3,5].map(i=>Math.round(parseInt(h.slice(i,i+2),16)*.45+255*.55).toString(16).padStart(2,'0')).join('');
ANIMALS.dragon=[null,"<ellipse cx=\"32\" cy=\"54.6\" rx=\"21\" ry=\"2\" fill=\"rgba(0,0,0,.16)\"/><g transform=\"translate(33 32) scale(.95)\"><g class=\"drw\"><path d=\"M0 0L7-24L24-29Q22-20 26-14Q20-13 19-7Q14-8 12-2Z\" style=\"fill:var(--cat-st,var(--a2))\"/></g></g><g class=\"tail\"><path class=\"c\" d=\"M42 37c7 1 12 5 13.5 10.5c.6 2.4 2 3.5 3.5 3.5c-2.6 1.6-6 .4-7.2-3c-1.6-4.2-5.6-6.6-10.8-6.8z\"/><path class=\"c2\" d=\"M57 51.5l2.6-6.2 .4 6.6z\"/></g><path d=\"M27.5 44l-1 10.4h4.6l.6-9.6zM44.5 44.5l1.6 9.9h4.4l-2-10.4z\" style=\"fill:var(--cat-st,var(--a2))\"/><g class=\"body\"><path class=\"c\" d=\"M17.9 21.7L21.0 19.1L20.1 23.8zM20.6 24.4L24.0 21.9L22.5 26.7zM23.1 27.6L26.7 25.8L24.6 30.2zM25.3 31.5L28.8 30.5L26.4 34.3zM42.2 37.6L43.3 34.1L44.8 38.2zM46.6 38.8L48.4 36.1L49.0 39.9zM50.5 41.0L52.8 39.4L52.4 42.8z\"/><ellipse class=\"c\" cx=\"33\" cy=\"41\" rx=\"13.5\" ry=\"8\"/><ellipse class=\"c\" cx=\"42.5\" cy=\"43\" rx=\"6.5\" ry=\"6.8\"/><path class=\"c\" d=\"M38.5 46.5l-1 7.9h6.2l-1.2-3 .6-5.6z\"/><path class=\"c\" d=\"M20.5 40l-1.6 14.4h6.2l.4-4.4 2-8z\"/><path class=\"c\" d=\"M28 37.5C26 29.5 22 24.5 18 21L12.4 24.6C16 28 18.6 33.6 19.4 41z\"/><path class=\"c2\" d=\"M12.8 25c3.6 3.4 5.8 8.6 6.6 15.6c.4 3 2.4 5.6 5.6 6.8c3.2 1 7 1 10 .2c-4.6.2-8.6-.6-11.2-2.6c-2.6-2-3-5-3.4-8.2c-.8-5-3-9-6.4-12.2z\"/><path class=\"st\" d=\"M15.2 28.6l2.4-1.4M17.2 32.6l2.6-1M18.6 36.8l2.6-.6M19.6 41l2.4-.2M22.2 45l2.2.6M26.6 47.4l2 .4\" fill=\"none\" stroke-width=\".8\" stroke-linecap=\"round\" opacity=\".7\"/><path class=\"st\" d=\"M37.4 40a6.5 6.8 0 0 1 11 6.2\" fill=\"none\" stroke-width=\".9\" stroke-linecap=\"round\" opacity=\".8\"/></g><g transform=\"translate(31 33) scale(1.05)\"><g class=\"drw\"><path class=\"c\" d=\"M0 0L5-24L22-29Q20-20 25-14Q18-14 17-7Q12-9 10-2Z\"/><path class=\"st\" d=\"M5-24L10-2M5-24L17-7M5-24L25-14M5-24L22-29\" fill=\"none\" stroke-width=\".9\" stroke-linecap=\"round\"/><path d=\"M22-29l1.8-2.4.1 2.9z\" fill=\"#efe3c4\"/></g></g><path d=\"M18.8 54.6l.5-1.4M21.4 54.8l.3-1.6M24 54.6l.1-1.4M38 54.6l.4-1.6M40.6 54.8l.2-1.6M43.2 54.6l-.1-1.4\" stroke=\"#f3ead6\" stroke-width=\".9\" stroke-linecap=\"round\"/><g transform=\"translate(-1 6)\"><path d=\"M19.6 6.6q6.4-5 14.6-4.8q-5 2-9.8 6.6zM22.4 9.2q6.2-1.8 11.4 1.4q-5.2-.4-8.8 2.2z\" fill=\"#efe3c4\" stroke=\"#b7a57c\" stroke-width=\".6\" stroke-linejoin=\"round\"/><path class=\"c\" d=\"M25.5 12.4c0-4-3-6.4-7-6.4c-3 0-5.2 1-7.2 3L3.8 12.6c-1.6.8-1.6 2.8 0 3.4L10 18.4c2 2 5 3 8.2 3c4.4 0 7.3-3.4 7.3-9z\"/><path class=\"c2\" d=\"M4.2 16.2L10 18.4c2 2 5 3 8.2 3c-3.4-.6-6.2-2.2-8.2-4.8z\"/><path class=\"c\" d=\"M24.6 13.6l4.4.8-3.8 2.4z\"/><path d=\"M7.6 17.4l.7 1.3.6-1.1zM10.4 18.4l.6 1.2.6-1z\" fill=\"#fff\"/><path d=\"M5.4 13.4q1.1-.7 2.2-.3\" fill=\"none\" stroke=\"#1d1d1d\" stroke-width=\"1\" stroke-linecap=\"round\"/><path class=\"st\" d=\"M13.2 8.4q3.6-2.2 7.4-.6\" fill=\"none\" stroke-width=\"1.6\" stroke-linecap=\"round\"/><g class=\"eye\"><ellipse cx=\"16.8\" cy=\"10.6\" rx=\"2\" ry=\"1.7\" fill=\"#f6d55c\"/><ellipse cx=\"17\" cy=\"10.6\" rx=\".55\" ry=\"1.5\" fill=\"#1d1d1d\"/><circle cx=\"17.6\" cy=\"9.9\" r=\".45\" fill=\"#fff\"/></g></g>"];
/* its colors follow your pick; set on the animal itself so a coat chosen for another animal never repaints it */
Object.defineProperty(ANIMALS.dragon,0,{get(){/* only a plain color can reach the page: a doctored backup can't slip code in here */const c=/^#[0-9a-f]{6}$/i.test(look._dragon||'')?look._dragon:'#3f8f4e',d=drShade(c);return `--a:${c};--a2:${d};--a3:${drLight(c)};--cat:${c};--cat-st:${d}`}});
const tog=v=>[['show','Show',{}],['hide','Hide',{[v]:'none'}]];
const OPTS=[
 {h:'Room'},
 {k:'theme',l:'Theme',i:[['auto','Automatic',{}],['light','Light',{'--wall':'#e9dcc4','--wall2':'#e3d4b9','--fl1':'#b98a5a','--fl2':'#a67a4c','--base':'#f3ecdf','--bg':'#f1e8da','--ink':'#2a2118','--muted':'#7a6a58','--wood':'#9a6538','--wood2':'#6d4523','--card':'#fffaf1','--line':'#d9ccb8','--acc':'#8b2e2e','color-scheme':'light'}],['dark','Dark',{'--wall':'#2b231c','--wall2':'#271f19','--fl1':'#4a3421','--fl2':'#3f2c1b','--base':'#5a4a3a','--bg':'#1a1511','--ink':'#f0e6d6','--muted':'#a8977f','--wood':'#7a4f2b','--wood2':'#4e3019','--card':'#261f18','--line':'#3d3226','--acc':'#d9746b','color-scheme':'dark'}]]},
 {k:'wall',l:'Wall',i:[['def','Default',{}],['sage','Sage green',{'--wall':'#cfd9c3','--wall2':'#c6d1b9'}],['blue','Dusty blue',{'--wall':'#cbd8e6','--wall2':'#c2d0e0'}],['pink','Blush pink',{'--wall':'#eed6d6','--wall2':'#e8cbcb'}],['navy','Midnight',{'--wall':'#2d3550','--wall2':'#283049','--hd':'#f0e6d6','--hdm':'#b9bfd0'}],['forest','Forest green',{'--wall':'#26382c','--wall2':'#223228','--hd':'#f0e6d6','--hdm':'#c2b8a8'}],['teal','Deep teal',{'--wall':'#1f3a3d','--wall2':'#1b3437','--hd':'#f0e6d6','--hdm':'#c2b8a8'}],['plum','Plum',{'--wall':'#3b2838','--wall2':'#352332','--hd':'#f0e6d6','--hdm':'#c2b8a8'}],['wine','Burgundy',{'--wall':'#4a1f26','--wall2':'#421b21','--hd':'#f0e6d6','--hdm':'#c2b8a8'}],['choco','Chocolate',{'--wall':'#3a2a20','--wall2':'#34251c','--hd':'#f0e6d6','--hdm':'#c2b8a8'}],['charcoal','Charcoal',{'--wall':'#2e2e33','--wall2':'#29292e','--hd':'#f0e6d6','--hdm':'#c2b8a8'}],['plain','Plain cream',{'--wallbg':'#eadfca'}],['dots','Polka dots',{'--wallbg':'radial-gradient(circle,rgba(0,0,0,.09) 2px,transparent 3px) 0 0/28px 28px,#e9dcc4'}]]},
 {k:'floor',l:'Floor',i:[['def','Default',{}],['dark','Dark wood',{'--fl1':'#5a3d26','--fl2':'#4a311d'}],['light','Light wood',{'--fl1':'#d9b98a','--fl2':'#cfae7e'}],['grey','Grey',{'--fl1':'#9a9a9f','--fl2':'#8d8d92'}],['ebony','Ebony',{'--fl1':'#2e2019','--fl2':'#261a14','--base':'#3d3128'}],['slate','Slate',{'--fl1':'#4a4d55','--fl2':'#41444b','--base':'#5b5e66'}],['darktiles','Dark tiles',{'--floorbg':'repeating-conic-gradient(#3a3a3f 0 25%,#26262a 0 50%) 0 0/60px 60px','--base':'#4a4a50'}],['tiles','Checked tiles',{'--floorbg':'repeating-conic-gradient(#e8e4dc 0 25%,#b9b3a6 0 50%) 0 0/60px 60px'}]]},
 {k:'window',l:'Window',i:[['def','Arched',{}],['sq','Square',{'--wr':'4px','--wrm':'4px'}],['round','Round',{'--wr':'50%','--wrm':'50%'}],['none','No window',{'--wind':'none'}]]},
 {k:'view',l:'Window view',i:[['live','Live (time & weather)',{}],['def','Default',{}],['day','Sunny day',{'--sky1':'#8fc7ee','--sky2':'#e8f5ff','--orb':'#fff3b0','--cloud':'rgba(255,255,255,.8)'}],['dusk','Sunset',{'--sky1':'#5b4b8a','--sky2':'#f4a259','--orb':'#ffd6a5','--cloud':'rgba(255,255,255,.25)'}],['night','Night',{'--sky1':'#111a33','--sky2':'#2d3c6b','--orb':'#f4f1de','--cloud':'rgba(255,255,255,.12)'}]]},
 {k:'nightroom',l:'Room at night',i:[['on','Gets darker at night',{}],['off','Always bright',{}]]},
 {k:'rug',l:'Rug',i:[['def','Striped',{}],['red','Red',{'--rugbg':'#a4552b'}],['blue','Blue',{'--rugbg':'#2f4b6e'}],['green','Green',{'--rugbg':'#3f6b4f'}],['wine','Burgundy',{'--rugbg':'#5e1f2a'}],['navy','Navy',{'--rugbg':'#1f2c45'}],['charcoal','Charcoal',{'--rugbg':'#33343a'}],['check','Checked',{'--rugbg':'repeating-conic-gradient(#c9a37a 0 25%,#7c4a2a 0 50%) 0 0/26px 26px'}],['none','No rug',{'--rugd':'none'}]]},
 {h:'Furniture & decor'},
 {k:'wood',l:'Bookshelf',i:[['def','Default',{}],['oak','Oak',{'--wood':'#c58f55','--wood2':'#94663a'}],['walnut','Walnut',{'--wood':'#5a3b26','--wood2':'#3b2415'}],['white','White',{'--wood':'#f2efe9','--wood2':'#cfc9bd'}],['black','Black',{'--wood':'#3a3a3f','--wood2':'#1f1f23'}],['espresso','Espresso',{'--wood':'#3b2a20','--wood2':'#24170f'}],['forest','Forest green',{'--wood':'#2f4a3a','--wood2':'#1f3327'}],['navy','Navy',{'--wood':'#2a3550','--wood2':'#1a2236'}],['pink','Pink',{'--wood':'#e8b4bc','--wood2':'#c98d97'}]]},
 {k:'plant',l:'Plant',i:[['leafy','Leafy',{}],['cactus','Cactus',{}],['flowers','Flowers',{}],['succulent','Succulent',{}],['none','No plant',{'--plantd':'none'}]]},
 {k:'pot',l:'Plant pot',i:[['def','Terracotta',{}],['white','White',{'--pot':'#e9e4d8','--pot2':'#faf6ec'}],['blue','Blue',{'--pot':'#4a6fa5','--pot2':'#5f86c0'}],['black','Black',{'--pot':'#34343a','--pot2':'#484850'}],['green','Dark green',{'--pot':'#2f4a3a','--pot2':'#3d5e4a'}]]},
 {k:'lamp',l:'Lamp',i:tog('--lampd')},
 {k:'frame',l:'Picture frame',i:tog('--framed')},
 {k:'stack',l:'Book stack',i:tog('--stackd')},
 {k:'season',l:'Seasonal decorations',i:[['show','Show',{}],['hide','Hide',{}]]},
 {h:'Little friend'},
 {k:'clock',l:'Clock',i:[['round','Round',{}],['minimal','Minimal',{}],['roman','Roman numerals',{}],['digital','Digital',{}],['flip','Flip clock',{}],['none','No clock',{}]]},
 {k:'clockc',l:'Clock color',i:[['def','Match the room',{'--ck1':'#fbf6ea','--ck2':'var(--base)','--ck3':'#3b2c20','--ck4':'#c0392b'}],['wood','Wood',{'--ck1':'#ecd8b4','--ck2':'#7a4f2b','--ck3':'#3b2414','--ck4':'#a8322b'}],['black','Black',{'--ck1':'#1c1c1f','--ck2':'#0a0a0b','--ck3':'#f2f2f2','--ck4':'#ff5a4a'}],['brass','Brass',{'--ck1':'#f6ecd2','--ck2':'#b08a3e','--ck3':'#3a2e14','--ck4':'#8a5a12'}],['mint','Mint',{'--ck1':'#e3f3ea','--ck2':'#6fae8f','--ck3':'#1f4635','--ck4':'#e07a5f'}],['rose','Rose',{'--ck1':'#fbe6e6','--ck2':'#d48b95','--ck3':'#5a2a33','--ck4':'#b8324a'}],['navy','Navy & gold',{'--ck1':'#1f2a44','--ck2':'#c9a85a','--ck3':'#f1e7cf','--ck4':'#e8c46a'}],['white','White',{'--ck1':'#ffffff','--ck2':'#e2e2e2','--ck3':'#222222','--ck4':'#2a7de1'}]]},
 {k:'therm',l:'Temperature',i:[['tube','Thermometer',{}],['dial','Dial',{}],['digital','Digital',{}],['sign','Hanging sign',{}],['none','No temperature',{}]]},
 {k:'thermc',l:'Temperature color',i:[['def','Match the room',{'--th1':'#fbf6ea','--th2':'var(--base)','--th3':'#3b2c20','--th4':'#c0392b'}],['wood','Wood',{'--th1':'#ecd8b4','--th2':'#7a4f2b','--th3':'#3b2414','--th4':'#a8322b'}],['black','Black',{'--th1':'#1c1c1f','--th2':'#0a0a0b','--th3':'#f2f2f2','--th4':'#ff5a4a'}],['brass','Brass',{'--th1':'#f6ecd2','--th2':'#b08a3e','--th3':'#3a2e14','--th4':'#8a5a12'}],['mint','Mint',{'--th1':'#e3f3ea','--th2':'#6fae8f','--th3':'#1f4635','--th4':'#e07a5f'}],['rose','Rose',{'--th1':'#fbe6e6','--th2':'#d48b95','--th3':'#5a2a33','--th4':'#b8324a'}],['navy','Navy & gold',{'--th1':'#1f2a44','--th2':'#c9a85a','--th3':'#f1e7cf','--th4':'#e8c46a'}],['white','White',{'--th1':'#ffffff','--th2':'#e2e2e2','--th3':'#222222','--th4':'#2a7de1'}]]},
 {k:'pet',l:'Animal',i:[['cat','Cat',{}],['dog','Dog',{}],['bird','Bird',{}],['turtle','Turtle',{}],['fox','Fox',{}],['hedgehog','Hedgehog',{}],['axolotl','Axolotl',{}],['frog','Frog',{}],['owl','Owl',{}],['bunny','Bunny',{}],['alpaca','Alpaca',{}],['dragon','Dragon',{}],['none','No animal',{'--catd':'none'}]]},
 {k:'bowls',l:'Food and water bowls',i:[['show','Show',{}],['hide','Hide',{'--bowld':'none'}]]},
 {k:'coat',l:'Colour',i:[['def','Natural',{}],['orange','Orange',{'--cat':'#e0842f','--cat-st':'#a85a16'}],['black','Black',{'--cat':'#2b2b31','--cat-st':'#3d3d46','--cat-eye':'#f2d64b','--cat-nose':'#e8a0a8'}],['grey','Grey',{'--cat':'#8d939c','--cat-st':'#727882'}],['white','White',{'--cat':'#f0ece4','--cat-st':'#b3a995'}],['brown','Brown',{'--cat':'#8a5a35','--cat-st':'#5c3a20'}],['blue','Blue',{'--cat':'#5b8fd6','--cat-st':'#3b64a6'}],['pink','Pink',{'--cat':'#f0a5c0','--cat-st':'#d1739a'}]]},
 {k:'sound',l:'Sounds',i:[['off','Off',{}],['on','On',{}]]}
];
const ALLV=[...new Set(OPTS.flatMap(o=>(o.i||[]).flatMap(it=>Object.keys(it[2]))))];
const sid=k=>{const o=OPTS.find(x=>x.k===k);return o.i.some(it=>it[0]===look[k])?look[k]:o.i[0][0]};
const PETNAME={cat:['cat','\u{1F431}'],dog:['dog','\u{1F436}'],bird:['bird','\u{1F426}'],turtle:['turtle','\u{1F422}'],fox:['fox','\u{1F98A}'],hedgehog:['hedgehog','\u{1F994}'],axolotl:['axolotl','\u{1F98E}'],frog:['frog','\u{1F438}'],owl:['owl','\u{1F989}'],bunny:['bunny','\u{1F430}'],alpaca:['alpaca','\u{1F999}'],dragon:['dragon','\u{1F409}']};
function applyLook(){
 const r=document.documentElement;ALLV.forEach(v=>r.style.removeProperty(v));
 OPTS.forEach(o=>{if(!o.k)return;const it=o.i.find(x=>x[0]===sid(o.k));Object.entries(it[2]).forEach(([p,v])=>r.style.setProperty(p,v))});
 $('plant').innerHTML=PLANTS[sid('plant')]||'';
 try{liveSky()}catch(e){}
 try{buildWidgets()}catch(e){}
 try{const tc=document.querySelector('meta[name=theme-color]'),w2=getComputedStyle(document.documentElement).getPropertyValue('--wood2').trim();if(tc&&w2)tc.content=w2}catch(e){}
 try{document.body.classList.toggle('nightroom',sid('nightroom')==='on');const lp=$('lamp');document.body.classList.toggle('nolamp',!lp||getComputedStyle(lp).display==='none')}catch(e){}
 try{applySeason()}catch(e){}
 const pet=sid('pet'),an=ANIMALS[pet];if(an){cat.style.cssText=an[0];cat.innerHTML=an[1]}
 const nm=PETNAME[pet];$('mvcat').hidden=!nm;if(nm){$('mvcat').textContent=nm[1]+' '+L('Move the '+nm[0]);cat.setAttribute('aria-label',L(nm[0][0].toUpperCase()+nm[0].slice(1))+' '+L('(tap me)'))}
}
const SP={sill:'.window',top:'.case',want:'#wantcase',floor:'.floor',rug:'.rug'};
const avail=k=>!(k==='sill'&&sid('window')==='none')&&!(k==='rug'&&sid('rug')==='none');
var petPlace=null;
function petEdges(el,kind,w){const pad=kind==='sill'?-14:6;return [pad,Math.max(pad,el.clientWidth-w-pad)]}
function placePet(el,kind,ratio,zone,idx){
 el.append(catw);catw.dataset.spot=kind;petReset();
 const w=catw.offsetWidth||52,pad=kind==='sill'?-14:6;ratio=Math.max(0,Math.min(1,ratio));
 catw.style.left=`calc(${pad}px + ${ratio.toFixed(4)} * (100% - ${w+2*pad}px))`;
 petPlace={kind,ratio,zone,idx};lastSpot=kind;try{localStorage.setItem(CK,kind)}catch(e){}}
function rowInfo(row){const z=row.dataset.zone;return [z,[...document.querySelectorAll('.scene [data-zone="'+z+'"]:is(.dz,.pz)')].indexOf(row)]}
function moveCat(here){
 try{if(!SV.querySelector('.card'))renderStats();if(!GV.querySelector('.card'))renderGoals()}catch(e){}
 const cur=['room','stats','goals'].includes(view)?view:'room';
 const wall=here?cur:(Math.random()<.62?'room':Math.random()<.5?'stats':'goals'),ratio=.1+Math.random()*.8;
 if(wall==='room'){
  const rows=[...document.querySelectorAll('.scene .dz,.scene .pz')];
  const c=['sill','top','want','floor','rug','row'].filter(k=>(k==='row'?rows.length:avail(k))&&k!==lastSpot);
  const k=c[Math.floor(Math.random()*c.length)]||'floor';
  if(k==='row'){const r=rows[Math.floor(Math.random()*rows.length)],[z,i]=rowInfo(r);placePet(r,'row',ratio,z,i)}
  else placePet(document.querySelector(SP[k]),k,ratio)}
 else{const w=wall==='goals'?GV:SV,cards=[...w.querySelectorAll('.card')],opts=['wfloor','card'].concat(wall==='goals'?['wrug']:[]).filter(k=>k!==lastSpot);
  const k=opts[Math.floor(Math.random()*opts.length)]||'wfloor';
  if(k==='card'&&cards.length){const i=Math.floor(Math.random()*cards.length);placePet(cards[i],'card',ratio,wall,i)}
  else if(k==='wrug')placePet(w.querySelector('.wallfloor .rug'),'wrug',ratio,wall);
  else placePet(w.querySelector('.wallfloor'),'wfloor',ratio,wall)}
 cat.classList.remove('arrive');void cat.getBoundingClientRect();cat.classList.add('arrive');
 petNext(2500+Math.random()*3000)
}
/* remember where the animal really is (after walking around), so redrawing the shelves puts it back on the same spot instead of where it first sat */
function petSync(){
 if(!petPlace||!catw.parentElement||catw.parentElement===document.body||catw.classList.contains('travel')||!catw.isConnected)return;
 const par=catw.parentElement,pr=par.getBoundingClientRect(),cr=catw.getBoundingClientRect();if(!pr.width)return;
 const pad=catw.dataset.spot==='sill'?-14:6,w=catw.offsetWidth||52;
 petPlace.ratio=Math.max(0,Math.min(1,(cr.left-pr.left-pad)/Math.max(1,pr.width-w-2*pad)))}
function petAfterRender(){
 if(!petPlace||document.body.contains(catw))return;
 if(petPlace.kind==='card'){const w=petPlace.zone==='goals'?GV:SV,cards=[...w.querySelectorAll('.card')];
  if(cards.length){const i=Math.min(petPlace.idx||0,cards.length-1);placePet(cards[i],'card',petPlace.ratio,petPlace.zone,i)}else placePet(w.querySelector('.wallfloor'),'wfloor',petPlace.ratio,petPlace.zone);return}
 const rows=[...document.querySelectorAll('.scene [data-zone="'+petPlace.zone+'"]:is(.dz,.pz)')];
 if(rows.length){const r=rows[Math.min(petPlace.idx,rows.length-1)];placePet(r,'row',petPlace.ratio,petPlace.zone,rows.indexOf(r))}
 else placePet(document.querySelector('.floor'),'floor',petPlace.ratio);
 petNext(3000)}
/* ---------- pick up and drop the animal anywhere ---------- */
let petDrag=null,petDragged=false;
const land=document.createElement('div');land.className='land';document.body.append(land);
function perches(){
 const L=[],add=(el,kind,line)=>{if(!el||el.offsetParent===null)return;const r=el.getBoundingClientRect();L.push({el,kind,r,line:line(r)})};
 if(typeof view==='string'&&view!=='room'){const w=view==='goals'?GV:SV;
  w.querySelectorAll('.card').forEach(c=>add(c,'card',r=>r.top+6));add(w.querySelector('.wallfloor'),'wfloor',r=>r.top+24);add(w.querySelector('.wallfloor .rug'),'wrug',r=>r.bottom-6);return L}
 if(avail('sill'))add(document.querySelector('.window'),'sill',r=>r.bottom+9);
 add(document.querySelector('.case'),'top',r=>r.top+2);
 add($('wantcase'),'want',r=>r.top+2);
 document.querySelectorAll('.scene .dz,.scene .pz').forEach(r=>add(r,'row',q=>q.bottom));
 add(document.querySelector('.floor'),'floor',r=>r.top+24);
 if(avail('rug'))add(document.querySelector('.rug'),'rug',r=>r.bottom-6);
 return L}
function perchAt(x,feet){
 let best=null,bd=1e9;
 perches().forEach(p=>{if(x<p.r.left-8||x>p.r.right+8)return;const d=p.line-feet;if(d<-26)return;if(d<bd){bd=d;best=p}});
 return best||perches().find(p=>p.kind==='floor'||p.kind==='wfloor')}
catw.addEventListener('pointerdown',e=>{if(e.button>0||petDrag||petBusy)return;petDrag={id:e.pointerId,touch:e.pointerType!=='mouse',x:e.clientX,y:e.clientY,on:false,g:null,t:null}});
function petHold(){
 const d=petDrag;d.on=true;clearTimeout(petT);catw.classList.remove('walking','sleeping');cat.classList.remove('arrive','hop','landed');
 const g=catw.cloneNode(true);g.removeAttribute('id');g.className='catw ghost';g.querySelectorAll('.heart,.alert').forEach(h=>h.remove());
 g.style.cssText=catw.style.cssText;g.style.width=(catw.offsetWidth||52)+'px';g.style.left='0';g.style.top='0';g.style.bottom='auto';g.style.visibility='';
 const a=document.createElement('b');a.className='alert';a.textContent='!';g.append(a);setTimeout(()=>a.remove(),900);
 document.body.append(g);d.g=g;d.sv=g.querySelector('.cat');d.off=d.touch?26:12;d.gh=d.sv.getBoundingClientRect().height||48;d.sv.style.transformOrigin=`50% ${-d.off}px`;d.th=0;d.om=0;d.vx=0;d.lx=d.x;d.lt=performance.now();
 catw.style.visibility='hidden';if(navigator.vibrate)navigator.vibrate(10);
 const tick=t=>{if(petDrag!==d)return;
  const dt=Math.min(.05,(t-(d.ft||t))/1000)||.016;d.ft=t;
  d.vx*=Math.pow(.02,dt);                       /* speed fades when the pointer stops */
  const target=Math.max(-40,Math.min(40,-d.vx*.045));
  d.om+=(-60*(d.th-target)-5*d.om)*dt;d.th+=d.om*dt;  /* springy pendulum */
  if(!reduce)d.sv.style.transform=`rotate(${d.th.toFixed(2)}deg)`;
  const E=90,py=d.py==null?d.y:d.py;let v=0;
  if(py<E)v=-Math.ceil((E-py)/E*16);else if(py>innerHeight-E)v=Math.ceil((py-(innerHeight-E))/E*16);
  const sc=typeof view==='string'&&view!=='room'?(view==='goals'?GV:SV):null;
  if(v&&!turning()){if(sc){const y0=sc.scrollTop;sc.scrollTop+=v;if(sc.scrollTop!==y0)petMove(d.px,py)}else{const y0=RV.scrollTop;RV.scrollTop+=v;if(RV.scrollTop!==y0)petMove(d.px,py)}}
  if(!turning()&&d.px!=null){const ex=d.px<34?-1:d.px>innerWidth-34?1:0,k=WALLS[view]+ex;
   if(!ex)d.edgeLock=false;
   if(ex&&!d.edgeLock&&Math.abs(k)<=1){d.edgeT=(d.edgeT||0)+dt;if(d.edgeT>.55){d.edgeT=0;d.edgeLock=true;land.style.display='none';go(k)}}else d.edgeT=0}
  requestAnimationFrame(tick)};
 requestAnimationFrame(tick)}
function petMove(x,y){
 const d=petDrag,w=d.g.offsetWidth,now=performance.now(),dt=Math.max(1,now-d.lt);
 if(x!==d.lx||dt>30){d.vx=d.vx*.6+((x-d.lx)/dt*1000)*.4;d.lx=x;d.lt=now}
 d.gx=x-w/2;d.gy=y+d.off;d.g.style.transform=`translate(${d.gx}px,${d.gy}px)`;
 d.px=x;d.py=y;if(turning()){land.style.display='none';return}
 const p=perchAt(x,d.gy+d.gh-4);d.p=p;
 if(p){land.style.display='block';land.style.left=Math.max(p.r.left+14,Math.min(p.r.right-14,x))+'px';land.style.top=p.line+'px'}}
document.addEventListener('pointermove',e=>{
 const d=petDrag;if(!d||e.pointerId!==d.id)return;
 if(!d.on){if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<6)return;petHold()}
 e.preventDefault();petMove(e.clientX,e.clientY)},{passive:false});
function petDrop(){
 const d=petDrag;if(!d||!d.on){petDrag=null;return}
 if(turning()){setTimeout(petDrop,90);return}
 petDrag=null;
 petDragged=true;setTimeout(()=>{petDragged=false},80);
 land.style.display='none';
 const p=perchAt(d.px,(d.gy||d.y)+(d.gh||48));
 if(p){const w=catw.offsetWidth||52,[lo,hi]=petEdges(p.el,p.kind,w),left=d.px-p.r.left-w/2,ratio=hi>lo?(left-lo)/(hi-lo):.5;
  if(p.kind==='row'){const [z,i]=rowInfo(p.el);placePet(p.el,'row',ratio,z,i)}
  else if(p.kind==='card'){const w=view==='goals'?GV:SV;placePet(p.el,'card',ratio,view,[...w.querySelectorAll('.card')].indexOf(p.el))}
  else if(p.kind==='wfloor'||p.kind==='wrug')placePet(p.el,p.kind,ratio,view);
  else placePet(p.el,p.kind,ratio)}
 catw.style.visibility='hidden';
 const finish=()=>{d.g.remove();catw.style.visibility='';
  if(!reduce){cat.classList.remove('arrive','hop','landed');void cat.getBoundingClientRect();cat.classList.add('landed')}
  petNext(4000+Math.random()*3000)};
 if(reduce||d.gx===undefined){finish();return}
 /* fall from where it was let go onto its spot, speeding up like gravity */
 const r=catw.getBoundingClientRect(),dy=r.top-d.gy,dx=r.left-d.gx,dist=Math.hypot(dx,dy);
 const dur=Math.max(160,Math.min(560,Math.sqrt(Math.abs(dy)+20)*26));
 d.sv.animate([{transform:`rotate(${d.th}deg)`},{transform:'rotate(0deg)'}],{duration:dur*.8,easing:'ease-out',fill:'forwards'});
 const an=d.g.animate([{transform:`translate(${d.gx}px,${d.gy}px)`},{transform:`translate(${r.left}px,${r.top}px)`}],
  {duration:dist<4?60:dur,easing:dy>0?'cubic-bezier(.45,0,.95,.55)':'ease-out',fill:'forwards'});
 an.onfinish=finish;an.oncancel=finish}
document.addEventListener('pointerup',e=>{if(petDrag&&e.pointerId===petDrag.id)petDrop()});
document.addEventListener('pointercancel',e=>{if(petDrag&&e.pointerId===petDrag.id)petDrop()});
document.addEventListener('touchmove',e=>{if(petDrag&&petDrag.on&&e.touches.length<2)e.preventDefault()},{passive:false});
$('set').onclick=()=>{buildPanel();$('lov').classList.add('on');keepSafe().then(ok=>{$('safe').textContent=ok?L('\u2713 Your browser has agreed to keep your saved books safe from automatic cleanup. Still export backups now and then.'):L('Your browser hasn\u2019t confirmed it will protect your saved books from automatic cleanup. Installing the app to your home screen helps, and export backups now and then.')})};
$('lclose').onclick=()=>$('lov').classList.remove('on');
$('lov').onclick=e=>{if(e.target===$('lov'))$('lov').classList.remove('on')};
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('lov').classList.remove('on')});
$('mvcat').onclick=()=>moveCat(true);
$('rst').onclick=()=>{look={};try{localStorage.removeItem(LK)}catch(e){}applyLook();buildPanel()};
/* coming back to the app: the animal stays where it was (it used to jump somewhere new, which looked like teleporting) */
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!petBusy)petNext(4000)});
/* ---------- little friend's routine: wander, sit, nap ---------- */
let petT=null,petX=0,petDir=1;
['animationend','animationcancel'].forEach(ev=>cat.addEventListener(ev,e=>{if(e.target===cat&&(e.animationName==='arrive'||e.animationName==='hop'||e.animationName==='landed'))cat.classList.remove('arrive','hop','landed')}));
for(let i=0;i<2;i++){const z=document.createElement('i');z.className='zz';z.textContent='z';catw.append(z)}
function petReset(){clearTimeout(petT);petX=0;petDir=1;eatTok++;document.querySelectorAll('.bowl.nom').forEach(b=>b.classList.remove('nom'));catw.classList.remove('walking','sleeping','eating');catw.style.setProperty('--walk','0s');catw.style.setProperty('--px','0px');catw.style.setProperty('--dir','1')}
function petRange(){
 const par=catw.parentElement,base=catw.offsetLeft,w=catw.offsetWidth,spot=catw.dataset.spot;
 const pad=spot==='sill'?-14:6;
 return [pad-base,par.clientWidth-pad-base-w]}
function petNext(ms){clearTimeout(petT);petT=setTimeout(petAct,ms)}
function petAct(){
 cat.classList.remove('arrive','hop','landed');
 if(reduce||document.hidden||drag||petDrag||petBusy){petNext(8000);return}
 /* the animal is on another wall than the one you're looking at: now and then it comes over by itself */
 if(!['room','stats','goals'].includes(view)){petNext(8000);return}
 if(catw.offsetParent===null||petWall()!==(typeof view==='string'?view:'room')){if(Math.random()<.1&&petCome())return;petNext(8000);return}
 if(catw.classList.contains('eating'))return;
 if(canEat()&&Date.now()-lastMeal>45e3&&Math.random()<(catw.dataset.spot==='floor'?.22:.07)){goEat();return}
 if(catw.classList.contains('sleeping')){
  if(Math.random()<.35){petNext(8000+Math.random()*10000);return}
  catw.classList.remove('sleeping');petNext(2500+Math.random()*3000);return}
 /* not often: go somewhere else on this wall, or leave for another wall */
 {const rr=Math.random();if(rr<.012&&petLeave())return;if(rr<(sid('pet')==='dragon'?.3:.05)&&petTrip())return}
 const [lo,hi]=petRange(),room=hi-lo,r=Math.random();
 if(room>40&&r<.55){
  let to=lo+Math.random()*room;
  if(Math.abs(to-petX)<30)to=Math.min(hi,Math.max(lo,petX+(to<petX?-60:60)));
  const d=Math.abs(to-petX),t=Math.max(.8,d/38);
  petDir=to>petX?-1:1;petX=to;
  catw.style.setProperty('--dir',petDir);catw.style.setProperty('--walk',t+'s');catw.style.setProperty('--px',to+'px');
  catw.classList.add('walking');
  setTimeout(()=>{catw.classList.remove('walking');catw.style.setProperty('--walk','0s')},t*1000);
  petNext(t*1000+2000+Math.random()*4000);
 }else if(r<.8){
  catw.classList.add('sleeping');petNext(12000+Math.random()*14000);
 }else petNext(3000+Math.random()*4000);
}
/* ---------- now and then the animal goes somewhere else, the way that animal would:
   cats and foxes jump, bunnies and frogs hop, birds and owls fly; dogs, hedgehogs, turtles and axolotls walk and stay on the ground ---------- */
const PETWAY={cat:'jump',fox:'jump',bunny:'hop',frog:'hop',bird:'fly',owl:'fly',dog:'walk',hedgehog:'walk',turtle:'walk',axolotl:'walk',alpaca:'walk',dragon:'fly'};
const PETSPEED={cat:120,fox:130,dog:70,hedgehog:34,turtle:15,axolotl:22,alpaca:50};
const GROUND=['floor','rug','wfloor','wrug'];
const petWay=()=>PETWAY[sid('pet')]||'walk';
const petWall=()=>GV.contains(catw)?'goals':SV.contains(catw)?'stats':'room';
let petBusy=false;
function petSpots(wall,all){
 const out=[];
 if(wall==='room'){['sill','top','want','floor','rug'].forEach(k=>{const el=avail(k)&&document.querySelector(SP[k]);if(el)out.push({el,kind:k})});
  document.querySelectorAll('.scene .dz,.scene .pz').forEach(r=>{const [z,i]=rowInfo(r);out.push({el:r,kind:'row',zone:z,idx:i})})}
 else{const w=wall==='goals'?GV:SV;w.querySelectorAll('.card').forEach((c,i)=>out.push({el:c,kind:'card',zone:wall,idx:i}));
  const f=w.querySelector('.wallfloor');if(f)out.push({el:f,kind:'wfloor',zone:wall});
  const rg=wall==='goals'&&w.querySelector('.wallfloor .rug');if(rg)out.push({el:rg,kind:'wrug',zone:wall})}
 return out.filter(t=>all||petWay()!=='walk'||GROUND.includes(t.kind))}
/* the path, as keyframes measured from where it ends up */
function petPath(way,dx,dy,s0=1){
 const [kf,dur]=petPath0(way,dx,dy),n=kf.length;
 if(Math.abs(s0-1)>.01)kf.forEach((k,i)=>{k.transform+=` scale(${(s0+(1-s0)*i/(n-1)).toFixed(3)})`});
 return[kf,dur]}
function petPath0(way,dx,dy){
 const d=Math.hypot(dx,dy),T=(x,y)=>({transform:`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`}),arc=(up,n)=>{const kf=[];for(let i=0;i<=n;i++){const p=i/n,q=1-p;kf.push(T(dx*q,dy*q-up*Math.sin(Math.PI*p)))}return kf};
 /* a row of little hops only makes sense along a surface: between two heights it looked like bouncing on thin air, so going up or down is one single leap */
 if(way==='hop'&&Math.abs(dy)>30)way='jump';
 if(way==='fly')return[arc(50+d*.25,12),Math.min(2800,1100+d*2)];
 if(way==='jump')return[arc(34+Math.max(0,-dy)*.25+d*.08,12),Math.min(1200,520+d*.8)];
 if(way==='hop'){const n=Math.max(2,Math.min(7,Math.round(d/60))),h=18+Math.max(0,-dy)/n*.6,kf=[];
  for(let i=0;i<=n*4;i++){const p=i/(n*4),q=1-p;kf.push(T(dx*q,dy*q-h*Math.abs(Math.sin(Math.PI*p*n))))}return[kf,n*420]}
 return[[T(dx,dy),T(0,0)],Math.max(900,d/(PETSPEED[sid('pet')]||40)*1000)]}
/* carry the animal along a path above everything, from rect a to rect b (feet to feet), growing or shrinking smoothly on the way */
function petFly(a,b,way,dir,done){
 petBusy=true;const spot=catw.dataset.spot;
 /* travel inside the wall itself (not pinned to the screen), so if you scroll while it moves, it stays on its path in the room */
 const host=[RV,GV,SV].find(w=>w.contains(catw))||RV,hr=host.getBoundingClientRect();
 host.append(catw);catw.classList.add('travel');catw.dataset.spot=spot;catw.style.left=(b.left-hr.left+host.scrollLeft)+'px';catw.style.top=(b.top-hr.top+host.scrollTop)+'px';catw.style.transformOrigin='50% 100%';
 catw.style.setProperty('--dir',dir);catw.classList.toggle('walking',way==='walk');catw.classList.toggle('flying',way==='fly');
 /* the animal is mirrored when it faces the other way, so the sideways part of the path is mirrored too */
 const dx=(a.left+a.width/2)-(b.left+b.width/2),dy=a.bottom-b.bottom,s0=b.width?a.width/b.width:1;
 /* start already at the first point of the path: an animation only kicks in on the next frame, and for that one frame the animal showed where it was going */
 /* the trip is driven through plain numbers (--tx, --ty, --tsc) instead of animating the transform itself: an animated transform gets its own drawing layer, and on some phones the books next to the animal blinked when that layer came and went */
 const [kf0,dur]=petPath(way,dx*dir,dy,s0),kf=kf0.map(k=>{const m=/translate\(([-\d.]+)px,([-\d.]+)px\)(?: scale\(([-\d.]+)\))?/.exec(k.transform)||[0,0,0,1];return{'--tx':m[1]+'px','--ty':m[2]+'px','--tsc':m[3]||1}});
 const setK=k=>Object.entries(k).forEach(([p,v])=>catw.style.setProperty(p,v));setK(kf[0]);catw.style.transform='translate(var(--tx),var(--ty)) scale(var(--tsc))';const an=catw.animate(kf,{duration:dur,easing:way==='walk'?'linear':'ease-in-out'});
 let ended=false;const fin=()=>{if(ended)return;ended=true;catw.style.transform='';['--tx','--ty','--tsc'].forEach(p=>catw.style.removeProperty(p));catw.classList.remove('travel','walking','flying');catw.style.top='';catw.style.transformOrigin='';catw.style.setProperty('--dir',1);petBusy=false;done()};
 an.onfinish=fin;an.oncancel=fin}
const landSquash=()=>{cat.classList.remove('landed');void cat.getBoundingClientRect();cat.classList.add('landed')};
/* how far each kind of animal can go in one go (screen pixels): up, down, total. Birds fly anywhere. */
const REACH={jump:[230,260,330],hop:[110,220,280]};
/* roughly where the feet would land on a spot, picking the point of that spot closest to where the animal is */
function petLanding(t,from){
 const r=t.el.getBoundingClientRect(),y=t.kind==='row'||t.kind==='sill'?r.bottom:t.kind==='rug'||t.kind==='wrug'?r.top+r.height/2:r.top;
 const fx=from.left+from.width/2,ratio=Math.max(.05,Math.min(.95,(fx-r.left)/Math.max(1,r.width)+(Math.random()-.5)*.3));
 return{ratio,x:r.left+ratio*r.width,y}}
/* go to another spot on the same wall: one you can see, and one this animal could really reach */
function petTrip(){
 const way=petWay();if(way==='walk'&&!GROUND.includes(catw.dataset.spot))return false;
 const a=catw.getBoundingClientRect(),fx=a.left+a.width/2,fy=a.bottom,R=REACH[way];
 const opts=petSpots(petWall()).filter(t=>t.el!==catw.parentElement).map(t=>({...t,...petLanding(t,a)})).filter(t=>{
  if(t.y<40||t.y>innerHeight-10)return false;if(!R)return true;
  const up=fy-t.y,dn=t.y-fy,d=Math.hypot(t.x-fx,t.y-fy);return up<=R[0]&&dn<=R[1]&&d<=R[2]&&d>30});
 if(!opts.length)return false;
 const t=opts[Math.floor(Math.random()*opts.length)];
 placePet(t.el,t.kind,t.ratio,t.zone,t.idx);const b=catw.getBoundingClientRect();
 petFly(a,b,way,(a.left+a.width/2)>(b.left+b.width/2)?1:-1,()=>{
  if(t.el.isConnected)placePet(t.el,t.kind,t.ratio,t.zone,t.idx);else placePet(document.querySelector('.floor'),'floor',.5);
  if(way==='jump'||way==='hop')landSquash();petNext(4000+Math.random()*5000)});
 return true}
/* leave for the next wall: off the side of the screen along the floor (birds can fly off from anywhere); it'll be over there when you turn */
function petLeave(){
 const way=petWay();if(way!=='fly'&&!GROUND.includes(catw.dataset.spot))return false;
 try{if(!SV.querySelector('.card'))renderStats();if(!GV.querySelector('.card'))renderGoals()}catch(e){}
 const wall=petWall(),dest=wall==='room'?(Math.random()<.5?'stats':'goals'):'room',side=wall==='room'?(dest==='stats'?1:-1):(wall==='stats'?-1:1);
 const opts=petSpots(dest).filter(t=>way==='fly'||GROUND.includes(t.kind));if(!opts.length)return false;const t=opts[Math.floor(Math.random()*opts.length)];
 const a=catw.getBoundingClientRect(),x=side>0?innerWidth+40:-a.width-40,y=way==='fly'?Math.max(10,a.top-140):a.top;
 petFly(a,{left:x,top:y,width:a.width,height:a.height,bottom:y+a.height},way==='jump'?'walk':way,side>0?-1:1,()=>{placePet(t.el,t.kind,.1+Math.random()*.8,t.zone,t.idx);petNext(6000)});
 return true}
/* come over from another wall: in from the side of the screen it would come from */
function petCome(toFloor,after){
 if(turning())return false;
 if(!['room','stats','goals'].includes(view))return false;const vw=typeof view==='string'?view:'room',pw=petWall(),order={goals:-1,room:0,stats:1};if(vw===pw)return false;
 const way=petWay(),side=order[pw]>order[vw]?1:-1;
 try{if(vw!=='room'&&!(vw==='goals'?GV:SV).querySelector('.card'))vw==='goals'?renderGoals():renderStats()}catch(e){}
 const opts=petSpots(vw).filter(t=>(way==='fly'||GROUND.includes(t.kind))&&(!toFloor||t.kind==='floor')).map(t=>({...t,...petLanding(t,{left:side>0?innerWidth:0,width:0})})).filter(t=>toFloor||(t.y>60&&t.y<innerHeight-6));
 if(!opts.length)return false;
 const t=opts[Math.floor(Math.random()*opts.length)];placePet(t.el,t.kind,t.ratio,t.zone,t.idx);const b=catw.getBoundingClientRect();
 const x=side>0?innerWidth+40:-b.width-40,y=way==='fly'?Math.max(10,b.top-140):b.top;
 petFly({left:x,top:y,width:b.width,height:b.height,bottom:y+b.height},b,way==='jump'?'walk':way,side>0?1:-1,()=>{
  if(t.el.isConnected)placePet(t.el,t.kind,t.ratio,t.zone,t.idx);else placePet(document.querySelector('.floor'),'floor',.5);if(after)after();else petNext(5000+Math.random()*4000)});
 return true}
/* get down to the floor from wherever the animal is: one reachable jump/hop at a time, always going lower, until the floor is in reach */
function petToFloor(ratio,done,n=0){
 const floor=document.querySelector('.floor');
 if(!floor||catw.parentElement===floor){done();return}
 /* animals that walk but were put up high climb down in small hops */
 const way=petWay()==='walk'&&!GROUND.includes(catw.dataset.spot)?'hop':petWay(),a=catw.getBoundingClientRect(),fr=floor.getBoundingClientRect(),w=a.width||52;
 const tx=fr.left+6+ratio*Math.max(1,fr.width-w-12)+w/2,ty=fr.top;
 const fx=a.left+a.width/2,fy=a.bottom,R=REACH[way];
 const ok=(x,y)=>{if(!R)return true;const up=fy-y,dn=y-fy,d=Math.hypot(x-fx,y-fy);return up<=R[0]&&dn<=R[1]&&d<=R[2]};
 const hop=(el,kind,r,zone,idx,next)=>{petBusy=true;placePet(el,kind,r,zone,idx);const b=catw.getBoundingClientRect();
  const mode=way==='walk'||(GROUND.includes(catw.dataset.spot)&&GROUND.includes(kind)&&way!=='fly'&&Math.abs(a.bottom-b.bottom)<30)?'walk':way;
  petFly(a,b,mode,fx>(b.left+b.width/2)?1:-1,()=>{if(el.isConnected)placePet(el,kind,r,zone,idx);else placePet(floor,'floor',ratio);if(mode==='jump'||mode==='hop')landSquash();next()})};
 if(way==='fly'||way==='walk'||n>=8){hop(floor,'floor',ratio,undefined,undefined,done);return}
 /* come down one level at a time: the next surface below, the nearest one sideways, and the floor only when nothing is left in between */
 const opts=petSpots('room',true).filter(t=>t.el!==catw.parentElement&&!GROUND.includes(t.kind)&&t.el.offsetParent!==null).map(t=>({...t,...petLanding(t,a)})).filter(t=>t.y>fy+24&&t.y<ty-24);
 if(!opts.length){hop(floor,'floor',ratio,undefined,undefined,done);return}
 const y0=Math.min(...opts.map(t=>t.y)),t=opts.filter(t=>t.y<=y0+40).sort((p,q)=>Math.abs(p.x-fx)-Math.abs(q.x-fx))[0];
 hop(t.el,t.kind,t.ratio,t.zone,t.idx,()=>setTimeout(()=>petToFloor(ratio,done,n+1),300))}
/* ---------- food and water bowls: the animal wanders over for a snack ---------- */
let eatTok=0,lastMeal=0,bowlLv={day:'',food:3,water:3};
try{bowlLv=Object.assign(bowlLv,JSON.parse(localStorage.getItem('bookshelf-bowls')||'{}'))}catch(e){}
function drawBowls(){if(bowlLv.day!==today()){bowlLv.day=today();bowlLv.food=3;bowlLv.water=3}
 $('foodbowl').style.setProperty('--lv',Math.max(.08,bowlLv.food/3));$('waterbowl').style.setProperty('--lv',Math.max(.1,bowlLv.water/3))}
const canEat=()=>!reduce&&$('roomv').contains(catw)&&getComputedStyle($('bowls')).display!=='none'&&sid('pet')!=='none';
function goEat(which,now){
 if(!canEat()||petBusy)return false;drawBowls();
 if(!which){const opts=['food','water'].filter(k=>bowlLv[k]>0);if(!opts.length){petNext(4000);return false}which=opts[Math.floor(Math.random()*opts.length)]}
 const floor=document.querySelector('.floor');let tok=++eatTok;
 const walkOver=()=>{
  if(tok!==eatTok)return;catw.classList.remove('sleeping');
  const bw=$(which==='food'?'foodbowl':'waterbowl'),fr=floor.getBoundingClientRect(),br=bw.getBoundingClientRect();
  /* walk up so the head is over the bowl, whichever side it comes from, and keep facing it while eating (turning round on arrival looked like the animal vanished and reappeared) */
  const w0=catw.offsetWidth||52,cx0=catw.getBoundingClientRect().left+w0/2,bc=br.left+br.width/2,right=bc>cx0+4,want=bc-fr.left-(right?w0-14:14),[lo,hi]=petRange(),to=Math.max(lo,Math.min(hi,want-catw.offsetLeft)),d=Math.abs(to-petX),t=Math.max(.5,d/60);
  petDir=to>petX?-1:1;petX=to;catw.style.setProperty('--dir',petDir);catw.style.setProperty('--walk',t+'s');catw.style.setProperty('--px',to+'px');catw.classList.add('walking');
  clearTimeout(petT);petT=setTimeout(()=>{if(tok!==eatTok)return;
   catw.classList.remove('walking');catw.style.setProperty('--walk','0s');
   setTimeout(()=>{if(tok!==eatTok)return;catw.classList.add('eating');bw.classList.add('nom');
    const dur=4500+Math.random()*3500;petT=setTimeout(()=>{if(tok!==eatTok)return;catw.classList.remove('eating');bw.classList.remove('nom');
     lastMeal=Date.now();bowlLv[which]=Math.max(0,bowlLv[which]-1);try{localStorage.setItem('bookshelf-bowls',JSON.stringify(bowlLv))}catch(e){}drawBowls();
     petNext(2500+Math.random()*3000)},dur)},260)},t*1000)};
 /* not on the floor yet: get down there the way this animal moves (step by step from high shelves), never by appearing there */
 if(catw.parentElement!==floor){const fr=floor.getBoundingClientRect(),br=$('bowls').getBoundingClientRect(),w=catw.offsetWidth||52;
  catw.classList.remove('sleeping');
  petToFloor(Math.min(1,Math.max(0,(br.right-fr.left+40)/(fr.width-w))),()=>{tok=eatTok;setTimeout(walkOver,350)})}
 else walkOver();
 return true}
document.querySelectorAll('.bowl').forEach(b=>b.onclick=()=>{
 drawBowls();bowlLv.food=3;bowlLv.water=3;try{localStorage.setItem('bookshelf-bowls',JSON.stringify(bowlLv))}catch(e){}drawBowls();try{sfx('pop')}catch(e){}
 b.animate([{'--bty':'0px','--brt':'0deg'},{'--bty':'-4px','--brt':'-4deg'},{'--bty':'0px','--brt':'0deg'}],{duration:300});
 const which=b.id==='foodbowl'?'food':'water';
 /* the animal is on another wall: it comes in from that side along the floor, then goes to the bowl */
 if(sid('pet')!=='none'&&!reduce&&!petBusy&&!$('roomv').contains(catw)){if(petCome(true,()=>goEat(which)))toast(L('Snack time!'));return}
 if(goEat(which))toast(L('Snack time!'))});
drawBowls();
applyLook();
async function keepSafe(){try{if(navigator.storage&&navigator.storage.persist){return (await navigator.storage.persisted())||(await navigator.storage.persist())}}catch(e){}return false}
keepSafe();
if('serviceWorker' in navigator&&location.protocol.indexOf('http')===0){
 /* the app opens from its offline copy, so a new version arrives in the background: when it's ready, offer to switch now */
 const hadSW=!!navigator.serviceWorker.controller;
 navigator.serviceWorker.register('sw.js').then(reg=>{
  /* look for a new version when you come back to the app, not only when it starts */
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reg.update().catch(()=>{})})}).catch(()=>{});
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!hadSW||$('updbar'))return;
  const bar=el('div','updbar');bar.id='updbar';bar.setAttribute('role','status');const go=el('button','',L('Update now')),x=el('button','updx','✕');go.type=x.type='button';x.setAttribute('aria-label',L('Later'));
  go.onclick=()=>location.reload();x.onclick=()=>bar.remove();bar.append(el('span','','✨ '+L('A new version of the app is ready.')),go,x);document.body.append(bar)})}
let busy=false,justDragged=false;
const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
function bookRect(){const r=$('stage').getBoundingClientRect(),w=$('book').offsetWidth||150;return{left:r.left+r.width/2-w/2,top:r.top+r.height/2-110,width:w,height:220}}
const bez=(x1,y1,x2,y2)=>t=>{const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by,X=s=>((ax*s+bx)*s+cx)*s,Y=s=>((ay*s+by)*s+cy)*s;let lo=0,hi=1,s=t;for(let i=0;i<24;i++){const x=X(s);if(Math.abs(x-t)<1e-4)break;if(x>t)hi=s;else lo=s;s=(lo+hi)/2}return Y(s)};
function flyBook(b,from,to,opening,done,liveTo){
 busy=true;
 /* each layer keeps its own size and is only moved and scaled (never resized), so the text on it doesn't re-wrap mid-flight */
 const small=opening?from:to,big=opening?to:from;
 const sp=st(b)==='reading'?makeCover(b):makeSpine(b),cv=coverEl(b);
 const layer=(el,box)=>{const w=document.createElement('div');w.className='fly';w.style.left='0px';w.style.top='0px';w.style.width=box.width+'px';w.style.height=box.height+'px';el.classList.add('fl');w.append(el);document.body.append(w);return w};
 const ls=layer(sp,small),lc=layer(cv,big);
 /* like taking a real book: it slides forward off the shelf first, then flies over; putting it back, it stops just in front of its spot, then slides in */
 const tf=(box,r,rot,k=1,dy=0)=>`translate(${r.left+r.width/2-box.width/2}px,${r.top+r.height/2-box.height/2+dy}px) perspective(900px) rotateY(${rot}deg) scale(${r.height/box.height*k})`;
 const shelf=opening?from:to,modal=opening?to:from,FW=1.14,LIFT=-6;
 const sh0='drop-shadow(0 0 0 rgba(0,0,0,0))',sh1='drop-shadow(0 10px 10px rgba(0,0,0,.4))';
 /* hand over without a gap: what the flying copy turns into is shown first, and the copy is only taken away two frames later, once the phone has had time to draw the real thing */
 let fined=false;const fin=()=>{if(fined)return;fined=true;busy=false;if(done)done();requestAnimationFrame(()=>requestAnimationFrame(()=>{ls.remove();lc.remove()}))};
 let a1;
 if(opening){
  const D=820,o={duration:D,fill:'forwards'};
  const path=box=>[
   {offset:0,transform:tf(box,shelf,0),easing:'cubic-bezier(.3,0,.3,1)'},
   {offset:.24,transform:tf(box,shelf,0,FW,LIFT),easing:'cubic-bezier(.35,.1,.2,1)'},
   {offset:1,transform:tf(box,modal,-28)}];
  a1=ls.animate(path(small),o);lc.animate(path(big),o);
  ls.animate([{opacity:1,offset:0},{opacity:1,offset:.3},{opacity:0,offset:.75},{opacity:0,offset:1}],{duration:D,fill:'forwards'});
  lc.animate([{opacity:0,offset:0},{opacity:0,offset:.3},{opacity:1,offset:.75},{opacity:1,offset:1}],{duration:D,fill:'forwards'})}
 else{
  /* going back it is already a spine (no fading), and it heads for wherever its spot is right now, even if you scroll meanwhile */
  lc.style.display='none';ls.style.opacity='1';
  const D=1000,t0=performance.now(),lerp=(p,q,t)=>p+(q-p)*t,lr=(p,q,t)=>({left:lerp(p.left,q.left,t),top:lerp(p.top,q.top,t),width:lerp(p.width,q.width,t),height:lerp(p.height,q.height,t)});
  const segs=[[0,.62,'modal','front',bez(.4,0,.25,1)],[.62,.78,'front','front',t=>t],[.78,1,'front','shelf',bez(.5,0,.3,1)]];
  const pose=(n,r)=>n==='modal'?{r:modal,rot:-28,k:1,dy:0,sh:1}:n==='front'?{r,rot:0,k:FW,dy:LIFT,sh:1}:{r,rot:0,k:1,dy:0,sh:0};
  const step=now=>{const t=Math.min(1,(now-t0)/D);let r=shelf;try{if(liveTo){const q=liveTo();if(q&&q.width)r=q}}catch(e){}
   const sg=segs.find(x=>t<=x[1])||segs[2],u=sg[4](Math.max(0,Math.min(1,(t-sg[0])/(sg[1]-sg[0])))),A=pose(sg[2],r),B=pose(sg[3],r),sh=lerp(A.sh,B.sh,u);
   ls.style.transform=tf(small,lr(A.r,B.r,u),lerp(A.rot,B.rot,u),lerp(A.k,B.k,u),lerp(A.dy,B.dy,u));
   ls.firstChild&&ls.firstChild.style.setProperty('--fsh',sh.toFixed(2));
   if(t<1)requestAnimationFrame(step);else fin()};
  step(t0);requestAnimationFrame(step)}
 if(a1){a1.onfinish=fin;a1.oncancel=fin}
}
function closeModal(savedId){
 if(!$('ov').classList.contains('on'))return;
 /* still flying open: close as soon as it lands instead of ignoring the tap */
 if(busy){clearTimeout(window._cq);window._cq=setTimeout(()=>closeModal(savedId),80);return}
 const id=savedId||(cur&&cur.id),b=id&&books.find(x=>x.id===id),el=b&&document.querySelector('.bk[data-id="'+id+'"]');
 if(b&&el&&!reduce){
  el.scrollIntoView({block:'nearest'});
  const from=bookRect(),to=el.getBoundingClientRect();
  el.style.visibility='hidden';
  $('ov').classList.remove('on');
  /* the big book stays two frames longer, until its flying copy is really on screen */
  requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!$('ov').classList.contains('on'))$('book').style.visibility='hidden'}));
  flyBook(b,from,to,false,()=>{el.style.visibility=''},()=>el.isConnected?el.getBoundingClientRect():null);
 }else $('ov').classList.remove('on');
}
/* drag to rearrange and move between shelves */
const sceneEl=$('roomv'),ins=document.createElement('div');ins.className='ins';document.body.append(ins);
let drag=null;
sceneEl.addEventListener('pointerdown',e=>{
 const s=e.target.closest('.bk');if(!s||(e.pointerType==='mouse'&&e.button!==0)||busy)return;
 drag={s,x:e.clientX,y:e.clientY,px:e.clientX,py:e.clientY,sy:0,active:false,touch:e.pointerType!=='mouse',t:null,idx:0,ids:[],zone:null};
 if(drag.touch)drag.t=setTimeout(dragBegin,300);
});
sceneEl.addEventListener('contextmenu',e=>{if(e.target.closest('.bk'))e.preventDefault()});
sceneEl.addEventListener('click',e=>{if(justDragged){e.stopPropagation();e.preventDefault()}},true);
function dragBegin(){
 if(!drag||drag.active)return;
 drag.active=true;drag.x=drag.px;drag.y=drag.py;drag.sy=RV.scrollTop;
 drag.s.classList.add('dragging');document.body.classList.add('dragmode');
 if(navigator.vibrate)navigator.vibrate(12);
 dragUpdate();dragLoop();
}
function dragLoop(){
 if(!drag||!drag.active)return;
 if(drag.py<90)RV.scrollTop-=12;else if(drag.py>innerHeight-90)RV.scrollTop+=12;
 dragUpdate();requestAnimationFrame(dragLoop);
}
function dragUpdate(){
 const s=drag.s;
 s.style.transform=`translate(${drag.px-drag.x}px,${drag.py-drag.y+RV.scrollTop-drag.sy}px) scale(1.06)`;
 const all=[...sceneEl.querySelectorAll('.bk')],others=all.filter(o=>o!==s);
 let best=null,bd=1e9;
 sceneEl.querySelectorAll('.dz').forEach(r=>{const rc=r.getBoundingClientRect();
  const dy=drag.py<rc.top?rc.top-drag.py:drag.py>rc.bottom?drag.py-rc.bottom:0,dx=drag.px<rc.left?rc.left-drag.px:drag.px>rc.right?drag.px-rc.right:0,d=Math.hypot(dx,dy);
  if(d<bd){bd=d;best=r}});
 drag.ids=others.map(o=>o.dataset.id);drag.zone=best?best.dataset.zone:null;
 const rs=others.filter(o=>o.parentNode===best);
 if(!best){ins.style.display='none';return}
 if(!rs.length){drag.idx=others.length;const rc=best.getBoundingClientRect();ins.style.cssText=`display:block;left:${rc.left+14}px;top:${rc.top+8}px;height:${Math.max(40,rc.height-16)}px`;return}
 const k=rs.findIndex(o=>{const r=o.getBoundingClientRect();return drag.px<r.left+r.width/2});
 let ref,after=false;
 if(k>=0){ref=rs[k];drag.idx=others.indexOf(ref)}else{ref=rs[rs.length-1];drag.idx=others.indexOf(ref)+1;after=true}
 const rr=ref.getBoundingClientRect(),g=best.classList.contains('rrow')?7:1;
 ins.style.cssText=`display:block;left:${after?rr.right+g-2:rr.left-g-2}px;top:${rr.top}px;height:${rr.height}px`;
}
document.addEventListener('pointermove',e=>{
 if(!drag)return;drag.px=e.clientX;drag.py=e.clientY;
 if(!drag.active){
  const d=Math.hypot(e.clientX-drag.x,e.clientY-drag.y);
  if(drag.touch){if(d>10){clearTimeout(drag.t);drag=null}}else if(d>6)dragBegin();
  return}
 dragUpdate();
});
/* reached the last page: the book moves to Read by itself */
function autoFinish(b){if(!b||!b.pages||!(b.page>=b.pages)||st(b)==='read')return false;
 const m=moveTo(b,'read');store();render();toast('\u{1F389} '+(m||L('Finished! Moved to Read.')));setTimeout(()=>{try{checkUnlocks()}catch(e){}},3500);return true}
function moveTo(b,z){
 const was=st(b);if(was===z)return '';
 b.status=z;if(z!=='read')delete b.past;
 if(z==='read'&&was==='want'&&!b.started&&!b.finished){b.past=true;const sm=seriesMsg(b);return L('Moved to Read. Tap the book if you want to add when you read it.')+(sm?' '+sm:'')}
 if(z!=='want'&&!b.started)b.started=today();
 if(z==='dnf'){b.finished='';return L("Moved to Didn't finish.")}
 if(z==='read'){if(!b.finished)b.finished=today();const sm=seriesMsg(b);return (b.stars?L('Finished! Moved to Read.'):L('Finished! Tap the book to give it a rating.'))+(sm?' '+sm:'')}
 b.finished='';
 return z==='reading'?L('Moved to Currently reading.'):L('Moved to Want to read.')}
function endDrag(cancel){
 if(!drag)return;clearTimeout(drag.t);const d=drag;drag=null;
 if(!d.active)return;
 justDragged=true;setTimeout(()=>{justDragged=false},60);
 d.s.classList.remove('dragging');d.s.style.transform='';document.body.classList.remove('dragmode');ins.style.display='none';
 if(!cancel&&d.zone){
  const id=d.s.dataset.id,ids=d.ids.slice();ids.splice(d.idx,0,id);
  const nb=ids.map(x=>books.find(b=>b.id===x)).filter(Boolean);
  if(nb.length===books.length){books=nb;const msg=moveTo(books.find(b=>b.id===id),d.zone);store();if(msg)toast(msg)}}
 ZS={};render();
}
document.addEventListener('pointerup',()=>endDrag(false));
document.addEventListener('pointercancel',()=>endDrag(true));
document.addEventListener('touchmove',e=>{if(drag&&drag.active)e.preventDefault()},{passive:false});
/* ---------- barcode scanning ---------- */
function toIsbn13(raw){
 const v=String(raw).replace(/[^0-9Xx]/g,'').toUpperCase();
 const ck13=d=>{let t=0;for(let i=0;i<12;i++)t+=(+d[i])*(i%2?3:1);return (10-t%10)%10};
 if(v.length===13&&/^97[89]\d{10}$/.test(v)&&ck13(v)===+v[12])return v;
 if(v.length===10&&/^\d{9}[\dX]$/.test(v)){let t=0;for(let i=0;i<10;i++)t+=(v[i]==='X'?10:+v[i])*(10-i);if(t%11)return null;const b='978'+v.slice(0,9);return b+ck13(b)}
 return null}
/* one request with a time limit, so a slow book site can't hold everything up */
/* a Google Books key of your own goes here (optional): the app then gets its own daily allowance */
/* the key only works from the app's own address, so it is only sent from there; if Google refuses it, the same question is asked again without it */
const GBKEY=location.hostname==='spendrax.github.io'?'AIzaSyC2WGK3gGwzQYwFQQLQeQBhHCMKlHuSwpo':'';
const tfetch1=(u,ms)=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);return fetch(u,{signal:c.signal}).then(r=>{if(!r.ok)throw 0;return r.json()}).finally(()=>clearTimeout(t))};
const tfetch=(u,ms=7000)=>GBKEY&&u.includes('googleapis.com/books')?tfetch1(u+'&key='+GBKEY,ms).catch(()=>tfetch1(u,ms)):tfetch1(u,ms);
/* the places asked about an ISBN, all at once */
function isbnSources(isbn){return [
  tfetch('https://openlibrary.org/search.json?limit=1&fields=key,title,author_name,cover_i,number_of_pages_median,subject&q=isbn:'+isbn).then(j=>{const d=j.docs&&j.docs[0];if(!d||!d.title)throw 0;return{...d,isbn}}),
  tfetch(`https://openlibrary.org/isbn/${isbn}.json`).then(async ed=>{if(!ed.title)throw 0;let name='';
   const ak=ed.authors&&ed.authors[0]&&ed.authors[0].key;if(ak)try{name=(await tfetch('https://openlibrary.org'+ak+'.json',3500)).name||''}catch(e){}
   return{title:ed.title,author_name:name?[name]:undefined,key:ed.works&&ed.works[0]&&ed.works[0].key,cover_i:(ed.covers||[]).find(c=>c>0),isbn,pages:ed.number_of_pages,subjects:ed.subjects||[]}}),
  tfetch('https://www.googleapis.com/books/v1/volumes?maxResults=1&q=isbn:'+isbn).then(g=>{const vi=(g.items||[])[0]&&g.items[0].volumeInfo;if(!vi||!vi.title)throw 0;
   return{title:vi.title+(vi.subtitle&&vi.title.length<40?': '+vi.subtitle:''),author_name:vi.authors,isbn,pages:vi.pageCount,desc:vi.description||'',gb:vi}}),
  /* Google sometimes only knows an edition when the number is asked plainly */
  tfetch('https://www.googleapis.com/books/v1/volumes?maxResults=3&q='+isbn).then(g=>{const it=(g.items||[]).find(x=>x.volumeInfo&&(x.volumeInfo.industryIdentifiers||[]).some(i=>toIsbn13(i.identifier||'')===isbn)),vi=it&&it.volumeInfo;if(!vi||!vi.title)throw 0;
   return{title:vi.title+(vi.subtitle&&vi.title.length<40?': '+vi.subtitle:''),author_name:vi.authors,isbn,pages:vi.pageCount,desc:vi.description||'',gb:vi}}),
  /* the French national library, for French-language editions */
  sruIsbn('https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&recordSchema=dublincore&maximumRecords=1&query='+encodeURIComponent('bib.isbn adj "'+isbn+'"'),isbn),
  /* the German national library, Wikidata and the Internet Archive: smaller, but each knows editions the others miss */
  sruIsbn('https://services.dnb.de/sru/dnb?version=1.1&operation=searchRetrieve&recordSchema=oai_dc&maximumRecords=1&query='+encodeURIComponent('num='+isbn),isbn),
  wdIsbn(isbn),
  tfetch('https://archive.org/advancedsearch.php?output=json&rows=1&fl[]=title&fl[]=creator&fl[]=year&q='+encodeURIComponent('isbn:'+isbn+' AND mediatype:texts')).then(j=>{const d=j.response&&j.response.docs&&j.response.docs[0];if(!d||!d.title)throw 0;
   const cr=[].concat(d.creator||[]).map(s=>{const p=String(s).replace(/,?\s*\d{4}-(\d{4})?\.?$/,'').split(',').map(z=>z.trim());return p.length===2?p[1]+' '+p[0]:p.join(', ')}).filter(Boolean);
   return{title:String(d.title).slice(0,100),author_name:cr.length?cr:undefined,isbn,first_publish_year:+d.year||undefined}})]}
/* Wikidata writes ISBNs with dashes, and where the dashes go depends on the publisher: every possible way is asked at once */
/* book/series/author website: the one you typed wins; otherwise Wikidata's "official website" for the series, then the book, then the author */
function cleanUrl(v){v=(v||'').trim();if(!v)return'';if(!/^https?:\/\//i.test(v))v='https://'+v;try{const u=new URL(v);return /^https?:$/.test(u.protocol)&&u.hostname.includes('.')?u.href:''}catch(e){return''}}
let siteCache={};try{siteCache=JSON.parse(localStorage.getItem('bookshelf-sites')||'{}')||{}}catch(e){}
function siteLink(url,label){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent=label+' '+new URL(url).hostname.replace(/^www\./,'');return a}
function siteShow(b){const box=$('sitego');box.replaceChildren();const own=cleanUrl($('site').value);
 if(own){box.append(siteLink(own,L('\u{1F310} Open website')));return}
 const names=[b&&b.series,b&&b.title,b&&b.author].map(n=>(n||'').trim().replace(/[\n\r]/g,' ')),key=names.join('|').toLowerCase();if(!names.some(Boolean))return;
 const show=u=>{if(u&&$('ov').classList.contains('on')&&!cleanUrl($('site').value)&&(!cur||!b||cur.id===b.id))box.replaceChildren(siteLink(u,L('\u{1F310} Official site (found automatically):')))};
 if(key in siteCache){show(siteCache[key]);return}
 if(!navigator.onLine)return;
 const vals=names.flatMap((n,k)=>n?['en','fr'].map(l=>'('+(k+1)+' '+JSON.stringify(n)+'@'+l+')'):[]).join('');
 const q='SELECT ?k ?w WHERE{VALUES(?k ?n){'+vals+'} ?e rdfs:label ?n; wdt:P856 ?w} ORDER BY ?k LIMIT 5';
 tfetch('https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(q)).then(j=>{
  const r=((j.results&&j.results.bindings)||[]).map(o=>cleanUrl(o.w&&o.w.value)).filter(Boolean);
  siteCache[key]=r[0]||'';try{localStorage.setItem('bookshelf-sites',JSON.stringify(siteCache))}catch(e){}show(siteCache[key])}).catch(()=>{})}
$('site').addEventListener('input',()=>siteShow(cur));
function wdIsbn(isbn){const v=[],b=isbn.slice(3,12);for(let g=1;g<=5;g++)for(let p=1;g+p<=8;p++)v.push('"'+[isbn.slice(0,3),b.slice(0,g),b.slice(g,g+p),b.slice(g+p),isbn[12]].join('-')+'"');
 const q='SELECT ?t ?l ?al ?pg WHERE{VALUES ?i{'+v.join(' ')+'} ?e wdt:P212 ?i. OPTIONAL{?e wdt:P1476 ?t} OPTIONAL{?e rdfs:label ?l} OPTIONAL{?e wdt:P1104 ?pg} OPTIONAL{?e wdt:P50 ?a. ?a rdfs:label ?al. FILTER(LANG(?al) IN("fr","en"))}} LIMIT 20';
 return tfetch('https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(q)).then(j=>{const r=(j.results&&j.results.bindings)||[],x=k=>(r.find(o=>o[k])||{})[k],t=x('t')||x('l');if(!t||!t.value)throw 0;
  const au=[...new Set(r.filter(o=>o.al).map(o=>o.al.value))],pg=x('pg');return{title:t.value.slice(0,100),author_name:au.length?au:undefined,isbn,pages:pg?+pg.value||undefined:undefined}})}
function sruIsbn(url,isbn){const c=new AbortController(),t=setTimeout(()=>c.abort(),7000);
 return fetch(url,{signal:c.signal}).then(r=>{if(!r.ok)throw 0;return r.text()}).then(x=>{
  const doc=new DOMParser().parseFromString(x,'text/xml'),g=n=>[...doc.getElementsByTagNameNS('*',n)].map(e=>(e.textContent||'').trim()).filter(Boolean);
  let title=(g('title')[0]||'').split(' / ')[0].replace(/\s+:\s+/,': ').replace(/: (roman|récit|nouvelles|r\u00e9cit)$/i,'').trim();if(!title)throw 0;
  const au=g('creator').map(s=>{s=s.replace(/\s*[(\[].*$/,'').replace(/\.\s*[A-Z\u00c0-\u00dc][^.]*$/,'').trim();const p=s.split(',').map(z=>z.trim());return p.length===2?p[1]+' '+p[0]:s}).filter(Boolean);
  const pm=g('format').join(' ').match(/(\d{2,4})\s*(?:p|S)\b/),yr=(g('date')[0]||'').match(/\d{4}/);
  return{title:title.slice(0,100),author_name:au.length?au:undefined,isbn,pages:pm?+pm[1]:undefined,first_publish_year:yr?+yr[0]:undefined,desc:g('description')[0]||''}}).finally(()=>clearTimeout(t))}
/* a search by title also asks Google Books, which knows many French and Québec editions Open Library doesn't */
function gbSearch(q){return tfetch('https://www.googleapis.com/books/v1/volumes?maxResults=6&printType=books&q='+encodeURIComponent(q),6000).then(g=>(g.items||[]).map(x=>x.volumeInfo).filter(v=>v&&v.title).map(vi=>{
  const id=(vi.industryIdentifiers||[]).map(i=>toIsbn13(i.identifier||'')).find(Boolean),th=vi.imageLinks&&(vi.imageLinks.smallThumbnail||vi.imageLinks.thumbnail);
  return{title:vi.title+(vi.subtitle&&vi.title.length<40?': '+vi.subtitle:''),author_name:vi.authors,isbn:id||undefined,pages:vi.pageCount,desc:vi.description||'',gb:vi,first_publish_year:(vi.publishedDate||'').slice(0,4)||undefined,thumb:th?th.replace('http:','https:'):''}})).catch(()=>[])}
function rbFind(site){const i=toIsbn13($('isbn').value||''),q=i||[$('title').value,$('author').value].map(s=>s.trim()).filter(Boolean).join(' ');
 if(!q){$('st').textContent=L('Type a title or an ISBN first.');return}
 window.open(site==='ll'?'https://www.leslibraires.ca/recherche/?s='+encodeURIComponent(q):'https://www.renaud-bray.com/Recherche.aspx?langue='+(lang==='fr'?'fr':'en')+'&words='+encodeURIComponent(q),'_blank','noopener')}
let lookTok=0;
async function lookupIsbn(isbn){
 const tok=++lookTok;
 $('isbn').value=isbn;$('res').replaceChildren();$('st').textContent=L('Looking up ISBN {i}…',{i:isbn});
 /* ask three places at the same time and take the first that knows the book (they used to be asked one after the other) */
 const sources=()=>isbnSources(isbn);
 for(let attempt=0;attempt<2;attempt++){
  try{const d=await Promise.any(sources());if(tok!==lookTok)return;await pick(d);return}catch(e){}
  if(tok!==lookTok)return;
  /* nothing answered: wait a moment and ask once more by itself, instead of making you scan again */
  if(attempt===0&&navigator.onLine!==false){$('st').textContent=L('Still looking…');await new Promise(r=>setTimeout(r,900));if(tok!==lookTok)return}else break}
 $('st').textContent=navigator.onLine===false?L('You’re offline. The ISBN is saved; fill in the details yourself or look it up later.'):L('No book found for ISBN {i}. Fill in the details yourself.',{i:isbn});
}
$('isbngo').onclick=()=>{const v=toIsbn13($('isbn').value);if(v)lookupIsbn(v);else $('st').textContent=L('That doesn’t look like a valid ISBN. Check the 10 or 13 digits.')};
$('isbn').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('isbngo').click()}});

let zx=null,det=null,stream=null,scanning=false,lastTry=0,badShown=0;
const FORMATS=['ean_13','ean_8','upc_a','upc_e'];
async function getNative(){
 if(det!==null)return det||null;
 try{if('BarcodeDetector' in window){const f=await BarcodeDetector.getSupportedFormats();if(f.includes('ean_13')){det=new BarcodeDetector({formats:FORMATS.filter(x=>f.includes(x))});return det}}}catch(e){}
 det=false;return null}
function getZX(){
 if(zx)return zx;
 zx=new Promise((res,rej)=>{const sc=document.createElement('script');sc.src='https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';sc.integrity='sha384-BzBxP10ZE72aitqj5UMmUsbKFliP/DZqA8Wq+BNNhlIJDGoEd1tpkMYXOg9+n6sB';sc.crossOrigin='anonymous';
  sc.onload=()=>{try{const Z=window.ZXing,h=new Map();h.set(Z.DecodeHintType.POSSIBLE_FORMATS,[Z.BarcodeFormat.EAN_13,Z.BarcodeFormat.EAN_8,Z.BarcodeFormat.UPC_A]);h.set(Z.DecodeHintType.TRY_HARDER,true);
   const r=new Z.MultiFormatReader();r.setHints(h);res({Z,r})}catch(e){rej(e)}};
  sc.onerror=()=>{zx=null;rej(new Error('load'))};document.head.append(sc)});
 return zx}
async function decodeCanvas(cv){
 const n=await getNative();
 if(n){try{const r=await n.detect(cv);if(r&&r.length)return r.map(x=>x.rawValue)}catch(e){}}
 else{try{const {Z,r}=await getZX();const src=new Z.HTMLCanvasElementLuminanceSource(cv);const res=r.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(src)));if(res)return [res.getText()]}catch(e){}}
 return []}
function handleCodes(codes){
 for(const c of codes){const v=toIsbn13(c);if(v)return v}
 if(codes.length&&Date.now()-badShown>2500){badShown=Date.now();$('scanmsg').textContent=L('That barcode isn’t an ISBN. Book barcodes start with 978 or 979; try the other barcode.')}
 return null}
const grab=document.createElement('canvas');
async function scanLoop(){
 if(!scanning)return;
 const v=$('vid');
 if(v.readyState>=2&&Date.now()-lastTry>180){
  lastTry=Date.now();
  const w=v.videoWidth,h=v.videoHeight,cw=Math.round(w*.9),ch=Math.round(h*.45);
  grab.width=Math.min(1000,cw);grab.height=Math.round(ch*grab.width/cw);
  grab.getContext('2d',{willReadFrequently:true}).drawImage(v,(w-cw)/2,(h-ch)/2,cw,ch,0,0,grab.width,grab.height);
  const isbn=handleCodes(await decodeCanvas(grab));
  if(isbn&&scanning){found(isbn);return}
 }
 requestAnimationFrame(scanLoop)}
function found(isbn){
 if($('multiscan').checked){multiAdd(isbn);return}
 $('cam').classList.add('found');$('scanmsg').textContent=L('Found ISBN {i}',{i:isbn});
 if(navigator.vibrate)navigator.vibrate(60);
 setTimeout(()=>{stopScan();lookupIsbn(isbn)},350)}
async function startScan(){
 $('cam').classList.remove('found');$('scan').classList.add('on');$('cam').hidden=false;
 $('scanmsg').textContent=L('Starting the camera…');
 getNative().then(n=>{if(!n)getZX().catch(()=>{})});
 try{
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('none');
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
  if(!$('scan').classList.contains('on')){stopScan();return}
  const v=$('vid');v.srcObject=stream;await v.play();
  /* keep the camera focusing by itself, so the barcode gets sharp without moving the phone back and forth */
  try{const tr=stream.getVideoTracks()[0],caps=tr.getCapabilities&&tr.getCapabilities();if(caps&&caps.focusMode&&caps.focusMode.includes('continuous'))tr.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{})}catch(e){}
  $('scanmsg').textContent=L('Point the camera at the barcode on the back of the book.');
  scanning=true;scanLoop();
 }catch(e){
  $('cam').hidden=true;
  $('scanmsg').textContent=(e&&e.name==='NotAllowedError')?L('Camera access was blocked. Allow the camera for this site in your browser settings, or take a photo of the barcode instead.'):L('The camera isn’t available here. Take a photo of the barcode instead, or type the ISBN.');
 }}
function stopScan(){
 scanning=false;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
 $('vid').srcObject=null;$('scan').classList.remove('on')}
$('scanbtn').onclick=startScan;
$('scanx').onclick=stopScan;
$('photobtn').onclick=()=>$('photoin').click();
$('photoin').onchange=async e=>{
 const f=e.target.files[0];e.target.value='';if(!f)return;
 $('scanmsg').textContent=L('Reading the photo…');
 try{
  const bm=await createImageBitmap(f),sc=Math.min(1,1600/Math.max(bm.width,bm.height)),cv=document.createElement('canvas');
  cv.width=Math.round(bm.width*sc);cv.height=Math.round(bm.height*sc);cv.getContext('2d').drawImage(bm,0,0,cv.width,cv.height);
  let isbn=handleCodes(await decodeCanvas(cv));
  if(!isbn){const r=document.createElement('canvas');r.width=cv.height;r.height=cv.width;const x=r.getContext('2d');x.translate(r.width,0);x.rotate(Math.PI/2);x.drawImage(cv,0,0);isbn=handleCodes(await decodeCanvas(r))}
  if(isbn)found(isbn);else $('scanmsg').textContent=L('Couldn’t read a barcode in that photo. Try a closer, sharper photo with the barcode filling the frame, or type the ISBN.');
 }catch(x){$('scanmsg').textContent=L('Couldn’t open that photo. Try another one.')}};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&stream)stopScan()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('scan').classList.contains('on')){e.stopImmediatePropagation();stopScan()}},true);
/* ---------- star rating ---------- */
let fStars=0,formTags=[];
function drawStars(v){if(v==null)v=fStars;$('starfill').style.width=(v/5*100)+'%';$('rv').textContent=v?'\u00b7 '+fmtStars(v)+' / 5':'\u00b7 '+L('tap a star');$('stars').setAttribute('aria-valuenow',v)}
function starAt(e){const r=$('stars').getBoundingClientRect(),f=(e.clientX-r.left)/r.width;return Math.max(.25,Math.min(5,Math.ceil(f*20)/4))}
let starDown=false;
$('stars').addEventListener('pointerdown',e=>{starDown=true;$('stars').setPointerCapture(e.pointerId);const v=starAt(e);fStars=(v===fStars&&v===.25)?0:v;drawStars();pv()});
$('stars').addEventListener('pointermove',e=>{const v=starAt(e);if(starDown){fStars=v;drawStars();pv()}else if(e.pointerType==='mouse')drawStars(v)});
$('stars').addEventListener('pointerup',()=>{starDown=false});
$('stars').addEventListener('pointerleave',()=>{if(!starDown)drawStars()});
$('stars').addEventListener('keydown',e=>{const d={ArrowRight:.25,ArrowUp:.25,ArrowLeft:-.25,ArrowDown:-.25}[e.key];if(d){e.preventDefault();fStars=Math.max(0,Math.min(5,fStars+d));drawStars();pv()}});
/* ---------- tags ---------- */
function allTags(){const m=new Map();books.forEach(b=>(b.tags||[]).forEach(t=>{const k=t.toLowerCase();const e=m.get(k);if(e)e.n++;else m.set(k,{name:t,n:1})}));return [...m.values()].sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name))}
function cleanTag(t){t=t.replace(/\s+/g,' ').trim().slice(0,24);if(!t)return '';const ex=allTags().find(x=>x.name.toLowerCase()===t.toLowerCase());return ex?ex.name:t}
function chip(name,extra){const c=document.createElement('button');c.type='button';c.className='chip';c.style.setProperty('--h',hue(name));c.textContent=name;if(extra)c.append(extra);return c}
function drawTagRow(){
 const b=$('tagbtn');b.replaceChildren();b.classList.toggle('empty',!formTags.length);
 if(!formTags.length)b.textContent='\u{1F3F7} '+L('Add tags');
 else{formTags.forEach(t=>{const x=document.createElement('span');x.className='chip';x.style.setProperty('--h',hue(t));x.textContent=t;b.append(x)});const e=document.createElement('span');e.className='tagplus';e.textContent='+';b.append(e)}
 b.setAttribute('aria-label',L('Tags')+(formTags.length?': '+formTags.join(', '):''));drawGenreSugg();drawGenreLine()}
$('tagbtn').onclick=()=>openTagPicker('book');
/* the tag picker: choose, create, filter, rename, delete */
let tpMode='book',tpEdit=false,askDel='';
const selTags=new Set();
function openTagPicker(mode){tpMode=mode;tpEdit=false;askDel='';$('tagq').value='';$('tagov').classList.add('on');drawTagPicker();if(matchMedia('(pointer:fine)').matches)setTimeout(()=>$('tagq').focus(),60)}
function closeTagPicker(){if(!$('tagov').classList.contains('on'))return;$('tagov').classList.remove('on');if(tpMode==='book')drawTagRow();drawTagBar();applyFilter()}
$('tagdone').onclick=closeTagPicker;
$('tagov').onclick=e=>{if(e.target===$('tagov'))closeTagPicker()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('tagov').classList.contains('on')){e.stopImmediatePropagation();closeTagPicker()}},true);
function hasForm(k){return formTags.some(t=>t.toLowerCase()===k)}
function tpToggle(name){
 const k=name.toLowerCase();
 if(tpMode==='book'){if(hasForm(k))formTags=formTags.filter(t=>t.toLowerCase()!==k);else formTags.push(cleanTag(name));drawTagRow()}
 else{selTags.has(k)?selTags.delete(k):selTags.add(k);drawTagBar();applyFilter()}
 drawTagPicker()}
function drawTagPicker(){
 const book=tpMode==='book';
 $('tagtitle').textContent=book?L('Tags'):L('Filter by tag');
 $('tagq').placeholder=book?L('Search or create a tag'):L('Search tags');
 const q=$('tagq').value.replace(/\s+/g,' ').trim(),ql=q.toLowerCase(),list=$('taglist');list.replaceChildren();
 const tags=allTags();if(book)formTags.forEach(t=>{if(!tags.some(x=>x.name.toLowerCase()===t.toLowerCase()))tags.push({name:t,n:0})});
 const shown=tags.filter(t=>!ql||t.name.toLowerCase().includes(ql));
 $('tpedit').hidden=book||!tags.length;$('tpedit').textContent=tpEdit?L('Done'):'\u270e '+L('Edit tags');$('tagdone').hidden=tpEdit;
 $('taghint').textContent=tpEdit?L('Tap a tag to rename it, or \u00d7 to delete it.'):!tags.length?(book?L('No tags yet. Type a name to create one.'):L('No tags yet. Add tags to a book first.')):(q&&!shown.length&&!book?L('No tags match'):'');
 if(book&&q&&!tags.some(t=>t.name.toLowerCase()===ql)){const c=chip('+ '+L('Create \u201c{t}\u201d',{t:q}));c.classList.add('new');c.onclick=()=>{formTags.push(cleanTag(q));$('tagq').value='';drawTagRow();drawTagPicker()};list.append(c)}
 if(book&&!tpEdit&&!q){const gs=pendingGenres();if(gs.length){list.append(el('div','tplabel','\u2728 '+L('Suggested')));gs.forEach(g=>{const c=chip(L(g));c.classList.add('sug');c.onclick=()=>{formTags.push(cleanTag(L(g)));drawTagRow();drawTagPicker()};list.append(c)});if(shown.length)list.append(el('div','tplabel',L('Tags')))}}
 shown.forEach(t=>{const k=t.name.toLowerCase();
  if(tpEdit){
   const c=chip(t.name);c.classList.toggle('ask',askDel===k);
   if(askDel===k)c.textContent=L('Delete \u201c{t}\u201d? Tap again',{t:t.name});
   else{const x=document.createElement('span');x.className='x';x.textContent='\u00d7';x.title=L('Delete tag');x.setAttribute('aria-label',L('Delete tag')+' '+t.name);c.append(x);
    x.onclick=e=>{e.stopPropagation();askDel=k;drawTagPicker();setTimeout(()=>{if(askDel===k){askDel='';drawTagPicker()}},3000)}}
   c.onclick=()=>{
    if(askDel===k){askDel='';deleteTag(t.name);return}
    const w=document.createElement('span');w.className='chip';w.style.setProperty('--h',hue(t.name));const inp=document.createElement('input');inp.value=t.name;inp.maxLength=24;inp.setAttribute('aria-label',L('Rename tag'));w.append(inp);c.replaceWith(w);inp.focus();inp.select();let fin=false;
    const done=ok=>{if(fin)return;fin=true;if(ok&&inp.value.trim()&&inp.value.trim()!==t.name)renameTag(t.name,inp.value);else drawTagPicker()};
    inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();done(true)}else if(e.key==='Escape'){e.stopPropagation();done(false)}};inp.onblur=()=>done(true)};
   list.append(c)}
  else{const on=book?hasForm(k):selTags.has(k);let n=null;if(t.n){n=document.createElement('small');n.textContent=t.n}
   const c=chip(t.name,n);c.classList.toggle('on',on);c.setAttribute('aria-pressed',on);c.onclick=()=>tpToggle(t.name);list.append(c)}})}
$('tagq').addEventListener('input',()=>{askDel='';drawTagPicker()});
$('tagq').addEventListener('keydown',e=>{
 if(e.key!=='Enter')return;e.preventDefault();const q=$('tagq').value.replace(/\s+/g,' ').trim();if(!q||tpEdit)return;
 const ql=q.toLowerCase(),exact=allTags().find(t=>t.name.toLowerCase()===ql);
 if(tpMode==='book'){if(!hasForm(ql))formTags.push(exact?exact.name:cleanTag(q));drawTagRow()}
 else{const m=exact||allTags().find(t=>t.name.toLowerCase().includes(ql));if(m&&!selTags.has(m.name.toLowerCase())){selTags.add(m.name.toLowerCase());drawTagBar();applyFilter()}}
 $('tagq').value='';drawTagPicker()});
$('tpedit').onclick=()=>{tpEdit=!tpEdit;askDel='';drawTagPicker()};
/* ---------- finding books: search + tag filter ---------- */
function matches(b){
 const tl=(b.tags||[]).map(t=>t.toLowerCase());
 for(const t of selTags)if(!tl.includes(t))return false;
 const q=$('q').value.trim().toLowerCase();
 return !q||[b.title,b.author||'',...tl].some(x=>x.toLowerCase().includes(q))}
function applyFilter(){
 const on=selTags.size>0||!!$('q').value.trim();let n=0;
 document.querySelectorAll('#roomv .bk').forEach(el=>{const b=books.find(x=>x.id===el.dataset.id);const m=b&&matches(b);if(on&&m)n++;el.classList.toggle('dim',on&&!m);el.classList.toggle('hit',on&&!!m)});
 $('matchinfo').textContent=on?(n?L(n>1?'{n} books found':'{n} book found',{n}):L('No books match')):''}
function renameTag(oldName,newName){
 newName=newName.replace(/\s+/g,' ').trim().slice(0,24);if(!newName)return;const o=oldName.toLowerCase();
 books.forEach(b=>{if(!b.tags)return;if(b.tags.some(t=>t.toLowerCase()===o)){b.tags=b.tags.filter(t=>t.toLowerCase()!==o);if(!b.tags.some(t=>t.toLowerCase()===newName.toLowerCase()))b.tags.push(newName)}});
 if(selTags.delete(o))selTags.add(newName.toLowerCase());store();render();drawTagPicker()}
function deleteTag(name){const o=name.toLowerCase();books.forEach(b=>{if(b.tags)b.tags=b.tags.filter(t=>t.toLowerCase()!==o)});selTags.delete(o);store();render();drawTagPicker()}
function drawTagBar(){
 const bar=$('tagbar');bar.replaceChildren();$('finder').hidden=!books.length;
 const tags=allTags();[...selTags].forEach(k=>{if(!tags.some(x=>x.name.toLowerCase()===k))selTags.delete(k)});
 const f=$('tagfbtn');f.textContent=L('\u{1F3F7} Tags')+(selTags.size?' \u00b7 '+selTags.size:'');f.classList.toggle('on',selTags.size>0);f.setAttribute('aria-label',L('Filter by tag'));
 [...selTags].forEach(k=>{const t=tags.find(x=>x.name.toLowerCase()===k);const x=document.createElement('span');x.className='x';x.textContent='\u00d7';const c=chip(t.name,x);c.classList.add('on');c.setAttribute('aria-label',L('Remove')+' '+t.name);c.onclick=()=>{selTags.delete(k);drawTagBar();applyFilter()};bar.append(c)});
 if(selTags.size||$('q').value.trim()){const c=document.createElement('button');c.type='button';c.className='fbtn';c.textContent='\u2715 '+L('Clear');c.onclick=()=>{selTags.clear();$('q').value='';drawTagBar();applyFilter()};bar.append(c)}}
$('tagfbtn').onclick=()=>openTagPicker('filter');
$('q').addEventListener('input',()=>{drawTagBar();applyFilter()});
/* ---------- switching language ---------- */
function setLang(c){
 if(!LANGS[c])return;lang=c;try{localStorage.setItem('bookshelf-lang',c)}catch(e){}
 applyLang();render();applyLook();
 if($('ov').classList.contains('on')){setFormStatus(fStatus);drawStars();drawTagRow();buildSlots()}
 if($('tagov').classList.contains('on'))drawTagPicker();
 if($('lov').classList.contains('on'))$('set').onclick()}
/* ---------- genres ---------- */
const GENRES=[
 ['Fantasy',/fantas|magic|wizard|dragons?\b|fairy|sorcer|witch|elves/],
 ['Science fiction',/science fiction|sci-?fi|space opera|dystop|robots?\b|time travel|cyberpunk|extraterrestrial|aliens?\b/],
 ['Mystery',/myster|detective|whodunit|sleuth/],
 ['Thriller',/thriller|suspense|espionage|\bspy\b|\bspies\b/],
 ['Crime',/\bcrime|murder|criminal/],
 ['Romance',/romance|love stor|romantic/],
 ['Horror',/horror|ghost|vampire|zombie|haunted/],
 ['Historical fiction',/historical fiction|history.{0,20}fiction|fiction.{0,25}histor/],
 ['Adventure',/adventure|survival/],
 ['Biography',/biograph|memoir/],
 ['History',/\bhistory\b(?!.*fiction)|world war|civilization/],
 ['Science',/\bscience\b(?!\s*fiction)|physics|biology|astronomy|chemistry|evolution|nature/],
 ['Self-help',/self-help|personal development|self-improvement|motivation/],
 ['Psychology',/psycholog/],
 ['Philosophy',/philosoph/],
 ['Business',/business|economics|finance|management|entrepreneur/],
 ['Religion',/religio|spiritual|christian|bible|islam|buddh|theolog/],
 ['Poetry',/poetry|poems|\bpoets?\b/],
 ['Comics',/comic|graphic novel|manga/],
 ['Humour',/humou?r|funny|comedy|satire/],
 ['Young adult',/young adult|\bteen/],
 ["Children's",/juvenile|children|picture book/],
 ['Classic',/classic/],
 ['Cooking',/cookery|cooking|recipes/],
 ['Travel',/\btravel/],
 ['Literary fiction',/literary/],
 ['Non-fiction',/non-?fiction/],
 ['Fiction',/\bfiction\b/]];
function guessGenres(subjects,cats){
 const sc={},add=(txt,w)=>{const t=String(txt).toLowerCase();GENRES.forEach(([g,re])=>{if(re.test(t))sc[g]=(sc[g]||0)+w})};
 (cats||[]).forEach(c=>String(c).split('/').forEach(x=>add(x,3)));
 (subjects||[]).slice(0,40).forEach(x=>add(x,1));
 if(['Fantasy','Science fiction','Mystery','Thriller','Crime','Romance','Horror','Historical fiction','Adventure','Literary fiction','Classic','Young adult',"Children's",'Humour','Comics','Poetry'].some(g=>sc[g]))delete sc['Fiction'];
 if(['Biography','History','Science','Self-help','Psychology','Philosophy','Business','Religion','Cooking','Travel'].some(g=>sc[g]))delete sc['Non-fiction'];
 return Object.entries(sc).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0])}
const GNAME=new Map();
GENRES.forEach(([g])=>{GNAME.set(g.toLowerCase(),g);Object.keys(TR).forEach(l=>{const v=TR[l][g];if(v)GNAME.set(v.toLowerCase(),g)})});
[['sci-fi','Science fiction'],['scifi','Science fiction'],['sf','Science fiction'],['humor','Humour'],['funny','Humour'],['nonfiction','Non-fiction'],['non fiction','Non-fiction'],['ya','Young adult'],['kids','Children\'s'],['memoir','Biography'],['graphic novel','Comics'],['manga','Comics']].forEach(([a,g])=>GNAME.set(a,g));
function bookGenres(b){const gs=(b.tags||[]).map(t=>GNAME.get(t.toLowerCase())).filter(Boolean);return [...new Set([...gs,...(b.genres||[])])]}
function pendingGenres(){return (draft.genres||[]).filter(g=>!formTags.some(t=>GNAME.get(t.toLowerCase())===g))}
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function drawGenreSugg(){
 const box=$('gsugg');box.replaceChildren();const gs=pendingGenres();if(!gs.length)return;
 box.append(el('span','','✨ '+L('Suggested')+':'));
 gs.forEach(g=>{const c=chip(L(g));c.classList.add('sug');c.onclick=()=>{formTags.push(cleanTag(L(g)));drawTagRow()};box.append(c)})}
/* ---------- the stats wall ---------- */
let view='room',stYear=null;
const RV=$('roomv'),SV=$('statsv');
const monthName=i=>lang==='ht'?HTM[i]:new Date(2026,i,15).toLocaleDateString(lang,{month:'short'});
const monthLong=i=>lang==='ht'?['janvye','fevriye','mas','avril','me','jen','jiyè','out','septanm','oktòb','novanm','desanm'][i]:new Date(2026,i,15).toLocaleDateString(lang,{month:'long'});
const nf=(v,d=0)=>Number(v).toLocaleString(lang==='ht'?'fr':lang,{maximumFractionDigits:d,minimumFractionDigits:d});
const nBooks=n=>L(n===1?'{n} book':'{n} books',{n});
function card(title,wide){const c=el('section','card'+(wide?' wide':''));if(title)c.append(el('h2','',title));return c}
function hbars(rows,fmt){
 const box=el('div','hb'),mx=Math.max(1,...rows.map(r=>r.n));
 rows.forEach(r=>{box.append(el('div','n',r.name));const b=el('div','bar'),i=el('i');i.style.width=r.n?Math.max(1.5,r.n/mx*72)+'%':'0';b.title=r.name+': '+fmt(r);b.append(i,el('span','',fmt(r)));box.append(b)});return box}
const days=(a,b)=>Math.round((new Date(b+'T12:00')-new Date(a+'T12:00'))/864e5);
const dayOf=ms=>{const d=new Date(ms);return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
/* real reading time only: not books read in the past, and not ones that just got today's date when they were added */
const timedOK=b=>b.started&&b.finished&&!b.past&&days(b.started,b.finished)>=0&&!(b.started===b.finished&&b.createdAt&&dayOf(b.createdAt)===b.finished);
function renderStats(){
 const read=allReads(),cy=String(new Date().getFullYear());
 const years=[...new Set(read.map(b=>(b.finished||'').slice(0,4)).filter(Boolean))].sort().reverse();if(!years.includes(cy))years.unshift(cy);
 if(stYear===null)stYear=read.some(b=>(b.finished||'').startsWith(cy))?cy:'all';
 const ys=$('styear');ys.replaceChildren();[['all',L('All time')],...years.map(y=>[y,y])].forEach(([v,t])=>{const o=el('option','',t);o.value=v;ys.append(o)});ys.value=stYear;$('yrbtn').textContent=L('🎁 Your {y} in books',{y:stYear==='all'?cy:stYear});
 const set=stYear==='all'?read:read.filter(b=>(b.finished||'').startsWith(stYear));
 const body=$('stbody');body.replaceChildren();
 const rated=set.filter(b=>b.stars),paged=set.filter(b=>b.pages>0),pages=paged.reduce((a,b)=>a+b.pages,0);
 const tiles=el('div','sttiles');
 [[nf(set.length),L('Books read')],[nf(pages),L('Pages read')],[rated.length?'★ '+nf(rated.reduce((a,b)=>a+b.stars,0)/rated.length,2):'–',L('Average rating')],[paged.length?nf(Math.round(pages/paged.length)):'–',L('Average length')]]
  .forEach(([v,k])=>{const t=el('div','card tile');t.append(el('div','v',v),el('div','k',k));tiles.append(t)});
 body.append(tiles,el('div','stsub',L('{n} currently reading · {m} to read',{n:books.filter(b=>st(b)==='reading').length,m:books.filter(b=>st(b)==='want').length})));
 const grid=el('div','stgrid');body.append(grid);
 /* patterns */
 const ins=card(L('Patterns'),true),ul=el('ul','insights');ins.append(ul);
 const say=(icon,txt)=>{const li=el('li','',txt);li.dataset.i=icon;ul.append(li)};
 const gm={};set.forEach(b=>bookGenres(b).forEach(g=>{const x=gm[g]=gm[g]||{n:0,s:0,r:0};x.n++;if(b.stars){x.s+=b.stars;x.r++}}));
 const grows=Object.entries(gm).map(([g,v])=>({name:L(g),n:v.n,avg:v.r?v.s/v.r:0,r:v.r})).sort((a,b)=>b.n-a.n||b.avg-a.avg);
 if(grows.length){const f=grows[0];say('\u{1F3F7}️',f.r?L('Your favourite genre is {g}: {n} books, rated ★{r} on average.',{g:f.name,n:f.n,r:nf(f.avg,1)}):L('Your favourite genre is {g}: {n} books.',{g:f.name,n:f.n}));
  const best=grows.filter(x=>x.r>=2).sort((a,b)=>b.avg-a.avg)[0];if(best&&best.name!==f.name)say('⭐',L('You rate {g} highest (★{r} on average).',{g:best.name,r:nf(best.avg,1)}))}
 const am={};set.forEach(b=>{const a=(b.author||'').trim();if(!a)return;const k=a.toLowerCase(),x=am[k]=am[k]||{name:a,n:0,s:0,r:0};x.n++;if(b.stars){x.s+=b.stars;x.r++}});
 const arows=Object.values(am).sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name));
 if(arows[0]&&arows[0].n>=2)say('✍️',L('Your most-read author is {a} ({n} books).',{a:arows[0].name,n:arows[0].n}));
 let byM=null;
 if(stYear!=='all'){byM=Array(12).fill(0);set.forEach(b=>{const m=+(b.finished||'').slice(5,7);if(m)byM[m-1]++});const mx=Math.max(...byM);if(mx>=2)say('\u{1F4C5}',L('You finished the most books in {m} ({n}).',{m:monthLong(byM.indexOf(mx)),n:mx}))}
 const longest=paged.slice().sort((a,b)=>b.pages-a.pages)[0];if(longest&&paged.length>=2)say('\u{1F4DA}',L('Longest book: {t} ({n} pages).',{t:longest.title,n:nf(longest.pages)}));
 const timed=set.filter(timedOK).map(b=>({b,d:Math.max(1,days(b.started,b.finished))}));
 if(timed.length>=2){const avg=Math.round(timed.reduce((a,x)=>a+x.d,0)/timed.length);say('⏱️',avg<=1?L('On average you finish a book in one day.'):L('On average you finish a book in {n} days.',{n:avg}));
  const fast=timed.slice().sort((a,b)=>a.d-b.d)[0];say('⚡',fast.d<=1?L('Fastest read: {t} in one day.',{t:fast.b.title}):L('Fastest read: {t} in {n} days.',{t:fast.b.title,n:fast.d}))}
 if(stYear===cy&&set.length>=2){const now=new Date(),doy=Math.round((now-new Date(now.getFullYear(),0,1))/864e5);if(doy>=30)say('\u{1F4C8}',L('At this pace you’ll read about {n} books this year.',{n:Math.round(set.length/doy*365)}))}
 if(!ul.children.length)ul.replaceWith(el('p','stempty',L('Finish a few books to see your reading patterns here.')));
 grid.append(ins);
 /* books over time */
 const tc=card(stYear==='all'?L('Books finished per year'):L('Books finished per month'),true);let bars,labels;
 if(byM){bars=byM;labels=byM.map((_,i)=>monthName(i))}
 else{labels=[...new Set(read.map(b=>(b.finished||'').slice(0,4)).filter(Boolean))].sort();bars=labels.map(y=>read.filter(b=>(b.finished||'').startsWith(y)).length)}
 if(bars.length&&Math.max(...bars)>0){const mx=Math.max(...bars),cols=el('div','cols'),lab=el('div','collab');
  bars.forEach((v,i)=>{const c=el('div','col');c.title=labels[i]+': '+nBooks(v);if(v)c.append(el('b','',v));const bi=el('i');bi.style.height=(v/mx*84)+'%';c.append(bi);cols.append(c);lab.append(el('span','',labels[i]))});tc.append(cols,lab)}
 else tc.append(el('p','stempty',L('Nothing here yet.')));
 grid.append(tc);
 const gc=card(L('Top genres'));gc.append(grows.length?hbars(grows.slice(0,6),r=>r.n+(r.r?' · ★'+nf(r.avg,1):'')):el('p','stempty',L('Add genre tags to your books to see this.')));grid.append(gc);
 const ac=card(L('Most-read authors'));ac.append(arows.length?hbars(arows.slice(0,6),r=>r.n+(r.r?' · ★'+nf(r.s/r.r,1):'')):el('p','stempty',L('Nothing here yet.')));grid.append(ac);
 const rc=card(L('Your ratings'));
 if(rated.length)rc.append(hbars([5,4,3,2,1].map(k=>({name:'★'.repeat(k),n:rated.filter(b=>Math.min(5,Math.max(1,Math.round(b.stars)))===k).length})),r=>String(r.n)));
 else rc.append(el('p','stempty',L('No rated books yet.')));grid.append(rc);
 const tm={};set.forEach(b=>(b.tags||[]).forEach(t=>{const k=t.toLowerCase();if(GNAME.has(k))return;(tm[k]=tm[k]||{name:t,n:0}).n++}));
 const trows=Object.values(tm).sort((a,b)=>b.n-a.n);
 const tg=card(L('Top tags'));tg.append(trows.length?hbars(trows.slice(0,6),r=>String(r.n)):el('p','stempty',L('Nothing here yet.')));grid.append(tg);
 const now=books.filter(b=>st(b)==='reading');
 if(now.length){const pc=card(L('In progress'),true),pr=el('div','prog');
  now.forEach(b=>{const r=el('div','row2'),pct=b.pages>0?Math.min(100,Math.round((b.page||0)/b.pages*100)):null;r.append(el('span','',b.title),el('span','',pct==null?'':pct+'%'));const tr=el('div','track'),f=el('i');f.style.width=(pct||0)+'%';tr.append(f);r.append(tr);pr.append(r)});pc.append(pr);grid.append(pc)}
}
$('styear').onchange=()=>{stYear=$('styear').value;renderStats()};
/* ---------- the hexagonal room: goals & quotes (left) · bookshelf · stats (right), no loop ---------- */
const GV=$('goalsv'),PGV=$('pgoalsv'),PRV=$('proomv'),PSV=$('pstatsv'),WALLS={goals:-1,room:0,stats:1,pgoals:2,proom:3,pstats:-2},FACES=[[GV,-1],[RV,0],[SV,1],[$('hexw1'),2],[$('hexw2'),-2]];
const EXTS=FACES.map(([,k])=>{const x=document.createElement('div');x.className='wallext';x.setAttribute('aria-hidden','true');x.innerHTML='<i class="wt"></i><i class="wf"></i>';document.body.append(x);return[x,k]});
let cam=0,camAnim=0,swipe=null,swipeBlock=false,frozenY=0;
const wallEl=k=>({'-2':PSV,'-1':GV,'0':RV,'1':SV,'2':PGV,'3':PRV})[k]||RV,wallName=k=>({'-2':'pstats','-1':'goals','0':'room','1':'stats','2':'pgoals','3':'proom'})[k]||'room';
/* paired: the walls go all the way round (k is -2..3); alone: only Goals, Room, Stats */
const hexN=k=>((Math.round(k)+2)%6+6)%6-2,hexD=d=>((d+3)%6+6)%6-3,hexOk=k=>paired()?true:Math.abs(k)<=1,hexWalls=()=>paired()?[[PSV,-2],[GV,-1],[RV,0],[SV,1],[PGV,2],[PRV,3]]:[[GV,-1],[RV,0],[SV,1]];
/* while turning (and while another wall is shown) the room is pinned to exactly one screen, scrolled to where you were */
function hexT(phi,back){const R=innerWidth*.866,P=R*1.55;return `perspective(${P}px) translateZ(${R-(back||0)}px) rotateY(${phi}deg) translateZ(${-R}px)`}
const turning=()=>!!turning.busy;
let TFL=[];
function turnStart(){
 if(turning())return;turning.busy=true;clearTimeout(turnStart.rest);document.body.classList.remove('restwalls');
 /* only rebuild the other walls when something changed: rebuilding them every time made the start of a turn stutter */
 if(dataVer!==wallVer||Date.now()-wallAt>60000||lang!==wallLang||!SV.querySelector('.card')||!GV.querySelector('.card')){if(view!=='stats')renderStats();if(view!=='goals')renderGoals();wallVer=dataVer;wallAt=Date.now();wallLang=lang}
 RV.classList.remove('away');hexWalls().forEach(([e])=>{e.hidden=false;e.inert=false});document.body.classList.add('turningview');document.body.classList.toggle('paired',paired());
 /* keep the floor at the same height on every wall */
 const ce=wallEl(WALLS[view]),fb=Math.max(0,ce.scrollHeight-ce.clientHeight-ce.scrollTop);
 /* the floor line of the wall you're on decides it: the other walls get a floor just as tall and are scrolled so their floor starts at the very same height */
 const fEl=w=>w===RV?RV.querySelector('.floor'):w.querySelector('.wallfloor'),cf=fEl(ce),ftop=cf?cf.getBoundingClientRect().top:innerHeight+1,fvis=ftop<innerHeight-1;
 [GV,RV,SV].forEach(e=>{if(e===ce)return;const f=fEl(e);if(f)f.style.minHeight='';
  if(fvis&&f){f.style.minHeight=Math.ceil(innerHeight-ftop)+'px';e.scrollTop=e.scrollHeight;e.scrollTop+=f.getBoundingClientRect().top-ftop}
  /* no floor in view: the walls stay level with each other from the top (top of one wall = top of the next), stopping before the other wall's floor would show */
  else{const fy=f?f.getBoundingClientRect().top-e.getBoundingClientRect().top+e.scrollTop:e.scrollHeight;e.scrollTop=Math.max(0,Math.min(ce.scrollTop,fy-e.clientHeight-2))}});
 document.body.style.setProperty('--flh',fvis?Math.ceil(innerHeight-ftop)+'px':'0px');
 /* the real walls turn, one screen each; the stripes keep going above and below */
 hexWalls().forEach(([e])=>{e.style.transformOrigin='50% 50%'});TFL=paired()?hexWalls():[[GV,-1],[RV,0],[SV,1],[$('hexw1'),2],[$('hexw2'),-2]]}
/* turning is now like turning your head in the middle of the room: instead of stepping back (which left gaps above and below the walls), the view moves in just enough that the corner between two walls always reaches from the top of the screen to the bottom. The walls stay one screen big, so there is nothing extra for the phone to draw */
function camSet(c){cam=c;const fr=c-Math.floor(c),back=innerWidth*.866*(1-1.1547*Math.cos((60*fr-30)*Math.PI/180))*1.03;TFL.forEach(([e,k,ov])=>{const a=60*hexD(c-k);e.style.transform=hexT(a,back);})}
function turnEnd(){
 const k=paired()?hexN(cam):Math.max(-1,Math.min(1,Math.round(cam)));cam=k;turning.busy=false;
 view=wallName(k);
 if(renderPartner.pending&&!['pgoals','proom','pstats'].includes(view))setTimeout(()=>{try{renderPartner()}catch(e){}},50);
 /* nothing is hidden, shown, created or removed when you land: on some phones that made the books blink for a frame. The other two walls simply wait just off screen, switched off (inert), ready for the next turn */
 hexWalls().forEach(([e,j])=>{const on=j===k;e.inert=!on;e.style.transformOrigin='';e.style.transform=on?'':`translateX(${hexD(j-k)<0?-100.5:100.5}vw)`});
 if(k===0){RV.classList.remove('away');document.body.classList.remove('onstats')}
 else{RV.classList.add('away');document.body.classList.add('onstats');wallEl(k).focus({preventScroll:true})}
 clearTimeout(turnStart.rest);turnStart.rest=setTimeout(()=>{if(!turning())document.body.classList.add('restwalls')},1500);
 requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!turning())document.body.classList.remove('turningview')}))}
/* a moment after opening, the two side walls are prepared and parked off screen, so even the first turn has nothing to build */
setTimeout(()=>{try{if(turning()||view!=='room'||!GV.hidden)return;if(!SV.querySelector('.card'))renderStats();if(!GV.querySelector('.card'))renderGoals();wallVer=dataVer;wallAt=Date.now();wallLang=lang;
 [[GV,-100.5],[SV,100.5]].forEach(([e,x])=>{e.style.transform=`translateX(${x}vw)`;e.inert=true;e.hidden=false})}catch(e){}},2600);
function turnTo(target,from){
 cancelAnimationFrame(camAnim);turnStart();
 if(reduce){camSet(target);turnEnd();return}
 const c0=from!=null?from:cam,dur=Math.max(220,Math.abs(target-c0)*800),t0=performance.now(),ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
 const step=now=>{const t=Math.min(1,(now-t0)/dur);camSet(c0+(target-c0)*ease(t));if(t<1)camAnim=requestAnimationFrame(step);else turnEnd()};
 camAnim=requestAnimationFrame(step)}
function go(k){const c=WALLS[view];if(paired())k=c+hexD(k-c);if(turning()||k===c||Math.abs(k-c)>1||!hexOk(k))return;turnTo(k,c)}
$('statsbtn').onclick=()=>go(1);$('goalsbtn').onclick=()=>go(-1);$('edgetab').onclick=()=>go(1);$('edgetabL').onclick=()=>go(-1);$('backroom').onclick=()=>go(0);$('backroom2').onclick=()=>go(0);
document.addEventListener('keydown',e=>{
 if(document.querySelector('.ov.on')||/INPUT|TEXTAREA|SELECT/.test((document.activeElement||{}).tagName||''))return;
 if(e.key==='ArrowRight')go(WALLS[view]+1);else if(e.key==='ArrowLeft')go(WALLS[view]-1)});
/* swipe with a finger: the room follows it; the far walls only give a little, so you come back through the bookshelf */
document.addEventListener('pointerdown',e=>{
 if(e.pointerType!=='touch'||swipe||turning()||document.querySelector('.ov.on'))return;
 if(!wallEl(WALLS[view]).contains(e.target)||e.target.closest('#catw,input,select,textarea'))return;
 swipe={id:e.pointerId,x:e.clientX,y:e.clientY,on:false,c0:WALLS[view]}},true);
document.addEventListener('pointermove',e=>{
 const s=swipe;if(!s||e.pointerId!==s.id)return;
 const dx=e.clientX-s.x,dy=e.clientY-s.y;
 if(!s.on){
  if((drag&&drag.active)||petDrag){swipe=null;return}
  if(Math.abs(dy)>14&&Math.abs(dy)>Math.abs(dx)){swipe=null;return}
  if(!(Math.abs(dx)>14&&Math.abs(dx)>Math.abs(dy)*1.3))return;
  s.on=true;s.x=e.clientX;s.lx=e.clientX;s.lt=performance.now();s.v=0;
  if(drag&&!drag.active){clearTimeout(drag.t);drag=null}
  turnStart()}
 const now=performance.now();s.v=(e.clientX-s.lx)/Math.max(1,now-s.lt);s.lx=e.clientX;s.lt=now;
 let c=s.c0-(e.clientX-s.x)/innerWidth;const lo=paired()?s.c0-1:Math.max(-1,s.c0-1),hi=paired()?s.c0+1:Math.min(1,s.c0+1);
 if(c<lo)c=lo-Math.min(.06,(lo-c)*.2);else if(c>hi)c=hi+Math.min(.06,(c-hi)*.2);
 camSet(c)},{passive:true});
function swipeEnd(){
 const s=swipe;swipe=null;if(!s||!s.on)return;
 swipeBlock=true;setTimeout(()=>{swipeBlock=false},80);
 const dc=cam-s.c0,dir=Math.sign(dc),fast=Math.abs(s.v)>.45&&Math.sign(-s.v)===dir;
 let target=s.c0;if(dir&&hexOk(s.c0+dir)&&(Math.abs(dc)>.22||(fast&&Math.abs(dc)>.03)))target=s.c0+dir;
 turnTo(target)}
document.addEventListener('pointerup',e=>{if(swipe&&e.pointerId===swipe.id)swipeEnd()});
document.addEventListener('pointercancel',e=>{if(swipe&&e.pointerId===swipe.id){if(swipe.on)swipeEnd();else swipe=null}});
document.addEventListener('click',e=>{if(swipeBlock){e.stopPropagation();e.preventDefault()}},true);
/* ---------- goals & quotes (stored apart from the books) ---------- */
let goals={},quotes=[],goalEditing=false,qFilter='';
try{goals=JSON.parse(localStorage.getItem('bookshelf-goals')||'{}')||{};quotes=JSON.parse(localStorage.getItem('bookshelf-quotes')||'[]')||[]}catch(e){}
function saveGoals(){try{localStorage.setItem('bookshelf-goals',JSON.stringify(goals))}catch(e){}markChange()}
function saveQuotes(){try{localStorage.setItem('bookshelf-quotes',JSON.stringify(quotes))}catch(e){toast(L('Storage full: export a backup and remove some images'))}markChange()}
const qTitle=q=>{const b=q&&books.find(x=>x.id===q.bookId);return b?b.title:(q&&q.title)||''};
function renderGoals(){
 const body=$('glbody');body.replaceChildren();
 const cy=new Date().getFullYear(),y=String(cy),goal=+goals[y]||0;
 const done=allReads().filter(b=>(b.finished||'').startsWith(y)).length;
 const gc=card(L('{y} reading goal',{y}),true);gc.classList.add('goalcard');
 if(goal>0&&!goalEditing){
  const pct=Math.min(1,done/goal),R=52,C=2*Math.PI*R,NS='http://www.w3.org/2000/svg';
  const ring=document.createElementNS(NS,'svg');ring.setAttribute('viewBox','0 0 130 130');ring.setAttribute('class','ring');ring.setAttribute('aria-hidden','true');
  ring.innerHTML=`<circle cx="65" cy="65" r="${R}" class="rt"/><circle cx="65" cy="65" r="${R}" class="rf" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C*(1-pct)).toFixed(1)}" transform="rotate(-90 65 65)"/><text x="65" y="66" class="rn">${done}</text><text x="65" y="88" class="rg">/ ${goal}</text>`;
  const info=el('div','ginfo'),start=new Date(cy,0,1),end=new Date(cy+1,0,1),expected=goal*(Date.now()-start)/(end-start),diff=Math.round(done-expected);
  info.append(el('div','gbig',L('{n} of {g} books',{n:done,g:goal})));
  const status=done>=goal?L('Goal reached! 🎉'):diff>0?L(diff===1?'{n} book ahead of schedule':'{n} books ahead of schedule',{n:diff}):diff<0?L(-diff===1?'{n} book behind schedule':'{n} books behind schedule',{n:-diff}):L('Right on schedule');
  info.append(el('div','gstat '+(done>=goal||diff>=0?'ok':'late'),status));
  if(done<goal)info.append(el('div','gsub',L('{n} to go',{n:goal-done})));
  const cb=el('button','fbtn',L('Change goal'));cb.type='button';cb.onclick=()=>{goalEditing=true;renderGoals();setTimeout(()=>$('goalin')&&$('goalin').focus(),30)};info.append(cb);
  const row=el('div','grow');row.append(ring,info);gc.append(row)}
 else{
  const f=el('div','gset');f.append(el('p','',L('How many books do you want to read in {y}?',{y})));
  const inp=el('input');inp.type='number';inp.min=1;inp.max=999;inp.id='goalin';inp.value=goal||'';inp.placeholder='24';inp.inputMode='numeric';inp.setAttribute('aria-label',L('{y} reading goal',{y}));
  const sb=el('button','fbtn pri2',L('Set goal'));sb.type='button';
  const set=()=>{const v=Math.round(+inp.value);if(v>0&&v<1000){goals[y]=v;saveGoals();offerRemind()}goalEditing=false;renderGoals()};sb.onclick=set;inp.onkeydown=e=>{if(e.key==='Enter')set()};
  f.append(inp,sb);gc.append(f)}
 body.append(gc);body.append(streakCard());
 const qc=card(L('Quotes'),true),bar=el('div','qbar');
 const ab=el('button','fbtn pri2','❝ '+L('Add a quote'));ab.type='button';ab.onclick=()=>openQuote(null,qFilter||null);bar.append(ab);
 const ids=[...new Set(quotes.map(q=>q.bookId))];if(!ids.includes(qFilter))qFilter='';
 if(ids.length>1){const fs=el('select');fs.setAttribute('aria-label',L('Book'));const o0=el('option','',L('All books'));o0.value='';fs.append(o0);
  ids.map(id=>({id,t:qTitle(quotes.find(q=>q.bookId===id))})).sort((a,b)=>a.t.localeCompare(b.t)).forEach(x=>{const o=el('option','',x.t);o.value=x.id;fs.append(o)});
  fs.value=qFilter;fs.onchange=()=>{qFilter=fs.value;renderGoals()};bar.append(fs)}
 qc.append(bar);
 const list=quotes.filter(q=>!qFilter||q.bookId===qFilter).slice().sort((a,b)=>b.created-a.created);
 if(!list.length)qc.append(el('p','stempty',L('No quotes yet. When a line stays with you, save it here.')));
 else{const board=el('div','qboard');list.forEach(q=>{const n=el('button','qnote');n.type='button';const hh=hue(q.id);
   n.style.setProperty('--r',((hh%7)-3)*.6+'deg');n.style.background=['#fff3c4','#e3f2d9','#fde2e4','#e2ecf9'][hh%4];
   n.append(el('span','qt','“'+q.text+'”'),el('small','','— '+qTitle(q)+(q.page?', '+L('p. {p}',{p:q.page}):'')));n.onclick=()=>openQuote(q);board.append(n)});qc.append(board)}
 body.append(qc);const sc=seriesCard();if(sc)body.append(sc);const lc=lentCard();if(lc)body.append(lc)}
let qCur=null,qDelArm=0;
function openQuote(q,bookId){
 qCur=q;qDelArm=0;$('qtitle').textContent=q?L('Edit quote'):L('New quote');
 const sel=$('qbook');sel.replaceChildren();books.slice().sort((a,b)=>a.title.localeCompare(b.title)).forEach(b=>{const o=el('option','',b.title);o.value=b.id;sel.append(o)});
 if(q&&!books.some(b=>b.id===q.bookId)){const o=el('option','',q.title||'?');o.value=q.bookId;sel.prepend(o)}
 sel.value=q?q.bookId:(bookId||(books.find(b=>st(b)==='reading')||books[0]||{}).id||'');
 $('qtext').value=q?q.text:'';$('qpage').value=q&&q.page?q.page:'';$('qdel').hidden=!q;$('qdel').textContent=L('Delete');
 $('qov').classList.add('on');if(matchMedia('(pointer:fine)').matches)setTimeout(()=>$('qtext').focus(),60)}
const closeQuote=()=>$('qov').classList.remove('on');
$('qcancel').onclick=closeQuote;$('qov').onclick=e=>{if(e.target===$('qov'))closeQuote()};
$('qsave').onclick=()=>{
 const text=$('qtext').value.trim();if(!text){$('qtext').focus();return}
 const bookId=$('qbook').value,b=books.find(x=>x.id===bookId),page=Math.round(+$('qpage').value)||0;
 if(qCur)Object.assign(qCur,{bookId,title:b?b.title:qCur.title,text,page});
 else quotes.push({id:'q'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),bookId,title:b?b.title:'',text,page,created:Date.now()});
 saveQuotes();closeQuote();toast(L('Quote saved.'));if(view==='goals')renderGoals();drawQuoteBtn()};
$('qdel').onclick=()=>{if(!qCur)return;if(Date.now()-qDelArm>3000){qDelArm=Date.now();$('qdel').textContent=L('Tap again to delete');return}
 quotes=quotes.filter(q=>q!==qCur);saveQuotes();closeQuote();if(view==='goals')renderGoals();drawQuoteBtn()};
function drawQuoteBtn(){const b=$('qadd');b.hidden=!cur;if(!cur)return;const n=quotes.filter(q=>q.bookId===cur.id).length;b.textContent='❝ '+L('Add a quote')+(n?' · '+L('{n} saved',{n}):'')}
$('qadd').onclick=()=>{if(cur)openQuote(null,cur.id)};
/* ---------- a small in-page question box (works where pop-ups don't) ---------- */
let askDone=null;
function ask(msg,ok,no){return new Promise(res=>{$('askmsg').textContent=msg;$('askok').textContent=ok||L('Save');$('askno').textContent=no||L('Cancel');$('askov').classList.add('on');
 askDone=v=>{$('askov').classList.remove('on');askDone=null;res(v)};$('askok').onclick=()=>askDone&&askDone(true);$('askno').onclick=()=>askDone&&askDone(false);setTimeout(()=>$('askok').focus(),50)})}
/* ---------- backups ---------- */
const LB='bookshelf-lastbackup',LC='bookshelf-lastchange',LSN='bookshelf-backup-snooze';
function markChange(){dataVer++;try{localStorage.setItem(LC,Date.now())}catch(e){}}
const backupJson=()=>JSON.stringify({app:'my-bookshelf',version:2,exported:new Date().toISOString(),books,quotes,goals,look,lang,sessions,marks:window.marksGet?marksGet():{}});
async function exportBackup(){
 const name='bookshelf-backup-'+today()+'.json',blob=new Blob([backupJson()],{type:'application/json'});
 let ok=false;
 try{const f=new File([blob],name,{type:'application/json'});if(matchMedia('(pointer:coarse)').matches&&navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});ok=true}}catch(e){if(e&&e.name==='AbortError')return}
 if(!ok){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}
 try{localStorage.setItem(LB,Date.now())}catch(e){}checkBackup();toast(L('Backup saved.'))}
function checkBackup(){
 const bn=$('bkbanner');if(!$('exp')||!books.length){bn.hidden=true;return}
 let lb=0,lc=0,sn=0;try{lb=+localStorage.getItem(LB)||0;lc=+localStorage.getItem(LC)||0;sn=+localStorage.getItem(LSN)||0}catch(e){}
 let msg='',every=30;try{const e=localStorage.getItem('bookshelf-backup-every');if(e!==null)every=+e||0}catch(e){}const now=Date.now();
 if(every&&sn<=now){if(!lb){if(books.length>=3)msg=L("You haven't backed up your library yet.")}else{const d=Math.floor((now-lb)/864e5);if(d>=every&&lc>lb)msg=d<2?L('Time for today’s backup.'):L("It's been {n} days since your last backup.",{n:d})}}
 $('bkmsg').textContent='\u{1F4BE} '+msg;bn.hidden=!msg}
$('bknow').onclick=exportBackup;$('bklater').onclick=()=>{let ev=30;try{const e=localStorage.getItem('bookshelf-backup-every');if(e!==null)ev=+e||30}catch(e){}try{localStorage.setItem(LSN,Date.now()+Math.min(7,ev)*864e5)}catch(e){}checkBackup()};
if($('exp'))$('exp').onclick=exportBackup;
/* ---------- Google Drive backup: one file in the person's own Drive, only this app can see it (drive.file) ---------- */
// Paste the OAuth client ID from Google Cloud Console (Web application, origin https://spendrax.github.io).
const GCID='754800695613-g022ane0liku6h3esokrqd238ngv9jro.apps.googleusercontent.com';
const GDK='bookshelf-gdrive',GDF='My Bookshelf backup.json';
const driveOn=()=>{try{return localStorage.getItem(GDK)==='1'}catch(e){return false}};
let gTok=null,gTokEnd=0,gisP=null;
const gisLoad=()=>gisP||(gisP=new Promise((res,rej)=>{const sc=document.createElement('script');sc.src='https://accounts.google.com/gsi/client';sc.onload=res;sc.onerror=()=>{gisP=null;rej(new Error('load'))};document.head.append(sc)}));
/* the sign-in window needs a tap to open, so this is only called from buttons */
function gToken(){if(gTok&&Date.now()<gTokEnd)return Promise.resolve(gTok);
 return gisLoad().then(()=>new Promise((res,rej)=>{const c=google.accounts.oauth2.initTokenClient({client_id:GCID,scope:'https://www.googleapis.com/auth/drive.file',
  callback:r=>{if(r&&r.access_token){gTok=r.access_token;gTokEnd=Date.now()+(r.expires_in-60)*1000;res(gTok)}else rej(new Error('denied'))},error_callback:e=>rej(e)});
  c.requestAccessToken({prompt:driveOn()?'':'consent'})}))}
async function gApi(url,opt={}){const t=await gToken();const r=await fetch(url,Object.assign({},opt,{headers:Object.assign({Authorization:'Bearer '+t},opt.headers||{})}));
 if(r.status===401){gTok=null;throw new Error('auth')}if(!r.ok)throw new Error('http '+r.status);return r}
async function gFind(){const q=encodeURIComponent(`name='${GDF}' and trashed=false`);
 const j=await (await gApi(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,modifiedTime)&spaces=drive`)).json();return (j.files||[])[0]||null}
async function driveBackup(){
 try{toast('☁️ '+L('Saving to Google Drive…'));const f=await gFind(),body=backupJson();
  if(f)await gApi(`https://www.googleapis.com/upload/drive/v3/files/${f.id}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body});
  else{const b='bkshelf'+Date.now(),meta=JSON.stringify({name:GDF,mimeType:'application/json'});
   await gApi('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+b},
    body:`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`})}
  try{localStorage.setItem(GDK,'1');localStorage.setItem(LB,Date.now())}catch(e){}checkBackup();toast('☁️ '+L('Backed up to your Google Drive.'));if(shareId())shareUpload().catch(()=>{})}
 catch(e){toast(L('Google Drive backup didn’t work. Check your connection and try again.'))}}
async function driveRestore(){
 try{const f=await gFind();if(!f){toast(L('No backup found in your Google Drive yet.'));return}
  const text=await (await gApi(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).text();
  try{localStorage.setItem(GDK,'1')}catch(e){}await importFile(new File([text],'backup.json',{type:'application/json'}))}
 catch(e){toast(L('Couldn’t reach your Google Drive. Check your connection and try again.'))}}
async function driveMenu(){
 if(!GCID){toast(L('Google Drive backup isn’t set up in this version yet.'));return}
 gisLoad().catch(()=>{});
 if(!driveOn()){if(await ask(L('Save a copy of your library in your own Google Drive? Only this app can see the file. You can also restore it on a new phone.'),L('Connect'),L('Restore from Drive')))driveBackup();else driveRestore();return}
 if(await ask(L('Google Drive backup is on. Back up now, or replace this shelf with the copy in your Drive?'),L('Back up now'),L('Restore from Drive')))driveBackup();else driveRestore()}
/* ---------- share my shelf: a read-only copy in the owner's Drive that anyone with the link can open (books, shelves, ratings; never notes or quotes) ---------- */
const SHK='bookshelf-shareid',FRK='bookshelf-friends',SHF='My Bookshelf – shared shelf.json';
const shareId=()=>{try{return localStorage.getItem(SHK)||''}catch(e){return''}};
const ownerName=()=>{try{return localStorage.getItem('bookshelf-name')||''}catch(e){return''}};
const shareJson=()=>JSON.stringify({app:'my-bookshelf-shared',v:1,name:ownerName(),updated:new Date().toISOString(),
 books:books.map(b=>({title:b.title,author:b.author||'',status:st(b),stars:b.stars||null,series:b.series||'',seriesNo:b.seriesNo||0,finished:b.finished||'',started:b.started||'',pages:b.pages||0,color:b.color||'',w:b.w||0,h:b.h||0,format:b.format||''})),
 ...(pairShare()?{goals,sessions:sessions.slice(-600),look:{pet:look.pet,coat:look.coat,_dragon:look._dragon,_spirit:look._spirit,petName:look.petName,window:look.window,rug:look.rug,plant:look.plant,pot:look.pot,bowls:look.bowls,wx:wxLoc&&isFinite(+wxLoc.lat)?{lat:Math.round(wxLoc.lat*10)/10,lon:Math.round(wxLoc.lon*10)/10,name:String(wxLoc.name||'').slice(0,40)}:null}}:{})});
async function shareUpload(){let id=shareId();const body=shareJson();
 if(id){try{await gApi(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body});return id}catch(e){if(e.message==='auth')throw e;id=''}}
 const b='bkshare'+Date.now(),meta=JSON.stringify({name:SHF,mimeType:'application/json'});
 const r=await (await gApi('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+b},
  body:`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`})).json();
 await gApi(`https://www.googleapis.com/drive/v3/files/${r.id}/permissions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'reader',type:'anyone'})});
 try{localStorage.setItem(SHK,r.id)}catch(e){}return r.id}
const shareUrl=id=>'https://spendrax.github.io/Bookshelf/#shelf='+id;
async function sendShelfLink(id){const u=shareUrl(id);
 try{if(navigator.share){await navigator.share({title:L('My bookshelf'),url:u});return}}catch(e){if(e&&e.name==='AbortError')return}
 try{await navigator.clipboard.writeText(u);toast(L('Link copied. Paste it in a message to your friend.'))}catch(e){toast(u)}}
async function shareMenu(){
 if(!GCID){toast(L('Google Drive backup isn’t set up in this version yet.'));return}
 gisLoad().catch(()=>{});
 if(shareId()){
  if(await ask(L('Your shelf is shared. Anyone with the link sees your books and ratings, never your notes. Send the link again, or stop sharing?'),L('Send link'),L('Stop sharing'))){
   try{await shareUpload();sendShelfLink(shareId())}catch(e){toast(L('Couldn’t reach your Google Drive. Check your connection and try again.'))}}
  else{try{await gApi(`https://www.googleapis.com/drive/v3/files/${shareId()}`,{method:'DELETE'})}catch(e){}try{localStorage.removeItem(SHK)}catch(e){}toast(L('Your shelf is no longer shared. The old link stops working.'))}
  return}
 if(!(await ask(L('Share your shelf with a friend? You get a link: anyone who opens it sees your books, shelves and ratings (never your notes or quotes). It updates each time you back up to Google Drive.'),L('Share'),L('Cancel'))))return;
 try{toast('☁️ '+L('Saving to Google Drive…'));const id=await shareUpload();try{localStorage.setItem(GDK,'1')}catch(e){}checkBackup();sendShelfLink(id)}
 catch(e){toast(L('Couldn’t reach your Google Drive. Check your connection and try again.'))}}
/* ---------- pairing: two shelves, one hexagon. Each person shares a read-only copy; your partner's side fills the three walls behind you ---------- */
const PK='bookshelf-partner',PDK='bookshelf-partner-data',PSK='bookshelf-pairshare';
const pairShare=()=>{try{return localStorage.getItem(PSK)==='1'}catch(e){return false}};
let partnerData=null;try{partnerData=JSON.parse(localStorage.getItem(PDK)||'null')}catch(e){}
const paired=()=>!!(partnerData&&Array.isArray(partnerData.books));
const pName=()=>String((partnerData&&partnerData.name)||'').slice(0,40);
async function fetchShelf(id){if(!/^[\w-]{10,100}$/.test(id))return null;
 try{const r=await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${GBKEY}`);if(!r.ok)return null;const d=await r.json();return d&&d.app==='my-bookshelf-shared'&&Array.isArray(d.books)?d:null}catch(e){return null}}
async function partnerRefresh(){let id='';try{id=localStorage.getItem(PK)||''}catch(e){}if(!id)return;
 const d=await fetchShelf(id);if(!d)return;partnerData=d;try{localStorage.setItem(PDK,JSON.stringify(d));localStorage.setItem(PK+'-at',Date.now())}catch(e){}renderPartner()}
function partnerPet(lk){lk=lk||{};const pet=String(lk.pet||''),an=ANIMALS[pet];if(!an||pet==='none')return null;
 let style;if(pet==='dragon'){const c=/^#[0-9a-f]{6}$/i.test(lk._dragon||'')?lk._dragon:'#3f8f4e',d=drShade(c);style=`--a:${c};--a2:${d};--a3:${drLight(c)};--cat:${c};--cat-st:${d}`}
 else{const co=(OPTS.find(o=>o.k==='coat')||{i:[]}).i.find(x=>x[0]===lk.coat);style=an[0]+';'+Object.entries((co&&co[2])||{}).map(([k,v])=>k+':'+v).join(';')}
 const w=el('div','ppet'+(lk._spirit==='1'?' spirit':''));w.innerHTML=`<svg class="cat" viewBox="0 0 60 56" aria-hidden="true">${an[1]}</svg>`;w.firstChild.setAttribute('style',style);
 if(lk.petName)w.append(el('div','nm',String(lk.petName).slice(0,20)));return w}
/* their Goals and Stats walls: drawn by the same code as yours, from their data, then copied over as a picture you can scroll */
function partnerCopy(fn,src,dest){const keep={books,goals,sessions,quotes,stYear:typeof stYear!=='undefined'?stYear:null};
 try{books=fixBooks(JSON.parse(JSON.stringify(partnerData.books))).map((b,i)=>Object.assign(b,{id:'p'+i}));goals=partnerData.goals&&typeof partnerData.goals==='object'?partnerData.goals:{};sessions=Array.isArray(partnerData.sessions)?partnerData.sessions:[];quotes=[];
  fn();const c=src.cloneNode(true);c.querySelectorAll('#backroom,#backroom2,#yrbtn').forEach(e=>e.remove());c.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));c.querySelectorAll('button,input,select,textarea,a').forEach(e=>{e.tabIndex=-1;e.disabled=true});
  dest.replaceChildren(el('h2','ptitle','\u{1F49E} '+(pName()?L('{n}’s side',{n:pName()}):L('Your partner’s side'))),...c.childNodes)}
 catch(e){dest.replaceChildren(el('p','stempty',L('Couldn’t draw this wall.')))}
 finally{books=keep.books;goals=keep.goals;sessions=keep.sessions;quotes=keep.quotes;try{if(keep.stYear!==null)stYear=keep.stYear}catch(e){}try{fn()}catch(e){}}}
function renderPartner(){
 const on=paired();document.body.classList.toggle('paired',on);[PGV,PRV,PSV].forEach(w=>{if(!on){w.hidden=true;w.replaceChildren()}});if(!on){pPetStop();PRV._sig='';return}
 const sig=JSON.stringify(partnerData)+lang;if(PRV._sig===sig&&PRV.firstChild)return;
 if(['pgoals','proom','pstats'].includes(view)||turning()){renderPartner.pending=true;return}renderPartner.pending=false;PRV._sig=sig;
 const d=partnerData,bks=fixBooks(JSON.parse(JSON.stringify(d.books))).map((b,i)=>Object.assign(b,{id:'p'+i,color:/^#[0-9a-f]{6}$/i.test(b.color||'')?b.color:['#8b2e2e','#2f4b6e','#3f6b4f','#a67c1f','#5b3a6b','#2e2e33','#a4552b','#2e6b6b'][hue(b.title)%8],w:+b.w||30+hue(b.title)%24,h:+b.h||150+hue(b.title)%62}));
 const box=el('div','pinner'),n=z=>bks.filter(b=>st(b)===z).length;
 box.append(el('h2','ptitle','\u{1F49E} '+(pName()?L('{n}’s shelves',{n:pName()}):L('Your partner’s shelves'))),el('p','psub',L('{r} read · {c} reading · {w} to read',{r:n('read'),c:n('reading'),w:n('want')})));
 [['reading','Currently reading'],['read','Read'],['want','Want to read'],['dnf',"Didn't finish"]].forEach(([z,lab])=>{const list=bks.filter(b=>st(b)===z);if(!list.length)return;
  if(z==='read')list.sort((a,b)=>String(b.finished||'').localeCompare(String(a.finished||'')));
  box.append(el('h3','pshh',L(lab)+' · '+list.length));const sh=el('div','pshelf');list.forEach(b=>{let sp;try{sp=makeSpine(b)}catch(e){sp=el('button','spine',b.title)}sp.classList.add('pbk');sp.dataset.id=b.id;sh.append(sp)});box.append(sh)});
 const lk=d.look||{},pick=(k,v)=>{const o=OPTS.find(x=>x.k===k);return o&&(o.i.find(x=>x[0]===v)||o.i[0])};
 const area=el('div','pwallarea'),win=pick('window',lk.window),plant=pick('plant',lk.plant);
 if(win&&win[0]!=='none'){const wn=el('div','pwin');wn.style.setProperty('--pwr',(win[2]&&win[2]['--wr'])||'60px 60px 6px 6px');area.append(wn,el('div','psill'))}
 if(plant&&plant[0]!=='none'&&PLANTS[plant[0]]){const pl=el('div','pplant'),pot=pick('pot',lk.pot);pl.style.setProperty('--pot',(pot&&pot[2]&&pot[2]['--pot'])||'#c1663a');pl.innerHTML=`<svg viewBox="0 0 80 110" aria-hidden="true">${PLANTS[plant[0]]}</svg>`;area.append(pl)}
 const th=el('div','ptherm');th.hidden=true;area.append(th);pWeather(lk.wx,th);
 box.append(area);
 const floor=el('div','pfloor'),rug=pick('rug',lk.rug),bw=pick('bowls',lk.bowls);
 if(rug&&rug[0]!=='none'){const rg=el('div','prug');if(rug[2]&&rug[2]['--rugbg'])rg.style.background=rug[2]['--rugbg'];floor.append(rg)}
 if(bw&&bw[0]!=='none'){const bx=el('div','pbowls');['foodbowl','waterbowl'].forEach(id=>{const sv=$(id)&&$(id).querySelector('svg');if(sv){const b=el('div','pbowl');b.append(sv.cloneNode(true));bx.append(b)}});floor.append(bx)}
 box.append(floor);
 const back=el('button','fbtn','↩ '+L('Back to my room'));back.type='button';back.onclick=()=>turnTo(0);box.append(back);
 PRV.replaceChildren(box);PRV._books=bks;pPetStart(d.look);
 try{partnerCopy(renderGoals,GV,PGV)}catch(e){}try{partnerCopy(renderStats,SV,PSV)}catch(e){}
 if(!turning()&&!['pgoals','proom','pstats'].includes(view))[PGV,PRV,PSV].forEach(w=>{w.hidden=false;w.inert=true;w.style.transform='translateX(100.5vw)'})}
/* ---------- their animal, alive on their side: walks their floor, jumps or flies up to free space on their shelves, naps, hops when tapped.
   Moves use the same trick as your animal (the end position is set first and the path is drawn back from where it was, in one go),
   it is never hidden or re-added while you watch, and it only thinks while you're looking at their shelves. ---------- */
let pPet=null;
function pPetStop(){if(pPet){clearTimeout(pPet.t);if(pPet.an)try{pPet.an.cancel()}catch(e){}pPet=null}}
function pPetStart(lk){pPetStop();lk=lk||{};const pet=String(lk.pet||''),an=ANIMALS[pet];if(!an||pet==='none')return;
 const box=PRV.querySelector('.pinner');if(!box)return;const pp=partnerPet(lk);if(!pp)return;
 const w=el('div','catw ppetw'+(lk._spirit==='1'?' spirit':''));const svg=pp.querySelector('svg');w.append(svg);
 if(lk.petName){const nm=el('div','pname',String(lk.petName).slice(0,20));w.append(nm)}
 box.append(w);pPet={w,svg,pet,way:PETWAY[pet]||'walk',spot:null,x:0,y:0,t:0,an:null,asleep:false};
 w.addEventListener('click',e=>{e.stopPropagation();if(!pPet)return;w.classList.remove('eating');if(pPet.asleep){pPet.asleep=false;w.classList.remove('sleeping')}svg.classList.remove('hop');void svg.getBoundingClientRect();svg.classList.add('hop');try{sfx('pop')}catch(e){}});
 pPetPlace();pPet.t=setTimeout(pPetTick,3000)}
/* where it can stand, in the wall's own coordinates: the floor, and the empty end of each shelf */
function pSpots(){const box=PRV.querySelector('.pinner');if(!box)return[];const br=box.getBoundingClientRect();if(!br.width)return[];const W=52,out=[];
 const fl=box.querySelector('.pfloor');if(fl){const r=fl.getBoundingClientRect();out.push({k:'floor',y:r.top-br.top+30,x0:10,x1:br.width-W-10})}
 const sl=box.querySelector('.psill');if(sl){const r=sl.getBoundingClientRect();out.push({k:'sill',y:r.top-br.top,x0:r.left-br.left-4,x1:r.right-br.left-W+4})}
 box.querySelectorAll('.pshelf').forEach(sh=>{const r=sh.getBoundingClientRect(),sp=sh.querySelectorAll('.spine'),last=sp.length?sp[sp.length-1].getBoundingClientRect().right:r.left;
  const z=r.height/(sh.offsetHeight||r.height),x0=last-br.left+6,x1=r.right-br.left-W-8,y=r.bottom-br.top-12*z;if(x1-x0>12)out.push({k:'shelf',y,x0,x1})});return out}
const pAtRest=()=>view==='proom'&&!turning()&&document.visibilityState==='visible'&&!PRV.hidden;
function pSet(x,y){const w=pPet.w;w.style.left=x+'px';w.style.top=(y-w.offsetHeight)+'px';pPet.x=x;pPet.y=y}
function pPetPlace(){if(!pPet)return;const sp=pSpots().find(s=>s.k==='floor');if(!sp){pPet.t=setTimeout(pPetPlace,1500);return}
 pPet.spot=sp;pSet(sp.x0+Math.random()*Math.max(1,sp.x1-sp.x0),sp.y)}
function pGo(sp,x,mode,done){const p=pPet,w=p.w,a={x:p.x,y:p.y},dir=x>a.x+1?-1:x<a.x-1?1:(+getComputedStyle(w).getPropertyValue('--dir')||1);
 w.style.setProperty('--dir',dir);pSet(x,sp.y);p.spot=sp;
 const dx=a.x-x,dy=a.y-sp.y,[kf0,dur]=petPath(mode,dx*dir,dy,1);
 const kf=kf0.map(k=>{const m=/translate\(([-\d.]+)px,([-\d.]+)px\)(?: scale\(([-\d.]+)\))?/.exec(k.transform)||[0,0,0,1];return{'--tx':m[1]+'px','--ty':m[2]+'px','--tsc':m[3]||1}});
 const setK=k=>Object.entries(k).forEach(([q,v])=>w.style.setProperty(q,v));
 w.classList.add('travel');w.classList.toggle('walking',mode==='walk');w.classList.toggle('flying',mode==='fly');w.style.transformOrigin='50% 100%';
 setK(kf[0]);w.style.transform='translate(var(--tx),var(--ty)) scale(var(--tsc))';
 const an=w.animate(kf,{duration:mode==='walk'?Math.max(700,Math.abs(dx)/((PETSPEED[p.pet]||70)/1000)):dur,easing:mode==='walk'?'linear':'ease-in-out'});p.an=an;
 let ended=false;const fin=()=>{if(ended)return;ended=true;p.an=null;w.style.transform='';['--tx','--ty','--tsc'].forEach(q=>w.style.removeProperty(q));w.classList.remove('travel','walking','flying');w.style.transformOrigin='';
  if(mode==='jump'||mode==='hop'){p.svg.classList.remove('landed');void p.svg.getBoundingClientRect();p.svg.classList.add('landed')}done&&done()};
 an.onfinish=fin;an.oncancel=fin}
function pEat(p,bowl,called){const sps=pSpots(),fl=sps.find(s=>s.k==='floor'),again=ms=>{if(pPet===p)p.t=setTimeout(pPetTick,ms)};if(!fl||!p.spot){again(2000);return}
 const br=PRV.querySelector('.pinner').getBoundingClientRect(),bb=bowl.getBoundingClientRect(),x=Math.min(fl.x1,Math.max(fl.x0,bb.left-br.left+bb.width/2-14));
 const eat=()=>{if(pPet!==p)return;p.w.style.setProperty('--dir',1);p.w.classList.add('eating');p.lastEat=Date.now();
  p.t=setTimeout(()=>{if(pPet!==p)return;p.w.classList.remove('eating');again(3000+Math.random()*3000)},4500+Math.random()*3500)};
 const R=REACH[p.way],up=p.y-fl.y,dn=fl.y-p.y,canReach=p.way==='fly'||(R?up<=R[0]&&dn<=R[1]:false)||called;
 if(p.spot.k==='floor'){if(Math.abs(x-p.x)<4)eat();else pGo(fl,x,'walk',()=>setTimeout(eat,260))}
 else if(canReach)pGo(fl,x,p.way==='fly'?'fly':p.way==='walk'?'hop':p.way,()=>setTimeout(eat,300));else again(2000)}
function pPetTick(){const p=pPet;if(!p)return;const again=ms=>{if(pPet===p)p.t=setTimeout(pPetTick,ms)};
 if(!pAtRest()||p.an){again(2500);return}
 if(!p.spot||!p.w.offsetHeight){pPetPlace();again(2000);return}
 const h=new Date().getHours(),night=h>=22||h<7,r=Math.random();
 if(p.asleep){if(Math.random()<(night?.8:.55)){again(7000+Math.random()*8000);return}p.asleep=false;p.w.classList.remove('sleeping');again(2500);return}
 if(r<(night?.3:.1)){p.asleep=true;p.w.classList.add('sleeping');again(9000+Math.random()*12000);return}
 const sps=pSpots();
 /* keep its place up to date if the shelves moved (screen turned, fonts loaded) */
 const same=sps.find(s=>s.k===p.spot.k&&Math.abs(s.y-p.spot.y)<40);if(same&&Math.abs(same.y-p.y)>1)pSet(Math.min(same.x1,Math.max(same.x0,p.x)),same.y);
 const R=REACH[p.way],reach=s=>{if(p.way==='fly')return true;const up=p.y-s.y,dn=s.y-p.y;if(!R)return s.k==='floor';return up<=R[0]&&dn<=R[1]&&Math.abs(up)<=R[2]};
 const bowls=[...PRV.querySelectorAll('.pbowl')],fl=sps.find(s=>s.k==='floor');
 if(bowls.length&&fl&&Date.now()-(p.lastEat||0)>50e3&&r>.8){pEat(p,bowls[Math.floor(Math.random()*bowls.length)]);return}
 const others=sps.filter(s=>Math.abs(s.y-p.y)>20&&reach(s));
 if(r<.5||!others.length){const cur=same||p.spot,x=cur.x0+Math.random()*Math.max(1,cur.x1-cur.x0);if(Math.abs(x-p.x)<25){again(2000+Math.random()*3000);return}
  pGo(cur,x,'walk',()=>again(2500+Math.random()*4000));return}
 const t=others[Math.floor(Math.random()*others.length)],x=t.x0+Math.random()*Math.max(1,t.x1-t.x0);
 const mode=p.way==='fly'?'fly':p.way==='walk'?'hop':p.way;pGo(t,x,mode,()=>again(3000+Math.random()*4000))}
/* their weather: the same free service as yours, for the city they chose (no city chosen = no thermometer) */
const WXEMO=c=>c===0?'☀️':c<=3?'⛅':c<=48?'\u{1F32B}️':c<=67?'\u{1F327}️':c<=77?'❄️':c<=82?'\u{1F326}️':'⛈️';
async function pWeather(wx,th){if(!wx||!isFinite(+wx.lat)||!isFinite(+wx.lon))return;
 const show=j=>{const c=j&&j.current;if(!c||!isFinite(c.temperature_2m))return;const night=c.is_day===0&&c.weather_code===0;
  th.replaceChildren(el('b','',(night?'\u{1F319}':WXEMO(+c.weather_code))+' '+Math.round(c.temperature_2m)+'°'),el('small','',String(wx.name||'').split(',')[0]||L('Their weather')));th.hidden=false};
 const key='wx:'+wx.lat+','+wx.lon+(FAHR?'F':'C');if(pWeather.c&&pWeather.c.k===key&&Date.now()-pWeather.c.t<15*60e3){show(pWeather.c.j);return}
 try{const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${+wx.lat}&longitude=${+wx.lon}&current=temperature_2m,weather_code,is_day&timezone=auto&forecast_days=1${FAHR?'&temperature_unit=fahrenheit':''}`);
  if(!r.ok)return;const j=await r.json();pWeather.c={k:key,t:Date.now(),j};show(j)}catch(e){}}
/* tap one of their bowls: it fills up and their animal comes over to eat (on your screen) */
PRV.addEventListener('click',e=>{const b=e.target.closest('.pbowl');if(!b)return;e.stopPropagation();
 b.animate([{transform:'translateY(0) rotate(0)'},{transform:'translateY(-4px) rotate(-4deg)'},{transform:'translateY(0) rotate(0)'}],{duration:300});try{sfx('pop')}catch(e){}
 const p=pPet;if(!p)return;clearTimeout(p.t);if(p.asleep){p.asleep=false;p.w.classList.remove('sleeping')}p.w.classList.remove('eating');p.lastEat=0;
 const go=()=>{if(pPet!==p)return;if(p.an){p.t=setTimeout(go,300);return}pEat(p,b,true)};go()},true);
/* tapping one of their books: who wrote it, their rating, and a way to put it on your own list */
PRV.addEventListener('click',async e=>{const s=e.target.closest('.pbk');if(!s||!PRV._books)return;e.preventDefault();e.stopPropagation();
 const b=PRV._books.find(x=>x.id===s.dataset.id);if(!b)return;const key=(b.title+'|'+(b.author||'')).toLowerCase(),have=books.some(x=>(x.title+'|'+(x.author||'')).toLowerCase()===key);
 const msg=b.title+(b.author?' — '+b.author:'')+(b.stars?'  ★ '+fmtStars(b.stars):'');
 if(have){await ask(msg,L('Close'),L('Close'));return}
 if(await ask(msg,'+ '+L('Want to read'),L('Close'))){books.push({id:'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),title:b.title,author:b.author||'',status:'want',color:b.color,w:b.w,h:b.h,createdAt:Date.now(),recBy:pName()});store();render();toast(L('Added to Want to read.'))}},true);
async function pairMenu(){
 if(!GCID){toast(L('Google Drive backup isn’t set up in this version yet.'));return}
 gisLoad().catch(()=>{});
 if(paired()){
  if(await ask(L('Paired with {n}. Their side of the room is behind you: swipe past your Stats or your Goals. Send your pairing link again, or unpair?',{n:pName()||L('your partner')}),L('Send link'),L('Unpair'))){pairSend();return}
  if(!(await ask(L('Unpair? Their side of the room goes away. Your own books don’t change.'),L('Unpair'),L('Cancel'))))return;
  if(view!=='room')turnTo(0);try{[PK,PDK,PSK].forEach(k=>localStorage.removeItem(k))}catch(e){}partnerData=null;renderPartner();toast(L('Unpaired.'));return}
 if(!(await ask(L('Pair your bookshelf with someone? You’ll each see the other’s shelves, goals and stats on the far side of the room (never notes or quotes). Each of you only changes your own books.'),L('Pair'),L('Cancel'))))return;
 pairSend()}
async function pairSend(){try{localStorage.setItem(PSK,'1')}catch(e){}
 try{toast('☁️ '+L('Saving to Google Drive…'));const id=await shareUpload();try{localStorage.setItem(GDK,'1')}catch(e){}checkBackup();
  const u='https://spendrax.github.io/Bookshelf/#pair='+id;
  try{if(navigator.share){await navigator.share({title:L('Pair our bookshelves'),url:u});return}}catch(e){if(e&&e.name==='AbortError')return}
  try{await navigator.clipboard.writeText(u);toast(L('Link copied. Send it to the person you’re pairing with.'))}catch(e){toast(u)}}
 catch(e){toast(L('Couldn’t reach your Google Drive. Check your connection and try again.'))}}
async function pairAccept(id){const d=await fetchShelf(id);if(!d){toast(L('Couldn’t open this pairing link. Ask them to send it again.'));return}
 const nm=String(d.name||'').slice(0,40);
 if(!(await ask(L('Pair with {n}? Their shelves, goals and stats will appear on the far side of your room.',{n:nm||L('this person')}),L('Pair'),L('Cancel'))))return;
 try{localStorage.setItem(PK,id);localStorage.setItem(PDK,JSON.stringify(d))}catch(e){}partnerData=d;renderPartner();
 toast('\u{1F49E} '+L('Paired! Swipe past your Stats to visit their side.'));
 if(!pairShare()&&GCID&&await ask(L('Send them your own pairing link, so your shelves show up on their side too?'),L('Send my link'),L('Later')))pairSend()}
/* refresh their side when the app opens and when you come back to it */
setTimeout(()=>{try{renderPartner()}catch(e){}partnerRefresh()},3000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')return;let at=0;try{at=+localStorage.getItem(PK+'-at')||0}catch(e){}if(Date.now()-at>10*60e3)partnerRefresh()});
/* ---------- a friend's shelf: opened from their link, read-only, remembered in Customize › More ---------- */
const friends=()=>{try{return JSON.parse(localStorage.getItem(FRK)||'[]')||[]}catch(e){return[]}};
const saveFriends=a=>{try{localStorage.setItem(FRK,JSON.stringify(a.slice(0,30)))}catch(e){}};
function frTitle(name){return name?L('{n}’s shelf',{n:name}):L('A friend’s shelf')}
async function friendOpen(id){
 if(!/^[\w-]{10,100}$/.test(id))return;
 const box=$('frlist');box.replaceChildren(el('p','stempty',L('Opening…')));$('frh').textContent=L('A friend’s shelf');$('frov').classList.add('on');
 let d=null;try{const r=await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${GBKEY}`);if(r.ok)d=await r.json()}catch(e){}
 if(!d||d.app!=='my-bookshelf-shared'||!Array.isArray(d.books)){box.replaceChildren(el('p','stempty',L('Couldn’t open this shelf. It may no longer be shared, or you’re offline.')));return}
 const name=String(d.name||'').slice(0,40);$('frh').textContent=frTitle(name);
 saveFriends([{id,name}].concat(friends().filter(f=>f.id!==id)));
 box.replaceChildren();
 const mine=new Set(books.map(b=>(b.title+'|'+(b.author||'')).toLowerCase()));
 [['reading','Currently reading'],['read','Read'],['want','Want to read'],['dnf',"Didn't finish"]].forEach(([z,lab])=>{
  const list=d.books.filter(b=>b&&b.status===z&&b.title);if(!list.length)return;
  if(z==='read')list.sort((a,b)=>String(b.finished||'').localeCompare(String(a.finished||'')));
  box.append(el('h3','',L(lab)+' · '+list.length));const ul=el('ul','nextlist');
  list.forEach(b=>{const t=String(b.title).slice(0,200),a=String(b.author||'').slice(0,120),li=el('li','',t);if(a)li.append(el('small','','— '+a));
   if(+b.stars>0)li.append(el('small','','★ '+fmtStars(Math.min(5,+b.stars))));
   if(!mine.has((t+'|'+a).toLowerCase())){const add=el('button','fbtn','+ '+L('Want to read'));add.type='button';
    add.onclick=()=>{books.push({id:'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),title:t,author:a,status:'want',color:['#8b2e2e','#2f4b6e','#3f6b4f','#a67c1f','#5b3a6b','#2e2e33','#a4552b','#2e6b6b'][hue(t)%8],w:30+Math.floor(Math.random()*24),h:150+Math.floor(Math.random()*62),createdAt:Date.now(),recBy:name});
     mine.add((t+'|'+a).toLowerCase());store();render();add.remove();toast(L('Added to Want to read.'))};li.append(add)}
   ul.append(li)});box.append(ul)})}
function friendsOpen(){const box=$('frlist'),fs=friends();$('frh').textContent=L('Friends’ shelves');box.replaceChildren();$('lov').classList.remove('on');$('frov').classList.add('on');
 if(!fs.length){box.append(el('p','stempty',L('When a friend sends you their shelf link, it shows up here.')));return}
 const ul=el('ul','nextlist');fs.forEach(f=>{const li=el('li','',frTitle(f.name)),o=el('button','fbtn',L('Open')),x=el('button','fbtn','✕');o.type=x.type='button';x.setAttribute('aria-label',L('Remove'));
  o.onclick=()=>friendOpen(f.id);x.onclick=()=>{saveFriends(friends().filter(g=>g.id!==f.id));friendsOpen()};li.append(o,x);ul.append(li)});box.append(ul)}
$('frx').onclick=()=>$('frov').classList.remove('on');
/* a shelf link opens the friend's shelf (also when the app is already open) */
{const go=()=>{const m=/#(shelf|pair)=([\w-]+)/.exec(location.hash||'');if(!m)return;try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}if(m[1]==='pair')pairAccept(m[2]);else friendOpen(m[2])};
 addEventListener('hashchange',go);setTimeout(go,800)}
/* the backup reminder's button saves to Drive once it's connected */
$('bknow').onclick=()=>GCID?driveBackup():exportBackup();
/* until Drive is connected, the backup banner explains it once there are a few books (Later snoozes it like before) */
{const cb=checkBackup;checkBackup=function(){cb();if(!GCID||driveOn()){$('bknow').textContent=L('Back up now');return}let sn=0;try{sn=+localStorage.getItem(LSN)||0}catch(e){}
 if(books.length>=3&&sn<=Date.now()){$('bkmsg').textContent='☁️ '+L('Keep your library safe: save a copy in your own Google Drive, and get it back on any phone.');$('bknow').textContent='☁️ '+L('Use Google Drive');$('bkbanner').hidden=false}}
 try{checkBackup()}catch(e){}}
/* ---------- import: a backup (.json) or a Goodreads / StoryGraph export (.csv) ---------- */
function parseCSV(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];
 if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
 else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(f);rows.push(row);row=[];f=''}else f+=c}
 if(f||row.length){row.push(f);rows.push(row)}return rows.filter(r=>r.some(x=>x.trim()))}
function csvBooks(rows){
 if(!rows.length)return null;const H=rows[0].map(h=>h.trim().toLowerCase()),col=n=>H.indexOf(n);
 const gr=col('exclusive shelf')>=0,sg=col('read status')>=0;if(!gr&&!sg)return null;
 const g=(r,n)=>{const i=col(n);return i>=0&&r[i]!=null?String(r[i]).trim():''};
 const dt=x=>{const m=String(x||'').match(/(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:''};
 const isb=x=>{const v=String(x).replace(/[^0-9Xx]/g,'');return v.length===13||v.length===10?(toIsbn13(v)||''):''};
 const PAL=['#8b2e2e','#2f4b6e','#3f6b4f','#a67c1f','#5b3a6b','#2e2e33','#a4552b','#2e6b6b','#6b4f3a','#7a2f55','#1f5f8b','#9c6b1a'];
 const clean=x=>x.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').trim().slice(0,2000);
 const out=[],base=Date.now().toString(36);let n=0;
 rows.slice(1).forEach(r=>{const title=g(r,'title');if(!title)return;n++;
  const b={id:'i'+base+'-'+n.toString(36),title:title.slice(0,100),w:30+Math.floor(Math.random()*24),h:150+Math.floor(Math.random()*62),tags:[],cover:'',back:'',spine:'',blurb:'',page:0,pages:0,started:'',color:PAL[hue(title)%PAL.length]};
  let added='';
  if(gr){b.author=g(r,'author');b.isbn=isb(g(r,'isbn13'))||isb(g(r,'isbn'));const sr=+g(r,'my rating');b.stars=sr>0?sr:null;b.pages=+g(r,'number of pages')||0;
   const sh=g(r,'exclusive shelf');b.status=sh==='read'?'read':sh==='currently-reading'?'reading':/^(did-not-finish|dnf|abandoned|gave-up)$/.test(sh)?'dnf':'want';
   if(sh&&b.status!=='dnf'&&!['read','currently-reading','to-read'].includes(sh))b.tags.push(sh.replace(/-/g,' '));
   b.finished=b.status==='read'?dt(g(r,'date read')):'';added=dt(g(r,'date added'));
   g(r,'bookshelves').split(',').map(x=>x.trim()).filter(x=>x&&!['read','currently-reading','to-read',sh].includes(x)).forEach(x=>b.tags.push(x.replace(/-/g,' ')));
   b.note=clean(g(r,'my review')||g(r,'private notes'))}
  else{b.author=g(r,'authors').split(',')[0].trim();b.isbn=isb(g(r,'isbn/uid'));const sr=+g(r,'star rating');b.stars=sr>0?Math.round(sr*4)/4:null;
   const rs=g(r,'read status');b.status=rs==='read'?'read':rs==='currently-reading'?'reading':rs==='did-not-finish'?'dnf':'want';
   const ranges=g(r,'dates read').split(',').map(x=>x.trim()).filter(Boolean),last=ranges[ranges.length-1]||'',parts=last.split(/\s*-\s*(?=\d{4})/).map(dt);
   b.finished=b.status==='read'?(parts[1]||dt(g(r,'last date read'))||parts[0]||''):'';b.started=b.status!=='want'&&parts[0]?parts[0]:'';
   added=dt(g(r,'date added'));g(r,'tags').split(',').map(x=>x.trim()).filter(Boolean).forEach(x=>b.tags.push(x));b.note=clean(g(r,'review'))}
  b.createdAt=added?Date.parse(added+'T12:00'):Date.now()-n;
  b.tags=[...new Set(b.tags.map(t=>t.slice(0,24)))].slice(0,8);out.push(b)});
 return out}
async function importFile(file){
 const bad=()=>toast(L('Couldn’t read that file. Use a Goodreads or StoryGraph export (.csv) or a Bookshelf backup (.json).'));
 let text='';try{text=(await file.text()).replace(/^﻿/,'')}catch(e){bad();return}
 if(/\.json$/i.test(file.name)||/^\s*[\[{]/.test(text)){
  let d;try{d=JSON.parse(text)}catch(e){bad();return}
  const bk=Array.isArray(d)?d:d&&Array.isArray(d.books)?d.books:null;if(!bk){toast(L('Not a valid backup file'));return}
  if(!(await ask(L('Replace your current shelf with this backup?'),L('Import'))))return;
  books=fixBooks(bk);
  if(!Array.isArray(d)){if(d.marks&&window.marksPut)marksPut(d.marks);if(Array.isArray(d.sessions)){sessions=d.sessions;saveSessions()}if(Array.isArray(d.quotes)){quotes=d.quotes;saveQuotes()}if(d.goals&&typeof d.goals==='object'){goals=d.goals;saveGoals()}
   if(d.look&&typeof d.look==='object'){look=d.look;try{localStorage.setItem(LK,JSON.stringify(look))}catch(e){}applyLook()}if(d.lang&&LANGS[d.lang]&&d.lang!==lang)setLang(d.lang)}
  store();render();return}
 const nb=csvBooks(parseCSV(text));if(!nb){bad();return}
 const key=b=>(b.title+'|'+(b.author||'')).toLowerCase().replace(/\s+/g,' ').trim(),have=new Set(books.map(key));
 const fresh=nb.filter(b=>!have.has(key(b))),dup=nb.length-fresh.length;
 if(!fresh.length){toast(L('No new books found in that file.'));return}
 const c=z=>fresh.filter(b=>b.status===z).length;
 let msg=L('Found {n} books: {r} read, {c} reading, {w} to read.',{n:fresh.length,r:c('read'),c:c('reading'),w:c('want')});
 if(dup)msg+=' '+(dup===1?L('1 is already on your shelves and will be skipped.'):L('{d} are already on your shelves and will be skipped.',{d:dup}));msg+=' '+L('Add them to your shelves?');
 if(!(await ask(msg,L('Add books'))))return;
 books=books.concat(fresh);store();render();toast(L('Added {n} books.',{n:fresh.length}));
 const withIsbn=fresh.filter(b=>b.isbn);
 if(withIsbn.length&&await ask(L('Fetch covers for the imported books? This uses the internet and can take a minute.'),L('Fetch covers'),L('Not now')))fetchCovers(withIsbn)}
async function fetchCovers(list){
 let i=0,done=0,found=0;const total=list.length;
 const worker=async()=>{while(i<list.length){const b=list[i++];
  try{const cv=await fromUrl(`https://covers.openlibrary.org/b/isbn/${b.isbn}-M.jpg?default=false`,240);b.cover=cv;const col=await avgColor(cv);if(col)b.color=col;found++}catch(e){}
  done++;if(done%5===0||done===total)toast(L('Fetching covers {i}/{n}…',{i:done,n:total}));if(done%10===0){store();render()}}};
 await Promise.all([worker(),worker(),worker()]);store();render();toast(L('Done: {n} covers found.',{n:found}))}
if($('impf'))$('impf').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)importFile(f)};
/* ---------- arrange a shelf in one tap ---------- */
let arrZone='read';
const ARR=[['series','By series'],['colour','By colour'],['author','By author'],['title','By title'],['rating','By rating'],['date','By date']];
function openArrange(z){arrZone=z;const box=$('arrlist');box.replaceChildren();ARR.forEach(([k,l])=>{const b=el('button','fbtn arrb',L(l));b.type='button';b.onclick=()=>{$('arrov').classList.remove('on');arrange(arrZone,k)};box.append(b)});$('arrov').classList.add('on')}
function hsl(hex){const n=parseInt((hex||'#888888').slice(1),16),r=(n>>16)/255,g=(n>>8&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;let h=0,s=0;
 if(d){s=d/(1-Math.abs(2*l-1));h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360}return [h,s,l]}
function arrange(z,k){
 const before=new Map();document.querySelectorAll('.scene .bk').forEach(e=>before.set(e.dataset.id,e.getBoundingClientRect()));
 const idx=[];books.forEach((b,i)=>{if(st(b)===z)idx.push(i)});const list=idx.map(i=>books[i]);
 const art=t=>(t||'').toLowerCase().replace(/^(the|a|an|le|la|les|l'|el|los|las|der|die|das|il|lo|gli)\s+/i,'');
 const sur=a=>{const p=(a||'').trim().split(/\s+/);return (p[p.length-1]||'').toLowerCase()};
 const when=b=>z==='read'?(b.finished||''):z==='reading'?(b.started||''):String(b.createdAt||0).padStart(15,'0');
 const cmp={series:(a,b)=>{const A=(a.series||'').toLowerCase(),B=(b.series||'').toLowerCase();if(!A!==!B)return A?-1:1;return A.localeCompare(B)||(a.seriesNo||0)-(b.seriesNo||0)||art(a.title).localeCompare(art(b.title))},
  colour:(a,b)=>{const A=hsl(a.color),B=hsl(b.color),ga=A[1]<.18,gb=B[1]<.18;if(ga!==gb)return ga?1:-1;return ga?B[2]-A[2]:A[0]-B[0]},
  /* by author; an author's series stay together, in reading order, filed under the name of the series */
  author:(a,b)=>{const g=x=>art((x.series||'').trim()||x.title).toLowerCase();return sur(a.author).localeCompare(sur(b.author))||g(a).localeCompare(g(b))||(a.series&&b.series?(a.seriesNo||1e9)-(b.seriesNo||1e9):0)||art(a.title).localeCompare(art(b.title))},
  title:(a,b)=>art(a.title).localeCompare(art(b.title)),
  rating:(a,b)=>(b.stars||0)-(a.stars||0)||art(a.title).localeCompare(art(b.title)),
  date:(a,b)=>when(b).localeCompare(when(a))};
 list.sort(cmp[k]);idx.forEach((pos,j)=>{books[pos]=list[j]});store();render();if(!reduce)animateArrange(z,before);toast(L('Arranged.'))}
function animateArrange(z,before){
 const els=[...document.querySelectorAll('.scene .dz[data-zone="'+z+'"] .bk')],lift=z==='reading'?-14:-24,sh='drop-shadow(0 12px 8px rgba(0,0,0,.45))';
 els.forEach((e,i)=>{const a=before.get(e.dataset.id);if(!a)return;const b=e.getBoundingClientRect(),dx=a.left-b.left,dy=a.top-b.top;
  e.style.zIndex=String(10+i);
  const an=e.animate([
   {transform:`translate(${dx}px,${dy}px)`,filter:'none',offset:0},
   {transform:`translate(${dx}px,${dy+lift}px) scale(1.08)`,filter:sh,offset:.2},
   {transform:`translate(0px,${lift}px) scale(1.08)`,filter:sh,offset:.72},
   {transform:'translate(0px,3px) scale(.98)',filter:'none',offset:.9},
   {transform:'translate(0px,0px) scale(1)',filter:'none',offset:1}],
   {duration:1050,delay:i*35,easing:'ease-in-out',fill:'backwards'});
  an.onfinish=an.oncancel=()=>{e.style.zIndex=''}})}
document.querySelectorAll('[data-arr]').forEach(b=>b.onclick=()=>openArrange(b.dataset.arr));
$('arrx').onclick=()=>$('arrov').classList.remove('on');$('arrov').onclick=e=>{if(e.target===$('arrov'))$('arrov').classList.remove('on')};
/* ---------- year in review: a picture to keep or share ---------- */
let yrBlob=null,yrName='';
function fitText(x,t,w){if(x.measureText(t).width<=w)return t;while(t.length>1&&x.measureText(t+'…').width>w)t=t.slice(0,-1);return t+'…'}
async function makeReview(y){
 const set=allReads().filter(b=>(b.finished||'').startsWith(y));
 if(!set.length){toast(L('Nothing to show for {y} yet.',{y}));return}
 const rated=set.filter(b=>b.stars),paged=set.filter(b=>b.pages>0),pages=paged.reduce((a,b)=>a+b.pages,0);
 const gm={};set.forEach(b=>bookGenres(b).forEach(g=>{gm[g]=(gm[g]||0)+1}));const fav=Object.entries(gm).sort((a,b)=>b[1]-a[1])[0];
 const top=rated.slice().sort((a,b)=>b.stars-a.stars)[0],longest=paged.slice().sort((a,b)=>b.pages-a.pages)[0];
 const timed=set.filter(timedOK).map(b=>({b,d:Math.max(1,days(b.started,b.finished))})).sort((a,b)=>a.d-b.d)[0];
 const W=1080,H=1350,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
 const cs=getComputedStyle(document.documentElement),v=(n,d)=>cs.getPropertyValue(n).trim()||d;
 const wall=v('--wall','#e9dcc4'),wall2=v('--wall2','#e3d4b9'),wood=v('--wood','#9a6538'),wood2=v('--wood2','#6d4523'),ink=v('--ink','#2a2118'),muted=v('--muted','#7a6a58'),cardc=v('--card','#fffaf1'),acc=v('--acc','#8b2e2e');
 for(let i=0;i<W;i+=92){x.fillStyle=wall;x.fillRect(i,0,46,H);x.fillStyle=wall2;x.fillRect(i+46,0,46,H)}
 const rr=(X,Y,w,h,r)=>{x.beginPath();if(x.roundRect)x.roundRect(X,Y,w,h,r);else x.rect(X,Y,w,h)};
 x.textAlign='center';x.fillStyle=ink;x.font='bold 66px Georgia, serif';x.fillText(fitText(x,L('My {y} in books',{y}),W-120),W/2,128);
 /* the year's books as spines on a shelf */
 const sx=90,sy=175,sw=W-180,shh=330;x.fillStyle=wood2;rr(sx,sy,sw,shh+44,14);x.fill();x.fillStyle='rgba(0,0,0,.38)';x.fillRect(sx+18,sy+18,sw-36,shh);
 let bx=sx+30;const base=sy+18+shh;
 for(const b of set){const bw=Math.round(26+((b.w||40)-30)*.55),bh=FMTH[b.format]?Math.round(FMTH[b.format]*1.1):Math.round(200+((b.h||180)-150)*1.4);if(bx+bw>sx+sw-30)break;
  x.fillStyle=b.color||'#8b2e2e';x.fillRect(bx,base-bh,bw,bh);const gr=x.createLinearGradient(bx,0,bx+bw,0);gr.addColorStop(0,'rgba(0,0,0,.3)');gr.addColorStop(.3,'rgba(255,255,255,.12)');gr.addColorStop(1,'rgba(0,0,0,.25)');x.fillStyle=gr;x.fillRect(bx,base-bh,bw,bh);
  x.fillStyle='rgba(255,255,255,.35)';x.fillRect(bx+3,base-bh+14,bw-6,3);
  /* the title down the spine, like on the shelf: light letters on dark books, dark letters on light ones */
  {const m=/^#?([0-9a-f]{6})$/i.exec(b.color||''),n=m?parseInt(m[1],16):0x8b2e2e,lum=(.299*(n>>16&255)+.587*(n>>8&255)+.114*(n&255))/255;
   x.save();x.translate(bx+bw/2,base-bh+28);x.rotate(Math.PI/2);x.textAlign='left';x.textBaseline='middle';x.fillStyle=lum>.62?'rgba(30,22,14,.9)':'rgba(255,250,240,.95)';
   x.font='600 '+Math.max(13,Math.min(19,bw-12))+'px Georgia, serif';x.fillText(fitText(x,b.title||'',bh-44),0,1);x.restore()}
  bx+=bw+3}
 x.fillStyle=wood;x.fillRect(sx,base,sw,26);
 /* big numbers */
 const tile=(X,val,lab)=>{x.fillStyle=wood;rr(X,590,420,190,10);x.fill();x.fillStyle=cardc;rr(X+10,600,400,170,6);x.fill();x.fillStyle=ink;x.font='bold 84px Georgia, serif';x.fillText(val,X+210,700);x.fillStyle=muted;x.font='600 26px system-ui, sans-serif';x.fillText(lab.toUpperCase(),X+210,745)};
 tile(90,nf(set.length),L('Books read'));tile(570,pages?nf(pages):'–',L('Pages read'));
 /* highlights */
 const lines=[];if(fav)lines.push([L('Favourite genre'),L(fav[0])]);if(top)lines.push([L('Top-rated book'),top.title+'  ★'+fmtStars(top.stars)]);
 if(longest)lines.push([L('Longest book'),longest.title+'  ·  '+L('{n} pages',{n:nf(longest.pages)})]);if(timed)lines.push([L('Fastest read'),timed.b.title+'  ·  '+L('{n} days',{n:timed.d})]);
 if(rated.length)lines.push([L('Average rating'),'★ '+nf(rated.reduce((a,b)=>a+b.stars,0)/rated.length,2)]);
 x.textAlign='left';let ly=850;for(const [k,val] of lines.slice(0,5)){x.fillStyle=muted;x.font='600 24px system-ui, sans-serif';x.fillText(k.toUpperCase(),100,ly);x.fillStyle=ink;x.font='36px Georgia, serif';x.fillText(fitText(x,val,W-200),100,ly+44);ly+=92}
 x.textAlign='center';x.fillStyle=acc;x.font='600 28px system-ui, sans-serif';x.fillText('\u{1F4DA} '+L('My Bookshelf'),W/2,H-50);
 $('yrimg').src=c.toDataURL('image/png');$('yrimg').alt=L('My {y} in books',{y});yrName=`my-${y}-in-books.png`;
 yrBlob=await new Promise(r=>c.toBlob(r,'image/png'));
 let canShare=false;try{canShare=!!(navigator.canShare&&navigator.canShare({files:[new File([yrBlob],yrName,{type:'image/png'})]}))}catch(e){}
 $('yrshare').hidden=!canShare;$('yrov').classList.add('on')}
$('yrbtn').onclick=()=>makeReview(stYear==='all'||!stYear?String(new Date().getFullYear()):stYear);
$('yrshare').onclick=async()=>{try{await navigator.share({files:[new File([yrBlob],yrName,{type:'image/png'})],title:yrName})}catch(e){}};
$('yrsave').onclick=()=>{if(!yrBlob)return;const a=document.createElement('a');a.href=URL.createObjectURL(yrBlob);a.download=yrName;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000)};
$('yrclose').onclick=()=>$('yrov').classList.remove('on');$('yrov').onclick=e=>{if(e.target===$('yrov'))$('yrov').classList.remove('on')};
/* Escape closes the top-most small window first */
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;
 if($('askov').classList.contains('on')){e.stopImmediatePropagation();askDone&&askDone(false)}
 else if($('qov').classList.contains('on')){e.stopImmediatePropagation();closeQuote()}
 else if($('aboutov').classList.contains('on')){e.stopImmediatePropagation();$('aboutov').classList.remove('on')}
 else if($('arrov').classList.contains('on')){e.stopImmediatePropagation();$('arrov').classList.remove('on')}
 else if($('yrov').classList.contains('on')){e.stopImmediatePropagation();$('yrov').classList.remove('on')}
 else if($('genov').classList.contains('on')){e.stopImmediatePropagation();$('genov').classList.remove('on')}},true);
/* ---------- the pet keeps its seat when a side wall redraws ---------- */
{const rs=renderStats,rg=renderGoals;renderStats=function(){try{petSync()}catch(e){}rs();petAfterRender()};renderGoals=function(){try{petSync()}catch(e){}rg();petAfterRender()}}
/* ---------- live window: the real time of day, and the real weather when a place is set ---------- */
const WXK='bookshelf-wxloc',WXC='bookshelf-wx',FAHR=/^en-US/i.test(navigator.language||'');
let wxLoc=null,wxData=null;try{wxLoc=JSON.parse(localStorage.getItem(WXK)||'null');wxData=JSON.parse(localStorage.getItem(WXC)||'null')}catch(e){}
const win=$('win');
function sunTimes(d){
 const day=d.toISOString?today():'';
 if(wxData&&wxData.day===today()&&wxData.sunrise)return [new Date(wxData.sunrise),new Date(wxData.sunset)];
 const doy=Math.floor((d-new Date(d.getFullYear(),0,0))/864e5),tz=-d.getTimezoneOffset()/60,lat=wxLoc?wxLoc.lat:45,lon=wxLoc?wxLoc.lon:tz*15-7.5;
 const dec=23.44*Math.PI/180*Math.sin(2*Math.PI*(284+doy)/365),H=Math.acos(Math.max(-1,Math.min(1,-Math.tan(lat*Math.PI/180)*Math.tan(dec))))*12/Math.PI;
 const noon=12+tz-lon/15,mk=h=>{const x=new Date(d);x.setHours(0,0,0,0);return new Date(x.getTime()+h*36e5)};
 return [mk(noon-H),mk(noon+H)]}
function wxKind(c){if(c==null)return 'clear';if(c<=1)return 'clear';if(c===2)return 'clouds';if(c===3)return 'overcast';if(c===45||c===48)return 'fog';
 if((c>=51&&c<=67)||(c>=80&&c<=82))return 'rain';if((c>=71&&c<=77)||c===85||c===86)return 'snow';if(c>=95)return 'storm';return 'clouds'}
function liveSky(){
 const orb=win.querySelector('.orb'),vars=['--sky1','--sky2','--orb','--cloud'];
 if(sid('view')!=='live'){vars.forEach(v=>win.style.removeProperty(v));win.removeAttribute('data-wx');win.removeAttribute('data-phase');orb.style.left=orb.style.top=orb.style.right='';win.querySelector('.stars').style.opacity='';document.body.classList.remove('night-live');win.title='';return}
 const now=new Date(),[rise,set]=sunTimes(now),t=+now,r=+rise,s=+set,H=36e5;
 const phase=t<r-.5*H||t>s+.6*H?'night':t<r+.75*H?'dawn':t>s-.9*H?'dusk':'day';
 const fresh=wxData&&Date.now()-wxData.t<3*H,wx=fresh?wxKind(wxData.code):'clear',grey=['overcast','rain','storm','snow','fog'].includes(wx);
 const P={night:grey?['#141a26','#2a3140','#d8d6cc','rgba(200,205,215,.18)']:['#0d1530','#26345e','#f4f1de','rgba(255,255,255,.12)'],
  dawn:grey?['#7d8494','#c9b7b0','#ffe2c0','rgba(235,230,230,.7)']:['#6f7fb6','#f6b99e','#ffd9a0','rgba(255,240,235,.75)'],
  day:grey?['#8e9aa6','#d3d9df','#fff6d0','rgba(240,242,245,.9)']:['#7fbce8','#e6f4ff','#fff3b0','rgba(255,255,255,.85)'],
  dusk:grey?['#5f5a70','#b99a8a','#ffcfa0','rgba(225,215,215,.6)']:['#5b4b8a','#f4a259','#ffc58a','rgba(255,230,210,.55)']}[phase];
 vars.forEach((v,i)=>win.style.setProperty(v,P[i]));
 let f;if(phase==='night'){const ns=t>s?s:s-864e5,nr=t>s?r+864e5:r;f=(t-ns)/(nr-ns)}else f=(t-r)/(s-r);f=Math.max(0,Math.min(1,f));
 orb.style.right='auto';orb.style.left=`calc(${(10+68*f).toFixed(1)}% - 4px)`;orb.style.top=`${(64-46*Math.sin(Math.PI*f)).toFixed(1)}%`;
 win.querySelector('.stars').style.opacity=phase==='night'&&!grey?'1':'0';
 {const was=win.dataset.phase;if(was&&was!==phase&&window.lampAuto){if(phase==='dusk'||(phase==='night'&&was!=='dusk'))lampAuto(true);else if(phase==='day')lampAuto(false)}}
 win.dataset.wx=wx;win.dataset.phase=phase;document.body.classList.toggle('night-live',phase==='night');
 win.title=fresh?wxLine():''}
function wxLine(){if(!wxData)return '';const k=wxKind(wxData.code),night=win.dataset.phase==='night';
 const ic={clear:night?'\u{1F319}':'☀️',clouds:'⛅',overcast:'☁️',fog:'\u{1F32B}️',rain:'\u{1F327}️',snow:'❄️',storm:'⛈️'}[k];
 return ic+' '+Math.round(wxData.temp)+wxData.unit+(wxLoc&&wxLoc.name?' · '+wxLoc.name:'')}
async function fetchWeather(force){
 /* the thermometer needs the temperature even when the window isn't showing the live sky */
 if(!wxLoc)return;if(!force&&wxData&&Date.now()-wxData.t<30*60e3&&wxData.day===today()){liveSky();drawTherm();return}
 try{const u=`https://api.open-meteo.com/v1/forecast?latitude=${wxLoc.lat}&longitude=${wxLoc.lon}&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=auto&forecast_days=1${FAHR?'&temperature_unit=fahrenheit':''}`;
  const j=await(await fetch(u)).json();if(!j.current)return;
  wxData={t:Date.now(),day:today(),code:j.current.weather_code,temp:j.current.temperature_2m,unit:FAHR?'°F':'°C',sunrise:j.daily&&j.daily.sunrise[0],sunset:j.daily&&j.daily.sunset[0]};
  try{localStorage.setItem(WXC,JSON.stringify(wxData))}catch(e){}liveSky();drawTherm()}catch(e){}}
function saveLoc(l){wxLoc=l;wxData=null;try{localStorage.setItem(WXK,JSON.stringify(l));localStorage.removeItem(WXC)}catch(e){}fetchWeather(true);if($('lov').classList.contains('on'))buildPanel()}
function useMyLocation(){
 if(!navigator.geolocation){toast(L('Location access was blocked.'));return}
 navigator.geolocation.getCurrentPosition(pos=>saveLoc({lat:+pos.coords.latitude.toFixed(2),lon:+pos.coords.longitude.toFixed(2),name:''}),()=>toast(L('Location access was blocked.')),{timeout:12000,maximumAge:36e5})}
async function setCity(q){
 q=(q||'').trim();if(!q)return;
 try{const j=await(await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&language=${lang==='ht'?'fr':lang}&name=${encodeURIComponent(q)}`)).json();
  const r=j.results&&j.results[0];if(!r){toast(L('Location not found.'));return}
  saveLoc({lat:+r.latitude.toFixed(3),lon:+r.longitude.toFixed(3),name:r.name+(r.country_code?', '+r.country_code:'')})}catch(e){toast(L('Location not found.'))}}
win.addEventListener('click',e=>{if(e.target.closest('#catw'))return;if(sid('view')==='live'&&wxData&&Date.now()-wxData.t<3*36e5)toast(wxLine())});
setInterval(liveSky,60e3);setInterval(()=>fetchWeather(),10*60e3);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){liveSky();fetchWeather()}});
liveSky();fetchWeather();


/* build the clock and the temperature in the style picked in Customize */
function buildWidgets(){
 const c=$('wclock'),t=$('therm');if(!c||!t)return;const cs=sid('clock'),ts=sid('therm');
 if(c.dataset.s!==cs){c.dataset.s=cs;
  if(cs==='digital')c.innerHTML='<span class="dg"></span>';
  else if(cs==='flip')c.innerHTML='<span class="fc"></span><span class="fc"></span>';
  else c.innerHTML=(cs==='roman'?'<span class="rn">'+['XII','III','VI','IX'].map((n,i)=>{const a=i*90*Math.PI/180;return `<span style="transform:translate(${(Math.sin(a)*15).toFixed(1)}px,${(-Math.cos(a)*15).toFixed(1)}px)">${n}</span>`}).join('')+'</span>':'')+'<i class="hh"></i><i class="mh"></i><i class="sh"></i>'}
 if(t.dataset.s!==ts){t.dataset.s=ts;
  t.innerHTML=ts==='dial'?'<i class="arc"></i><i class="nd"></i><b id="thermv"></b>':ts==='digital'?'<span class="ico"></span><b id="thermv"></b>':ts==='sign'?'<i class="cord"></i><div class="tboard"><span class="ico"></span><b id="thermv"></b></div>':'<i class="tube"></i><i class="bulb"></i><b id="thermv"></b>'}
 drawClock();drawTherm()}
/* ---------- the clock and thermometer by the window ---------- */
function drawClock(){
 const d=new Date(),c=$('wclock');if(!c)return;const h=d.getHours()%12,m=d.getMinutes(),s=d.getSeconds()+d.getMilliseconds()/1000;
 const hh=c.querySelector('.hh');if(hh){hh.style.transform=`rotate(${(h+m/60)*30}deg)`;c.querySelector('.mh').style.transform=`rotate(${(m+s/60)*6}deg)`;c.querySelector('.sh').style.animationDelay=`-${s.toFixed(2)}s`}
 /* digital and flip follow the phone's 12/24-hour habit */
 const parts=new Intl.DateTimeFormat(lang,{hour:'numeric',minute:'2-digit'}).formatToParts(d),H=(parts.find(p=>p.type==='hour')||{}).value||'',M=(parts.find(p=>p.type==='minute')||{}).value||'';
 const dg=c.querySelector('.dg');if(dg)dg.innerHTML=H+'<u>:</u>'+M;
 const fc=c.querySelectorAll('.fc');if(fc.length){fc[0].textContent=H.padStart(2,'0');fc[1].textContent=M}
 c.setAttribute('aria-label',d.toLocaleTimeString(lang,{hour:'numeric',minute:'2-digit'}))}
function drawTherm(){
 const v=$('thermv'),th=$('therm');if(!v)return;
 if(wxData&&Date.now()-wxData.t<3*36e5&&wxData.temp!=null){const c=wxData.unit==='°F'?(wxData.temp-32)*5/9:wxData.temp;
  const f=Math.max(0,Math.min(1,(c+30)/70));v.textContent=Math.round(wxData.temp)+(th.dataset.s==='digital'?wxData.unit:'°');th.style.setProperty('--lvl',Math.max(8,f*100).toFixed(0)+'%');th.style.setProperty('--ang',(-135+f*270).toFixed(0)+'deg');th.setAttribute('aria-label',wxLine())}
 else{v.textContent='–°';th.style.setProperty('--lvl','30%');th.style.setProperty('--ang','-135deg')}
 const ic=th.querySelector('.ico');if(ic)ic.textContent=wxData&&Date.now()-wxData.t<3*36e5?(wxLine().split(' ')[0]||'\u{1F321}\uFE0F'):'\u{1F321}\uFE0F'}
$('wclock').addEventListener('click',e=>{e.stopPropagation();const d=new Date();toast('\u{1F570}️ '+d.toLocaleTimeString(lang,{hour:'numeric',minute:'2-digit'})+' · '+d.toLocaleDateString(lang,{weekday:'long',day:'numeric',month:'long'}))});
const thermTap=e=>{e.stopPropagation();if(wxData&&Date.now()-wxData.t<3*36e5)toast(wxLine());else if(!wxLoc){toast(L('Allow your location to see the temperature outside.'));useMyLocation()}else fetchWeather(true)};
$('therm').addEventListener('click',thermTap);$('therm').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();thermTap(e)}});
setInterval(drawClock,15e3);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')drawClock()});buildWidgets();
/* ---------- the book's genre, shown in its window and on its cover ---------- */
function formGenres(){const s=new Set();formTags.forEach(t=>{const g=GNAME.get(t.toLowerCase());if(g)s.add(g)});(draft.genres||[]).forEach(g=>s.add(g));return [...s]}
function drawGenreLine(){
 const box=$('genreline');box.replaceChildren();const gs=formGenres();
 box.append(el('div','lbl',L('Genre')));
 if(gs.length)gs.forEach(g=>{const tagged=formTags.some(t=>GNAME.get(t.toLowerCase())===g),c=chip(L(g));
  if(!tagged){c.classList.add('sug');c.title=L('Tap to add it as a tag');c.onclick=()=>{formTags.push(cleanTag(L(g)));drawTagRow()}}else c.tabIndex=-1;box.append(c)});
 else{const f=el('button','fbtn','\u{1F50D} '+L('Find genre'));f.type='button';f.onclick=findGenre;box.append(f)}
 const ed=el('button','fbtn gedit','\u270E');ed.type='button';ed.title=L('Choose genres');ed.setAttribute('aria-label',L('Choose genres'));ed.onclick=openGenrePicker;box.append(ed);
 $('fG').textContent=gs.map(g=>L(g)).join(' · ')}
async function findGenre(){
 const t=$('title').value.trim(),a=$('author').value.trim(),isbn=$('isbn').value.replace(/[^0-9Xx]/g,'');if(!t&&!isbn)return;
 $('st').textContent=L('Looking for the genre…');let subj=[],cats=[];
 try{const j=await(await fetch('https://openlibrary.org/search.json?limit=1&fields=subject&q='+encodeURIComponent(isbn?'isbn:'+isbn:(t+' '+a).trim()))).json();subj=(j.docs&&j.docs[0]&&j.docs[0].subject)||[]}catch(e){}
 try{const g=await(await fetch('https://www.googleapis.com/books/v1/volumes?maxResults=1&q='+encodeURIComponent(isbn?'isbn:'+isbn:'intitle:'+t+(a?' inauthor:'+a:'')))).json();cats=(g.items&&g.items[0]&&g.items[0].volumeInfo.categories)||[]}catch(e){}
 const gs=guessGenres(subj,cats);draft.genres=gs;$('st').textContent=gs.length?'':L('No genre found.');drawTagRow()}
/* ---------- choose genres by hand ---------- */
function openGenrePicker(){drawGenrePicker();$('genov').classList.add('on')}
function drawGenrePicker(){
 const box=$('genlist');box.replaceChildren();const cur=new Set(formGenres());
 GENRES.map(([g])=>g).sort((a,b)=>L(a).localeCompare(L(b))).forEach(g=>{const c=chip(L(g)),on=cur.has(g);c.classList.toggle('on',on);c.setAttribute('aria-pressed',on);c.onclick=()=>toggleGenre(g);box.append(c)})}
function toggleGenre(g){
 if(formGenres().includes(g)){draft.genres=(draft.genres||[]).filter(x=>x!==g);formTags=formTags.filter(t=>GNAME.get(t.toLowerCase())!==g)}
 else draft.genres=[...(draft.genres||[]),g];
 drawTagRow();drawGenrePicker()}
$('gendone').onclick=()=>$('genov').classList.remove('on');$('genov').onclick=e=>{if(e.target===$('genov'))$('genov').classList.remove('on')};
/* ---------- year in review: a gift under the bookshelf from Dec 15 to the end of January ---------- */
function wrappedYear(){const d=window.__wrapNow?new Date(window.__wrapNow):new Date(),m=d.getMonth();
 const y=m===11&&d.getDate()>=15?d.getFullYear():m===0?d.getFullYear()-1:null;
 return y&&books.some(b=>st(b)==='read'&&(b.finished||'').startsWith(String(y)))?String(y):null}
function checkWrapped(){
 const y=wrappedYear(),g=$('gift'),bn=$('wrbanner');g.hidden=!y;
 if(!y){bn.hidden=true;return}
 g.setAttribute('aria-label',L('Unwrap your {y} in books',{y}));g.title=L('Unwrap your {y} in books',{y});
 let seen=false;try{seen=!!localStorage.getItem('bookshelf-wrapped-'+y)}catch(e){}
 $('wrmsg').textContent='\u{1F381} '+L('Your {y} in books is ready! Tap the gift under the bookshelf.',{y});bn.hidden=seen}
function markWrapped(){const y=wrappedYear();if(y)try{localStorage.setItem('bookshelf-wrapped-'+y,'1')}catch(e){}$('wrbanner').hidden=true}
function confetti(x,y){if(reduce)return;const C=['#e05a47','#f0c95a','#5aa06a','#4a7fc1','#b56ad1'];
 for(let i=0;i<32;i++){const s=document.createElement('i');s.className='confetti';s.style.left=x+'px';s.style.top=y+'px';s.style.background=C[i%5];document.body.append(s);
  const a=Math.random()*Math.PI*2,r=60+Math.random()*120;
  s.animate([{transform:'translate(-50%,-50%) rotate(0)',opacity:1},{transform:`translate(${Math.cos(a)*r}px,${Math.sin(a)*r-80}px) rotate(${Math.random()*720-360}deg)`,opacity:1,offset:.7},{transform:`translate(${Math.cos(a)*r*1.1}px,${Math.sin(a)*r+40}px) rotate(${Math.random()*720}deg)`,opacity:0}],
   {duration:1100+Math.random()*500,easing:'cubic-bezier(.2,.7,.3,1)'}).onfinish=()=>s.remove()}}
function openGift(){
 const y=wrappedYear();if(!y)return;markWrapped();const g=$('gift');
 if(view!=='room'){makeReview(y);return}
 const r=g.getBoundingClientRect();g.classList.add('open');try{sfx('pop')}catch(e){}confetti(r.left+r.width/2,r.top+r.height/2);
 setTimeout(()=>{makeReview(y);setTimeout(()=>g.classList.remove('open'),900)},reduce?0:650)}
$('gift').onclick=openGift;$('wropen').onclick=()=>{const g=$('gift');if(g.getBoundingClientRect().bottom>innerHeight)g.scrollIntoView({behavior:reduce?'auto':'smooth',block:'center'});setTimeout(openGift,reduce?0:450)};
$('wrlater').onclick=markWrapped;
/* ---------- all reads, including re-reads, for stats ---------- */
function allReads(){const out=[];books.forEach(b=>{if(st(b)==='read')out.push(b);(b.reads||[]).forEach(r=>{if(r.finished)out.push(Object.assign({},b,{started:r.started||'',finished:r.finished,stars:r.stars||null,_re:true}))})});return out}
/* ---------- form extras: re-reads, lending, reading session ---------- */
function drawFormExtras(b){
 const pr=$('pastreads');pr.replaceChildren();const reads=(b&&b.reads)||[];
 if(reads.length){pr.append(el('div','',L('Read {n} times',{n:reads.length+(b&&st(b)==='read'?1:0)})+' \u00b7 '+L('Past reads')+':'));const ul=el('ul');
  reads.forEach(r=>ul.append(el('li','',[r.started?fmtDate(r.started):'',r.finished?fmtDate(r.finished):''].filter(Boolean).join(' \u2192 ')+(r.stars?'  \u2605'+fmtStars(r.stars):''))));pr.append(ul)}
 $('rereadbtn').textContent='\u21BB '+L('Read again');
 $('returnedbtn').hidden=!(b&&b.lentTo);$('returnedbtn').textContent='\u21A9 '+L('Mark as returned');
 $('startread').textContent='\u25B6 '+L('Start reading')}
$('rereadbtn').onclick=()=>{if(!cur)return;
 cur.reads=[...(cur.reads||[]),{started:$('started').value||cur.started||'',finished:$('finished').value||cur.finished||'',stars:fStars||cur.stars||null}];
 Object.assign(cur,{status:'reading',started:today(),finished:'',stars:null,page:0});store();render();const id=cur.id;closeModal(id);toast(L('Started a new read.'))};
$('returnedbtn').onclick=()=>{if(!cur)return;cur.lentTo='';cur.lentOn='';$('lentTo').value='';$('lentOn').value='';$('returnedbtn').hidden=true;store();render();toast(L('Returned.'))};
$('lentTo').addEventListener('input',()=>{if($('lentTo').value.trim()&&!$('lentOn').value)$('lentOn').value=today()});
$('startread').onclick=()=>{if(cur){const id=cur.id;closeModal(id);startSession(id)}};
/* ---------- series: keep them together, and say what's next ---------- */
const sameSeries=(a,b)=>a.series&&b.series&&a.series.trim().toLowerCase()===b.series.trim().toLowerCase();
function placeInSeries(b){
 if(!b.series||!b.seriesNo)return;const z=st(b);const sibs=books.filter(x=>x!==b&&st(x)===z&&sameSeries(x,b)&&x.seriesNo);if(!sibs.length)return;
 books.splice(books.indexOf(b),1);
 const before=sibs.filter(x=>x.seriesNo<b.seriesNo).sort((p,q)=>q.seriesNo-p.seriesNo)[0],after=sibs.filter(x=>x.seriesNo>b.seriesNo).sort((p,q)=>p.seriesNo-q.seriesNo)[0];
 if(before)books.splice(books.indexOf(before)+1,0,b);else if(after)books.splice(books.indexOf(after),0,b);else books.push(b)}
function seriesMsg(b){
 if(!b.series||!b.seriesNo)return '';let n=Math.floor(b.seriesNo)+1;
 while(books.some(x=>sameSeries(x,b)&&x.seriesNo===n&&st(x)==='read'))n++;
 if(b.seriesOf&&n>b.seriesOf)return b.seriesNo>=b.seriesOf||books.filter(x=>sameSeries(x,b)&&st(x)==='read').length>=b.seriesOf?L('You finished the series! 🎉'):'';
 return L('Next in {s}: book {n}.',{s:b.series,n})}
function seriesCard(){
 const groups={};books.forEach(b=>{if(b.series&&b.seriesNo){const k=b.series.trim().toLowerCase();(groups[k]=groups[k]||[]).push(b)}});
 const items=[];
 Object.values(groups).forEach(list=>{const read=list.filter(b=>st(b)==='read');if(!read.length)return;
  const of=Math.max(0,...list.map(b=>b.seriesOf||0)),maxRead=Math.max(...read.map(b=>b.seriesNo));let n=Math.floor(maxRead)+1;
  while(list.some(b=>b.seriesNo===n&&st(b)==='read'))n++;if(of&&n>of)return;
  const nb=list.find(b=>b.seriesNo===n);if(nb&&st(nb)==='reading')return;items.push({s:list[0].series,n,nb})});
 if(!items.length)return null;
 const c=card(L('Up next in your series'),true),ul=el('ul','nextlist');
 items.forEach(it=>{const li=el('li','','\u{1F4DA} '+L('{s}: book {n} is next',{s:it.s,n:it.n}));if(it.nb&&st(it.nb)==='want')li.append(el('small','','\u00b7 '+L('on your want-to-read shelf')));
  if(it.nb){li.style.cursor='pointer';li.onclick=()=>openModal(it.nb)}ul.append(li)});c.append(ul);return c}
function lentCard(){
 const lent=books.filter(b=>b.lentTo);if(!lent.length)return null;const c=card('\u{1F91D} '+L('Lent out'),true),ul=el('ul','nextlist');
 lent.forEach(b=>{const d=b.lentOn?Math.max(0,days(b.lentOn,today())):0,li=el('li','',b.title);li.append(el('small','',L('{name} \u00b7 {n} days',{name:b.lentTo,n:d})));
  const r=el('button','fbtn','\u21A9 '+L('Mark as returned'));r.type='button';r.onclick=()=>{b.lentTo='';b.lentOn='';store();render();toast(L('Returned.'))};li.append(r);ul.append(li)});
 c.append(ul);return c}
/* ---------- pick my next book ---------- */
let picking=false;
$('pickbtn').onclick=()=>{
 if(picking)return;const els=[...document.querySelectorAll('#want .bk')];if(!els.length){toast(L('Add some books to your want-to-read shelf first.'));return}
 const chosen=els[Math.floor(Math.random()*els.length)],b=books.find(x=>x.id===chosen.dataset.id);
 if(reduce){openModal(b,chosen);return}
 picking=true;els.forEach((e,i)=>{e.style.animationDelay=(i%4)*.05+'s';e.classList.add('wobble')});try{sfx('pop')}catch(e){}
 setTimeout(()=>{els.forEach(e=>{e.classList.remove('wobble');e.style.animationDelay=''});
  const an=chosen.animate([{transform:'none'},{transform:'translateY(-34px) scale(1.12)',filter:'drop-shadow(0 12px 8px rgba(0,0,0,.45))'}],{duration:520,easing:'cubic-bezier(.3,1.4,.5,1)',fill:'forwards'});
  toast('\u{1F3B2} '+L('How about this one?'));
  an.onfinish=()=>{setTimeout(()=>{an.cancel();picking=false;openModal(b,chosen)},350)}},1300)};
/* ---------- reading timer & streak ---------- */
let sessions=[],active=null,pillT=0;
try{sessions=JSON.parse(localStorage.getItem('bookshelf-sessions')||'[]')||[];active=JSON.parse(localStorage.getItem('bookshelf-session-active')||'null')}catch(e){}
const saveSessions=()=>{dataVer++;if(sessions.length)offerRemind();try{localStorage.setItem('bookshelf-sessions',JSON.stringify(sessions.slice(-2000)));localStorage.setItem('bookshelf-session-active',JSON.stringify(active))}catch(e){}markChange()};
const dayKey=t=>{const d=new Date(t);return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
function startSession(id){active={bookId:id,start:Date.now()};saveSessions();drawPill();try{sfx('flip')}catch(e){}}
function drawPill(){
 clearInterval(pillT);const p=$('rpill');if(!active){p.hidden=true;return}
 const b=books.find(x=>x.id===active.bookId);$('rptitle').textContent='\u{1F4D6} '+(b?b.title:'');p.hidden=false;
 const tick=()=>{const s=Math.floor((Date.now()-active.start)/1000),h=Math.floor(s/3600),m=Math.floor(s/60)%60,x=s%60;$('rptime').textContent=(h?h+':'+String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0')};tick();pillT=setInterval(tick,1000)}
$('rpstop').onclick=async()=>{
 if(!active)return;const a=active;let min=Math.max(1,Math.round((Date.now()-a.start)/6e4));active=null;drawPill();
 /* the timer can be off (forgot to stop it, or started late): let the reader fix the minutes */
 $('askin').hidden=false;$('askin').value=min;const fix=await ask(L('How many minutes did you read? Fix it if the timer is off.'),L('Save'),L('Skip'));$('askin').hidden=true;
 if(fix){const v=Math.round(+$('askin').value);if(v>0&&v<1440)min=v}
 if(fix||Date.now()-a.start>=30e3)sessions.push({bookId:a.bookId,start:a.start,min});saveSessions();
 const b=books.find(x=>x.id===a.bookId);
 if(b){$('askin').hidden=false;$('askin').value=b.page||'';const ok=await ask(L('What page are you on now?'),L('Save'),L('Skip'));$('askin').hidden=true;
  const pg=Math.round(+$('askin').value);if(ok&&pg>0){b.page=b.pages?Math.min(pg,b.pages):pg;store();render();if(autoFinish(b))return}}
 toast(L('Session saved: {m} min.',{m:min}));if(view==='goals')renderGoals()};
function streakInfo(){
 const daysSet=new Set(sessions.map(x=>dayKey(x.start)));allReads().forEach(b=>{if(b.finished)daysSet.add(b.finished)});
 let n=0;const d=new Date();let k=dayKey(d);const readToday=daysSet.has(k);if(!readToday){d.setDate(d.getDate()-1);k=dayKey(d)}
 while(daysSet.has(k)){n++;d.setDate(d.getDate()-1);k=dayKey(d)}
 const now=Date.now(),mins=t0=>sessions.filter(x=>x.start>=t0).reduce((a,x)=>a+x.min,0);
 const t=new Date();t.setHours(0,0,0,0);return {n,readToday,today:mins(+t),week:mins(now-7*864e5)}}
function streakCard(){
 const c=card(L('Reading streak'),true),inf=streakInfo(),row=el('div','streak');
 if(!sessions.length&&!inf.n){c.append(el('p','stempty',L("No reading sessions yet. Start one from a book you're reading.")))}
 else{row.append(el('div','fl',L('🔥 {n}-day streak',{n:inf.n})));const sub=el('div','sub');sub.append(el('span','',L('Today: {m} min',{m:inf.today})),el('span','',L('This week: {m} min',{m:inf.week})));
  if(!inf.readToday&&inf.n)sub.append(el('span','',L('Read today to keep your streak going.')));row.append(sub);c.append(row);
  const wk=el('div','week'),vals=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);const k=+d,e=k+864e5;vals.push({d,m:sessions.filter(x=>x.start>=k&&x.start<e).reduce((a,x)=>a+x.min,0),today:i===0})}
  const mx=Math.max(1,...vals.map(v=>v.m));vals.forEach(v=>{const col=el('div',v.today?'today':'');const bar=el('i');bar.style.height=(v.m/mx*44)+'px';col.title=L('{m} min',{m:v.m});
   col.append(bar,el('span','',lang==='ht'?['Dim','Len','Mad','Mèk','Jed','Van','Sam'][v.d.getDay()]:v.d.toLocaleDateString(lang,{weekday:'narrow'})));wk.append(col)});c.append(wk)}
 const reading=books.filter(b=>st(b)==='reading');
 if(reading.length&&!active){const r=el('div','rowbtns');r.style.marginTop='10px';let sel=null;
  if(reading.length>1){sel=el('select');sel.className='fbtn';sel.setAttribute('aria-label',L('Book'));reading.forEach(b=>{const o=el('option','',b.title);o.value=b.id;sel.append(o)});r.append(sel)}
  const go2=el('button','fbtn pri2','\u25B6 '+L('Start reading'));go2.type='button';go2.onclick=()=>{startSession(sel?sel.value:reading[0].id);renderGoals()};r.append(go2);c.append(r)}
 return c}
drawPill();
/* ---------- seasons ---------- */
function season(){const d=new Date(),m=d.getMonth(),day=d.getDate(),south=wxLoc&&wxLoc.lat<0;
 let s=m===11||m<=1?'winter':m<=4?'spring':m<=7||(m===8&&day<22)?'summer':'autumn';
 if(south)s={winter:'summer',summer:'winter',spring:'autumn',autumn:'spring'}[s];return s}
const SEAS={
 autumn:'<svg viewBox="0 0 54 60"><ellipse cx="27" cy="44" rx="22" ry="15" fill="#e0782e"/><ellipse cx="17" cy="44" rx="9" ry="14" fill="#ec8a3c"/><ellipse cx="37" cy="44" rx="9" ry="14" fill="#ec8a3c"/><ellipse cx="27" cy="44" rx="8" ry="15" fill="#f29a48"/><path d="M27 30c0-6 2-9 6-11" stroke="#5b7a33" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M31 22c4-4 10-3 11 1-4 2-8 2-11-1z" fill="#6f9a3e"/></svg>',
 winterDec:'<svg viewBox="0 0 54 60"><rect x="23" y="50" width="8" height="8" fill="#7a4f2b"/><path d="M27 4l14 20h-7l11 14h-8l10 13H7l10-13H9l11-14h-7z" fill="#2f6b45"/><circle cx="20" cy="30" r="2.3" fill="#e05a47"/><circle cx="33" cy="40" r="2.3" fill="#f0c95a"/><circle cx="25" cy="44" r="2.3" fill="#4a7fc1"/><circle cx="31" cy="22" r="2.3" fill="#f0c95a"/><path d="M27 0l1.6 3.4 3.7.4-2.8 2.4.9 3.6L27 8l-3.4 1.8.9-3.6-2.8-2.4 3.7-.4z" fill="#f7d65b"/></svg>',
 winter:'<svg viewBox="0 0 54 60"><path d="M16 12c2-4-2-6 0-10M24 12c2-4-2-6 0-10" stroke="#cfd6de" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/><path d="M8 20h32v24c0 7-5 12-12 12h-8c-7 0-12-5-12-12z" fill="#b84a3b"/><path d="M40 26h4c5 0 5 12 0 12h-4" stroke="#b84a3b" stroke-width="4" fill="none"/><ellipse cx="24" cy="21" rx="15" ry="3" fill="#6b3f2a"/><circle cx="18" cy="21" r="2.5" fill="#fff"/><circle cx="24" cy="20" r="2.5" fill="#fff"/><circle cx="29" cy="21" r="2" fill="#fff"/></svg>',
 spring:'<svg viewBox="0 0 54 60"><path d="M17 36V16M27 36V10M37 36V18" stroke="#4f8a55" stroke-width="3"/><path d="M11 12c0-6 3-9 6-9s6 3 6 9c0 3-3 5-6 5s-6-2-6-5z" fill="#e86a92"/><path d="M21 7c0-5 3-7 6-7s6 2 6 7c0 3-3 5-6 5s-6-2-6-5z" fill="#f2c94c"/><path d="M31 14c0-6 3-9 6-9s6 3 6 9c0 3-3 5-6 5s-6-2-6-5z" fill="#b56ad1"/><path d="M12 36h30l-4 22H16z" fill="#6f9fd8"/><rect x="10" y="33" width="34" height="6" rx="2" fill="#86b2e6"/></svg>',
 summer:'<svg viewBox="0 0 54 60"><path d="M27 58V26" stroke="#4f8a55" stroke-width="3"/><path d="M27 42c-8-2-12-8-12-8 6-1 11 2 12 8z" fill="#5f9a55"/><g transform="translate(27 18)"><g fill="#f2c230"><ellipse rx="4" ry="10" transform="rotate(0) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(30) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(60) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(90) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(120) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(150) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(180) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(210) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(240) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(270) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(300) translate(0 -9)"/><ellipse rx="4" ry="10" transform="rotate(330) translate(0 -9)"/></g><circle r="7" fill="#7a4f23"/></g><path d="M16 46h22l-3 12H19z" fill="#d9d2c4"/></svg>'}
function applySeason(){
 const on=sid('season')!=='hide',s=season(),dec=new Date().getMonth()===11;
 document.body.classList.toggle('season-winter',on&&s==='winter');
 $('seasonal').innerHTML=on?(s==='winter'&&dec?SEAS.winterDec:SEAS[s]):'';
 const li=$('lights');li.hidden=!(on&&s==='winter');
 if(!li.hidden&&!li.firstChild){const C=['#e05a47','#f0c95a','#5aa06a','#4a7fc1','#b56ad1'];let b='';for(let i=0;i<14;i++){const x=4+i*92/13,y=10+Math.sin(i*.9)*3;b+=`<i class="bulb" style="left:${x}%;top:${y}px;background:${C[i%5]};color:${C[i%5]};animation-delay:${(i%5)*.35}s"></i>`}
  li.innerHTML=`<svg viewBox="0 0 100 22" preserveAspectRatio="none"><path d="M0 6 Q 25 20 50 9 T 100 8" stroke="#3b2a1a" stroke-width="1.5" fill="none" vector-effect="non-scaling-stroke"/></svg>`+b}
 /* falling leaves in autumn, snow in winter, petals in spring: on every wall */
 const kind=!on?'':s==='autumn'?'leaf':s==='winter'?'snow':s==='spring'?'petal':'';
 document.querySelectorAll('.leaves').forEach(lv=>{
  if(lv.dataset.kind===kind&&lv.children.length)return;lv.replaceChildren();lv.dataset.kind=kind;if(!kind)return;
  const C=kind==='leaf'?['#d9652b','#e8a33a','#b8452c','#c9822f','#9c5a2a']:kind==='petal'?['#f4b6c8','#f7c9d6','#eaa0b8','#fff0f4','#f2a7c0']:['#fff'],n=kind==='snow'?16:9;
  for(let i=0;i<n;i++){const f=el('span','leaf'+(kind==='leaf'?'':' '+kind)),x=el('i');f.style.left=(3+i*(94/n)+Math.random()*5)+'%';f.style.animationDuration=((kind==='snow'?10:14)+Math.random()*10)+'s';f.style.animationDelay=(-Math.random()*20)+'s';x.style.background=C[i%C.length];x.style.animationDuration=(1.6+Math.random()*1.6)+'s';f.append(x);lv.append(f)}})}
/* ---------- sounds (made on the fly, no files) ---------- */
let AC=null;
function sfx(kind){
 if(sid('sound')!=='on')return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;if(!AC)AC=new C();if(AC.state==='suspended')AC.resume();
 const a=AC,t=a.currentTime,out=a.createGain();out.connect(a.destination);
 const noise=len=>{const b=a.createBuffer(1,Math.floor(a.sampleRate*len),a.sampleRate),d=b.getChannelData(0);let last=0;for(let i=0;i<d.length;i++){last=(last+.02*(Math.random()*2-1))/1.02;d[i]=kind==='purr'?last*3.5:Math.random()*2-1}const s=a.createBufferSource();s.buffer=b;return s};
 if(kind==='flip'){const n=noise(.28),f=a.createBiquadFilter();f.type='bandpass';f.frequency.setValueAtTime(1800,t);f.frequency.exponentialRampToValueAtTime(4200,t+.2);f.Q.value=.8;
  out.gain.setValueAtTime(0,t);out.gain.linearRampToValueAtTime(.18,t+.03);out.gain.exponentialRampToValueAtTime(.001,t+.26);n.connect(f).connect(out);n.start(t);n.stop(t+.3)}
 else if(kind==='purr'){const n=noise(1.1),f=a.createBiquadFilter(),am=a.createGain(),lfo=a.createOscillator(),lg=a.createGain();f.type='lowpass';f.frequency.value=320;
  lfo.frequency.value=24;lg.gain.value=.5;am.gain.value=.5;lfo.connect(lg).connect(am.gain);out.gain.setValueAtTime(0,t);out.gain.linearRampToValueAtTime(.55,t+.15);out.gain.linearRampToValueAtTime(0,t+1.05);
  n.connect(f).connect(am).connect(out);n.start(t);lfo.start(t);n.stop(t+1.1);lfo.stop(t+1.1)}
 else{const o=a.createOscillator();const [f0,f1,d,tp]={chirp:[2000,3200,.09,'sine'],boof:[180,90,.16,'triangle'],pop:[700,220,.1,'sine'],click:[1500,900,.025,'square']}[kind]||[700,220,.1,'sine'];o.type=tp;
  o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+d);out.gain.setValueAtTime(0,t);out.gain.linearRampToValueAtTime(.16,t+.01);out.gain.exponentialRampToValueAtTime(.001,t+d+.02);
  o.connect(out);o.start(t);o.stop(t+d+.05);if(kind==='chirp'){const o2=a.createOscillator();o2.type='sine';o2.frequency.setValueAtTime(2200,t+.13);o2.frequency.exponentialRampToValueAtTime(3400,t+.22);const g2=a.createGain();g2.gain.setValueAtTime(0,t+.13);g2.gain.linearRampToValueAtTime(.14,t+.14);g2.gain.exponentialRampToValueAtTime(.001,t+.24);o2.connect(g2).connect(a.destination);o2.start(t+.13);o2.stop(t+.26)}}}
/* ---------- recognise a series you already have ---------- */
const seriesNames=()=>{const m=new Map();books.forEach(b=>{const k=serKey(b);if(k&&!m.has(k))m.set(k,b.series.trim())});return m};
const normSeries=v=>{v=(v||'').trim();return seriesNames().get(v.toLowerCase())||v};
function fillSeriesList(){const dl=$('serieslist');if(!dl)return;dl.replaceChildren();[...seriesNames().values()].sort((a,b)=>a.localeCompare(b)).forEach(v=>{const o=document.createElement('option');o.value=v;dl.append(o)})}
const words=t=>(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean);
function seriesInfo(name,skipId){const k=(name||'').trim().toLowerCase(),list=books.filter(b=>serKey(b)===k&&b.id!==skipId);if(!list.length)return null;
 const nums=list.map(b=>b.seriesNo||0);let next=Math.floor(Math.max(0,...nums))+1;return{name:list[0].series.trim(),next,of:Math.max(0,...list.map(b=>b.seriesOf||0)),list}}
function guessSeries(title,author){
 const tw=' '+words(title).join(' ')+' ',au=(author||'').trim().toLowerCase(),t2=words(title).slice(0,2).join(' '),groups={};if(tw.trim()==='')return null;
 books.forEach(b=>{if(cur&&b.id===cur.id)return;const k=serKey(b);if(k)(groups[k]=groups[k]||[]).push(b)});
 let best=null;
 for(const k in groups){const list=groups[k],nw=words(list[0].series).join(' ');let score=0;
  if(nw&&tw.includes(' '+nw+' '))score+=2;/* the title says the series name: "Harry Potter and the…" */
  if(t2.includes(' ')&&list.some(b=>words(b.title).slice(0,2).join(' ')===t2))score+=1.5;/* starts like the others: "A Court of…" */
  if(au&&list.some(b=>(b.author||'').trim().toLowerCase()===au))score+=1;
  if(score>=2&&(!best||score>best.score))best={score,k}}
 return best?seriesInfo(best.k,cur&&cur.id):null}
function autoSeries(){
 if($('series').value.trim())return;const g=guessSeries($('title').value,$('author').value);if(!g)return;
 $('series').value=g.name;if(!$('seriesNo').value)$('seriesNo').value=g.next;if(g.of&&!$('seriesOf').value)$('seriesOf').value=g.of;
 $('snote').textContent=L('Part of your series “{s}” — filled in book {n}. Change it if that’s wrong.',{s:g.name,n:$('seriesNo').value});pv()}
$('title').addEventListener('change',autoSeries);$('author').addEventListener('change',autoSeries);
/* picking or typing a series you already have: same spelling, next number */
$('series').addEventListener('change',()=>{const g=seriesInfo($('series').value,cur&&cur.id);if(!g)return;$('series').value=g.name;
 if(!$('seriesNo').value){$('seriesNo').value=g.next;$('snote').textContent=L('Book {n} of your series “{s}”.',{s:g.name,n:g.next})}
 if(g.of&&!$('seriesOf').value)$('seriesOf').value=g.of;pv()});

/* ---------- add a whole series at once ---------- */
let serFound=[],serStatus='read';
const SER_SKIP=/\b(box(ed)? ?set|boxset|collection|complete|omnibus|trilogy|books? \d|volumes? \d|\d+ ?books|illustrated|companion|guide|colou?ring|cookbook|journal|calendar|quiz|trivia|encyclop|unofficial|summary|study|notes|poster|sticker|activity|annotated|lexicon|screenplay|making of|art of|script|parts? one|play)\b/i;
function openSeriesAdd(status){
 serStatus=status==='want'?'want':status==='dnf'?'dnf':'read';serFound=[];fillSeriesList();
 $('sername').value=$('series').value||'';$('serauthor').value=$('author').value||'';$('sertitles').value='';$('serres').replaceChildren();$('sermsg').textContent='';
 document.querySelectorAll('#serseg button').forEach(x=>{const on=x.dataset.s===serStatus;x.classList.toggle('on',on);x.setAttribute('aria-checked',on)});
 serCount();$('serov').classList.add('on');setTimeout(()=>$('sername').focus(),50)}
document.querySelectorAll('#serseg button').forEach(x=>x.onclick=()=>{serStatus=x.dataset.s;document.querySelectorAll('#serseg button').forEach(y=>{const on=y===x;y.classList.toggle('on',on);y.setAttribute('aria-checked',on)})});
function serPicked(){const typed=$('sertitles').value.split('\n').map(t=>t.trim()).filter(Boolean);
 if(typed.length)return typed.map(t=>({title:t}));return serFound.filter(d=>d.on)}
function serCount(){const n=serPicked().length;$('serok').disabled=!n;$('serok').textContent=n?L('Add {n} books',{n}):L('Add the books');
 let i=0;serFound.forEach(d=>{if(d.el)d.el.querySelector('.no').textContent=d.on?'#'+(++i):''})}
async function serSearch(){
 const name=$('sername').value.trim(),au=$('serauthor').value.trim();if(!name){$('sername').focus();return}
 $('sermsg').textContent=L('Searching…');$('serres').replaceChildren();serFound=[];
 try{const r=await fetch('https://openlibrary.org/search.json?limit=60&fields=key,title,author_name,cover_i,first_publish_year,number_of_pages_median,subject,edition_count&q='+encodeURIComponent(name)+(au?'&author='+encodeURIComponent(au):''));
  const docs=(await r.json()).docs||[],seen=new Set(),nw=words(name).join(' ');
  docs.forEach(d=>{if(!d.title)return;const k=words(d.title).join(' ');if(seen.has(k))return;seen.add(k);serFound.push({...d,named:(' '+k+' ').includes(' '+nw+' ')})});
  const byName=serFound.filter(d=>d.named&&!SER_SKIP.test(d.title)).length>=2;
  serFound.forEach(d=>{d.on=!SER_SKIP.test(d.title)&&(byName?d.named:(d.edition_count||0)>=8)});
  /* likely series books first, in the order they came out */
  serFound.sort((a,b)=>(b.on-a.on)||((a.first_publish_year||9999)-(b.first_publish_year||9999)));
  if(!serFound.length){$('sermsg').textContent=L('Nothing found. You can type the titles below instead.');return}
  $('sermsg').textContent=L('Tick the books in the series. They are numbered in the order they came out.');
  serFound.forEach(d=>{const row=el('label','serrow'),cb=el('input');cb.type='checkbox';cb.checked=d.on;cb.onchange=()=>{d.on=cb.checked;serCount()};
   const im=el('img');im.alt='';if(d.cover_i)im.src=`https://covers.openlibrary.org/b/id/${d.cover_i}-S.jpg`;
   const tx=el('span','st',d.title);tx.append(el('small','',[(d.author_name||[])[0],d.first_publish_year].filter(Boolean).join(' · ')));
   row.append(cb,el('b','no',''),im,tx);d.el=row;$('serres').append(row)});
  serCount()}catch(e){$('sermsg').textContent=L('Search unavailable (offline?). You can type the titles below instead.')}}
$('seradd').onclick=()=>openSeriesAdd(fStatus);$('sergo').onclick=serSearch;$('sername').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();serSearch()}});
$('sertitles').addEventListener('input',serCount);
$('serx').onclick=()=>$('serov').classList.remove('on');
$('serov').onclick=e=>{if(e.target===$('serov'))$('serov').classList.remove('on')};
$('serok').onclick=async()=>{
 const picked=serPicked();if(!picked.length)return;
 const name=normSeries($('sername').value)||((picked[0].title||'').split(/[:(]/)[0].trim()),au=$('serauthor').value.trim(),known=seriesInfo(name);
 /* adding more books to a series you already started: carry on from the last number, unless the list includes books you already have */
 const tk=t=>words(t).join(' '),overlap=picked.some(d=>books.some(b=>tk(b.title)===tk(d.title))),start=known&&!overlap?known.next-1:0,of=Math.max(start+picked.length,known?known.of:0);
 const h=known?(SERH[serKey({series:name})]||known.list[0].h):150+Math.floor(Math.random()*62);
 let added=0,updated=0;const todo=[];
 picked.forEach((d,i)=>{const no=start+i+1,key=words(d.title).join(' ');
  const have=books.find(b=>words(b.title).join(' ')===key);
  if(have){if(!have.series){Object.assign(have,{series:name,seriesNo:no,seriesOf:of});updated++}return}
  const b={id:'b'+Date.now().toString(36)+i,w:30+Math.floor(Math.random()*24),h,createdAt:Date.now()+i,isbn:'',title:d.title.slice(0,100),author:au||(d.author_name||[])[0]||'',status:serStatus,stars:null,tags:[],
   series:name,seriesNo:no,seriesOf:of,lentTo:'',lentOn:'',genres:guessGenres(d.subject||[],[]),page:0,pages:d.number_of_pages_median||0,started:'',finished:'',note:'',blurb:'',
   color:'#'+Math.floor(Math.random()*0x777777+0x111111).toString(16).padStart(6,'0'),cover:'',back:'',spine:''};
  books.push(b);added++;if(d.cover_i)todo.push([b,d.cover_i])});
 books.forEach(b=>{if(sameSeries(b,{series:name})&&!b.seriesOf)b.seriesOf=of});
 store();render();$('serov').classList.remove('on');closeModal();
 toast(L('Added {n} books from “{s}”.',{n:added,s:name})+(updated?' '+L('{n} you already had are now part of the series.',{n:updated}):''));
 /* covers come in one by one in the background */
 for(const [b,ci] of todo){try{const c=await fromUrl(`https://covers.openlibrary.org/b/id/${ci}-L.jpg?default=false`);if(c&&books.includes(b)&&!b.cover){b.cover=c;const col=await avgColor(c);if(col)b.color=col;store();render()}}catch(e){}}};
/* ---------- photos of a cover, back or spine: find the book in the picture and crop to it ---------- */
function detectBook(c,kind){
 const W0=c.width,H0=c.height,k=Math.min(1,320/Math.max(W0,H0)),w=Math.max(12,Math.round(W0*k)),h=Math.max(12,Math.round(H0*k));
 const t=document.createElement('canvas');t.width=w;t.height=h;const g=t.getContext('2d',{willReadFrequently:true});g.drawImage(c,0,0,w,h);
 const d=g.getImageData(0,0,w,h).data,gx=new Float32Array(w*h),gy=new Float32Array(w*h);
 const px=(x,y,ch)=>d[(y*w+x)*4+ch];
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let a=0,b=0;for(let ch=0;ch<3;ch++){a+=Math.abs(px(x+1,y,ch)-px(x-1,y,ch));b+=Math.abs(px(x,y+1,ch)-px(x,y-1,ch))}gx[y*w+x]=a;gy[y*w+x]=b}
 const pct=(arr,p)=>{const v=[];for(let i=0;i<arr.length;i+=3)v.push(arr[i]);v.sort((a,b)=>a-b);return v[Math.floor(v.length*p)]||0};
 const tx=Math.max(36,pct(gx,.86)),ty=Math.max(36,pct(gy,.86));
 /* how many pixels along each column/row sit on a strong edge: a book's outline is a long straight edge, text and patterns are short */
 const colScore=(y0,y1)=>{const r=new Float32Array(w),n=Math.max(1,y1-y0);for(let x=1;x<w-1;x++){let c2=0;for(let y=y0;y<y1;y++)if(gx[y*w+x]>tx)c2++;r[x]=c2/n}return smooth(r)};
 const rowScore=(x0,x1)=>{const r=new Float32Array(h),n=Math.max(1,x1-x0);for(let y=1;y<h-1;y++){let c2=0;for(let x=x0;x<x1;x++)if(gy[y*w+x]>ty)c2++;r[y]=c2/n}return smooth(r)};
 function smooth(r){const o=new Float32Array(r.length);for(let i=0;i<r.length;i++)o[i]=Math.max(r[i],((r[i-1]||0)+r[i]+(r[i+1]||0))/2);return o}
 const maxIn=(r,a,b)=>{let bi=-1,bv=0;for(let i=Math.max(1,a);i<=Math.min(r.length-2,b);i++)if(r[i]>bv){bv=r[i];bi=i}return[bi,bv]};
 /* nearest strong edge going outwards from the middle (for a spine between other books) */
 const nearest=(r,from,to,min)=>{const st=from<to?1:-1;let best=[-1,0];for(let i=from;st>0?i<=to:i>=to;i+=st){if(r[i]>best[1])best=[i,r[i]];if(r[i]>=min&&r[i]>=.6*maxIn(r,Math.min(from,to),Math.max(from,to))[1]){return[i,r[i]]}}return best};
 const MIN=.32;let L,R,T,B;
 const cs=colScore(Math.round(h*.12),Math.round(h*.88));
 if(kind==='spine'){
  const mid=Math.round(w/2),l=nearest(cs,mid-Math.round(w*.015),1,.5),r=nearest(cs,mid+Math.round(w*.015),w-2,.5);
  L=l[1]>=MIN*.8?l[0]:Math.round(w*.02);R=r[1]>=MIN*.8?r[0]:Math.round(w*.98)}
 else{const l=maxIn(cs,1,Math.round(w*.45)),r=maxIn(cs,Math.round(w*.55),w-2);L=l[1]>=MIN?l[0]:Math.round(w*.02);R=r[1]>=MIN?r[0]:Math.round(w*.98)}
 const rs=rowScore(L+1,Math.max(L+2,R-1));
 {const tp=maxIn(rs,1,Math.round(h*.45)),bt=maxIn(rs,Math.round(h*.55),h-2);T=tp[1]>=MIN?tp[0]:Math.round(h*.02);B=bt[1]>=MIN?bt[0]:Math.round(h*.98)}
 if(kind!=='spine'){/* look again at the sides, now only between the top and bottom we found */
  const cs2=colScore(T+1,Math.max(T+2,B-1)),l=maxIn(cs2,1,Math.round(w*.45)),r=maxIn(cs2,Math.round(w*.55),w-2);if(l[1]>=MIN)L=l[0];if(r[1]>=MIN)R=r[0]}
 if(R-L<w*.06||B-T<h*.1)return{x:0,y:0,w:W0,h:H0,found:false};
 /* a cover is upright and fills a good part of the photo: a wide or small box is probably a picture on the cover, so keep the whole photo */
 if(kind!=='spine'&&((R-L)>(B-T)*1.05||(R-L)*(B-T)<w*h*.2))return{x:Math.round(W0*.01),y:Math.round(H0*.01),w:Math.round(W0*.98),h:Math.round(H0*.98),found:false};
 const f=1/k;return{x:Math.round(L*f),y:Math.round(T*f),w:Math.round((R-L)*f),h:Math.round((B-T)*f),found:true}}
function rotateCanvas(c,deg){const o=document.createElement('canvas'),q=deg%180!==0;o.width=q?c.height:c.width;o.height=q?c.width:c.height;const g=o.getContext('2d');g.translate(o.width/2,o.height/2);g.rotate(deg*Math.PI/180);g.drawImage(c,-c.width/2,-c.height/2);return o}
let cropDone=null,cropSeq=0;
/* which way is up: read the words on a cover in its four positions and keep the one where real words come out. Says 0 when it is not sure. */
async function photoUpright(src,alive){
 let T;try{T=await getTess()}catch(e){return 0}
 let worker;try{worker=await T.createWorker('eng');await worker.setParameters({tessedit_pageseg_mode:'6'})}catch(e){try{worker&&worker.terminate()}catch(_){}return 0}
 try{
  const k=Math.min(1,700/Math.max(src.width,src.height)),sm=document.createElement('canvas');sm.width=Math.round(src.width*k);sm.height=Math.round(src.height*k);
  const g=sm.getContext('2d');g.filter='grayscale(1) contrast(1.3)';g.drawImage(src,0,0,sm.width,sm.height);
  const score=async deg=>{const d=(await worker.recognize(deg?rotateCanvas(sm,deg):sm)).data,ws=d.words||(d.lines||[]).flatMap(l=>l.words||[]);
   return ws.reduce((s,w)=>{const n=(w.text.match(/\p{L}/gu)||[]).length;return w.confidence>=60&&n>=3?s+n*w.confidence/100:s},0)};
  const sc={};for(const deg of [0,90,270,180]){if(!alive())return 0;sc[deg]=await score(deg);if(deg===0&&sc[0]>=12)return 0}
  const o=Object.entries(sc).sort((a,b)=>b[1]-a[1]);return o[0][1]>=8&&o[0][1]>=1.6*o[1][1]?+o[0][0]:0
 }catch(e){return 0}finally{try{worker.terminate()}catch(e){}}}
async function cropPhoto(file,kind){
 let bm;try{bm=await createImageBitmap(file)}catch(e){return null}
 let src=document.createElement('canvas');{const k=Math.min(1,1600/Math.max(bm.width,bm.height));src.width=Math.round(bm.width*k);src.height=Math.round(bm.height*k);src.getContext('2d').drawImage(bm,0,0,src.width,src.height)}
 /* the photo is shown the way it was taken; a spine selected lying down is stood up when the crop is confirmed */
 let box=detectBook(src,kind);
 const ov=$('cropov'),cv=$('cropcv'),bx=$('cropbox'),stage=$('cropstage');
 $('croptitle').textContent=L({cover:'Crop the cover',back:'Crop the back',spine:'Crop the spine'}[kind]||'Crop the photo');
 let sc=1;
 const draw=()=>{const maxW=Math.min(stage.parentNode.clientWidth||320,560),maxH=Math.max(220,innerHeight*.58);sc=Math.min(maxW/src.width,maxH/src.height,1.5);
  cv.width=src.width;cv.height=src.height;cv.getContext('2d').drawImage(src,0,0);cv.style.width=Math.round(src.width*sc)+'px';cv.style.height=Math.round(src.height*sc)+'px';stage.style.width=cv.style.width;stage.style.height=cv.style.height;place()};
 const place=()=>{bx.style.left=box.x*sc+'px';bx.style.top=box.y*sc+'px';bx.style.width=box.w*sc+'px';bx.style.height=box.h*sc+'px'};
 const hint=()=>{$('crophint').textContent=box.found===false?L("Couldn't find the edges. Drag the corners to fit the book."):L('Found the book. Drag the corners if it needs fixing.')};
 ov.classList.add('on');draw();hint();
 /* covers: check in the background which way is up, and turn the photo if it is clearly on its side, unless the person has already started adjusting it */
 let touched=false;const seq=++cropSeq;
 if(kind!=='spine')photoUpright(src,()=>seq===cropSeq&&!touched&&!!cropDone).then(deg=>{if(!deg||seq!==cropSeq||touched||!cropDone)return;src=rotateCanvas(src,deg);box=detectBook(src,kind);draw();$('crophint').textContent=L('Turned the photo the right way up. Use Rotate if that is wrong.')});
 /* drag the corners, or the whole box */
 let dg=null;const MINS=24;
 bx.onpointerdown=e=>{touched=true;e.preventDefault();bx.setPointerCapture(e.pointerId);dg={h:e.target.dataset.h||'move',x:e.clientX,y:e.clientY,b:{...box}}};
 bx.onpointermove=e=>{if(!dg)return;const dx=(e.clientX-dg.x)/sc,dy=(e.clientY-dg.y)/sc,b={...dg.b},m=MINS/sc;
  if(dg.h==='move'){b.x=Math.max(0,Math.min(src.width-b.w,b.x+dx));b.y=Math.max(0,Math.min(src.height-b.h,b.y+dy))}
  else{if(dg.h.includes('w')){const nx=Math.max(0,Math.min(b.x+b.w-m,b.x+dx));b.w+=b.x-nx;b.x=nx}
   if(dg.h.includes('e'))b.w=Math.max(m,Math.min(src.width-b.x,b.w+dx));
   if(dg.h.includes('n')){const ny=Math.max(0,Math.min(b.y+b.h-m,b.y+dy));b.h+=b.y-ny;b.y=ny}
   if(dg.h.includes('s'))b.h=Math.max(m,Math.min(src.height-b.y,b.h+dy))}
  box={...b,found:true};place()};
 bx.onpointerup=bx.onpointercancel=()=>{dg=null};
 $('croprot').onclick=()=>{touched=true;src=rotateCanvas(src,270);box=detectBook(src,kind);draw();hint()};
 $('cropauto').onclick=()=>{box=detectBook(src,kind);place();hint()};
 $('cropfull').onclick=()=>{box={x:0,y:0,w:src.width,h:src.height,found:true};place()};
 return new Promise(res=>{
  cropDone=ok=>{cropSeq++;ov.classList.remove('on');cropDone=null;if(!ok){res(null);return}
   const o=document.createElement('canvas'),bw=Math.max(1,Math.round(box.w)),bh=Math.max(1,Math.round(box.h));o.width=bw;o.height=bh;o.getContext('2d').drawImage(src,Math.round(box.x),Math.round(box.y),bw,bh,0,0,bw,bh);
   /* a spine always goes on the shelf standing up: a selection that is wider than tall is turned */
   (kind==='spine'&&bw>bh?rotateCanvas(o,270):o).toBlob(b=>res(b),'image/jpeg',.92)};
  $('cropok').onclick=()=>cropDone&&cropDone(true);$('cropx').onclick=()=>cropDone&&cropDone(false)})}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&cropDone){e.stopPropagation();cropDone(false)}},true);
/* ---------- the lamp: tap to switch it on or off ---------- */
(()=>{const lp=$('lamp');if(!lp)return;
 const set=on=>{document.body.classList.toggle('lampon',on);lp.classList.toggle('off',!on);lp.setAttribute('aria-pressed',on);lp.setAttribute('aria-label',L(on?'Turn the lamp off':'Turn the lamp on'))};
 let on=true;try{on=localStorage.getItem('bookshelf-lamp')!=='off'}catch(e){}set(on);
 /* the lamp comes on by itself when evening falls outside, and goes off in the morning */
 window.lampAuto=v=>{if(on!==v){on=v;set(on)}};if(document.body.classList.contains('night-live'))window.lampAuto(true);
 const flip=()=>{on=!on;set(on);try{localStorage.setItem('bookshelf-lamp',on?'on':'off')}catch(e){}try{sfx('click')}catch(e){}};
 lp.addEventListener('click',e=>{e.stopPropagation();flip();if(e.detail)lp.blur()});
 lp.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();flip()}})})();
/* ---------- a picture of the shelf ---------- */
async function makeShelfPic(){
 const list=books.filter(b=>st(b)==='read'),W=1080,pad=110,inner=W-2*pad-40,rows=[[]];let x=0;
 list.forEach(b=>{const w=Math.round(sw(b)*1.7)+4;if(x+w>inner&&rows.at(-1).length){rows.push([]);x=0}rows.at(-1).push(b);x+=w});
 const rowH=340,top=190,H=top+rows.length*(rowH+26)+40+170,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
 const cs=getComputedStyle(document.documentElement),v=(n,d)=>cs.getPropertyValue(n).trim()||d;
 const wall=v('--wall','#e9dcc4'),wall2=v('--wall2','#e3d4b9'),wood=v('--wood','#9a6538'),wood2=v('--wood2','#6d4523'),ink=v('--ink','#2a2118'),muted=v('--muted','#7a6a58'),acc=v('--acc','#8b2e2e'),fl1=v('--fl1','#b98a5a'),fl2=v('--fl2','#a67a4c');
 for(let i=0;i<W;i+=92){g.fillStyle=wall;g.fillRect(i,0,46,H);g.fillStyle=wall2;g.fillRect(i+46,0,46,H)}
 g.fillStyle=fl1;g.fillRect(0,H-150,W,150);g.fillStyle=fl2;for(let i=0;i<W;i+=120)g.fillRect(i,H-150,2,150);g.fillStyle=v('--base','#f3ecdf');g.fillRect(0,H-162,W,14);
 g.textAlign='center';g.fillStyle=ink;g.font='bold 60px Georgia, serif';g.fillText(fitText(g,L('My Bookshelf'),W-120),W/2,110);
 const n=z=>books.filter(b=>st(b)===z).length;g.fillStyle=muted;g.font='26px system-ui, sans-serif';
 g.fillText([L('{n} read',{n:n('read')}),n('reading')?L('{n} reading',{n:n('reading')}):'',n('want')?L('{n} to read',{n:n('want')}):''].filter(Boolean).join('  \u00b7  '),W/2,152);
 const caseH=rows.length*(rowH+26)+24;g.fillStyle=wood2;g.beginPath();g.roundRect?g.roundRect(pad-20,top-10,W-2*pad+40,caseH,14):g.rect(pad-20,top-10,W-2*pad+40,caseH);g.fill();
 rows.forEach((r,ri)=>{const y0=top+ri*(rowH+26);g.fillStyle='rgba(0,0,0,.38)';g.fillRect(pad,y0,W-2*pad,rowH);let bx=pad+20;const base=y0+rowH;
  r.forEach(b=>{const w=Math.round(sw(b)*1.7),h=Math.min(rowH-16,Math.round(sh(b)*1.25));g.fillStyle=b.color||'#8b2e2e';g.fillRect(bx,base-h,w,h);
   const gr=g.createLinearGradient(bx,0,bx+w,0);gr.addColorStop(0,'rgba(0,0,0,.3)');gr.addColorStop(.3,'rgba(255,255,255,.12)');gr.addColorStop(1,'rgba(0,0,0,.25)');g.fillStyle=gr;g.fillRect(bx,base-h,w,h);
   g.save();g.beginPath();g.rect(bx,base-h,w,h);g.clip();g.translate(bx+w/2+6,base-h+14);g.rotate(Math.PI/2);g.textAlign='left';g.fillStyle=lum(b.color||'#8b2e2e')>150?'#222':'#fff';g.font='bold 22px Georgia, serif';g.fillText(fitText(g,b.title,h-30),0,0);g.restore();
   bx+=w+4});
  g.fillStyle=wood;g.fillRect(pad-20,base,W-2*pad+40,26)});
 g.textAlign='center';g.fillStyle=acc;g.font='600 28px system-ui, sans-serif';g.fillText('\u{1F4DA} '+L('My Bookshelf'),W/2,H-50);
 $('yrimg').src=c.toDataURL('image/png');$('yrimg').alt=L('My Bookshelf');yrName='my-bookshelf.png';yrBlob=await new Promise(r=>c.toBlob(r,'image/png'));
 let canShare=false;try{canShare=!!(navigator.canShare&&navigator.canShare({files:[new File([yrBlob],yrName,{type:'image/png'})]}))}catch(e){}
 $('yrshare').hidden=!canShare;$('lov').classList.remove('on');$('yrov').classList.add('on')}
$('shelfpic').onclick=makeShelfPic;
const APPVER='1.0.0';
$('aboutbtn').onclick=()=>{const q='?lang='+lang;$('privlink').href='privacy.html'+q;$('termslink').href='terms.html'+q;$('aboutver').textContent=L('Version {v}',{v:APPVER});$('lov').classList.remove('on');$('aboutov').classList.add('on')};
$('aboutx').onclick=()=>$('aboutov').classList.remove('on');$('aboutov').onclick=e=>{if(e.target===$('aboutov'))$('aboutov').classList.remove('on')};
applySeason();setInterval(applySeason,36e5);
/* ---------- bigger storage: the library lives in IndexedDB (moved over from the old small storage) ---------- */
const IDB={db:null,open(){return new Promise((res,rej)=>{if(this.db)return res(this.db);try{const r=indexedDB.open('my-bookshelf',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>{this.db=r.result;res(this.db)};r.onerror=()=>rej(r.error)}catch(e){rej(e)}})},
 async get(k){const db=await this.open();return new Promise((res,rej)=>{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})},
 async set(k,v){const db=await this.open();return new Promise((res,rej)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})}};
(async()=>{
 try{const saved=await IDB.get('books');
  let old=null;try{old=JSON.parse(localStorage.getItem(LS)||'null')}catch(e){}
  if(Array.isArray(old)&&old.length&&!(Array.isArray(saved)&&saved.length)){books=old;await IDB.set('books',JSON.parse(JSON.stringify(books)))}
  else if(Array.isArray(saved))books=saved;
  else await IDB.set('books',JSON.parse(JSON.stringify(books)));
  useIDB=true;try{localStorage.removeItem(LS)}catch(e){}}catch(e){useIDB=false}
 books=fixBooks(books);booksReady=true;applyLang();render();moveCat();try{drawPill();applySeason()}catch(e){}
 try{if(/[?&]add\b/.test(location.search)){history.replaceState(null,'',location.pathname);setTimeout(()=>openModal(null),400)}}catch(e){}
})();

/* ================= ten additions ================= */
/* ---------- 1. scan several books in a row ---------- */
let multiN=0,multiLast='',multiAt=0;
async function isbnData(isbn){for(let a=0;a<2;a++){try{return await Promise.any(isbnSources(isbn))}catch(e){}if(a===0&&navigator.onLine!==false)await new Promise(r=>setTimeout(r,900));else break}return null}
async function multiAdd(isbn){
 const msg=$('scanmsg'),again=ms=>setTimeout(()=>{$('cam').classList.remove('found');if(scanning)requestAnimationFrame(scanLoop)},ms||900);
 if(isbn===multiLast&&Date.now()-multiAt<6000){again(200);return}
 multiLast=isbn;multiAt=Date.now();
 if(books.some(b=>toIsbn13(b.isbn||'')===isbn)){msg.textContent=L('Already on your shelves.');again();return}
 $('cam').classList.add('found');if(navigator.vibrate)navigator.vibrate(60);msg.textContent=L('Looking up ISBN {i}…',{i:isbn});
 const d=await isbnData(isbn);multiAt=Date.now();
 if(!d){msg.textContent=L('No book found for ISBN {i}. Scan the next one.',{i:isbn});again(1400);return}
 const status=$('multishelf').value||'want';
 const b={id:'b'+Date.now().toString(36),w:30+Math.floor(Math.random()*24),h:150+Math.floor(Math.random()*62),createdAt:Date.now(),isbn,title:String(d.title).slice(0,100),author:(d.author_name||[])[0]||'',status,stars:null,tags:[],
  series:'',seriesNo:0,seriesOf:0,lentTo:'',lentOn:'',genres:guessGenres(d.subjects||d.subject||[],(d.gb&&d.gb.categories)||[]),page:0,pages:d.pages||d.number_of_pages_median||0,started:status==='reading'?today():'',finished:'',past:status==='read',
  note:'',blurb:String(d.desc||'').replace(/<[^>]+>/g,'').slice(0,1200),color:'#'+Math.floor(Math.random()*0x777777+0x111111).toString(16).padStart(6,'0'),cover:'',back:'',spine:''};
 books.push(b);store();render();multiN++;try{sfx('pop')}catch(e){}
 msg.textContent=L('Added: {t} · {n} added',{t:b.title,n:multiN});
 /* the cover arrives in the background while you scan the next one */
 (async()=>{try{const c=await fromUrl(d.cover_i?`https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg?default=false`:`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`,240);if(books.includes(b)&&!b.cover){b.cover=c;const col=await avgColor(c);if(col)b.color=col;store();render()}}catch(e){}})();
 again()}
$('multiscan').onchange=()=>{$('multishelf').hidden=!$('multiscan').checked};
{const so=startScan;startScan=function(){const ms=$('multishelf');if(!ms.options.length)[['want','Want to read'],['read','Read'],['reading','Reading']].forEach(([v,n])=>{const o=document.createElement('option');o.value=v;o.dataset.n=n;ms.append(o)});[...ms.options].forEach(o=>o.textContent=L(o.dataset.n));ms.hidden=!$('multiscan').checked;multiN=0;multiLast='';return so()};$('scanbtn').onclick=startScan;
 const sx=stopScan;stopScan=function(){const n=multiN;multiN=0;sx();if(n>0){try{closeModal()}catch(e){}toast(L(n===1?'Added {n} books.':'Added {n} books.',{n}))}};$('scanx').onclick=stopScan}
/* ---------- 3. a nudge when a lent book has been away for a month ---------- */
async function lentNag(){
 if(document.querySelector('.ov.on'))return;let m={};try{m=JSON.parse(localStorage.getItem('bookshelf-lentnag')||'{}')||{}}catch(e){}
 const b=books.find(b=>b.lentTo&&b.lentOn&&days(b.lentOn,today())>=30&&Date.now()-(m[b.id]||0)>14*864e5);if(!b)return;
 m[b.id]=Date.now();try{localStorage.setItem('bookshelf-lentnag',JSON.stringify(m))}catch(e){}
 const ok=await ask('\u{1F91D} '+L('{name} has had “{t}” for {n} days. Time to ask for it back?',{name:b.lentTo,t:b.title,n:days(b.lentOn,today())}),L('Mark as returned'),L('Later'));
 if(ok){b.lentTo='';b.lentOn='';store();render();toast(L('Returned.'))}}
setTimeout(()=>{try{lentNag()}catch(e){}},4500);
/* ---------- 5. badges ---------- */
function bestStreak(){const s=new Set(sessions.map(x=>dayKey(x.start)));allReads().forEach(b=>{if(b.finished&&!b.past)s.add(b.finished)});let best=0,run=0,prev=null;[...s].sort().forEach(k=>{run=prev&&days(prev,k)===1?run+1:1;if(run>best)best=run;prev=k});return best}
function badgeList(){
 const reads=allReads(),n=reads.length,done=books.filter(b=>st(b)==='read'),pages=reads.reduce((a,b)=>a+(+b.pages||0),0),bs=bestStreak(),y=String(new Date().getFullYear()),goal=+goals[y]||0;
 const sm={};done.forEach(b=>{if(b.series&&b.seriesOf>0){const k=b.series.trim().toLowerCase();(sm[k]=sm[k]||{of:b.seriesOf,s:new Set()}).s.add(b.seriesNo||b.id)}});
 const gs=new Set();done.forEach(b=>(b.genres||[]).forEach(g=>gs.add(g)));
 return [['b1','\u{1F4D6}','First book','Finish your first book',n>=1],['b10','\u{1F4DA}','Bookworm','Finish 10 books',n>=10],['b25','\u{1F3DB}️','Librarian','Finish 25 books',n>=25],['b50','\u{1F451}','Half a hundred','Finish 50 books',n>=50],['b100','\u{1F4AF}','Century','Finish 100 books',n>=100],
  ['s7','\u{1F525}','On a roll','Read 7 days in a row',bs>=7],['s30','\u{1F31F}','Unstoppable','Read 30 days in a row',bs>=30],['big','\u{1F9F1}','Big one','Finish a book of 500 pages or more',done.some(b=>+b.pages>=500)],['p5k','\u{1F4DC}','Page turner','Read 5,000 pages',pages>=5000],
  ['q5','❝','Collector of words','Save 5 quotes',quotes.length>=5],['ser','\u{1F9E9}','Series finisher','Finish a whole series',Object.values(sm).some(x=>x.s.size>=x.of)],['g5','\u{1F308}','Explorer','Read 5 different genres',gs.size>=5],
  ['goal','\u{1F3AF}','Goal reached','Reach your yearly reading goal',goal>0&&reads.filter(b=>(b.finished||'').startsWith(y)).length>=goal]]}
function badgeCard(){const c=card('\u{1F3C5} '+L('Badges'),true),g=el('div','badges');
 badgeList().forEach(([id,ic,name,desc,ok])=>{const b=el('button','badge'+(ok?'':' locked'));b.type='button';b.append(el('span','',ic),document.createTextNode(L(name)));b.title=L(desc);b.setAttribute('aria-label',L(name)+': '+L(desc)+(ok?' ✓':''));b.onclick=()=>toast((ok?'✓ ':'\u{1F512} ')+L(name)+' – '+L(desc));g.append(b)});c.append(g);return c}
function checkBadges(){
 const got=badgeList().filter(b=>b[4]);let old=null;try{old=JSON.parse(localStorage.getItem('bookshelf-badges')||'null')}catch(e){}
 const ids=got.map(b=>b[0]);if(old&&ids.every(i=>old.includes(i)))return;
 try{localStorage.setItem('bookshelf-badges',JSON.stringify([...new Set([...(old||[]),...ids])]))}catch(e){}
 if(!old)return;const nw=got.filter(b=>!old.includes(b[0]));if(nw.length)setTimeout(()=>{toast(L('\u{1F3C5} New badge: {b}',{b:nw.map(b=>L(b[2])).join(', ')}));try{sfx('chirp')}catch(e){}},3300)}
/* ---------- 6. daily reading goal ---------- */
function dailyBox(inf){
 const dg=+goals.dailyMin||0,box=el('div','daily');
 if(dg){const p=Math.min(1,inf.today/dg);box.append(el('div','',L('Daily goal: {m} of {g} min',{m:inf.today,g:dg})+(p>=1?' ✓':'')));const tr=el('div','dtrack'),f=el('i');f.style.width=(p*100)+'%';tr.append(f);box.append(tr)}
 const db=el('button','fbtn',dg?L('Change daily goal'):'⏱️ '+L('Set a daily reading goal'));db.type='button';
 db.onclick=async()=>{$('askin').hidden=false;$('askin').value=dg||20;const ok=await ask(L('How many minutes do you want to read each day? (0 to turn it off)'),L('Save'),L('Cancel'));$('askin').hidden=true;
  if(ok){const v=Math.round(+$('askin').value);goals.dailyMin=v>0&&v<1000?v:0;saveGoals();if(v>0)offerRemind();renderGoals()}};
 box.append(db);return box}
{const rg0=renderGoals;renderGoals=function(){rg0();try{const body=$('glbody'),sc=body.children[1];if(sc){sc.append(dailyBox(streakInfo()));sc.after(badgeCard())}}catch(e){}try{checkBadges()}catch(e){}};
 const r0=render;render=function(){r0();try{checkBadges()}catch(e){}}}
$('rpstop').addEventListener('click',()=>{try{ambStop()}catch(e){}const dg=+goals.dailyMin||0;if(!dg||!active)return;const before=streakInfo().today,add=Math.max(1,Math.round((Date.now()-active.start)/6e4));if(before<dg&&before+add>=dg)setTimeout(()=>toast(L('Daily goal reached! \u{1F389}')),3400)},true);
/* ---------- 7. the animal's name ---------- */
cat.addEventListener('click',()=>{if(petDragged)return;const nm=(look.petName||'').trim();if(!nm)return;catw.querySelectorAll('.pname').forEach(x=>x.remove());const t=el('b','pname',nm);catw.append(t);setTimeout(()=>t.remove(),1800)});
/* ---------- 9. background sound while a reading session runs ---------- */
let amb=null,ambKind='';try{ambKind=localStorage.getItem('bookshelf-amb')||''}catch(e){}
const AMBS=['','rain','fire','night'],AMBI={'':'\u{1F3A7}',rain:'\u{1F327}️',fire:'\u{1F525}',night:'\u{1F997}'},AMBL={'':'Background sound: off',rain:'Background sound: rain',fire:'Background sound: fireplace',night:'Background sound: night crickets'};
function ambStop(){if(!amb)return;const x=amb;amb=null;clearInterval(x.t);try{x.g.gain.cancelScheduledValues(AC.currentTime);x.g.gain.setValueAtTime(x.g.gain.value,AC.currentTime);x.g.gain.linearRampToValueAtTime(0,AC.currentTime+.5)}catch(e){}setTimeout(()=>{try{x.src.stop();x.g.disconnect()}catch(e){}},700)}
function ambStart(kind){
 ambStop();if(!kind)return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;if(!AC)AC=new C();if(AC.state==='suspended')AC.resume();
 const a=AC,g=a.createGain();g.gain.value=0;g.connect(a.destination);g.gain.linearRampToValueAtTime(kind==='rain'?.2:kind==='fire'?.5:.3,a.currentTime+1.5);
 const buf=a.createBuffer(1,a.sampleRate*4,a.sampleRate),d=buf.getChannelData(0);let last=0;
 for(let i=0;i<d.length;i++){const w=Math.random()*2-1;if(kind==='rain')d[i]=w;else{last=(last+.02*w)/1.02;d[i]=last*3.5}}
 /* fade the ends of the loop into each other so it doesn't tick every four seconds */
 const fade=Math.floor(a.sampleRate*.05);for(let i=0;i<fade;i++){const k=i/fade;d[i]*=k;d[d.length-1-i]*=k}
 const src=a.createBufferSource();src.buffer=buf;src.loop=true;const f=a.createBiquadFilter();
 if(kind==='rain'){f.type='bandpass';f.frequency.value=1500;f.Q.value=.35}else{f.type='lowpass';f.frequency.value=kind==='fire'?420:260}
 src.connect(f).connect(g);src.start();
 let t=0;
 if(kind==='fire')t=setInterval(()=>{if(Math.random()>.5)return;const o=a.createBufferSource(),b=a.createBuffer(1,Math.floor(a.sampleRate*.03),a.sampleRate),x=b.getChannelData(0);for(let i=0;i<x.length;i++)x[i]=(Math.random()*2-1)*(1-i/x.length);o.buffer=b;const hp=a.createBiquadFilter();hp.type='highpass';hp.frequency.value=1500+Math.random()*2500;const pg=a.createGain();pg.gain.value=.08+Math.random()*.3;o.connect(hp).connect(pg).connect(g);o.start()},150);
 if(kind==='night')t=setInterval(()=>{if(Math.random()>.7)return;const o=a.createOscillator(),cg=a.createGain(),t0=a.currentTime;o.frequency.value=4100+Math.random()*500;cg.gain.value=0;for(let k=0;k<3;k++){cg.gain.setValueAtTime(0,t0+k*.07);cg.gain.linearRampToValueAtTime(.12,t0+k*.07+.015);cg.gain.linearRampToValueAtTime(0,t0+k*.07+.05)}o.connect(cg).connect(g);o.start(t0);o.stop(t0+.3)},900);
 amb={g,src,t}}
function drawAmb(){const b=$('rpamb');b.textContent=AMBI[ambKind];b.setAttribute('aria-label',L(AMBL[ambKind]));b.title=L(AMBL[ambKind])}
$('rpamb').onclick=()=>{ambKind=AMBS[(AMBS.indexOf(ambKind)+1)%AMBS.length];try{localStorage.setItem('bookshelf-amb',ambKind)}catch(e){}drawAmb();ambStart(ambKind);toast(AMBI[ambKind]+' '+L(AMBL[ambKind]))};
{const s0=startSession;startSession=function(id){s0(id);try{ambStart(ambKind)}catch(e){}}}
drawAmb();
/* ---------- 2. welcome tour ---------- */
const TOUR=[['\u{1F4DA}','Welcome to My Bookshelf','A cosy room for every book you read. Everything stays on your phone: no account, no ads.'],['➕','Add your books','Tap “+ Add a book”, then type the title, scan the barcode on the back, or take a photo of the cover.'],['\u{1F446}','Move books around','Tap a book to open it. Drag a book to another shelf when you start or finish it.'],['↔️','Turn around the room','Swipe left or right: one wall has your reading goal, streak and quotes, the other has your stats.'],['\u{1F3A8}','Make it yours','Open Customize to change the walls, the furniture, the clock and your little animal. Try tapping the lamp, the bowls and the animal too.']];
let tourI=0;
function tourDraw(){const s=TOUR[tourI];$('tourico').textContent=s[0];$('tourh').textContent=L(s[1]);$('tourp').textContent=L(s[2]);const d=$('tourdots');d.replaceChildren();TOUR.forEach((_,i)=>d.append(el('i',i===tourI?'on':'')));$('tourskip').textContent=L('Skip');$('tourskip').style.visibility=tourI===TOUR.length-1?'hidden':'';$('tournext').textContent=L(tourI===TOUR.length-1?'Start':'Next')}
function tourOpen(){tourI=0;tourDraw();$('tourov').classList.add('on');setTimeout(()=>$('tournext').focus(),60)}
function tourClose(){$('tourov').classList.remove('on');try{localStorage.setItem('bookshelf-tour','1')}catch(e){}}
$('tournext').onclick=()=>{if(tourI<TOUR.length-1){tourI++;tourDraw()}else tourClose()};$('tourskip').onclick=tourClose;
$('tourbtn').onclick=()=>{$('aboutov').classList.remove('on');tourOpen()};
/* ---------- 10. home-screen shortcuts (long-press the app icon) and the first-run tour ---------- */
{const qp=new URLSearchParams(location.search),sc=qp.has('add')||qp.has('scan');let seen=true;try{seen=!!localStorage.getItem('bookshelf-tour')}catch(e){}
 if(sc)setTimeout(()=>{try{history.replaceState(null,'',location.pathname)}catch(e){}$('addBtn').click();if(qp.has('scan'))setTimeout(()=>$('scanbtn').click(),700)},700);
 else if(!seen&&!navigator.webdriver)setTimeout(()=>{if(!document.querySelector('.ov.on'))tourOpen()},900)}

/* ---------- daily safety copies kept on the phone (last 7 days), and a backup reminder you choose ---------- */
const BEV='bookshelf-backup-every';
const SAFE={db:null,open(){return this.db||(this.db=new Promise((res,rej)=>{const r=indexedDB.open('bookshelf-safe',1);r.onupgradeneeded=()=>r.result.createObjectStore('days',{keyPath:'day'});r.onsuccess=()=>res(r.result);r.onerror=()=>{this.db=null;rej(r.error)}}))},
 async tx(mode,fn){const d=await this.open();return new Promise((res,rej)=>{const t=d.transaction('days',mode),q=fn(t.objectStore('days'));t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})},
 all(){return this.tx('readonly',s=>s.getAll())},put(v){return this.tx('readwrite',s=>s.put(v))},del(k){return this.tx('readwrite',s=>s.delete(k))}};
const safeSnap=()=>JSON.stringify({books,quotes,goals,look,lang,sessions,marks:window.marksGet?marksGet():{}});
async function safeCopy(){
 if(!books.length||!window.indexedDB)return;
 try{const all=await SAFE.all(),day=today();if(all.some(x=>x.day===day))return;
  await SAFE.put({day,t:Date.now(),n:books.length,data:safeSnap()});
  for(const k of all.map(x=>x.day).filter(k=>k!=='0-undo').sort().reverse().slice(6))await SAFE.del(k)}catch(e){}}
async function safeOpen(){
 const box=$('safelist');box.replaceChildren();$('lov').classList.remove('on');$('safeov').classList.add('on');
 let all=[];try{all=await SAFE.all()}catch(e){}
 all.sort((a,b)=>a.day==='0-undo'?1:b.day==='0-undo'?-1:b.day.localeCompare(a.day));
 if(!all.length){box.append(el('p','stempty',L('No copies yet. The first one is made the next time you open the app.')));return}
 const ul=el('ul','nextlist');all.forEach(c=>{const name=c.day==='0-undo'?L('Before the last restore'):fmtDate(c.day),li=el('li','',name);li.append(el('small','',nBooks(c.n||0)));
  const r=el('button','fbtn','↺ '+L('Restore'));r.type='button';r.onclick=async()=>{
   $('safeov').classList.remove('on');if(!(await ask(L('Replace your current shelf with the copy from {d}?',{d:name}),L('Restore'))))return;
   let d;try{d=JSON.parse(c.data)}catch(e){toast(L('Not a valid backup file'));return}if(!d||!Array.isArray(d.books)){toast(L('Not a valid backup file'));return}
   /* keep what was there a moment ago, so a restore can itself be undone */
   if(c.day!=='0-undo')try{await SAFE.put({day:'0-undo',t:Date.now(),n:books.length,data:safeSnap()})}catch(e){}
   books=fixBooks(d.books);if(Array.isArray(d.quotes)){quotes=d.quotes;saveQuotes()}if(d.goals&&typeof d.goals==='object'){goals=d.goals;saveGoals()}
   if(Array.isArray(d.sessions)){sessions=d.sessions;saveSessions()}if(d.marks&&window.marksPut)marksPut(d.marks);
   if(d.look&&typeof d.look==='object'){look=d.look;try{localStorage.setItem(LK,JSON.stringify(look))}catch(e){}applyLook()}
   store();render();try{if(view==='goals')renderGoals();else if(view==='stats')renderStats()}catch(e){}toast(L('Restored.'))};
  li.append(r);ul.append(li)});box.append(ul)}
$('safex').onclick=()=>$('safeov').classList.remove('on');$('safeov').onclick=e=>{if(e.target===$('safeov'))$('safeov').classList.remove('on')};
setTimeout(safeCopy,3500);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')safeCopy()});

/* ---------- e-books: attach your own EPUB file to a book and read it inside the app ----------
   The file is kept on this phone only (its own little database), never in backups. */
const EB={db:null,mem:new Map(),
 open(){return this.db||(this.db=new Promise((res,rej)=>{let r;try{r=indexedDB.open('bookshelf-files',1)}catch(e){rej(e);return}
   r.onupgradeneeded=()=>{r.result.createObjectStore('files',{keyPath:'id'});r.result.createObjectStore('pos',{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}).catch(()=>null))},
 async tx(store,mode,fn){const d=await this.open();if(!d)throw 0;return new Promise((res,rej)=>{const t=d.transaction(store,mode),q=fn(t.objectStore(store));t.oncomplete=()=>res(q&&q.result);t.onerror=t.onabort=()=>rej(t.error)})},
 async get(store,id){try{return (await this.tx(store,'readonly',s=>s.get(id)))||this.mem.get(store+id)}catch(e){return this.mem.get(store+id)}},
 async put(store,v){try{await this.tx(store,'readwrite',s=>s.put(v))}catch(e){this.mem.set(store+v.id,v)}},
 async del(id){for(const s of ['files','pos']){this.mem.delete(s+id);try{await this.tx(s,'readwrite',o=>o.delete(id))}catch(e){}}}};
/* which books have a file: a small list kept beside the library, so the form can show it straight away */
let EBIDX={};try{EBIDX=JSON.parse(localStorage.getItem('bookshelf-ebooks')||'{}')||{}}catch(e){}
const ebSaveIdx=()=>{try{localStorage.setItem('bookshelf-ebooks',JSON.stringify(EBIDX))}catch(e){}};
/* an EPUB is a zip: this reads one without any outside library */
async function unzip(buf){
 const dv=new DataView(buf),u8=new Uint8Array(buf);let e=-1;
 for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-66000);i--)if(dv.getUint32(i,true)===0x06054b50){e=i;break}
 if(e<0)throw 'notepub';
 const n=dv.getUint16(e+10,true),td=new TextDecoder(),files=new Map();let p=dv.getUint32(e+16,true);
 for(let i=0;i<n&&p+46<=buf.byteLength;i++){if(dv.getUint32(p,true)!==0x02014b50)break;
  const nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true);
  files.set(td.decode(u8.subarray(p+46,p+46+nl)),{m:dv.getUint16(p+10,true),cs:dv.getUint32(p+20,true),us:dv.getUint32(p+24,true),off:dv.getUint32(p+42,true)});p+=46+nl+xl+cl}
 const lower=new Map([...files.keys()].map(k=>[k.toLowerCase(),k]));
 const find=name=>files.has(name)?name:lower.get(String(name).toLowerCase())||null;
 const read=async name=>{const k=find(name),f=k&&files.get(k);if(!f)return null;
  const s=f.off+30+dv.getUint16(f.off+26,true)+dv.getUint16(f.off+28,true),raw=u8.subarray(s,s+f.cs);
  if(f.m===0)return raw;if(f.m!==8)throw 'bad';
  return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())};
 return{files,find,read}}
/* "../Images/a.jpg" seen from "OEBPS/Text/ch1.xhtml" -> "OEBPS/Images/a.jpg" */
function ebPath(base,href){let h=String(href||'').split('#')[0];try{h=decodeURIComponent(h)}catch(e){}
 const out=h.startsWith('/')?[]:base.split('/').slice(0,-1);h.split('/').forEach(s=>{if(s==='..')out.pop();else if(s&&s!=='.')out.push(s)});return out.join('/')}
async function epubOpen(buf){
 if(!('DecompressionStream' in window))throw 'old';
 const z=await unzip(buf),dec=new TextDecoder(),txt=async n=>{const b=await z.read(n);return b?dec.decode(b):null},xml=s=>new DOMParser().parseFromString(s,'application/xml'),
  all=(d,n)=>[...d.getElementsByTagNameNS('*',n)];
 const con=await txt('META-INF/container.xml');if(!con)throw 'notepub';
 const enc=await txt('META-INF/encryption.xml');
 /* font scrambling is harmless; anything else means the store locked the book */
 if(enc&&all(xml(enc),'EncryptionMethod').some(m=>!/idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC/i.test(m.getAttribute('Algorithm')||'')))throw 'drm';
 const rf=all(xml(con),'rootfile')[0],opfPath=rf&&rf.getAttribute('full-path');if(!opfPath)throw 'bad';
 const opfTxt=await txt(opfPath);if(!opfTxt)throw 'bad';const opf=xml(opfTxt);
 const items=new Map();all(opf,'item').forEach(it=>items.set(it.getAttribute('id'),{path:ebPath(opfPath,it.getAttribute('href')),type:it.getAttribute('media-type')||'',props:it.getAttribute('properties')||''}));
 const spine=all(opf,'itemref').map(r=>items.get(r.getAttribute('idref'))).filter(it=>it&&z.find(it.path)&&/html|xml/i.test(it.type)).map(it=>({path:z.find(it.path),size:Math.max(1,z.files.get(z.find(it.path)).us)}));
 if(!spine.length)throw 'bad';
 const idx=p=>spine.findIndex(s=>s.path.toLowerCase()===String(p).toLowerCase());
 let toc=[];
 try{const nav=[...items.values()].find(i=>/\bnav\b/.test(i.props));
  if(nav){const d=new DOMParser().parseFromString(await txt(nav.path),'application/xhtml+xml'),navs=all(d,'nav'),el0=navs.find(x=>/toc/.test(x.getAttribute('epub:type')||x.getAttributeNS('http://www.idpf.org/2007/ops','type')||''))||navs[0];
   if(el0)toc=all(el0,'a').map(a=>({label:(a.textContent||'').replace(/\s+/g,' ').trim(),ch:idx(ebPath(nav.path,a.getAttribute('href'))),frag:(a.getAttribute('href')||'').split('#')[1]||''}))}
  if(!toc.some(t=>t.ch>=0)){const sp=all(opf,'spine')[0],ncx=items.get(sp&&sp.getAttribute('toc'))||[...items.values()].find(i=>/ncx/.test(i.type));
   if(ncx){const d=xml(await txt(ncx.path));toc=all(d,'navPoint').map(np=>{const c=all(np,'content')[0],l=all(np,'text')[0],src=c?c.getAttribute('src'):'';
    return{label:l?(l.textContent||'').replace(/\s+/g,' ').trim():'',ch:idx(ebPath(ncx.path,src)),frag:(src||'').split('#')[1]||''}})}}}catch(e){}
 toc=toc.filter(t=>t.ch>=0&&t.label);
 if(!toc.length)toc=spine.map((s,i)=>({label:L('Section {n}',{n:i+1}),ch:i,frag:''}));
 /* the book's own styling is left out, but which of its classes mean italic, bold or centred is kept */
 const cls=new Map();
 try{for(const it of items.values())if(/css/i.test(it.type)){const css=(await txt(it.path)||'').replace(/\/\*[\s\S]*?\*\//g,'');
   for(const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){const d=m[2].toLowerCase(),f=[];
    if(/font-style\s*:\s*(italic|oblique)/.test(d))f.push('rd-i');if(/font-weight\s*:\s*(bold|[6-9]00)/.test(d))f.push('rd-b');
    if(/text-align\s*:\s*center/.test(d))f.push('rd-c');if(/text-align\s*:\s*right/.test(d))f.push('rd-r');if(/font-variant[a-z-]*\s*:\s*small-caps/.test(d))f.push('rd-sc');
    if(/text-decoration[a-z-]*\s*:\s*underline/.test(d))f.push('rd-u');if(/vertical-align\s*:\s*super/.test(d))f.push('rd-sup');if(/vertical-align\s*:\s*sub\b/.test(d))f.push('rd-sub');
    if(!f.length)continue;
    m[1].split(',').forEach(sel=>{const c=sel.trim().match(/^[\w-]*\.([\w-]+)$/);if(c)cls.set(c[1],[...new Set([...(cls.get(c[1])||[]),...f])])})}}}catch(e){}
 const tEl=all(opf,'title')[0],aEl=all(opf,'creator')[0];
 let cov=[...items.values()].find(i=>/cover-image/.test(i.props));
 if(!cov){const m=all(opf,'meta').find(m=>m.getAttribute('name')==='cover');cov=m&&items.get(m.getAttribute('content'))}
 if(!cov)cov=([...items.entries()].find(([k,i])=>/^image\//.test(i.type)&&/cover/i.test(k+' '+i.path))||[])[1];
 return{z,spine,toc,cls,total:spine.reduce((a,s)=>a+s.size,0),title:tEl?(tEl.textContent||'').trim():'',lang:((all(opf,'language')[0]||{}).textContent||'').trim(),author:aEl?(aEl.textContent||'').replace(/\s+/g,' ').trim():'',cover:cov&&/^image\//.test(cov.type)&&z.find(cov.path)?z.find(cov.path):null}}
/* attach a file to a book */
const EBMSG={pdfscan:'This PDF is made of pictures (a scan), so there is no text to read.',pdfnet:'The PDF reader couldn’t be downloaded. Check your connection and try again.',pdfpw:'This PDF is locked with a password.',notepub:'Only EPUB and PDF files can be opened.',drm:'This e-book is protected by its store (DRM) and can’t be opened here.',old:'Your browser is too old to open e-books.',big:'That file is too big (over 150 MB).'};
let ebPending=null;
async function ebAttach(id,buf,name,pdf,quiet){
 try{if(buf.byteLength>150*1048576)throw 'big';await epubOpen(buf)}catch(e){toast(L(EBMSG[e]||'This file couldn’t be read. It may be damaged.'));return false}
 await EB.put('files',{id,name:String(name||'book.epub').slice(0,120),size:buf.byteLength,buf,t:Date.now()});
 try{await EB.tx('pos','readwrite',s=>s.delete(id))}catch(e){EB.mem.delete('pos'+id)}
 EBIDX[id]={name:String(name||'book.epub').slice(0,120),size:buf.byteLength};if(pdf)EBIDX[id].pdf=1;ebSaveIdx();
 try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
 if(!quiet){if(cur&&cur.id===id)ebDraw();toast(L('E-book added. Tap Read to open it.'))}return true}
/* adding a new book straight from its file: the title, author and cover come from the file, and it is attached when the book is saved */
async function ebFromFile(buf,name){
 const box=$('ebres'),say=t=>box.replaceChildren(el('small','',t)),bad=e=>{box.replaceChildren();toast(L(EBMSG[e]||'This file couldn’t be read. It may be damaged.'))};let pdf=false,bk;
 if(isPdf(buf)){pdf=true;say(L('Changing the PDF into text… page {p} of {n}',{p:1,n:'…'}));try{buf=await pdfToEpub(buf,name,(p,n)=>{if(p%3===0||p===n)say(L('Changing the PDF into text… page {p} of {n}',{p,n}))})}catch(e){bad(e);return}}
 try{if(buf.byteLength>150*1048576)throw 'big';bk=await epubOpen(buf)}catch(e){bad(e);return}
 if(cur||!$('ov').classList.contains('on'))return;ebPending={buf,name,pdf};
 if(bk.title&&!$('title').value.trim())$('title').value=bk.title.slice(0,100);if(bk.author&&!$('author').value.trim())$('author').value=bk.author.slice(0,80);if(!$('format').value)$('format').value='ebook';
 if(bk.cover&&!draft.cover){try{const by=await bk.z.read(bk.cover);draft.cover=await shrink(new Blob([by],{type:RD_MIME[(bk.cover.split('.').pop()||'').toLowerCase()]||'image/jpeg'}),520);if(!draft.spine&&!draft.colorSet){const c=await avgColor(draft.cover);if(c)$('color').value=c}}catch(e){}}
 try{lastQ=$('title').value.trim()}catch(e){}try{pv()}catch(e){}ebDraw()}
function ebDraw(){
 const box=$('ebookL');if(!box)return;box.hidden=false;
 const row=$('ebrow');row.replaceChildren();$('ebres').replaceChildren();
 const btn=(t,fn,c)=>{const b=el('button','qbtn'+(c?' '+c:''),t);b.type='button';b.onclick=fn;row.append(b);return b};
 if(!cur){if(ebPending){btn(L('Remove the file'),()=>{ebPending=null;ebDraw()});$('ebnote').textContent=ebPending.name+' — '+L('It will be attached when you save the book.')}
  else{btn(L('＋ Add from an e-book file (EPUB or PDF)'),()=>{$('ebin').value='';$('ebin').click()});$('ebnote').textContent=''}return}
 const id=cur.id,f=EBIDX[id];
 if(f){btn(L('📖 Read'),()=>rdOpen(id),'go');
  btn(L('Remove the file'),async()=>{if(!(await ask(L('Remove the e-book file from this phone? The book stays on your shelf.'),L('Remove'))))return;await EB.del(id);delete EBIDX[id];ebSaveIdx();ebDraw()});
  btn(L('Save a copy of the file'),()=>ebSaveCopy(id));
  $('ebnote').textContent=f.name+' · '+(f.size/1048576).toFixed(1)+' MB — '+(f.pdf?L('Changed from a PDF: pictures and page layout are left out.')+' ':'')+L('The file stays on this phone only. It is not included in backups.')}
 else{btn(L('＋ Add the e-book file (EPUB or PDF)'),()=>{$('ebin').value='';$('ebin').click()});btn(L('🔎 Find a free copy'),()=>ebFind(id));
  if(window.EB_SAMPLE)btn('Sample e-book (preview only)',()=>{const s=atob(window.EB_SAMPLE),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);ebAttach(id,u.buffer,'sample.epub')});
  $('ebnote').textContent=L('The file stays on this phone only. It is not included in backups.')}}
$('ebin').onchange=async e=>{const f=e.target.files&&e.target.files[0],id=cur&&cur.id;if(!f)return;
 if(f.size>150*1048576){toast(L(EBMSG.big));return}
 let buf;try{buf=await f.arrayBuffer()}catch(er){toast(L('This file couldn’t be read. It may be damaged.'));return}if(id)ebAdd(id,buf,f.name);else ebFromFile(buf,f.name)};

/* ---------- a PDF is changed into a simple EPUB: its text is pulled out page by page and put back together as paragraphs ---------- */
const PDFJS='https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/legacy/build/';let pdfLib=null,pdfTry=0;
const isPdf=buf=>{const u=new Uint8Array(buf,0,Math.min(1024,buf.byteLength));for(let i=0;i+4<u.length;i++)if(u[i]===37&&u[i+1]===80&&u[i+2]===68&&u[i+3]===70&&u[i+4]===45)return true;return false};
function zipStore(files){
 const T=zipStore.T||(zipStore.T=(()=>{const t=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[i]=c>>>0}return t})()),
  crc=u=>{let c=-1;for(let i=0;i<u.length;i++)c=T[(c^u[i])&255]^(c>>>8);return(c^-1)>>>0},enc=new TextEncoder(),parts=[],cd=[];let off=0;
 for(const [name,data] of files){const nm=enc.encode(name),u=typeof data==='string'?enc.encode(data):data,c=crc(u),h=new DataView(new ArrayBuffer(30)),d=new DataView(new ArrayBuffer(46));
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint32(14,c,true);h.setUint32(18,u.length,true);h.setUint32(22,u.length,true);h.setUint16(26,nm.length,true);
  d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,c,true);d.setUint32(20,u.length,true);d.setUint32(24,u.length,true);d.setUint16(28,nm.length,true);d.setUint32(42,off,true);
  parts.push(h.buffer,nm,u);cd.push(d.buffer,nm);off+=30+nm.length+u.length}
 const cdLen=cd.reduce((a,x)=>a+x.byteLength,0),e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cdLen,true);e.setUint32(16,off,true);
 return new Blob([...parts,...cd,e.buffer]).arrayBuffer()}
/* tidy what comes out of a PDF: private symbols no font can show are dropped, joined letters (ﬁ ﬂ) are split back, and an accent stored beside its letter is put back on it */
const PDF_ACC={'ˆ':'\u0302','¨':'\u0308','´':'\u0301','`':'\u0300','˜':'\u0303','ˇ':'\u030C','¸':'\u0327','˚':'\u030A'},PDF_LIG={'ﬀ':'ff','ﬁ':'fi','ﬂ':'fl','ﬃ':'ffi','ﬄ':'ffl','ﬅ':'st','ﬆ':'st'};
function pdfTidy(t){return t.replace(/[\uE000-\uF8FF\uFFFD-\uFFFF]|[\u{F0000}-\u{10FFFF}]/gu,'').replace(/[ﬀ-ﬆ]/g,c=>PDF_LIG[c]||c)
  .replace(/(?<=\p{L})([ˆ¨´`˜ˇ¸˚])(\p{L})/gu,(m,a,l)=>((l==='ı'?'i':l==='ȷ'?'j':l)+PDF_ACC[a]).normalize('NFC'))}
async function pdfToEpub(buf,name,onProg){
 if(!pdfLib){try{pdfLib=await new Function('u','return import(u)')(PDFJS+'pdf.min.mjs'+(pdfTry++?'?r='+pdfTry:''));pdfLib.GlobalWorkerOptions.workerSrc=PDFJS+'pdf.worker.min.mjs'}catch(e){pdfLib=null;throw 'pdfnet'}}
 let doc;try{doc=await pdfLib.getDocument({data:new Uint8Array(buf.slice(0))}).promise}catch(e){throw e&&e.name==='PasswordException'?'pdfpw':'bad'}
 const n=doc.numPages,pages=[];let chars=0;
 for(let i=1;i<=n;i++){const pg=await doc.getPage(i),tc=await pg.getTextContent(),lines=[];let ln=null;
  for(const it of tc.items){if(typeof it.str!=='string')continue;const x=it.transform[4],y=it.transform[5],h=it.height||Math.abs(it.transform[3])||10;
   if(it.str){
    if(ln&&Math.abs(y-ln.y)<Math.max(h,ln.h)*.5){const g=x-ln.x2;if(g>h*2.5&&it.str.trim()){ln.t+='\u2003\u2003';ln.tab=1}ln.t+=(g>h*.18&&!/\s$/.test(ln.t)&&!/^\s/.test(it.str)?' ':'')+it.str;ln.x2=Math.max(ln.x2,x+(it.width||0));if(it.str.trim())ln.h=Math.max(ln.h,h)}
    else{ln={t:it.str,x,x2:x+(it.width||0),y,h};lines.push(ln)}}
   if(it.hasEOL)ln=null}
  const ok=lines.map(l=>(l.t=pdfTidy(l.t).replace(/[ \t\r\n\u00A0]+/g,' ').replace(/ ?\u2003[\u2003 ]*/g,'\u2003\u2003').replace(/^\u2003+|\u2003+$/g,'').trim(),l)).filter(l=>l.t);ok.forEach(l=>chars+=l.t.length);pages.push(ok);try{pg.cleanup()}catch(e){}
  if(onProg)onProg(i,n)}
 if(chars<n*25){try{doc.destroy()}catch(e){}throw 'pdfscan'}
 /* page numbers and titles repeated at the top or bottom of every page are taken out */
 const key=t=>t.toLowerCase().replace(/\d+/g,'#').trim(),cnt=new Map(),ends=p=>{if(p.length<3)return[];let a=p[0],b=p[0];p.forEach(l=>{if(l.y>a.y)a=l;if(l.y<b.y)b=l});return a===b?[a]:[a,b]};
 pages.forEach(p=>ends(p).forEach(l=>cnt.set(key(l.t),(cnt.get(key(l.t))||0)+1)));
 const need=Math.max(3,Math.ceil(n*.15));
 pages.forEach((p,i)=>{const drop=ends(p).filter(l=>/^[^\p{L}]*\d+[^\p{L}]*$/u.test(l.t)||(n>=3&&cnt.get(key(l.t))>=need&&l.t.length<90));pages[i]=p.filter(l=>!drop.includes(l))});
 /* the usual letter size, to tell headings from text */
 const hs=new Map();pages.forEach(p=>p.forEach(l=>{const k=Math.round(l.h*2)/2;hs.set(k,(hs.get(k)||0)+l.t.length)}));
 const bodyH=[...hs.entries()].sort((a,b)=>b[1]-a[1])[0][0],isHead=l=>l.h>bodyH*1.18&&l.t.length<140,endS=t=>/[.!?…:;»”"’)\]]$/.test(t.trim());
 const join=(a,b)=>/[­‐-]$/.test(a)&&/^\p{Ll}/u.test(b)?a.slice(0,-1)+b:a+' '+b;
 /* chapters: the PDF's own table of contents when it has one, otherwise ten pages at a time */
 let marks=[];
 try{let ol=await doc.getOutline()||[];if(ol.length===1&&ol[0].items&&ol[0].items.length>1)ol=ol[0].items;
  for(const it of ol.slice(0,400)){let d=it.dest;if(typeof d==='string')d=await doc.getDestination(d);if(!Array.isArray(d))continue;
   const pi=typeof d[0]==='number'?d[0]:await doc.getPageIndex(d[0]);if(pi>=0&&pi<n&&it.title)marks.push({label:String(it.title).replace(/\s+/g,' ').trim().slice(0,120),page:pi})}}catch(e){marks=[]}
 marks.sort((a,b)=>a.page-b.page);marks=marks.filter((m,i)=>!i||m.page!==marks[i-1].page);
 let meta={};try{meta=(await doc.getMetadata()).info||{}}catch(e){}
 const title=String(meta.Title||'').trim()||String(name||'').replace(/\.pdf$/i,'')||'PDF';
 if(marks.length>=2){if(marks[0].page>0)marks.unshift({label:title.slice(0,120),page:0})}
 else{/* no table of contents: a page that opens with a title in bigger letters starts a chapter */
  marks=[];pages.forEach((p,i)=>{if(p.length>1&&isHead(p[0]))marks.push({label:(p[0].t+(isHead(p[1])&&p.length>2?' — '+p[1].t:'')).slice(0,120),page:i})});
  if(marks.length>=2&&marks.length<=Math.max(2,n/2)){if(marks[0].page>0)marks.unshift({label:title.slice(0,120),page:0})}else marks=[]}
 if(!marks.length){for(let a=0;a<n;a+=10)marks.push({label:L('Pages {a}–{b}',{a:a+1,b:Math.min(n,a+10)}),page:a});var byTen=true}
 /* where the text usually ends on the right: a line that stops well before it, when the next word would have fitted, was ended on purpose (a list, a title, the end of a paragraph) */
 const p90=p=>{const a=p.map(l=>l.x2).sort((x,y)=>x-y);return a.length?a[Math.floor((a.length-1)*.9)]:0},rs=pages.filter(p=>p.length>5).map(p90).sort((x,y)=>x-y),docRight=rs.length?rs[rs.length>>1]:0;
 const BUL=/^([•‣◦▪●■▶►–—*-]\s|\(?\d{1,3}[.)]\s)/,room=(a,b,right)=>{const cw=(b.x2-b.x)/Math.max(1,b.t.length),fw=(b.t.split(' ')[0]||'').length;return a.x2+cw*(fw+1.5)<right-(right-a.x)*.08};
 const starts=new Set(marks.map(m=>m.page)),chapters=marks.map(m=>({label:m.label,paras:[]}));let ci=0,last=null,tail=null,tailEnded=null;
 pages.forEach((p,pi)=>{while(ci+1<marks.length&&marks[ci+1].page<=pi)ci++;
  const xs=new Map();p.forEach(l=>{const k=Math.round(l.x);xs.set(k,(xs.get(k)||0)+1)});const left=xs.size?[...xs.entries()].sort((a,b)=>b[1]-a[1])[0][0]:0,right=Math.max(p90(p),docRight);
  /* text whose lines all stop at different places (not squared off on the right) can't be judged this way, so its long lines are left alone */
  const long=l=>l.x2-left>(right-left)*.55;let lp=0,rp=0;for(let i=1;i<p.length;i++)if(long(p[i-1])){lp++;if(room(p[i-1],p[i],right))rp++}const ragged=lp>=4&&rp/lp>.3,ended=(a,b,r)=>room(a,b,r)&&!(ragged&&long(a));
  const gaps=[];for(let i=1;i<p.length;i++){const g=p[i-1].y-p[i].y;if(g>0)gaps.push(g)}gaps.sort((a,b)=>a-b);const gap=gaps.length?gaps[gaps.length>>1]:bodyH*1.2;
  p.forEach((l,i)=>{const pr=i?p[i-1]:null,head=isHead(l);let fresh;
   if(!pr)fresh=!last||last.head||head||endS(last.t)||(!byTen&&starts.has(pi))||BUL.test(l.t)||l.tab||(tail&&(tail.tab||tailEnded(l)));
   else{const g=pr.y-l.y;fresh=g<0||g>gap*1.6||head!==isHead(pr)||(l.x>left+bodyH*.8&&pr.x<=left+bodyH*.8)||(pr.x2<right-(right-left)*.12&&endS(pr.t))||BUL.test(l.t)||l.tab||pr.tab||ended(pr,l,right)}
   if(fresh||!last){last={t:l.t,head};chapters[pr||!last?ci:ci].paras.push(last)}else last.t=join(last.t,l.t)});if(p.length){const t0=p[p.length-1],r0=right,rg=ragged&&long(t0);tail=t0;tailEnded=l=>!rg&&room(t0,l,r0)}});
 /* several bullet points written on one line each get their own line */
 chapters.forEach(c=>{c.paras=c.paras.flatMap(q=>q.head?[q]:q.t.split(/\s+(?=[•‣◦▪●■]\s)/).map(t=>({t,head:false})))});
 try{doc.destroy()}catch(e){}
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,''),chs=chapters.filter(c=>c.paras.length);
 const files=[['mimetype','application/epub+zip'],['META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>']];
 chs.forEach((c,i)=>files.push([`c${i+1}.xhtml`,`<?xml version="1.0" encoding="utf-8"?>\x3chtml xmlns="http://www.w3.org/1999/xhtml">\x3chead>\x3ctitle>${esc(c.label)}\x3c/title>\x3c/head>\x3cbody>`+c.paras.map(p=>p.head?`<h2>${esc(p.t)}</h2>`:`<p>${esc(p.t)}</p>`).join('\n')+'\x3c/body>\x3c/html>']));
 files.push(['nav.xhtml','<?xml version="1.0" encoding="utf-8"?>\x3chtml xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\x3chead>\x3ctitle>toc\x3c/title>\x3c/head>\x3cbody><nav epub:type="toc"><ol>'+chs.map((c,i)=>`<li><a href="c${i+1}.xhtml">${esc(c.label)}</a></li>`).join('')+'</ol></nav>\x3c/body>\x3c/html>']);
 files.push(['content.opf',`<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title>${meta.Author?`<dc:creator>${esc(String(meta.Author).slice(0,120))}</dc:creator>`:''}</metadata><manifest>`+chs.map((c,i)=>`<item id="c${i+1}" href="c${i+1}.xhtml" media-type="application/xhtml+xml"/>`).join('')+'<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine>'+chs.map((c,i)=>`<itemref idref="c${i+1}"/>`).join('')+'</spine></package>']);
 return zipStore(files)}
/* any file picked or downloaded comes through here */
async function ebAdd(id,buf,name){
 if(!isPdf(buf))return ebAttach(id,buf,name);
 const box=$('ebres'),say=t=>{if(cur&&cur.id===id)box.replaceChildren(el('small','',t))};say(L('Changing the PDF into text… page {p} of {n}',{p:1,n:'…'}));
 let out;try{out=await pdfToEpub(buf,name,(p,n)=>{if(p%3===0||p===n)say(L('Changing the PDF into text… page {p} of {n}',{p,n}))})}catch(e){if(cur&&cur.id===id)box.replaceChildren();toast(L(EBMSG[e]||'This file couldn’t be read. It may be damaged.'));return false}
 return ebAttach(id,out,name,true)}
/* free copies: Project Gutenberg's catalogue of public-domain books */
async function ebFind(id){
 const box=$('ebres'),q=[$('title').value.trim(),($('author').value.trim().split(/\s+/).pop()||'')].filter(Boolean).join(' ');box.replaceChildren(el('small','',L('Searching…')));
 /* the free-book catalogue can be slow to answer: wait longer and try twice before giving up, then offer to search on Project Gutenberg's own site */
 let list,res=null;for(let a=0;a<2&&!res;a++){try{res=await tfetch('https://gutendex.com/books/?search='+encodeURIComponent(q),25000)}catch(e){if(navigator.onLine===false)break}}
 if(!res){box.replaceChildren(el('small','',navigator.onLine===false?L('You’re offline.'):L('The free-book catalogue didn’t answer. Try again in a moment, or search on the Project Gutenberg site.')));const gb=el('button','',L('Search on Project Gutenberg ↗'));gb.type='button';gb.onclick=()=>{try{window.open('https://www.gutenberg.org/ebooks/search/?query='+encodeURIComponent(q),'_blank','noopener')}catch(e){}};box.append(gb);return}
 list=(res.results||[]).filter(r=>r.formats&&r.formats['application/epub+zip']).slice(0,6);
 if(!list.length){box.replaceChildren(el('small','',L('No free copy found. Only books old enough to be in the public domain are available.')));return}
 box.replaceChildren(el('small','',L('Free public-domain books (Project Gutenberg):')));
 list.forEach(r=>{const b=el('button','',r.title),url=String(r.formats['application/epub+zip']).replace(/^http:/,'https:');b.type='button';
  b.append(el('small','',[(r.authors||[]).map(a=>String(a.name||'').split(', ').reverse().join(' ')).join(', '),(r.languages||[]).join(', ').toUpperCase()].filter(Boolean).join(' · ')));
  b.onclick=async()=>{box.replaceChildren(el('small','',L('Downloading…')));
   try{const c=new AbortController(),t=setTimeout(()=>c.abort(),60000),resp=await fetch(url,{signal:c.signal});if(!resp.ok)throw 0;const buf=await resp.arrayBuffer();clearTimeout(t);
    if(!(await ebAttach(id,buf,r.title+'.epub')))box.replaceChildren()}
   catch(e){try{window.open(url,'_blank','noopener')}catch(e2){}box.replaceChildren(el('small','',L('The download opened in your browser instead. Once it’s saved, come back and tap “Add the e-book file”.')))}};
  box.append(b)})}
{const om=openModal;openModal=function(b,src,status){om(b,src,status);ebPending=null;try{ebDraw()}catch(e){}}}
{const sb=saveBook;saveBook=function(){const pend=ebPending,wasNew=!cur,ids=new Set(books.map(b=>b.id));sb();if(pend&&wasNew){const nb=books.find(b=>!ids.has(b.id));if(nb){ebPending=null;ebAttach(nb.id,pend.buf,pend.name,pend.pdf,true)}}}}
/* deleting a book also deletes its file */
$('del').addEventListener('click',()=>{const id=cur&&cur.id;if(id)setTimeout(()=>{if(!books.some(b=>b.id===id)&&EBIDX[id]){EB.del(id);delete EBIDX[id];ebSaveIdx()}},300)},true);

/* ---------- the reader ---------- */
let RD=null;const RDK='bookshelf-reader';
let rdSet={fs:18,th:'light',ff:'serif',mode:'scroll'};try{rdSet=Object.assign(rdSet,JSON.parse(localStorage.getItem(RDK)||'{}'))}catch(e){}
const RD_OK=new Set('p div span h1 h2 h3 h4 h5 h6 em i b strong u s small sup sub br hr blockquote ul ol li dl dt dd table thead tbody tfoot tr td th caption pre code cite q abbr figure figcaption section article aside header footer a'.split(' ')),
 RD_DROP=new Set('script style link meta title head iframe object embed form input button select textarea audio video canvas noscript template math'.split(' ')),
 RD_MIME={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',avif:'image/avif'};
const rdPaged=()=>rdSet.mode==='page';
/* where you are in the chapter, as a share of it (the top of the screen, or the page) */
function rdFr(){const body=$('rdbody');return rdPaged()?(RD.pg||0)/(RD.pgN||1):(body.scrollHeight?body.scrollTop/body.scrollHeight:0)}
function rdLayout(){const r=$('rdr'),body=$('rdbody'),text=$('rdtext');r.style.setProperty('--rpw',body.clientWidth+'px');r.style.setProperty('--rph',body.clientHeight+'px');
 if(rdPaged()){body.scrollTop=0;RD.pgN=Math.max(1,Math.ceil((text.scrollWidth-1)/Math.max(1,body.clientWidth)))}else{text.style.transform='';RD.pgN=1;RD.pg=0}}
function rdPage(n,instant){const text=$('rdtext');RD.pg=Math.max(0,Math.min(RD.pgN-1,n));if(instant){text.style.transition='none';text.style.transform=`translateX(${-RD.pg*$('rdbody').clientWidth}px)`;void text.offsetWidth;text.style.transition=''}else text.style.transform=`translateX(${-RD.pg*$('rdbody').clientWidth}px)`}
function rdPlace(fr){if(rdPaged())rdPage(Math.floor((fr||0)*RD.pgN+1e-6),true);else{const body=$('rdbody');body.scrollTop=Math.round((fr||0)*body.scrollHeight)}}
function rdGoRect(q,pad){const body=$('rdbody');if(rdPaged()){const t=$('rdtext').getBoundingClientRect();rdPage(Math.floor((q.left-t.left+1)/Math.max(1,body.clientWidth)),true)}else body.scrollTop+=q.top-body.getBoundingClientRect().top-(pad||0)}
function rdTurn(d){if(!RD||!rdPaged())return;const n=RD.pg+d;if(n<0){if(RD.ch>0)rdShow(RD.ch-1,.9999)}else if(n>=RD.pgN){if(RD.ch<RD.bk.spine.length-1)rdShow(RD.ch+1,0)}else{rdPage(n);rdSave()}}
function rdApplySet(){const r=$('rdr');if(!r)return;const live=RD&&RD.ch>=0,fr=live?rdFr():0;
 r.dataset.th=rdSet.th;r.dataset.mode=rdSet.mode==='page'?'page':'scroll';r.style.setProperty('--rfs',rdSet.fs+'px');r.style.setProperty('--rff',rdSet.ff==='sans'?'system-ui,sans-serif':"Georgia,'Times New Roman',serif");
 r.querySelectorAll('[data-th]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.th===rdSet.th));r.querySelectorAll('[data-ff]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.ff===rdSet.ff));r.querySelectorAll('[data-md]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.md===r.dataset.mode));
 try{localStorage.setItem(RDK,JSON.stringify(rdSet))}catch(e){}
 if(live){rdLayout();rdPlace(fr);rdSave()}}
async function rdWake(){try{if(RD&&navigator.wakeLock&&document.visibilityState==='visible')RD.wl=await navigator.wakeLock.request('screen')}catch(e){}}
async function rdOpen(id){
 if(RD)return;const rec=await EB.get('files',id);if(!rec){delete EBIDX[id];ebSaveIdx();ebDraw();toast(L('This file couldn’t be read. It may be damaged.'));return}
 let bk;try{bk=await epubOpen(rec.buf)}catch(e){toast(L(EBMSG[e]||'This file couldn’t be read. It may be damaged.'));return}
 const pos=(await EB.get('pos',id))||{ch:0,fr:0},b=books.find(x=>x.id===id);
 RD={id,bk,ch:-1,urls:[],t0:Date.now(),vis:Date.now(),ms:0,pct:pos.pct||0,tok:0,ftok:0,pg:0,pgN:1,txt:[],title:(b&&b.title)||bk.title||''};
 const r=el('div');r.id='rdr';r.setAttribute('role','dialog');r.setAttribute('aria-modal','true');r.setAttribute('aria-label',RD.title);
 const B=(t,lab,fn,c)=>{const x=el('button','rb'+(c?' '+c:''),t);x.type='button';if(lab)x.setAttribute('aria-label',lab);x.onclick=fn;return x};
 const top=el('div','rdtop'),set=el('div','rdset'),mid=el('div','rdmid'),bar=el('div','rdbar'),bot=el('div','rdbot'),ttl=el('b','',RD.title);ttl.id='rdttl';
 top.append(B('✕',L('Close'),rdClose),ttl,B('🔍',L('Find in the book'),()=>rdFind()),B('☰',L('Contents'),()=>rdToc()),B('Aa',L('Text settings'),()=>{set.hidden=!set.hidden;if(RD&&RD.ch>=0){const fr=rdFr();rdLayout();rdPlace(fr)}}));
 set.hidden=true;
 set.append(B('A−',L('Smaller text'),()=>{rdSet.fs=Math.max(13,rdSet.fs-1);rdApplySet()}),B('A+',L('Bigger text'),()=>{rdSet.fs=Math.min(30,rdSet.fs+1);rdApplySet()}),el('span','sep'));
 [['light','#fbf6ea','Light'],['sepia','#f1e3c6','Sepia'],['dark','#14110e','Dark']].forEach(([k,c,n])=>{const x=B('',L(n),()=>{rdSet.th=k;rdApplySet()},'sw');x.dataset.th=k;x.style.background=c;set.append(x)});
 set.append(el('span','sep'));
 [['serif',"Georgia,serif"],['sans','system-ui,sans-serif']].forEach(([k,f])=>{const x=B('Aa',k,()=>{rdSet.ff=k;rdApplySet()});x.dataset.ff=k;x.style.fontFamily=f;set.append(x)});
 set.append(el('span','sep'));
 [['scroll','↕','Scroll'],['page','◫','Pages']].forEach(([k,t,n])=>{const x=B(t,L(n),()=>{rdSet.mode=k;rdApplySet()});x.dataset.md=k;set.append(x)});
 const body=el('div','rdbody'),text=el('div');text.id='rdtext';body.id='rdbody';body.tabIndex=0;body.append(text);
 const toc=el('div','rdtoc');toc.id='rdtoc';toc.hidden=true;const find=el('div','rdtoc');find.id='rdfind';find.hidden=true;mid.append(body,toc,find);
 bar.append(el('i'));const pv=B('‹',L('Previous chapter'),()=>rdShow(RD.ch-1,0)),nx=B('›',L('Next chapter'),()=>rdShow(RD.ch+1,0)),pr=el('span','rdprog'),qb=B(L('❝ Save as quote'),'',rdQuote,'q');pv.id='rdprev';nx.id='rdnextb';pr.id='rdprog';qb.id='rdqb';qb.hidden=true;
 bot.append(pv,pr,qb,nx);r.append(top,set,mid,bar,bot);document.body.append(r);rdApplySet();
 let st0=0;body.addEventListener('scroll',()=>{if(rdPaged()){if(body.scrollTop||body.scrollLeft){body.scrollTop=0;body.scrollLeft=0}return}if(st0)return;st0=setTimeout(()=>{st0=0;rdSave()},350)},{passive:true});
 text.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[data-go]');if(!a)return;e.preventDefault();e.stopPropagation();const h=a.dataset.go,frag=h.split('#')[1]||'';
  if(h.startsWith('#')||!h.split('#')[0]){rdFrag(frag);rdSave();return}
  const i=RD.bk.spine.findIndex(s=>s.path.toLowerCase()===ebPath(RD.bk.spine[RD.ch].path,h).toLowerCase());if(i>=0)rdShow(i,0,frag)});
 /* page mode: tap the left or right third of the screen, or swipe, to turn the page */
 const noSel=()=>{const s=getSelection();return !s||s.isCollapsed};
 body.addEventListener('click',e=>{if(!rdPaged()||(e.target.closest&&e.target.closest('a,button'))||!noSel())return;const x=(e.clientX-body.getBoundingClientRect().left)/body.clientWidth;if(x<.33)rdTurn(-1);else if(x>.67)rdTurn(1)});
 let tx=0,ty=0;body.addEventListener('touchstart',e=>{const t=e.touches[0];tx=t.clientX;ty=t.clientY},{passive:true});
 body.addEventListener('touchend',e=>{if(!rdPaged()||!noSel())return;const t=e.changedTouches[0],dx=t.clientX-tx,dy=t.clientY-ty;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5)rdTurn(dx<0?1:-1)},{passive:true});
 await rdShow(Math.max(0,Math.min(bk.spine.length-1,pos.ch||0)),pos.fr||0);try{body.focus({preventScroll:true})}catch(e){}rdWake();try{hSync()}catch(e){}}
function rdFrag(frag){if(!frag)return;let t=null;try{t=document.getElementById('rdx-'+decodeURIComponent(frag))}catch(e){}if(t)rdGoRect(t.getBoundingClientRect(),8)}
/* a picture with nothing on it (all white, or see-through) is left out instead of leaving a big empty gap in the text */
function rdBlank(im){try{const w=im.naturalWidth,h=im.naturalHeight;if(!w||!h)return false;const S=32,c=document.createElement('canvas');c.width=S;c.height=S;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0,S,S);const d=x.getImageData(0,0,S,S).data;
 let ink=0;for(let i=0;i<d.length;i+=4){const a=d[i+3];if(a<16)continue;if(Math.min(d[i],d[i+1],d[i+2])<235)ink++}return ink<3}catch(e){return false}}
function rdClean(n,out,base,imgs){
 for(const c of n.childNodes){
  if(c.nodeType===3){out.append(c.nodeValue);continue}
  if(c.nodeType!==1)continue;const t=(c.localName||'').toLowerCase();if(RD_DROP.has(t))continue;
  if(t==='img'||t==='image'){const src=c.getAttribute('src')||c.getAttribute('xlink:href')||c.getAttributeNS('http://www.w3.org/1999/xlink','href')||c.getAttribute('href');
   if(src&&!/^[a-z][a-z0-9+.-]*:/i.test(src)){const im=document.createElement('img');im.alt=c.getAttribute('alt')||'';im.decoding='async';imgs.push([im,ebPath(base,src)]);out.append(im)}continue}
  if(t==='svg'){rdClean(c,out,base,imgs);continue}
  if(!RD_OK.has(t)){rdClean(c,out,base,imgs);continue}
  const e=document.createElement(t),id=c.getAttribute('id');if(id)e.id='rdx-'+id;
  const k=[];(c.getAttribute('class')||'').split(/\s+/).forEach(x=>{const f=RD.bk.cls.get(x);if(f)k.push(...f)});
  const sty=(c.getAttribute('style')||'').toLowerCase();if(sty){if(/font-style\s*:\s*italic/.test(sty))k.push('rd-i');if(/font-weight\s*:\s*(bold|[6-9]00)/.test(sty))k.push('rd-b');if(/text-align\s*:\s*center/.test(sty))k.push('rd-c');if(/text-align\s*:\s*right/.test(sty))k.push('rd-r')}
  if(k.length)e.className=[...new Set(k)].join(' ');
  if(t==='a'){const h=c.getAttribute('href')||'';if(/^(https?:|mailto:)/i.test(h)){e.href=h;e.target='_blank';e.rel='noopener noreferrer'}else if(h&&!/^[a-z][a-z0-9+.-]*:/i.test(h)){e.href='#';e.dataset.go=h}}
  if(t==='td'||t==='th'){const cs=+c.getAttribute('colspan'),rs=+c.getAttribute('rowspan');if(cs>1)e.colSpan=cs;if(rs>1)e.rowSpan=rs}
  rdClean(c,e,base,imgs);out.append(e)}}
function rdSrc(raw){let doc=new DOMParser().parseFromString(raw,'application/xhtml+xml');if(doc.getElementsByTagName('parsererror').length||!doc.getElementsByTagNameNS('*','body')[0])doc=new DOMParser().parseFromString(raw,'text/html');
 return doc.getElementsByTagNameNS('*','body')[0]||doc.body||doc.documentElement}
async function rdShow(i,fr,frag){
 if(!RD||i<0||i>=RD.bk.spine.length)return;const tok=++RD.tok,sp=RD.bk.spine[i],text=$('rdtext');
 let raw='';try{raw=new TextDecoder().decode(await RD.bk.z.read(sp.path))}catch(e){}
 if(!RD||tok!==RD.tok)return;
 const frg=document.createDocumentFragment(),imgs=[];
 RD.ch=i;rdClean(rdSrc(raw),frg,sp.path,imgs);
 /* pictures are taken out of the file and sized before the page is shown, so the place you stopped at doesn't shift */
 const urls=[];await Promise.all(imgs.map(async([im,p])=>{try{const by=await RD.bk.z.read(p);if(!by)return;const u=URL.createObjectURL(new Blob([by],{type:RD_MIME[(p.split('.').pop()||'').toLowerCase()]||'image/jpeg'}));urls.push(u);im.src=u;await im.decode().catch(()=>{});if(!im.complete)await new Promise(r=>{im.onload=im.onerror=r;setTimeout(r,3000)});if(rdBlank(im))im.remove()}catch(e){}}));
 if(!RD||tok!==RD.tok){urls.forEach(u=>URL.revokeObjectURL(u));return}
 RD.urls.forEach(u=>URL.revokeObjectURL(u));RD.urls=urls;try{if(window.CSS&&CSS.highlights)CSS.highlights.delete('rdhit')}catch(e){}text.replaceChildren(frg);
 if(i<RD.bk.spine.length-1){const nb=el('button','rdnext',L('Next chapter')+' ›');nb.type='button';nb.onclick=()=>rdShow(i+1,0);text.append(nb)}
 $('rdtoc').hidden=true;$('rdprev').disabled=i===0;$('rdnextb').disabled=i===RD.bk.spine.length-1;
 const cur0=[...RD.bk.toc].reverse().find(t=>t.ch<=i);$('rdttl').textContent=(cur0&&cur0.label)||RD.title;
 $('rdbody').scrollTop=0;rdLayout();if(frag){rdPlace(0);rdFrag(frag)}else rdPlace(fr||0);rdSave()}
function rdSave(){
 if(!RD||RD.ch<0)return;const body=$('rdbody'),bk=RD.bk,last=RD.ch===bk.spine.length-1;let p;
 if(rdPaged())p=RD.pgN>1?RD.pg/(RD.pgN-1):(last?1:0);else{const max=Math.max(0,body.scrollHeight-body.clientHeight);p=max?Math.min(1,body.scrollTop/max):(last?1:0)}
 let before=0;for(let i=0;i<RD.ch;i++)before+=bk.spine[i].size;
 RD.pct=Math.min(1,(before+p*bk.spine[RD.ch].size)/bk.total);
 $('rdprog').textContent=Math.round(RD.pct*100)+'% · '+(RD.ch+1)+' / '+bk.spine.length;$('rdr').querySelector('.rdbar i').style.width=(RD.pct*100).toFixed(1)+'%';
 EB.put('pos',{id:RD.id,ch:RD.ch,fr:rdFr(),pct:RD.pct,t:Date.now()})}
function rdToc(){const box=$('rdtoc');$('rdfind').hidden=true;if(!box.hidden){box.hidden=true;return}box.replaceChildren(el('h3','',L('Contents')));
 const cur0=[...RD.bk.toc].reverse().find(t=>t.ch<=RD.ch);
 RD.bk.toc.forEach(t=>{const b=el('button',t===cur0?'on':'',t.label);b.type='button';b.onclick=()=>rdShow(t.ch,0,t.frag);box.append(b)});box.hidden=false;const on=box.querySelector('.on');if(on)on.scrollIntoView({block:'center'})}
/* find a word anywhere in the book (capital letters and accents don't matter) */
const rdNorm=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
async function rdChText(i){if(RD.txt[i])return RD.txt[i];let raw='';try{raw=new TextDecoder().decode(await RD.bk.z.read(RD.bk.spine[i].path))}catch(e){}
 const d=document.createElement('div');rdClean(rdSrc(raw),d,RD.bk.spine[i].path,[]);const t=d.textContent;return RD.txt[i]={t,n:rdNorm(t)}}
function rdFind(){const box=$('rdfind');$('rdtoc').hidden=true;if(!box.hidden){box.hidden=true;return}box.hidden=false;
 if(!box.firstChild){const inp=el('input');inp.type='search';inp.id='rdq';inp.placeholder=L('Word or phrase');inp.setAttribute('aria-label',L('Find in the book'));const out=el('div');out.id='rdhits';box.append(el('h3','',L('Find in the book')),inp,out);
  let t=0;inp.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>rdFindRun(inp.value),500)});inp.addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(t);rdFindRun(inp.value);inp.blur()}})}
 setTimeout(()=>{const q=$('rdq');if(q)q.focus()},60)}
async function rdFindRun(q0){
 const out=$('rdhits'),tok=++RD.ftok,q=rdNorm(String(q0).trim());out.replaceChildren();if(q.length<2)return;out.append(el('small','',L('Searching…')));const hits=[];
 for(let i=0;i<RD.bk.spine.length&&hits.length<200;i++){const c=await rdChText(i);if(!RD||tok!==RD.ftok)return;let p=-1,k=0;while((p=c.n.indexOf(q,p+1))>=0&&hits.length<200)hits.push({ch:i,k:k++,p,c});if(i%6===5)await new Promise(r=>setTimeout(r))}
 if(!RD||tok!==RD.ftok)return;
 out.replaceChildren(el('small','',hits.length?L('{n} found',{n:hits.length>=200?'200+':hits.length}):L('Nothing found.')));
 hits.forEach(h=>{const src=h.c.t.length===h.c.n.length?h.c.t:h.c.n,a=Math.max(0,h.p-40),b=el('button');b.type='button';
  b.append((a?'…':'')+src.slice(a,h.p).replace(/\s+/g,' '),el('b','',src.slice(h.p,h.p+q.length)),src.slice(h.p+q.length,h.p+q.length+50).replace(/\s+/g,' ')+'…');
  const lab=[...RD.bk.toc].reverse().find(t=>t.ch<=h.ch);b.append(el('small','',lab?lab.label:''));
  b.onclick=async()=>{$('rdfind').hidden=true;await rdShow(h.ch,0);if(RD)rdMark(q,h.k)};out.append(b)})}
function rdMark(q,k){
 const w=document.createTreeWalker($('rdtext'),NodeFilter.SHOW_TEXT),nodes=[];let all='',n;
 while((n=w.nextNode())){if(n.parentElement&&n.parentElement.closest('.rdnext'))continue;const s=rdNorm(n.nodeValue);nodes.push([n,all.length,s.length]);all+=s}
 let p=-1;for(let i=0;i<=k;i++){p=all.indexOf(q,p+1);if(p<0)return}
 const at=o=>{const x=nodes.find(([nd,s0,ln])=>o>=s0&&o<s0+ln)||nodes[nodes.length-1];return[x[0],Math.min(x[0].nodeValue.length,o-x[1])]},[n1,o1]=at(p),[n2,o2]=at(p+q.length-1);
 const r=document.createRange();try{r.setStart(n1,o1);r.setEnd(n2,Math.min(n2.nodeValue.length,o2+1))}catch(e){return}
 rdGoRect(r.getBoundingClientRect(),90);try{if(window.Highlight&&CSS.highlights)CSS.highlights.set('rdhit',new Highlight(r))}catch(e){}rdSave()}
/* a passage you select can be kept as a quote of that book */
function rdQuote(){if(!RD)return;const s=getSelection(),text=String(s||'').replace(/\s+/g,' ').trim().slice(0,1500);if(text.length<3)return;const b=books.find(x=>x.id===RD.id);
 quotes.push({id:'q'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),bookId:RD.id,title:b?b.title:RD.title,text,page:b&&b.pages?Math.max(1,Math.round(RD.pct*b.pages)):0,created:Date.now()});
 saveQuotes();try{s.removeAllRanges()}catch(e){}toast(L('Quote saved.'));try{drawQuoteBtn();if(view==='goals')renderGoals()}catch(e){}}
document.addEventListener('selectionchange',()=>{if(!RD||!$('rdqb'))return;const s=getSelection(),ok=!!(s&&!s.isCollapsed&&s.anchorNode&&$('rdtext').contains(s.anchorNode)&&String(s).trim().length>2);$('rdqb').hidden=!ok;$('rdprog').hidden=ok});
function rdClose(){
 if(!RD)return;rdSave();const r=RD;RD=null;r.urls.forEach(u=>URL.revokeObjectURL(u));try{r.wl&&r.wl.release()}catch(e){}const e=$('rdr');if(e)e.remove();
 const ms=r.ms+(document.visibilityState==='visible'?Date.now()-r.vis:0),b=books.find(x=>x.id===r.id);
 /* where you stopped moves the page number on the shelf, and the time read counts like a timed session */
 if(b&&b.pages&&st(b)==='reading'&&r.pct>0){const pg=Math.max(1,Math.min(b.pages,Math.round(r.pct*b.pages)));if(pg!==b.page){b.page=pg;store();render();if(cur&&cur.id===b.id)$('page').value=pg;else autoFinish(b)}}
 if(b&&ms>=6e4&&!(active&&active.bookId===r.id)){const min=Math.max(1,Math.round(ms/6e4));sessions.push({bookId:r.id,start:r.t0,min});saveSessions();toast(L('Session saved: {m} min.',{m:min}));try{if(view==='goals')renderGoals()}catch(e2){}}
 try{hSync()}catch(e2){}}
document.addEventListener('visibilitychange',()=>{if(!RD)return;if(document.visibilityState==='visible'){RD.vis=Date.now();rdWake()}else{RD.ms+=Date.now()-RD.vis;rdSave()}});
window.addEventListener('resize',()=>{if(!RD||RD.ch<0||!$('rdbody'))return;const fr=rdFr();rdLayout();rdPlace(fr)});
document.addEventListener('keydown',e=>{if(!RD)return;
 if(e.key==='Escape'){e.stopImmediatePropagation();e.preventDefault();if(!$('rdtoc').hidden)$('rdtoc').hidden=true;else if(!$('rdfind').hidden)$('rdfind').hidden=true;else rdClose();return}
 if(rdPaged()&&!/INPUT|TEXTAREA/.test((e.target&&e.target.tagName)||'')){if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){e.preventDefault();rdTurn(1)}else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();rdTurn(-1)}}},true);

/* ---------- e-book files: how much room they take, removing them, and a backup that includes them ---------- */
function dlBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),8000)}
async function ebSaveCopy(id){const r=await EB.get('files',id);if(!r)return;dlBlob(new Blob([r.buf],{type:'application/epub+zip'}),String(r.name||'book').replace(/\.(pdf|epub)$/i,'')+'.epub')}
function ebListOpen(){
 const box=$('eblist'),ids=Object.keys(EBIDX);box.replaceChildren();$('lov').classList.remove('on');$('ebov').classList.add('on');
 const tot=ids.reduce((a,i)=>a+(EBIDX[i].size||0),0);$('ebovsum').textContent=ids.length?L('{n} files · {s} MB',{n:ids.length,s:(tot/1048576).toFixed(1)}):'';
 $('ebbk').hidden=!ids.length||!$('exp');
 if(!ids.length){box.append(el('p','stempty',L('No e-book files yet.')));return}
 const ul=el('ul','nextlist');ids.sort((a,b)=>(EBIDX[b].size||0)-(EBIDX[a].size||0)).forEach(id=>{const b=books.find(x=>x.id===id),li=el('li','',b?b.title:EBIDX[id].name);li.append(el('small','',((EBIDX[id].size||0)/1048576).toFixed(1)+' MB'));
  const r=el('button','fbtn',L('Remove'));r.type='button';r.onclick=async()=>{await EB.del(id);delete EBIDX[id];ebSaveIdx();ebListOpen()};li.append(r);ul.append(li)});box.append(ul)}
$('ebovx').onclick=()=>$('ebov').classList.remove('on');$('ebov').onclick=e=>{if(e.target===$('ebov'))$('ebov').classList.remove('on')};
async function ebBackup(){
 toast(L('Preparing the backup…'));const files=[['backup.json',JSON.stringify({app:'my-bookshelf',version:2,exported:new Date().toISOString(),books,quotes,goals,look,lang,sessions,marks:window.marksGet?marksGet():{}})]],idx={},pos={};
 for(const id of Object.keys(EBIDX)){const r=await EB.get('files',id);if(!r)continue;idx[id]=EBIDX[id];files.push(['ebooks/'+id+'.epub',new Uint8Array(r.buf)]);const p=await EB.get('pos',id);if(p)pos[id]=p}
 files.push(['ebooks/index.json',JSON.stringify(idx)],['ebooks/pos.json',JSON.stringify(pos)]);
 dlBlob(new Blob([await zipStore(files)],{type:'application/zip'}),'bookshelf-backup-with-ebooks-'+today()+'.zip');try{localStorage.setItem(LB,Date.now())}catch(e){}try{checkBackup()}catch(e){}toast(L('Backup saved.'))}
$('ebbk').onclick=ebBackup;
/* a backup made with e-books is a zip: the library goes through the usual import, the files go back to their books */
if(typeof importFile==='function'){const imf=importFile;importFile=async function(file){let h;try{h=new Uint8Array(await file.slice(0,4).arrayBuffer())}catch(e){return imf(file)}
 if(!(h[0]===0x50&&h[1]===0x4b))return imf(file);
 try{const z=await unzip(await file.arrayBuffer()),dec=new TextDecoder(),js=async n=>{const b=await z.read(n);return b?JSON.parse(dec.decode(b)):null},idx=(await js('ebooks/index.json'))||{},pos=(await js('ebooks/pos.json'))||{},bj=await z.read('backup.json');if(!bj)throw 0;let n=0;
  for(const id of Object.keys(idx)){const by=await z.read('ebooks/'+id+'.epub');if(!by)continue;const buf=by.slice().buffer;await EB.put('files',{id,name:idx[id].name,size:buf.byteLength,buf,t:Date.now()});if(pos[id])await EB.put('pos',pos[id]);EBIDX[id]=idx[id];n++}
  ebSaveIdx();await imf(new File([bj],'backup.json',{type:'application/json'}));if(n)toast(L('E-books restored: {n}.',{n}))}
 catch(e){toast(L('This file couldn’t be read. It may be damaged.'))}}}

/* ---------- the phone's Back button closes what is open (the reader, a book, a panel) instead of leaving the app ---------- */
const BACK={ov:()=>closeModal(),lov:'lclose',scan:()=>stopScan(),serov:'serx',cropov:'cropx',tagov:'tagdone',qov:'qcancel',arrov:'arrx',askov:'askno',tourov:()=>tourClose(),safeov:'safex',aboutov:'aboutx',yrov:'yrclose',genov:'gendone',ebov:'ebovx',shov:'shovx'};
let hDepth=0,hSkip=false,hOK=true,hT=0;
const hLayers=()=>(RD?1:0)+(window.AP?1:0)+document.querySelectorAll('.ov.on').length;
function hSync(){if(!hOK||hSkip)return;const n=hLayers();
 try{while(hDepth<n){history.pushState({bk:hDepth+1},'');hDepth++}if(hDepth>n){const d=hDepth-n;hDepth=n;hSkip=true;history.go(-d)}}catch(e){hOK=false}}
window.addEventListener('popstate',()=>{
 if(hSkip){hSkip=false;hSync();return}
 if(hDepth<=0)return;hDepth--;
 if(window.AP){apClose();return}
 if(RD){rdClose();return}
 const open=[...document.querySelectorAll('.ov.on')].reverse().sort((a,b)=>(+getComputedStyle(b).zIndex||0)-(+getComputedStyle(a).zIndex||0)),top=open[0];if(!top)return;
 const act=BACK[top.id];try{if(typeof act==='function')act();else if(act&&$(act))$(act).click();else top.classList.remove('on')}catch(e){top.classList.remove('on')}
 clearTimeout(hT);hT=setTimeout(hSync,400)});
setTimeout(()=>{try{if(!turning())document.body.classList.add('restwalls')}catch(e){}},6000);
{const mo=new MutationObserver(()=>{clearTimeout(hT);hT=setTimeout(hSync,80)});document.querySelectorAll('.ov').forEach(o=>mo.observe(o,{attributes:true,attributeFilter:['class']}))}

/* the leaves of the stats and goals walls cover the whole wall, however long it is, and take proportionally longer to fall */
function leafFit(){document.querySelectorAll('.statsv>.leaves,#leaves').forEach(l=>{l.style.height='0px';const h=Math.max(innerHeight,l.parentElement.scrollHeight),k=h/Math.max(1,innerHeight);l.style.height=h+'px';
 l.querySelectorAll('.leaf').forEach(f=>{if(!f.dataset.d)f.dataset.d=parseFloat(getComputedStyle(f).animationDuration)||10;f.style.animationDuration=(f.dataset.d*k).toFixed(2)+'s'})})}
{const a=renderStats;renderStats=function(){const r=a.apply(this,arguments);try{leafFit()}catch(e){}return r};const g=renderGoals;renderGoals=function(){const r=g.apply(this,arguments);try{leafFit()}catch(e){}return r}}
/* the room too: its leaves used to fall only over the first screen of the wall and stop there */
{const r0=render;render=function(){const r=r0.apply(this,arguments);clearTimeout(leafFit.t);leafFit.t=setTimeout(()=>{try{leafFit()}catch(e){}},200);return r}}
window.addEventListener('resize',()=>{clearTimeout(leafFit.t);leafFit.t=setTimeout(()=>{try{leafFit()}catch(e){}},300)});setTimeout(()=>{try{leafFit()}catch(e){}},3500);

/* =====================================================================================================
   Ten additions: read aloud, highlights and bookmarks, reading comforts, audiobooks, your own shelves,
   library loans, a reading journal, Kindle highlights, rewards for the animal, and a book card to share
   ===================================================================================================== */
const fmtMB=n=>((n||0)/1048576).toFixed(1);
/* ---------- marks kept per book: highlights and bookmarks ---------- */
let MARKS={};try{MARKS=JSON.parse(localStorage.getItem('bookshelf-marks')||'{}')||{}}catch(e){}
window.marksGet=()=>MARKS;window.marksPut=m=>{if(m&&typeof m==='object'){MARKS=m;marksSave()}};
const marksSave=()=>{try{localStorage.setItem('bookshelf-marks',JSON.stringify(MARKS))}catch(e){}},marksOf=id=>MARKS[id]||(MARKS[id]={hl:[],bm:[]});
function rdNodes(){const w=document.createTreeWalker($('rdtext'),NodeFilter.SHOW_TEXT),out=[];let n,p=0;while((n=w.nextNode())){if(n.parentElement&&n.parentElement.closest('.rdnext'))continue;out.push([n,p,n.nodeValue.length]);p+=n.nodeValue.length}return out}
function rdRange(a,b){const ns=rdNodes(),at=o=>{const x=ns.find(n=>o>=n[1]&&o<n[1]+n[2])||ns[ns.length-1];return x?[x[0],Math.max(0,Math.min(x[2],o-x[1]))]:null},s=at(a),e=at(Math.max(a,b-1));if(!s||!e)return null;
 const r=document.createRange();try{r.setStart(s[0],s[1]);r.setEnd(e[0],Math.min(e[0].nodeValue.length,e[1]+1))}catch(er){return null}return r}
function rdSelOff(){const s=getSelection();if(!s||s.isCollapsed||!s.rangeCount)return null;const r=s.getRangeAt(0),ns=rdNodes();if(!ns.length)return null;
 const pos=(c,o,end)=>{if(c.nodeType===3){const x=ns.find(n=>n[0]===c);return x?x[1]+o:-1}
  const kid=c.childNodes[o];if(kid){const x=ns.find(n=>n[0]===kid||kid.contains(n[0])||(kid.compareDocumentPosition(n[0])&4));if(x)return x[1]}
  const ins=ns.filter(n=>c.contains(n[0]));if(ins.length){const l=ins[ins.length-1];return end||!kid?l[1]+l[2]:ins[0][1]}return -1};
 const a=pos(r.startContainer,r.startOffset,false),b=pos(r.endContainer,r.endOffset,true);return a>=0&&b>a?[a,b]:null}
function rdPaint(){
 if(!RD||!window.Highlight||!window.CSS||!CSS.highlights)return;const hl=marksOf(RD.id).hl.filter(h=>h.ch===RD.ch);
 [1,2,3].forEach(c=>{const rs=hl.filter(h=>(h.c||1)===c).map(h=>rdRange(h.a,h.b)).filter(Boolean);if(rs.length)CSS.highlights.set('rdhl'+c,new Highlight(...rs));else CSS.highlights.delete('rdhl'+c)})}
function rdHighlight(c){const o=rdSelOff();if(!RD||!o)return;const text=String(getSelection()).replace(/\s+/g,' ').trim().slice(0,300);
 marksOf(RD.id).hl.push({ch:RD.ch,a:o[0],b:o[1],c,text,t:Date.now()});marksSave();try{getSelection().removeAllRanges()}catch(e){}rdPaint()}
function rdBmNear(){const m=marksOf(RD.id).bm,fr=rdFr();return m.findIndex(b=>b.ch===RD.ch&&Math.abs(b.fr-fr)<(rdPaged()?.5/(RD.pgN||1):.02))}
function rdBmState(){const b=$('rdbm');if(b&&RD&&RD.ch>=0)b.setAttribute('aria-pressed',rdBmNear()>=0)}
function rdBookmark(){if(!RD)return;const m=marksOf(RD.id).bm,i=rdBmNear();
 if(i>=0)m.splice(i,1);else{const bd=$('rdbody').getBoundingClientRect(),el0=ttsBlocks().find(e=>{const q=e.getBoundingClientRect();return rdPaged()?q.left>=bd.left-2&&bd.right>q.left:q.bottom>bd.top+8});
  m.push({ch:RD.ch,fr:rdFr(),pct:Math.round(RD.pct*100),text:((el0&&el0.textContent)||'').replace(/\s+/g,' ').trim().slice(0,70),t:Date.now()});m.sort((x,y)=>x.ch-y.ch||x.fr-y.fr)}
 marksSave();rdBmState()}
/* ---------- read aloud, with the phone's own voice ---------- */
const TTS={on:false,els:[],i:0,tok:0,auto:false};
function ttsBlocks(){const t=$('rdtext');if(!t)return[];const a=[...t.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,dd,dt,td,th,pre,div,figcaption')].filter(e=>!e.closest('.rdnext')&&!e.querySelector('p,h1,h2,h3,h4,h5,h6,li,blockquote,div,td,th,pre')&&e.textContent.trim());return a.length?a:[t]}
function ttsStop(){TTS.on=false;TTS.tok++;try{speechSynthesis.cancel()}catch(e){}document.querySelectorAll('#rdtext .rd-say').forEach(e=>e.classList.remove('rd-say'));const b=$('rdtts');if(b){b.textContent='🔊';b.setAttribute('aria-label',L('Read aloud'));b.setAttribute('aria-pressed','false')}}
function ttsStart(){if(!RD||!('speechSynthesis' in window))return;TTS.els=ttsBlocks();const bd=$('rdbody').getBoundingClientRect();
 let i=TTS.els.findIndex(e=>{const q=e.getBoundingClientRect();return rdPaged()?q.left>=bd.left-2&&bd.right>q.left:q.bottom>bd.top+12});TTS.i=i<0?0:i;TTS.on=true;const b=$('rdtts');b.textContent='⏹';b.setAttribute('aria-label',L('Stop reading aloud'));b.setAttribute('aria-pressed','true');ttsSay()}
async function ttsSay(){
 if(!RD||!TTS.on)return;const tok=++TTS.tok;
 if(TTS.i>=TTS.els.length){if(RD.ch>=RD.bk.spine.length-1){ttsStop();return}TTS.auto=true;await rdShow(RD.ch+1,0);TTS.auto=false;if(!RD||!TTS.on)return;TTS.els=ttsBlocks();TTS.i=0;ttsSay();return}
 const e=TTS.els[TTS.i];document.querySelectorAll('#rdtext .rd-say').forEach(x=>x.classList.remove('rd-say'));e.classList.add('rd-say');
 {const q=e.getBoundingClientRect(),bd=$('rdbody').getBoundingClientRect();if(rdPaged()){if(q.left<bd.left-2||q.left>=bd.right)rdGoRect(q)}else if(q.top<bd.top+4||q.bottom>bd.bottom-4)$('rdbody').scrollTop+=q.top-bd.top-60;rdSave()}
 /* short pieces: long ones are cut off on some phones */
 const parts=[];((e.textContent||'').replace(/\s+/g,' ').trim().match(/[^.!?…]+[.!?…]+["»”’)\]]*\s*|[^.!?…]+$/g)||[]).forEach(s=>{const l=parts[parts.length-1];if(l!==undefined&&(l+s).length<220)parts[parts.length-1]=l+s;else parts.push(s)});
 let k=0;const next=()=>{if(!RD||!TTS.on||tok!==TTS.tok)return;if(k>=parts.length){TTS.i++;ttsSay();return}
  const u=new SpeechSynthesisUtterance(parts[k++]);u.rate=rdSet.rate||1;u.lang=(RD.bk.lang||document.documentElement.lang||lang||'en');u.onend=next;u.onerror=ev=>{if(ev&&(ev.error==='interrupted'||ev.error==='canceled'))return;next()};try{speechSynthesis.speak(u)}catch(er){ttsStop()}};
 next()}
/* ---------- the extra buttons of the reader ---------- */
function rdExtras(){
 const r=$('rdr');if(!r||$('rdbm'))return;const B=(t,lab,fn,c)=>{const x=el('button','rb'+(c?' '+c:''),t);x.type='button';if(lab)x.setAttribute('aria-label',lab);x.onclick=fn;return x};
 const bot=r.querySelector('.rdbot'),set=r.querySelector('.rdset'),bm=B('🔖',L('Bookmark this place'),rdBookmark,'sm'),tts=B('🔊',L('Read aloud'),()=>{TTS.on?ttsStop():ttsStart()},'sm');bm.id='rdbm';tts.id='rdtts';
 $('rdprev').after(bm);$('rdnextb').before(tts);if(!('speechSynthesis' in window))tts.hidden=true;
 const sw=el('span');sw.id='rdhls';sw.hidden=true;sw.style.display='contents';[[1,'#ffe27a'],[2,'#b9ebb0'],[3,'#ffc2d6']].forEach(([c,col])=>{const x=B('',L('Highlight'),()=>rdHighlight(c),'hl');x.style.background=col;sw.append(x)});$('rdqb').after(sw);$('rdqb').textContent='❝ '+L('Quote');
 /* settings: easy-reading font, line spacing, margins, reading speed */
 const lastFf=[...set.querySelectorAll('[data-ff]')].pop(),dy=B('Aa',L('Easy-reading font'),()=>{rdSet.ff='dys';rdApplySet()});dy.dataset.ff='dys';dy.style.cssText='font-family:Verdana,sans-serif;letter-spacing:.08em';lastFf.after(dy);
 set.append(el('span','sep'),B('≡',L('Line spacing'),()=>{rdSet.lh=((rdSet.lh==null?1:rdSet.lh)+1)%3;rdApplySet()}),B('⇔',L('Margins'),()=>{rdSet.mg=((rdSet.mg==null?1:rdSet.mg)+1)%3;rdApplySet()}));
 const sp=B('',L('Reading speed'),()=>{const R=[.8,1,1.2,1.5],i=R.indexOf(rdSet.rate||1);rdSet.rate=R[(i+1)%R.length];rdApplySet();if(TTS.on){ttsStop();ttsStart()}},'sm');sp.id='rdrate';set.append(sp);
 rdApplySet();rdPaint();rdBmState()}
{const o=rdOpen;rdOpen=async function(id){await o(id);try{if(RD)rdExtras()}catch(e){}}}
{const o=rdShow;rdShow=async function(){if(TTS.on&&!TTS.auto)ttsStop();const r=await o.apply(this,arguments);try{rdPaint();rdBmState()}catch(e){}return r}}
{const o=rdSave;rdSave=function(){const r=o.apply(this,arguments);try{rdBmState()}catch(e){}return r}}
{const o=rdClose;rdClose=function(){try{ttsStop()}catch(e){}return o.apply(this,arguments)}}
{const o=rdApplySet;rdApplySet=function(){const r=$('rdr');if(r){r.style.setProperty('--rlh',[1.45,1.65,1.95][rdSet.lh==null?1:rdSet.lh]);r.style.setProperty('--rmg',[12,22,38][rdSet.mg==null?1:rdSet.mg]+'px');r.dataset.ff=rdSet.ff||'serif';const sp=$('rdrate');if(sp)sp.textContent=(rdSet.rate||1)+'×'}
 o.apply(this,arguments);
 if(r&&rdSet.ff==='dys'){if(!$('dysfont')){const st=document.createElement('style');st.id='dysfont';st.textContent="@font-face{font-family:'OpenDyslexic';font-display:swap;src:url(https://cdn.jsdelivr.net/fontsource/fonts/opendyslexic@latest/latin-400-normal.woff2) format('woff2'),url(https://cdn.jsdelivr.net/npm/@fontsource/opendyslexic/files/opendyslexic-latin-400-normal.woff2) format('woff2')}";document.head.append(st);try{document.fonts.load("16px OpenDyslexic").then(()=>{if(RD&&RD.ch>=0){const fr=rdFr();rdLayout();rdPlace(fr)}}).catch(()=>{})}catch(e){}}
  r.style.setProperty('--rff',"'OpenDyslexic',Verdana,system-ui,sans-serif");if(RD&&RD.ch>=0){const fr=rdFr();rdLayout();rdPlace(fr)}}}}
/* the contents panel also lists your bookmarks and highlights */
{const o=rdToc;rdToc=function(){o.apply(this,arguments);const box=$('rdtoc');if(!RD||box.hidden)return;const m=marksOf(RD.id),lab=ch=>{const t=[...RD.bk.toc].reverse().find(x=>x.ch<=ch);return t?t.label:''};
 const row=(txt,sub,go,del,col)=>{const d=el('div','rdrow');if(col){const i=el('i');i.style.background=col;d.append(i)}const b=el('button','',txt);b.type='button';b.style.flex='1';b.append(el('small','',sub));b.onclick=go;const x=el('button','x','✕');x.type='button';x.setAttribute('aria-label',L('Remove'));x.onclick=()=>{del();marksSave();box.hidden=true;rdToc();rdPaint();rdBmState()};d.append(b,x);return d};
 if(m.bm.length){box.append(el('h3','','🔖 '+L('Bookmarks')));m.bm.forEach(b=>box.append(row(b.text||lab(b.ch),lab(b.ch)+' · '+(b.pct||0)+'%',()=>rdShow(b.ch,b.fr),()=>m.bm.splice(m.bm.indexOf(b),1))))}
 if(m.hl.length){box.append(el('h3','','🖍 '+L('Highlights')));m.hl.slice().sort((x,y)=>x.ch-y.ch||x.a-y.a).forEach(h=>box.append(row('“'+h.text+'”',lab(h.ch),async()=>{await rdShow(h.ch,0);const rg=RD&&rdRange(h.a,h.b);if(rg){rdGoRect(rg.getBoundingClientRect(),90);rdSave()}},()=>m.hl.splice(m.hl.indexOf(h),1),['','#ffe27a','#b9ebb0','#ffc2d6'][h.c||1])))}}}
document.addEventListener('selectionchange',()=>{if(!RD||!$('rdhls'))return;const ok=!$('rdqb').hidden;$('rdhls').hidden=!ok;$('rdbm').hidden=ok;$('rdtts').hidden=ok||!('speechSynthesis' in window)});

/* ---------- audiobooks: attach audio files to a book and listen in the app ---------- */
let ABIDX={};try{ABIDX=JSON.parse(localStorage.getItem('bookshelf-audio')||'{}')||{}}catch(e){}
const abSave=()=>{try{localStorage.setItem('bookshelf-audio',JSON.stringify(ABIDX))}catch(e){}},abKey=(id,i)=>'a|'+id+'|'+i;
async function abRemove(id){const a=ABIDX[id];if(!a)return;for(let i=0;i<a.names.length;i++){EB.mem.delete('files'+abKey(id,i));try{await EB.tx('files','readwrite',s=>s.delete(abKey(id,i)))}catch(e){}}try{await EB.tx('pos','readwrite',s=>s.delete('a|'+id))}catch(e){}delete ABIDX[id];abSave()}
function abDraw(){
 const row=$('abrow');if(!row)return;row.replaceChildren();$('abnote').textContent='';if(!cur)return;const id=cur.id,a=ABIDX[id];
 const btn=(t,fn,c)=>{const b=el('button','qbtn'+(c?' '+c:''),t);b.type='button';b.onclick=fn;row.append(b);return b};
 if(a){btn(L('🎧 Listen'),()=>apOpen(id),'go');btn(L('Remove the audio'),async()=>{if(!(await ask(L('Remove the audio files from this phone? The book stays on your shelf.'),L('Remove'))))return;await abRemove(id);abDraw()});
  $('abnote').textContent=L('{n} audio files · {s} MB',{n:a.names.length,s:fmtMB(a.size)})+' — '+L('Audio files are not included in backups.')}
 else btn(L('＋ Add audio files'),()=>{$('abin').value='';$('abin').click()})}
$('abin').onchange=async e=>{const id=cur&&cur.id,fs=[...(e.target.files||[])];if(!id||!fs.length)return;
 const ok=fs.filter(f=>/^audio\//.test(f.type)||/\.(mp3|m4a|m4b|aac|ogg|oga|opus|wav|flac)$/i.test(f.name));if(!ok.length){toast(L('Only audio files can be added here.'));return}
 const size=ok.reduce((a,f)=>a+f.size,0);if(size>2*1073741824){toast(L('Those files are too big (over 2 GB).'));return}
 ok.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));await abRemove(id);
 for(let i=0;i<ok.length;i++)await EB.put('files',{id:abKey(id,i),name:ok[i].name,size:ok[i].size,blob:ok[i],t:Date.now()});
 ABIDX[id]={names:ok.map(f=>f.name),size};abSave();try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(er){}abDraw();toast(L('Audio added. Tap Listen to play it.'))};
window.AP=null;
const apFmt=t=>{t=Math.max(0,Math.floor(t||0));const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return(h?h+':'+String(m).padStart(2,'0'):m)+':'+String(s).padStart(2,'0')};
async function apOpen(id){
 if(window.AP||!ABIDX[id])return;const b=books.find(x=>x.id===id)||{},a=ABIDX[id],pos=(await EB.get('pos','a|'+id))||{i:0,t:0,rate:1};
 const au=new Audio();au.preload='metadata';const P=window.AP={id,au,i:-1,url:'',ms:0,last:0,sleep:0,sleepT:0,t0:Date.now(),rate:pos.rate||1};
 const r=el('div');r.id='apl';r.setAttribute('role','dialog');r.setAttribute('aria-modal','true');r.setAttribute('aria-label',b.title||L('Audiobook'));
 const B=(t,lab,fn,c)=>{const x=el('button',c||'',t);x.type='button';if(lab)x.setAttribute('aria-label',lab);x.onclick=fn;return x};
 const top=el('div','aptop'),cov=el('div','apcov'),trk=el('div','aptrk'),seek=el('input'),time=el('div','aptime'),main=el('div','apmain'),opt=el('div','apopt'),list=el('div','aplist'),t1=el('span','','0:00'),t2=el('span','','0:00');
 top.append(B('✕',L('Close'),apClose),el('b','',b.title||''),el('span'));top.lastChild.style.width='44px';
 if(b.cover)cov.style.backgroundImage=`url(${b.cover})`;else{cov.style.backgroundColor=b.color||'#8b2e2e';cov.textContent=b.title||''}
 seek.type='range';seek.min=0;seek.max=1000;seek.value=0;seek.setAttribute('aria-label',b.title||'');time.append(t1,t2);
 const pp=B('▶',L('Play'),()=>{au.paused?au.play().catch(()=>{}):au.pause()},'pp');main.append(B('⏪ 30',L('Back 30 seconds'),()=>{au.currentTime=Math.max(0,au.currentTime-30)},'sk'),pp,B('30 ⏩',L('Forward 30 seconds'),()=>{au.currentTime=Math.min(au.duration||1e9,au.currentTime+30)},'sk'));
 const sp=B('',L('Speed'),()=>{const R=[.8,1,1.2,1.5,1.75,2],i=R.indexOf(P.rate);P.rate=R[(i+1)%R.length];au.playbackRate=P.rate;draw()}),sl=B('',L('Sleep timer'),()=>{const S=[0,15,30,45,60],i=S.indexOf(P.sleep);P.sleep=S[(i+1)%S.length];clearTimeout(P.sleepT);if(P.sleep)P.sleepT=setTimeout(()=>{au.pause();P.sleep=0;draw()},P.sleep*6e4);draw()});opt.append(sp,sl);
 const draw=()=>{sp.textContent=L('Speed')+' '+P.rate+'×';sl.textContent='🌙 '+(P.sleep?L('{n} min',{n:P.sleep}):L('Sleep timer')+': '+L('Off'));pp.textContent=au.paused?'▶':'⏸';pp.setAttribute('aria-label',L(au.paused?'Play':'Pause'));
  trk.textContent=a.names.length>1?(P.i+1)+' / '+a.names.length+' · '+a.names[P.i]:'';list.querySelectorAll('button').forEach((x,i)=>x.classList.toggle('on',i===P.i))};
 const save=()=>{if(P.i>=0)EB.put('pos',{id:'a|'+id,i:P.i,t:au.currentTime||0,rate:P.rate})};
 const load=async(i,t,play)=>{const rec=await EB.get('files',abKey(id,i));if(!rec||window.AP!==P)return;if(P.url)URL.revokeObjectURL(P.url);P.url=URL.createObjectURL(rec.blob);P.i=i;au.src=P.url;au.playbackRate=P.rate;
  au.addEventListener('loadedmetadata',()=>{try{au.currentTime=Math.min(t||0,Math.max(0,(au.duration||0)-2))}catch(e){}au.playbackRate=P.rate;if(play)au.play().catch(()=>{})},{once:true});draw()};
 P.load=load;
 if(a.names.length>1)a.names.forEach((n,i)=>list.append(B((i+1)+'. '+n,'',()=>load(i,0,true))));
 au.addEventListener('timeupdate',()=>{const d=au.duration||0;t1.textContent=apFmt(au.currentTime);t2.textContent=d?apFmt(d):'';if(d&&!seek.matches(':active'))seek.value=Math.round(au.currentTime/d*1000);const now=Date.now();if(!au.paused&&P.last&&now-P.last<3000)P.ms+=now-P.last;P.last=now;if(now-(P.sv||0)>5000){P.sv=now;save()}});
 au.addEventListener('play',()=>{P.last=Date.now();draw()});au.addEventListener('pause',()=>{save();draw()});
 au.addEventListener('ended',()=>{if(P.i<a.names.length-1)load(P.i+1,0,true);else{save();draw()}});
 seek.addEventListener('input',()=>{if(au.duration)au.currentTime=seek.value/1000*au.duration});
 r.append(top,cov,trk,seek,time,main,opt,list);document.body.append(r);
 try{if('mediaSession' in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:b.title||'',artist:b.author||'',album:L('Audiobook'),artwork:b.cover?[{src:b.cover,sizes:'512x512',type:'image/jpeg'}]:[]});
  const h=(k,f)=>{try{navigator.mediaSession.setActionHandler(k,f)}catch(e){}};h('play',()=>au.play());h('pause',()=>au.pause());h('seekbackward',()=>{au.currentTime=Math.max(0,au.currentTime-30)});h('seekforward',()=>{au.currentTime+=30});
  h('previoustrack',a.names.length>1?()=>load(Math.max(0,P.i-1),0,true):null);h('nexttrack',a.names.length>1?()=>load(Math.min(a.names.length-1,P.i+1),0,true):null)}}catch(e){}
 await load(Math.max(0,Math.min(a.names.length-1,pos.i||0)),pos.t||0,false);try{hSync()}catch(e){}}
function apClose(){const P=window.AP;if(!P)return;try{P.au.pause()}catch(e){}if(P.i>=0)EB.put('pos',{id:'a|'+P.id,i:P.i,t:P.au.currentTime||0,rate:P.rate});clearTimeout(P.sleepT);window.AP=null;if(P.url)URL.revokeObjectURL(P.url);try{P.au.removeAttribute('src');P.au.load()}catch(e){}const e=$('apl');if(e)e.remove();
 const b=books.find(x=>x.id===P.id);if(b&&P.ms>=6e4&&!(active&&active.bookId===P.id)){const min=Math.max(1,Math.round(P.ms/6e4));sessions.push({bookId:P.id,start:P.t0,min});saveSessions();toast(L('Session saved: {m} min.',{m:min}));try{if(view==='goals')renderGoals()}catch(e2){}}
 try{hSync()}catch(e){}}
document.addEventListener('keydown',e=>{if(window.AP&&e.key==='Escape'){e.stopImmediatePropagation();e.preventDefault();apClose()}},true);

/* ---------- your own shelves, shown as extra bookcases under the others ---------- */
const shDefs=()=>Array.isArray(look._shelves)?look._shelves:[];
function shSet(list){look._shelves=list;try{localStorage.setItem(LK,JSON.stringify(look))}catch(e){}markChange&&markChange()}
let formShelves=[],CSSIG='';
function renderCustom(){
 const scene=document.querySelector('.scene');if(!scene)return;const defs=shDefs();
 let sig='';try{sig=[lang,scene.clientWidth,JSON.stringify(defs),books.filter(b=>b.shelves&&b.shelves.length).map(b=>sw(b)+','+sh(b)+JSON.stringify(b,zRep)).join('|')].join('~')}catch(e){}
 if(sig&&sig===CSSIG&&scene.querySelectorAll('.case.cs').length===defs.length)return;CSSIG=sig;
 scene.querySelectorAll('.case.cs').forEach(e=>e.remove());
 defs.forEach(d=>{const ord=d.order||[],rank=b=>{const i=ord.indexOf(b.id);return i<0?1e6:i},list=books.filter(b=>(b.shelves||[]).includes(d.id)).map((b,i)=>[b,i]).sort((a,b)=>rank(a[0])-rank(b[0])||a[1]-b[1]).map(x=>x[0]),cs=el('div','case small cs'),plq=el('div','plq',d.name),box=el('div');cs.dataset.sid=d.id;plq.append(el('span','n','· '+list.length));
  const ed=el('button','plus arr','✎');ed.type='button';ed.setAttribute('aria-label',L('My shelves'));ed.onclick=shOpen;plq.append(ed);cs.append(plq,box);scene.append(cs);
  if(!list.length){box.append(el('div','cshint',L('Tick “{s}” in a book to put it here.',{s:d.name})));const u=el('div','unit'),r0=el('div','row pz');r0.dataset.zone='cs-'+d.id;u.append(r0,el('div','board'));box.append(u);return}
  const meas=el('div');meas.style.cssText='position:absolute;left:-9999px;top:0;visibility:hidden;display:flex;align-items:flex-end;gap:2px;width:max-content';document.body.append(meas);
  const els=list.map(b=>{const e=makeSpine(b);e.classList.add('csb');if(b.lentTo)e.title=L('Lent to {name}',{name:b.lentTo});e.onclick=()=>{if(!justDragged)openModal(b,e)};meas.append(e);return e});
  const W=Math.max(120,box.clientWidth-34),rows=[[]];let x=0;els.forEach(e=>{const w=e.offsetWidth+2;if(x+w>W&&rows.at(-1).length){rows.push([]);x=0}rows.at(-1).push(e);x+=w});
  rows.forEach(r=>{const row=el('div','row pz'),u=el('div','unit');row.dataset.zone='cs-'+d.id;r.forEach(e=>row.append(e));u.append(row,el('div','board'));box.append(u)});meas.remove()})}
{const r0=render;render=function(){const r=r0.apply(this,arguments);try{renderCustom();applyFilter()}catch(e){}try{petAfterRender()}catch(e){}return r}}
function shChips(){const box=$('shchips');if(!box)return;box.replaceChildren();shDefs().forEach(d=>{const b=el('button','',d.name);b.type='button';b.setAttribute('aria-pressed',formShelves.includes(d.id));b.onclick=()=>{formShelves=formShelves.includes(d.id)?formShelves.filter(x=>x!==d.id):[...formShelves,d.id];shChips()};box.append(b)});
 const n=el('button','',L('＋ New shelf'));n.type='button';n.style.borderStyle='dashed';n.onclick=async()=>{const id=await shNew();if(id){formShelves=[...formShelves,id];shChips()}};box.append(n)}
async function shNew(){const inp=$('askin'),t0=inp.type;inp.type='text';inp.removeAttribute('inputmode');inp.value='';inp.maxLength=30;inp.hidden=false;const ok=await ask(L('Shelf name'),L('Save'));inp.hidden=true;const name=String(inp.value||'').trim().slice(0,30);inp.type=t0;inp.setAttribute('inputmode','numeric');inp.value='';
 if(!ok||!name)return null;const id='s'+Date.now().toString(36);shSet([...shDefs(),{id,name}]);try{renderCustom()}catch(e){}return id}
function shOpen(){const ul=$('shlist');ul.replaceChildren();$('lov').classList.remove('on');
 shDefs().forEach(d=>{const li=el('li'),inp=el('input');inp.value=d.name;inp.maxLength=30;inp.setAttribute('aria-label',L('Shelf name'));inp.onchange=()=>{const v=inp.value.trim();if(v){shSet(shDefs().map(x=>x.id===d.id?{id:x.id,name:v}:x));renderCustom()}};
  const del=el('button','fbtn',L('Delete'));del.type='button';del.onclick=async()=>{if(!(await ask(L('Delete this shelf? The books stay in your library.'),L('Delete'))))return;shSet(shDefs().filter(x=>x.id!==d.id));books.forEach(b=>{if(b.shelves)b.shelves=b.shelves.filter(x=>x!==d.id)});formShelves=formShelves.filter(x=>x!==d.id);store();render();shOpen();shChips()};li.append(inp,del);ul.append(li)});
 $('shov').classList.add('on')}
$('shnew').onclick=async()=>{$('shov').classList.remove('on');await shNew();shOpen();shChips()};$('shovx').onclick=()=>$('shov').classList.remove('on');$('shov').onclick=e=>{if(e.target===$('shov'))$('shov').classList.remove('on')};

/* ---------- reading journal: dated notes while you read ---------- */
let formJournal=[];
function jrDraw(edit){const box=$('jrlist');if(!box)return;box.replaceChildren();
 formJournal.forEach((j,i)=>{const d=el('div','je'),c=el('div');c.append(el('small','',fmtDate(j.d)+(j.p?' · '+L('p. {p}',{p:j.p}):'')),j.t);const x=el('button','','✕');x.type='button';x.setAttribute('aria-label',L('Remove'));x.onclick=()=>{formJournal.splice(i,1);jrDraw()};d.append(c,x);box.append(d)});
 if(edit){const ta=el('textarea');ta.maxLength=1500;ta.placeholder=L('What did you think today?');const sv=el('button','qbtn',L('Save entry'));sv.type='button';sv.onclick=()=>{const t=ta.value.trim();if(t)formJournal.push({d:today(),p:+$('page').value||0,t});jrDraw()};box.append(ta,sv);setTimeout(()=>ta.focus(),40)}
 $('jradd').hidden=!!edit}
$('jradd').onclick=()=>jrDraw(true);

/* ---------- the form's extra fields travel with the book when it is saved ---------- */
function formExtra(){return{shelves:formShelves.filter(id=>shDefs().some(d=>d.id===id)),borFrom:$('borFrom').value.trim(),borDue:$('borFrom').value.trim()?$('borDue').value:'',journal:formJournal.slice()}}
{const om=openModal;openModal=function(b,src,status){om(b,src,status);formShelves=(b&&b.shelves||[]).slice();formJournal=(b&&b.journal||[]).map(j=>({...j}));$('borFrom').value=b&&b.borFrom||'';$('borDue').value=b&&b.borDue||'';try{shChips();jrDraw();abDraw();$('sharebk').hidden=!b}catch(e){}}}
{const sb=saveBook;saveBook=function(){const ex=formExtra(),wasNew=!cur,ids=new Set(books.map(b=>b.id));if(cur)Object.assign(cur,ex);sb();if(wasNew){const nb=books.find(b=>!ids.has(b.id));if(nb&&(ex.shelves.length||ex.borFrom||ex.journal.length)){Object.assign(nb,ex);store();try{renderCustom()}catch(e){}}}}}
/* deleting a book also deletes its audio and its marks */
$('del').addEventListener('click',()=>{const id=cur&&cur.id;if(id)setTimeout(()=>{if(!books.some(b=>b.id===id)){if(ABIDX[id])abRemove(id);if(MARKS[id]){delete MARKS[id];marksSave()}}},300)},true);

/* ---------- books borrowed from a library or a friend: a nudge when one is due ---------- */
async function borNag(){
 if(document.querySelector('.ov.on')||RD||window.AP)return;let m={};try{m=JSON.parse(localStorage.getItem('bookshelf-bornag')||'{}')||{}}catch(e){}
 const b=books.find(b=>b.borFrom&&b.borDue&&days(today(),b.borDue)<=3&&Date.now()-(m[b.id]||0)>2*864e5);if(!b)return;
 m[b.id]=Date.now();try{localStorage.setItem('bookshelf-bornag',JSON.stringify(m))}catch(e){}
 const late=days(today(),b.borDue)<0,ok=await ask('\u{1F4DA} '+L(late?'“{t}” was due back to {name} on {d}.':'“{t}” is due back to {name} on {d}.',{t:b.title,name:b.borFrom,d:fmtDate(b.borDue)}),L('Mark as returned'),L('Later'));
 if(ok){b.borFrom='';b.borDue='';store();render();toast(L('Returned.'))}}
setTimeout(borNag,12000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(borNag,3000)});

/* ---------- Kindle highlights: the "My Clippings.txt" file becomes quotes ---------- */
function kcParse(text){const out=[];String(text).replace(/^﻿/,'').split(/\r?\n==========\r?\n?/).forEach(blk=>{const ls=blk.split(/\r?\n/).map(l=>l.replace(/^﻿/,'').trim());while(ls.length&&!ls[0])ls.shift();if(ls.length<3)return;
  const head=ls[0],meta=ls[1],body=ls.slice(2).join(' ').replace(/\s+/g,' ').trim();if(!/^-/.test(meta)||body.length<3)return;
  const m=head.match(/^(.*?)\s*\(([^()]*)\)\s*$/),title=(m?m[1]:head).trim(),pg=meta.match(/(?:page|página|pagina|seite|pàgina)\s*(\d+)/i);out.push({title,author:m?m[2].trim():'',text:body.slice(0,1500),page:pg?+pg[1]:0})});return out}
async function kcImport(file){let t='';try{t=await file.text()}catch(e){}const got=kcParse(t),have=new Set(quotes.map(q=>q.text)),fresh=got.filter(q=>!have.has(q.text)&&(have.add(q.text),true));
 if(!fresh.length){toast(L(got.length?'Added {n} quotes.':'No highlights found in that file. Choose “My Clippings.txt” from your Kindle.',{n:0}));return}
 if(!(await ask(L('Add {n} highlights as quotes?',{n:fresh.length}),L('Save'))))return;
 const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g,' ').trim();
 fresh.forEach((q,i)=>{const nt=norm(q.title),b=books.find(b=>{const x=norm(b.title);return x&&(x===nt||nt.startsWith(x)||x.startsWith(nt))});quotes.push({id:'q'+Date.now().toString(36)+i.toString(36),bookId:b?b.id:'',title:b?b.title:q.title,text:q.text,page:q.page,created:Date.now()})});
 saveQuotes();toast(L('Added {n} quotes.',{n:fresh.length}));try{if(view==='goals')renderGoals();drawQuoteBtn()}catch(e){}}
$('kcin').onchange=e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(f){$('lov').classList.remove('on');kcImport(f)}};

/* ---------- rewards: badges unlock something for the animal to wear ---------- */
const PETHEAD={cat:[24,9.5,1,0],dog:[21,12.5,1,-8],bird:[22.5,10,.85,-6],turtle:[8,40,.5,-8],fox:[24.5,15.5,.85,0],hedgehog:[12.5,37,.55,-14],axolotl:[15.5,31.5,.7,-6],frog:[25.5,28.5,.75,0],owl:[30,17,1,0],bunny:[17.5,19,.7,-4],alpaca:[20.5,5.5,.8,0],dragon:[16,11,.8,-8]};
const ACCS=[['bow','Bow',1,'<path d="M0-2.4L-6.4-6.6V1.8z M0-2.4L6.4-6.6V1.8z" fill="#d6455d"/><circle cx="0" cy="-2.4" r="1.7" fill="#b12f47"/>'],
 ['flower','Flower',2,'<g transform="translate(3.5,-3)"><circle cx="0" cy="-2.6" r="2" fill="#f7a8c4"/><circle cx="2.5" cy="-.8" r="2" fill="#f7a8c4"/><circle cx="1.5" cy="2.1" r="2" fill="#f7a8c4"/><circle cx="-1.5" cy="2.1" r="2" fill="#f7a8c4"/><circle cx="-2.5" cy="-.8" r="2" fill="#f7a8c4"/><circle r="1.6" fill="#f5c84b"/></g>'],
 ['tuque','Winter hat',3,'<path d="M-6.6.6C-6.6-9.4 6.6-9.4 6.6.6z" fill="#3f7fbf"/><rect x="-7.2" y="-1.4" width="14.4" height="3.2" rx="1.6" fill="#eef2f7"/><circle cx="0" cy="-8.4" r="2.1" fill="#eef2f7"/>'],
 ['party','Party hat',5,'<path d="M-5 .6L0-12.4L5 .6z" fill="#f2b632"/><path d="M-3.4-3.6L3.4-3.6M-1.9-7.6L1.9-7.6" stroke="#e0536c" stroke-width="1.4"/><circle cx="0" cy="-12.6" r="1.7" fill="#e0536c"/>'],
 ['tophat','Top hat',7,'<rect x="-7.6" y="-1.2" width="15.2" height="2.2" rx="1.1" fill="#2b2b31"/><rect x="-4.9" y="-10.4" width="9.8" height="9.6" rx=".9" fill="#2b2b31"/><rect x="-4.9" y="-3.9" width="9.8" height="1.9" fill="#c0392b"/>'],
 ['crown','Crown',9,'<path d="M-6 .8V-6.6L-3-3.2L0-8L3-3.2L6-6.6V.8z" fill="#f2c230" stroke="#c9961a" stroke-width=".5" stroke-linejoin="round"/><circle cx="0" cy="-2.2" r="1" fill="#d6455d"/><circle cx="-3.6" cy="-1.6" r=".8" fill="#4aa3df"/><circle cx="3.6" cy="-1.6" r=".8" fill="#4aa3df"/>']];
const badgeCount=()=>{/* in the preview everything is unlocked, to try it */if(window.EB_SAMPLE)return 99;try{return badgeList().filter(b=>b[4]).length}catch(e){return 0}};
function petAccSvg(pet,acc){const h=PETHEAD[pet],a=ACCS.find(x=>x[0]===acc);if(!h||!a)return'';return `<g class="acc" style="transform-box:view-box;transform-origin:0 0" transform="translate(${h[0]} ${h[1]}) rotate(${h[3]}) scale(${h[2]})">${a[3]}</g>`}
function petAcc(){const c=document.querySelector('#catw .cat');if(!c)return;c.querySelectorAll('.acc').forEach(e=>e.remove());const a=ACCS.find(x=>x[0]===look._acc);if(!a||badgeCount()<a[2])return;c.insertAdjacentHTML('beforeend',petAccSvg(sid('pet'),a[0]))}
{const al=applyLook;applyLook=function(){const r=al.apply(this,arguments);try{petAcc()}catch(e){}return r}}
/* Customize: accessory, my shelves, Kindle import */
/* resetting the room keeps your shelves and what the animal has earned the right to wear */
{const r=$('rst'),old=r.onclick;r.onclick=function(){const keep={_shelves:look._shelves};old.apply(this,arguments);if(keep._shelves){look._shelves=keep._shelves;try{localStorage.setItem(LK,JSON.stringify(look))}catch(e){}}}}

/* ---------- a card of one book, to share ---------- */
async function shareBook(){
 if(!cur)return;
 /* share what is on screen right now, even if it has not been saved yet: the thoughts just typed and the stars just tapped */
 let b=cur;try{b=Object.assign({},cur,{note:$('note').value.trim(),status:fStatus||cur.status,stars:fStatus==='read'?(fStars||null):cur.stars})}catch(e){}const W=1080,cs=getComputedStyle(document.documentElement),col=n=>cs.getPropertyValue(n).trim();
 const ink=col('--ink')||'#2a2118',mut=col('--muted')||'#7a6a58';
 /* everything the card says is laid out first, so the picture is made exactly as tall as it needs to be */
 const m=document.createElement('canvas').getContext('2d'),wrapW=(t,font,maxW,maxL)=>{m.font=font;const ws=String(t).split(/\s+/),out=[];let ln='';ws.forEach(w=>{if(m.measureText((ln+' '+w).trim()).width>maxW&&ln){out.push(ln);ln=w}else ln=(ln+' '+w).trim()});if(ln)out.push(ln);if(out.length>maxL){out.length=maxL;out[maxL-1]=fitText(m,out[maxL-1]+'…',maxW)}return out};
 const rows=[],add=(lines,font,color,lh,gap)=>lines.forEach((t,i)=>rows.push({t,font,color,lh,gap:i?0:gap||0}));
 add(wrapW(b.title||'','700 60px Georgia,serif',W-160,2),'700 60px Georgia,serif',ink,72,0);
 if(b.author)add(wrapW(b.author,'italic 40px Georgia,serif',W-200,1),'italic 40px Georgia,serif',mut,56,4);
 if(b.series)add(wrapW(b.series+(b.seriesNo?' · #'+b.seriesNo:''),'600 32px system-ui,sans-serif',W-200,1),'600 32px system-ui,sans-serif',mut,46,6);
 if(st(b)==='read'&&b.stars)add([starStr(b.stars)],'56px system-ui,sans-serif','#e0a526',70,24);
 const when=st(b)==='read'&&b.finished?L('Finished {d}',{d:fmtDate(b.finished)}):st(b)==='reading'&&b.started?L('Reading since {d}',{d:fmtDate(b.started)}):'',tg=(b.tags||[]).slice(0,4).join(' · '),meta=[when,tg].filter(Boolean).join('   ·   ');
 if(meta)add(wrapW(meta,'30px system-ui,sans-serif',W-180,2),'30px system-ui,sans-serif',mut,44,10);
 const note=(b.note||'').replace(/\s+/g,' ').trim();if(note)add(wrapW('“'+note+'”','italic 36px Georgia,serif',W-200,8),'italic 36px Georgia,serif',ink,50,26);
 let qt='';try{const q=quotes.find(q=>q.bookId===b.id&&q.text);if(q)qt=String(q.text).replace(/\s+/g,' ').trim()}catch(e){}
 if(qt)add(wrapW('❝ '+qt,'34px Georgia,serif',W-240,4),'34px Georgia,serif',mut,48,30);
 const textH=rows.reduce((a,r)=>a+r.lh+r.gap,0),cw=400,ch=600,cy=90,H=Math.max(1350,cy+ch+96+textH+60+150);
 const cv=document.createElement('canvas');cv.width=W;cv.height=H;const x=cv.getContext('2d');
 const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,col('--wall')||'#e9dcc4');g.addColorStop(1,col('--wall2')||'#e3d4b9');x.fillStyle=g;x.fillRect(0,0,W,H);x.fillStyle=col('--wood')||'#9a6538';x.fillRect(0,H-150,W,150);x.fillStyle='rgba(0,0,0,.18)';x.fillRect(0,H-150,W,10);
 const cx=(W-cw)/2;x.save();x.shadowColor='rgba(0,0,0,.4)';x.shadowBlur=40;x.shadowOffsetY=18;x.fillStyle=b.color||'#8b2e2e';
 let drawn=false;const src=draft.cover||b.cover;if(src){try{const im=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});const ar=im.naturalWidth/im.naturalHeight,w=Math.min(520,ch*ar),h=w/ar;x.drawImage(im,(W-w)/2,cy+(ch-h)/2,w,h);drawn=true}catch(e){}}
 if(!drawn){x.fillRect(cx,cy,cw,ch);x.restore();x.save();x.fillStyle=lum(b.color||'#8b2e2e')>150?'#222':'#fff';x.textAlign='center';x.font='700 44px Georgia,serif';const ws=(b.title||'').split(/\s+/);let ln='',yy=cy+150;ws.forEach(w=>{if(x.measureText(ln+' '+w).width>cw-70&&ln){x.fillText(ln,W/2,yy);yy+=56;ln=w}else ln=(ln+' '+w).trim()});x.fillText(ln,W/2,yy)}
 x.restore();x.textAlign='center';let y=cy+ch+110;
 rows.forEach(r=>{y+=r.gap;x.font=r.font;x.fillStyle=r.color;x.fillText(r.t,W/2,y);y+=r.lh});
 x.fillStyle='#fff';x.globalAlpha=.9;x.font='600 34px system-ui,sans-serif';x.fillText('\u{1F4DA} My Bookshelf',W/2,H-62);x.globalAlpha=1;
 cv.toBlob(bl=>{if(!bl)return;yrBlob=bl;yrName='book-'+String(b.title||'card').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40)+'.png';const im=$('yrimg');im.src=URL.createObjectURL(bl);$('yrshare').hidden=!(navigator.canShare&&navigator.canShare({files:[new File([bl],yrName,{type:'image/png'})]}));recBook=b;$('yrlink').hidden=false;$('yrov').classList.add('on')},'image/png')}
/* ---------- recommend a book with a link: everything travels inside the link itself, nothing is stored anywhere ---------- */
let recBook=null,recIn=null;
const recEnc=o=>{const u=new TextEncoder().encode(JSON.stringify(o));let s='';u.forEach(c=>s+=String.fromCharCode(c));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const recDec=c=>{const s=atob(c.replace(/-/g,'+').replace(/_/g,'/')),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return JSON.parse(new TextDecoder().decode(u))};
function recLink(b,by){
 const o={v:1,t:String(b.title||'').slice(0,120)};if(b.author)o.a=String(b.author).slice(0,80);if(b.isbn)o.i=b.isbn;if(st(b)==='read'&&b.stars)o.s=b.stars;
 const n=(b.note||'').trim();if(n)o.n=n.slice(0,600);if(b.series){o.se=String(b.series).slice(0,60);if(b.seriesNo)o.sn=b.seriesNo}if(b.color)o.c=b.color;if(by)o.by=by.slice(0,30);
 try{const q=quotes.find(q=>q.bookId===b.id&&q.text);if(q)o.q=String(q.text).trim().slice(0,240)}catch(e){}
 return (location.hostname==='spendrax.github.io'?location.origin+location.pathname:'https://spendrax.github.io/Bookshelf/')+'#rec='+recEnc(o)}
$('yrlink').onclick=async()=>{
 const b=recBook;if(!b)return;$('yrov').classList.remove('on');
 let by=null;try{by=localStorage.getItem('bookshelf-name')}catch(e){}
 if(by===null){const inp=$('askin'),t0=inp.type;inp.type='text';inp.removeAttribute('inputmode');inp.value='';inp.maxLength=30;inp.hidden=false;const ok=await ask(L('Your first name, so your friend knows who it is from (optional)'),L('Continue'));inp.hidden=true;by=ok?String(inp.value||'').trim().slice(0,30):'';inp.type=t0;inp.setAttribute('inputmode','numeric');inp.value='';if(!ok)return;try{localStorage.setItem('bookshelf-name',by)}catch(e){}}
 const url=recLink(b,by),text=L('I recommend “{t}”. Open this link to see what I thought and add it to your My Bookshelf:',{t:b.title});
 try{if(navigator.share){await navigator.share({title:b.title,text,url});return}}catch(e){if(e&&e.name==='AbortError')return}
 try{await navigator.clipboard.writeText(text+' '+url);toast(L('Link copied. Paste it in a message to your friend.'))}catch(e){prompt('',url)}};
new MutationObserver(()=>{if(!$('yrov').classList.contains('on'))$('yrlink').hidden=true}).observe($('yrov'),{attributes:true,attributeFilter:['class']});
const recSame=o=>{const i=o.i&&toIsbn13(o.i),k=s=>String(s||'').trim().toLowerCase();return books.find(b=>(i&&b.isbn&&toIsbn13(b.isbn)===i)||(k(b.title)===k(o.t)&&k(b.author)===k(o.a)))};
function recCheck(){
 let c;try{c=/[#&]rec=([\w-]+)/.exec(location.hash)}catch(e){}if(!c)return;
 try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
 let o;try{o=recDec(c[1])}catch(e){}if(!o||typeof o.t!=='string'||!o.t.trim()){toast(L('That link could not be read.'));return}
 const S=(v,n)=>typeof v==='string'?v.slice(0,n):'';o={t:S(o.t,120).trim(),a:S(o.a,80),i:S(o.i,17).replace(/[^0-9Xx]/g,''),s:Math.max(0,Math.min(5,+o.s||0)),n:S(o.n,600),se:S(o.se,60),sn:+o.sn||0,c:/^#[0-9a-f]{6}$/i.test(o.c||'')?o.c:'',by:S(o.by,30).trim(),q:S(o.q,240)};recIn=o;
 $('rectitle').textContent=o.by?L('{name} recommends a book',{name:o.by}):L('A friend recommends a book');
 $('recbook').textContent=o.t;$('recauthor').textContent=[o.a,o.se?o.se+(o.sn?' · #'+o.sn:''):''].filter(Boolean).join(' — ');
 $('recstars').textContent=o.s?starStr(o.s):'';$('recstars').hidden=!o.s;$('recnote').textContent=o.n?'“'+o.n+'”':'';$('recnote').hidden=!o.n;$('recquote').textContent=o.q?'❝ '+o.q:'';$('recquote').hidden=!o.q;
 const have=recSame(o);$('rechave').hidden=!have;$('recadd').textContent=have?L('Keep their opinion with my book'):L('Add to Want to read');$('recadd').hidden=!!have&&!o.n&&!o.s;
 document.querySelectorAll('.ov.on').forEach(e=>{if(e.id!=='recov'&&e.id!=='ov')e.classList.remove('on')});$('recov').classList.add('on')}
$('recadd').onclick=()=>{
 const o=recIn;if(!o)return;$('recov').classList.remove('on');const have=recSame(o),who=o.by||L('A friend');
 if(have){have.recBy=have.recBy||who;have.recStars=o.s||0;have.recNote=o.n||'';store();render();toast(L('Saved with your book.'));return}
 const isbn=o.i?(toIsbn13(o.i)||o.i):'';
 const b={id:'b'+Date.now().toString(36),w:30+Math.floor(Math.random()*24),h:150+Math.floor(Math.random()*62),createdAt:Date.now(),isbn,title:o.t,author:o.a,status:'want',stars:null,tags:[],series:o.se?normSeries(o.se):'',seriesNo:o.sn||0,seriesOf:0,recBy:who,recStars:o.s||0,recNote:o.n||'',lentTo:'',lentOn:'',genres:[],page:0,pages:0,started:'',finished:'',past:false,note:'',blurb:'',color:o.c||'#'+Math.floor(Math.random()*0x777777+0x111111).toString(16).padStart(6,'0'),cover:'',back:'',spine:''};
 books.push(b);try{placeInSeries(b)}catch(e){}store();render();toast(L('Added to Want to read.'));
 /* the cover and the page count come in the background when the book has an ISBN */
 if(isbn)(async()=>{try{const d=await isbnData(isbn);if(d&&books.includes(b)){if(!b.pages)b.pages=d.pages||d.number_of_pages_median||0;if(!b.blurb&&d.desc)b.blurb=String(d.desc).replace(/<[^>]+>/g,'').slice(0,1200)}
   const c=await fromUrl(d&&d.cover_i?`https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg?default=false`:`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`,240);if(books.includes(b)&&!b.cover){b.cover=c;if(!o.c){const col=await avgColor(c);if(col)b.color=col}}}catch(e){}if(books.includes(b)){store();render()}})()};
$('recx').onclick=()=>$('recov').classList.remove('on');
addEventListener('hashchange',recCheck);setTimeout(()=>recCheck(),1300);
/* what the friend thought stays with the book */
{const om=openModal;openModal=function(b){const r=om.apply(this,arguments);try{const p=$('recline'),has=b&&(b.recNote||b.recStars);p.hidden=!has;if(has)p.textContent='\u{1F4AC} '+(b.recBy||L('A friend'))+(b.recStars?' '+starStr(b.recStars):'')+(b.recNote?' — “'+b.recNote+'”':'')}catch(e){}return r}}
$('sharebk').onclick=shareBook;

/* ---------- more rewards: a decoration for the bookcase and a second animal ---------- */
const DECOS=[['tea','Cup of tea',2,'<ellipse cx="23" cy="47" rx="15" ry="3" fill="#e9e2d2"/><path d="M12 30h20v8a10 9 0 0 1-20 0z" fill="#f6f1e6"/><path d="M32 32h3a4 4 0 0 1 0 8h-3" fill="none" stroke="#f6f1e6" stroke-width="2.4"/><path d="M12 30h20" stroke="#b5562f" stroke-width="2"/><path d="M18 24q-3-4 0-8M25 25q-3-5 0-10" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>'],
 ['trophy','Trophy',4,'<rect x="14" y="44" width="18" height="5" rx="1" fill="#5a3a22"/><rect x="20" y="36" width="6" height="9" fill="#d9a520"/><path d="M12 12h22v8a11 12 0 0 1-22 0z" fill="#f2c230"/><path d="M12 14H7a5 6 0 0 0 7 9M34 14h5a5 6 0 0 1-7 9" fill="none" stroke="#d9a520" stroke-width="2.4"/><path d="M23 14.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fff6c8"/>'],
 ['globe','Globe',6,'<rect x="15" y="45" width="16" height="4" rx="1.5" fill="#5a3a22"/><rect x="21.5" y="38" width="3" height="8" fill="#8a6a3a"/><circle cx="23" cy="23" r="15" fill="#4a90c2"/><path d="M14 16q5-4 9 0t6 6q-4 5-8 2t-7-8zM24 31q4-2 7 1q-3 5-7 4z" fill="#6fb36a"/><path d="M8 26a15.5 15.5 0 0 0 30 0" fill="none" stroke="#8a6a3a" stroke-width="1.8"/>']];
/* decorations for specific popular books: secret until you've read one of them (title, series or author match) */
const BOOKDECOS=[
 ["trident","Trident",/percy jackson|heroes of olympus|lightning thief|sea of monsters|titan'?s curse|battle of the labyrinth|last olympian/,"<ellipse cx=\"23\" cy=\"47\" rx=\"14\" ry=\"2.6\" fill=\"rgba(0,0,0,.18)\"/><path d=\"M23 47V13\" stroke=\"#9c7a22\" stroke-width=\"3.2\"/><path d=\"M23 47V13\" stroke=\"#e2bd55\" stroke-width=\"1.6\"/><path d=\"M14 6v7q0 5 9 5t9-5V6\" fill=\"none\" stroke=\"#e2bd55\" stroke-width=\"2.4\"/><path d=\"M23 18V3\" stroke=\"#e2bd55\" stroke-width=\"2.4\"/><path d=\"M12 8l2-5 2 5zM21 4l2-4 2 4zM30 8l2-5 2 5z\" fill=\"#e2bd55\"/><circle cx=\"23\" cy=\"20\" r=\"1.8\" fill=\"#3c8fc4\"/>"],
 ["wand","Wand",/harry potter/,"<ellipse cx=\"23\" cy=\"47\" rx=\"14\" ry=\"2.6\" fill=\"rgba(0,0,0,.18)\"/><path d=\"M11 45L34 12\" stroke=\"#4a2c17\" stroke-width=\"3.4\" stroke-linecap=\"round\"/><path d=\"M11 45l5-7\" stroke=\"#2e1b0e\" stroke-width=\"4.6\" stroke-linecap=\"round\"/><path d=\"M36 4l1.2 3 3 1.2-3 1.2L36 12.4l-1.2-3-3-1.2 3-1.2z\" fill=\"#ffe27a\"/><circle cx=\"41\" cy=\"15\" r=\"1.1\" fill=\"#ffe27a\"/><circle cx=\"29\" cy=\"6\" r=\".9\" fill=\"#ffe27a\"/>"],
 ["ring","Golden ring",/lord of the rings|the hobbit|fellowship of the ring|two towers|return of the king|tolkien|seigneur des anneaux/,"<ellipse cx=\"23\" cy=\"44\" rx=\"15\" ry=\"4.5\" fill=\"#7a2d34\"/><ellipse cx=\"23\" cy=\"42.5\" rx=\"15\" ry=\"4.5\" fill=\"#a63e47\"/><ellipse cx=\"23\" cy=\"34\" rx=\"8.5\" ry=\"8\" fill=\"none\" stroke=\"#a87c1c\" stroke-width=\"4.2\"/><ellipse cx=\"23\" cy=\"34\" rx=\"8.5\" ry=\"8\" fill=\"none\" stroke=\"#f1cc5a\" stroke-width=\"2.6\"/><path d=\"M17 29q3-3 7-3\" stroke=\"#fff6cf\" stroke-width=\"1\" fill=\"none\"/>"],
 ["bow","Bow and arrow",/hunger games|catching fire|mockingjay|songbirds and snakes|sunrise on the reaping/,"<ellipse cx=\"23\" cy=\"47\" rx=\"14\" ry=\"2.6\" fill=\"rgba(0,0,0,.18)\"/><path d=\"M16 4q16 21 0 42\" fill=\"none\" stroke=\"#5b3a1e\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path d=\"M16 4v42\" stroke=\"#ddd\" stroke-width=\".8\"/><path d=\"M6 25h32\" stroke=\"#7b5a3a\" stroke-width=\"1.6\"/><path d=\"M38 25l-5-3v6z\" fill=\"#9aa3ad\"/><path d=\"M6 25l3-3h3l-3 3 3 3H9z\" fill=\"#c9433e\"/>"],
 ["rose","Thorny rose",/court of thorns|court of mist|court of wings|court of frost|court of silver|acotar/,"<path d=\"M17 47h12l2-12H15z\" fill=\"#d9d2c4\"/><path d=\"M23 36V14\" stroke=\"#3f6b35\" stroke-width=\"2\"/><path d=\"M23 30l-3-2M23 24l3-2M23 19l-3-1.5\" stroke=\"#3f6b35\" stroke-width=\"1.4\"/><path d=\"M23 26q6-3 8 1q-5 2-8-1z\" fill=\"#4e8a3f\"/><circle cx=\"23\" cy=\"11\" r=\"6.5\" fill=\"#b3263a\"/><path d=\"M19 10q4-5 8 0q-4 3-8 0zM20 13q3 2 6 0\" fill=\"none\" stroke=\"#7e1426\" stroke-width=\"1.1\"/>"],
 ["dagger","Dagger",/fourth wing|iron flame|onyx storm|empyrean/,"<rect x=\"13\" y=\"40\" width=\"20\" height=\"7\" rx=\"1.5\" fill=\"#5a4636\"/><path d=\"M23 40V12l-3 5v23z\" fill=\"#c9d1d8\"/><path d=\"M23 40V12l3 5v23z\" fill=\"#9aa5ae\"/><path d=\"M15 12h16\" stroke=\"#3b2f28\" stroke-width=\"2.6\" stroke-linecap=\"round\"/><path d=\"M23 12V3\" stroke=\"#2a211c\" stroke-width=\"3.4\" stroke-linecap=\"round\"/><circle cx=\"23\" cy=\"2.5\" r=\"2\" fill=\"#8e7a3a\"/>"],
 ["lamp","Lamppost",/narnia|lion, the witch|magician'?s nephew|prince caspian|dawn treader|silver chair/,"<ellipse cx=\"23\" cy=\"47\" rx=\"14\" ry=\"2.6\" fill=\"rgba(0,0,0,.18)\"/><circle cx=\"23\" cy=\"13\" r=\"10\" fill=\"#ffd77a\" opacity=\".35\"/><path d=\"M23 47V17\" stroke=\"#2b2b2b\" stroke-width=\"2.4\"/><path d=\"M18 47h10\" stroke=\"#2b2b2b\" stroke-width=\"3\"/><path d=\"M18 9h10l-2 9h-6z\" fill=\"#ffe08a\" stroke=\"#2b2b2b\" stroke-width=\"1.4\"/><path d=\"M17 9l6-5 6 5z\" fill=\"#2b2b2b\"/><path d=\"M8 47q3-2 6 0M30 47q4-2 8 0\" stroke=\"#fff\" stroke-width=\"1.6\" fill=\"none\"/>"],
 ["glass","Magnifying glass",/sherlock|conan doyle|baskervilles|study in scarlet/,"<ellipse cx=\"23\" cy=\"47\" rx=\"14\" ry=\"2.6\" fill=\"rgba(0,0,0,.18)\"/><path d=\"M28 30l9 15\" stroke=\"#4a2c17\" stroke-width=\"4.4\" stroke-linecap=\"round\"/><circle cx=\"20\" cy=\"20\" r=\"11\" fill=\"#cfe6f2\" fill-opacity=\".55\" stroke=\"#a87c1c\" stroke-width=\"3\"/><path d=\"M14 16q3-5 8-5\" stroke=\"#fff\" stroke-width=\"1.6\" fill=\"none\"/>"],
 ["watch","Pocket watch",/alice'?s adventures|wonderland|looking.glass|lewis carroll|alice au pays/,"<ellipse cx=\"23\" cy=\"47\" rx=\"14\" ry=\"2.6\" fill=\"rgba(0,0,0,.18)\"/><path d=\"M23 15q-12-9-6-14q5-3 9 3\" fill=\"none\" stroke=\"#c9a23c\" stroke-width=\"1.4\" stroke-dasharray=\"2 1\"/><circle cx=\"23\" cy=\"31\" r=\"14\" fill=\"#c9a23c\"/><circle cx=\"23\" cy=\"31\" r=\"11.5\" fill=\"#fbf6e8\"/><path d=\"M23 31V23M23 31l5 3\" stroke=\"#333\" stroke-width=\"1.5\" stroke-linecap=\"round\"/><circle cx=\"23\" cy=\"15.5\" r=\"2.2\" fill=\"#c9a23c\"/>"],
 ["rocket","Little rocket",/project hail mary|the martian|andy weir/,"<ellipse cx=\"23\" cy=\"47\" rx=\"14\" ry=\"2.6\" fill=\"rgba(0,0,0,.18)\"/><path d=\"M23 3q9 9 7 30H16q-2-21 7-30z\" fill=\"#e9edf1\" stroke=\"#8a96a3\" stroke-width=\"1.2\"/><circle cx=\"23\" cy=\"17\" r=\"3.6\" fill=\"#5aa0d6\" stroke=\"#8a96a3\" stroke-width=\"1\"/><path d=\"M16 26l-6 9h7zM30 26l6 9h-7z\" fill=\"#c9433e\"/><path d=\"M19 34q4 9 8 0z\" fill=\"#ffb23e\"/>"],
 ["pickaxe","Pickaxe",/red rising|golden son|pierce brown/,"<ellipse cx=\"23\" cy=\"47\" rx=\"14\" ry=\"2.6\" fill=\"rgba(0,0,0,.18)\"/><path d=\"M14 46L30 10\" stroke=\"#6b4423\" stroke-width=\"3.2\" stroke-linecap=\"round\"/><path d=\"M15 12q15-6 27 4q-12-4-26 1z\" fill=\"#9aa5ae\" stroke=\"#5f6870\" stroke-width=\"1\"/><path d=\"M27 9l5 3\" stroke=\"#b3262f\" stroke-width=\"2.4\"/>"],
 ["crown","Crown",/throne of glass|crown of midnight|heir of fire|queen of shadows|empire of storms|tower of dawn|kingdom of ash/,"<ellipse cx=\"23\" cy=\"44\" rx=\"16\" ry=\"4.5\" fill=\"#3b4f7a\"/><ellipse cx=\"23\" cy=\"42.5\" rx=\"16\" ry=\"4.5\" fill=\"#55699a\"/><path d=\"M11 39l-2-20 8 8 6-12 6 12 8-8-2 20z\" fill=\"#f1cc5a\" stroke=\"#a87c1c\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/><circle cx=\"23\" cy=\"32\" r=\"2.2\" fill=\"#c9433e\"/><circle cx=\"15\" cy=\"34\" r=\"1.6\" fill=\"#3c8fc4\"/><circle cx=\"31\" cy=\"34\" r=\"1.6\" fill=\"#3c8fc4\"/>"],
 ["feather","Black feather",/six of crows|crooked kingdom|shadow and bone|siege and storm|ruin and rising|leigh bardugo/,"<path d=\"M15 47h16l-2-7H17z\" fill=\"#6b5a4a\"/><path d=\"M23 41Q16 22 29 3q4 14-6 38z\" fill=\"#26262c\"/><path d=\"M23 41Q22 22 29 3\" stroke=\"#55555e\" stroke-width=\".9\" fill=\"none\"/>"],
 ["quill","Quill and ink",/jane austen|pride and prejudice|sense and sensibility|northanger abbey|mansfield park|orgueil et pr[eé]jug[eé]s/,"<ellipse cx=\"23\" cy=\"47\" rx=\"14\" ry=\"2.6\" fill=\"rgba(0,0,0,.18)\"/><path d=\"M14 47h18v-9q0-5-9-5t-9 5z\" fill=\"#2c3550\"/><rect x=\"18\" y=\"31\" width=\"10\" height=\"4\" rx=\"1\" fill=\"#1d2335\"/><path d=\"M23 33L35 4q2 12-8 22z\" fill=\"#f4efe4\" stroke=\"#b9ae98\" stroke-width=\".8\"/>"]];
DECOS.push(...BOOKDECOS);
const readTxt=()=>books.filter(b=>st(b)==='read'||(b.reads||[]).some(r=>r.finished)).map(b=>[b.title,b.series,b.author].join(' ').toLowerCase());
const readMatch=rx=>readTxt().some(t=>rx.test(t));
const decoOk=d=>typeof d[2]==='number'?badgeCount()>=d[2]:readMatch(d[2]);
/* what the pickers list: badge decorations (locked ones show how many badges), and only the book ones you've earned */
const decoList=()=>DECOS.filter(d=>typeof d[2]==='number'||decoOk(d)).map(d=>[d[0],d[1],typeof d[2]==='number'?d[2]:0]);
/* ---------- secret dragon: an animal of its own, hatched from an egg after reading a dragon book; its color comes from a quiz or your own pick ---------- */
const DRAGON_RX=/dragon|eragon|brisingr|fourth wing|iron flame|onyx storm|empyrean|wings of fire|temeraire|\bpern\b|priory of the orange tree/;
const DRAGONS=[["#2b2b33", "Black"], ["#b8322f", "Red"], ["#7a5233", "Brown"], ["#d9772b", "Orange"], ["#2f5fa8", "Blue"], ["#d2a63a", "Gold"], ["#3f8f4e", "Green"], ["#b9c0c8", "Silver"]];
const dragonOn=()=>{try{return localStorage.getItem('bookshelf-dragon')==='1'}catch(e){return false}};
/* new book decorations get a toast; the first dragon book brings an egg, and a little quiz (or your own pick) gives the dragon's color */
/* ---------- silver spirit: after reading Harry Potter, a quiz finds your spirit animal and it can glow silver-blue ---------- */
const spiritOn=()=>{try{return localStorage.getItem('bookshelf-spirit')==='1'}catch(e){return false}};
const spiritShow=()=>spiritOn()&&look._spirit==='1'&&sid('pet')!=='none';
/* the spirit comes with the third book (the one with the silver guardian), or any later one */
const hp3=()=>books.some(b=>(st(b)==='read'||(b.reads||[]).some(r=>r.finished))&&(/prisoner of azkaban|goblet of fire|order of the phoenix|half.blood prince|deathly hallows|prisonnier d.azkaban|coupe de feu|ordre du ph[eé]nix|prince de sang|reliques de la mort/.test([b.title,b.series].join(' ').toLowerCase())||(/harry potter/.test((b.series||'').toLowerCase())&&+b.seriesNo>=3)));
const SPIRITS=['dog','bird','turtle','owl','hedgehog','fox','bunny','cat'];
{const al=applyLook;applyLook=function(){const r=al.apply(this,arguments);try{catw.classList.toggle('spirit',spiritShow())}catch(e){}return r}}
/* the room was already drawn when this loads, so set the glow once now too */
try{catw.classList.toggle('spirit',spiritShow())}catch(e){}
async function spiritHatch(){
 try{localStorage.setItem('bookshelf-spirit','1')}catch(e){}
 if(!await ask(L('\u2728 A silver spirit appeared! Do you want to find your spirit animal?'),L('Take the quiz'),L('Keep my animal'))){
  look._spirit='1';czSaveLook();try{applyLook()}catch(e){}try{buildPanel()}catch(e){}toast('\u2728 '+L('Turn the glow on or off in Customize \u203A Animal.'));return}
 let i=0;
 if(!await ask(L('When things get hard, you\u2026'),L('\u{1F6E1}\uFE0F Stand your ground'),L('\u{1F5DD}\uFE0F Find a clever way out')))i+=4;
 if(!await ask(L('You\u2019d rather spend a free day\u2026'),L('\u{1F332} Outside exploring'),L('\u{1F3E0} Cozy at home')))i+=2;
 if(!await ask(L('Your friends would call you\u2026'),L('\u{1F91D} Loyal'),L('\u{1F50E} Curious')))i+=1;
 const a=SPIRITS[i],nm=OPTS.find(o=>o.k==='pet').i.find(x=>x[0]===a)[1];
 look.pet=a;look._spirit='1';czSaveLook();try{applyLook()}catch(e){}try{moveCat()}catch(e){}try{buildPanel()}catch(e){}
 toast('\u2728 '+L('Your spirit animal is: {a}!',{a:L(nm)})+' '+L('Turn the glow on or off in Customize \u203A Animal.'))}
/* ---------- "What's new" card: shown once after an important update (people who just installed don't get it).
   For the next important update: give NEWS a new id and new lines (and add their translations to i18n.js). ---------- */
const NEWS={id:'2026-10-21',items:[
 '\u{1F49E} Pair your bookshelf with someone: their shelves, goals, stats and animal appear on the far side of your room. Customize › More.',
 '\u{1F517} Share your shelf with a friend through a link, and visit your friends’ shelves.',
 '☁️ Back up to your own Google Drive and get your library back on any phone.',
 '\u{1F381} Some popular books now hide secret surprises. Keep reading to find them!',
 '\u{1F4D6} Books move to Read by themselves on the last page, and you can fix the minutes after a reading session.']};
const NEWSK='bookshelf-news';
function newsOpen(){const ul=$('newslist');ul.replaceChildren(...NEWS.items.map(t=>el('li','',L(t))));$('newsh').textContent='✨ '+L('What’s new');$('lov').classList.remove('on');$('newsov').classList.add('on');try{localStorage.setItem(NEWSK,NEWS.id)}catch(e){}}
$('newsx').onclick=()=>$('newsov').classList.remove('on');
setTimeout(function newsCheck(){if(!booksReady){setTimeout(newsCheck,800);return}let seen=null;try{seen=localStorage.getItem(NEWSK)}catch(e){}if(seen===NEWS.id)return;
 /* brand-new people: nothing is "new" to them yet */
 if(!books.length){try{localStorage.setItem(NEWSK,NEWS.id)}catch(e){}return}
 if(document.querySelector('.ov.on'))return;newsOpen()},1800);
let unlockBusy=false;
async function checkUnlocks(){if(unlockBusy)return;if($('newsov').classList.contains('on')){setTimeout(()=>{try{checkUnlocks()}catch(e){}},3000);return}unlockBusy=true;try{
 let seen=[];try{seen=JSON.parse(localStorage.getItem('bookshelf-bdecos')||'[]')}catch(e){}
 const fresh=BOOKDECOS.filter(d=>!seen.includes(d[0])&&readMatch(d[2]));
 if(fresh.length){try{localStorage.setItem('bookshelf-bdecos',JSON.stringify(seen.concat(fresh.map(d=>d[0]))))}catch(e){}
  toast('\u{1F381} '+L('New decoration: {n}',{n:fresh.map(d=>L(d[1])).join(', ')}));try{buildPanel()}catch(e){}await new Promise(r=>setTimeout(r,3200))}
 if(!spiritOn()&&hp3()){await spiritHatch();await new Promise(r=>setTimeout(r,3200))}
 if(dragonOn()||!readMatch(DRAGON_RX))return;
 try{localStorage.setItem('bookshelf-dragon','1')}catch(e){}
 const quiz=await ask(L('\u{1F95A} You found a dragon egg! A baby dragon is about to hatch. How do you want to find its color?'),L('Take the quiz'),L('I already know my dragon'));
 let c='#3f8f4e';
 if(quiz){let i=0;
  if(!await ask(L('Where do you read best?'),L('\u{1F525} By a fire'),L('☁️ Under the open sky')))i+=4;
  if(!await ask(L('Your favorite part of a story?'),L('⚔️ The battles'),L('\u{1F5DD}️ The secrets')))i+=2;
  if(!await ask(L('Pick a time of day'),L('\u{1F319} Midnight'),L('\u{1F305} Sunrise')))i+=1;
  c=DRAGONS[i][0]}
 look._dragon=c;look.pet='dragon';czSaveLook();try{applyLook()}catch(e){}try{moveCat()}catch(e){}try{buildPanel()}catch(e){}
 toast(quiz?'\u{1F409} '+L('Your dragon is {c}!',{c:L(DRAGONS.find(x=>x[0]===c)[1])})+' '+L('It’s your animal now. Change it in Customize › Animal.'):'\u{1F409} '+L('Pick your dragon’s color in Customize › Animal.'))
}finally{unlockBusy=false}}
setTimeout(()=>{try{checkUnlocks()}catch(e){}},6000);
const FRIEND_AT=6;
function roomRewards(){const n=badgeCount(),cs=document.querySelector('.scene>.case:not(.small)'),wc=$('wantcase');
 if(cs){let d=cs.querySelector('.deco');const a=DECOS.find(x=>x[0]===look._deco);if(!a||!decoOk(a)){if(d)d.remove()}else{if(!d){d=document.createElementNS('http://www.w3.org/2000/svg','svg');d.setAttribute('class','deco');d.setAttribute('viewBox','0 0 46 50');d.setAttribute('aria-hidden','true');cs.append(d)}if(d.dataset.k!==a[0]){d.dataset.k=a[0];d.innerHTML=a[3]}}}
 if(wc){let f=$('friend');const an=ANIMALS[look._friend];if(!an||n<FRIEND_AT||look._friend===sid('pet')){if(f)f.remove()}else{if(!f){f=el('div','friend');f.id='friend';f.onclick=()=>{const s=f.firstChild;s.classList.remove('hop');void s.offsetWidth;s.classList.add('hop');try{sfx('pop')}catch(e){}};wc.append(f)}
   if(f.dataset.k!==look._friend){f.dataset.k=look._friend;f.innerHTML='<svg class="cat" viewBox="0 0 60 56" aria-hidden="true" style="'+an[0]+';--cat:initial;--cat-st:initial;--cat-eye:initial;--cat-nose:initial">'+an[1]+'</svg>'}}}}
{const al=applyLook;applyLook=function(){const r=al.apply(this,arguments);try{roomRewards()}catch(e){}return r}}
/* ---------- your own shelves: drag a book along its shelf to change the order ---------- */
let csd=null;
function csBegin(){if(!csd||csd.active)return;csd.active=true;csd.x=csd.px;csd.y=csd.py;csd.sy=RV.scrollTop;csd.s.classList.add('dragging');document.body.classList.add('dragmode');try{swipe=null}catch(e){}if(navigator.vibrate)navigator.vibrate(12);csUpdate()}
function csUpdate(){const s=csd.s,box=s.closest('.case.cs');s.style.transform=`translate(${csd.px-csd.x}px,${csd.py-csd.y+RV.scrollTop-csd.sy}px) scale(1.06)`;
 const sibs=[...box.querySelectorAll('.csb')].filter(o=>o!==s),rows=[...box.querySelectorAll('.row')];let row=rows[0],bd=1e9;rows.forEach(r=>{const rc=r.getBoundingClientRect(),d=csd.py<rc.top?rc.top-csd.py:csd.py>rc.bottom?csd.py-rc.bottom:0;if(d<bd){bd=d;row=r}});
 const rs=sibs.filter(o=>o.parentNode===row);let ref=null,after=true,k=sibs.length;
 if(rs.length){const i=rs.findIndex(o=>{const r=o.getBoundingClientRect();return csd.px<r.left+r.width/2});if(i>=0){ref=rs[i];k=sibs.indexOf(ref);after=false}else{ref=rs[rs.length-1];k=sibs.indexOf(ref)+1}}
 csd.idx=k;csd.ids=sibs.map(o=>o.dataset.id);if(ref){const rr=ref.getBoundingClientRect();ins.style.cssText=`display:block;left:${after?rr.right-1:rr.left-3}px;top:${rr.top}px;height:${rr.height}px`}else ins.style.display='none'}
function csEnd(cancel){if(!csd)return;clearTimeout(csd.t);const d=csd;csd=null;if(!d.active)return;justDragged=true;setTimeout(()=>{justDragged=false},60);
 d.s.classList.remove('dragging');d.s.style.transform='';document.body.classList.remove('dragmode');ins.style.display='none';
 if(!cancel&&d.ids){const ids=d.ids.slice();ids.splice(d.idx,0,d.s.dataset.id);shSet(shDefs().map(x=>x.id===d.sid?{...x,order:ids}:x))}CSSIG='';renderCustom();csFilter()}
document.querySelector('.scene').addEventListener('pointerdown',e=>{const s=e.target.closest('.csb');if(!s||(e.pointerType==='mouse'&&e.button!==0)||busy)return;
 csd={s,sid:s.closest('.case.cs').dataset.sid,x:e.clientX,y:e.clientY,px:e.clientX,py:e.clientY,sy:0,active:false,touch:e.pointerType!=='mouse',t:null,idx:0,ids:null};if(csd.touch)csd.t=setTimeout(csBegin,300)});
document.addEventListener('pointermove',e=>{if(!csd)return;csd.px=e.clientX;csd.py=e.clientY;if(!csd.active){const d=Math.hypot(e.clientX-csd.x,e.clientY-csd.y);if(csd.touch){if(d>10){clearTimeout(csd.t);csd=null}}else if(d>6)csBegin();return}csUpdate()});
document.addEventListener('pointerup',()=>csEnd(false));document.addEventListener('pointercancel',()=>csEnd(true));
document.addEventListener('touchmove',e=>{if(csd&&csd.active)e.preventDefault()},{passive:false});
document.querySelector('.scene').addEventListener('contextmenu',e=>{if(e.target.closest('.csb'))e.preventDefault()});
/* the search and the tag filter also dim the books on your own shelves */
function csFilter(){const on=selTags.size>0||!!$('q').value.trim();document.querySelectorAll('.case.cs .csb').forEach(e=>{const b=books.find(x=>x.id===e.dataset.id),m=b&&matches(b);e.classList.toggle('dim',on&&!m);e.classList.toggle('hit',on&&!!m)})}
{const af=applyFilter;applyFilter=function(){const r=af.apply(this,arguments);try{csFilter()}catch(e){}return r}}

/* ---------- the second animal's little routine: wander along its bookcase, sit, nap ---------- */
let frT=0,frX=0;
function friendNext(ms){clearTimeout(frT);frT=setTimeout(friendTick,ms)}
function friendTick(){
 const f=$('friend'),wc=f&&f.parentElement;if(!f||!wc||!frSpot){frX=0;return}
 if(document.hidden||(typeof turning==='function'&&turning())){friendNext(4000);return}
 if(f.classList.contains('sleeping')){if(Math.random()<.4){friendNext(8000+Math.random()*9000);return}f.classList.remove('sleeping');friendNext(2500+Math.random()*3000);return}
 const r=Math.random(),max=Math.max(0,Math.round(frSpot.max(wc)));
 if(r<.55&&max>20&&!reduce){let to=Math.round(Math.random()*max);if(Math.abs(to-frX)<24)to=frX<max/2?Math.min(max,frX+50):Math.max(0,frX-50);const t=Math.max(.6,Math.abs(to-frX)/28);
  f.style.setProperty('--fd',to>frX?-1:1);f.style.setProperty('--fw',t+'s');f.style.setProperty('--fx',to+'px');f.classList.add('walking');frX=to;
  setTimeout(()=>{f.classList.remove('walking');f.style.setProperty('--fw','0s')},t*1000);friendNext(t*1000+2500+Math.random()*5000)}
 else if(r<.78){f.classList.add('sleeping');friendNext(11000+Math.random()*12000)}
 else friendNext(3000+Math.random()*4000)}
/* each time the app opens, the second animal settles somewhere else in the room: on either bookcase, on the window sill or on the floor */
let frSpot=null;
const FR_SPOTS=[
 {k:'want',own:'want',el:()=>$('wantcase'),css:{left:'16px',bottom:'100%',marginBottom:'-4px'},max:p=>p.clientWidth-150},
 {k:'read',own:'top',el:()=>document.querySelector('.scene>.case:not(.small)'),css:p=>({left:(p.querySelector('.deco')?150:84)+'px',bottom:'100%',marginBottom:'-4px'}),max:p=>p.clientWidth-(p.querySelector('.deco')?150:84)-210},
 {k:'sill',own:'sill',ok:()=>avail('sill'),el:()=>document.querySelector('.window'),css:{left:'6px',bottom:'-9px',width:'30px'},max:p=>p.clientWidth-44},
 {k:'floor',own:'floor',el:()=>document.querySelector('.floor'),css:{left:'150px',top:'-13px',bottom:'auto',zIndex:'3'},max:p=>p.clientWidth-150-230}];
function friendPlace(f){let last='';try{last=sessionStorage.getItem('bookshelf-friend-spot')||localStorage.getItem('bookshelf-friend-last')||''}catch(e){}
 const mine=(document.getElementById('catw')||{dataset:{}}).dataset.spot,ok=FR_SPOTS.filter(s=>s.el()&&(!s.ok||s.ok())&&s.own!==mine&&(s.k==='want'||s.max(s.el())>=0));
 let pick=null;try{const keep=sessionStorage.getItem('bookshelf-friend-spot');pick=ok.find(s=>s.k===keep)||null}catch(e){}
 if(!pick){const pool=ok.filter(s=>s.k!==last);pick=(pool.length?pool:ok)[Math.floor(Math.random()*(pool.length||ok.length))]||FR_SPOTS[0]}
 try{sessionStorage.setItem('bookshelf-friend-spot',pick.k);localStorage.setItem('bookshelf-friend-last',pick.k)}catch(e){}
 frSpot=pick;const p=pick.el(),css=typeof pick.css==='function'?pick.css(p):pick.css;f.style.cssText='';Object.assign(f.style,css);if(f.parentElement!==p)p.append(f)}
{const rr=roomRewards;roomRewards=function(){const had=!!$('friend'),k=had&&$('friend').dataset.k;rr.apply(this,arguments);const f=$('friend');
 if(f&&frSpot&&frSpot.ok&&!frSpot.ok()){frSpot=null}
 if(f&&(!had||k!==f.dataset.k||!frSpot)){friendPlace(f);frX=0;f.classList.remove('sleeping','walking');f.style.setProperty('--fx','0px');f.style.setProperty('--fw','0s');
  f.addEventListener('click',()=>{if(f.classList.contains('sleeping')){f.classList.remove('sleeping');friendNext(3000+Math.random()*3000)}});friendNext(3000+Math.random()*3000)}}}
try{roomRewards()}catch(e){}

/* ---------- Customize, rebuilt: tabs, pictures instead of drop-down lists, the room visible above as the live preview, and a stage that shows the animal ---------- */
let czTab='room';
const CZ_TABS=[['room','Room',['theme','wall','floor','window','view','nightroom']],['furn','Furniture',['wood','rug','plant','pot','season','_deco']],['pet','Animal',['pet','_name','coat','_acc','_dragon','_spirit','bowls','_friend']],['clock','Clock & weather',['clock','clockc','therm','thermc','_wx']],['more','More',['_lang','sound','_backup','_remind','_btns']]];
const CZ_AT={floor:'.floor',window:'.window',view:'.window',rug:'.rug',wood:'.scene>.case:not(.small)',plant:'.plant',pot:'.plant',season:'#wantcase',clock:'#wclock',clockc:'#wclock',therm:'#therm',thermc:'#therm',pet:'#catw',coat:'#catw',_acc:'#catw',bowls:'#bowls',_deco:'.deco',_friend:'#friend'};
/* show what was just changed: bring it into the part of the room that is still visible above the drawer */
function czShow(k){const q=CZ_AT[k],e=q&&document.querySelector(q);if(!e||view!=='room'||!RV.contains(e))return;const r=e.getBoundingClientRect();if(!r.width&&!r.height)return;const vis=innerHeight-($('lov').querySelector('.pnl').offsetHeight||0);
 if(r.top<70||r.bottom>vis-10)RV.scrollTo({top:Math.max(0,RV.scrollTop+r.top-Math.max(80,(vis-r.height)/2)),behavior:reduce?'auto':'smooth'});
 e.classList.remove('czpulse');void e.offsetWidth;e.classList.add('czpulse');setTimeout(()=>e.classList.remove('czpulse'),800)}
const czSvg=(vb,inner,style)=>`<svg viewBox="${vb}" aria-hidden="true"${style?` style="${style}"`:''}>${inner}</svg>`,czNat=';--cat:initial;--cat-st:initial;--cat-eye:initial;--cat-nose:initial';
function czThumb(k,id,v){
 const i=document.createElement('i'),bg=s=>{i.style.background=s},em=t=>{i.className='em';i.textContent=t},none=()=>{i.textContent='—';i.style.color='var(--muted)'};
 const dot=(c,w,h,r)=>{const u=document.createElement('u');u.style.cssText=`width:${w||34}px;height:${h||34}px;border-radius:${r||'50%'};background:${c};box-shadow:0 1px 3px rgba(0,0,0,.3)`;i.append(u)};
 if(k==='_spirit'){if(!id)none();else em('\u2728')}
 else if(k==='_dragon'){if(!id)none();else dot(id,30,30)}
 else if(k==='theme')bg(id==='auto'?'linear-gradient(135deg,#e9dcc4 50%,#2b231c 50%)':id==='light'?'#e9dcc4':'#2b231c');
 else if(k==='wall'){const dk=sid('theme')==='dark'||(sid('theme')==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches);bg(v['--wallbg']||`repeating-linear-gradient(90deg,${v['--wall']||(dk?'#2b231c':'#e9dcc4')} 0 10px,${v['--wall2']||(dk?'#271f19':'#e3d4b9')} 10px 20px)`)}
 else if(k==='floor')bg(v['--floorbg']||`repeating-linear-gradient(90deg,${v['--fl1']||'#b98a5a'} 0 18px,${v['--fl2']||'#a67a4c'} 18px 20px)`);
 else if(k==='rug'){if(id==='none')none();else dot(v['--rugbg']||'repeating-linear-gradient(90deg,#a4552b 0 7px,#e2c9a0 7px 11px,#2f4b6e 11px 18px,#e2c9a0 18px 22px)',52,24)}
 else if(k==='wood')bg(`linear-gradient(90deg,${v['--wood2']||'#6d4523'},${v['--wood']||'#9a6538'} 50%,${v['--wood2']||'#6d4523'})`);
 else if(k==='pot')dot(v['--pot']||'#c1663a',30,26,'3px 3px 9px 9px');
 else if(k==='window'){if(id==='none')none();else{const u=document.createElement('u');u.style.cssText=`width:30px;height:${id==='round'?30:40}px;border:4px solid #f3ecdf;background:linear-gradient(#8fc7ee,#e8f5ff);border-radius:${id==='sq'?'3px':id==='round'?'50%':'17px 17px 2px 2px'};box-shadow:0 1px 3px rgba(0,0,0,.3)`;i.append(u)}}
 else if(k==='view'){bg(`linear-gradient(${v['--sky1']||'#8fc7ee'},${v['--sky2']||'#e8f5ff'})`);if(id==='live')em('\u{1F324}')}
 else if(k==='plant'){if(id==='none')none();else i.innerHTML=czSvg('0 0 80 110',PLANTS[id]||'')}
 else if(k==='clock'){if(id==='none')none();else if(id==='round')em('\u{1F550}');else i.textContent={minimal:'◷',roman:'XII',digital:'8:49',flip:'08 49'}[id]||''}
 else if(k==='therm'){if(id==='none')none();else if(id==='tube')em('\u{1F321}');else if(id==='sign')em('\u{1FAA7}');else i.textContent={dial:'◔',digital:'21°'}[id]||''}
 else if(k==='clockc'||k==='thermc'){const p=k==='clockc'?'--ck':'--th',u=document.createElement('u');u.style.cssText=`width:34px;height:34px;border-radius:50%;background:${v[p+'1']};border:5px solid ${v[p+'2']};box-sizing:border-box;box-shadow:0 1px 3px rgba(0,0,0,.3)`;i.append(u)}
 else if(k==='pet'||k==='_friend'){if(!ANIMALS[id])none();else i.innerHTML=czSvg('0 0 60 56',ANIMALS[id][1],ANIMALS[id][0]+czNat).replace('<svg ','<svg class="cat" ')}
 else if(k==='coat'){const an=ANIMALS[sid('pet')],nat=an&&(an[0].match(/--a:(#[0-9a-f]+)/i)||[])[1];dot(v['--cat']||nat||'#d98a3d')}
 else if(k==='_acc'){const pet=sid('pet'),an=ANIMALS[pet];if(!id||!an)none();else i.innerHTML=czSvg('0 0 60 56',an[1]+petAccSvg(pet,id),an[0]).replace('<svg ','<svg class="cat" ')}
 else if(k==='_deco'){const d=DECOS.find(x=>x[0]===id);if(!d)none();else i.innerHTML=czSvg('0 0 46 50',d[3])}
 else if(k==='nightroom')em(id==='on'?'\u{1F319}':'☀️');else if(k==='season'){if(id==='show')em('\u{1F383}');else none()}
 else if(k==='bowls'){if(id==='show')em('\u{1F963}');else none()}else if(k==='sound')em(id==='on'?'\u{1F514}':'\u{1F515}');
 else i.textContent='';
 /* the still pictures in the drawer don't need to breathe or blink */
 i.querySelectorAll('svg *').forEach(e=>{e.style.animation='none'});return i}
function czGroup(k,label,items,curVal,pick){
 const g=el('div','czg'),row=el('div','czrow');g.append(el('b','',label),row);g.dataset.k=k;
 items.forEach(([id,name,v,need])=>{const b=el('button','czt');b.type='button';const locked=need&&badgeCount()<need;b.append(czThumb(k,id,v||{}),locked?'\u{1F512} '+L('{n} badges',{n:need}):name);b.setAttribute('aria-pressed',id===curVal);b.dataset.v=id;b.title=name;if(locked)b.disabled=true;else b.onclick=()=>pick(id);row.append(b)});
 return g}
function czSaveLook(){try{localStorage.setItem(LK,JSON.stringify(look))}catch(e){}}
function czPetStage(){const pet=sid('pet'),an=ANIMALS[pet],st0=el('div','czstage');if(spiritShow())st0.classList.add('spirit');if(!an){st0.style.height='60px';return st0}
 const a=ACCS.find(x=>x[0]===look._acc),acc=a&&badgeCount()>=a[2]?petAccSvg(pet,a[0]):'';st0.innerHTML=`<svg class="cat" viewBox="0 0 60 56" aria-hidden="true" style="${an[0]}">${an[1]}${acc}</svg>`;if(look.petName)st0.append(el('div','nm',look.petName));return st0}
buildPanel=function(){
 /* the drawer's frame, its tab strip and its scrolling area are made once and kept; only what is inside changes */
 const g=$('pgrid');let body=g.querySelector('.czbody'),tabs=g.querySelector('.cztabs');
 if(!body||buildPanel.lang!==lang){buildPanel.lang=lang;g.replaceChildren();const head=el('div','czhead'),done=el('button','czdone',L('Done'));tabs=el('div','cztabs');body=el('div','czbody');tabs.setAttribute('role','tablist');done.type='button';done.onclick=()=>$('lov').classList.remove('on');
  CZ_TABS.forEach(([id,name])=>{const b=el('button','',L(name));b.type='button';b.setAttribute('role','tab');b.dataset.t=id;b.onclick=()=>{if(czTab!==id){czTab=id;buildPanel()}};tabs.append(b)});head.append(tabs,done);g.append(head,body)}
 const top0=body.dataset.t===czTab?body.scrollTop:0,out=document.createDocumentFragment();body.dataset.t=czTab;
 tabs.querySelectorAll('button').forEach(b=>{const on=b.dataset.t===czTab;b.setAttribute('aria-selected',on);if(on&&(b.offsetLeft+b.offsetWidth>tabs.clientWidth+tabs.scrollLeft||b.offsetLeft<tabs.scrollLeft))tabs.scrollLeft=b.offsetLeft-20});
 /* a tap on a tile only moves the ring to it; the drawer is redrawn only when the choice changes which tiles exist */
 const REB=new Set(['pet','plant','clock','therm','window','theme']),press=(k,v)=>{const gr=body.querySelector(`.czg[data-k="${k}"]`);if(gr)gr.querySelectorAll('.czt').forEach(t=>t.setAttribute('aria-pressed',t.dataset.v===v))},stage=()=>{const s0=body.querySelector('.czstage');if(s0)s0.replaceWith(czPetStage())};
 const setOpt=(k,v)=>{if(sid(k)===v)return;look[k]=v;czSaveLook();applyLook();if(!avail(catw.dataset.spot))moveCat(true);if(k==='view'||k==='therm')try{fetchWeather()}catch(e){}if(REB.has(k))buildPanel();else{press(k,v);if(k==='coat')stage()}setTimeout(()=>czShow(k),60)};
 const setOwn=(k,v,after)=>{look[k]=v;czSaveLook();after&&after();press(k,v);if(k==='_acc'||k==='_dragon'||k==='_spirit')stage();setTimeout(()=>czShow(k),60)};
 if(czTab==='pet')out.append(czPetStage());
 (CZ_TABS.find(t=>t[0]===czTab)||CZ_TABS[0])[2].forEach(k=>{
  const o=OPTS.find(x=>x.k===k);
  if(o){if((k==='coat'||k==='bowls')&&sid('pet')==='none')return;if(k==='coat'&&sid('pet')==='dragon')return;if(k==='pot'&&sid('plant')==='none')return;if(k==='clockc'&&sid('clock')==='none')return;if(k==='thermc'&&sid('therm')==='none')return;if(k==='view'&&sid('window')==='none')return;
   out.append(czGroup(k,L(o.l),o.i.filter(it=>k!=='pet'||it[0]!=='dragon'||dragonOn()).map(it=>[it[0],L(it[1]),it[2]]),sid(k),v=>setOpt(k,v)));return}
  if(k==='_name'){if(sid('pet')==='none')return;const l=document.createElement('label');l.textContent=L('Animal’s name');const ni=document.createElement('input');ni.className='petname';ni.maxLength=20;ni.autocomplete='off';ni.value=look.petName||'';
   ni.oninput=()=>{look.petName=ni.value.slice(0,20);czSaveLook();const nm=body.querySelector('.czstage .nm');if(nm)nm.textContent=look.petName;else if(look.petName){const s0=body.querySelector('.czstage');s0&&s0.append(el('div','nm',look.petName))}try{petSync()}catch(e){}};l.append(ni);out.append(l)}
  else if(k==='_acc'){if(sid('pet')==='none')return;const a=ACCS.find(x=>x[0]===look._acc),cur0=a&&badgeCount()>=a[2]?a[0]:'';out.append(czGroup(k,L('Accessory'),[['',L('None')],...ACCS.map(x=>[x[0],L(x[1]),null,x[2]])],cur0,v=>setOwn('_acc',v,petAcc)))}
  else if(k==='_friend'){const ok=ANIMALS[look._friend]&&badgeCount()>=FRIEND_AT?look._friend:'';out.append(czGroup(k,L('Second animal'),[['',L('None')],...OPTS.find(x=>x.k==='pet').i.filter(x=>ANIMALS[x[0]]&&x[0]!==sid('pet')&&(x[0]!=='dragon'||dragonOn())).map(x=>[x[0],L(x[1]),null,FRIEND_AT])],ok,v=>setOwn('_friend',v,roomRewards)))}
  else if(k==='_spirit'){if(!spiritOn()||sid('pet')==='none')return;out.append(czGroup(k,L('Silver spirit'),[['',L('Off')],['1',L('On')]],look._spirit||'',v=>setOwn('_spirit',v,applyLook)))}
  else if(k==='_dragon'){if(!dragonOn()||sid('pet')!=='dragon')return;out.append(czGroup(k,L('Dragon colour'),DRAGONS.map(x=>[x[0],L(x[1])]),look._dragon||'#3f8f4e',v=>setOwn('_dragon',v,applyLook)))}
  else if(k==='_deco'){const d=DECOS.find(x=>x[0]===look._deco),cur0=d&&decoOk(d)?d[0]:'';out.append(czGroup(k,L('Decoration'),[['',L('None')],...decoList().map(x=>[x[0],L(x[1]),null,x[2]])],cur0,v=>setOwn('_deco',v,roomRewards)))}
  else if(k==='_wx'){if(!(sid('view')==='live'||sid('therm')!=='none'))return;const box=el('div','wxrow');box.append(el('div','wxlab',L('Weather location')+(wxLoc&&wxLoc.name?': '+wxLoc.name:wxLoc?': \u{1F4CD}':'')));
   const gb=el('button','fbtn',L('\u{1F4CD} Use my location'));gb.type='button';gb.onclick=useMyLocation;const ci=el('input');ci.id='wxcity';ci.setAttribute('aria-label',L('Weather location'));ci.placeholder=L('or type a city');ci.enterKeyHint='search';ci.autocomplete='off';
   const sb=el('button','fbtn',L('Set'));sb.type='button';const setc=()=>setCity(ci.value);sb.onclick=setc;ci.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();setc()}};box.append(gb,ci,sb,el('div','wxlab',L('Weather data by Open-Meteo.com (CC BY 4.0)')));out.append(box)}
  else if(k==='_lang'){const l=document.createElement('label');l.textContent='\u{1F310} '+L('Language');const ls=document.createElement('select');ls.id='langsel';Object.entries(LANGS).forEach(([c,n])=>{const op=document.createElement('option');op.value=c;op.textContent=n;ls.append(op)});ls.value=lang;ls.onchange=()=>setLang(ls.value);l.append(ls);out.append(l)}
  else if(k==='_backup'){if(!$('exp'))return;const l=document.createElement('label');l.textContent='\u{1F4BE} '+L('Backup reminder');const s=document.createElement('select');[[1,'Every day'],[7,'Every week'],[30,'Every month'],[0,'Never']].forEach(([v,n])=>{const o2=document.createElement('option');o2.value=v;o2.textContent=L(n);s.append(o2)});
   let ev='30';try{ev=localStorage.getItem('bookshelf-backup-every')||'30'}catch(e){}s.value=ev;s.onchange=()=>{try{localStorage.setItem('bookshelf-backup-every',s.value);localStorage.removeItem(LSN)}catch(e){}checkBackup()};l.append(s);out.append(l)}
  else if(k==='_remind'){const l=document.createElement('label');l.textContent='\u{1F514} '+L('Daily reading reminder');const s=document.createElement('select');[['1','On'],['0','Off']].forEach(([v,n])=>{const o2=document.createElement('option');o2.value=v;o2.textContent=L(n);s.append(o2)});let on='0';try{on=localStorage.getItem('bookshelf-remind')||'0'}catch(e){}s.value=on;s.onchange=async()=>{if(!await setRemind(s.value==='1'))s.value='0'};l.append(s);out.append(l)}
  else if(k==='_btns'){const bx=el('div','czbtns'),mk=(t,fn)=>{const b=el('button','',t);b.type='button';b.onclick=fn;bx.append(b)},shut=fn=>()=>{$('lov').classList.remove('on');fn()};
   mk(L('📚 My shelves'),shOpen);mk(L('📚 E-book files'),ebListOpen);mk(L('🛟 Daily safety copies'),safeOpen);mk('\u2601\uFE0F '+L('Google Drive backup'),driveMenu);mk('\u{1F517} '+L('Share my shelf'),shareMenu);mk('\u{1F465} '+L('Friends\u2019 shelves'),friendsOpen);mk('\u{1F49E} '+L('Pair with someone'),pairMenu);mk('\u2728 '+L('What\u2019s new'),newsOpen);mk(L('📥 Import Kindle highlights'),()=>$('kcin').click());
   mk($('shelfpic').textContent,()=>$('shelfpic').click());if(!$('mvcat').hidden)mk($('mvcat').textContent,()=>$('mvcat').click());mk(L('📥 Open a recommendation'),()=>recPaste());mk(L('💬 Feedback & support'),fbOpen);mk($('aboutbtn').textContent,()=>$('aboutbtn').click());mk(L('Reset'),()=>$('rst').click());
   out.append(bx);const sf=el('p');sf.id='safe2';sf.textContent=$('safe').textContent;out.append(sf)}});
 body.replaceChildren(out);body.scrollTop=top0};
/* the room makes space under itself while the drawer is open, so the floor can be scrolled up into view */
{const lv=$('lov'),sync=()=>{const on=lv.classList.contains('on');if(on!==document.body.classList.contains('dressing')){document.body.classList.toggle('dressing',on);try{leafFit()}catch(e){}}const s2=$('safe2');if(s2)s2.textContent=$('safe').textContent};
 new MutationObserver(sync).observe(lv,{attributes:true,attributeFilter:['class']});new MutationObserver(sync).observe($('safe'),{childList:true,characterData:true,subtree:true})}

/* daily reading reminder: no server, so Android's periodic background sync wakes sw.js about once a day (the phone picks the time) */
// shortcut: the reminder text keeps the language it was turned on in; re-save it on language change if that matters
// asks once, only in the installed app where reminders can work
function offerRemind(){try{if(localStorage.getItem('bookshelf-remind')==='1'||localStorage.getItem('bookshelf-remind-asked')||!matchMedia('(display-mode: standalone)').matches||!('PeriodicSyncManager' in window))return;localStorage.setItem('bookshelf-remind-asked','1')}catch(e){return}
 setTimeout(async()=>{if(await ask(L('Want a daily reminder to keep reading?'),L('Turn on'),L('Not now')))setRemind(true)},1200)}
async function setRemind(on){
 try{localStorage.setItem('bookshelf-remind',on?'1':'0')}catch(e){}
 try{const reg=await navigator.serviceWorker.ready;
  if(!on){if(reg.periodicSync)await reg.periodicSync.unregister('read-reminder');return true}
  if(!reg.periodicSync||!('Notification' in window)||await Notification.requestPermission()!=='granted')throw 0;
  await IDB.set('remind',{t:L('\u{1F4DA} Time to read!'),b:L('A few pages today keeps the streak going.')});
  await reg.periodicSync.register('read-reminder',{minInterval:864e5});
  toast(L('Reminder on. Your phone picks the time, about once a day.'));return true
 }catch(e){try{localStorage.setItem('bookshelf-remind','0')}catch(_){}toast(L('Reminders need the installed app on Android.'));return false}}

/* ---------- feedback & support: a message by e-mail, and a way to support the app ---------- */
const FBMAIL='Spendraxapp@gmail.com',PATREON='';
function fbOpen(){$('lov').classList.remove('on');$('aboutov').classList.remove('on');$('fbtext').placeholder=L('Write your message here');$('fbsup').hidden=!PATREON;if(PATREON)$('fbpat').href=PATREON;$('fbov').classList.add('on')}
$('fbkind').onclick=e=>{const b=e.target.closest('button');if(!b)return;$('fbkind').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b))};
$('fbsend').onclick=()=>{const t=$('fbtext').value.trim();if(!t){toast(L('Please write a message first.'));$('fbtext').focus();return}
 const k=($('fbkind').querySelector('[aria-pressed=true]')||{dataset:{k:'Other'}}).dataset.k;
 const body=t+'\n\n—\nMy Bookshelf '+APPVER+' · '+lang+' · '+books.length+' books\n'+navigator.userAgent;
 location.href='mailto:'+FBMAIL+'?subject='+encodeURIComponent('[My Bookshelf] '+k)+'&body='+encodeURIComponent(body)};
$('fbcopy').onclick=async()=>{try{await navigator.clipboard.writeText(FBMAIL);toast(L('Address copied'))}catch(e){toast(FBMAIL)}};
$('fbx').onclick=()=>$('fbov').classList.remove('on');$('fbov').onclick=e=>{if(e.target===$('fbov'))$('fbov').classList.remove('on')};
{const b=document.createElement('button');b.type='button';b.id='fbbtn';b.textContent=L('💬 Feedback & support');b.onclick=fbOpen;$('tourbtn').before(b)}

/* what the animal wears and the reward decorations are drawn once more now that everything is loaded: the first drawing of the room happens before this part of the app exists, so on every start the accessory was missing until something was changed in Customize */
try{petAcc()}catch(e){}try{roomRewards()}catch(e){}
/* the second animal and the decoration depend on the badges, which are only known once the books have loaded: check again a little later too */
setTimeout(()=>{try{petAcc();roomRewards()}catch(e){}},1500);
{const r1=render;render=function(){const r=r1.apply(this,arguments);try{if(!document.querySelector('#catw .cat .acc'))petAcc();if((look._friend&&!$('friend'))||(look._deco&&!document.querySelector('.deco')))roomRewards()}catch(e){}return r}}

/* ---------- install the app: one tap where the browser allows it (Chrome, Edge), short steps for the other browsers ---------- */
{let bip=null;const btn=$('installbtn'),ua=navigator.userAgent||'';
 const installed=()=>{try{if(document.referrer.startsWith('android-app://'))sessionStorage.setItem('bookshelf-inapp','1');if(sessionStorage.getItem('bookshelf-inapp'))return true}catch(e){}try{return matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||matchMedia('(display-mode: minimal-ui)').matches||navigator.standalone===true||document.referrer.startsWith('android-app://')}catch(e){return false}};
 const iOS=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1),android=/Android/.test(ua);
 const who=()=>iOS?'ios':/SamsungBrowser/.test(ua)?'samsung':/Firefox|FxiOS/.test(ua)?(android?'ffandroid':'ffdesk'):/OPR\/|Opera/.test(ua)?(android?'chromeandroid':'operadesk'):/Edg\//.test(ua)?(android?'chromeandroid':'edge'):/Safari/.test(ua)&&!/Chrome|Chromium/.test(ua)?'macsafari':android?'chromeandroid':'chrome';
 const S={
  ios:['On iPhone and iPad (any browser)',['Tap the Share button <span class="ico">⎋</span> (a square with an arrow pointing up). In Safari it is at the bottom of the screen, in other browsers it can be at the top or in the menu.','Scroll down and tap <b>Add to Home Screen</b>.','Tap <b>Add</b>. My Bookshelf now has its own icon on your home screen.'],'Install it before you add your books: on iPhone the installed app keeps its own copy of your library, separate from the browser.'],
  samsung:['In Samsung Internet',['Tap the menu <span class="ico">≡</span> at the bottom right.','Tap <b>Add page to</b>.','Tap <b>Home screen</b>, then <b>Add</b>.'],''],
  ffandroid:['In Firefox on Android',['Tap the menu <span class="ico">⋮</span>.','Tap <b>Add app to Home screen</b> (on some versions: <b>Install</b>).','Confirm with <b>Add</b>.'],''],
  macsafari:['In Safari on a Mac',['In the menu bar, click <b>File</b>.','Click <b>Add to Dock</b>, then <b>Add</b>.'],'This needs a fairly recent macOS (Sonoma or newer).'],
  ffdesk:['In Firefox on a computer',['Firefox on a computer usually cannot install websites as apps.','Open this page in <b>Chrome</b> or <b>Edge</b> and use the Install button there, or simply bookmark it.'],''],
  operadesk:['In Opera on a computer',['Opera on a computer usually cannot install websites as apps.','Open this page in <b>Chrome</b> or <b>Edge</b> and use the Install button there, or simply bookmark it.'],''],
  chromeandroid:['In Chrome on Android',['Tap the menu <span class="ico">⋮</span> at the top right.','Tap <b>Add to Home screen</b> or <b>Install app</b>.','Confirm with <b>Install</b>.'],'Already installed? Look for My Bookshelf among your apps. On Android you can also get it from Google Play.'],
  chrome:['In Chrome on a computer',['Click the install icon <span class="ico">⊕</span> at the right end of the address bar,','or open the menu <span class="ico">⋮</span> → <b>Cast, save and share</b> → <b>Install page as app</b>.'],'Already installed? It appears in your apps (in Chrome: chrome://apps).'],
  edge:['In Edge on a computer',['Click the menu <span class="ico">…</span> at the top right.','Choose <b>Apps</b> → <b>Install this site as an app</b>.'],'Already installed? It appears under <b>Apps</b> in the same menu.']};
 const help=()=>{const k=who(),[t,steps,note]=S[k];$('instfor').textContent=L(t);const ol=$('inststeps');ol.replaceChildren();const SHR='<svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align:-3px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Share"><path d="M8 9H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1h-2"/><path d="M12 15V3M8 7l4-4 4 4"/></svg>';steps.forEach(x=>{const li=document.createElement('li');li.innerHTML=L(x).replace('⎋',SHR);ol.append(li)});$('instnote').innerHTML=note?L(note):'';$('instnote').hidden=!note;$('instov').classList.add('on')};
 const sync=()=>{btn.hidden=installed()};sync();
 addEventListener('beforeinstallprompt',e=>{e.preventDefault();bip=e;sync()});
 addEventListener('appinstalled',()=>{bip=null;btn.hidden=true});
 btn.onclick=async()=>{if(bip){const e=bip;bip=null;try{await e.prompt();const r=await e.userChoice;if(r&&r.outcome==='accepted'){btn.hidden=true;return}}catch(x){}return}help()};
 $('instx').onclick=()=>$('instov').classList.remove('on');$('instov').onclick=e=>{if(e.target===$('instov'))$('instov').classList.remove('on')};
 window.installHelp=help}

/* ---------- iPhone: links open in Safari, but the home-screen app keeps its own library, so the recommendation can be carried over by copy and paste ---------- */
{const ua=navigator.userAgent||'',IOS=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
 const inApp=()=>{try{return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}catch(e){return false}};
 let raw='';const rc=recCheck;recCheck=function(){const m=/[#&]rec=([\w-]+)/.exec(location.hash||'');raw=m?m[1]:'';const r=rc.apply(this,arguments);
  try{const show=IOS&&!inApp()&&raw&&$('recov').classList.contains('on');$('reccopy').hidden=!show;$('recios').hidden=!show;if(show){$('recadd').classList.remove('pri');if(!$('recadd').hidden&&!recSame(recIn))$('recadd').textContent=L('Add it here instead')}else $('recadd').classList.add('pri')}catch(e){}return r};
 removeEventListener('hashchange',rc);addEventListener('hashchange',()=>recCheck());
 $('reccopy').onclick=async()=>{const url='https://spendrax.github.io/Bookshelf/#rec='+raw;try{await navigator.clipboard.writeText(url)}catch(e){prompt('',url)}$('recov').classList.remove('on');toast(L('Copied. Open your app, then Customize → More → Open a recommendation.'))};
 /* in the app: take the link from the clipboard, or let it be pasted */
 window.recPaste=async()=>{$('lov').classList.remove('on');let t='';try{t=await navigator.clipboard.readText()}catch(e){}
  let m=/#rec=([\w-]+)/.exec(t||'');
  if(!m){const inp=$('askin'),t0=inp.type;inp.type='text';inp.removeAttribute('inputmode');inp.value='';inp.maxLength=4000;inp.hidden=false;const ok=await ask(L('Paste the recommendation link here'),L('Open'));inp.hidden=true;const v=inp.value;inp.type=t0;inp.setAttribute('inputmode','numeric');inp.value='';if(!ok)return;m=/#rec=([\w-]+)/.exec(v||'')}
  if(!m){toast(L('No recommendation link found.'));return}
  if(location.hash==='#rec='+m[1])recCheck();else location.hash='#rec='+m[1]}}

/* the message at the bottom is shown and hidden instead of being added and removed (see the styles) */
{const t=$('toast');if(!t.textContent)t.textContent='\u00a0'}
toast=function(m){const t=$('toast');t.textContent=m;t.style.display='block';t.classList.add('on');clearTimeout(toast._t);toast._t=setTimeout(()=>{t.classList.remove('on');t.style.display='none'},3000)};

/* iPhone in Safari: Safari wipes a site's saved data after 7 days without a visit (home-screen apps are exempt), so say so every visit until the app is installed */
{const ua=navigator.userAgent||'',IOS=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);let inApp=false;try{inApp=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}catch(e){}
 let later=false;try{later=!!sessionStorage.getItem('bookshelf-ioslater')}catch(e){}
 $('iosbanner').hidden=!IOS||inApp||later;
 $('iosinst').onclick=()=>{try{installHelp()}catch(e){}};
 $('ioslater').onclick=()=>{$('iosbanner').hidden=true;try{sessionStorage.setItem('bookshelf-ioslater','1')}catch(e){}}}

/* the bookstore buttons (no inline onclick: the page's security rules block those) */
$('rbgo').onclick=()=>rbFind();$('llgo').onclick=()=>rbFind('ll');
