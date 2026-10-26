import { bootMessage, save, screen, toast } from '../state';
import { flow } from '../flow';
import { Hud } from './Hud';
import { OrderCard } from './OrderCard';
import { Shelf } from './Shelf';
import { ProductPicker, StereoPicker } from './Picker';
import { MentorPanel, ResultPanel } from './Result';
import { DayEnd } from './DayEnd';
import { Notebook } from './Notebook';
import { Settings } from './Settings';
import { Practice, Title } from './Title';

export function App() {
  const sc = screen.value;
  return (
    <>
      {sc === 'boot' && (
        <div class="screen boot">
          <div class="boot-box">
            <div class="spinner" aria-hidden="true" />
            <p>{bootMessage.value}</p>
          </div>
        </div>
      )}
      {sc === 'title' && save.value && <Title />}
      {sc === 'practice' && save.value && <Practice />}
      {sc === 'notebook' && save.value && <Notebook />}
      {sc === 'settings' && save.value && <Settings />}
      {sc === 'lab' && save.value && <LabOverlay />}
      {toast.value && <div class="toast" role="status">{toast.value}</div>}
    </>
  );
}

function LabOverlay() {
  const phase = flow.phase.value;
  const order = flow.order.value;
  const hint = flow.hintText.value;
  const mg = flow.minigame.value;
  return (
    <div class={`lab-overlay phase-${phase}`}>
      <Hud />
      <div class="lab-stage" aria-hidden="true" />
      <div class="lab-panel">
        {hint && (phase === 'shelf' || phase === 'picker' || phase === 'stereo') && (
          <div class="hint-box"><b>Mentor:</b> {hint}</div>
        )}
        {phase === 'arrive' && <div class="panel waiting">A customer is coming in…</div>}
        {phase === 'card' && order && <OrderCard order={order} />}
        {phase === 'shelf' && order && <Shelf shelf={order.shelf} />}
        {phase === 'minigame' && mg && (
          <div class="panel minigame-strip">
            <b>Step {mg.stepIndex + 1}/{mg.totalSteps}: {mg.label}</b>
            <div class="small muted">{minigameHelp(mg.kind, mg.choose)}</div>
          </div>
        )}
        {phase === 'picker' && order && <ProductPicker order={order} />}
        {phase === 'stereo' && order && <StereoPicker order={order} />}
        {phase === 'result' && order && <ResultPanel order={order} />}
        {phase === 'mentor' && order && <MentorPanel order={order} />}
        {phase === 'dayend' && <DayEnd />}
      </div>
    </div>
  );
}

function minigameHelp(kind: string, choose: boolean): string {
  switch (kind) {
    case 'pour':
      return 'Hold to pour, release inside the green band.';
    case 'pressure':
      return 'Hold to pump H₂ in; release inside the green band.';
    case 'temperature':
      return choose ? 'Drag the dial to the temperature this step needs, then tap Set.' : 'Drag the dial into the green band, then tap Set.';
    case 'stir':
      return 'Swipe in circles to stir until the bar fills.';
    case 'workup':
      return 'Tap to add drops until the meter is in the green band, then tap Done.';
    case 'light':
      return choose ? 'Decide whether the lamp should be on, then tap Done.' : 'Match the lamp to what the step needs, then tap Done.';
    default:
      return '';
  }
}
