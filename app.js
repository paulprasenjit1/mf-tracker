/* MF Tracker — on-device, private. All data stays in this browser.
   v2.0: personal data removed, plan-aware AMFI matching, scored risk profile,
   educational (non-advisory) language, CAS PDF import (beta), backup/restore,
   AMFI NAV fallback, approx CAGR, projection ranges, HTML escaping. */
const APP_VERSION='3.3 · build 33';
const NAV_SRCS=[c=>`https://api.mfapi.in/mf/${c}`,c=>`https://api.mfapi.in/mf/${c}/latest`]; // full history first: also yields yesterday's NAV for day-change
const SEARCH=q=>`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`;
const LS={g:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},s:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=u=>/^https?:\/\//i.test(u||'')?u:'#';
let trendChart,editRows=[];

/* Market context used in explanatory notes. DATE-STAMPED: when older than
   CTX_MAX_DAYS the app shows a staleness warning and softens these notes. */
const CTX={asofDate:'2026-06-15',asof:'Jun 2026',
  gold:'near record highs',silver:'very volatile',
  smallcap:'corrected in 2025, recovering with strong earnings',
  midcap:'earnings momentum strong',largecap:'steady, fair value',
  psu:'narrow and sentiment-driven',hybrid:'all-weather, low stress'};
const CTX_MAX_DAYS=120;
const ctxAgeDays=()=>Math.floor((Date.now()-new Date(CTX.asofDate).getTime())/864e5);
const ctxStale=()=>ctxAgeDays()>CTX_MAX_DAYS;

/* ---------- classification ---------- */
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

/* ---------- risk profile (scored questionnaire) ---------- */
const QUIZ=[
 {q:'If your investments fell 20% in a few months, you would…',
  o:[['Sell everything',1],['Sell some, sleep better',2],['Hold on and wait',3],['Buy more at lower prices',4]]},
 {q:'Emergency savings (outside these funds) cover…',
  o:[['Less than 3 months of expenses',1],['3–6 months',2],['More than 6 months',3]]},
 {q:'EMIs / loan payments take up…',
  o:[['Over 40% of my income',1],['10–40%',2],['Under 10% or none',3]]},
 {q:'People financially dependent on you…',
  o:[['Several',1],['One or two',2],['None',3]]},
 {q:'Your investing experience…',
  o:[['First time',1],['A few years',2],['5+ years incl. a big crash',3]]},
 {q:'What matters more to you?',
  o:[['Protecting my money',1],['A balance of both',2],['Maximum growth',3]]}];
let _quizAns=[];
const BANDS={conservative:'Conservative',moderate:'Moderate',balanced:'Balanced growth',growth:'Growth'};
function bandFromScore(s){return s<=9?'conservative':s<=13?'moderate':s<=16?'balanced':'growth';}
function bandOf(p){if(p&&p.band)return p.band;
  return {calm:'balanced',nervous:'moderate',cautious:'conservative'}[p&&p.risk]||'moderate';} // old-profile migration
function renderQuiz(){const el=$('quiz');if(!el)return;
  el.innerHTML=QUIZ.map((z,i)=>`<div class="qz"><p>${i+1}. ${esc(z.q)}</p><div class="chips" data-qz="${i}">${
    z.o.map((o,j)=>`<div class="chip" role="radio" data-qz="${i}" data-j="${j}">${esc(o[0])}</div>`).join('')}</div></div>`).join('');
  syncQuizChips();}
function syncQuizChips(){document.querySelectorAll('#quiz .chip').forEach(c=>{
  c.classList.toggle('on',_quizAns[+c.dataset.qz]===+c.dataset.j);});
  const done=_quizAns.filter(a=>a!=null).length;
  const b=$('quizBand');if(!b)return;
  if(done===QUIZ.length){const sc=quizScore();const band=bandFromScore(sc);
    b.classList.remove('hide');
    b.innerHTML=`Your profile: <b>${BANDS[band]}</b>. The app will judge your mix against this. You can retake this any time from Profile.`;}
  else{b.classList.toggle('hide',done===0);b.innerHTML=`${done}/${QUIZ.length} answered — please finish all questions.`;}}
function quizScore(){return _quizAns.reduce((a,j,i)=>a+(j!=null?QUIZ[i].o[j][1]:2),0);}

/* ---------- targets & projection ---------- */
const HZYRS={'<3':2,'3-5':4,'5-7':6,'7+':9};
function targets(p){
  const base={'<3':35,'3-5':55,'5-7':65,'7+':75}[p.horizon]??60;
  const adj={conservative:-15,moderate:-7,balanced:0,growth:6}[bandOf(p)]??0;
  let eq=Math.max(25,Math.min(85,base+adj)),gold=10,hybrid=15,debt=Math.max(5,100-eq-gold-hybrid);
  const t=eq+gold+hybrid+debt;eq=Math.round(eq*100/t);gold=Math.round(gold*100/t);hybrid=Math.round(hybrid*100/t);debt=100-eq-gold-hybrid;
  return{equity:eq,hybrid,gold,debt};}
function blendedReturn(t){return(t.equity*12+t.hybrid*9+t.gold*6.5+t.debt*6.5)/10000;}
const SMCAP={conservative:12,moderate:20,balanced:27,growth:33};

/* ---------- verdicts (educational observations, not advice) ----------
   ranks: 2 = ok (On track), 1 = watch, 0 = review */
const VLAB_EN={ok:'On track',watch:'Watch',review:'Review'};
const VLAB_HI={ok:'ठीक है',watch:'नज़र रखें',review:'समीक्षा करें'};
const VLAB=new Proxy({},{get:(_,k)=>((LS.g('lang','en')==='hi'?VLAB_HI:VLAB_EN)[k])});
const VKEY={2:'ok',1:'watch',0:'review'};
function verdicts(holds,total,p){
  const t=targets(p),band=bandOf(p);
  const metal=holds.filter(h=>h.grp==='Metal').reduce((a,b)=>a+b.cur,0);
  const metalOver=metal/total*100>t.gold+3;
  const golds=holds.filter(h=>h.grp==='Metal'&&h.cat!=='Silver').sort((a,b)=>b.cur-a.cur);
  const keepGold=golds[0]?golds[0].key:null;
  const byCat={};holds.forEach(h=>{if(h.grp==='Equity')(byCat[h.cat]=byCat[h.cat]||[]).push(h);});
  Object.values(byCat).forEach(a=>a.sort((x,y)=>y.cur-x.cur));
  const soft=ctxStale()?' (market note may be dated)':'';
  return holds.map(h=>{let rk=2,r='Fits your target mix — nothing stands out.';const w=h.cur/total*100;
    if(h.grp==='Metal'&&h.cat==='Silver'&&metalOver){rk=0;r=`Metals are above your ~${t.gold}% target and silver is ${CTX.silver}${soft}. This is the piece most reviewers would look at first — worth discussing with your adviser.`;}
    else if(h.grp==='Metal'&&metalOver&&h.key!==keepGold){rk=1;r=`Gold ${CTX.gold}${soft} and metals sit above target. Many investors hold just one gold fund — consider whether you need this one too.`;}
    else if(h.grp==='Metal'){rk=2;r=`Gold ${CTX.gold}${soft}; a single hedge around ~${t.gold}% is a common approach.`;}
    else if(h.cat==='Thematic'&&(band==='conservative'||band==='moderate')){rk=0;r=`Sector/theme funds are ${CTX.psu}${soft} and swing hard — that sits uneasily with your ${BANDS[band].toLowerCase()} profile. Worth a conversation before adding more.`;}
    else if(h.grp==='Equity'&&byCat[h.cat].length>1&&byCat[h.cat][0].key!==h.key){rk=1;r=`You hold more than one ${h.cat} fund — they largely overlap. Many investors consolidate into the bigger one.`;}
    else if(w<2.5){rk=1;r='Under 2.5% of the portfolio — too small to affect your results either way. Merging it simplifies tracking.';}
    else if(h.cat==='Small Cap'){rk=2;r=`Small-cap ${CTX.smallcap}${soft}; fine to hold, best kept a modest slice.`;}
    else if(h.cat==='Mid Cap'){rk=2;r=`Mid-cap ${CTX.midcap}${soft}; a quality holding at a sensible size.`;}
    else if(h.grp==='Hybrid'){rk=2;r=`Hybrid is ${CTX.hybrid} — this is your steadiness anchor.`;}
    /* News nudge — capped: can move one notch, and NEVER pushes a fund into
       "Review" on its own (rules engine only decides that). */
    let news='';const sig=signalFor(h);
    if(sig&&sig.bias){let nr=sig.bias>0?Math.min(2,rk+1):(rk===2?1:rk);
      if(nr!==rk){rk=nr;news=`📡 News (${sig.bias>0?'positive':'negative'}): ${esc(sig.note)}`;}}
    const v=VKEY[rk];
    return Object.assign({},h,{rank:rk,verdict:v,vlabel:VLAB[v],why:r,news});});}

/* ---------- NAV sources ---------- */
function lagDays(d){if(!d)return 99;
  let dt=null,m;
  if(m=String(d).match(/^(\d{1,2})-(\d{2})-(\d{4})$/))dt=new Date(+m[3],+m[2]-1,+m[1]);
  else if(m=String(d).match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)){
    const mo={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11}[m[2].toLowerCase()];
    if(mo!=null)dt=new Date(+m[3],mo,+m[1]);}
  if(!dt||isNaN(dt))return 99;
  return Math.floor((Date.now()-dt)/864e5);}
const PROXIES=[u=>'https://api.allorigins.win/raw?url='+encodeURIComponent(u),
               u=>'https://corsproxy.io/?url='+encodeURIComponent(u)];
let _amfiP=null;
function fetchAmfiMap(){ // AMFI NAVAll fallback (one download, cached for the session)
  if(_amfiP)return _amfiP;
  _amfiP=(async()=>{
    for(const px of PROXIES){try{
      const r=await fetch(px('https://www.amfiindia.com/spages/NAVAll.txt'),{cache:'no-store'});
      const txt=await r.text();const map={};
      txt.split('\n').forEach(l=>{const p=l.split(';');
        if(p.length>=6&&/^\d+$/.test(p[0].trim())){const nav=parseFloat(p[4]);
          if(nav>0)map[p[0].trim()]={nav,date:p[5].trim()};}});
      if(Object.keys(map).length>1000)return map;
    }catch(e){}}
    throw new Error('amfi unavailable');})();
  _amfiP.catch(()=>{_amfiP=null;});
  return _amfiP;}
async function getNav(code){
  if(!code)return null;
  for(const mk of NAV_SRCS){try{const r=await fetch(mk(code),{cache:'no-store'});const j=await r.json();
    const d=j.data&&j.data[0];if(d&&parseFloat(d.nav)>0){
      const p=j.data[1]; // previous trading day, when the full-history endpoint answered
      return{nav:parseFloat(d.nav),date:d.date,prev:p&&parseFloat(p.nav)>0?parseFloat(p.nav):0};}}catch(e){}}
  try{const map=await fetchAmfiMap();if(map[code])return map[code];}catch(e){}
  return null;}
/* Full NAV history for one scheme (used for benchmark comparison). */
async function getNavHistory(code){
  try{const r=await fetch(`https://api.mfapi.in/mf/${code}`,{cache:'no-store'});const j=await r.json();
    return Array.isArray(j.data)?j.data:null;}catch(e){return null;}}
/* Plan-aware AMFI matching with fuzzy name scoring.
   Handles statement short-forms: "FoF" vs "Fund of Fund", "&" vs "and",
   and renamed schemes (e.g. "Nippon India Growth Mid Cap Fund" vs AMFI's
   "Nippon India Growth Fund") via token-set similarity, not substring luck. */
