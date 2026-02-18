import { useState, useEffect, useRef, useCallback } from 'react';

export function useElapsedTime(isRunning: boolean): {
    elapsed: number;
    formatted: string;
    reset: () => void;
} {
    const [elapsed, setElapsed] = useState(0);
    const startRef = useRef<number>(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const reset = useCallback(() => {
        setElapsed(0);
        startRef.current = 0;
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (isRunning) {
            startRef.current = Date.now();
            intervalRef.current = setInterval(() => {
                setElapsed(Date.now() - startRef.current);
            }, 100);
        } else if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isRunning]);

    const totalSeconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    const formatted = `${minutes}:${seconds}`;

    return { elapsed, formatted, reset };
}
