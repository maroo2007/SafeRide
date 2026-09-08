/** Which knob owns the body's brightness — and does it move the screen? */
const { spawn } = require("child_process"); const fs=require("fs"); const path=require("path"); const http=require("http");
const { decodePNG } = require("./scrim-lab");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], OUT = process.argv[3];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = u => new Promise((res,rej)=>http.get(u,r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)));}).on("error",rej));
(async () => {
  fs.mkdirSync(OUT,{recursive:true});
  const ch = spawn(CHROME,["--headless=new","--no-sandbox","--hide-scrollbars","--remote-debugging-port=9813","--user-data-dir="+P,"--window-size=1440,900","about:blank"],{stdio:"ignore"});
  let t=null; for(let i=0;i<40&&!t;i++){await sleep(500);try{t=(await get("http://127.0.0.1:9813/json/list")).find(x=>x.type==="page");}catch{}}
  const WebSocket=require("ws"); const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:2**28});
  await new Promise(r=>ws.on("open",r));
  let id=0; const pend=new Map();
  ws.on("message",m=>{const x=JSON.parse(m.toString());if(x.id&&pend.has(x.id)){pend.get(x.id)(x);pend.delete(x.id);}});
  const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  const ev=async e=>(await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true})).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  const GROUND=[253,248,240];
  const measure = async (q,tag) => {
    await send("Page.navigate",{url:"http://localhost:3100/?"+q}); await sleep(6500);
    const top = await ev(`(()=>{const rw=document.querySelector('#parent-app [data-tour-runway]');return Math.round(rw.getBoundingClientRect().top+scrollY);})()`);
    await ev(`(async()=>{scrollTo(0,${top});await new Promise(r=>setTimeout(r,900));return 1})()`);
    for(let i=0;i<80;i++){ if(await ev("!!(window.__tourMarks&&window.__tourMarks.deferredEnvDone)")) break; await sleep(250); }
    await sleep(800);
    const d=JSON.parse(await ev("JSON.stringify(window.__phoneTour.debug())"));
    const cx=await ev(`Math.round(document.querySelector('#parent-app canvas').getBoundingClientRect().x)`);
    const cy=await ev(`Math.round(document.querySelector('#parent-app canvas').getBoundingClientRect().y)`);
    const png=Buffer.from((await send("Page.captureScreenshot",{format:"png"})).result.data,"base64");
    fs.writeFileSync(path.join(OUT,tag+".png"),png);
    const img=decodePNG(png);
    const isG=o=>Math.abs(img.px[o]-GROUND[0])<=6&&Math.abs(img.px[o+1]-GROUND[1])<=6&&Math.abs(img.px[o+2]-GROUND[2])<=6;
    const pr=d.phoneRect, sr=d.screenRect;
    let r=0,g=0,b=0,n=0;
    for(let y=cy+pr.y+Math.round(pr.h*0.30); y<cy+pr.y+Math.round(pr.h*0.70); y++){
      let x=cx+pr.x; const lim=Math.min(img.w-1,cx+sr.x+Math.round(sr.w*0.10));
      while(x<lim&&isG((y*img.w+x)*img.ch)) x++;
      for(let k=0;k<10&&x+k<lim;k++){const o=((y)*img.w+x+k)*img.ch; if(isG(o))break; r+=img.px[o];g+=img.px[o+1];b+=img.px[o+2];n++;}
    }
    /* The screen, at the same moment: it must NOT move. */
    let sr2=0,sg=0,sb=0,sn=0;
    for(let y=cy+sr.y+Math.round(sr.h*0.35); y<cy+sr.y+Math.round(sr.h*0.55); y+=2)
      for(let x=cx+sr.x+Math.round(sr.w*0.3); x<cx+sr.x+Math.round(sr.w*0.7); x+=2){
        const o=(y*img.w+x)*img.ch; sr2+=img.px[o];sg+=img.px[o+1];sb+=img.px[o+2];sn++; }
    return { body:n?[r/n,g/n,b/n].map(Math.round):null, screen:sn?[sr2/sn,sg/sn,sb/sn].map(Math.round):null };
  };
  console.log("\n  BODY BRIGHTNESS — which knob, and does the screen follow?\n");
  console.log("   setting                    metal edge          screen centre");
  for(const [q,tag,label] of [
    ["descentUse=1.0","base","shipping (exp 1, env 1)"],
    ["descentUse=1.0&exposure=1.3","exp13","exposure 1.3"],
    ["descentUse=1.0&exposure=1.6","exp16","exposure 1.6"],
    ["descentUse=1.0&envIntensity=1.6","env16","envIntensity 1.6"],
    ["descentUse=1.0&envIntensity=2.5","env25","envIntensity 2.5"],
  ]){
    const m=await measure(q,tag);
    console.log("   "+label.padEnd(26)+`rgb(${String(m.body).padEnd(14)})  rgb(${m.screen})`);
  }
  console.log("");
  ws.close(); ch.kill(); process.exit(0);
})();
