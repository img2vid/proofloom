import JSZip from 'jszip';
import {documentAdapters} from './extensions.js';
import {createId} from './id.js';

export const MAX_FILE_BYTES=80*1024*1024;
export const MAX_TEXT_LENGTH=2_000_000;
const MAX_EXPANDED=100*1024*1024;
const utf8=new TextEncoder();
export const escapeXML=s=>String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g,'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const xml=(s)=>{const d=new DOMParser().parseFromString(s,'application/xml');if(d.querySelector('parsererror'))throw new Error('The document contains invalid XML.');return d;};
const elements=(doc,name)=>[...doc.getElementsByTagNameNS('*',name)];
const normalizePath=(base,path)=>{
  const parts=(base+path).split('/'),out=[];
  for(const p of parts){if(p==='..')out.pop();else if(p&&p!=='.')out.push(p);}
  return out.join('/');
};

export function htmlToText(html){
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('script,style,noscript,iframe,object,svg,canvas').forEach(n=>n.remove());
  doc.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));
  doc.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,blockquote,tr,section,article,pre').forEach(n=>n.append('\n\n'));
  return (doc.body.textContent||'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

export async function safeZip(data){
  const zip=await JSZip.loadAsync(data);
  const entries=Object.values(zip.files);
  if(entries.length>6000)throw new Error('Archive contains too many entries.');
  let total=0;
  for(const entry of entries){total+=entry._data?.uncompressedSize||0;if(total>MAX_EXPANDED)throw new Error('Expanded archive exceeds the 100 MB limit.');}
  return zip;
}
async function entryText(zip,name){const file=zip.file(name);if(!file)throw new Error(`Missing document part: ${name}`);return file.async('string');}

export function parseRtf(rtf){
  // Text extraction with destination-group suppression and Unicode escape support.
  let out='',skip=false,uc=1,stack=[],fallback=0;
  for(let i=0;i<rtf.length;i++){
    const c=rtf[i];
    if(c==='{'){stack.push({skip,uc});continue;}
    if(c==='}'){({skip,uc}=stack.pop()||{skip:false,uc:1});continue;}
    if(c==='\\'){
      const next=rtf[i+1];
      if(next==='*'){skip=true;i++;continue;}
      if(['\\','{','}'].includes(next)){if(!skip&&!fallback)out+=next;else if(fallback)fallback--;i++;continue;}
      if(next==="'"){
        if(!skip&&!fallback){const byte=parseInt(rtf.slice(i+2,i+4),16);if(Number.isFinite(byte))out+=new TextDecoder('windows-1252').decode(Uint8Array.of(byte));}
        else if(fallback)fallback--;
        i+=3;continue;
      }
      const m=rtf.slice(i+1).match(/^([a-z]+)(-?\d+)? ?/i);
      if(m){
        const name=m[1],n=Number(m[2]);i+=m[0].length;
        if(['fonttbl','colortbl','stylesheet','info','pict','object','header','footer','fldinst','datastore','xmlopen','xmlclose'].includes(name))skip=true;
        if(name==='uc')uc=n;
        if(!skip){if(name==='u'){out+=String.fromCharCode(n<0?n+65536:n);fallback=uc;}else if(['par','line'].includes(name))out+='\n';else if(name==='tab')out+='\t';else if(name==='emdash')out+='—';else if(name==='endash')out+='–';}
      }else{i++;if(next==='~'&&!skip)out+=' ';}
    }else if(!skip&&c!=='\n'&&c!=='\r'){if(fallback)fallback--;else out+=c;}
  }
  return out.trim();
}

export async function recognizeImage(source,progress=()=>{}){
  const tesseract=await import('tesseract.js');
  const {createWorker}=tesseract.default||tesseract;
  const worker=await createWorker('eng',1,{
    workerPath:new URL('./vendor/ocr/worker.min.js',import.meta.url).href,
    corePath:new URL('./vendor/ocr/core/',import.meta.url).href,
    langPath:new URL('./vendor/ocr/lang/',import.meta.url).href,
    logger:m=>progress(m.status,Math.round((m.progress||0)*100))
  });
  try {const result=await worker.recognize(source);return {text:result.data.text,confidence:result.data.confidence};}
  finally{await worker.terminate();}
}

export async function importDocument(file,{ocr=false,progress=()=>{}}={}){
  if(file.size>MAX_FILE_BYTES)throw new Error('This file exceeds the 80 MB import limit. Split it into smaller files.');
  const ext=file.name.split('.').pop().toLowerCase();
  let chapters=[],title=file.name.replace(/\.[^.]+$/,''),note='',isOcr=false;
  if(['txt','md','markdown','text','srt','vtt','log'].includes(ext))chapters=[{title:'Text',text:await file.text()}];
  else if(['html','htm','xhtml'].includes(ext))chapters=[{title:'Text',text:htmlToText(await file.text())}];
  else if(ext==='rtf'){chapters=[{title:'Text',text:parseRtf(await file.text())}];note='RTF text extracted. Original formatting is not retained.';}
  else if(ext==='docx'){
    const buffer=await file.arrayBuffer();await safeZip(buffer);
    const mammoth=await import('mammoth/mammoth.browser.js');
    const result=await (mammoth.default||mammoth).extractRawText({arrayBuffer:buffer});
    chapters=[{title:'Document',text:result.value}];note='Word text imported. Export creates a new document without the source layout.';
  }else if(ext==='odt'){
    const zip=await safeZip(await file.arrayBuffer());const doc=xml(await entryText(zip,'content.xml'));
    const paragraphs=[...doc.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0','p')];
    chapters=[{title:'Document',text:paragraphs.map(p=>p.textContent).join('\n\n')}];note='OpenDocument text extracted; original layout is not retained.';
  }else if(ext==='epub'){
    const zip=await safeZip(await file.arrayBuffer());
    const container=xml(await entryText(zip,'META-INF/container.xml'));
    const root=elements(container,'rootfile')[0]?.getAttribute('full-path');if(!root)throw new Error('The EPUB has no package document.');
    const opf=xml(await entryText(zip,root));
    const manifest=new Map(elements(opf,'item').map(n=>[n.getAttribute('id'),n]));
    title=elements(opf,'title')[0]?.textContent||title;
    const base=root.includes('/')?root.slice(0,root.lastIndexOf('/')+1):'';
    for(const ref of elements(opf,'itemref')){
      const item=manifest.get(ref.getAttribute('idref'));if(!item)continue;
      if(!/html/.test(item.getAttribute('media-type')||''))continue;
      const path=normalizePath(base,decodeURIComponent(item.getAttribute('href').split('#')[0]));
      const content=await entryText(zip,path);
      const doc=new DOMParser().parseFromString(content,'text/html');
      const chapterTitle=doc.querySelector('h1,h2,title')?.textContent?.trim()||`Chapter ${chapters.length+1}`;
      const text=htmlToText(content);if(text)chapters.push({title:chapterTitle,text});
      if(chapters.length>3000)throw new Error('EPUB exceeds the 3,000 chapter limit.');
    }
    note='EPUB spine order retained. Export creates a text-only reflowable ebook; illustrations and source formatting are not retained.';
  }else if(ext==='fb2'){
    const doc=xml(await file.text());title=elements(doc,'book-title')[0]?.textContent||title;
    const body=elements(doc,'body')[0];if(!body)throw new Error('No FictionBook body found.');
    const sections=[...body.children].filter(n=>n.localName==='section');
    chapters=(sections.length?sections:[body]).map((n,i)=>({title:elements(n,'title')[0]?.textContent||`Chapter ${i+1}`,text:elements(n,'p').map(p=>p.textContent).join('\n\n')}));
    note='FictionBook text imported. Images and original formatting are not retained.';
  }else if(ext==='pdf'){
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf/pdf.worker.min.mjs',import.meta.url).href;
    const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:new URL('./vendor/pdf/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdf/standard_fonts/',import.meta.url).href,isEvalSupported:false});
    let pdf;
    try{
      pdf=await task.promise;if(pdf.numPages>500)throw new Error('Import up to 500 PDF pages at a time. Split larger books first.');
      for(let n=1;n<=pdf.numPages;n++){
        progress(`Reading PDF page ${n} of ${pdf.numPages}`,Math.round(n/pdf.numPages*100));
        const page=await pdf.getPage(n),content=await page.getTextContent();
        let text=content.items.map(i=>(i.str||'')+(i.hasEOL?'\n':' ')).join('').replace(/ +\n/g,'\n').trim();
        if(text.length<10&&ocr){
          const view=page.getViewport({scale:Math.min(2,2000/page.getViewport({scale:1}).width)}),canvas=document.createElement('canvas');canvas.width=view.width;canvas.height=view.height;
          await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
          const result=await recognizeImage(canvas,(s,p)=>progress(`Page ${n}: ${s}`,p));text=result.text;isOcr=true;
        }
        chapters.push({title:`Page ${n}`,text});page.cleanup();
      }
    } finally{await pdf?.destroy();}
    if(!chapters.some(c=>c.text.trim()))throw new Error('This PDF has no extractable text. Enable “Recognize scanned pages” and import it again.');
    note='PDF pages imported as editable text. Reading order may need review; original layout is not retained.';
  }else if(file.type.startsWith('image/')||['png','jpg','jpeg','webp','bmp','tif','tiff'].includes(ext)){
    const result=await recognizeImage(file,progress);chapters=[{title:'Recognized text',text:result.text}];isOcr=true;
    note=`Local OCR completed. Estimated recognition confidence: ${Math.round(result.confidence)}%. Review against the original image.`;
  }else {
    const adapter=documentAdapters().find(a=>a.extensions?.includes(ext));
    if(!adapter)throw new Error('Unsupported document type. Import TXT, Markdown, HTML, DOCX, ODT, RTF, EPUB, FB2, PDF, subtitles, or an image. Binary DOC, MOBI, AZW and DRM-protected files need conversion first.');
    const result=await adapter.read(file,{ocr,progress});chapters=result.chapters;title=result.title||title;note=result.note||'';
  }
  if(!chapters.length)throw new Error('No readable text was found. Encrypted or DRM-protected books need an unlocked, supported copy.');
  if(chapters.reduce((n,c)=>n+c.text.length,0)>MAX_TEXT_LENGTH)throw new Error('Extracted text exceeds the two-million-character workspace limit. Split the document into volumes.');
  return {id:createId(),title,chapters,activeChapter:0,source:file.name,sourceType:ext,importNote:note,ocr:isOcr,updatedAt:Date.now(),createdAt:Date.now(),snapshots:[]};
}