function normFund(s){return String(s).toLowerCase()
  .replace(/([a-z])(etf|fof)\b/g,'$1 $2') // OCR glue: "goldetf fof" -> "gold etf fof"
  .replace(/\bfof\b/g,'fund of fund')
  .replace(/&/g,' and ')
  .replace(/[-–—()]/g,' ')
  .replace(/[^a-z0-9 ]/g,' ')
  .replace(/\s+/g,' ').trim();}
const FUND_STOP=new Set(['plan','growth','gr','regular','direct','option','scheme','the','an']);
function fundTokens(s){return new Set(normFund(s).split(' ').filter(w=>w&&!FUND_STOP.has(w)));}
function fundSim(a,b){const A=fundTokens(a),B=fundTokens(b);
  if(!A.size||!B.size)return 0;
  let inter=0;A.forEach(w=>{if(B.has(w))inter++;});
  let s=inter/(A.size+B.size-inter);
  if(inter===A.size||inter===B.size)s+=0.15; // one name contained in the other
  return s;}
let _amfiNamesP=null;
function fetchAmfiNames(){ // official AMFI scheme list (name+code), for last-resort matching
  if(_amfiNamesP)return _amfiNamesP;
  _amfiNamesP=(async()=>{
    for(const px of PROXIES){try{
      const r=await fetch(px('https://www.amfiindia.com/spages/NAVAll.txt'),{cache:'no-store'});
      const txt=await r.text();const list=[];
      txt.split('\n').forEach(l=>{const p=l.split(';');
        if(p.length>=6&&/^\d+$/.test(p[0].trim()))list.push({code:p[0].trim(),name:p[3].trim()});});
      if(list.length>1000)return list;
    }catch(e){}}
    throw new Error('amfi unavailable');})();
  _amfiNamesP.catch(()=>{_amfiNamesP=null;});
  return _amfiNamesP;}
async function matchCandidates(name){
  const plan=(LS.g('profile',{}).plan)||'regular';
  const nn=normFund(name),words=nn.split(' ');
  const queries=[...new Set([name,nn,words.slice(0,5).join(' '),words.slice(0,4).join(' '),words.slice(0,3).join(' '),words.slice(0,2).join(' ')])].filter(q=>q&&q.length>=6);
  const all={}; // code -> best-scored candidate (mfapi can hold duplicate codes per scheme)
  const consider=(schemeName,schemeCode)=>{
    if(!schemeName||!/growth/i.test(schemeName)||/idcw|dividend|bonus|segregated/i.test(schemeName))return;
    let s=fundSim(name,schemeName);
    const isDirect=/direct/i.test(schemeName);
    if(plan==='mixed'&&!isDirect)s+=0.02; // when unsure, lean Regular (distributor statements)
    const k=String(schemeCode);
    if(!all[k]||s>all[k].s)all[k]={s,code:k,official:schemeName,isDirect};};
  for(const q of queries){
    try{const r=await fetch(SEARCH(q));const arr=await r.json();
      if(Array.isArray(arr))arr.forEach(x=>consider(x.schemeName,x.schemeCode));}catch(e){}
    const b=Object.values(all).sort((x,y)=>y.s-x.s)[0];
    if(b&&b.s>=0.75)break;}
  let list=Object.values(all).filter(c=>c.s>=0.45);
  if(!list.length){ // last resort: score against the full official AMFI list
    try{(await fetchAmfiNames()).forEach(x=>consider(x.name,x.code));
      list=Object.values(all).filter(c=>c.s>=0.45);}catch(e){}}
  const conform=list.filter(c=>plan==='direct'?c.isDirect:(plan==='regular'?!c.isDirect:true));
  return (conform.length?conform:list).sort((x,y)=>y.s-x.s).slice(0,5);}

/* ---------- navigation & consent ---------- */
function show(id){['welcome','setup','review','dash'].forEach(s=>{const el=$(s);if(el)el.classList.add('hide');});
  $(id).classList.remove('hide');
  $('bar').classList.toggle('hide',id!=='dash');
  const hh=LS.g('holdings',[]).length>0;
  $('backSetup').classList.toggle('hide',!(id==='setup'&&hh));
  $('backReview').classList.toggle('hide',!(id==='review'&&hh));
  window.scrollTo(0,0);}
function backDash(){if(LS.g('holdings',[]).length)refresh();}
function busy(on,t,sub){$('busy').style.display=on?'flex':'none';if(t)$('busytxt').textContent=t;$('busysub').textContent=sub||'';}
function acceptConsent(){LS.s('consent',{t:Date.now(),ver:APP_VERSION});
  const holds=LS.g('holdings',[]);if(holds.length)refresh();else{loadProfileForm();show('setup');}}

/* ---------- OCR + parse ---------- */
function ensureTesseract(){return new Promise((res,rej)=>{if(window.Tesseract)return res();
  const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  s.onload=()=>res();s.onerror=()=>rej(new Error('Could not load the OCR engine — check your connection.'));document.head.appendChild(s);});}
async function onBuild(){
  if(!ensureProfile(true))return;
  const files=$('shots').files;
  if(!files.length){alert('Add at least one screenshot first (or use Import CAS / Enter manually).');return;}
  busy(true,'Loading reader…','First scan loads the OCR engine (one-time).');
  try{await ensureTesseract();}catch(e){busy(false);alert(e.message);return;}
  busy(true,'Reading screenshots…','Runs on your phone — can take a moment.');
  /* PSM 6 (single uniform block) keeps each visual row together left-to-right.
     Default page segmentation splits the holdings cards into COLUMN blocks,
     dumping every Gain/Loss and return % detached at the end of the text — the
     parser then never sees them next to the fund name and rows fail to parse. */
  let text='';_lowConf=[];
  try{
    const worker=await Tesseract.createWorker('eng');
    await worker.setParameters({tessedit_pageseg_mode:'6'});
    for(let i=0;i<files.length;i++){$('busysub').textContent=`Image ${i+1} of ${files.length}…`;
      let src=files[i];try{src=await prepImage(files[i]);}catch(e){}
      try{const r=await worker.recognize(src);
        text+='\n@@IMG '+(i+1)+'@@\n'+r.data.text;
        (r.data.lines||[]).forEach(l=>{const t=(l.text||'').trim();
          if(l.confidence<70&&t.length>5&&/\d/.test(t))_lowConf.push(t);});
      }catch(e){}}
    await worker.terminate();
  }catch(e){ // fallback: old path with default segmentation
    for(let i=0;i<files.length;i++){$('busysub').textContent=`Image ${i+1} of ${files.length}…`;
      try{const r=await Tesseract.recognize(files[i],'eng');text+='\n@@IMG '+(i+1)+'@@\n'+r.data.text;}catch(e2){}}}
  busy(false);
  try{LS.s('lastOCR',text.slice(0,60000));}catch(e){} // debug: raw scan text
  startReview(parsePortfolio(text));}
let _lowConf=[];
/* Upscale to ~2200px wide + grayscale before OCR — phone screenshots at native
   width are often too small for Tesseract to read digits reliably. */
function prepImage(file){return new Promise((res,rej)=>{const img=new Image();
  img.onload=()=>{try{
    const sc=Math.max(1,Math.min(3,2200/img.width));
    const c=document.createElement('canvas');c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
    const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
    x.drawImage(img,0,0,c.width,c.height);
    const d=x.getImageData(0,0,c.width,c.height),p=d.data;
    for(let i=0;i<p.length;i+=4){const g=0.299*p[i]+0.587*p[i+1]+0.114*p[i+2];p[i]=p[i+1]=p[i+2]=g;}
    x.putImageData(d,0,0);URL.revokeObjectURL(img.src);res(c);
  }catch(e){rej(e);}};
  img.onerror=()=>rej(new Error('img'));img.src=URL.createObjectURL(file);});}
function strip1(x){ // drop a spurious leading digit (OCR reads ₹ as 3/7): 326048.62 -> 26048.62
  if(!x||x<=0)return 0;const s=x.toFixed(2),d=s.indexOf('.'),ip=s.slice(0,d);
  if(ip.length<=1)return 0;return parseFloat(ip.slice(1)+s.slice(d));}
/* Statement summary totals (the "Inv. Amt / Current Value" card on the report).
   Those totals are printed WITHOUT decimals, while every fund amount has .xx —
   so comma-grouped integers are a reliable signature of the summary card. */
let _stmtTot=null;
function parseStmtTotals(text){
  const ints=[...text.matchAll(/(?:^|[^.\d])(\d{1,2}(?:,\d{2,3})+)(?![\d,.])/g)]
    .map(m=>parseFloat(m[1].replace(/,/g,''))).filter(n=>n>=1000);
  if(ints.length>=2&&ints[1]/ints[0]>0.5&&ints[1]/ints[0]<2)return{inv:ints[0],cur:ints[1]};
  return null;}
/* If row sums drift from the statement totals, greedily undo "₹ read as 3/7"
   leading-digit errors on whichever rows bring the sums back in line.
   IMPORTANT: only rewrite rows that are NOT already self-confirmed (flag set).
   A row whose own gain and return% reproduce its Current value is trustworthy —
   forcing it to match a mis-OCR'd summary total (e.g. ₹6,31,369) would corrupt
   a correct invested amount. When every row is self-consistent, the summary is
   the suspect, so we leave the rows untouched. */
function reconcileTotals(rows,tot){
  if(!tot||!rows.length)return;
  [['inv',tot.inv],['cur',tot.cur]].forEach(([fld,target])=>{
    if(!target)return;
    const tolr=Math.max(10,target*0.002);
    let sum=rows.reduce((a,r)=>a+(r[fld]||0),0),guard=0;
    if(target&&sum>0&&Math.abs(sum-target)/target>0.15)return; // summary itself is likely mis-OCR'd — don't bend rows toward it
    while(Math.abs(sum-target)>tolr&&guard++<=rows.length){
      let bestR=null,bestV=0,bestGain=1;
      rows.forEach(r=>{if(!r.flag)return;const s=strip1(r[fld]);if(s>0){const ns=sum-r[fld]+s;
        const gain=Math.abs(sum-target)-Math.abs(ns-target);
        if(gain>bestGain){bestGain=gain;bestR=r;bestV=s;}}});
      if(!bestR)break;
      sum=sum-bestR[fld]+bestV;bestR[fld]=bestV;bestR.flag=true;}});}
