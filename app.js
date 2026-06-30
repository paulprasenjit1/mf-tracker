/* MF Tracker — on-device, private. All data stays in this browser. */
const NAV_SRCS=[c=>`https://api.mfapi.in/mf/${c}/latest`,c=>`https://api.mfapi.in/mf/${c}`];
const SEARCH=q=>`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`;
const LS={g:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},s:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const k1=n=>'₹'+Math.round(n/1000)*1000>=100000?'₹'+(Math.round(n/1000)*1000/100000).toFixed(2)+'L':'₹'+(Math.round(n/1000)*1000).toLocaleString('en-IN');
const $=id=>document.getElementById(id);
let assetChart,trendChart,editRows=[];

const CTX={asof:'Jun 2026',
  gold:'near record highs',silver:'very volatile',
  smallcap:'corrected in 2025, recovering with strong earnings',
  midcap:'earnings momentum strong',largecap:'steady, fair value',
  psu:'narrow and sentiment-driven',hybrid:'all-weather, low stress'};

function curatedCode(name){const n=name.toLowerCase();const has=(...k)=>k.every(x=>n.includes(x));
  if(has('aditya','silver'))return'149783';
  if(has('axis','gold'))return'115897';
  if(has('bandhan','small'))return'147944';
  if(has('dsp','gold'))return'152182';
  if(has('edelweiss','gold','silver'))return'150579';
  if(has('edelweiss','large')&&n.includes('mid'))return'140172';
  if(has('edelweiss','mid')&&!n.includes('large'))return'140225';
  if(has('hdfc','flexi'))return'101762';
  if(has('hdfc','gold'))return'115934';
  if(has('hdfc','silver'))return'150736';
  if(has('icici','large')&&n.includes('mid'))return'100349';
  if(has('icici','large')&&!n.includes('mid'))return'108466';
  if(has('icici','multi'))return'101144';
  if(has('invesco','flexi'))return'149766';
  if(has('invesco','psu'))return'112171';
  if(has('nippon','growth')||has('nippon','mid'))return'100377';
  if(has('nippon','large'))return'106235';
  if(has('quant','small'))return'100177';
  if(has('tata','gold'))return'152290';
  return null;}

/* Verified holdings (invested + units) for known funds, so figures are exact
   regardless of OCR. NAV is still fetched live. Edit on review if you've changed quantities. */
const REF={
 '149783':{inv:29998.80,units:788.886},'115897':{inv:4999.75,units:111.597},
 '147944':{inv:21998.90,units:476.072},'152182':{inv:4999.75,units:203.601},
 '150579':{inv:37998.38,units:899.74},'140172':{inv:3999.80,units:47.485},
 '140225':{inv:47997.60,units:460.761},'101762':{inv:46997.65,units:23.363},
 '115934':{inv:3999.80,units:98.697},'150736':{inv:34398.28,units:793.424},
 '100349':{inv:88995.55,units:87.222},'108466':{inv:2999.85,units:27.259},
 '101144':{inv:63996.80,units:78.838},'149766':{inv:21998.90,units:1173.968},
 '112171':{inv:29998.50,units:450.743},'100377':{inv:61996.90,units:14.491},
 '106235':{inv:73996.30,units:820.416},'100177':{inv:21998.90,units:87.850},
 '152290':{inv:27998.88,units:1223.553}};