export async function exportDocument(doc,format){
  const title=doc.title||'Untitled document';const text=doc.chapters.map(c=>c.text).join('\n\n');
  if(format==='txt'||format==='md')return new Blob([text],{type:'text/plain;charset=utf-8'});
  if(format==='html')return new Blob([`<!doctype html><html lang="${escapeXML(doc.language||'en')}"><meta charset="utf-8"><title>${escapeXML(title)}</title><style>body{font:18px/1.8 Georgia,serif;max-width:760px;margin:60px auto;padding:20px;color:#202b29}p{white-space:pre-wrap}h1{line-height:1.2}</style><body><h1>${escapeXML(title)}</h1>${doc.chapters.map(c=>`<section><h2>${escapeXML(c.title)}</h2>${c.text.split(/\n\n+/).map(p=>`<p>${escapeXML(p)}</p>`).join('')}</section>`).join('')}</body></html>`],{type:'text/html'});
  const zip=new JSZip();
  if(format==='docx'){
    zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    const paragraph=(p,bold=false)=>`<w:p><w:r>${bold?'<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>':''}<w:t xml:space="preserve">${escapeXML(p)}</w:t></w:r></w:p>`;
    zip.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph(title,true)}${doc.chapters.map(c=>(doc.chapters.length>1?paragraph(c.title,true):'')+c.text.split('\n').map(p=>paragraph(p)).join('')).join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  }else if(format==='epub'){
    const id=`urn:uuid:${createId()}`,lang=escapeXML(doc.language||'en');
    zip.file('mimetype','application/epub+zip',{compression:'STORE'});
    zip.file('META-INF/container.xml','<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    zip.file('EPUB/package.opf',`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${id}</dc:identifier><dc:title>${escapeXML(title)}</dc:title><dc:language>${lang}</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/,'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${doc.chapters.map((_,i)=>`<item id="c${i}" href="chapter-${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${doc.chapters.map((_,i)=>`<itemref idref="c${i}"/>`).join('')}</spine></package>`);
    const page=(body,t)=>`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}"><head><title>${escapeXML(t)}</title><meta charset="utf-8"/></head><body>${body}</body></html>`;
    zip.file('EPUB/nav.xhtml',page(`<nav epub:type="toc"><h1>Contents</h1><ol>${doc.chapters.map((c,i)=>`<li><a href="chapter-${i}.xhtml">${escapeXML(c.title)}</a></li>`).join('')}</ol></nav>`,title));
    doc.chapters.forEach((c,i)=>zip.file(`EPUB/chapter-${i}.xhtml`,page(`<h1>${escapeXML(c.title)}</h1>${c.text.split(/\n\n+/).map(p=>`<p>${escapeXML(p).replace(/\n/g,'<br/>')}</p>`).join('')}`,c.title)));
  }else throw new Error('Unknown export format.');
  return zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:format==='epub'?'application/epub+zip':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}

export function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;
  // A modal makes the rest of the document inert. Keep the download control in
  // the active dialog so browsers do not discard its synthetic activation.
  (document.querySelector('dialog[open]')||document.body).append(a);
  a.click();setTimeout(()=>a.remove(),0);setTimeout(()=>URL.revokeObjectURL(url),60000);
}
