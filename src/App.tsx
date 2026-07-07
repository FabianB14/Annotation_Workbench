import { useState } from 'react';
import { useStore } from './store';
import { MODEL_LABELS } from './services/gemini';
import Step1RulesIngestion from './components/Step1RulesIngestion';
import Step2VideoProcessing from './components/Step2VideoProcessing';
import Step3ReviewWorkspace from './components/Step3ReviewWorkspace';
import ApiKeyModal from './components/ApiKeyModal';
import ProjectSelectorModal from './components/ProjectSelectorModal';
import {
  FolderIcon,
  PlusIcon,
  SettingsIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  BrainIcon,
} from './components/Icons';

const STEP_LABELS = ['Rules Spec', 'Ingest Video', 'Review Studio'];

export default function App() {
  const store = useStore();
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const { currentStep, currentProject, projects, errorMessage } = store;

  return (
    <div className="app">
      {/* Top bar */}
      <header className="topbar">
        <div className="brand">
          <div className="logo">
            <BrainIcon size={18} />
          </div>
          <div>
            <div className="title">Workbench</div>
            <div className="subtitle mono">PROJ_DELTA_V04</div>
          </div>
        </div>
        <div className="actions">
          {store.simulationMode && (
            <span className="badge-amber" title="No API key set — running in demo simulation mode">
              Demo Mode
            </span>
          )}
          <button
            className="icon-btn"
            title="Gemini API Key"
            onClick={() => setShowApiKey(true)}
          >
            <SettingsIcon size={20} />
          </button>
          {projects.length > 0 && (
            <button
              className="icon-btn"
              title="Load Project"
              onClick={() => setShowProjectSelector(true)}
            >
              <FolderIcon size={20} />
            </button>
          )}
          {currentStep === 3 && currentProject && (
            <button className="btn btn-ghost" onClick={() => store.setStep(1)}>
              <PlusIcon size={16} /> New Video
            </button>
          )}
        </div>
      </header>

      <div className="content">
        {/* Error banner */}
        {errorMessage && (
          <div className="error-banner">
            <CloseIcon size={18} className="primary-text" />
            <div style={{ flex: 1 }}>
              <div className="title">Execution Error</div>
              <div className="msg">{errorMessage}</div>
            </div>
            <button className="icon-btn small" onClick={store.clearError}>
              <CloseIcon size={16} />
            </button>
          </div>
        )}

        {/* Stepper */}
        <nav className="stepper">
          {STEP_LABELS.map((label, i) => {
            const stepNum = i + 1;
            const active = currentStep === stepNum;
            const completed = currentStep > stepNum;
            return (
              <div key={label} className="step-wrap" style={{ display: 'flex', alignItems: 'center' }}>
                <div className={`step ${active ? 'active' : ''} ${completed ? 'completed' : ''}`}>
                  <span className="dot">{completed ? <CheckIcon size={14} /> : stepNum}</span>
                  <span className="label">{label}</span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <span className="sep" style={{ margin: '0 12px', display: 'flex' }}>
                    <ChevronRightIcon size={16} />
                  </span>
                )}
              </div>
            );
          })}
        </nav>

        {/* Step content */}
        {currentStep === 1 && <Step1RulesIngestion store={store} />}
        {currentStep === 2 && <Step2VideoProcessing store={store} />}
        {currentStep === 3 && <Step3ReviewWorkspace store={store} />}
      </div>

      {showApiKey && (
        <ApiKeyModal
          apiKey={store.apiKey}
          simulationMode={store.simulationMode}
          onSave={(key) => {
            store.setApiKey(key);
            setShowApiKey(false);
          }}
          onClose={() => setShowApiKey(false)}
        />
      )}

      {showProjectSelector && (
        <ProjectSelectorModal
          projects={projects}
          activeProject={currentProject}
          onSelect={(p) => {
            store.selectProject(p);
            setShowProjectSelector(false);
          }}
          onDelete={(id) => store.deleteProject(id)}
          onClose={() => setShowProjectSelector(false)}
        />
      )}
    </div>
  );
}

export { MODEL_LABELS };