function classify(n){n=n.toLowerCase();const has=s=>n.includes(s);
  if(has('gold')&&has('silver'))return['Gold+Silver','Metal'];
  if(has('silver'))return['Silver','Metal'];
  if(has('gold'))return['Gold','Metal'];
  if(has('multi asset')||has('multi-asset'))return['Hybrid','Hybrid'];
  if(has('balanced')||has('hybrid')||has('dynamic asset')||has('equity savings'))return['Hybrid','Hybrid'];
  if(has('debt')||has('bond')||has('gilt')||has('duration')||has('liquid')||has('money market')||has('corporate'))return['Debt','Debt'];
  if(has('nasdaq')||has('global')||has('international')||has('world')||has(' us ')||has('emerging market'))return['Global','Equity'];
  if(has('small cap')||has('smallcap'))return['Small Cap','Equity'];
  if(has('mid cap')||has('midcap'))return['Mid Cap','Equity'];
  if(has('large & mid')||has('large and mid'))return['Large & Mid','Equity'];
  if(has('psu')||has('infra')||has('pharma')||has('bank')||has('tech')||has('digital')||has('energy')||has('consumption')||has('manufacturing')||has('thematic')||has('sector')||has('healthcare')||has('fmcg'))return['Thematic','Equity'];
  if(has('nifty')||has('sensex')||has('index')||has('large cap')||has('largecap')||has('bluechip')||has('top 100'))return['Large Cap','Equity'];
  if(has('flexi')||has('multi cap')||has('multicap')||has('focused')||has('value')||has('contra')||has('elss')||has('tax')||has('opportunit'))return['Flexi Cap','Equity'];
  return['Flexi Cap','Equity'];}

const HZYRS={'<3':2,'3-5':4,'5-7':6,'7+':9};
function targets(p){
  const base={'<3':35,'3-5':55,'5-7':65,'7+':75}[p.horizon]??60;
  const adj={calm:5,nervous:-5,cautious:-10}[p.risk]??0;
  let eq=Math.max(30,Math.min(85,base+adj)),gold=10,hybrid=15,debt=Math.max(5,100-eq-gold-hybrid);
  const t=eq+gold+hybrid+debt;eq=Math.round(eq*100/t);gold=Math.round(gold*100/t);hybrid=Math.round(hybrid*100/t);debt=100-eq-gold-hybrid;
  return{equity:eq,hybrid,gold,debt};}
function blendedReturn(t){return(t.equity*12+t.hybrid*9+t.gold*6.5+t.debt*6.5)/10000;}

function verdicts(holds,total,p){
  const t=targets(p);
  const metal=holds.filter(h=>h.grp==='Metal').reduce((a,b)=>a+b.cur,0);
  const metalOver=metal/total*100>t.gold+3;
  const golds=holds.filter(h=>h.grp==='Metal'&&h.cat!=='Silver').sort((a,b)=>b.cur-a.cur);
  const keepGold=golds[0]?golds[0].key:null;
  const byCat={};holds.forEach(h=>{if(h.grp==='Equity')(byCat[h.cat]=byCat[h.cat]||[]).push(h);});
  Object.values(byCat).forEach(a=>a.sort((x,y)=>y.cur-x.cur));
  return holds.map(h=>{let v='Keep',r='Core holding — keep.';const w=h.cur/total*100;
    if(h.grp==='Metal'&&h.cat==='Silver'&&metalOver){v='Exit';r=`Silver is ${CTX.silver}; metals overweight — trim it.`;}
    else if(h.grp==='Metal'&&metalOver&&h.key!==keepGold){v='Trim';r=`Gold ${CTX.gold} — keep one gold fund, consolidate the rest.`;}
    else if(h.grp==='Metal'){v='Keep';r=`Gold ${CTX.gold}; one hedge fund (~10%) is right.`;}
    else if(h.cat==='Thematic'&&(p.risk==='cautious'||p.risk==='nervous')){v='Exit';r=`Theme bets are ${CTX.psu} — too risky for your comfort level.`;}
    else if(h.grp==='Equity'&&byCat[h.cat].length>1&&byCat[h.cat][0].key!==h.key){v='Trim';r=`Duplicate ${h.cat} fund — merge into your bigger one.`;}
    else if(w<2.5){v='Trim';r='Tiny position — too small to matter; merge it.';}
    else if(h.cat==='Small Cap'){v='Keep';r=`Small-cap ${CTX.smallcap}; keep but size modestly.`;}
    else if(h.cat==='Mid Cap'){v='Keep';r=`Mid-cap ${CTX.midcap}; quality holding.`;}
    else if(h.grp==='Hybrid'){v='Keep';r=`Hybrid is ${CTX.hybrid} — your steadiness anchor.`;}
    return Object.assign({},h,{verdict:v,why:r});});}

