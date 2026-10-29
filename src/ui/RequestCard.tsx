import { useState } from 'preact/hooks';
import { flow } from '../flow';
import type { Order } from '../flow';
import { MoleculeCard } from './MoleculeCard';
import { characterName } from '../art/characters';
import { spriteDataUrl } from '../art/textures';
import { stereoLabelText } from '../engine/stereo';
import { sfx } from '../audio/sfx';
import { save } from '../state';
import { TYPE_LABEL, isQuizType } from '../quiz';

export function RequestCard({ order }: { order: Order }) {
  const [show, setShow] = useState(false);
  const name = characterName(flow.customerKey.value);
  const stereoWord = stereoLabelText(order.target.stereo).toLowerCase();
  // skip the note when the name already says it (meso-…, rac-…, (2R,3R)-…)
  const saysIt = /^(meso|rac|cis|trans)-|^\(\d?[RSEZ]/i.test(order.target.name) || order.target.name.toLowerCase().includes(stereoWord);
  const stereoNote = order.target.stereo !== 'none' && !saysIt ? ` (${stereoWord})` : '';
  const exam = flow.mode.value === 'exam';
  const quiz = isQuizType(order.type);
  const ask: Record<string, string> = {
    predict_product: `I'm about to run a reaction on ${order.start.name}. Can you tell me what I'll get?`,
    what_start: `I made ${order.target.name}, but I lost my notes. What did I start with?`,
    spot_flaw: `Two interns wrote routes to ${order.target.name}. Only one works. Which?`,
    name_it: 'I found this in an unlabelled bottle. What is it called?',
  };
  const chips = (
    <span class="chips inline">
      <span class="chip chip-muted small">{TYPE_LABEL[order.type]}</span>
      {order.item.orderTypes?.includes('synthesis') && order.type === 'synthesis' ? <span class="chip chip-tag small">multi-step</span> : null}
      {order.daily ? <span class="chip chip-hot small">daily special ×2</span> : null}
      {order.retest ? <span class="chip small">re-test</span> : null}
    </span>
  );
  if (quiz || exam) {
    return (
      <div class="panel request">
        <div class="speech">
          {!exam && <img class="avatar" src={spriteDataUrl(flow.customerKey.value, 0, 3)} alt="" />}
          <div>
            <div class="speech-name">{exam ? `Exam question ${flow.customerIndex.value + 1} of ${flow.customersTotal.value}` : name}</div>
            <div class="speech-text">
              {chips}{' '}
              {quiz ? ask[order.type] : <>Make <b class="target-name">{order.target.name}</b>{stereoNote} from {order.start.name}.</>}
            </div>
          </div>
        </div>
        <button class="btn btn-primary btn-big" type="button" onClick={() => { sfx.tap(); flow.acceptOrder(); }}>{quiz ? "Let's see ▶" : 'To the bench ▶'}</button>
      </div>
    );
  }
  return (
    <div class="panel request">
      <div class="speech">
        <img class="avatar" src={spriteDataUrl(flow.customerKey.value, 0, 3)} alt="" />
        <div>
          <div class="speech-name">{name}</div>
          <div class="speech-text">
            {chips}{' '}
            Could you turn this into <b class="target-name">{order.target.name}</b>{stereoNote} for me?
            {order.target.altNames?.length ? <span class="muted small"> (also called {order.target.altNames.join(', ')})</span> : null}
          </div>
        </div>
      </div>
      <div class="order-mols">
        <MoleculeCard smiles={order.start.smiles} label="You get" sublabel={order.start.name} size="sm" />
        {show ? (
          <MoleculeCard smiles={order.target.smiles} label="Wanted" sublabel={order.target.name} size="sm" />
        ) : (
          <button class="molcard molcard-sm reveal" type="button" onClick={() => { sfx.click(); setShow(true); noteReveal(); }}>
            <span class="reveal-q">?</span>
            <span class="small">Show the structure</span>
          </button>
        )}
      </div>
      <button class="btn btn-primary btn-big" type="button" onClick={() => { sfx.tap(); flow.acceptOrder(); }}>To the bench ▶</button>
    </div>
  );
}

function noteReveal(): void {
  const s = save.value;
  if (!s) return;
  s.stats.reveals = (s.stats.reveals ?? 0) + 1;
}
