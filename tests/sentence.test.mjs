import test from 'node:test';
import assert from 'node:assert/strict';
import {sentenceContext} from '../src/core/sentence.js';

const issueAt=(text,needle,from=0)=>{const start=text.indexOf(needle,from);if(start<0)throw new Error('needle not found');return {id:'t',start,end:start+needle.length,original:needle,replacements:['X1','X2']};};

test('sentence context returns the containing sentence and its correction',()=>{
  const text='The sky was pale. She recieved the letter yesterday. Nobody spoke.';
  const c=sentenceContext(text,issueAt(text,'recieved'),'received');
  assert.equal(c.sentence,'She recieved the letter yesterday.');
  assert.equal(c.corrected,'She received the letter yesterday.');
  assert.deepEqual([c.from,c.to],[4,12]);
  assert.equal(c.replaced,'received');
  assert.ok(!c.startClipped&&!c.endClipped);
});

test('each alternative replacement produces its own corrected sentence',()=>{
  const text='She recieved the letter.';
  const issue=issueAt(text,'recieved');
  assert.equal(sentenceContext(text,issue,'X1').corrected,'She X1 the letter.');
  assert.equal(sentenceContext(text,issue,'X2').corrected,'She X2 the letter.');
});

test('the flagged range is marked inside the example sentence',()=>{
  const text='A calm morning. The b00k lay open. Birds started up.';
  const c=sentenceContext(text,issueAt(text,'b00k'),'book');
  assert.equal(c.sentence.slice(c.from,c.to),'b00k');
  assert.equal(c.corrected.slice(c.from,c.from+'book'.length),'book');
  assert.equal(c.corrected.slice(c.from,c.from+'book'.length+1),'book ');
});

test('without a replacement only the example sentence is provided',()=>{
  const text='He don’t know the answer. She does.';
  const c=sentenceContext(text,{...issueAt(text,'don’t'),replacements:[]},null);
  assert.equal(c.sentence,'He don’t know the answer.');
  assert.equal(c.corrected,null);
});

test('the first replacement is the default choice',()=>{
  const text='She recieved the letter.';
  const c=sentenceContext(text,issueAt(text,'recieved'));
  assert.equal(c.corrected,'She X1 the letter.');
});

test('line breaks and headings start their own sentence',()=>{
  const text='# Chapter One\n\nShe have a book.\n\n- a list item';
  const c=sentenceContext(text,issueAt(text,'have'),'has');
  assert.equal(c.sentence,'She have a book.');
  assert.equal(c.corrected,'She has a book.');
});

test('CJK sentences break after 。 without trailing whitespace',()=>{
  const text='これは一つ目の文。これがふたつ目の文です。';
  const c=sentenceContext(text,issueAt(text,'ふたつ目','12'),'二つ目');
  assert.equal(c.sentence,'これがふたつ目の文です。');
  assert.equal(c.corrected,'これが二つ目の文です。');
});

test('decimal numbers do not end a sentence',()=>{
  const text='The price rose 3.14 percent and recieved attention. Then it fell.';
  const c=sentenceContext(text,issueAt(text,'recieved'),'received');
  assert.equal(c.sentence,'The price rose 3.14 percent and recieved attention.');
});

test('long documents mark the preview as clipped at the window edge',()=>{
  const text='word '.repeat(300)+''+'recieved'+' '+'word '.repeat(300);
  const c=sentenceContext(text,issueAt(text,'recieved'),'received');
  assert.ok(c.startClipped&&c.endClipped);
  assert.ok(c.sentence.startsWith('word'));
  assert.equal(c.corrected,c.sentence.slice(0,c.from)+'received'+c.sentence.slice(c.to));
});

test('an issue at the very start and end of the text stays in bounds',()=>{
  const start=sentenceContext('recieved books',issueAt('recieved books','recieved'),'received');
  assert.equal(start.sentence,'recieved books');
  assert.equal(start.from,0);
  const end=sentenceContext('She wrote it',issueAt('She wrote it','it'),'them');
  assert.equal(end.sentence,'She wrote it');
  assert.equal(end.corrected,'She wrote them');
});

test('stale, inverted, or out-of-bounds ranges return no context',()=>{
  const text='She recieved the letter.';
  assert.equal(sentenceContext(text,{start:5,end:5,original:'',replacements:[]}),null);
  assert.equal(sentenceContext(text,{start:9,end:3,original:'x',replacements:[]}),null);
  assert.equal(sentenceContext(text,{start:-1,end:5,original:'x',replacements:[]}),null);
  assert.equal(sentenceContext(text,{start:0,end:99,original:'x',replacements:[]}),null);
  assert.equal(sentenceContext(null,{start:0,end:3,replacements:[]}),null);
  assert.equal(sentenceContext(text,null),null);
  assert.equal(sentenceContext('',{start:0,end:1,original:'x',replacements:[]}),null);
});

test('OCR line-break issues keep the flagged range intact in the example',()=>{
  const text='A docu-\nment arrived.';
  const issue={start:2,end:12,original:'docu-\nment',replacements:['document']};
  const c=sentenceContext(text,issue,'document');
  assert.equal(c.sentence.slice(c.from,c.to),'docu-\nment');
  assert.equal(c.corrected,'A document arrived.');
});

test('remote (LanguageTool-style) issues with plain ranges work too',()=>{
  const text='Teh quick brown fox jumps over the lazy dog. Later days.';
  const c=sentenceContext(text,{start:0,end:3,original:'Teh',replacements:['The']},'The');
  assert.equal(c.sentence,'Teh quick brown fox jumps over the lazy dog.');
  assert.equal(c.corrected.slice(0,3),'The');
});
