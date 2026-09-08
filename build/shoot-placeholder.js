/** The section immediately after a hard refresh, before the model arrives. */
const { spawn } = require("child_process"); const fs=require("fs"); const path=require("path"); const http=require("http");
const CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe";
const P=process.argv[2], OUT=process.argv[3];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const get=u=>new Promise((res,rej)=>http.get(u,r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)));}).on("error",rej));
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const ch=spawn(CHROME,["--headless=new","--no-sandbox","--hide-scrollbars","--remote-debugging-port=9751","--user-data-dir="+P,"--window-size=1440,900","about:blank"],{stdio:"ignore"});
  let t=null; for(let i=0;i<40&&!t;i++){await sleep(500);try{t=(await get("http://127.0.0.1:9751/json/list")).find(x=>x.type==="page");}catch{}}
  const WebSocket=require("ws"); const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:2**28});
  await new Promise(r=>ws.on("open",r));
  let id=0; const pend=new Map();
  ws.on("message",m=>{const x=JSON.parse(m.toString());if(x.id&&pend.has(x.id)){pend.get(x.id)(x);pend.delete(x.id);}});
  const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  const ev=async e=>(await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true})).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.clearBrowserCache"); await send("Network.setCacheDisabled",{cacheDisabled:true});
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  /* Hold the GLB so the placeholder is observable for as long as we need. */
  await send("Network.setBlockedURLs",{urls:["*iphone_16_saferide_max.glb"]});
  await send("Page.navigate",{url:"http://localhost:3100/"}); await sleep(7000);
  await ev(`(async()=>{const rw=document.querySelector('#parent-app [data-tour-runway]');scrollTo(0,rw.getBoundingClientRect().top+scrollY);await new Promise(r=>setTimeout(r,1200));return 1})()`);
  await sleep(1500);
  fs.writeFileSync(path.join(OUT,"placeholder-before-load.png"), Buffer.from((await send("Page.captureScreenshot",{format:"png"})).result.data,"base64"));
  console.log("  mode: " + await ev("document.querySelector('#parent-app').dataset.mode") +
              "   placeholder present: " + await ev("!!document.querySelector('#parent-app img')"));
  ws.close(); ch.kill(); process.exit(0);
})();
