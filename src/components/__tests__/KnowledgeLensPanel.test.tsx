import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KnowledgeLensPanel from '../KnowledgeLensPanel';
import type { KnowledgeLensEntry, KnowledgeMatch } from '../../engine/knowledge-lens';

function entry(overrides: Partial<KnowledgeLensEntry> = {}): KnowledgeLensEntry {
  return {
    id: 'KL-TEST-01',
    condition: {},
    risk_domain: 'Privacy & Security',
    risk_subdomain: 'Sensitive personal data exposure via model I/O',
    description: 'Confidential data flowing to a model endpoint can leak.',
    source_attribution: 'MIT AI Risk Repository (Slattery et al., MIT FutureTech), CC BY 4.0',
    covering_rule_ids: [],
    ...overrides,
  };
}

describe('KnowledgeLensPanel — R11-KL-2 advisory idiom (TC-R11-KL-4)', () => {
  it('renders nothing for an empty match list', () => {
    const { container } = render(<KnowledgeLensPanel matches={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the domain, description, attribution, and the exact posture line', async () => {
    // R13-UI-2 renegotiation: covered entries collapse behind the summary
    // toggle by default — the content criterion is now "one click away",
    // same amendment pattern as R9-SC-2 amended R5-GR-1.
    const user = userEvent.setup();
    const matches: KnowledgeMatch[] = [{ entry: entry(), covered: true }];
    render(<KnowledgeLensPanel matches={matches} />);
    await user.click(screen.getByRole('button', { name: /already addressed by firm or pack rules/i }));
    expect(screen.getByText(/Privacy & Security/)).toBeInTheDocument();
    expect(screen.getByText(/Sensitive personal data exposure via model I\/O/)).toBeInTheDocument();
    expect(screen.getByText(/Confidential data flowing to a model endpoint can leak\./)).toBeInTheDocument();
    expect(screen.getByText(/CC BY 4\.0/)).toBeInTheDocument();
    // Exact posture wording, per requirements-011.md R11-KL-2.
    expect(screen.getByText(/informs — the rules decide/i)).toBeInTheDocument();
  });

  it('renders distinctly from the deciding-rules idiom — its own container class, not similar-cases', () => {
    const matches: KnowledgeMatch[] = [{ entry: entry(), covered: true }];
    const { container } = render(<KnowledgeLensPanel matches={matches} />);
    expect(container.querySelector('.knowledge-lens')).toBeInTheDocument();
    expect(container.querySelector('.similar-cases')).not.toBeInTheDocument();
  });

  it('shows a covered match without a coverage-gap button', async () => {
    const user = userEvent.setup();
    const matches: KnowledgeMatch[] = [{ entry: entry(), covered: true }];
    render(<KnowledgeLensPanel matches={matches} onFileCoverageGap={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /file as coverage gap/i })).not.toBeInTheDocument();
    // R13-UI-2: collapsed to a count by default; detail one click away.
    expect(screen.getByText(/1 known risk domain already addressed/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /already addressed by firm or pack rules/i }));
    expect(screen.getByText(/already covers this domain/i)).toBeInTheDocument();
  });

  it('TC-R13-UI-1: gaps render before covered entries, in the distinct gap treatment', () => {
    const matches: KnowledgeMatch[] = [
      { entry: entry({ id: 'KL-A', risk_domain: 'Covered Domain' }), covered: true },
      { entry: entry({ id: 'KL-B', risk_domain: 'Gap Domain' }), covered: false },
    ];
    const { container } = render(<KnowledgeLensPanel matches={matches} />);
    const gapItem = container.querySelector('.knowledge-lens__item--gap');
    expect(gapItem).toHaveTextContent('Gap Domain');
    // Covered entry is not rendered above the gap — it sits collapsed below.
    const listedDomains = [...container.querySelectorAll('.knowledge-lens__domain')].map((e) => e.textContent);
    expect(listedDomains.join(' ')).not.toContain('Covered Domain');
  });

  it('TC-R13-UI-3: a filed gap renders the persistent Filed state instead of the button', () => {
    const matches: KnowledgeMatch[] = [{ entry: entry({ risk_domain: 'Gap Domain' }), covered: false }];
    render(
      <KnowledgeLensPanel matches={matches} onFileCoverageGap={vi.fn()} filedRiskDomains={['Gap Domain']} />,
    );
    expect(screen.getByText(/filed — on the rule-improvement queue/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /file as coverage gap/i })).not.toBeInTheDocument();
  });

  it('shows an uncovered match with a coverage-gap action and fires it on click', async () => {
    const user = userEvent.setup();
    const onFileCoverageGap = vi.fn();
    const matches: KnowledgeMatch[] = [{ entry: entry({ covering_rule_ids: [] }), covered: false }];
    render(<KnowledgeLensPanel matches={matches} onFileCoverageGap={onFileCoverageGap} />);
    expect(screen.getByText(/no firm or pack rule currently addresses/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /file as coverage gap/i }));
    expect(onFileCoverageGap).toHaveBeenCalledTimes(1);
    expect(onFileCoverageGap).toHaveBeenCalledWith(matches[0]);
  });
});