function parsePortfolio(text){
  _stmtTot=parseStmtTotals(text);
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);const out=[];
  const imgOf=[];let curImg=0; // which screenshot each line came from
  lines.forEach((l,ix)=>{const m=l.match(/^@@IMG (\d+)@@$/);if(m)curImg=+m[1];imgOf[ix]=curImg;});
  const isName=l=>/[A-Za-z]{4,}/.test(l)&&/(fund|etf|flexi|index|nifty|psu|multi[- ]?asset|bond|gilt|debt)/i.test(l)&&!/^(inv\.|inv\s+amt|cur\.|bal\s*units|abs\.|unr\.|as on|scheme|investor|net asset|folio|isin|registrar|nominee|total|@@img)/i.test(l);
  for(let i=0;i<lines.length;i++){if(!isName(lines[i]))continue;
    let name=lines[i]
      .replace(/\s*[-–—]\s*(regular|direct)?\s*(plan)?\s*(gr(owth)?)\b.*$/i,'')
      .replace(/\s*[-–—]\s*(idcw|dividend|payout|reinvest).*$/i,'')
      .replace(/[↗➔→»➜↑]+/g,'').replace(/^[^A-Za-z]+/,'')
      .replace(/([a-z])(ETF|FoF)\b/g,'$1 $2') // un-glue "GoldETF FoF"
      .replace(/\s{2,}/g,' ').trim();
    if(name.length<6)continue;
    let end=Math.min(lines.length,i+9);
    for(let j=i+1;j<end;j++){if(isName(lines[j])){end=j;break;}}
    const blk0=lines.slice(i,end).join(' ');
    // Return %s from the card ("Abs. / Ann Ret.") — a second identity to verify amounts.
    // OCR often loses minus signs, so magnitudes are used and BOTH signs are tried everywhere.
    const pcts=(blk0.match(/-?\d[\d,]*\.\d{1,2}\s*%/g)||[]).map(s=>Math.abs(parseFloat(s.replace(/[,\s%]/g,'')))).filter(p=>p>0&&p<300);
    const blk=blk0.replace(/-?\d[\d,]*\.\d+\s*%/g,' ');
    const signed=(blk.match(/-?\d[\d,]*\.\d{2}(?!\d)/g)||[]).map(s=>parseFloat(s.replace(/,/g,'')));
    const pos=signed.filter(x=>x>0);
    const units=(blk.match(/\d[\d,]*\.\d{3}(?!\d)/g)||[]).map(s=>parseFloat(s.replace(/,/g,'')));
    const nav4=(blk.match(/\d[\d,]*\.\d{4}(?!\d)/g)||[]).map(s=>parseFloat(s.replace(/,/g,'')));
    const uniq=a=>[...new Set(a.filter(v=>v>0))];
    const invC=uniq([pos[0],strip1(pos[0]),pos[1],strip1(pos[1]),pos[2]]);
    const curC=uniq([pos[1],strip1(pos[1]),pos[0],strip1(pos[0]),pos[2]]);
    // Gains also suffer the ₹→3/7 merge (e.g. "3280.26" = ₹280.26) — try stripped variants too.
    const gains=uniq(signed.map(x=>Math.abs(x)).flatMap(x=>[x,strip1(x)]));
    const cc=(units[0]&&nav4[0])?Math.round(units[0]*nav4[0]*100)/100:0;   // Units × NAV = reliable Current
    const tol=cv=>Math.max(2,cv*0.004);
    const gOK=(iv,cv)=>gains.some(g=>Math.abs(iv+g-cv)<2||Math.abs(iv-g-cv)<2);          // Inv ± Gain = Cur
    const pOK=(iv,cv)=>pcts.some(p=>Math.abs(iv*(1+p/100)-cv)<tol(cv)||Math.abs(iv*(1-p/100)-cv)<tol(cv)); // Inv × (1 ± ret%) = Cur
    let cur=0,curFixed=false;
    if(cc>0){const m=curC.find(v=>Math.abs(v-cc)/cc<0.02);cur=(m!=null)?m:cc;curFixed=true;}
    let inv=0,fixed=false;
    // Score every candidate pair; accept only when at least one identity confirms it.
    let best={s:1,iv:0,cv:0};
    const curs=curFixed?[cur]:curC;
    for(const cv of curs)for(const iv of invC){
      let s=0;if(gOK(iv,cv))s+=2;if(pOK(iv,cv))s+=2;
      const ratio=iv>0?cv/iv:0;if(ratio>0.2&&ratio<5)s+=0.5;
      if(s>best.s)best={s,iv,cv};}
    if(best.s>=2){inv=best.iv;cur=best.cv;fixed=true;}
    if(!fixed&&curFixed){ // derive Invested = Cur ∓ Gain, corroborated by the return %
      outer:for(const g of gains)for(const sg of [1,-1]){const iv=Math.round((cur-sg*g)*100)/100;
        if(iv>0&&pOK(iv,cur)){inv=iv;fixed=true;break outer;}}}
    if(!fixed){inv=pos[0]||0;cur=(curFixed&&cur>0)?cur:(pos[1]||0);} // unconfirmed — keep raw and FLAG
    if(inv>0&&inv===cur&&gains.some(g=>g>2&&Math.abs(g-inv)>2))fixed=false; // Inv==Cur but a gain exists — suspicious
    /* Narrow rescue (does NOT override a legible Invested): only when the parsed
       Invested looks like the Current value with a dropped leading digit
       (strip1(Cur)) — the specific OCR failure seen on HDFC Gold ETF FoF
       (₹205.97 vs ₹3,999.80) — recover it from Cur and the printed Abs return %.
       Guarded so it can never touch a row whose Invested already checks out. */
    if(curFixed&&cur>0&&pcts.length&&inv>0&&Math.abs(inv-strip1(cur))<1&&!gOK(inv,cur)&&!pOK(inv,cur)){
      const p=pcts[0]; // Abs return is printed before Ann
      const iv=Math.round(cur/(1+p/100)*100)/100;
      if(iv>0&&cur/iv>0.2&&cur/iv<5){inv=iv;fixed=false;}}
    // Buy year: only from a date-shaped token (e.g. 12-Mar-2023 / 12/03/2023), as in CAS transaction rows.
    const ym=blk0.match(/\b\d{1,2}[-\/]([A-Za-z]{3}|\d{1,2})[-\/](20\d{2})\b/);
    /* Low OCR confidence: only relevant when the numbers DON'T cross-check.
       A row whose Inv + Gain = Cur (or Inv × ret% = Cur) is arithmetically
       confirmed — that beats the engine's own confidence score, which runs
       low on many statement fonts and would otherwise flag everything. */
    const lowconf=!fixed&&_lowConf.some(t=>blk0.includes(t));
    out.push({name,inv,cur,units:units[0]||0,nav:nav4[0]||0,flag:!fixed,lowconf,img:imgOf[i]||0,year:ym?+ym[2]:''});}
  const map={};
  // Dedup overlapping screenshots: prefer the cleanly cross-checked copy of a fund
  // (screenshot edges often cut a card in half, mangling one copy's numbers).
  out.forEach(o=>{const k=o.name.toLowerCase().replace(/[^a-z]/g,'').slice(0,30);
    const ex=map[k];
    if(!ex||(ex.flag&&!o.flag)||(ex.flag===o.flag&&o.inv>ex.inv))map[k]=o;});
  const rows=Object.values(map);
  reconcileTotals(rows,_stmtTot);
  return rows;}

/* ---------- CAS PDF import (beta) ---------- */
function ensurePdfjs(){return new Promise((res,rej)=>{if(window.pdfjsLib)return res();
  const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';res();};
  s.onerror=()=>rej(new Error('Could not load the PDF engine — check your connection.'));document.head.appendChild(s);});}
async function importCAS(file){
  if(!ensureProfile(true))return;
  busy(true,'Loading PDF engine…','');
  try{await ensurePdfjs();}catch(e){busy(false);alert(e.message);return;}
  const buf=await file.arrayBuffer();
  let pdf=null,pwd='';
  for(let attempt=0;attempt<3;attempt++){
    try{pdf=await window.pdfjsLib.getDocument({data:buf.slice(0),password:pwd}).promise;break;}
    catch(err){
      if(err&&err.name==='PasswordException'){
        pwd=prompt('This CAS PDF is password-protected (usually your PAN in capitals). Enter password:')||'';
        if(!pwd){busy(false);return;}
      }else{busy(false);alert('Could not open this PDF.');return;}}}
  if(!pdf){busy(false);alert('Could not open this PDF (wrong password?).');return;}
  busy(true,'Reading CAS…','Extracting fund rows.');
  let text='';
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);const tc=await page.getTextContent();
    const rows={};
    tc.items.forEach(it=>{const y=Math.round(it.transform[5]/2)*2;(rows[y]=rows[y]||[]).push(it);});
    const ys=Object.keys(rows).map(Number).sort((a,b)=>b-a);
    ys.forEach(y=>{text+='\n'+rows[y].sort((a,b)=>a.transform[4]-b.transform[4]).map(it=>it.str).join(' ');});}
  busy(false);
  const parsed=parsePortfolio(text);
  if(!parsed.length){alert('Could not read fund rows from this CAS (beta). Try screenshots or manual entry — and please report the CAS format so it can be supported.');return;}
  startReview(parsed);}
function manualEntry(){if(!ensureProfile(true))return;_stmtTot=null;startReview([]);}

/* ---------- review ---------- */
function startReview(parsed){
  editRows=(parsed&&parsed.length)?parsed.map(r=>({name:r.name,inv:r.inv||0,cur:r.cur||0,units:r.units||0,nav:r.nav||0,year:r.year||'',flag:!!r.flag,img:r.img||0,lowconf:!!r.lowconf})):[{name:'',inv:0,cur:0,units:0,nav:0,year:'',flag:true}];
  renderEdit();
  const nf=editRows.filter(r=>r.flag).length;
  $('dedupNote').innerHTML=((parsed&&parsed.length)?'<i>✓ deduped</i> ':'')+
    (LS.g('lastOCR','')?'<a href="#" style="font-size:11px" onclick="navigator.clipboard.writeText(LS.g(\'lastOCR\',\'\')).then(()=>alert(\'Raw scan text copied — paste it to the developer to improve reading.\'));return false">copy scan text</a>':'');
  const L=(en,hi)=>LS.g('lang','en')==='hi'?hi:en;
  $('reviewTitle').textContent=(parsed&&parsed.length)?L(`Found ${parsed.length} funds — please verify`,`${parsed.length} फंड मिले — कृपया जाँचें`):L('Enter your funds','अपने फंड भरें');
  $('matchStatus').innerHTML=nf&&parsed&&parsed.length?`<span style="color:var(--amber)">${L(`⚠ ${nf} row(s) could not be cross-checked (Invested + Gain ≠ Current) — compare the highlighted ones against your statement.`,`⚠ ${nf} पंक्ति(याँ) क्रॉस-चेक नहीं हो सकीं — हाइलाइट की गई राशियाँ अपने स्टेटमेंट से मिलाएँ।`)}</span>`:'';
  show('review');}
function addEditRow(){editRows.push({name:'',inv:0,cur:0,units:0,nav:0,year:'',flag:false});renderEdit();}
/* Per-row rescan: user crops/screenshots the single fund card and re-reads only that row. */
let _rescanIdx=-1;
function rescanRow(i){_rescanIdx=i;const f=$('rescanFile');if(f)f.click();}
async function doRescan(file){
  if(_rescanIdx<0||!file)return;
  busy(true,'Re-reading this fund…','');
  try{await ensureTesseract();
    const worker=await Tesseract.createWorker('eng');
    await worker.setParameters({tessedit_pageseg_mode:'6'});
    let src=file;try{src=await prepImage(file);}catch(e){}
    const r=await worker.recognize(src);await worker.terminate();
    const keepTot=_stmtTot; // parsePortfolio would overwrite the statement summary
    const rows=parsePortfolio('\n@@IMG 1@@\n'+r.data.text);
    _stmtTot=keepTot;
    busy(false);
    if(!rows.length){alert('Could not read a fund from that image — crop tighter around one fund card and try again.');return;}
    const p=rows[0],t=editRows[_rescanIdx];
    t.name=p.name||t.name;t.inv=p.inv||t.inv;t.cur=p.cur||t.cur;
    t.units=p.units||t.units;t.nav=p.nav||t.nav;t.year=p.year||t.year;t.flag=!!p.flag;t.lowconf=!!p.lowconf;
    renderEdit();
  }catch(e){busy(false);alert('Rescan failed — try again.');}
  _rescanIdx=-1;}
function updateEditTotals(){
  const ti=editRows.reduce((a,r)=>a+(r.inv||0),0),tc=editRows.reduce((a,r)=>a+(r.cur||0),0);
  const el=$('editTotals');if(!el)return;
  if(!(ti>0||tc>0)){el.classList.add('hide');return;}
  el.classList.remove('hide');
  let extra=' Check these against the total on your statement.';
  if(_stmtTot){
    const okI=Math.abs(ti-_stmtTot.inv)<=Math.max(10,_stmtTot.inv*0.002);
    const okC=Math.abs(tc-_stmtTot.cur)<=Math.max(10,_stmtTot.cur*0.002);
    extra=(okI&&okC)
      ?` <span style="color:var(--green)">✓ Matches the summary totals read from your statement (${inr(_stmtTot.inv)} / ${inr(_stmtTot.cur)}).</span>`
      :` <span style="color:var(--amber)">⚠ Your statement's summary says invested ${inr(_stmtTot.inv)} / current ${inr(_stmtTot.cur)} — the rows don't add up to that yet. Fix the highlighted amounts before building.</span>`;}
  el.innerHTML=`Totals so far — invested <b>${inr(ti)}</b>, current <b>${inr(tc)}</b>.${extra}`;}
