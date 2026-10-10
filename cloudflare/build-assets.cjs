const fs=require('node:fs');
const path=require('node:path');
fs.mkdirSync('public/assets',{recursive:true});
for(const name of ['index.html','app.js','engine.js','style.css']) fs.copyFileSync(name,path.join('public',name));
for(const name of fs.readdirSync('assets')) if(/\.(js|json|png|webp|jpg|svg)$/.test(name)) fs.copyFileSync(path.join('assets',name),path.join('public/assets',name));
