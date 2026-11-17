// Remove CSS settings always overridden by a later identical rule.
// Usage: node tests/tools/overridden.js index.html [--write]   (without --write it only reports)
// Remove declarations that a later rule with the identical selector, in the same
// @media/@supports context, always overrides (same property, importance >= earlier).
const fs=require('fs'),postcss=require('postcss');
const file=process.argv[2],write=process.argv[3]==='--write';
const html=fs.readFileSync(file,'utf8');
const styleRe=/<style>([\s\S]*?)<\/style>/g;
// parse all style blocks, keeping document order
const blocks=[];let m;while((m=styleRe.exec(html)))blocks.push({start:m.index,full:m[0],root:postcss.parse(m[1])});
const norm=s=>s.replace(/\s+/g,' ').replace(/\s*([>+~,])\s*/g,'$1').trim();
const ctx=n=>{const parts=[];let p=n.parent;while(p&&p.type!=='root'){if(p.type==='atrule')parts.unshift('@'+p.name+' '+norm(p.params));p=p.parent;}return parts.join(' | ');};
// values that some browsers may not support: the earlier value is then a real fallback
const RISKY=/dvh|svh|lvh|dvw|svw|lvw|env\(|-webkit-|-moz-|color-mix|:has|min\(|max\(|clamp\(|@container|cq[whib]/i;
// collect all declarations in order
const decls=[];
for(const b of blocks){b.root.walkDecls(d=>{
  const r=d.parent;if(r.type!=='rule')return; // only plain rules
  if(r.parent&&r.parent.type==='atrule'&&/keyframes/i.test(r.parent.name))return;
  decls.push({d,rule:r,sels:r.selectors.map(norm),ctx:ctx(r),prop:d.prop.toLowerCase(),imp:!!d.important,risky:RISKY.test(d.value)});
});}
// index: key = ctx||selector||prop -> list of positions
const idx=new Map();decls.forEach((x,i)=>{for(const s of x.sels){const k=x.ctx+'||'+s+'||'+x.prop;(idx.get(k)||idx.set(k,[]).get(k)).push(i);}});
let removed=0;const dead=[];
decls.forEach((x,i)=>{
  const allOverridden=x.sels.every(s=>{
    const list=idx.get(x.ctx+'||'+s+'||'+x.prop);
    return list.some(j=>j>i&&decls[j].rule!==x.rule&&(decls[j].imp||!x.imp)&&!decls[j].risky);
  });
  if(allOverridden)dead.push(x);
});
for(const x of dead){x.d.remove();removed++;}
let rulesRemoved=0;
for(const b of blocks){b.root.walkRules(r=>{if(r.nodes&&r.nodes.length===0){r.remove();rulesRemoved++;}});b.root.walkAtRules(a=>{if(a.nodes&&a.nodes.length===0)a.remove();});}
console.log(`overridden declarations: ${removed}, rules left empty and removed: ${rulesRemoved}`);
if(write){let out=html,shift=0;for(const b of blocks){const nu='<style>'+b.root.toString()+'</style>';out=out.slice(0,b.start+shift)+nu+out.slice(b.start+shift+b.full.length);shift+=nu.length-b.full.length;}
  fs.writeFileSync(file,out);console.log('bytes',html.length,'->',out.length);}