function renderEdit(){
  $('editList').innerHTML=editRows.map((r,i)=>{
    const bad=r.flag;const bord=bad?'border:1.5px solid var(--amber)':'border:1px solid var(--line)';
    return `<div style="margin-bottom:12px;border-bottom:1px solid var(--line);padding-bottom:9px">
    ${bad?`<div style="font-size:11px;color:var(--amber);margin-bottom:4px">⚠ check the amounts below against your statement${r.lowconf?' (the reader was unsure about this one)':''}</div>`:''}
    ${(r.img||bad)?`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span class="small" style="font-size:10.5px">${r.img?'from screenshot '+r.img:''}</span>
      <a href="#" class="small" style="font-size:10.5px" onclick="rescanRow(${i});return false">📷 rescan this fund</a></div>`:''}
    <input value="${esc(r.name)}" placeholder="Fund name" aria-label="Fund name" oninput="editRows[${i}].name=this.value">
    <div class="editrow" style="margin-top:7px">
      <input type="number" inputmode="numeric" value="${r.inv||''}" placeholder="Invested ₹" aria-label="Invested amount" style="${bord}" oninput="editRows[${i}].inv=parseFloat(this.value)||0;editRows[${i}].flag=false;this.style.border='1px solid var(--line)';updateEditTotals()">
      <input type="number" inputmode="numeric" value="${r.cur||''}" placeholder="Current ₹" aria-label="Current value" style="${bord}" oninput="editRows[${i}].cur=parseFloat(this.value)||0;editRows[${i}].flag=false;this.style.border='1px solid var(--line)';updateEditTotals()">
      <button class="btn-sec" style="padding:9px 0" aria-label="Remove fund" onclick="editRows.splice(${i},1);renderEdit()">✕</button>
    </div>
    <div class="editrow" style="grid-template-columns:1fr 1fr 34px">
      <input type="number" inputmode="decimal" step="any" value="${r.units||''}" placeholder="Units (optional)" aria-label="Units, optional" oninput="editRows[${i}].units=parseFloat(this.value)||0">
      <input type="number" inputmode="numeric" value="${r.year||''}" placeholder="Buy year (optional)" aria-label="Buy year, optional" oninput="editRows[${i}].year=parseInt(this.value)||''">
      <span></span>
    </div></div>`;}).join('');
  updateEditTotals();}
async function saveHoldings(){
  const rows=editRows.filter(r=>r.name&&r.name.trim().length>3&&(r.cur>0||r.inv>0));
  if(!rows.length){alert('Add at least one fund with a name and a current value.');return;}
  /* Gate: refuse to silently build on numbers that contradict the statement summary. */
  if(_stmtTot){
    const si=rows.reduce((a,r)=>a+(r.inv||0),0),sc=rows.reduce((a,r)=>a+(r.cur||0),0);
    const bad=(v,t)=>t>0&&Math.abs(v-t)/t>0.005;
    if(bad(si,_stmtTot.inv)||bad(sc,_stmtTot.cur)){
      if(!confirm(`CHECK FIRST — your rows add to ${inr(si)} invested / ${inr(sc)} current, but the statement summary reads ${inr(_stmtTot.inv)} / ${inr(_stmtTot.cur)}.\n\nIf you build now, every figure on the dashboard will inherit this error. Fix the highlighted rows instead?\n\nTap OK to build anyway, Cancel to go back and fix.`))return;}}
  busy(true,'Matching funds to AMFI…','Finding the official NAV code for each fund.');
  const holds=[],navs=LS.g('navs',{}),dates=LS.g('navDates',{});const missNames=[];
  for(const r of rows){$('busysub').textContent=r.name;
    const [cat,grp]=classify(r.name);
    const inv=r.inv||0,cur=r.cur||0;
    const cands=await matchCandidates(r.name);
    /* Pick the right scheme CODE, not just the right name: mfapi carries stale
       duplicate codes for the same scheme. The statement's own Cur. NAV is a
       fingerprint of the correct series — prefer candidates whose live NAV is
       within 6% of it, and prefer fresh NAV series over stale ones. */
    const fetched=[];
    for(const c of cands){const x=await getNav(c.code);if(x)fetched.push([c,x]);}
    const navOK=x=>!(r.nav>0)||Math.abs(x.nav-r.nav)/r.nav<=0.06;
    const freshOK=x=>lagDays(x.date)<=15;
    const picked=fetched.find(([c,x])=>navOK(x)&&freshOK(x))
              ||fetched.find(([c,x])=>navOK(x))
              ||fetched.find(([c,x])=>freshOK(x))
              ||fetched[0]||null;
    let code=null,official=null,nav=0,navVerified=false;
    if(picked){const c=picked[0],x=picked[1];
      code=c.code;official=c.official;nav=x.nav;
      navs[code]=x.nav;dates[code]=x.date;
      /* Live NAV is TRUSTED only when it can be verified against the statement:
         match its printed NAV, or reproduce its Current value from its units.
         Unverified funds display statement values instead of live maths. */
      navVerified = r.nav>0 ? Math.abs(x.nav-r.nav)/r.nav<=0.04
        : (r.units>0&&cur>0 ? Math.abs(r.units*x.nav-cur)/cur<=0.04
        : (c.s>=0.85&&freshOK(x)));}
    else missNames.push(r.name);
    /* Units: prefer what the user/statement gave us (exact). Otherwise derive
       from current value ÷ latest NAV — an approximation, flagged as such. */
    let units=0,unitsApprox=false;
    if(r.units>0)units=r.units;
    else if(nav>0&&(cur||inv)>0){units=(cur||inv)/nav;unitsApprox=true;}
    /* Safety anchor: the dashboard must start at the statement's Current value.
       If units × live NAV strays >5% (wrong units, or a doubtful scheme match),
       re-derive units from the statement value instead. */
    if(units>0&&nav>0&&cur>0&&Math.abs(units*nav-cur)/cur>0.05){units=cur/nav;unitsApprox=true;}
    holds.push({key:(code||'x')+Math.random().toString(36).slice(2,7),name:r.name.trim(),official,code,cat,grp,units,unitsApprox,inv,cur,navStmt:r.nav||0,navVerified,year:r.year||null});}
  LS.s('navs',navs);LS.s('navDates',dates);LS.s('navTs',Date.now());
  busy(false);
  if(!holds.length){alert('Nothing to save. Check the fund names.');return;}
  LS.s('holdings',holds);
  resetGrow();resetCal();
  if(missNames.length)alert('Could not match to AMFI:\n• '+missNames.join('\n• ')+'\n\nThey are kept with the values you entered, but their prices will not update live. Tap 📷 Update, edit the name closer to the official scheme name, and re-save.');
  refresh();}

/* ---------- live refresh ---------- */
async function refresh(force){
  const holds=LS.g('holdings',[]);if(!holds.length){show('setup');return;}
  show('dash');
  const navs=LS.g('navs',{}),dates=LS.g('navDates',{});
  const fresh=(Date.now()-(LS.g('navTs',0))<30*60*1000)&&holds.every(h=>!h.code||navs[h.code]);
  if(!force&&fresh){renderDash(holds,navs,dates,-1);return;}
  $('status').textContent='Refreshing live NAVs…';let live=0;const prevs=LS.g('navPrev',{});
  await Promise.all(holds.filter(h=>h.code).map(async h=>{const x=await getNav(h.code);if(x){navs[h.code]=x.nav;dates[h.code]=x.date;if(x.prev)prevs[h.code]=x.prev;live++;}}));
  LS.s('navs',navs);LS.s('navDates',dates);LS.s('navPrev',prevs);LS.s('navTs',Date.now());
  renderDash(holds,navs,dates,live);}

function migrateProfile(){const p=LS.g('profile',null);if(!p)return null;
  if(!p.band&&p.risk){p.band=bandOf(p);p.plan=p.plan||'regular';LS.s('profile',p);}
  return p;}
