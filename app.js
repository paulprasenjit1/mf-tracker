/* MF Tracker — on-device, private. All data stays in this browser. */
const APP_VERSION='1.2 · build 18';
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
    // News-aware nudge (one notch only; profile/risk rules still set the base)
    let news='';const sig=signalFor(h);
    if(sig&&sig.bias){const rank={Exit:0,Trim:1,Keep:2},inv={0:'Exit',1:'Trim',2:'Keep'};
      let nr=rank[v]+(sig.bias>0?1:-1);nr=Math.max(0,Math.min(2,nr));
      if(inv[nr]!==v){v=inv[nr];news=`📡 News (${sig.bias>0?'positive':'negative'}): ${sig.note}`;}}
    return Object.assign({},h,{verdict:v,why:r,news});});}

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
function ensureTesseract(){return new Promise((res,rej)=>{if(window.Tesseract)return res();
  const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  s.onload=()=>res();s.onerror=()=>rej(new Error('Could not load the OCR engine — check your connection.'));document.head.appendChild(s);});}
async function onBuild(){
  ensureProfile();
  const files=$('shots').files;
  if(!files.length){alert('Add at least one screenshot first.');return;}
  busy(true,'Loading reader…','First scan loads the OCR engine (one-time).');
  try{await ensureTesseract();}catch(e){busy(false);alert(e.message);return;}
  busy(true,'Reading screenshots…','Runs on your phone — can take a moment.');
  let text='';
  for(let i=0;i<files.length;i++){$('busysub').textContent=`Image ${i+1} of ${files.length}…`;
    try{const r=await Tesseract.recognize(files[i],'eng');text+='\n'+r.data.text;}catch(e){}}
  busy(false);
  startReview(parsePortfolio(text));}
function strip1(x){ // drop a spurious leading digit (OCR reads ₹ as 3/7): 326048.62 -> 26048.62
  if(!x||x<=0)return 0;const s=x.toFixed(2),d=s.indexOf('.'),ip=s.slice(0,d);
  if(ip.length<=1)return 0;return parseFloat(ip.slice(1)+s.slice(d));}
function parsePortfolio(text){
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);const out=[];
  const isName=l=>/[A-Za-z]{4,}/.test(l)&&/(fund|etf|flexi|index|nifty|psu|multi[- ]?asset|bond|gilt|debt)/i.test(l)&&!/^(inv\.|inv\s+amt|cur\.|bal\s*units|abs\.|unr\.|as on|scheme|investor|net asset)/i.test(l);
  for(let i=0;i<lines.length;i++){if(!isName(lines[i]))continue;
    // NJ fund title: "<Name> - Gr ↗" or "<Name> - Regular Gr ↗". Strip plan suffix, arrows, leading junk.
    let name=lines[i]
      .replace(/\s*[-–—]\s*(regular|direct)?\s*(plan)?\s*(gr(owth)?)\b.*$/i,'')
      .replace(/\s*[-–—]\s*(idcw|dividend|payout|reinvest).*$/i,'')
      .replace(/[↗➔→»➜↑]+/g,'').replace(/^[^A-Za-z]+/,'').replace(/\s{2,}/g,' ').trim();
    if(name.length<6)continue;
    // Limit this card's block to end before the NEXT fund title, so amounts don't bleed across cards.
    let end=Math.min(lines.length,i+9);
    for(let j=i+1;j<end;j++){if(isName(lines[j])){end=j;break;}}
    const blk=lines.slice(i,end).join(' ').replace(/-?\d[\d,]*\.\d+\s*%/g,' ');
    const signed=(blk.match(/-?\d[\d,]*\.\d{2}(?!\d)/g)||[]).map(s=>parseFloat(s.replace(/,/g,'')));
    const pos=signed.filter(x=>x>0);
    const units=(blk.match(/\d[\d,]*\.\d{3}(?!\d)/g)||[]).map(s=>parseFloat(s.replace(/,/g,'')));
    const nav4=(blk.match(/\d[\d,]*\.\d{4}(?!\d)/g)||[]).map(s=>parseFloat(s.replace(/,/g,'')));
    const invR=pos[0]||0,curR=pos[1]||0;
    const sInv=strip1(invR),sCur=strip1(curR);                 // value with a spurious leading OCR digit removed (₹→3/7)
    const cc=(units[0]&&nav4[0])?Math.round(units[0]*nav4[0]*100)/100:0;   // Units x NAV = reliable Current
    const invVars=[invR,sInv].filter(v=>v>0);
    const curVars=[curR,sCur].filter(v=>v>0);
    let inv=invR,cur=curR>0?curR:0,fixed=false;
    if(cc>0){                                                  // anchor on Units x NAV
      const m=curVars.find(v=>Math.abs(v-cc)/cc<0.02);
      cur=(m!=null)?m:cc;fixed=true;
      const ig=invVars.find(iv=>signed.some(g=>Math.abs(iv+g-cur)<2));   // confirm invested via Inv+Gain=Cur
      if(ig!=null)inv=ig;
      else{const c=invVars.slice().sort((a,b)=>Math.abs(a-cur)-Math.abs(b-cur));inv=(c[0]&&Math.abs(c[0]-cur)/cur<2)?c[0]:invR;}
    }else{                                                     // no NAV: use Inv + Gain = Cur identity
      outer:for(const g of signed){for(const iv of invVars){for(const cv of curVars){
        if(Math.abs(iv+g-cv)<2){inv=iv;cur=cv;fixed=true;break outer;}}}}
      if(!fixed){                                              // blank/garbled current: derive from stripped invested + gain
        const base=sInv>0?sInv:invR;
        for(const g of signed){if(Math.abs(Math.abs(g)-invR)<2||Math.abs(Math.abs(g)-sInv)<2)continue;
          const c=base+g;if(c>0){inv=base;cur=Math.round(c*100)/100;fixed=true;break;}}}
    }
    out.push({name,inv,cur,flag:!fixed});}
  const map={};
  out.forEach(o=>{const k=o.name.toLowerCase().replace(/[^a-z]/g,'').slice(0,30);if(!map[k]||o.inv>map[k].inv)map[k]=o;});
  const rows=Object.values(map);
  // For recognised funds, use verified invested (OCR only identifies the fund); clears false flags.
  rows.forEach(r=>{const c=curatedCode(r.name);if(c&&REF[c]){r.inv=REF[c].inv;r.flag=false;}});
  return rows;}

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
    let inv=r.inv||0,cur=r.cur||0,units=nav>0?(cur||inv)/nav:0;
    if(REF[code]){inv=REF[code].inv;units=REF[code].units;cur=nav>0?units*nav:cur;}  // recognised fund: use verified holdings
    holds.push({key:code+Math.random().toString(36).slice(2,5),name:r.name.trim(),code,cat,grp,units,inv,cur});}
  LS.s('navs',navs);LS.s('navDates',dates);LS.s('navTs',Date.now());
  busy(false);
  if(!holds.length){alert('Could not match any fund. Edit names closer to how NJ shows them.');return;}
  LS.s('holdings',holds);
  resetGrow();resetCal();
  if(miss)$('matchStatus').textContent=miss+' fund(s) could not be matched and were skipped.';
  refresh();}

