/** Read the SHIPPED tuning off the running production page, with no query
 *  overrides — the built output, not the source. */
const { spawn } = require("child_process"); const http = require("http");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2], URL = process.argv[3] || "http://localhost:3100/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = u => new Promise((res, rej) => http.get(u, r => { let d=""; r.on("data",c=>d+=c); r.on("end",()=>res(JSON.parse(d))); }).on("error", rej));
(async () => {
  const ch = spawn(CHROME, ["--headless=new","--no-sandbox","--hide-scrollbars","--remote-debugging-port=9807","--user-data-dir="+P,"--window-size=1440,900","about:blank"], { stdio: "ignore" });
  let t=null; for(let i=0;i<40&&!t;i++){await sleep(500);try{t=(await get("http://127.0.0.1:9807/json/list")).find(x=>x.type==="page");}catch{}}
  const WebSocket=require("ws"); const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:2**28});
  await new Promise(r=>ws.on("open",r));
  let id=0; const pend=new Map();
  ws.on("message",m=>{const x=JSON.parse(m.toString());if(x.id&&pend.has(x.id)){pend.get(x.id)(x);pend.delete(x.id);}});
  const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  const ev=async e=>(await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true})).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:URL}); await sleep(7000);
  const top = await ev(`(()=>{const rw=document.querySelector('#parent-app [data-tour-runway]');return Math.round(rw.getBoundingClientRect().top+scrollY);})()`);
  await ev(`(async()=>{scrollTo(0,${top});await new Promise(r=>setTimeout(r,800));return 1})()`);
  for(let i=0;i<60;i++){ if(await ev("!!window.__phoneTour")) break; await sleep(500); }
  await sleep(600);
  const d = JSON.parse(await ev("JSON.stringify(window.__phoneTour.debug())"));
  console.log("  URL:            " + URL);
  console.log("  knee:           " + d.tuning.knee);
  console.log("  crossFraction:  " + d.tuning.crossFraction);
  console.log("  restFraction:   " + d.tuning.restFraction);
  console.log("  crossStart/End: " + d.tuning.crossStart + " -> " + d.tuning.crossEnd);
  console.log("  phoneHeightPx:  " + Math.round(d.phoneHeightPx) + "px   (downsample " + (2314/d.phoneHeightPx).toFixed(2) + "x)");
  ws.close(); ch.kill(); process.exit(0);
})();