function renderDash(holds,navs,dates,live){
  const p=migrateProfile()||{age:36,horizon:'5-7',band:'moderate',plan:'regular'};
  /* Migrate holdings saved by older builds: decide navVerified by whether the
     live NAV can reproduce the statement's Current value from the units. */
  let dirty=false;
  holds.forEach(h=>{if(h.navVerified===undefined){
    const nav=h.code?(navs[h.code]||0):0;
    h.navVerified=(nav>0&&h.units>0&&h.cur>0)?(Math.abs(h.units*nav-h.cur)/h.cur<=0.05):false;
    dirty=true;}});
  if(dirty)LS.s('holdings',holds);
  let ti=0,tc=0;
  /* Statement values are ground truth. Live NAV maths applies ONLY to verified funds. */
  const prevs=LS.g('navPrev',{});
  let rows=holds.map(h=>{const nav=h.code?(navs[h.code]||0):0;
    const isLive=!!(h.navVerified&&nav>0&&h.units>0);
    const cur=isLive?h.units*nav:(h.cur||0);
    const pv=h.code?(prevs[h.code]||0):0;
    const dayCh=(isLive&&pv>0)?(nav-pv)/pv*100:null; // 1-day NAV change
    ti+=h.inv;tc+=cur;return Object.assign({},h,{nav,cur,isLive,pl:cur-h.inv,date:h.code?dates[h.code]:null,dayCh});});
  rows=verdicts(rows,tc||1,p);
  window._rows=rows;window._tot=tc;window._p=p;
  const pl=tc-ti,metal=rows.filter(r=>r.grp==='Metal').reduce((a,b)=>a+b.cur,0);
  $('kpis').innerHTML=[
    ['Invested',inr(ti),holds.length+' funds',''],['Current value',inr(tc),'live NAVs',''],
    ['Gain / loss',(pl<0?'−':'+')+inr(Math.abs(pl)),(pl/(ti||1)*100).toFixed(1)+'% total (not per-yr)',pl<0?'neg':'pos'],
    ['Gold / silver',(metal/(tc||1)*100).toFixed(0)+'%','target ~'+targets(p).gold+'%',metal/(tc||1)*100>targets(p).gold+3?'neg':'pos']
  ].map(k=>`<div class="kpi"><div class="l">${k[0]}</div><div class="v ${k[3]}">${k[1]}</div><div class="l ${k[3]}">${k[2]}</div></div>`).join('');
  const now=new Date();
  const syncedAt=LS.g('navTs',0);
  const syncTxt=syncedAt?new Date(syncedAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
  const ageMin=syncedAt?Math.floor((Date.now()-syncedAt)/60000):0;
  const ageTxt=ageMin<1?'just now':(ageMin<60?ageMin+' min ago':Math.round(ageMin/60)+' hr ago');
  const nVer=rows.filter(r=>r.isLive).length,nStmt=rows.length-nVer;
  const stmtNote=nStmt>0?` · ${nStmt} fund(s) on statement values`:'';
  $('status').innerHTML = (live<0
    ? `⏱ Synced ${syncTxt} (${ageTxt}, cached) · tap ↻ for live`
    : live>0
      ? `✓ Live · synced ${syncTxt} · ${nVer}/${rows.length} funds`
      : `⚠ Offline · last synced ${syncTxt}`)+stmtNote;
  $('staleCtx').innerHTML=ctxStale()?`<div class="banner warn">⚠ The built-in market commentary is ${ctxAgeDays()} days old (as of ${CTX.asof}) and may be outdated. Treat category notes as historical context, or refresh them via the News-aware signals below.</div>`:'';
  const g=f=>rows.filter(f).reduce((a,b)=>a+b.cur,0);
  const eq=g(r=>r.grp==='Equity'),hy=g(r=>r.grp==='Hybrid'),go=metal,de=g(r=>r.grp==='Debt');
  const segs=[[eq,'#1457d6','Equity'],[hy,'#0f9d58','Hybrid'],[go,'#c77700','Gold/Silver'],[de,'#888780','Debt']].filter(s=>s[0]>0);
  $('allocbar').innerHTML=segs.map(s=>`<span style="width:${s[0]/(tc||1)*100}%;background:${s[1]}"></span>`).join('');
  $('alloclegend').textContent=segs.map(s=>`${s[2]} ${(s[0]/(tc||1)*100).toFixed(0)}%`).join(' · ');
  const t=targets(p);
  $('allocAdvice').innerHTML=`At ${p.age}, ${esc(p.horizon)} yrs, ${BANDS[bandOf(p)].toLowerCase()} profile: a common reference mix is <b>${t.equity}% equity / ${t.hybrid}% hybrid / ${t.gold}% gold / ${t.debt}% debt</b>. You're at ${(eq/(tc||1)*100).toFixed(0)}% equity, ${(go/(tc||1)*100).toFixed(0)}% gold/silver.`+rebalanceNote({equity:eq,hybrid:hy,gold:go,debt:de},t,tc);
  // projection (as a RANGE, not a single promise)
  const yrs=HZYRS[p.horizon]||6,r=blendedReturn(t),rLo=Math.max(0.02,r-0.025),rHi=r+0.025;
  window._hrows=rows.slice().sort((a,b)=>b.cur-a.cur);
  drawHold();
  const ins=computeInsights(rows,p,tc,t);
  $('insights').innerHTML='<div id="benchNote" class="note" style="margin-bottom:8px"></div><ul style="margin:0;padding-left:18px;line-height:1.7;font-size:13px">'+ins.map(x=>`<li style="margin-bottom:6px">${x}</li>`).join('')+'</ul>';
  loadBenchmark(rows); // async, fills #benchNote when done
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
  const valData=hist.map(x=>x.cur).concat(new Array(yrs).fill(null));
  const ptR=hist.map((_,i)=>i===hist.length-1?5:2).concat(new Array(yrs).fill(0));
  const projData=new Array(hist.length-1).fill(null).concat([tc]).concat(Array.from({length:yrs},(_,i)=>Math.round(tc*Math.pow(1+r,i+1))));
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
  const fvLo=tc*Math.pow(1+rLo,yrs),fvMid=tc*Math.pow(1+r,yrs),fvHi=tc*Math.pow(1+rHi,yrs);
  $('projection').innerHTML=`<b>Today ${inr(tc)}</b> → in ${yrs} yrs somewhere around <b>${inr(fvLo)}–${inr(fvHi)}</b> (midpoint ~${inr(fvMid)} at ~${(r*100).toFixed(1)}%/yr, no fresh money). Grey = what you invested (${inr(ti)}); blue = where you are; green = midpoint path. <span style="color:var(--muted)">Markets don't move in straight lines — this is an illustration, not a promise or a target.</span>`;
  if($('growAmt').value)planGrow();
  if($('calAmt').value)planCal();
  show('dash');}

/* Rebalancing illustration: concrete "shift ₹X from over-weight to under-weight"
   pairs vs the reference mix. Educational — exit loads and tax apply to real moves. */
function rebalanceNote(act,t,tc){
  if(!(tc>0))return '';
  const names={equity:'Equity',hybrid:'Hybrid',gold:'Gold/Silver',debt:'Debt'};
  const over=[],under=[];
  Object.keys(names).forEach(k=>{
    const diff=act[k]-tc*t[k]/100; // ₹ above (+) or below (−) target
    if(diff>tc*0.04)over.push({k,amt:diff});
    if(diff<-tc*0.04)under.push({k,amt:-diff});});
  if(!over.length||!under.length)return '';
  over.sort((a,b)=>b.amt-a.amt);under.sort((a,b)=>b.amt-a.amt);
  const moves=[];let oi=0,ui=0;
  while(oi<over.length&&ui<under.length&&moves.length<3){
    const m=Math.min(over[oi].amt,under[ui].amt);
    if(m>tc*0.02)moves.push(`~${inr(Math.round(m/1000)*1000)} from ${names[over[oi].k]} → ${names[under[ui].k]}`);
    if(over[oi].amt<=under[ui].amt){under[ui].amt-=over[oi].amt;oi++;}else{over[oi].amt-=under[ui].amt;ui++;}}
  if(!moves.length)return '';
  return `<div style="margin-top:7px">⚖️ <b>To move toward that mix:</b> ${moves.join('; ')}. <span style="color:var(--muted)">Illustration only — real switches can trigger exit loads and capital-gains tax; new money is often the gentler way to rebalance. Confirm with a registered adviser.</span></div>`;}
/* Portfolio XIRR-style annualised return from buy years (lump-sum approximation,
   each fund assumed bought mid-year). Solved by bisection. */
function portfolioAnnualised(rows){
  const dated=rows.filter(r=>r.year&&r.inv>0&&r.cur>0&&r.year>2000&&r.year<=new Date().getFullYear());
  if(!dated.length)return null;
  const covInv=dated.reduce((a,r)=>a+r.inv,0),totInv=rows.reduce((a,r)=>a+r.inv,0);
  if(covInv<totInv*0.5)return null; // not enough coverage to be meaningful
  const yrsOf=r=>Math.max(0.25,(Date.now()-new Date(r.year,6,1).getTime())/(365.25*864e5));
  const f=rate=>dated.reduce((a,r)=>a+r.inv*Math.pow(1+rate,yrsOf(r)),0)-dated.reduce((a,r)=>a+r.cur,0);
  let lo=-0.9,hi=2;if(f(lo)*f(hi)>0)return null;
  for(let i=0;i<80;i++){const mid=(lo+hi)/2;(f(lo)*f(mid)<=0)?hi=mid:lo=mid;}
  return{rate:(lo+hi)/2,coverPct:covInv/totInv*100};}
/* Benchmark: how a plain Nifty 50 index fund did over roughly the same period. */
async function loadBenchmark(rows){
  const el=$('benchNote');if(!el)return;
  const dated=rows.filter(r=>r.year&&r.year>2000);
  if(!dated.length){el.innerHTML='<span style="color:var(--muted)">Add buy years on the review screen (📷 Update) to compare your returns with a Nifty 50 index fund.</span>';return;}
  const y0=Math.min(...dated.map(r=>r.year));
  try{
    let code=LS.g('benchCode',null);
    if(!code){const r=await fetch(SEARCH('UTI Nifty 50 Index Fund'));const arr=await r.json();
      const c=(arr||[]).find(x=>/uti nifty 50 index/i.test(x.schemeName)&&/growth/i.test(x.schemeName)&&!/idcw|dividend/i.test(x.schemeName));
      if(c){code=String(c.schemeCode);LS.s('benchCode',code);}}
    if(!code)return;
    const hist=await getNavHistory(code);if(!hist||!hist.length)return;
    const latest=parseFloat(hist[0].nav);
    const tgt=new Date(y0,6,1).getTime();
    let past=null; // hist is newest-first, dates dd-mm-yyyy
    for(const d of hist){const m=d.date.match(/(\d{2})-(\d{2})-(\d{4})/);if(!m)continue;
      const ts=new Date(+m[3],+m[2]-1,+m[1]).getTime();
      if(ts<=tgt){past=parseFloat(d.nav);break;}past=parseFloat(d.nav);}
    if(!(past>0&&latest>0))return;
    const yrs=Math.max(0.5,(Date.now()-tgt)/(365.25*864e5));
    const cagr=(Math.pow(latest/past,1/yrs)-1)*100;
    const mine=portfolioAnnualised(rows);
    el.innerHTML=`📏 <b>Benchmark:</b> a plain Nifty 50 index fund returned ≈<b>${cagr.toFixed(1)}%/yr</b> since ${y0}`+
      (mine?` — your portfolio ≈<b>${(mine.rate*100).toFixed(1)}%/yr</b> over the same period (buy-year approximation, ${mine.coverPct.toFixed(0)}% of money covered).`:'.')+
      ` <span style="color:var(--muted)">Different risk levels — context, not a scorecard.</span>`;
  }catch(e){}}
/* Educational observations: the things a careful reviewer checks — concentration,
   fund-house overload, small/mid exposure vs profile, allocation gaps, cost, tax. */
function computeInsights(rows,p,tc,t){
  const ins=[],pct=v=>v/(tc||1)*100,grp=f=>rows.filter(f).reduce((a,b)=>a+b.cur,0),band=bandOf(p);
  const eq=grp(r=>r.grp==='Equity'),metal=grp(r=>r.grp==='Metal'),de=grp(r=>r.grp==='Debt');
  const rv=rows.filter(r=>r.verdict==='review').length,wa=rows.filter(r=>r.verdict==='watch').length;
  if(rv+wa)ins.push(`<b>${rv} fund(s) marked Review, ${wa} marked Watch</b> — see the tags above for the reasons. If you do act on any of them, spreading sells over a few weeks is gentler than one day. Discuss first with a registered adviser.`);
  const sg=getSignals();
  if(sg){const mk=sg.items.market||sg.items.nifty||sg.items.sensex;
    if(mk)ins.push(`<b>Market read (from your news signals):</b> ${esc(mk.note)} — ${mk.bias>0?'a reasonable window to continue SIPs':mk.bias<0?'staggering new money is the patient approach':'no strong directional edge; steady staggering'}.`);
    const tilts=Object.entries(sg.items).filter(([k])=>['smallcap','midcap','largecap','flexi','gold','silver','thematic','global'].includes(k));
    const up=tilts.filter(([,v])=>v.bias>0).map(([k])=>k),dn=tilts.filter(([,v])=>v.bias<0).map(([k])=>k);
    if(up.length||dn.length)ins.push(`<b>News tilt applied:</b> ${up.length?'favourable — '+up.join(', '):''}${up.length&&dn.length?'; ':''}${dn.length?'cautious — '+dn.join(', '):''}. Tags above reflect these (one notch max, never into Review).`);}
  if(pct(metal)>t.gold+5)ins.push(`<b>Gold/silver is ${pct(metal).toFixed(0)}%</b> vs a ~${t.gold}% reference. Most long-term investors keep metals as a small hedge, not a core position.`);
  /* Overlap: several funds in the same category mostly own the same assets. */
  const byCat2={};rows.forEach(r=>{(byCat2[r.cat]=byCat2[r.cat]||[]).push(r);});
  Object.entries(byCat2).filter(([,a])=>a.length>1).forEach(([cat,a])=>{
    const w=pct(a.reduce((x,y)=>x+y.cur,0));
    ins.push(`<b>${a.length} ${esc(cat)} funds = ${w.toFixed(0)}%</b> of the portfolio (${a.map(x=>esc(x.name.split(' ').slice(0,2).join(' '))).join(', ')}) — they largely overlap; one per category is usually enough.`);});
  const ann=portfolioAnnualised(rows);
  if(ann)ins.push(`<b>Your annualised return ≈ ${(ann.rate*100).toFixed(1)}%/yr</b> (from the buy years you provided, covering ${ann.coverPct.toFixed(0)}% of invested money; lump-sum approximation, not exact XIRR).`);
  const sm=grp(r=>r.cat==='Small Cap'||r.cat==='Mid Cap'),cap=SMCAP[band]||22;
  if(pct(sm)>cap)ins.push(`<b>Small + mid cap is ${pct(sm).toFixed(0)}%</b> — on the high side for a ${BANDS[band].toLowerCase()} profile (~${cap}% is a common ceiling). Holding is fine; adding more increases the swings.`);
  if(pct(de)<3&&t.debt>=8)ins.push(`<b>Almost no debt allocation</b> — a short-duration or corporate-bond fund (~${t.debt}%) is how portfolios usually cushion equity falls. Something to ask your adviser about.`);
  if(!rows.some(r=>r.cat==='Global'))ins.push(`<b>No global exposure</b> — a small (~5%) US/global fund adds diversification Indian funds can't. Optional, but worth knowing.`);
  if(!rows.some(r=>/index|nifty|sensex/i.test(r.name)))ins.push(`<b>No low-cost index fund</b> — a Nifty 50 index fund is a cheap, steady core many portfolios are built on. Also: Direct plans of the same schemes cost ~1%/yr less than Regular plans — but switching can trigger tax and exit loads, so ask before acting.`);
  if(rows.length>10)ins.push(`<b>${rows.length} funds is a lot</b> — beyond ~8–9, funds mostly duplicate each other. Consolidating cuts overlap and tracking effort.`);
  const big=rows.slice().sort((a,b)=>b.cur-a.cur)[0];
  if(big&&pct(big.cur)>25)ins.push(`<b>${esc(big.name)} is ${pct(big.cur).toFixed(0)}%</b> of the portfolio — a large single-fund bet. Adding more to it increases concentration.`);
  const byAmc={};rows.forEach(r=>{const a=r.name.split(/\s+/)[0];byAmc[a]=(byAmc[a]||0)+r.cur;});
  const top=Object.entries(byAmc).sort((a,b)=>b[1]-a[1])[0];
  if(top&&pct(top[1])>38)ins.push(`<b>${esc(top[0])} funds are ${pct(top[1]).toFixed(0)}%</b> of your money — spreading across fund houses reduces single-AMC risk.`);
  const losers=rows.filter(r=>r.pl<0).sort((a,b)=>a.pl-b.pl);
  if(losers.length)ins.push(`<b>Tax point to raise with your adviser:</b> funds in loss (e.g. ${esc(losers[0].name)}) can sometimes offset capital-gains tax if sold ("loss harvesting") — rules and exit loads apply, so get it confirmed first.`);
  ins.push(`<b>Discipline:</b> stagger fresh money over a few months, keep 3–6 months of expenses outside this in a liquid fund, and review every 6 months — not daily.`);
  ins.push(`<span style="color:var(--muted)">These notes come from a fixed, transparent rules engine (market context as of ${CTX.asof}${ctxStale()?' — now dated':''}). They are educational observations, not investment advice.</span>`);
  return ins;}

/* ---------- News-aware signals (copy prompt → run in AI → paste back) ---------- */
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
  if(!n){alert('Couldn\'t read any signals. Expected lines like: silver=+1 | strong industrial demand');return;}
  LS.s('signals',{t:Date.now(),items});
  $('sigMsg').innerHTML=`<span style="color:var(--green)">✓ Applied ${n} signal(s). Tags updated (one notch max — news alone never marks a fund "Review").</span>`;
  $('sigPaste').classList.add('hide');$('sigInput').value='';
  refresh();}