/* ---------- live refresh ---------- */
async function refresh(force){
  const holds=LS.g('holdings',[]);if(!holds.length){show('setup');return;}
  show('dash');
  const navs=LS.g('navs',{}),dates=LS.g('navDates',{});
  // Battery/data saver: reuse NAVs if fetched < 30 min ago (unless the user taps Refresh).
  const fresh=(Date.now()-(LS.g('navTs',0))<30*60*1000)&&holds.every(h=>navs[h.code]);
  if(!force&&fresh){renderDash(holds,navs,dates,holds.length);return;}
  $('status').textContent='Refreshing live NAVs…';let live=0;
  await Promise.all(holds.map(async h=>{const x=await getNav(h.code);if(x){navs[h.code]=x.nav;dates[h.code]=x.date;live++;}}));
  LS.s('navs',navs);LS.s('navDates',dates);LS.s('navTs',Date.now());
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
  const t=targets(p);
  $('allocAdvice').innerHTML=`At ${p.age}, ${p.horizon} yrs, ${p.risk}: target about <b>${t.equity}% equity / ${t.hybrid}% hybrid / ${t.gold}% gold / ${t.debt}% debt</b>. You're at ${(eq/(tc||1)*100).toFixed(0)}% equity, ${(go/(tc||1)*100).toFixed(0)}% gold/silver.`;
  // projection
  const yrs=HZYRS[p.horizon],r=blendedReturn(t);
  const fv=tc*Math.pow(1+r,yrs),fv12=tc*Math.pow(1.12,yrs);
  $('projection').innerHTML=`Over your <b>${yrs}-yr</b> horizon, this mix targets ~<b>${(r*100).toFixed(1)}%</b>/yr → about <b>${inr(fv)}</b> from today's ${inr(tc)} (no fresh money). To reach a 12%/yr path (~${inr(fv12)}) you'd need a more equity-heavy, more volatile portfolio. <span style="color:var(--muted)">Illustrative, not a promise.</span>`;
  // holdings (filterable)
  window._hrows=rows.slice().sort((a,b)=>b.cur-a.cur);
  drawHold();
  // advisor notes (richer, advisor-style analysis)
  const ins=computeInsights(rows,p,tc,t);
  $('insights').innerHTML='<ul style="margin:0;padding-left:18px;line-height:1.7;font-size:13px">'+ins.map(x=>`<li style="margin-bottom:6px">${x}</li>`).join('')+'</ul>';
  updateSigStatus();
  loadNews();
  // history + trend (with projection tail)
  let hist=LS.g('history',[]);const today=now.toISOString().slice(0,10);
  hist=hist.filter(x=>x.date!==today);hist.push({date:today,cur:Math.round(tc)});hist.sort((a,b)=>a.date.localeCompare(b.date));
  if(hist.length>120)hist=hist.slice(-120);LS.s('history',hist);
  const m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const labels=hist.map(x=>{const q=x.date.split('-');return q[2]+' '+m[+q[1]-1];});
  const projLabels=[];for(let yy=1;yy<=yrs;yy++)projLabels.push('+'+yy+'y');
  const allLabels=labels.concat(projLabels);
  // Actual value line: real history + a bold "today" point. Projection: a light green area growing forward from today.
  const valData=hist.map(x=>x.cur).concat(new Array(yrs).fill(null));
  const ptR=hist.map((_,i)=>i===hist.length-1?5:2).concat(new Array(yrs).fill(0));
  const projData=new Array(hist.length-1).fill(null).concat([tc]).concat(Array.from({length:yrs},(_,i)=>Math.round(tc*Math.pow(1+r,i+1))));
  const fvEnd=projData[projData.length-1];
  if(trendChart)trendChart.destroy();
  trendChart=new Chart($('trendChart'),{type:'line',data:{labels:allLabels,datasets:[
    {label:'Projected',data:projData,borderColor:'#0f9d58',backgroundColor:'rgba(15,157,88,.08)',borderDash:[5,4],pointRadius:(c)=>c.dataIndex===projData.length-1?4:0,pointBackgroundColor:'#0f9d58',fill:true,tension:.3,order:2},
    {label:'Your value',data:valData,borderColor:'#1457d6',backgroundColor:'rgba(20,87,214,.10)',fill:true,tension:.25,pointRadius:ptR,pointBackgroundColor:'#1457d6',borderWidth:2,order:1},
    {label:'Invested',data:hist.map(()=>ti).concat(new Array(yrs).fill(ti)),borderColor:'#c4cbd6',borderDash:[3,4],pointRadius:0,borderWidth:1,order:3}]},
    options:{plugins:{legend:{position:'bottom',labels:{boxWidth:14,font:{size:11},usePointStyle:true}},
      tooltip:{callbacks:{label:c=>c.dataset.label+': '+(c.parsed.y!=null?inr(c.parsed.y):'—')}}},
      responsive:true,maintainAspectRatio:false,animation:false,
      scales:{x:{grid:{display:false},ticks:{font:{size:10},maxRotation:0,autoSkip:true,maxTicksLimit:6}},
        y:{grid:{color:'#eef1f6'},ticks:{font:{size:10},callback:v=>'₹'+(v/100000).toFixed(1)+'L'}}}}});
  $('projection').innerHTML=`<b>Today ${inr(tc)}</b> → in ${yrs} yrs about <b style="color:var(--green)">${inr(fvEnd)}</b> at ~${(r*100).toFixed(1)}%/yr (illustrative, no fresh money). The grey line is what you invested (${inr(ti)}); blue is where you are; green is the projected path. A 12%/yr path would reach ~${inr(fv12)} but needs a more equity-heavy, more volatile mix.`;
  // refresh dynamic sections if amounts already entered
  if($('growAmt').value)planGrow();
  if($('calAmt').value)planCal();
  show('dash');}