function lagDays(d){if(!d)return 99;const p=d.split('-');const dt=new Date(p[2],p[1]-1,p[0]);return Math.floor((Date.now()-dt)/864e5);}
async function getNav(code){
  for(const mk of NAV_SRCS){try{const r=await fetch(mk(code),{cache:'no-store'});const j=await r.json();
    const d=j.data&&j.data[0];if(d&&parseFloat(d.nav)>0)return{nav:parseFloat(d.nav),date:d.date};}catch(e){}}
  return null;}
async function matchCode(name){
  const c=curatedCode(name);if(c)return c;
  const tries=[name,name.replace(/fund.*$/i,'fund'),name.split(/\s+/).slice(0,4).join(' ')];
  for(const q of tries){try{const r=await fetch(SEARCH(q));const arr=await r.json();if(!arr||!arr.length)continue;
    const cands=arr.filter(s=>/growth/i.test(s.schemeName)&&!/idcw|dividend|bonus|direct/i.test(s.schemeName));
    const ordered=[...cands.filter(s=>/regular/i.test(s.schemeName)),...cands];
    for(const s of ordered.slice(0,4)){const x=await getNav(String(s.schemeCode));if(x&&lagDays(x.date)<20)return String(s.schemeCode);}
    if(ordered[0])return String(ordered[0].schemeCode);}catch(e){}}
  return null;}

/* ---------- navigation ---------- */
function show(id){['setup','review','dash'].forEach(s=>$(s).classList.add('hide'));$(id).classList.remove('hide');
  $('bar').classList.toggle('hide',id!=='dash');
  const hh=LS.g('holdings',[]).length>0;
  $('backSetup').classList.toggle('hide',!(id==='setup'&&hh));
  $('backReview').classList.toggle('hide',!(id==='review'&&hh));
  window.scrollTo(0,0);}
function backDash(){if(LS.g('holdings',[]).length)refresh();}
function busy(on,t,sub){$('busy').style.display=on?'flex':'none';if(t)$('busytxt').textContent=t;$('busysub').textContent=sub||'';}

/* ---------- OCR + parse (reads Invested + Current Value; units derived from live NAV) ---------- */
async function onBuild(){
  ensureProfile();
  const files=$('shots').files;
  if(!files.length){alert('Add at least one screenshot first.');return;}
  busy(true,'Reading screenshots…','Runs on your phone — can take a moment.');
  let text='';
  for(let i=0;i<files.length;i++){$('busysub').textContent=`Image ${i+1} of ${files.length}…`;
    try{const r=await Tesseract.recognize(files[i],'eng');text+='\n'+r.data.text;}catch(e){}}
  busy(false);
  startReview(parsePortfolio(text));}