function clearSignals(){localStorage.removeItem('signals');$('sigInput').value='';$('sigMsg').textContent='Signals cleared.';refresh();}
function updateSigStatus(){
  const s=getSignals();const el=$('sigStatus');if(!el)return;
  if(!s){el.innerHTML='No news signals applied. Tap <b>Copy news prompt</b>, run it in your AI app, and paste the result back — current news will then nudge the tags (one notch, with guardrails: news alone never marks a fund "Review").';return;}
  const age=Math.floor((Date.now()-s.t)/864e5);
  const arrow=b=>b>0?'<span style="color:var(--green)">↑</span>':(b<0?'<span style="color:var(--red)">↓</span>':'→');
  const list=Object.entries(s.items).map(([k,v])=>`${esc(k)} ${arrow(v.bias)}`).join(' · ');
  el.innerHTML=`<b>News signals active</b> (${age}d old, expire in ${14-age}d): ${list}. <span style="color:var(--muted)">Tags below reflect these.</span>`;}

/* ---------- Market & MF news (public RSS via CORS proxy; best-effort) ---------- */
const NEWS_FEEDS=[
  ['ET Markets','https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms'],
  ['Moneycontrol Markets','https://www.moneycontrol.com/rss/marketreports.xml'],
  ['Livemint Markets','https://www.livemint.com/rss/markets'],
  ['ET Mutual Funds','https://economictimes.indiatimes.com/mutual-funds/rssfeeds/360793467.cms'],
  ['Business Standard','https://www.business-standard.com/rss/markets-106.rss']];
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
  const seen={},uniq=[];all.forEach(i=>{const k=(i.title||'').slice(0,40);if(i.title&&!seen[k]){seen[k]=1;uniq.push(i);}});
  if(uniq.length){LS.s('news',{t:Date.now(),items:uniq.slice(0,8)});renderNews(uniq.slice(0,8));}
  else renderNews(null);}
function timingBanner(){
  const s=getSignals();const mk=s&&(s.items.market||s.items.nifty);
  if(!mk)return `<div class="note" style="background:#eef4ff;border:1px solid #d4e2fb;border-radius:8px;padding:8px 10px;margin-bottom:10px">⏱ <b>Timing:</b> run <b>News-aware signals</b> above for a general "deploy / stagger / wait" read. It's context, not a trading call.</div>`;
  const col=mk.bias>0?'var(--green)':(mk.bias<0?'var(--red)':'var(--amber)');
  const verb=mk.bias>0?'Signals lean positive':mk.bias<0?'Signals lean cautious — staggering suits':'Neutral — stick to your plan';
  return `<div class="note" style="background:#f4f6fb;border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:10px">⏱ <b style="color:${col}">${verb}.</b> ${esc(mk.note)}</div>`;}
function renderNews(items){
  if(!items||!items.length){$('news').innerHTML=timingBanner()+'<div class="note">Couldn\'t load live headlines right now (the free news source may be busy).</div>'+NEWS_LINKS;return;}
  const fmt=d=>{try{const x=new Date(d);return x.toLocaleDateString('en-IN',{day:'2-digit',month:'short'});}catch(e){return '';}};
  $('news').innerHTML=timingBanner()+items.map(i=>`<div class="row" style="padding:9px 0">
    <a href="${esc(safeUrl(i.link))}" target="_blank" rel="noopener" style="flex:1;color:var(--ink);text-decoration:none">
      <div class="fname" style="font-weight:400">${esc(i.title)}</div>
      <div class="fsub">${esc(i.src||'')}${i.date?' · '+fmt(i.date):''}</div></a>
    <span style="color:var(--blue);font-size:12px">↗</span></div>`).join('')+NEWS_LINKS;}

/* ---------- fund list ---------- */
let HOLDF='all';
function fundReturnTxt(h){
  const gpct=h.inv>0?(h.pl/h.inv*100):0;
  if(h.year&&h.inv>0&&h.cur>0){
    const yrs=Math.max(0.5,(Date.now()-new Date(h.year,6,1).getTime())/(365.25*864e5));
    if(yrs>=1){const cagr=(Math.pow(h.cur/h.inv,1/yrs)-1)*100;
      return `${gpct<0?'−':'+'}${Math.abs(gpct).toFixed(1)}% total · ≈${cagr<0?'−':''}${Math.abs(cagr).toFixed(1)}%/yr since ${h.year}`;}}
  return `${gpct<0?'−':'+'}${Math.abs(gpct).toFixed(1)}% total (not per-yr)`;}
function drawHold(){
  const rows=window._hrows||[];const r=HOLDF==='all'?rows:rows.filter(x=>x.verdict===HOLDF);
  document.querySelectorAll('#holdFilters button').forEach(b=>{
    const f=b.dataset.f;const n=f==='all'?rows.length:rows.filter(x=>x.verdict===f).length;
    b.textContent=(f==='all'?'All':VLAB[f])+` (${n})`;b.classList.toggle('on',f===HOLDF);});
  $('holdList').innerHTML=r.length?r.map(h=>{
    const lag=lagDays(h.date);
    const dtxt=!h.code
      ?'<span class="lag">not matched — values won\'t update ⚠</span>'
      :(h.isLive
        ?(lag>4?`<span class="lag">NAV ${h.nav.toFixed(4)} · ${esc(h.date)} ⚠</span>`:`NAV ${h.nav.toFixed(4)} · ${esc(h.date)} ✓`)
        :'<span class="lag">statement value — live NAV unverified ⚠</span>');
    const approx=h.unitsApprox?' · units approx':'';
    const day=(h.dayCh!=null&&isFinite(h.dayCh))?` · <span style="color:${h.dayCh<0?'var(--red)':'var(--green)'}">${h.dayCh<0?'▼':'▲'}${Math.abs(h.dayCh).toFixed(2)}% today</span>`:'';
    const newsln=h.news?`<div class="why" style="color:var(--blue)">${h.news}</div>`:'';
    const offln=h.official&&h.official.toLowerCase().slice(0,18)!==h.name.toLowerCase().slice(0,18)?`<div class="fsub">matched: ${esc(h.official)}</div>`:'';
    return `<div class="row"><div style="flex:1"><div class="fname">${esc(h.name)}</div>${offln}
      <div class="fsub">${inr(h.inv)} → ${inr(h.cur)} (${h.pl<0?'−':'+'}${inr(Math.abs(h.pl))}) · ${fundReturnTxt(h)}</div>
      <div class="fsub">${dtxt}${approx}${day}</div>
      <div class="why">${h.why}</div>${newsln}</div><span class="tag t-${h.verdict}">${h.vlabel}</span></div>`;}).join(''):'<div class="note" style="padding:8px 0">No funds in this group.</div>';}
document.querySelectorAll('#holdFilters button').forEach(b=>b.onclick=()=>{HOLDF=b.dataset.f;drawHold();});

/* ---------- Plan new money ---------- */
function bucketTotals(){const r=window._rows||[];const g=f=>r.filter(f).reduce((a,b)=>a+b.cur,0);
  return{equity:g(x=>x.grp==='Equity'),hybrid:g(x=>x.grp==='Hybrid'),gold:g(x=>x.grp==='Metal'),debt:g(x=>x.grp==='Debt'),total:window._tot||0};}
function growCandidates(newAmt){
  const p=window._p||LS.g('profile',{}),t=targets(p),b=bucketTotals(),total=b.total+newAmt;
  const sig=getSignals();const bias=m=>{const it=sig&&(sig.items[m]||(m==='gold'&&sig.items.metals));return it?it.bias:0;};
  const keepers=(window._rows||[]).filter(x=>x.verdict==='ok');
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
  if(newAmt<=0){$('growOut').innerHTML='<div class="note">Enter an amount to see an illustration.</div>';return;}
  const {cands,t,sig}=growCandidates(newAmt);
  if(!cands.length){$('growOut').innerHTML='<div class="note">Your allocation is already near the reference mix — topping up your steadiest core (hybrid or a large-cap/index fund), or simply holding, are both reasonable.</div>';return;}
  const N=Math.max(1,Math.min(cands.length,Math.round(newAmt/25000)||1));
  const chosen=cands.slice(0,N);
  const ws=chosen.reduce((a,b)=>a+b.w,0)||1;
  const rd=n=>Math.max(500,Math.round(n/500)*500);
  chosen.forEach(c=>{c.amt=rd(newAmt*c.w/ws);});
  const s=chosen.reduce((a,b)=>a+b.amt,0);chosen[0].amt+=Math.round(newAmt-s);
  chosen.forEach(c=>c.pct=Math.round(c.amt/newAmt*100));
  const tagc=a=>a==='NEW'?'t-review':'t-watch';
  $('growOut').innerHTML=`<div class="note" style="margin-bottom:8px">One way to spread <b>${inr(newAmt)}</b> across <b>${chosen.length} ${chosen.length>1?'funds':'fund'}</b>, weighted to your biggest gaps vs a ${t.equity}/${t.hybrid}/${t.gold}/${t.debt} reference mix${sig?', tilted by your news signals':''}. <b>An illustration to discuss — not a recommendation.</b></div>
   <table><thead><tr><th>Put into</th><th style="text-align:right">Amount</th><th style="text-align:right">%</th><th>Why</th></tr></thead><tbody>${
   chosen.map(c=>`<tr><td><div class="fname">${esc(c.name)} <span class="tag ${tagc(c.action)}" style="font-size:9px;padding:1px 6px">${c.action}</span></div><div class="fsub">${esc(c.type)}</div></td>
     <td style="text-align:right">${inr(c.amt)}</td><td style="text-align:right">${c.pct}%</td><td class="why" style="max-width:120px">${esc(c.why)}</td></tr>`).join('')}</tbody></table>`;}

