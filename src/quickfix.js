// In-editor correction popover: click a highlighted word in the writing desk
// and pick a suggested correction directly where the mistake is.
import {quickFixPosition} from './core/quickfix.js';

const CATEGORY_LABELS = {spelling: 'Spelling', grammar: 'Grammar', punctuation: 'Punctuation', style: 'Style', ocr: 'OCR restoration'};
let node = null;
let outsideHandler = null;

export function quickFixOpen() {
  return !!node;
}

export function closeQuickFix() {
  if (outsideHandler) document.removeEventListener('pointerdown', outsideHandler);
  outsideHandler = null;
  node?.remove();
  node = null;
}

export function showQuickFix({original, category, message, replacements = [], chosen = 0, anchor, onPick, onIgnore, onAddWord, onDisable}) {
  closeQuickFix();
  node = document.createElement('div');
  node.className = 'quickfix';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-label', `Corrections for ${original}`);

  const header = document.createElement('div');
  header.className = 'quickfix-header';
  const word = document.createElement('span');
  word.className = 'quickfix-word';
  word.textContent = original;
  const tag = document.createElement('span');
  tag.className = 'quickfix-tag';
  tag.textContent = CATEGORY_LABELS[category] || 'Suggestion';
  header.append(word, tag);
  node.append(header);

  const list = document.createElement('div');
  list.className = 'quickfix-list';
  if (replacements.length) {
    for (const [index, replacement] of replacements.slice(0, 6).entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quickfix-item' + (index === chosen ? ' chosen' : '');
      button.setAttribute('role', 'menuitem');
      const check = document.createElement('span');
      check.className = 'quickfix-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';
      const fix = document.createElement('ins');
      fix.textContent = replacement;
      button.append(check, fix);
      button.addEventListener('click', () => onPick?.(index));
      list.append(button);
    }
  } else {
    const note = document.createElement('p');
    note.className = 'quickfix-more';
    note.textContent = message || 'Review this suggestion manually.';
    list.append(note);
  }
  node.append(list);

  const footer = document.createElement('div');
  footer.className = 'quickfix-footer';
  const actions = [];
  if (category === 'spelling' && onAddWord) actions.push(['Add to dictionary', onAddWord]);
  if (onIgnore) actions.push(['Ignore once', onIgnore]);
  if (onDisable) actions.push(['Disable rule', onDisable]);
  for (const [label, run] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quickfix-action';
    button.textContent = label;
    button.addEventListener('click', () => { closeQuickFix(); run(); });
    footer.append(button);
  }
  if (actions.length) node.append(footer);

  node.style.visibility = 'hidden';
  document.body.append(node);
  const position = quickFixPosition(anchor, {width: node.offsetWidth, height: node.offsetHeight}, {width: window.innerWidth, height: window.innerHeight});
  node.style.left = `${position.left}px`;
  node.style.top = `${position.top}px`;
  node.style.visibility = '';

  node.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeQuickFix();
    }
  });
  outsideHandler = event => {
    if (node && !node.contains(event.target)) closeQuickFix();
  };
  document.addEventListener('pointerdown', outsideHandler);

  node.querySelector('button')?.focus();
  return node;
}