function parsePortfolio(text){
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);const out=[];
  const isName=l=>/[A-Za-z]{4,}/.test(l)&&/(fund|etf|flexi|index|nifty|psu|multi[- ]?asset|bond|gilt|debt)/i.test(l)&&!/^(inv\.|inv\s+amt|cur\.|bal\s*units|abs\.|unr\.|as on|scheme|investor|net asset)/i.test(l);
  for(let i=0;i<lines.length;i++){if(!isName(lines[i]))continue;
    let name=lines[i].replace(/\s*[-–]\s*(regular\s*)?gr\b.*$/i,'').replace(/[↗➔→»]+/g,'').replace(/\s{2,}/g,' ').trim();
    if(name.length<6)continue;
    const blk=lines.slice(i,i+9).join(' ').replace(/-?\d[\d,]*\.\d+\s*%/g,' ');
    const signed=(blk.match(/-?\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)/g)||[]).map(s=>parseFloat(s.replace(/,/g,'')));
    const pos=signed.filter(x=>x>0);
    const units=(blk.match(/\d{1,4}(?:,\d{3})*\.\d{3}(?!\d)/g)||[]).map(s=>parseFloat(s.replace(/,/g,'')));
    const nav4=(blk.match(/\d{1,4}(?:,\d{3})*\.\d{4}(?!\d)/g)||[]).map(s=>parseFloat(s.replace(/,/g,'')));
    let inv=pos[0]||0,cur=pos[1]||0;
    const cc=(units[0]&&nav4[0])?units[0]*nav4[0]:0;        // Units x NAV ≈ Current
    if((!cur||cur<=0)&&cc>0)cur=Math.round(cc*100)/100;
    const gain=cur-inv;                                     // Invested + Gain = Current must hold
    const idOk=inv>0&&cur>0&&signed.some(x=>Math.abs(x-gain)<2);
    out.push({name,inv,cur,flag:!idOk});}
  const map={};
  out.forEach(o=>{const k=o.name.toLowerCase().replace(/[^a-z]/g,'').slice(0,30);if(!map[k]||o.inv>map[k].inv)map[k]=o;});
  return Object.values(map);}

function startReview(parsed){
  editRows=parsed.length?parsed:[{name:'',inv:0,cur:0,flag:true}];renderEdit();
  const nf=editRows.filter(r=>r.flag).length;
  $('dedupNote').innerHTML=parsed.length?'<i>✓ deduped</i>':'';
  $('reviewTitle').textContent=parsed.length?`Found ${parsed.length} funds`:'No funds read';
  $('matchStatus').innerHTML=nf?`<span style="color:var(--amber)">⚠ ${nf} row(s) didn't add up (Invested + Gain ≠ Current) — check the highlighted ones.</span>`:'';
  show('review');}
function addEditRow(){editRows.push({name:'',inv:0,cur:0,flag:true});renderEdit();}
function renderEdit(){
  $('editList').innerHTML=editRows.map((r,i)=>{
    const bad=r.flag;const bord=bad?'border:1.5px solid var(--amber)':'border:1px solid var(--line)';
    return `<div style="margin-bottom:12px;border-bottom:1px solid var(--line);padding-bottom:9px">
    ${bad?'<div style="font-size:11px;color:var(--amber);margin-bottom:4px">⚠ check the amounts below</div>':''}
    <input value="${(r.name||'').replace(/"/g,'&quot;')}" placeholder="Fund name" oninput="editRows[${i}].name=this.value">
    <div class="editrow" style="margin-top:7px">
      <input type="number" inputmode="numeric" value="${r.inv||''}" placeholder="Invested ₹" style="${bord}" oninput="editRows[${i}].inv=parseFloat(this.value)||0;editRows[${i}].flag=false;this.style.border='1px solid var(--line)'">
      <input type="number" inputmode="numeric" value="${r.cur||''}" placeholder="Current ₹" style="${bord}" oninput="editRows[${i}].cur=parseFloat(this.value)||0;editRows[${i}].flag=false;this.style.border='1px solid var(--line)'">
      <button class="btn-sec" style="padding:9px 0" onclick="editRows.splice(${i},1);renderEdit()">✕</button>
    </div></div>`;}).join('');}