/* ---------- Buy calendar (largest-remainder rounding so months add up) ---------- */
function planCal(){
  const newAmt=parseFloat($('calAmt').value)||0;const months=Math.max(1,Math.min(12,parseInt($('calMonths').value)||3));
  if(newAmt<=0){$('calOut').innerHTML='<div class="note">Enter the amount and months to generate a schedule.</div>';return;}
  const {cands,sig}=growCandidates(newAmt);
  const catW={};cands.forEach(c=>{const lbl={equity:'Equity (index + core)',hybrid:'Hybrid',gold:'Gold',debt:'Debt'}[c.bucket];catW[lbl]=(catW[lbl]||0)+c.w;});
  let cats=Object.entries(catW).map(([c,w])=>({c,w}));
  if(!cats.length)cats=[{c:'Hybrid / large-cap core',w:1}];
  const ws=cats.reduce((a,x)=>a+x.w,0)||1;cats.forEach(x=>x.pct=Math.round(x.w/ws*100));
  const per=Math.round(newAmt/months);
  // largest-remainder: round each category to ₹100, then push the difference into the biggest slice
  cats.forEach(x=>x.amt=Math.round(per*x.pct/100/100)*100);
  const diff=per-cats.reduce((a,x)=>a+x.amt,0);
  cats.sort((a,b)=>b.w-a.w)[0].amt+=diff;
  const mBias=(sig&&(sig.items.market||sig.items.nifty)||{}).bias||0;
  const tone=mBias>0?'📈 Signals lean positive — continuing on your dates looks reasonable.':mBias<0?'📉 Signals lean cautious — stick to the staggered plan, don\'t front-load.':'Steady staggering is the safe default (no strong market signal).';
  let rows='';for(let mo=1;mo<=months;mo++){
    const buys=cats.map(x=>`${esc(x.c)} — ${inr(x.amt)} (${x.pct}%)`).join('<br>');
    rows+=`<tr><td style="vertical-align:top;white-space:nowrap"><b>Month ${mo}</b></td><td style="text-align:left;color:var(--green);font-size:12px">${buys}</td></tr>`;}
  $('calOut').innerHTML=`<div class="note" style="margin-bottom:8px">${inr(newAmt)} over ${months} month(s) = ${inr(per)}/month. ${tone} Invest on a fixed date each month. <b>An illustration, not a recommendation.</b></div>
   <table><thead><tr><th>When</th><th style="text-align:left">Invest into (category · ₹ · %)</th></tr></thead><tbody>${rows}</tbody></table>`;}

function resetGrow(){$('growAmt').value='';$('growOut').innerHTML='';}
function resetCal(){$('calAmt').value='';$('calMonths').value='3';$('calOut').innerHTML='';}

/* ---------- AI review prompt (educational; PII notice before copying) ---------- */
function aiReview(){
  const p=LS.g('profile',{age:'?',horizon:'?'});const rows=window._hrows||[];
  if(!rows.length){alert('Build your dashboard first.');return;}
  if(!confirm('This copies your fund names, amounts and profile to the clipboard so you can paste them into an external AI app. No account numbers, PAN or folio numbers are included. The AI service will see this data. Continue?'))return;
  let ti=0,tc=0;rows.forEach(r=>{ti+=r.inv;tc+=r.cur;});
  const lines=rows.slice().sort((a,b)=>b.cur-a.cur).map(r=>
    `- ${r.name}: invested ₹${Math.round(r.inv).toLocaleString('en-IN')}, current ₹${Math.round(r.cur).toLocaleString('en-IN')} (${r.pl<0?'loss':'gain'} ₹${Math.round(Math.abs(r.pl)).toLocaleString('en-IN')})`).join('\n');
  const g=f=>rows.filter(f).reduce((a,b)=>a+b.cur,0);
  const eqp=(g(r=>r.grp==='Equity')/(tc||1)*100).toFixed(0),hyp=(g(r=>r.grp==='Hybrid')/(tc||1)*100).toFixed(0),
        gop=(g(r=>r.grp==='Metal')/(tc||1)*100).toFixed(0),dep=(g(r=>r.grp==='Debt')/(tc||1)*100).toFixed(0);
  const prompt=`Act as an experienced Indian mutual fund analyst giving me an EDUCATIONAL portfolio review. You are not my adviser and this is not SEBI-registered investment advice — frame outputs as observations and questions to take to a registered adviser. Be CRISP, POINT-WISE, SHORT.

MY PROFILE: age ${p.age}, horizon ${p.horizon} years, risk profile: ${BANDS[bandOf(p)]||'moderate'}.
PORTFOLIO: invested ₹${Math.round(ti).toLocaleString('en-IN')}, current ₹${Math.round(tc).toLocaleString('en-IN')}.
ALLOCATION NOW: equity ${eqp}%, hybrid ${hyp}%, gold/silver ${gop}%, debt ${dep}%.
HOLDINGS:
${lines}

Before answering, CONSIDER ALL of: my age & horizon & risk profile; current allocation vs a sensible reference for me; over-concentration and single-AMC risk; duplicate/overlapping funds; cost (Regular vs Direct); small/mid-cap exposure vs my profile; gaps (debt, global, index); TODAY'S market and index context (Nifty/Sensex/Midcap/Smallcap trend); tax angles (loss harvesting, exit loads, LTCG); and my goals.

Answer in these short sections, bullets only (1 line each):
1. FUND-BY-FUND — On track / Watch / Review + 4-6 word reason.
2. ALLOCATION — is my mix sensible for my age/horizon? reference %.
3. RED FLAGS — concentration, duplicates, cost, over-exposure.
4. GAPS — fund categories worth asking my adviser about, rough %.
5. MARKET CONTEXT — given today's conditions: deploy now / stagger / wait, as context not a call.
6. TAX — loss harvesting or exit-load points to verify with an adviser.
7. NEXT 3 QUESTIONS — the exact questions to take to a SEBI-registered adviser.
End with one line: overall portfolio health (Good / Needs work / Overhaul) and the single most important topic to discuss.

Keep it short and practical. This is educational, not advice.`;
  const done=()=>{$('aiMsg').innerHTML='<span style="color:var(--green)">✓ Prompt copied. Open your AI app and paste it.</span>';};
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(prompt).then(done).catch(()=>showPrompt(prompt));
  }else showPrompt(prompt);
}
function showPrompt(t){
  $('aiMsg').innerHTML='Copy this text manually:<textarea readonly style="width:100%;height:140px;margin-top:6px;font-size:12px;padding:8px;border:1px solid var(--line);border-radius:8px"></textarea>';
  const ta=$('aiMsg').querySelector('textarea');ta.value=t;ta.focus();ta.select();
}

