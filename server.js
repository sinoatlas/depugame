const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {WebSocketServer}=require('ws');
const {Rooms}=require('./multiplayer');
function createApp(options={}){
  const rooms=new Rooms(options),root=__dirname;
  const publicFiles=new Set(['/index.html','/app.js','/engine.js','/style.css']);
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
  const server=http.createServer((req,res)=>{
    if(req.url==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}');}
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
    if(pathname==='/')pathname='/index.html';if(!publicFiles.has(pathname)&&!/^\/assets\/[\w.-]+$/.test(pathname)){res.writeHead(404);return res.end('Not found');}
    const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(req.method==='HEAD'?undefined:data);});
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:8192});
  server.on('upgrade',(req,socket,head)=>{let valid=req.url==='/ws';if(req.headers.origin){try{valid&&=new URL(req.headers.origin).host===req.headers.host;}catch{valid=false;}}if(!valid){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');return socket.destroy();}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
  wss.on('connection',ws=>{ws.isAlive=true;ws.rateStart=Date.now();ws.rateCount=0;ws.on('pong',()=>ws.isAlive=true);ws.on('error',()=>{});ws.on('close',()=>rooms.disconnect(ws));ws.on('message',raw=>{
    if(Date.now()-ws.rateStart>1000){ws.rateStart=Date.now();ws.rateCount=0;}if(++ws.rateCount>20)return rooms.send(ws,{type:'error',message:'操作太频繁，请稍后再试'});
    try{rooms.message(ws,JSON.parse(raw.toString()));}catch(e){rooms.send(ws,{type:'error',message:e.message});}
  });});
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},30000);heartbeat.unref();
  function close(){clearInterval(heartbeat);rooms.close();for(const ws of wss.clients)ws.terminate();wss.close();return new Promise(resolve=>server.close(resolve));}
  return {server,wss,rooms,close};
}
if(require.main===module){const app=createApp();const port=Number(process.env.PORT)||5173;app.server.listen(port,'0.0.0.0',()=>console.log('六城奇牌联机服务已启动，端口 '+port));process.on('SIGTERM',()=>{app.close().then(()=>process.exit(0));});}
module.exports={createApp};