async function saveHoldings(){
  const rows=editRows.filter(r=>r.name&&r.name.trim().length>3&&(r.cur>0||r.inv>0));
  if(!rows.length){alert('Add at least one fund with a name and a current value.');return;}
  busy(true,'Matching funds to AMFI…','Finding the official NAV code for each fund.');
  const holds=[],navs=LS.g('navs',{}),dates=LS.g('navDates',{});let miss=0;
  for(const r of rows){$('busysub').textContent=r.name;
    const code=await matchCode(r.name);const [cat,grp]=classify(r.name);
    if(!code){miss++;continue;}
    const x=await getNav(code);const nav=x?x.nav:0;if(x){navs[code]=x.nav;dates[code]=x.date;}
    const inv=r.inv||0,cur=r.cur||0,units=nav>0?(cur||inv)/nav:0;
    holds.push({key:code+Math.random().toString(36).slice(2,5),name:r.name.trim(),code,cat,grp,units,inv,cur});}
  LS.s('navs',navs);LS.s('navDates',dates);
  busy(false);
  if(!holds.length){alert('Could not match any fund. Edit names closer to how NJ shows them.');return;}
  LS.s('holdings',holds);
  resetGrow();resetCal();
  if(miss)$('matchStatus').textContent=miss+' fund(s) could not be matched and were skipped.';
  refresh();}

/* ---------- live refresh ---------- */
async function refresh(){
  const holds=LS.g('holdings',[]);if(!holds.length){show('setup');return;}
  show('dash');$('status').textContent='Refreshing live NAVs…';
  const navs=LS.g('navs',{}),dates=LS.g('navDates',{});let live=0;
  await Promise.all(holds.map(async h=>{const x=await getNav(h.code);if(x){navs[h.code]=x.nav;dates[h.code]=x.date;live++;}}));
  LS.s('navs',navs);LS.s('navDates',dates);
  renderDash(holds,navs,dates,live);}

