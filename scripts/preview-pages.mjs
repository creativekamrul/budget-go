import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve('_site'),port=4173;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
http.createServer(async(request,response)=>{
 try{
  const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
  const relative=pathname.replace(/^\/budget-go(?:\/|$)/,'/');
  let file=path.resolve(root,`.${relative}`);
  if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(404).end();return;}
  if((await stat(file)).isDirectory())file=path.join(file,'index.html');
  response.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(await readFile(file));
 }catch{response.writeHead(404,{'Content-Type':'text/plain'}).end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Static Pages preview: http://127.0.0.1:${port}/budget-go/`));
