const { spawn } = require("child_process"); const http = require("http");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2]; const ARGS = process.argv.slice(3);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = u => new Promise((res, rej) => http.get(u, r => { let d=""; r.on("data",c=>d+=c); r.on("end",()=>res(JSON.parse(d))); }).on("error", rej));
(async () => {
  const flags = ["--headless=new","--no-sandbox","--hide-scrollbars","--remote-debugging-port=9733","--user-data-dir="+P,"--window-size=1440,900"];
  if (ARGS.includes("--swiftshader-off")) flags.push("--use-gl=angle","--use-angle=swiftshader-webgl");
  const ch = spawn(CHROME, flags.concat(["about:blank"]), { stdio: "ignore" });
  let t=null; for(let i=0;i<40&&!t;i++){await sleep(500);try{t=(await get("http://127.0.0.1:9733/json/list")).find(x=>x.type==="page");}catch{}}
  const WebSocket=require("ws"); const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:2**28});
  await new Promise(r=>ws.on("open",r));
  let id=0; const pend=new Map();
  ws.on("message",m=>{const x=JSON.parse(m.toString());if(x.id&&pend.has(x.id)){pend.get(x.id)(x);pend.delete(x.id);}});
  const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  const ev=async e=>(await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true})).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable");
  /* Network domain ON only long enough to clear the cache, then OFF. With it
     enabled Chrome buffers every response body for getResponseBody and pushes
     it over the DevTools pipe, which turned an 8 MB fetch that curl does in
     0.22s into 13.7s ON A BLANK PAGE. The instrument was the bottleneck. */
  await send("Network.enable"); await send("Network.clearBrowserCache");
  if (!ARGS.includes("--netoff")) { await send("Network.setCacheDisabled",{cacheDisabled:true}); }
  else { await send("Network.disable"); }
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});

  console.log("\n  A. blank page, nothing else running");
  await send("Page.navigate",{url:"http://localhost:3100/blank-probe"}); await sleep(2500);
  console.log("     plain fetch of the GLB: " + await ev(`(async()=>{const t=performance.now();const r=await fetch('/models/iphone_16_saferide_max.glb');const b=await r.arrayBuffer();return (b.byteLength/1048576).toFixed(2)+' MB in '+(performance.now()-t).toFixed(0)+' ms'})()`));

  console.log("\n  B. the real page, hero playing, before scrolling");
  await send("Page.navigate",{url:"http://localhost:3100/"}); await sleep(7000);
  console.log("     plain fetch of the GLB: " + await ev(`(async()=>{const t=performance.now();const r=await fetch('/models/iphone_16_saferide_max.glb');const b=await r.arrayBuffer();return (b.byteLength/1048576).toFixed(2)+' MB in '+(performance.now()-t).toFixed(0)+' ms'})()`));
  console.log("     videos on the page: " + await ev(`[...document.querySelectorAll('video')].map(v=>(v.currentSrc||'(none)').split('/').pop()+' paused='+v.paused).join('  |  ')`));

  console.log("\n  C. same page, hero videos paused first");
  await ev(`document.querySelectorAll('video').forEach(v=>{v.pause();v.removeAttribute('src');v.load()});1`);
  await sleep(1500);
  console.log("     plain fetch of the GLB: " + await ev(`(async()=>{const t=performance.now();const r=await fetch('/models/iphone_16_saferide_max.glb');const b=await r.arrayBuffer();return (b.byteLength/1048576).toFixed(2)+' MB in '+(performance.now()-t).toFixed(0)+' ms'})()`));
  console.log("");
  ws.close(); ch.kill(); process.exit(0);
})();
