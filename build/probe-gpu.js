/** Which renderer is actually behind the canvas? Decides whether the PMREM
 *  and first-render costs are real or a software-rasteriser artifact. */
const { spawn } = require("child_process"); const http = require("http");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const P = process.argv[2]; const EXTRA = process.argv.slice(3);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = u => new Promise((res, rej) => http.get(u, r => { let d=""; r.on("data",c=>d+=c); r.on("end",()=>res(JSON.parse(d))); }).on("error", rej));
(async () => {
  const ch = spawn(CHROME, ["--headless=new","--no-sandbox","--remote-debugging-port=9791","--user-data-dir="+P,"--window-size=1440,900",...EXTRA,"about:blank"], { stdio: "ignore" });
  let t=null; for(let i=0;i<40&&!t;i++){await sleep(500);try{t=(await get("http://127.0.0.1:9791/json/list")).find(x=>x.type==="page");}catch{}}
  const WebSocket=require("ws"); const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:2**28});
  await new Promise(r=>ws.on("open",r));
  let id=0; const pend=new Map();
  ws.on("message",m=>{const x=JSON.parse(m.toString());if(x.id&&pend.has(x.id)){pend.get(x.id)(x);pend.delete(x.id);}});
  const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  const ev=async e=>(await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true})).result?.result?.value;
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate",{url:"http://localhost:3100/"}); await sleep(4000);
  console.log("  flags: " + (EXTRA.join(" ") || "(default headless)"));
  console.log("  " + await ev(`(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'no webgl';
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return 'renderer: ' + (d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  })()`));
  ws.close(); ch.kill(); process.exit(0);
})();
