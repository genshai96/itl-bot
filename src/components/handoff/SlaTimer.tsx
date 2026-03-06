import { useState, useEffect } from "react";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

interface SlaTimerProps {
  createdAt: string;
  slaDeadlineAt?: string | null;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  compact?: boolean;
}

export const SlaTimer = ({ createdAt, slaDeadlineAt, firstResponseAt, resolvedAt, compact }: SlaTimerProps) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (resolvedAt || firstResponseAt) return; // stop ticking
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [resolvedAt, firstResponseAt]);

  if (resolvedAt) {
    const resolutionMs = new Date(resolvedAt).getTime() - new Date(createdAt).getTime();
    return (
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <CheckCircle2 className="h-3 w-3 text-success" />
        <span>Resolved in {formatDuration(resolutionMs)}</span>
      </div>
    );
  }

  if (firstResponseAt) {
    const responseMs = new Date(firstResponseAt).getTime() - new Date(createdAt).getTime();
    const slaOk = !slaDeadlineAt || new Date(firstResponseAt) <= new Date(slaDeadlineAt);
    return (
      <div className={`flex items-center gap-1 text-[10px] ${slaOk ? "text-success" : "text-destructive"}`}>
        <Clock className="h-3 w-3" />
        <span>Response: {formatDuration(responseMs)} {slaOk ? "✓" : "⚠ SLA breached"}</span>
      </div>
    );
  }

  // Still waiting
  const waitingMs = now.getTime() - new Date(createdAt).getTime();
  const isBreaching = slaDeadlineAt && now > new Date(slaDeadlineAt);
  const remainingMs = slaDeadlineAt ? new Date(slaDeadlineAt).getTime() - now.getTime() : null;

  if (compact) {
    return (
      <span className={`text-[10px] font-mono ${isBreaching ? "text-destructive font-semibold" : remainingMs && remainingMs < 300000 ? "text-warning" : "text-muted-foreground"}`}>
        {isBreaching ? "⚠ " : "⏱ "}
        {formatDuration(waitingMs)}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 text-[10px] ${isBreaching ? "text-destructive" : remainingMs && remainingMs < 300000 ? "text-warning" : "text-muted-foreground"}`}>
      {isBreaching ? (
        <AlertTriangle className="h-3 w-3 animate-pulse" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      <span className="font-mono">
        {formatDuration(waitingMs)}
      </span>
      {slaDeadlineAt && !isBreaching && remainingMs && (
        <span className="text-muted-foreground">
          (còn {formatDuration(remainingMs)})
        </span>
      )}
      {isBreaching && <span className="font-semibold">SLA breached!</span>}
    </div>
  );
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