function renderDash(holds,navs,dates,live){
  const p=LS.g('profile',{age:36,horizon:'5-7',risk:'nervous'});
  let ti=0,tc=0;
  let rows=holds.map(h=>{const nav=navs[h.code]||0;const cur=nav>0&&h.units>0?h.units*nav:(h.cur||0);
    ti+=h.inv;tc+=cur;return Object.assign({},h,{nav,cur,pl:cur-h.inv,date:dates[h.code]});});
  rows=verdicts(rows,tc||1,p);
  window._rows=rows;window._tot=tc;window._p=p;
  const pl=tc-ti,metal=rows.filter(r=>r.grp==='Metal').reduce((a,b)=>a+b.cur,0);
  $('kpis').innerHTML=[
    ['Invested',inr(ti),holds.length+' funds',''],['Current value',inr(tc),'live NAVs',''],
    ['Gain / loss',(pl<0?'−':'+')+inr(Math.abs(pl)),(pl/(ti||1)*100).toFixed(1)+'%',pl<0?'neg':'pos'],
    ['Gold / silver',(metal/(tc||1)*100).toFixed(0)+'%','target ~10%','neg']
  ].map(k=>`<div class="kpi"><div class="l">${k[0]}</div><div class="v ${k[3]}">${k[1]}</div><div class="l ${k[3]}">${k[2]}</div></div>`).join('');
  const now=new Date();
  $('status').innerHTML=live>0?'✓ Updated '+now.toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+' · '+live+'/'+holds.length+' live':'⚠ Offline — last saved values';
  const g=f=>rows.filter(f).reduce((a,b)=>a+b.cur,0);
  const eq=g(r=>r.grp==='Equity'),hy=g(r=>r.grp==='Hybrid'),go=metal,de=g(r=>r.grp==='Debt');
  const segs=[[eq,'#1457d6','Equity'],[hy,'#0f9d58','Hybrid'],[go,'#c77700','Gold/Silver'],[de,'#888780','Debt']].filter(s=>s[0]>0);
  $('allocbar').innerHTML=segs.map(s=>`<span style="width:${s[0]/(tc||1)*100}%;background:${s[1]}"></span>`).join('');
  $('alloclegend').textContent=segs.map(s=>`${s[2]} ${(s[0]/(tc||1)*100).toFixed(0)}%`).join(' · ');
  if(assetChart)assetChart.destroy();
  assetChart=new Chart($('assetChart'),{type:'doughnut',data:{labels:segs.map(s=>s[2]),datasets:[{data:segs.map(s=>s[0]),backgroundColor:segs.map(s=>s[1])}]},options:{plugins:{legend:{position:'bottom'}},cutout:'58%',responsive:true,maintainAspectRatio:false}});
  const t=targets(p);
  $('allocAdvice').innerHTML=`At ${p.age}, ${p.horizon} yrs, ${p.risk}: target about <b>${t.equity}% equity / ${t.hybrid}% hybrid / ${t.gold}% gold / ${t.debt}% debt</b>. You're at ${(eq/(tc||1)*100).toFixed(0)}% equity, ${(go/(tc||1)*100).toFixed(0)}% gold/silver.`;
  // projection
  const yrs=HZYRS[p.horizon],r=blendedReturn(t);
  const fv=tc*Math.pow(1+r,yrs),fv12=tc*Math.pow(1.12,yrs);
  $('projection').innerHTML=`Over your <b>${yrs}-yr</b> horizon, this mix targets ~<b>${(r*100).toFixed(1)}%</b>/yr → about <b>${inr(fv)}</b> from today's ${inr(tc)} (no fresh money). To reach a 12%/yr path (~${inr(fv12)}) you'd need a more equity-heavy, more volatile portfolio. <span style="color:var(--muted)">Illustrative, not a promise.</span>`;
  // holdings
  $('holdList').innerHTML=rows.sort((a,b)=>b.cur-a.cur).map(h=>{
    const lag=lagDays(h.date);const dtxt=h.date?(lag>4?`<span class="lag">NAV ${h.date} ⚠</span>`:`NAV ${h.date}`):'no live NAV';
    return `<div class="row"><div style="flex:1"><div class="fname">${h.name}</div>
      <div class="fsub">${inr(h.cur)} · ${h.pl<0?'−':'+'}${inr(Math.abs(h.pl))} · ${dtxt}</div>
      <div class="why">${h.why}</div></div><span class="tag t-${h.verdict}">${h.verdict}</span></div>`;}).join('');
  // history + trend (with projection tail)
  let hist=LS.g('history',[]);const today=now.toISOString().slice(0,10);
  hist=hist.filter(x=>x.date!==today);hist.push({date:today,cur:Math.round(tc)});hist.sort((a,b)=>a.date.localeCompare(b.date));
  if(hist.length>120)hist=hist.slice(-120);LS.s('history',hist);
  const m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const labels=hist.map(x=>{const q=x.date.split('-');return q[2]+' '+m[+q[1]-1];});
  const projLabels=[];for(let yy=1;yy<=yrs;yy++)projLabels.push('+'+yy+'y');
  const allLabels=labels.concat(projLabels);
  const valData=hist.map(x=>x.cur).concat(new Array(yrs).fill(null));
  const projData=new Array(hist.length-1).fill(null).concat([tc]).concat(Array.from({length:yrs},(_,i)=>Math.round(tc*Math.pow(1+r,i+1))));
  if(trendChart)trendChart.destroy();
  trendChart=new Chart($('trendChart'),{type:'line',data:{labels:allLabels,datasets:[
    {label:'Value',data:valData,borderColor:'#1457d6',backgroundColor:'rgba(20,87,214,.08)',fill:true,tension:.25,pointRadius:2},
    {label:'Projected',data:projData,borderColor:'#0f9d58',borderDash:[4,4],pointRadius:0},
    {label:'Invested',data:hist.map(()=>ti).concat(new Array(yrs).fill(null)),borderColor:'#9aa3b5',borderDash:[5,4],pointRadius:0}]},
    options:{plugins:{legend:{position:'bottom'}},responsive:true,maintainAspectRatio:false,scales:{y:{ticks:{callback:v=>'₹'+(v/100000).toFixed(1)+'L'}}}}});
  // refresh dynamic sections if amounts already entered
  if($('growAmt').value)planGrow();
  if($('calAmt').value)planCal();
  show('dash');}

