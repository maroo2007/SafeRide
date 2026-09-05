const { spawn } = require("child_process"); const fs=require("fs"); const path=require("path"); const http=require("http");
const CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe", P=process.argv[2], OUT=process.argv[3], URL=process.argv[4]||"http://localhost:3000/", PORT=9681;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const get=u=>new Promise((res,rej)=>http.get(u,r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)))}).on("error",rej));
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
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
  await send("Page.navigate",{url:URL}); await sleep(9000);
  const shot=async n=>{const r=await send("Page.captureScreenshot",{format:"png"});
    fs.writeFileSync(path.join(OUT,n),Buffer.from(r.result.data,"base64")); console.log("  "+n);};
  await ev("scrollTo(0,0);1"); await sleep(1500);
  await shot("nav-1-header-over-idle.png");
  // A frame the old inversion idea would have failed on: the white-out.
  await ev(`(async()=>{const rw=document.querySelector('section[aria-labelledby="hero-headline"]');
    const max=rw.getBoundingClientRect().height-innerHeight; scrollTo(0,Math.round(max*0.20));
    await new Promise(r=>setTimeout(r,2200)); return 1;})()`);
  await shot("nav-2-header-over-whiteout.png");
  await ev(`(async()=>{const rw=document.querySelector('section[aria-labelledby="hero-headline"]');
    const max=rw.getBoundingClientRect().height-innerHeight; scrollTo(0,Math.round(max*0.63));
    await new Promise(r=>setTimeout(r,2200)); return 1;})()`);
  await shot("nav-3-header-over-map.png");
  await ev("scrollTo(0,0);1"); await sleep(1200);
  await ev(`(async()=>{const b=[...document.querySelectorAll('button')].find(x=>/Open menu/i.test(x.getAttribute('aria-label')||''));
    b.click(); await new Promise(r=>setTimeout(r,1800)); return 1;})()`);
  await shot("nav-4-menu-open.png");
  ws.close(); ch.kill(); process.exit(0);
})();
