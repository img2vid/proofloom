import {readFileSync} from 'node:fs';
import {ConfusionContextModel} from '../src/core/algorithms/language-model.js';
const data = JSON.parse(readFileSync('src/core/data/context-model.json', 'utf8'));
const model = new ConfusionContextModel(data);
const norm = w => w.toLowerCase().replace(/[’]/g, "'");
const FLOOR = Math.log(0.15 / (1000 + 0.15 * 60));

function debug(prev, w, next) {
  const lower = norm(w);
  const set = model.byWord.get(lower)?.[0];
  const totalCount = [...set.contexts.values()].reduce((n, c) => n + c.count, 0);
  console.log('CASE:', JSON.stringify(prev), '|', w, '|', JSON.stringify(next));
  for (const cw of set.words) {
    const own = set.contexts.get(cw);
    const prior = own ? Math.log(own.count / totalCount) : Math.log(0.0005);
    const ctx = own ? model.contextScore(cw, prev, next) : 2 * FLOOR;
    console.log('  ', cw, 'prior:', prior.toFixed(2), 'ctx:', ctx.toFixed(2), 'total:', (prior + ctx).toFixed(2),
      '| prevSeen:', own?.prev.get(norm(prev)) || 0, 'nextSeen:', own?.next.get(norm(next)) || 0);
  }
  console.log('  verdict:', JSON.stringify(model.disambiguate(prev, w, next)));
}

debug('I left my keys over', 'their', 'by the window');
debug('over', 'there', 'by the window');
debug('they put', 'they’re', 'car in gear');
debug('', 'they’re', 'coming over later');
debug('it is', 'there', 'fault');
debug('', 'there', 'arguments make no sense');