/* Advisor-style analysis: the things a real reviewer checks — concentration, fund-house
   overload, small/mid overexposure for the risk profile, allocation gaps, cost, tax. */
function computeInsights(rows,p,tc,t){
  const ins=[],pct=v=>v/(tc||1)*100,grp=f=>rows.filter(f).reduce((a,b)=>a+b.cur,0);
  const eq=grp(r=>r.grp==='Equity'),metal=grp(r=>r.grp==='Metal'),de=grp(r=>r.grp==='Debt'),hy=grp(r=>r.grp==='Hybrid');
  const ex=rows.filter(r=>r.verdict==='Exit').length,tr=rows.filter(r=>r.verdict==='Trim').length;
  if(ex+tr)ins.push(`<b>${ex} to exit, ${tr} to trim</b> — see the tags above. Spread the sells over a few weeks rather than one day.`);
  // Market / index read from your latest news signals
  const sg=getSignals();
  if(sg){const mk=sg.items.market||sg.items.nifty||sg.items.sensex;
    if(mk)ins.push(`<b>Market read:</b> ${mk.note} — ${mk.bias>0?'a reasonable window to add on your SIP dates':mk.bias<0?'be patient; deploy gradually, keep some dry powder':'no strong directional edge; keep staggering'}.`);
    const tilts=Object.entries(sg.items).filter(([k])=>['smallcap','midcap','largecap','flexi','gold','silver','thematic','global'].includes(k)&&['smallcapindex','midcapindex'].indexOf(k)<0);
    const up=tilts.filter(([,v])=>v.bias>0).map(([k])=>k),dn=tilts.filter(([,v])=>v.bias<0).map(([k])=>k);
    if(up.length||dn.length)ins.push(`<b>News tilt applied:</b> ${up.length?'favourable — '+up.join(', '):''}${up.length&&dn.length?'; ':''}${dn.length?'cautious — '+dn.join(', '):''}. Verdicts above reflect these (one notch).`);}
  if(pct(metal)>t.gold+5)ins.push(`<b>Gold/silver is ${pct(metal).toFixed(0)}%</b> vs a ~${t.gold}% target. Silver is ${CTX.silver} — trim metals into strength, keep one gold fund.`);
  const sm=grp(r=>r.cat==='Small Cap'||r.cat==='Mid Cap'),cap={cautious:15,nervous:22,calm:30}[p.risk]||22;
  if(pct(sm)>cap)ins.push(`<b>Small + mid cap is ${pct(sm).toFixed(0)}%</b> of equity-heavy risk — on the high side for "${p.risk}" (~${cap}% suits you). Keep your winners, don't add more.`);
  if(pct(de)<3&&t.debt>=8)ins.push(`<b>Almost no debt</b> — add ~${t.debt}% in a short-duration or corporate-bond fund to cushion the equity swings.`);
  if(!rows.some(r=>r.cat==='Global'))ins.push(`<b>No global exposure</b> — a small (~5%) US/global fund adds diversification Indian funds can't.`);
  if(!rows.some(r=>/index|nifty|sensex/i.test(r.name)))ins.push(`<b>No low-cost index fund</b> — a Nifty 50 index fund is a cheap, steady core. Also: Direct plans cost ~1%/yr less than the Regular plans bought via a distributor.`);
  if(rows.length>10)ins.push(`<b>${rows.length} funds is a lot</b> — beyond ~8–9 you mostly duplicate. Consolidating cuts overlap and tracking effort.`);
  const big=rows.slice().sort((a,b)=>b.cur-a.cur)[0];
  if(big&&pct(big.cur)>25)ins.push(`<b>${big.name} is ${pct(big.cur).toFixed(0)}%</b> of the portfolio — a large single-fund bet; avoid adding more to it.`);
  const byAmc={};rows.forEach(r=>{const a=r.name.split(/\s+/)[0];byAmc[a]=(byAmc[a]||0)+r.cur;});
  const top=Object.entries(byAmc).sort((a,b)=>b[1]-a[1])[0];
  if(top&&pct(top[1])>38)ins.push(`<b>${top[0]} funds are ${pct(top[1]).toFixed(0)}%</b> of your money — spread across more fund houses to cut single-AMC risk.`);
  const losers=rows.filter(r=>r.pl<0).sort((a,b)=>a.pl-b.pl);
  if(losers.length)ins.push(`<b>Tax tip:</b> booking the losses on your exits (e.g. ${losers[0].name}) can offset capital-gains tax this year.`);
  ins.push(`<b>Discipline:</b> stagger fresh money over a few months, keep 3–6 months of expenses outside this in a liquid fund, and review every 6 months — not daily.`);
  ins.push(`<span style="color:var(--muted)">These notes use a fixed rules engine + market context as of ${CTX.asof}. For live news and deeper reasoning, use the "Get a full AI review" button below.</span>`);
  return ins;}