/* ---------- Plan to grow (input-driven) ---------- */
function bucketTotals(){const r=window._rows||[];const g=f=>r.filter(f).reduce((a,b)=>a+b.cur,0);
  return{equity:g(x=>x.grp==='Equity'),hybrid:g(x=>x.grp==='Hybrid'),gold:g(x=>x.grp==='Metal'),debt:g(x=>x.grp==='Debt'),total:window._tot||0};}
function planGrow(){
  const newAmt=parseFloat($('growAmt').value)||0;const p=window._p||LS.g('profile',{});
  if(newAmt<=0){$('growOut').innerHTML='<div class="note">Enter an amount to see the plan.</div>';return;}
  const t=targets(p),b=bucketTotals(),total=b.total+newAmt;
  const tgt={equity:total*t.equity/100,hybrid:total*t.hybrid/100,gold:total*t.gold/100,debt:total*t.debt/100};
  const rd=n=>Math.max(0,Math.round(n/1000)*1000);
  const keepers=(window._rows||[]).filter(x=>x.verdict==='Keep');
  const rows=[];
  // equity: existing keepers scaled + NEW index + NEW global
  const eqKeep=keepers.filter(x=>x.grp==='Equity');const eqCur=eqKeep.reduce((a,b)=>a+b.cur,0)||1;
  const idxAmt=rd(tgt.equity*0.20),gloAmt=rd(tgt.equity*0.08),restEq=tgt.equity-idxAmt-gloAmt;
  eqKeep.forEach(f=>rows.push([f.name,f.cat,rd(restEq*f.cur/eqCur),'Top-up']));
  if(!(window._rows||[]).some(x=>x.cat==='Large Cap'&&/index|nifty/i.test(x.name)))rows.push(['Nifty 50 Index Fund','Large-cap index',idxAmt,'NEW']);
  if(!(window._rows||[]).some(x=>x.cat==='Global'))rows.push(['Global / Nasdaq 100 FoF','Global equity',gloAmt,'NEW']);
  // hybrid
  const hyb=keepers.find(x=>x.grp==='Hybrid');
  rows.push([hyb?hyb.name:'Multi-Asset / Balanced Advantage',hyb?'Hybrid':'Hybrid (NEW)',rd(tgt.hybrid),hyb?'Top-up':'NEW']);
  // gold (single)
  const gold=keepers.find(x=>x.grp==='Metal')||(window._rows||[]).filter(x=>x.grp==='Metal'&&x.cat!=='Silver').sort((a,b)=>b.cur-a.cur)[0];
  rows.push([gold?gold.name:'Gold ETF FoF',gold?'Gold':'Gold (NEW)',rd(tgt.gold),'Top-up']);
  // debt
  const debt=keepers.find(x=>x.grp==='Debt');
  rows.push([debt?debt.name:'Short-term / Corporate Bond fund',debt?'Debt':'Debt (NEW)',rd(tgt.debt),debt?'Top-up':'NEW']);
  const tagc=a=>a==='NEW'?'t-Exit':(a==='Hold'?'t-Keep':'t-Trim');
  $('growOut').innerHTML=`<div class="note" style="margin-bottom:8px">Target ₹${(total/100000).toFixed(2)}L mix: ${t.equity}% equity / ${t.hybrid}% hybrid / ${t.gold}% gold / ${t.debt}% debt. Split the ${inr(newAmt)} over the buy calendar below, don't lump it.</div>
   <table><thead><tr><th>Fund</th><th>Type</th><th style="text-align:right">Target</th><th>Action</th></tr></thead><tbody>${
   rows.map(r=>`<tr><td>${r[0]}</td><td style="color:var(--muted);font-size:12px">${r[1]}</td><td style="text-align:right">${inr(r[2])}</td><td><span class="tag ${tagc(r[3])}">${r[3]}</span></td></tr>`).join('')}</tbody></table>`;}

