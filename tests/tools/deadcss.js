// Remove CSS selectors that need a class/id the app never uses.
// Usage: node tests/tools/deadcss.js index.html [--write]   (without --write it only reports)
// Remove CSS selectors that require a class or id which never appears in the app's code.
const fs=require('fs'),postcss=require('postcss'),sp=require('postcss-selector-parser');
const file=process.argv[2],write=process.argv[3]==='--write';
let html=fs.readFileSync(file,'utf8');
const styleRe=/<style>([\s\S]*?)<\/style>/g;
// class names the app builds at runtime (module-${active}, calendar-${x.type}, nav-${id})
const DYNAMIC=['problems','tasks','updates','docs','user','feedback','admin','home'].flatMap(n=>['module-'+n,'nav-'+n])
  .concat(['problem','task','update'].map(t=>'calendar-'+t));
const nonCss=html.replace(styleRe,'')+'\n'+DYNAMIC.join(' ');
const used=new Map();const isUsed=n=>{if(!used.has(n)){const re=new RegExp('(?<![\\w-])'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\w-])');used.set(n,re.test(nonCss));}return used.get(n);};
let removedSel=0,removedRules=0;const deadNames=new Set();
function deadSelector(sel){
  let dead=false;
  sp(root=>{root.walk(node=>{
    if(node.type!=='class'&&node.type!=='id')return;
    // ignore names inside :not()/:is()/:where()/:has() – they are not strictly required
    let p=node.parent;while(p){if(p.type==='pseudo'&&/^:(not|is|where|has|matches)$/i.test(p.value))return;p=p.parent;}
    if(!isUsed(node.value)){dead=true;deadNames.add((node.type==='class'?'.':'#')+node.value);}
  });}).processSync(sel);
  return dead;
}
let out=html.replace(styleRe,(m,css)=>{
  const root=postcss.parse(css);
  root.walkRules(rule=>{
    if(rule.parent&&rule.parent.type==='atrule'&&/keyframes/i.test(rule.parent.name))return;
    const sels=rule.selectors;const keep=sels.filter(s=>!deadSelector(s));
    if(keep.length===sels.length)return;
    removedSel+=sels.length-keep.length;
    if(!keep.length){rule.remove();removedRules++;}
    else rule.selector=keep.join(',');
  });
  root.walkAtRules(at=>{if(at.nodes&&at.nodes.length===0)at.remove();});
  return '<style>'+root.toString()+'</style>';
});
console.log(`dead selectors: ${removedSel}, whole rules removed: ${removedRules}`);
console.log('never-used names:',[...deadNames].sort().join(' '));
if(write){fs.writeFileSync(file,out);console.log('bytes',html.length,'->',out.length);}
