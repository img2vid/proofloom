export const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 pen:'M16 3l5 5M4 20l4-1L21 6a2 2 0 0 0-5-3L3 16l-1 6z',
 folder:'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
 scan:'M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M7 8h10M7 12h10M7 16h7',
 book:'M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1m0-15c3-2 6-2 10-1v15c-4-1-7-1-10 1zm0 0v15',
 puzzle:'M8 3h3a3 3 0 1 0 5 0h4v6a3 3 0 1 1 0 5v6h-6a3 3 0 1 0-5 0H3v-6a3 3 0 1 0 0-5V3z',
 sliders:'M4 6h4m4 0h8M4 12h10m4 0h2M4 18h2m4 0h10M8 3v6m6 0v6M6 15v6',
 shield:'M12 2l8 4v6c0 5-5 8-8 10-3-2-8-5-8-10V6zM8 12l3 3 5-6',
 plus:'M12 5v14M5 12h14',help:'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
 file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6M8 13h8M8 17h6',
 search:'M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16m6-2 6 6',menu:'M4 6h16M4 12h16M4 18h16',
 upload:'M12 16V3m-5 5 5-5 5 5M3 16v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4',
 download:'M12 3v13m-5-5 5 5 5-5M3 16v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4',
 globe:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M2 12h20M12 2c-5 5-5 15 0 20m0-20c5 5 5 15 0 20',
 undo:'M3 10h10a7 7 0 0 1 0 14M3 10l5-5M3 10l5 5',redo:'M21 10H11a7 7 0 0 0 0 14m10-14-5-5m5 5-5 5',
 focus:'M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6',more:'M5 12h.01M12 12h.01M19 12h.01',
 sparkle:'M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3zM20 2v4m-2-2h4',
 check:'M5 12l4 4L19 6',arrow:'M4 12h16m-5-5 5 5-5 5',clock:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2',
 close:'M6 6l12 12M6 18 18 6',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
 copy:'M8 8h13v13H8zM16 8V3H3v13h5',history:'M3 12a9 9 0 1 0 3-7L2 9m0-5v5h5M12 7v5l3 2',
 chart:'M4 20V10m8 10V4m8 16v-7M2 22h20',code:'M8 6l-6 6 6 6m8-12 6 6-6 6m-3-15-2 18',
 lock:'M6 11h12v11H6zM8 11V7a4 4 0 0 1 8 0v4',info:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 11v6m0-10h.01',
 terminal:'M4 5l6 7-6 7M13 19h7',image:'M3 3h18v18H3zM3 17l6-6 5 5 3-3 4 4M8 7h.01',
 refresh:'M21 9a9 9 0 0 0-16-4L2 9m0-6v6h6m-5 6a9 9 0 0 0 16 4l3-4m0 6v-6h-6',
 chevron:'M9 5l7 7-7 7',feather:'M20 4c-8-8-18 6-12 12l12-12M4 20l10-10M8 16h5m-1-4v-3',
 cloud:'M6 19a5 5 0 0 1-1-10 7 7 0 0 1 13-3 6 6 0 1 1 1 13z',
 type:'M3 5h18M12 5v16M8 21h8',external:'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7'
};
export function icon(name,extra=''){return `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.file}"/></svg>`;}
export function hydrateIcons(root=document){root.querySelectorAll('[data-icon]').forEach(n=>n.innerHTML=icon(n.dataset.icon));}
export function relativeDate(timestamp){const d=new Date(timestamp);return d.toDateString()===new Date().toDateString()?'Today':new Intl.DateTimeFormat('en',{month:'short',day:'numeric'}).format(d);}
export function heading(title,description,eyebrow='YOUR WRITING WORKSPACE',actions=''){return `<div class="page-heading"><div><div class="eyebrow">${e(eyebrow)}</div><h1>${e(title)}</h1><p>${e(description)}</p></div>${actions?`<div class="heading-actions">${actions}</div>`:''}</div>`;}
export const btn=(label,action,ic='',primary=false,extra='')=>`<button class="btn ${primary?'btn-primary':''}" data-action="${action}" ${extra}>${ic?icon(ic):''}${e(label)}</button>`;
