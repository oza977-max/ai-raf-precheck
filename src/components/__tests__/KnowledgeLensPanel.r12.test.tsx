import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KnowledgeLensPanel from '../KnowledgeLensPanel';
import type { KnowledgeMatch } from '../../engine/knowledge-lens';

function makeMatch(): KnowledgeMatch {
  return {
    entry: {
      id: 'KL-1',
      condition: {},
      risk_domain: 'Privacy & Security',
      risk_subdomain: 'Data leakage',
      description: 'Test',
      source_attribution: 'MIT AI Risk Repository, CC BY 4.0',
      covering_rule_ids: [],
    },
    covered: false,
  };
}

describe('R12-ST-3 — knowledge-lens meta line', () => {
  it('TC-R12-ST-3-01: renders curated-by / review-owner when meta is supplied', () => {
    render(
      <KnowledgeLensPanel
        matches={[makeMatch()]}
        meta={{
          curated_by: 'project maintainer',
          curated_date: '2026-08-17',
          taxonomy_version_reviewed: '1.0',
          review_owner: '2LoD — AI Risk',
          max_staleness_days: 120,
        }}
      />,
    );
    expect(screen.getByText(/Curated by project maintainer on 2026-08-17/)).toBeInTheDocument();
    expect(screen.getByText(/review owner: 2LoD — AI Risk/)).toBeInTheDocument();
  });

  it('TC-R12-ST-3-02: renders an age-overdue warning when past max_staleness_days', () => {
    render(
      <KnowledgeLensPanel
        matches={[makeMatch()]}
        meta={{
          curated_by: 'project maintainer',
          curated_date: '2020-01-01',
          taxonomy_version_reviewed: '1.0',
          review_owner: '2LoD — AI Risk',
          max_staleness_days: 30,
        }}
      />,
    );
    expect(screen.getByText(/Review overdue/i)).toBeInTheDocument();
  });

  it('TC-R12-ST-3-03: renders no meta line when meta is absent', () => {
    render(<KnowledgeLensPanel matches={[makeMatch()]} />);
    expect(screen.queryByText(/Curated by/)).not.toBeInTheDocument();
  });
});
