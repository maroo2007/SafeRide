/**
 * Measure the hero CTA on the REAL hero, over real footage, with the dark
 * tokens now actually applied.
 *
 * The previous table was taken on /cta-lab, which never carried `dark`, so it
 * described a state that no longer exists: the button wore a #b9551a ring
 * there and does not here.
 */
const { spawn } = require("child_process"); const http=require("http");
const { decodePNG, L, ratio } = require("./scrim-lab");
const CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe", P=process.argv[2], PORT=9631;
const FRAMES=[0,0.502,1.004,1.506,2.008,2.761,3.263,4.016,4.518,5.271,6.024,6.275];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const get=u=>new Promise((res,rej)=>http.get(u,r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)))}).on("error",rej));
function stats(img,r,inset){const px=[];
  for(let y=Math.round(r.y+inset);y<Math.round(r.y+r.h-inset);y++)
    for(let x=Math.round(r.x+inset);x<Math.round(r.x+r.w-inset);x++){
      const o=y*img.w*img.ch+x*img.ch; px.push([img.px[o],img.px[o+1],img.px[o+2]]);}
  if(!px.length)return null; px.sort((a,b)=>L(...a)-L(...b));
  return {dark:px[Math.floor(px.length*0.05)],light:px[Math.floor(px.length*0.95)]};}
function edge(img,r){const my=Math.round(r.y+r.h/2);
  const rd=x=>{const o=my*img.w*img.ch+x*img.ch;return [img.px[o],img.px[o+1],img.px[o+2]];};
  let best=0; for(const dx of [0,1,2]){const c=ratio(L(...rd(Math.round(r.x)+dx)),L(...rd(Math.max(0,Math.round(r.x)-3-dx))));if(c>best)best=c;}
  return best;}
(async()=>{
  const ch=spawn(CHROME,["--headless=new","--disable-gpu","--no-sandbox","--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,`--user-data-dir=${P}`,"--window-size=1440,900","about:blank"],{stdio:"ignore"});
  let t=null; for(let i=0;i<40&&!t;i++){await sleep(500); try{t=(await get(`http://127.0.0.1:${PORT}/json/list`)).find(x=>x.type==="page")}catch{}}
  const WebSocket=require("ws");
  const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:2**28});
  await new Promise(r=>ws.on("open",r));
  let id=0; const pend=new Map();
  ws.on("message",m=>{const x=JSON.parse(m.toString()); if(x.id&&pend.has(x.id)){pend.get(x.id)(x);pend.delete(x.id)}});
  const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}))});
  const ev=async e=>(await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true})).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"http://localhost:3000/"}); await sleep(9000);
  await ev("scrollTo(0,0);1"); await sleep(700);

  console.log("\n=== computed style of the hero CTA, with `dark` applied ===");
  console.log(await ev(`(()=>{const a=document.querySelector('a[aria-label="Explore Platform"]');
    const cs=getComputedStyle(a);
    return JSON.stringify({borderColor:cs.borderTopColor, borderWidth:cs.borderTopWidth,
      boxShadow:cs.boxShadow.slice(0,52), labelColor:cs.color,
      accentEdge:getComputedStyle(a).getPropertyValue('--accent-edge').trim()||'(inherited)'},null,1);})()`));

  const info=JSON.parse(await ev(`(()=>{const out=[];
    document.querySelectorAll('section[aria-labelledby="hero-headline"] a').forEach((a,i)=>{
      const r=a.getBoundingClientRect(); const cs=getComputedStyle(a);
      out.push({role:i?'secondary':'primary',x:r.x,y:r.y,w:r.width,h:r.height,color:cs.color});});
    document.querySelectorAll('section[aria-labelledby="hero-headline"] a [data-label], section[aria-labelledby="hero-headline"] a svg')
      .forEach(e=>e.style.visibility='hidden');
    return JSON.stringify(out);})()`));

  const worst={};
  for(const ft of FRAMES){
    await ev(`(async()=>{const v=document.querySelector('video');v.currentTime=${ft};
      await new Promise(r=>{let d=false;const f=()=>{if(!d){d=true;r();}};
        v.addEventListener('seeked',f,{once:true});setTimeout(f,800);});return 1;})()`);
    await sleep(120);
    const img=decodePNG(Buffer.from((await send("Page.captureScreenshot",{format:"png"})).result.data,"base64"));
    for(const b of info){
      const g=stats(img,b,7); if(!g) continue;
      const m=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(b.color); const text=[+m[1],+m[2],+m[3]];
      const ground=L(...text)>0.4?g.light:g.dark;
      const cr=ratio(L(...text),L(...ground)); const e=edge(img,b);
      const cur=worst[b.role];
      if(!cur||cr<cur.cr) worst[b.role]={cr,ground,text,t:ft,edge:e};
      if(worst[b.role].edgeMin===undefined||e<worst[b.role].edgeMin) worst[b.role].edgeMin=e;
    }
  }
  console.log("\n=== hero CTA over footage, worst of 12 frames in the visible window ===");
  console.log("  role       label            worst ground     label CR   edge CR  at t");
  for(const role of ["primary","secondary"]){const w=worst[role]; if(!w) continue;
    console.log("  "+role.padEnd(11)+`rgb(${w.text})`.padEnd(17)+`rgb(${w.ground})`.padEnd(17)
      +`${w.cr.toFixed(2)}:1`.padEnd(11)+`${w.edgeMin.toFixed(2)}:1`.padEnd(9)+`${w.t}s`);}
  console.log("");
  ws.close(); ch.kill(); process.exit(0);
})();
