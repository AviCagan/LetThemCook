import { useEffect } from 'preact/hooks';
import { bootMessage, save, screen, toast } from '../state';
import { flow } from '../flow';
import { Hud } from './Hud';
import { RequestCard } from './RequestCard';
import { Workbench } from './Workbench';
import { StereoPicker } from './StereoPicker';
import { MentorPanel, ResultPanel } from './Result';
import { LabBook } from './LabBook';
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
      {sc === 'labbook' && save.value && <LabBook />}
      {sc === 'settings' && save.value && <Settings />}
      {sc === 'lab' && save.value && <LabOverlay />}
      {toast.value && <div class="toast" role="status">{toast.value}</div>}
    </>
  );
}

function LabOverlay() {
  const phase = flow.phase.value;
  const order = flow.order.value;
  // each phase starts at the top of the panel (the bench may have been scrolled to the shelf)
  useEffect(() => {
    document.querySelector('.lab-panel')?.scrollTo({ top: 0 });
  }, [phase]);
  return (
    <div class={`lab-overlay phase-${phase}`}>
      <Hud />
      <div class="lab-stage" aria-hidden="true" />
      <div class="lab-panel">
        {phase === 'arrive' && <div class="panel waiting">A customer is coming in…</div>}
        {phase === 'request' && order && <RequestCard order={order} />}
        {phase === 'bench' && order && <Workbench order={order} />}
        {phase === 'stereo' && order && <StereoPicker order={order} />}
        {phase === 'result' && order && <ResultPanel order={order} />}
        {phase === 'mentor' && order && <MentorPanel order={order} />}
        {phase === 'dayend' && <DayEnd />}
      </div>
    </div>
  );
}
