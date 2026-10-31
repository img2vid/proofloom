export function validateEndpoint(value){
  let url;try{url=new URL(value);}catch{throw new Error('Enter a full LanguageTool-compatible URL ending in /v2/check.');}
  if(url.protocol!=='https:' && !(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Use HTTPS, or HTTP on localhost for a local server.');
  if(url.username||url.password||url.search||url.hash)throw new Error('The endpoint must not contain credentials, a query string, or a fragment.');
  if(!url.pathname.endsWith('/v2/check'))throw new Error('The endpoint must end in /v2/check.');
  if(url.hostname==='api.languagetool.org')throw new Error('The public LanguageTool endpoint does not allow automated app traffic. Use your own LanguageTool server or a licensed proxy.');
  return url.href;
}

export async function remoteCheck(text,{endpoint,language='en-US',signal}={}){
  endpoint=validateEndpoint(endpoint);
  if(text.length>18000)throw new Error('Connected checks support 18,000 characters per request. Select a shorter chapter or section. Local checking supports larger documents.');
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({text,language}),signal:signal||AbortSignal.timeout(30000),credentials:'omit'});
  if(!response.ok)throw new Error(`The grammar server returned HTTP ${response.status}.`);
  const data=await response.json();if(!Array.isArray(data.matches))throw new Error('The server did not return a LanguageTool-compatible response.');
  return data.matches.slice(0,1000).filter(m=>Number.isInteger(m.offset)&&m.offset>=0&&Number.isInteger(m.length)&&m.length>=0&&m.offset+m.length<=text.length).map((m,n)=>({id:`remote:${n}:${m.offset}`,ruleId:`remote:${m.rule?.id||n}`,start:m.offset,end:m.offset+m.length,original:text.slice(m.offset,m.offset+m.length),replacements:(m.replacements||[]).filter(r=>typeof r.value==='string').slice(0,5).map(r=>r.value),message:String(m.message||'Connected grammar suggestion'),category:/misspelling|typographical/.test(m.rule?.issueType||'')?'spelling':/style|register/.test(m.rule?.issueType||'')?'style':/punctuation/i.test(m.rule?.category?.id||'')?'punctuation':'grammar',confidence:.9,safe:false,source:'Connected LanguageTool server'}));
}
