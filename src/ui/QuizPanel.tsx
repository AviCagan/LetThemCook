import { useState } from 'preact/hooks';
import { flow, describeStep } from '../flow';
import type { Order } from '../flow';
import { MoleculeCard } from './MoleculeCard';
import { getTag } from '../content/bank';
import type { RouteStep } from '../content/types';
import { save } from '../state';
import { sfx } from '../audio/sfx';

function RouteList({ route }: { route: RouteStep[] }) {
  return (
    <ol class="route-list">
      {route.map((st, i) => <li key={i}>{describeStep(st)}</li>)}
    </ol>
  );
}

function HelpRow() {
  const hint = flow.hintText.value;
  const exam = flow.mode.value === 'exam';
  return (
    <>
      {hint && <div class="hint-box small"><b>Mentor:</b> {hint}</div>}
      {!exam && (
        <div class="bench-actions">
          <button class="btn btn-sm btn-hint" type="button" disabled={!save.value?.profile.settings.hintsEnabled} onClick={() => void flow.askMentor()}>? Help</button>
        </div>
      )}
    </>
  );
}

/** The quiz-style orders: What do I get? · What did I start with? · Spot the flaw · Name it. */
export function QuizPanel({ order }: { order: Order }) {
  const q = order.quiz!;
  if (q.kind === 'predict_product') {
    return (
      <div class="panel quiz">
        <div class="quiz-q">
          <MoleculeCard smiles={order.start.smiles} label="Start" sublabel={order.start.name} size="sm" />
          <div class="quiz-route"><div class="quiz-route-title">Add, in order:</div><RouteList route={order.item.route} /></div>
        </div>
        <div class="panel-title">What do I get? (major product)</div>
        <div class="options">
          {q.options.map((o, i) => (
            <MoleculeCard key={i} smiles={o.smiles} size="sm" badge={'ABCD'[i]} onClick={() => { sfx.pick(); flow.pickOption(i); }} />
          ))}
        </div>
        <HelpRow />
      </div>
    );
  }
  if (q.kind === 'what_start') {
    return (
      <div class="panel quiz">
        <div class="quiz-q">
          <div class="quiz-route"><div class="quiz-route-title">I added, in order:</div><RouteList route={order.item.route} /></div>
          <MoleculeCard smiles={order.target.smiles} label="…and got" sublabel={order.target.name} size="sm" highlight={order.target.highlightAtoms} />
        </div>
        <div class="panel-title">What did I start with?</div>
        <div class="options">
          {q.options.map((o, i) => (
            <MoleculeCard key={i} smiles={o.smiles} size="sm" badge={'ABCD'[i]} onClick={() => { sfx.pick(); flow.pickOption(i); }} />
          ))}
        </div>
        <HelpRow />
      </div>
    );
  }
  if (q.kind === 'spot_flaw') {
    const stage = flow.quizStage.value;
    return (
      <div class="panel quiz">
        <div class="order-mols">
          <MoleculeCard smiles={order.start.smiles} label="Start" sublabel={order.start.name} size="sm" />
          <MoleculeCard smiles={order.target.smiles} label="Target" sublabel={order.target.name} size="sm" highlight={order.target.highlightAtoms} />
        </div>
        {stage === 'answer' ? (
          <>
            <div class="panel-title">Two interns wrote routes. Which one works?</div>
            <div class="route-options">
              {q.routes.map((r, i) => (
                <button key={i} class="btn btn-option" type="button" onClick={() => { sfx.pick(); flow.pickRoute(i); }}>
                  <b>Route {'AB'[i]}</b>
                  <RouteList route={r.route} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div class="panel-title">Right! Why does the other route fail?</div>
            <div class="quiz-route muted small">The other route: <RouteList route={q.routes.find((r) => !r.works)!.route} /></div>
            <div class="stereo-options">
              {q.reasons.map((t) => (
                <button key={t} class="btn btn-option" type="button" onClick={() => { sfx.pick(); flow.pickReason(t); }}>
                  <b>{getTag(t).label}</b>
                </button>
              ))}
            </div>
          </>
        )}
        <HelpRow />
      </div>
    );
  }
  return <NameIt order={order} />;
}

function NameIt({ order }: { order: Order }) {
  const q = order.quiz!;
  const [text, setText] = useState('');
  if (q.kind !== 'name_it') return null;
  const choices = flow.quizStage.value === 'choices';
  return (
    <div class="panel quiz">
      <MoleculeCard smiles={order.target.smiles} size="md" label="What is this called?" />
      {!choices ? (
        <form class="name-form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { sfx.tap(); flow.submitName(text); } }}>
          <input class="name-input" type="text" autocomplete="off" autocapitalize="off" spellcheck={false} placeholder="type the name (IUPAC or common)" aria-label="Name" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
          <div class="row gap wrap">
            <button class="btn btn-primary" type="submit" disabled={!text.trim()}>Check</button>
            <button class="btn btn-ghost" type="button" onClick={() => { sfx.click(); flow.showNameChoices(); }}>Show choices (half credit)</button>
          </div>
          <p class="muted small">Case, spaces and hyphens don't matter. Substitutive, functional-class and common names all count.</p>
        </form>
      ) : (
        <div class="stereo-options">
          {q.choices.map((n) => (
            <button key={n} class="btn btn-option" type="button" onClick={() => { sfx.pick(); flow.submitName(n); }}><b>{n}</b></button>
          ))}
        </div>
      )}
      <HelpRow />
    </div>
  );
}