/* ---------- backup / restore ---------- */
const BK_KEYS=['profile','holdings','navs','navDates','navTs','history','signals','consent'];
function exportData(){
  const data={};BK_KEYS.forEach(k=>{const v=LS.g(k,null);if(v!=null)data[k]=v;});
  if(!data.holdings){$('dataMsg').textContent='Nothing to export yet.';return;}
  const blob=new Blob([JSON.stringify({app:'mf-tracker',ver:APP_VERSION,exported:new Date().toISOString(),data},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='mf-tracker-backup-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(a);a.click();a.remove();
  $('dataMsg').innerHTML='<span style="color:var(--green)">✓ Backup file saved. Keep it somewhere safe (Files, iCloud, email to yourself).</span>';}
function importData(file){
  const rd=new FileReader();
  rd.onload=()=>{try{
    const j=JSON.parse(rd.result);
    if(!j||j.app!=='mf-tracker'||!j.data||!Array.isArray(j.data.holdings))throw new Error('bad');
    if(!confirm('Replace everything in this app with the backup from '+(j.exported||'').slice(0,10)+'?'))return;
    BK_KEYS.forEach(k=>{if(j.data[k]!=null)LS.s(k,j.data[k]);});
    location.reload();
  }catch(e){alert('That file doesn\'t look like an MF Tracker backup.');}};
  rd.readAsText(file);}

/* CSV export — opens in Excel/Sheets. BOM so Excel reads the ₹-free UTF-8 cleanly. */
function exportCSV(){
  const rows=window._rows||LS.g('holdings',[]);
  if(!rows.length){$('dataMsg').textContent='Nothing to export yet.';return;}
  const q=s=>'"'+String(s==null?'':s).replace(/"/g,'""')+'"';
  const head=['Fund','Category','Invested (INR)','Current (INR)','Gain/Loss (INR)','Units','NAV','NAV date','Buy year','Status'];
  const lines=rows.map(r=>[q(r.name),q(r.cat||''),Math.round(r.inv||0),Math.round(r.cur||0),
    Math.round((r.cur||0)-(r.inv||0)),r.units?r.units.toFixed(3):'',r.nav?r.nav.toFixed(4):'',q(r.date||''),r.year||'',q(r.vlabel||'')].join(','));
  const ti=rows.reduce((a,r)=>a+(r.inv||0),0),tc=rows.reduce((a,r)=>a+(r.cur||0),0);
  lines.push(['"TOTAL"','',Math.round(ti),Math.round(tc),Math.round(tc-ti),'','','','',''].join(','));
  const blob=new Blob(['﻿'+head.join(',')+'\r\n'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='mf-tracker-holdings-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();a.remove();
  $('dataMsg').innerHTML='<span style="color:var(--green)">✓ CSV saved — open it in Excel or Google Sheets.</span>';}

/* ---------- glossary ---------- */
const GLOSS=[
 ['NAV','The price of one unit of a fund, declared daily. Your value = units × NAV. A "high" NAV is not expensive — only growth matters.'],
 ['Units','How many pieces of the fund you own. They only change when you buy or sell, not when the market moves.'],
 ['Total gain vs per-year (CAGR)','"+40% total" over 6 years is only ~5.8%/yr. Per-year (CAGR) is the honest way to compare funds. Add a buy year on the review screen to see it.'],
 ['Direct vs Regular plan','Same fund, two prices. Regular includes ~1%/yr commission for the distributor; Direct doesn\'t. Switching has tax/exit-load implications — ask before acting.'],
 ['Exit load','A small charge (often 1%) if you sell within a set period (often 1 year). Check before selling.'],
 ['LTCG / STCG tax','Selling equity funds within 1 year = short-term tax (higher). After 1 year = long-term (lower, with an annual exemption). Rules change — verify current rates.'],
 ['SIP','Investing a fixed amount monthly. Buys more units when markets fall, fewer when they rise — removes timing stress.'],
 ['Index fund','Owns the whole market (e.g. Nifty 50) at very low cost, instead of paying a manager to pick stocks. A common low-effort core.'],
 ['Overlap / duplicate funds','Two funds of the same category mostly own the same stocks. You get extra paperwork, not extra diversification.']];
function renderGloss(){const el=$('gloss');if(!el)return;
  el.innerHTML=GLOSS.map(g=>`<details class="gl"><summary>${esc(g[0])}</summary><div>${esc(g[1])}</div></details>`).join('');}

/* ---------- language (EN / हिंदी for main labels) ---------- */
const HI={
 tagline:'आपका निजी, फ़ोन-पर ही चलने वाला फंड ट्रैकर',
 w_title:'शुरू करने से पहले — कृपया यह पढ़ें',
 w_body:'<p style="margin:0 0 8px"><b>यह ऐप क्या है:</b> एक शैक्षिक टूल जो आपका म्यूचुअल फंड स्टेटमेंट पढ़कर दिखाता है कि पैसा कहाँ लगा है, और समझने लायक बातें बताता है — जैसे एक जैसे दो फंड, ज़्यादा concentration, या उम्र के हिसाब से mix।</p><p style="margin:0 0 8px"><b>यह क्या नहीं है:</b> यह <b>निवेश सलाह नहीं है</b> और <b>SEBI-पंजीकृत सलाहकार से नहीं है</b>। खरीदने-बेचने से पहले पंजीकृत सलाहकार से बात करें।</p><p style="margin:0 0 8px"><b>आपकी निजता:</b> सब कुछ इसी फ़ोन पर रहता है। कुछ भी अपलोड नहीं होता।</p><p style="margin:0"><b>आपकी ज़िम्मेदारी:</b> स्क्रीनशॉट पढ़ने में गलती हो सकती है — रिव्यू स्क्रीन पर आँकड़े ज़रूर जाँचें। म्यूचुअल फंड निवेश बाज़ार जोखिम के अधीन हैं।</p>',
 w_btn:'मैं समझ गया/गई — आगे बढ़ें',
 back:'डैशबोर्ड पर वापस',
 s_about:'अपने बारे में बताएं', s_priv:'यह जानकारी सिर्फ़ इसी फ़ोन पर रहती है।',
 s_age:'उम्र', s_hz:'निवेश अवधि (यह पैसा कब चाहिए?)',
 s_plan:'प्लान का प्रकार (स्टेटमेंट में "Direct" शब्द देखें)',
 s_quiz:'छोटा रिस्क चेक-अप', s_quiz2:'6 छोटे सवाल। ईमानदारी से जवाब दें — कोई गलत जवाब नहीं है।',
 s_add:'अपना पोर्टफोलियो जोड़ें', s_shots:'पोर्टफोलियो स्क्रीनशॉट अपलोड करें',
 s_shots2:'NJ, Groww, Coin, Kuvera, ET Money… सारे पेज जोड़ें।',
 s_read:'स्क्रीनशॉट पढ़ें और आगे बढ़ें', s_cas:'CAS PDF इम्पोर्ट (बीटा)', s_manual:'✍️ हाथ से भरें',
 s_cas2:'CAS = CAMS/KFintech से ईमेल में आने वाला स्टेटमेंट PDF। सबसे सटीक स्रोत।',
 s_reset:'ऐप रीसेट करें और सारा डेटा मिटाएँ', s_reset2:'प्रोफ़ाइल, होल्डिंग्स, इतिहास — सब इसी फ़ोन से मिट जाएगा।',
 r_help:'हर फंड का <b>निवेश</b> और <b>मौजूदा मूल्य</b> अपने स्टेटमेंट से मिलाएँ — यही आपकी सुरक्षा जाँच है। Units और खरीद वर्ष वैकल्पिक हैं।',
 r_addrow:'एक और फंड जोड़ें', r_build:'मेरा डैशबोर्ड बनाएं',
 d_disc:'शैक्षिक टूल — यह SEBI-पंजीकृत निवेश सलाह नहीं है। खरीद/बिक्री से पहले पंजीकृत सलाहकार से पुष्टि करें।',
 d_refresh:'रीफ़्रेश',
 h_alloc:'आपका पैसा कहाँ लगा है', h_proj:'मूल्य और अनुमानित बढ़त', h_funds:'हर फंड की स्थिति',
 h_grow:'नया निवेश कैसे बाँटें', g_amt:'कितना नया पैसा लगाना है?', g_plan:'प्लान', g_reset:'रीसेट',
 h_cal:'खरीद कैलेंडर', c_amt:'राशि', c_mo:'महीने', c_build:'बनाएं',
 h_notes:'समझने लायक बातें', h_sig:'समाचार-आधारित संकेत',
 sg_copy:'न्यूज़ प्रॉम्प्ट कॉपी करें', sg_paste:'नतीजा पेस्ट करें', sg_apply:'संकेत लागू करें', sg_clear:'हटाएँ',
 h_news:'बाज़ार और MF समाचार', h_ai:'पूरा AI रिव्यू लें',
 ai_help:'आपकी प्रोफ़ाइल और होल्डिंग्स के साथ तैयार प्रॉम्प्ट कॉपी होगा। इसे Claude / ChatGPT / Gemini में पेस्ट करें। फंड के नाम और राशियाँ उस AI सेवा को दिखेंगी — खाता नंबर शामिल नहीं होते।',
 ai_btn:'रिव्यू प्रॉम्प्ट कॉपी करें',
 h_data:'डेटा और बैकअप',
 dt_help:'डेटा सिर्फ़ इसी ब्राउज़र में है और फ़ोन storage साफ़ होने पर खो सकता है। समय-समय पर बैकअप निकालें; दूसरे फ़ोन पर restore भी कर सकते हैं।',
 dt_exp:'बैकअप निकालें', dt_imp:'बैकअप लाएँ',
 dt_csv:'होल्डिंग्स CSV में निकालें (Excel में खुलेगा)',
 h_gloss:'इन शब्दों का मतलब?',
 d_footer:'NAV आधिकारिक AMFI मूल्य हैं, आपके ब्राउज़र में लाइव आते हैं। सारा डेटा इसी फ़ोन पर रहता है। On-track/Watch/Review टैग एक पारदर्शी नियम-इंजन से आते हैं — ये <b>शैक्षिक टिप्पणियाँ हैं, निवेश सलाह नहीं, और SEBI-पंजीकृत सलाहकार से नहीं</b>। म्यूचुअल फंड निवेश बाज़ार जोखिम के अधीन हैं; योजना से जुड़े सभी दस्तावेज़ ध्यान से पढ़ें। कोई भी खरीद/बिक्री SEBI-पंजीकृत सलाहकार से पुष्टि करके ही करें।',
 b_nav:'NAV', b_upd:'अपडेट', b_prof:'प्रोफ़ाइल'};
let _enDefaults=null;
function applyLang(){
  const lang=LS.g('lang','en');
  if(!_enDefaults){_enDefaults={};document.querySelectorAll('[data-i18n],[data-i18n-html]').forEach(el=>{
    const k=el.getAttribute('data-i18n')||el.getAttribute('data-i18n-html');
    if(!(k in _enDefaults))_enDefaults[k]=el.innerHTML;});}
  document.querySelectorAll('[data-i18n],[data-i18n-html]').forEach(el=>{
    const k=el.getAttribute('data-i18n')||el.getAttribute('data-i18n-html');
    const v=lang==='hi'?(HI[k]||_enDefaults[k]):_enDefaults[k];
    if(v!=null)el.innerHTML=v;});
  const b=$('langBtn');if(b)b.textContent=lang==='hi'?'EN':'हिं';}
function toggleLang(){LS.s('lang',LS.g('lang','en')==='hi'?'en':'hi');applyLang();if(window._hrows)drawHold();}

/* ---------- profile ---------- */
function ensureProfile(strict){
  const age=parseInt($('age').value)||0;
  const hz=document.querySelector('#horizonChips .chip.on'),pl=document.querySelector('#planChips .chip.on');
  const ex=LS.g('profile',null);
  const done=_quizAns.filter(a=>a!=null).length;
  let band,score=null,answers=null,assessedOn=null;
  if(done===QUIZ.length){score=quizScore();band=bandFromScore(score);answers=_quizAns.slice();assessedOn=new Date().toISOString().slice(0,10);}
  else if(ex&&ex.band){band=ex.band;score=ex.score||null;answers=ex.answers||null;assessedOn=ex.assessedOn||null;}
  else if(strict){alert('Please answer all 6 risk questions first — they decide how your portfolio is judged.');return false;}
  else band='moderate';
  LS.s('profile',{age:(age>=18&&age<=90)?age:(ex&&ex.age?ex.age:35),
    horizon:hz?hz.dataset.v:(ex&&ex.horizon?ex.horizon:'5-7'),
    plan:pl?pl.dataset.v:(ex&&ex.plan?ex.plan:'regular'),
    band,score,answers,assessedOn});
  return true;}
function loadProfileForm(){const p=migrateProfile();renderQuiz();if(!p)return;
  $('age').value=p.age||'';
  document.querySelectorAll('#horizonChips .chip').forEach(c=>c.classList.toggle('on',c.dataset.v===p.horizon));
  document.querySelectorAll('#planChips .chip').forEach(c=>c.classList.toggle('on',c.dataset.v===(p.plan||'regular')));
  _quizAns=(p.answers||[]).slice();syncQuizChips();}
function reupload(){show('setup');loadProfileForm();$('shots').value='';$('shotcount').textContent='';}
function editProfile(){show('setup');loadProfileForm();}
function resetApp(){
  if(!confirm('Clear ALL saved data (profile, holdings, history, signals) and start fresh? This cannot be undone. Consider exporting a backup first.'))return;
  ['holdings','navs','navDates','navTs','history','profile','signals','news','consent'].forEach(k=>localStorage.removeItem(k));
  location.reload();}

/* ---------- events & init ---------- */
document.addEventListener('click',e=>{
  const c=e.target.closest('.chip');if(!c)return;
  const grp=c.parentElement;if(!grp||!grp.classList.contains('chips'))return;
  grp.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));c.classList.add('on');
  if(c.dataset.qz!=null){_quizAns[+c.dataset.qz]=+c.dataset.j;syncQuizChips();}});
$('shots').addEventListener('change',()=>{const n=$('shots').files.length;$('shotcount').textContent=n?n+' image(s) selected':'';});
$('casFile').addEventListener('change',()=>{const f=$('casFile').files[0];if(f)importCAS(f);$('casFile').value='';});
$('impFile').addEventListener('change',()=>{const f=$('impFile').files[0];if(f)importData(f);$('impFile').value='';});
const _rsf=$('rescanFile');if(_rsf)_rsf.addEventListener('change',()=>{const f=_rsf.files[0];if(f)doRescan(f);_rsf.value='';});

/* Update flow: when a new build is downloaded, offer a one-tap reload instead of
   silently serving the old cached code (the "my fix didn't arrive" trap). */
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').then(reg=>{
  reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;
    w.addEventListener('statechange',()=>{
      if(w.state==='installed'&&navigator.serviceWorker.controller){
        const b=document.createElement('div');
        b.style.cssText='position:fixed;bottom:78px;left:14px;right:14px;max-width:452px;margin:0 auto;background:#13213f;color:#fff;padding:13px 15px;border-radius:12px;z-index:60;font-size:13px;text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.25);cursor:pointer';
        b.innerHTML='⬆️ A new version is ready — <b>tap to update</b>';
        b.onclick=()=>location.reload();
        document.body.appendChild(b);}});});
}).catch(()=>{});
(function init(){const v=$('ver');if(v)v.textContent='v'+APP_VERSION;
  applyLang();renderGloss();renderQuiz();
  if(!LS.g('consent',null)){show('welcome');return;}
  const holds=LS.g('holdings',[]);if(holds.length)refresh();else{loadProfileForm();show('setup');}})();