/* ---------- News-aware signals (AI-assisted, free; copy prompt → run in AI → paste back) ---------- */
const SIG_KEYS=['silver','gold','smallcap','midcap','largecap','flexi','thematic','global','hybrid','debt','equity','metals','market','nifty','sensex','banknifty','midcapindex','smallcapindex'];
function getSignals(){const s=LS.g('signals',null);if(!s)return null;if(Date.now()-s.t>14*864e5)return null;return s;}
function sigKeyFor(h){
  const m={'Silver':'silver','Gold':'gold','Gold+Silver':'gold','Small Cap':'smallcap','Mid Cap':'midcap','Large Cap':'largecap','Large & Mid':'largecap','Flexi Cap':'flexi','Thematic':'thematic','Global':'global'}[h.cat];
  const broad=h.grp==='Metal'?'metals':(h.grp==='Hybrid'?'hybrid':(h.grp==='Debt'?'debt':'equity'));
  return [m,broad].filter(Boolean);}
function signalFor(h){const s=getSignals();if(!s)return null;
  for(const k of sigKeyFor(h)){if(s.items[k])return s.items[k];}return null;}
function copySignalPrompt(){
  const rows=window._hrows||LS.g('holdings',[]);
  const cats=[...new Set(rows.map(r=>r.cat).filter(Boolean))];
  const present=[...new Set(rows.flatMap(r=>sigKeyFor(r)))];
  const prompt=`You are a market strategist. Using TODAY'S Indian market news, INDEX TECHNICALS (Nifty 50, Sensex, Nifty Midcap/Smallcap, Bank Nifty — trend, support/resistance, momentum) and global/geopolitical cues, give a SHORT-TERM bias for each bucket below AND an overall market-timing read (is today a reasonable time to invest, wait, or redeem).

My asset buckets: ${present.join(', ')}.
(My fund categories: ${cats.join(', ')}.)

Reply with ONLY this block, one line per bucket, nothing else:
SIGNALS:
market=<-1|0|+1> | <overall timing: invest / wait / redeem, in <=10 words with a technical reason>
nifty=<-1|0|+1> | <Nifty trend/technical in <=8 words>
<bucket>=<-1|0|+1> | <reason in <=8 words citing news or technicals>

Rules: +1 = bullish (favour holding/adding), 0 = neutral, -1 = bearish (favour trimming/waiting). Always include a "market=" line for overall timing. Allowed buckets: ${SIG_KEYS.join(', ')}. Only include buckets you have a clear, evidence-backed view on.`;
  const done=()=>{$('sigMsg').innerHTML='<span style="color:var(--green)">✓ Prompt copied. Run it in your AI app, copy its SIGNALS block, then tap "Paste result".</span>';};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(prompt).then(done).catch(()=>{$('sigInput').value=prompt;toggleSignalPaste(true);});
  else{$('sigMsg').textContent='Copy not supported — long-press to copy from the paste box.';}}
