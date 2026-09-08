const { spawn } = require("child_process"); const http=require("http");
const CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe";
const P=process.argv[2]; const EXTRA=process.argv.slice(3);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const get=u=>new Promise((res,rej)=>http.get(u,r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)));}).on("error",rej));
(async()=>{
  const ch=spawn(CHROME,["--headless=new","--no-sandbox","--hide-scrollbars","--remote-debugging-port=9821","--user-data-dir="+P,"--window-size=1440,900",...EXTRA,"about:blank"],{stdio:"ignore"});
  let t=null; for(let i=0;i<40&&!t;i++){await sleep(500);try{t=(await get("http://127.0.0.1:9821/json/list")).find(x=>x.type==="page");}catch{}}
  const WebSocket=require("ws"); const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:2**28});
  await new Promise(r=>ws.on("open",r));
  let id=0; const pend=new Map();
  ws.on("message",m=>{const x=JSON.parse(m.toString());if(x.id&&pend.has(x.id)){pend.get(x.id)(x);pend.delete(x.id);}});
  const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  const ev=async e=>(await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true})).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument",{source:`
    window.__ls={present:null,gone:null};
    (function poll(){
      const el=document.querySelector('[data-load-screen]');
      if(el&&window.__ls.present===null) window.__ls.present=+performance.now().toFixed(1);
      if(!el&&window.__ls.present!==null&&window.__ls.gone===null){ window.__ls.gone=+performance.now().toFixed(1); return; }
      if(performance.now()<30000) setTimeout(poll,40);
    })();
  `});
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:"http://localhost:3100/"}); await sleep(9000);
  console.log("  flags: "+(EXTRA.join(" ")||"(autoplay blocked by default)"));
  console.log("  " + await ev("JSON.stringify(window.__ls)") + "   heroPlaying=" + await ev("document.documentElement.hasAttribute('data-hero-playing')"));
  ws.close(); ch.kill(); process.exit(0);
})();
