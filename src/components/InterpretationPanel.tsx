import React, { useState } from 'react';
import type { InterpretationProposal } from '../../shared/types';

interface InterpretationPanelProps {
    proposal: InterpretationProposal | null;
    interpretationStatus: string;
    statusMessage: string;
    onApprove: () => void;
    onRefine: (feedback: string) => void;
    isLoading: boolean;
}

const InterpretationPanel: React.FC<InterpretationPanelProps> = ({
    proposal,
    interpretationStatus,
    statusMessage,
    onApprove,
    onRefine,
    isLoading,
}) => {
    const [feedback, setFeedback] = useState('');
    const [showRefinedPrompt, setShowRefinedPrompt] = useState(false);
    const [showSources, setShowSources] = useState(false);

    const handleRefineSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (feedback.trim() && !isLoading) {
            onRefine(feedback.trim());
            setFeedback('');
        }
    };

    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 85) return 'var(--color-success)';
        if (confidence >= 65) return 'var(--color-warning)';
        return 'var(--color-danger)';
    };

    const getConfidenceLabel = (confidence: number) => {
        if (confidence >= 90) return 'Excellent';
        if (confidence >= 75) return 'Good';
        if (confidence >= 60) return 'Fair';
        return 'Needs Work';
    };

    // Loading state — interpretation in progress
    if (!proposal) {
        return (
            <div className="interpretation-panel">
                <div className="interpretation-panel__loading">
                    <div className="interpretation-panel__loading-icon">
                        <span className="material-symbols-outlined interpretation-spin">psychology</span>
                    </div>
                    <h3>{statusMessage || 'Analyzing your request...'}</h3>
                    <p className="interpretation-panel__loading-sub">
                        The interpreter is understanding your intent, identifying gaps, and crafting a refined mission brief.
                    </p>
                    <div className="interpretation-panel__loading-steps">
                        <div className={`interpretation-step ${interpretationStatus === 'analyzing' ? 'interpretation-step--active' : ['researching', 'critiquing', 'synthesizing', 'waiting'].includes(interpretationStatus) ? 'interpretation-step--done' : ''}`}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
                            Interpreting
                        </div>
                        <div className="interpretation-step__arrow">→</div>
                        <div className={`interpretation-step ${interpretationStatus === 'researching' ? 'interpretation-step--active' : ['critiquing', 'synthesizing', 'waiting'].includes(interpretationStatus) ? 'interpretation-step--done' : ''}`}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>travel_explore</span>
                            Researching
                        </div>
                        <div className="interpretation-step__arrow">→</div>
                        <div className={`interpretation-step ${interpretationStatus === 'critiquing' ? 'interpretation-step--active' : ['synthesizing', 'waiting'].includes(interpretationStatus) ? 'interpretation-step--done' : ''}`}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>rate_review</span>
                            Critiquing
                        </div>
                        <div className="interpretation-step__arrow">→</div>
                        <div className={`interpretation-step ${interpretationStatus === 'synthesizing' ? 'interpretation-step--active' : interpretationStatus === 'waiting' ? 'interpretation-step--done' : ''}`}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_fix_high</span>
                            Synthesizing
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="interpretation-panel">
            <div className="interpretation-panel__card">
                {/* Header */}
                <div className="interpretation-panel__header">
                    <div className="interpretation-panel__header-left">
                        <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--color-accent)' }}>
                            auto_awesome
                        </span>
                        <div>
                            <h3>Mission Interpretation</h3>
                            <span className="interpretation-panel__iteration">
                                Iteration {proposal.iteration}
                            </span>
                        </div>
                    </div>
                    <div className="interpretation-panel__confidence" style={{ borderColor: getConfidenceColor(proposal.confidence) }}>
                        <div className="interpretation-panel__confidence-bar" style={{
                            width: `${proposal.confidence}%`,
                            backgroundColor: getConfidenceColor(proposal.confidence),
                        }} />
                        <span className="interpretation-panel__confidence-text">
                            {proposal.confidence}% — {getConfidenceLabel(proposal.confidence)}
                        </span>
                    </div>
                </div>

                {/* Interpretation Details */}
                <div className="interpretation-panel__body">
                    <div className="interpretation-panel__section">
                        <div className="interpretation-panel__section-label">
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>flag</span>
                            Objective
                        </div>
                        <p>{proposal.interpretation.objective}</p>
                    </div>

                    <div className="interpretation-panel__section">
                        <div className="interpretation-panel__section-label">
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>crop_free</span>
                            Scope
                        </div>
                        <p>{proposal.interpretation.scope}</p>
                    </div>

                    <div className="interpretation-panel__row">
                        <div className="interpretation-panel__section interpretation-panel__section--half">
                            <div className="interpretation-panel__section-label">
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>checklist</span>
                                Deliverables
                            </div>
                            <ul>
                                {proposal.interpretation.deliverables.map((d, i) => (
                                    <li key={i}>{d}</li>
                                ))}
                            </ul>
                        </div>
                        <div className="interpretation-panel__section interpretation-panel__section--half">
                            <div className="interpretation-panel__section-label">
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>groups</span>
                                Audience
                            </div>
                            <p>{proposal.interpretation.audience}</p>

                            {proposal.interpretation.assumptions.length > 0 && (
                                <>
                                    <div className="interpretation-panel__section-label" style={{ marginTop: 12 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>lightbulb</span>
                                        Assumptions
                                    </div>
                                    <ul className="interpretation-panel__assumptions">
                                        {proposal.interpretation.assumptions.map((a, i) => (
                                            <li key={i}>{a}</li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Weak Points */}
                    {proposal.weakPoints.length > 0 && (
                        <div className="interpretation-panel__section interpretation-panel__section--warning">
                            <div className="interpretation-panel__section-label">
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-warning)' }}>warning</span>
                                <span style={{ color: 'var(--color-warning)' }}>Identified Gaps</span>
                            </div>
                            <ul>
                                {proposal.weakPoints.map((wp, i) => (
                                    <li key={i}>{wp}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Clarifying Questions */}
                    {proposal.clarifyingQuestions.length > 0 && (
                        <div className="interpretation-panel__section interpretation-panel__section--questions">
                            <div className="interpretation-panel__section-label">
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-accent)' }}>help</span>
                                <span style={{ color: 'var(--color-accent)' }}>Questions To Consider</span>
                            </div>
                            <ul>
                                {proposal.clarifyingQuestions.map((q, i) => (
                                    <li key={i}>{q}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Sources */}
                    {proposal.researchSources && proposal.researchSources.length > 0 && (
                        <div className="interpretation-panel__section interpretation-panel__section--sources">
                            <button
                                className="interpretation-panel__toggle interpretation-panel__toggle--sources"
                                onClick={() => setShowSources(!showSources)}
                            >
                                <div className="interpretation-panel__section-label">
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-info, #60a5fa)' }}>travel_explore</span>
                                    <span style={{ color: 'var(--color-info, #60a5fa)' }}>Web Sources ({proposal.researchSources.length})</span>
                                </div>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                    {showSources ? 'expand_less' : 'expand_more'}
                                </span>
                            </button>
                            {showSources && (
                                <div className="interpretation-panel__sources-list">
                                    {proposal.researchSources.map((source, i) => (
                                        <a
                                            key={i}
                                            className="interpretation-panel__source-item"
                                            href={source.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <div className="interpretation-panel__source-title">
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>link</span>
                                                {source.title}
                                            </div>
                                            <p className="interpretation-panel__source-snippet">{source.snippet}</p>
                                            <span className="interpretation-panel__source-url">{new URL(source.url).hostname}</span>
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Refined Prompt Preview */}
                    <div className="interpretation-panel__refined">
                        <button
                            className="interpretation-panel__toggle"
                            onClick={() => setShowRefinedPrompt(!showRefinedPrompt)}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                {showRefinedPrompt ? 'expand_less' : 'expand_more'}
                            </span>
                            {showRefinedPrompt ? 'Hide' : 'Show'} Refined Prompt
                        </button>
                        {showRefinedPrompt && (
                            <div className="interpretation-panel__refined-text">
                                {proposal.refinedGoal}
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Bar */}
                <div className="interpretation-panel__actions">
                    <form className="interpretation-panel__feedback-form" onSubmit={handleRefineSubmit}>
                        <input
                            className="interpretation-panel__feedback-input"
                            type="text"
                            placeholder="Add context, answer questions, or request changes..."
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            disabled={isLoading}
                        />
                        <button
                            className="interpretation-panel__refine-btn"
                            type="submit"
                            disabled={!feedback.trim() || isLoading}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
                            Refine
                        </button>
                    </form>
                    <button
                        className="interpretation-panel__approve-btn"
                        onClick={onApprove}
                        disabled={isLoading}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>rocket_launch</span>
                        {isLoading ? 'Processing...' : 'Proceed →'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InterpretationPanel;
