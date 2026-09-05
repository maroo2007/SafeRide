/**
 * Measure what the idle loop is FOR: time to first painted frame, and that
 * the scrub file does not compete with it for bandwidth.
 *
 * Also captures the handoff either side of the first scroll input.
 */
const { spawn } = require("child_process"); const fs=require("fs"); const path=require("path"); const http=require("http");
const CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe";
const P=process.argv[2], OUT=process.argv[3], THROTTLE=process.argv[4]==="slow", URL=process.argv[5]||"http://localhost:3000/", PORT=9641;
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
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  if (THROTTLE) {
    // Fast 3G, the profile the loop file was split out for.
    // 204 KB/s down, the figure this project measured for Fast 3G and the
    // one the CLAMPED design is built on. An earlier version of this script
    // used 180 kbps — Slow 3G, roughly a tenth — so the 336 KB loop could not
    // arrive inside the polling window and the run reported "never".
    await send("Network.emulateNetworkConditions",{offline:false,latency:562.5,
      downloadThroughput:204*1024,uploadThroughput:84*1024,connectionType:"cellular3g"});
  }
  const t0=Date.now();
  await send("Page.navigate",{url:URL});
  // Poll until the IDLE video has actually decoded a frame.
  let ttff=null;
  for(let i=0;i<600 && ttff===null;i++){
    const r=await ev(`(()=>{const v=document.querySelector('section[aria-labelledby="hero-headline"] video');
      return v && v.readyState>=2 ? 1 : 0;})()`);
    if(r===1) ttff=Date.now()-t0; else await sleep(50);
  }
  console.log(`  network: ${THROTTLE?"Fast 3G (204 KB/s, 562ms RTT)":"unthrottled"}`);
  console.log(`  time to first decoded IDLE frame: ${ttff===null?"never":ttff+"ms"}`);
  await sleep(THROTTLE?9000:6000);
  console.log("  state:", await ev(`(()=>{const v=[...document.querySelectorAll('section[aria-labelledby="hero-headline"] video')];
    return JSON.stringify(v.map(x=>({file:(x.currentSrc||'(none)').split('/').pop(),rs:x.readyState,
      buffered:x.buffered.length?+x.buffered.end(0).toFixed(1):0,op:getComputedStyle(x).opacity})));})()`));
  const shot=async n=>{const r=await send("Page.captureScreenshot",{format:"png"});
    fs.writeFileSync(path.join(OUT,n),Buffer.from(r.result.data,"base64")); console.log("  "+n);};
  await ev("scrollTo(0,0);1"); await sleep(1200); await shot("handoff-1-idle-at-rest.png");
  await ev(`(async()=>{const rw=document.querySelector('section[aria-labelledby="hero-headline"]');
    const max=rw.getBoundingClientRect().height-innerHeight; scrollTo(0,Math.round(max*0.06));
    await new Promise(r=>setTimeout(r,2000)); return 1;})()`);
  await shot("handoff-2-scrub-after-first-scroll.png");
  console.log("  after handoff:", await ev(`(()=>{const v=[...document.querySelectorAll('section[aria-labelledby="hero-headline"] video')];
    return JSON.stringify(v.map(x=>({file:(x.currentSrc||'(none)').split('/').pop(),paused:x.paused,
      t:+x.currentTime.toFixed(2),op:getComputedStyle(x).opacity})));})()`));
  ws.close(); ch.kill(); process.exit(0);
})();