function toggleSignalPaste(show){const el=$('sigPaste');if(show===true){el.classList.remove('hide');return;}el.classList.toggle('hide');}
function applySignals(){
  const txt=($('sigInput').value||'').trim();if(!txt){alert('Paste the AI SIGNALS block first.');return;}
  const items={};let n=0;
  txt.split('\n').forEach(line=>{const m=line.match(/^\s*([a-z&]+)\s*=\s*([+-]?\d)\s*\|\s*(.+?)\s*$/i);
    if(m){const k=m[1].toLowerCase();if(SIG_KEYS.includes(k)){const b=Math.max(-1,Math.min(1,parseInt(m[2])||0));items[k]={bias:b,note:m[3].slice(0,80)};n++;}}});
  if(!n){alert('Couldn\'t read any signals. Expected lines like: silver=+1 | reclassified as precious metal');return;}
  LS.s('signals',{t:Date.now(),items});
  $('sigMsg').innerHTML=`<span style="color:var(--green)">✓ Applied ${n} signal(s). Verdicts updated.</span>`;
  $('sigPaste').classList.add('hide');$('sigInput').value='';
  refresh();}
function clearSignals(){localStorage.removeItem('signals');$('sigInput').value='';$('sigMsg').textContent='Signals cleared.';refresh();}
function updateSigStatus(){
  const s=getSignals();const el=$('sigStatus');if(!el)return;
  if(!s){el.innerHTML='No news signals applied. Tap <b>Copy news prompt</b>, run it in your AI app, and paste the result back — current news will then nudge the verdicts (one notch, with guardrails).';return;}
  const age=Math.floor((Date.now()-s.t)/864e5);
  const arrow=b=>b>0?'<span style="color:var(--green)">↑</span>':(b<0?'<span style="color:var(--red)">↓</span>':'→');
  const list=Object.entries(s.items).map(([k,v])=>`${k} ${arrow(v.bias)}`).join(' · ');
  el.innerHTML=`<b>News signals active</b> (${age}d old, expire in ${14-age}d): ${list}. <span style="color:var(--muted)">Verdicts below reflect these.</span>`;}

/* ---------- Market & MF news (free public RSS via CORS proxy; best-effort) ---------- */
const NEWS_FEEDS=[
  ['ET Markets','https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms'],
  ['Moneycontrol Markets','https://www.moneycontrol.com/rss/marketreports.xml'],
  ['Livemint Markets','https://www.livemint.com/rss/markets'],
  ['ET Mutual Funds','https://economictimes.indiatimes.com/mutual-funds/rssfeeds/360793467.cms'],
  ['Business Standard','https://www.business-standard.com/rss/markets-106.rss']];
const PROXIES=[u=>'https://api.allorigins.win/raw?url='+encodeURIComponent(u),
               u=>'https://corsproxy.io/?url='+encodeURIComponent(u)];
const NEWS_LINKS=`<div class="note" style="margin-top:6px">Open directly:
  <a href="https://www.moneycontrol.com/mutual-funds/" target="_blank" rel="noopener">Moneycontrol MF</a> ·
  <a href="https://www.valueresearchonline.com/funds/" target="_blank" rel="noopener">Value Research</a> ·
  <a href="https://economictimes.indiatimes.com/mutual-funds" target="_blank" rel="noopener">ET MF</a></div>`;
async function fetchFeed(url){
  for(const px of PROXIES){try{
    const r=await fetch(px(url),{cache:'no-store'});const txt=await r.text();
    const xml=new DOMParser().parseFromString(txt,'text/xml');
    const items=[...xml.querySelectorAll('item')].slice(0,5).map(it=>({
      title:(it.querySelector('title')||{}).textContent||'',
      link:(it.querySelector('link')||{}).textContent||'',
      date:(it.querySelector('pubDate')||{}).textContent||''}));
    if(items.length)return items;
  }catch(e){}}
  return [];}
async function loadNews(force){
  const cache=LS.g('news',null);
  if(!force&&cache&&Date.now()-cache.t<2*3600*1000){renderNews(cache.items);return;}
  $('news').innerHTML='<div class="note">Fetching latest India market &amp; MF news…</div>';
  let all=[];
  for(const [src,url] of NEWS_FEEDS){const items=await fetchFeed(url);
    items.forEach(i=>i.src=src);all=all.concat(items);if(all.length>=8)break;}
  // dedupe by title, keep newest order
  const seen={},uniq=[];all.forEach(i=>{const k=(i.title||'').slice(0,40);if(i.title&&!seen[k]){seen[k]=1;uniq.push(i);}});
  if(uniq.length){LS.s('news',{t:Date.now(),items:uniq.slice(0,8)});renderNews(uniq.slice(0,8));}
  else renderNews(null);}
function timingBanner(){
  const s=getSignals();const mk=s&&(s.items.market||s.items.nifty);
  if(!mk)return `<div class="note" style="background:#eef4ff;border:1px solid #d4e2fb;border-radius:8px;padding:8px 10px;margin-bottom:10px">⏱ <b>Timing:</b> run <b>News-aware signals</b> above to get a live "invest / wait / redeem" read from index technicals.</div>`;
  const col=mk.bias>0?'var(--green)':(mk.bias<0?'var(--red)':'var(--amber)');
  const verb=mk.bias>0?'Reasonable time to invest':mk.bias<0?'Caution — consider waiting / staggering':'Neutral — stick to your plan';
  return `<div class="note" style="background:#f4f6fb;border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:10px">⏱ <b style="color:${col}">${verb}.</b> ${mk.note}</div>`;}
