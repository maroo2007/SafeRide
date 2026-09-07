/** Captures of the page ground at swept alphas / glow strengths. */
const { spawn } = require("child_process");
const fs = require("fs"); const path = require("path"); const http = require("http");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = u => new Promise((res, rej) => http.get(u, r => { let d=""; r.on("data",c=>d+=c); r.on("end",()=>res(JSON.parse(d))); }).on("error", rej));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME,["--headless=new","--no-sandbox","--hide-scrollbars","--remote-debugging-port=9721",`--user-data-dir=${P}`,"--window-size=1440,900","about:blank"],{stdio:"ignore"});
  let t=null; for(let i=0;i<40&&!t;i++){await sleep(500);try{t=(await get("http://127.0.0.1:9721/json/list")).find(x=>x.type==="page");}catch{}}
  const WebSocket=require("ws"); const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:2**28});
  await new Promise(r=>ws.on("open",r));
  let id=0; const pend=new Map();
  ws.on("message",m=>{const x=JSON.parse(m.toString());if(x.id&&pend.has(x.id)){pend.get(x.id)(x);pend.delete(x.id);}});
  const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  const ev=async e=>(await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true})).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"http://localhost:3100/"}); await sleep(9000);
  const shot = async n => fs.writeFileSync(path.join(OUT,n), Buffer.from((await send("Page.captureScreenshot",{format:"png"})).result.data,"base64"));
  const goto = async sel => { await ev(`(async()=>{const e=document.querySelector('${sel}');scrollTo(0,e.getBoundingClientRect().top+scrollY+8);await new Promise(r=>setTimeout(r,900));return 1})()`); };
  const setVar = async (sel,k,v) => ev(`document.querySelectorAll('${sel}').forEach(e=>e.style.setProperty('${k}','${v}'));1`);

  /* paper: three grid alphas, on the Platform section */
  for (const a of ["22%","35%","50%"]) {
    await setVar(".page-ground","--grid-ink",a);
    await goto("#features"); await sleep(400);
    await shot(`paper-grid-${a.replace("%","")}.png`);
  }
  await setVar(".page-ground","--grid-ink","35%");

  /* dark: glow intensities on the Intelligence Layer */
  for (const g of ["8%","14%","22%"]) {
    await setVar(".dark-ground","--glow-strength",g);
    await goto("#ai"); await sleep(400);
    await shot(`dark-glow-${g.replace("%","")}.png`);
  }
  /* The phone tour at chapter 1 rest. The canvas is alpha: true, so whatever
     the section's ground is shows through behind the phone. */
  await setVar(".page-ground","--grid-ink","35%");
  await ev(`(async()=>{const rw=document.querySelector('#parent-app [data-tour-runway]');scrollTo(0,rw.getBoundingClientRect().top+scrollY);await new Promise(r=>setTimeout(r,1400));return 1})()`);
  await sleep(600);
  await shot(process.argv[4] === "opaque" ? "tour-b-opaque-ground.png" : "tour-a-grid-through.png");
  /* And mid-descent, to see the lattice move behind a pinned canvas. */
  await ev(`(async()=>{const rw=document.querySelector('#parent-app [data-tour-runway]');const t=rw.getBoundingClientRect().top+scrollY;scrollTo(0,t+(rw.offsetHeight-innerHeight)*0.375);await new Promise(r=>setTimeout(r,1400));return 1})()`);
  await sleep(600);
  await shot(process.argv[4] === "opaque" ? "tour-b-mid.png" : "tour-a-mid.png");

  ws.close(); ch.kill(); process.exit(0);
})();
