import {test} from 'node:test';
import assert from 'node:assert/strict';
import {destination,publicIPv4} from './safe-fetch.mjs';
test('rejects local, private, metadata, multicast, IPv6 and credentials', async()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.1.1','192.168.0.1','100.64.0.1','224.0.0.1','0.0.0.0','198.18.0.1','::1']) assert.equal(publicIPv4(ip),false);
  for(const url of ['http://127.1','http://2130706433','http://[::1]','http://[::ffff:127.0.0.1]','file:///etc/passwd','http://user:pass@example.com','http://example.com:8080','https://links.sn8w.com']) await assert.rejects(destination(url));
});
test('validates every DNS answer and returns a pinned address',async()=>{
  await assert.rejects(destination('https://example.com',async()=>[{address:'1.1.1.1'},{address:'10.0.0.1'}]));
  const d=await destination('https://example.com',async()=>[{address:'1.1.1.1',family:4}]);
  assert.equal(d.address,'1.1.1.1');assert.equal(d.url.hostname,'example.com');
});