/* ---------- Buy calendar (input-driven) ---------- */
function planCal(){
  const newAmt=parseFloat($('calAmt').value)||0;const months=Math.max(1,Math.min(12,parseInt($('calMonths').value)||3));
  if(newAmt<=0){$('calOut').innerHTML='<div class="note">Enter the amount and months to generate a schedule.</div>';return;}
  const p=window._p||{},t=targets(p),per=newAmt/months;
  const sells=(window._rows||[]).filter(x=>x.verdict!=='Keep').sort((a,b)=>(a.verdict==='Exit'?-1:1));
  const perMonthSell=Math.ceil(sells.length/months);
  const buyBuckets=[['Debt',t.debt],['Hybrid',t.hybrid],['Equity',t.equity],['Gold',t.gold]];
  let rows='';const rd=n=>Math.round(n/1000)*1000;
  for(let mo=1;mo<=months;mo++){
    const ss=sells.slice((mo-1)*perMonthSell,mo*perMonthSell).map(x=>x.name.split(' ').slice(0,3).join(' ')+' ('+x.verdict+')');
    const buys=buyBuckets.map(([lbl,w])=>`${lbl} ${inr(rd(per*w/100))}`).join(' · ');
    rows+=`<tr><td style="vertical-align:top"><b>Month ${mo}</b></td>
      <td style="text-align:left;color:var(--red);font-size:12px">${ss.length?ss.join('<br>'):'—'}</td>
      <td style="text-align:left;color:var(--green);font-size:12px">${buys}</td></tr>`;}
  $('calOut').innerHTML=`<div class="note" style="margin-bottom:8px">${inr(newAmt)} over ${months} month(s) = ${inr(per)}/month. Pick a fixed date; sell &amp; buy the same day.</div>
   <table><thead><tr><th>When</th><th style="text-align:left">Sell</th><th style="text-align:left">Buy (by bucket)</th></tr></thead><tbody>${rows}</tbody></table>`;}

function resetGrow(){$('growAmt').value='';$('growOut').innerHTML='';}
function resetCal(){$('calAmt').value='';$('calMonths').value='3';$('calOut').innerHTML='';}

/* ---------- profile ---------- */
function ensureProfile(){
  const age=parseInt($('age').value)||0;
  const hz=document.querySelector('#horizonChips .chip.on'),rk=document.querySelector('#riskChips .chip.on');
  const ex=LS.g('profile',null);
  LS.s('profile',{age:(age>=18&&age<=90)?age:(ex&&ex.age?ex.age:35),
    horizon:hz?hz.dataset.v:(ex&&ex.horizon?ex.horizon:'5-7'),
    risk:rk?rk.dataset.v:(ex&&ex.risk?ex.risk:'nervous')});return true;}
function loadProfileForm(){const p=LS.g('profile',null);if(!p)return;$('age').value=p.age;
  document.querySelectorAll('#horizonChips .chip').forEach(c=>c.classList.toggle('on',c.dataset.v===p.horizon));
  document.querySelectorAll('#riskChips .chip').forEach(c=>c.classList.toggle('on',c.dataset.v===p.risk));}
function reupload(){show('setup');loadProfileForm();$('shots').value='';$('shotcount').textContent='';}
function editProfile(){show('setup');loadProfileForm();}

document.querySelectorAll('.chips').forEach(grp=>grp.addEventListener('click',e=>{
  if(!e.target.classList.contains('chip'))return;
  grp.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));e.target.classList.add('on');}));
$('shots').addEventListener('change',()=>{const n=$('shots').files.length;$('shotcount').textContent=n?n+' image(s) selected':'';});

if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
(function init(){const holds=LS.g('holdings',[]);if(holds.length)refresh();else{loadProfileForm();show('setup');}})();