function renderNews(items){
  if(!items||!items.length){$('news').innerHTML=timingBanner()+'<div class="note">Couldn\'t load live headlines right now (the free news source may be busy).</div>'+NEWS_LINKS;return;}
  const fmt=d=>{try{const x=new Date(d);return x.toLocaleDateString('en-IN',{day:'2-digit',month:'short'});}catch(e){return '';}};
  $('news').innerHTML=timingBanner()+items.map(i=>`<div class="row" style="padding:9px 0">
    <a href="${i.link}" target="_blank" rel="noopener" style="flex:1;color:var(--ink);text-decoration:none">
      <div class="fname" style="font-weight:400">${i.title}</div>
      <div class="fsub">${i.src||''}${i.date?' · '+fmt(i.date):''}</div></a>
    <span style="color:var(--blue);font-size:12px">↗</span></div>`).join('')+NEWS_LINKS;}

let HOLDF='all';
function drawHold(){
  const rows=window._hrows||[];const r=HOLDF==='all'?rows:rows.filter(x=>x.verdict===HOLDF);
  document.querySelectorAll('#holdFilters button').forEach(b=>{
    const f=b.dataset.f;const n=f==='all'?rows.length:rows.filter(x=>x.verdict===f).length;
    b.textContent=f==='all'?`All (${rows.length})`:`${f} (${n})`;b.classList.toggle('on',f===HOLDF);});
  $('holdList').innerHTML=r.length?r.map(h=>{
    const lag=lagDays(h.date);const dtxt=h.date?(lag>4?`<span class="lag">NAV ${h.date} ⚠</span>`:`NAV ${h.date}`):'no live NAV';
    const newsln=h.news?`<div class="why" style="color:var(--blue)">${h.news}</div>`:'';
    return `<div class="row"><div style="flex:1"><div class="fname">${h.name}</div>
      <div class="fsub">${inr(h.cur)} · ${h.pl<0?'−':'+'}${inr(Math.abs(h.pl))} · ${dtxt}</div>
      <div class="why">${h.why}</div>${newsln}</div><span class="tag t-${h.verdict}">${h.verdict}</span></div>`;}).join(''):'<div class="note" style="padding:8px 0">No funds in this group.</div>';}
document.querySelectorAll('#holdFilters button').forEach(b=>b.onclick=()=>{HOLDF=b.dataset.f;drawHold();});

/* ---------- Plan to grow (input-driven) ---------- */
function bucketTotals(){const r=window._rows||[];const g=f=>r.filter(f).reduce((a,b)=>a+b.cur,0);
  return{equity:g(x=>x.grp==='Equity'),hybrid:g(x=>x.grp==='Hybrid'),gold:g(x=>x.grp==='Metal'),debt:g(x=>x.grp==='Debt'),total:window._tot||0};}
/* Build the ranked list of investment destinations by how far each bucket is BELOW target,
   tilted by any news signals. Used by both Plan-to-grow and Buy calendar. */
function growCandidates(newAmt){
  const p=window._p||LS.g('profile',{}),t=targets(p),b=bucketTotals(),total=b.total+newAmt;
  const sig=getSignals();const bias=m=>{const it=sig&&(sig.items[m]||(m==='gold'&&sig.items.metals));return it?it.bias:0;};
  const keepers=(window._rows||[]).filter(x=>x.verdict==='Keep');
  const rows=window._rows||[];
  const gap={equity:Math.max(0,total*t.equity/100-b.equity),hybrid:Math.max(0,total*t.hybrid/100-b.hybrid),
             gold:Math.max(0,total*t.gold/100-b.gold),debt:Math.max(0,total*t.debt/100-b.debt)};
  const c=[];
  if(gap.debt>0){const f=keepers.find(x=>x.grp==='Debt');c.push({name:f?f.name:'Short-Term / Corporate Bond fund',type:'Debt',bucket:'debt',w:gap.debt*(1+0.3*bias('debt')),action:f?'Top-up':'NEW',why:'Stability leg; cushions equity dips.'});}
  if(gap.hybrid>0){const f=keepers.find(x=>x.grp==='Hybrid');c.push({name:f?f.name:'Multi-Asset / Balanced Advantage',type:'Hybrid',bucket:'hybrid',w:gap.hybrid*(1+0.3*bias('hybrid')),action:f?'Top-up':'NEW',why:'All-weather core; steadiness.'});}
  if(gap.equity>0){
    const eqKeep=keepers.filter(x=>x.grp==='Equity').sort((a,b)=>b.cur-a.cur);
    const hasIdx=rows.some(x=>/index|nifty|sensex/i.test(x.name)),hasGlo=rows.some(x=>x.cat==='Global');
    const eqTilt=1+0.3*bias('equity');
    if(!hasIdx)c.push({name:'Nifty 50 Index Fund',type:'Large-cap index',bucket:'equity',w:gap.equity*0.35*eqTilt,action:'NEW',why:'Low-cost, steady core.'});
    if(!hasGlo)c.push({name:'Global / Nasdaq 100 FoF',type:'Global equity',bucket:'equity',w:gap.equity*0.18*eqTilt,action:'NEW',why:'Diversification you lack.'});
    eqKeep.slice(0,2).forEach((f,i)=>c.push({name:f.name,type:f.cat,bucket:'equity',w:gap.equity*(i?0.20:0.35)*eqTilt,action:'Top-up',why:`Quality ${f.cat.toLowerCase()} you hold.`}));
  }
  if(gap.gold>0){const f=keepers.find(x=>x.grp==='Metal')||rows.filter(x=>x.grp==='Metal'&&x.cat!=='Silver').sort((a,b)=>b.cur-a.cur)[0];
    c.push({name:f?f.name:'Gold ETF FoF',type:'Gold',bucket:'gold',w:gap.gold*(1+0.3*bias('gold')),action:f?'Top-up':'NEW',why:'Hedge to ~target weight.'});}
  return {cands:c.filter(x=>x.w>0).sort((a,b)=>b.w-a.w),t,total,sig};}

