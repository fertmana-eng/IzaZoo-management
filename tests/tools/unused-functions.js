// Report (and with --write remove) JavaScript functions in index.html that nothing calls.
// Usage: node tests/tools/unused-functions.js index.html [--write]
// Functions listed in KEEP are kept on purpose (planned features).
const fs=require('fs'),acorn=require('acorn');
const file=process.argv[2],write=process.argv[3]==='--write';
let html=fs.readFileSync(file,'utf8');
// knowledge module (ידע ונהלים): closed for now but planned, keep its functions
const KEEP=new Set(['newKnowledge','createKnowledge','knowledgeCardHTML','openKnowledge','editKnowledge','saveKnowledge','archiveKnowledge','newKnowledgeCategory','createKnowledgeCategory','editKnowledgeCategory','saveKnowledgeCategory']);
const removed=[];
for(let round=1;round<10;round++){
  const open='<script src="vendor/supabase.js"></script>\n<script>';
  const a=html.indexOf(open)+open.length,b=html.indexOf('</script>',a);
  const code=html.slice(a,b);
  const ast=acorn.parse(code,{ecmaVersion:'latest',sourceType:'script'});
  const count=n=>(html.match(new RegExp('(?<![\\w$.])'+n.replace(/\$/g,'\\$')+'(?![\\w$])','g'))||[]).length;
  const dead=ast.body.filter(st=>st.type==='FunctionDeclaration'&&!KEEP.has(st.id.name)&&count(st.id.name)<=1);
  if(!dead.length)break;
  let out=code;
  for(const d of dead.sort((x,y)=>y.start-x.start)){let s=d.start,e=d.end;if(out[e]==='\n'&&(s===0||out[s-1]==='\n'))e++;out=out.slice(0,s)+out.slice(e);}
  removed.push(...dead.map(d=>d.id.name));
  html=html.slice(0,a)+out+html.slice(b);
  if(!write)break; // report-only: first round is enough
}
console.log(`unused functions: ${removed.length}${removed.length?' ('+removed.join(', ')+')':''}`);
if(write&&removed.length){for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))acorn.parse(m[1],{ecmaVersion:'latest',sourceType:'script'});fs.writeFileSync(file,html);console.log('removed; syntax OK');}
