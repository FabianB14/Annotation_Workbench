import type { Store } from '../store';
import { Spinner } from './Shared';
import { BrainIcon, SparkleIcon } from './Icons';

export default function Step2VideoProcessing({ store }: { store: Store }) {
  const { currentProject, isGenerating, generationProgress } = store;
  if (!currentProject) return null;

  return (
    <div className="content" style={{ overflow: 'auto' }}>
      <div className="center-col">
        {isGenerating ? (
          <>
            <Spinner className="lg" />
            <h2 className="h1">Multimodal Processing In Progress</h2>
            <div className="primary-text" style={{ fontWeight: 600 }}>
              {generationProgress}
            </div>
            <p className="muted" style={{ maxWidth: 460 }}>
              Gemini is uploading the video once, segmenting the timeline, transcribing dialogue
              verbatim, and describing visual layout and sound effects.
            </p>
          </>
        ) : (
          <>
            <BrainIcon size={64} className="primary-text" />
            <h2 className="h1">Ready for Dynamic Multimodal Annotation</h2>
            <p className="muted" style={{ maxWidth: 460 }}>
              Rules specification successfully parsed. We are ready to draft segments based on your
              guidelines for video: <strong>{currentProject.videoName || '(no video)'}</strong>
            </p>

            <div style={{ width: '100%', maxWidth: 420, marginTop: 12 }}>
              <button className="btn btn-primary btn-lg" onClick={() => store.generateAnnotations()}>
                <SparkleIcon size={18} /> Generate AI Draft Annotations
              </button>
              <button
                className="btn btn-outline btn-lg"
                style={{ marginTop: 12 }}
                onClick={() => store.setStep(3)}
              >
                Skip to Manual Review Workspace
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
