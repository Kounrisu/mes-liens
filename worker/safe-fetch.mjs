import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [ip, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(ip,prefix);
export function publicIPv4(address) { return isIP(address) === 4 && !blocked.check(address) && !(process.env.BLOCKED_IPS ?? '').split(',').includes(address); }
export async function destination(raw, lookup = dns.lookup) {
  const u = new URL(raw);
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password || (u.port && !['80','443'].includes(u.port))) throw new Error('unsafe');
  if (u.hostname === 'localhost' || u.hostname.endsWith('.localhost') || u.hostname.endsWith('.local') || u.hostname === 'links.sn8w.com') throw new Error('unsafe');
  if (u.hostname.includes(':')) throw new Error('unsafe'); // fail closed for IPv6 / mapped IPv4
  const answers = isIP(u.hostname) ? [{address:u.hostname,family:4}] : await lookup(u.hostname,{family:4,all:true});
  if (!answers.length || answers.some(a=>!publicIPv4(a.address))) throw new Error('unsafe');
  return {url:u,address:answers[0].address};
}
/** Connect to the validated IP, preserving the hostname for TLS certificate checks. Never forward browser cookies or credentials. */
export async function safeFetch(raw, maxBytes = 2_000_000) {
  const {url,address} = await destination(raw);
  return new Promise((resolve,reject)=> {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {method:'GET',agent:false,
      lookup: (_host, opts, callback) => opts.all ? callback(null,[{address,family:4}]) : callback(null,address,4),
      headers:{'User-Agent':'MesLiens/1.0 (personal bookmark preview)','Accept':'text/html,image/*,text/css,application/javascript,*/*;q=0.5','Accept-Encoding':'identity'},
    },res=>{
      let length=0;const chunks=[];
      res.on('data',chunk=>{length+=chunk.length;if(length>maxBytes){req.destroy(new Error('response too large'));return;}chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>{const headers={}; for(const [k,v] of Object.entries(res.headers)) if(v !== undefined && !['set-cookie','connection','transfer-encoding','content-length'].includes(k)) headers[k]=Array.isArray(v)?v.join(', '):v;
        resolve({status:res.statusCode,headers,body:Buffer.concat(chunks)});});
    });
    const timer=setTimeout(()=>req.destroy(new Error('timeout')),12000);
    req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
  });
}