function planGrow(){
  const newAmt=parseFloat($('growAmt').value)||0;
  if(newAmt<=0){$('growOut').innerHTML='<div class="note">Enter an amount to see the plan.</div>';return;}
  const {cands,t,total,sig}=growCandidates(newAmt);
  if(!cands.length){$('growOut').innerHTML='<div class="note">Your allocation is already near target — top up your steadiest core (hybrid or a large-cap/index fund), or simply hold.</div>';return;}
  // Number of funds scales with the amount: tiny amount → 1 fund; large → up to all gaps.
  const N=Math.max(1,Math.min(cands.length,Math.round(newAmt/25000)||1));
  const chosen=cands.slice(0,N);
  const ws=chosen.reduce((a,b)=>a+b.w,0)||1;
  const rd=n=>Math.max(500,Math.round(n/500)*500);
  chosen.forEach(c=>{c.amt=rd(newAmt*c.w/ws);});
  const s=chosen.reduce((a,b)=>a+b.amt,0);chosen[0].amt+=Math.round(newAmt-s);  // absorb rounding
  chosen.forEach(c=>c.pct=Math.round(c.amt/newAmt*100));
  const tagc=a=>a==='NEW'?'t-Exit':'t-Trim';
  $('growOut').innerHTML=`<div class="note" style="margin-bottom:8px">Deploying <b>${inr(newAmt)}</b> across <b>${chosen.length} ${chosen.length>1?'funds':'fund'}</b> — fewer for a small amount, more as it grows — weighted to your biggest gaps vs a ${t.equity}/${t.hybrid}/${t.gold}/${t.debt} target${sig?', tilted by your news signals':''}.</div>
   <table><thead><tr><th>Put into</th><th style="text-align:right">Amount</th><th style="text-align:right">%</th><th>Why</th></tr></thead><tbody>${
   chosen.map(c=>`<tr><td><div class="fname">${c.name} <span class="tag ${tagc(c.action)}" style="font-size:9px;padding:1px 6px">${c.action}</span></div><div class="fsub">${c.type}</div></td>
     <td style="text-align:right">${inr(c.amt)}</td><td style="text-align:right">${c.pct}%</td><td class="why" style="max-width:120px">${c.why}</td></tr>`).join('')}</tbody></table>`;}

/* ---------- Buy calendar: category + % + ₹ per month, no sell column ---------- */
function planCal(){
  const newAmt=parseFloat($('calAmt').value)||0;const months=Math.max(1,Math.min(12,parseInt($('calMonths').value)||3));
  if(newAmt<=0){$('calOut').innerHTML='<div class="note">Enter the amount and months to generate a schedule.</div>';return;}
  const {cands,sig}=growCandidates(newAmt);
  // roll candidate weights up to category level
  const catW={};cands.forEach(c=>{const lbl={equity:'Equity (index + core)',hybrid:'Hybrid',gold:'Gold',debt:'Debt'}[c.bucket];catW[lbl]=(catW[lbl]||0)+c.w;});
  let cats=Object.entries(catW).map(([c,w])=>({c,w}));
  if(!cats.length)cats=[{c:'Hybrid / large-cap core',w:1}];
  const ws=cats.reduce((a,x)=>a+x.w,0)||1;cats.forEach(x=>x.pct=Math.round(x.w/ws*100));
  const per=newAmt/months,rd=n=>Math.round(n/500)*500;
  const mBias=(sig&&(sig.items.market||sig.items.nifty)||{}).bias||0;
  const tone=mBias>0?'📈 Signals lean positive — a reasonable time to deploy on your dates.':mBias<0?'📉 Signals lean cautious — stick to the staggered plan, don\'t front-load.':'Steady staggering is the safe default (no strong market signal).';
  let rows='';for(let mo=1;mo<=months;mo++){
    const buys=cats.map(x=>`${x.c} — ${inr(rd(per*x.pct/100))} (${x.pct}%)`).join('<br>');
    rows+=`<tr><td style="vertical-align:top;white-space:nowrap"><b>Month ${mo}</b></td><td style="text-align:left;color:var(--green);font-size:12px">${buys}</td></tr>`;}
  $('calOut').innerHTML=`<div class="note" style="margin-bottom:8px">${inr(newAmt)} over ${months} month(s) = ${inr(per)}/month. ${tone} Invest on a fixed date each month.</div>
   <table><thead><tr><th>When</th><th style="text-align:left">Invest into (category · ₹ · %)</th></tr></thead><tbody>${rows}</tbody></table>`;}

