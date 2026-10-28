const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(new URL('../template.html',`file://${__filename}`),'utf8');
const start=html.indexOf("const storeKey=");
const end=html.indexOf('const settings=',start);
const prefix=html.slice(start,end);
const persist=html.match(/function persist\(\)\{[^\n]+\}/)[0];

test('temporary source removal preserves user star and selection IDs across writes',()=>{
 const store=new Map([
  ['pumpkin-events-v2:/kansai-events/:selected',JSON.stringify(['visible','temporarily-absent'])],
  ['pumpkin-events-v2:/kansai-events/:stars',JSON.stringify(['temporarily-absent'])],
 ]);
 const context={location:{pathname:'/kansai-events/'},events:[{id:'visible'}],
  localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}};
 vm.runInNewContext(prefix+'\n'+persist+'\npersist();',context);
 assert.deepEqual(JSON.parse(store.get('pumpkin-events-v2:/kansai-events/:stars')),['temporarily-absent']);
 assert.deepEqual(JSON.parse(store.get('pumpkin-events-v2:/kansai-events/:selected')),['visible','temporarily-absent']);
 // Restoring the exported raw strings into independent storage retains choices.
 const recovered=new Map(JSON.parse(JSON.stringify([...store])));
 assert.equal(recovered.get('pumpkin-events-v2:/kansai-events/:stars'),store.get('pumpkin-events-v2:/kansai-events/:stars'));
});

test('invalid original storage is preserved when the user next changes a choice',()=>{
 for(const raw of ['{broken-json','null','{}','[42]']){
  const store=new Map([['pumpkin-events-v2:/kansai-events/:stars',raw]]);
  const notices=[];
  const context={location:{pathname:'/kansai-events/'},events:[{id:'visible'}],toast:x=>notices.push(x),
   localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}};
  vm.runInNewContext(prefix+'\n'+persist+'\nstars.add("visible");persist();',context);
  assert.equal(store.get('pumpkin-events-v2:/kansai-events/:stars'),raw);
  assert.equal(notices.length,1);
 }
});
