"use client";

import { useCallback, useMemo, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

interface TopicLinksPanelProps {
  topicId: string;
  network: string;
  latestSequence: number | null;
  sequenceSource: "ledger" | "database" | null;
  latestConsensusDisplay: string | null;
  mirrorFeedUrl: string | null;
  hashscanTopicUrl: string | null;
  hashscanMessageUrl: string | null;
}

const sequenceSourceLabel: Record<
  NonNullable<TopicLinksPanelProps["sequenceSource"]>,
  string
> = {
  ledger: "Latest on-ledger sequence",
  database: "Latest recorded sequence",
};

export default function TopicLinksPanel({
  topicId,
  network,
  latestSequence,
  sequenceSource,
  latestConsensusDisplay,
  mirrorFeedUrl,
  hashscanTopicUrl,
  hashscanMessageUrl,
}: TopicLinksPanelProps) {
  const [copied, setCopied] = useState(false);

  const sequenceHeading = useMemo(() => {
    if (!sequenceSource) return "Latest sequence";
    return sequenceSourceLabel[sequenceSource];
  }, [sequenceSource]);

  const handleCopy = useCallback(() => {
    if (!mirrorFeedUrl) return;
    if (!navigator?.clipboard) {
      setCopied(false);
      return;
    }

    void navigator.clipboard
      .writeText(mirrorFeedUrl)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        setCopied(false);
      });
  }, [mirrorFeedUrl]);

  return (
    <div className="flex flex-col gap-3 rounded border border-border/60 bg-muted/40 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Topic ID
          </div>
          <div className="font-mono text-sm text-foreground">{topicId}</div>
          <div className="text-xs text-muted-foreground">Network: {network}</div>
        </div>
        <div className="space-y-1 text-right">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {sequenceHeading}
          </div>
          <div className="font-mono text-sm text-foreground">
            {latestSequence !== null ? `#${latestSequence}` : "—"}
          </div>
          {sequenceSource === "ledger" && latestConsensusDisplay ? (
            <div className="text-xs text-muted-foreground">
              {latestConsensusDisplay}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {hashscanTopicUrl ? (
          <Button asChild variant="outline" size="sm">
            <a href={hashscanTopicUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              View on HashScan
            </a>
          </Button>
        ) : null}
        {hashscanMessageUrl ? (
          <Button asChild variant="outline" size="sm">
            <a href={hashscanMessageUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              Latest message
            </a>
          </Button>
        ) : null}
        {mirrorFeedUrl ? (
          <Button asChild variant="outline" size="sm">
            <a href={mirrorFeedUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              Open Mirror Node feed
            </a>
          </Button>
        ) : null}
        {mirrorFeedUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            aria-live="polite"
          >
            <Copy className="size-3.5" />
            {copied ? "URL copied" : "Copy feed URL"}
          </Button>
        ) : null}
      </div>
      {sequenceSource === "database" ? (
        <p className="text-xs text-muted-foreground">
          Latest sequence shown from database records. Run the live workflow to
          publish the next message to Hedera.
        </p>
      ) : null}
    </div>
  );
}
