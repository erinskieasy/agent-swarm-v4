import React, { useState, useEffect, useRef } from 'react';

interface MissionSummary {
    id: string;
    goal: string;
    status: string;
    createdAt: string;
}

interface MissionInputProps {
    onSubmit: (goal: string, files: File[]) => void;
    onLoadMission: (id: string) => void;
    isLoading: boolean;
}

const STATUS_COLORS: Record<string, string> = {
    completed: 'var(--color-success)',
    failed: 'var(--color-danger)',
    executing: 'var(--color-accent)',
    planning: 'var(--color-warning)',
    idle: 'var(--color-text-dim)',
};

const ACCEPTED_TYPES = '.pdf,.txt,.csv,.md,.json';

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MissionInput: React.FC<MissionInputProps> = ({ onSubmit, onLoadMission, isLoading }) => {
    const [goal, setGoal] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [pastMissions, setPastMissions] = useState<MissionSummary[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetch('/api/missions')
            .then((res) => res.json())
            .then((data) => {
                setPastMissions(Array.isArray(data) ? data : []);
            })
            .catch(() => setPastMissions([]))
            .finally(() => setLoadingHistory(false));
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (goal.trim() && !isLoading) {
            onSubmit(goal.trim(), files);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            setFiles((prev) => [...prev, ...newFiles]);
        }
        // Reset input so selecting the same file again works
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeFile = (index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHrs = Math.floor(diffMin / 60);
        if (diffHrs < 24) return `${diffHrs}h ago`;
        const diffDays = Math.floor(diffHrs / 24);
        if (diffDays < 7) return `${diffDays}d ago`;
        return d.toLocaleDateString();
    };

    return (
        <div className="mission-input">
            <div className="mission-input__icon">
                <span className="material-symbols-outlined">rocket_launch</span>
            </div>
            <div>
                <h2>Mission Control</h2>
                <p>
                    Describe your objective and the AI orchestrator will decompose it,
                    assign specialist agents, and deliver a unified result.
                </p>
            </div>
            <form className="mission-input__form" onSubmit={handleSubmit}>
                <div className="mission-input__field-row">
                    <input
                        className="mission-input__field"
                        type="text"
                        placeholder="e.g. Create a marketing strategy for a solar loan program..."
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        disabled={isLoading}
                        autoFocus
                    />
                    <button
                        className="mission-input__attach-btn"
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading}
                        title="Attach documents"
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>attach_file</span>
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED_TYPES}
                        multiple
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                    />
                </div>

                {/* File chips */}
                {files.length > 0 && (
                    <div className="mission-input__file-chips">
                        {files.map((file, index) => (
                            <div key={index} className="file-chip">
                                <span className="material-symbols-outlined file-chip__icon">description</span>
                                <span className="file-chip__name">{file.name}</span>
                                <span className="file-chip__size">{formatFileSize(file.size)}</span>
                                <button
                                    className="file-chip__remove"
                                    type="button"
                                    onClick={() => removeFile(index)}
                                    title="Remove file"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <button
                    className="mission-input__submit"
                    type="submit"
                    disabled={!goal.trim() || isLoading}
                >
                    {isLoading ? 'Launching...' : 'Launch Mission'}
                </button>
            </form>

            {/* Past Missions */}
            <div className="past-missions">
                <h3 className="past-missions__heading">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>history</span>
                    Past Missions
                    {pastMissions.length > 0 && (
                        <span className="past-missions__count">{pastMissions.length}</span>
                    )}
                </h3>

                {loadingHistory && (
                    <p className="past-missions__empty">Loading mission history...</p>
                )}

                {!loadingHistory && pastMissions.length === 0 && (
                    <p className="past-missions__empty">No past missions yet. Launch your first one above!</p>
                )}

                {!loadingHistory && pastMissions.length > 0 && (
                    <div className="past-missions__list">
                        {pastMissions.slice(0, 8).map((m) => (
                            <button
                                key={m.id}
                                className="past-missions__item"
                                onClick={() => onLoadMission(m.id)}
                                disabled={isLoading}
                            >
                                <div className="past-missions__item-dot" style={{ background: STATUS_COLORS[m.status] || 'var(--color-text-dim)' }} />
                                <span className="past-missions__item-goal">{m.goal}</span>
                                <span className="past-missions__item-meta">
                                    <span className="past-missions__item-status">{m.status}</span>
                                    <span>{formatDate(m.createdAt)}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MissionInput;