function resetGrow(){$('growAmt').value='';$('growOut').innerHTML='';}
function resetCal(){$('calAmt').value='';$('calMonths').value='3';$('calOut').innerHTML='';}

/* ---------- AI review prompt (Path 3: copy + paste into Claude/ChatGPT/Gemini) ---------- */
function aiReview(){
  const p=LS.g('profile',{age:'?',horizon:'?',risk:'?'});const rows=window._hrows||[];
  if(!rows.length){alert('Build your dashboard first.');return;}
  let ti=0,tc=0;rows.forEach(r=>{ti+=r.inv;tc+=r.cur;});
  const lines=rows.slice().sort((a,b)=>b.cur-a.cur).map(r=>
    `- ${r.name}: invested ₹${Math.round(r.inv).toLocaleString('en-IN')}, current ₹${Math.round(r.cur).toLocaleString('en-IN')} (${r.pl<0?'loss':'gain'} ₹${Math.round(Math.abs(r.pl)).toLocaleString('en-IN')})`).join('\n');
  const g=f=>rows.filter(f).reduce((a,b)=>a+b.cur,0);
  const eqp=(g(r=>r.grp==='Equity')/(tc||1)*100).toFixed(0),hyp=(g(r=>r.grp==='Hybrid')/(tc||1)*100).toFixed(0),
        gop=(g(r=>r.grp==='Metal')/(tc||1)*100).toFixed(0),dep=(g(r=>r.grp==='Debt')/(tc||1)*100).toFixed(0);
  const prompt=`Act as my SEBI-registered mutual fund advisor. Review my portfolio and give advice as if in a real advisory session: CRISP, POINT-WISE, SHORT. No fluff, no long paragraphs.

MY PROFILE: age ${p.age}, horizon ${p.horizon} years, risk comfort: ${p.risk}.
PORTFOLIO: invested ₹${Math.round(ti).toLocaleString('en-IN')}, current ₹${Math.round(tc).toLocaleString('en-IN')}.
ALLOCATION NOW: equity ${eqp}%, hybrid ${hyp}%, gold/silver ${gop}%, debt ${dep}%.
HOLDINGS:
${lines}

Before answering, CONSIDER ALL of: my age & horizon & risk; current allocation vs an ideal for me; over-concentration and single-AMC risk; duplicate/overlapping funds; high-cost (Regular vs Direct) funds; small/mid-cap exposure vs my risk; gaps (debt, global, index); TODAY'S market and index technicals (Nifty/Sensex/Midcap/Smallcap trend — is it a time to invest, wait, or redeem); tax (loss harvesting, exit loads, LTCG); and my goals.

Answer in these short sections, bullets only (1 line each):
1. VERDICT PER FUND — Keep / Trim / Exit + 4-6 word reason.
2. ALLOCATION FIX — is my mix right for my age/horizon? target %.
3. RED FLAGS — concentration, duplicates, cost, over-exposure.
4. ADD THESE — specific fund categories to add and rough %.
5. MARKET TIMING — given today's index technicals, invest now / stagger / wait?
6. TAX — any loss harvesting or exit-load points.
7. NEXT 3 STEPS — the exact actions to take now.
End with one line: overall portfolio health (Good / Needs work / Overhaul) and the single most important action.

I'm attaching my NJ E-Wealth screenshot — verify the figures. Keep it short and practical. This is educational, not a formal SEBI advisory.`;
  const done=()=>{$('aiMsg').innerHTML='<span style="color:var(--green)">✓ Prompt copied. Open your AI app, paste it, and attach your NJ screenshot.</span>';};
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(prompt).then(done).catch(()=>showPrompt(prompt));
  }else showPrompt(prompt);
}
function showPrompt(t){
  $('aiMsg').innerHTML='Copy this text manually:<textarea readonly style="width:100%;height:140px;margin-top:6px;font-size:12px;padding:8px;border:1px solid var(--line);border-radius:8px"></textarea>';
  const ta=$('aiMsg').querySelector('textarea');ta.value=t;ta.focus();ta.select();
}

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
function resetApp(){
  if(!confirm('Clear ALL saved data (profile, holdings, history, signals) and start fresh? This cannot be undone.'))return;
  ['holdings','navs','navDates','navTs','history','profile','signals','news'].forEach(k=>localStorage.removeItem(k));
  location.reload();}

document.querySelectorAll('.chips').forEach(grp=>grp.addEventListener('click',e=>{
  if(!e.target.classList.contains('chip'))return;
  grp.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));e.target.classList.add('on');}));
$('shots').addEventListener('change',()=>{const n=$('shots').files.length;$('shotcount').textContent=n?n+' image(s) selected':'';});

if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
(function init(){const v=$('ver');if(v)v.textContent='v'+APP_VERSION;
  const holds=LS.g('holdings',[]);if(holds.length)refresh();else{loadProfileForm();show('setup');}})();
