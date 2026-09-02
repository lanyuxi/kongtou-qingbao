import type {
  PublicTutorialDetail,
  PublicTutorialLink,
  PublicTutorialListItem,
} from '@airdrop/contracts';
import Link from 'next/link';

import { formatTimestamp } from '../opportunity-elements.js';

/**
 * Public tutorial rendering. Every outbound URL on this surface comes from the
 * ledger-resolved projection (`link.url`), never from step text: the public
 * views resolve each reference through the Phase 7B ledger and null the url of
 * anything not currently renderable, and the link guard refuses to render an
 * anchor unless both `renderable` and a url arrived together.
 */
export function TutorialCard({ item }: { readonly item: PublicTutorialListItem }) {
  return (
    <article className="card tutorial-card">
      <h3 className="tutorial-card-title">
        <Link className="tutorial-card-link" href={`/tutorials/${item.tutorialId}`}>
          {item.title}
        </Link>
      </h3>
      <p className="tutorial-card-summary">{item.summary}</p>
      <p className="tutorial-card-meta">
        {`${item.kind} · ${item.stepCount} 个步骤 · v${item.version}`}
        {item.lastVerifiedAt === null ? null : (
          <>
            {' · '}
            <time dateTime={item.lastVerifiedAt}>{`核验于 ${formatTimestamp(item.lastVerifiedAt)}`}</time>
          </>
        )}
      </p>
    </article>
  );
}

export function TutorialCardList({ items }: {
  readonly items: readonly PublicTutorialListItem[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="card detail-section">
      <h2 className="detail-section-title">参与教程</h2>
      <div className="tutorial-card-grid">
        {items.map((item) => <TutorialCard key={item.tutorialId} item={item} />)}
      </div>
    </section>
  );
}

export function PublicTutorialDetail({ tutorial }: { readonly tutorial: PublicTutorialDetail }) {
  return (
    <article className="card tutorial-detail">
      <h1 className="page-title">{tutorial.title}</h1>
      <p className="page-subtitle">
        {`${tutorial.kind} · v${tutorial.version} · 发布于 ${formatTimestamp(tutorial.publishedAt)}`}
        {tutorial.lastVerifiedAt === null ? null : (
          <>
            {' · '}
            <time dateTime={tutorial.lastVerifiedAt}>{`核验于 ${formatTimestamp(tutorial.lastVerifiedAt)}`}</time>
          </>
        )}
      </p>
      <div className="explanation-box">{tutorial.summary}</div>
      <ol className="tutorial-steps">
        {tutorial.steps.map((step) => (
          <li key={step.ordinal} className="tutorial-step">
            <h2 className="tutorial-step-title">{`步骤 ${step.ordinal} · ${step.title}`}</h2>
            <p className="tutorial-step-body">{step.body}</p>
            {step.links.length === 0
              ? null
              : (
                <ul className="tutorial-step-links">
                  {step.links.map((link) => (
                    <li key={link.referenceId}>
                      <TutorialLink link={link} />
                    </li>
                  ))}
                </ul>
              )}
          </li>
        ))}
      </ol>
    </article>
  );
}

export function TutorialLink({ link }: { readonly link: PublicTutorialLink }) {
  if (link.renderable !== true || link.url === null) {
    // A not-renderable reference keeps its place as inert text; it must never
    // render as an anchor, whatever the projection carried in `url`.
    return <span className="tutorial-link-unavailable">{`${link.label ?? '相关引用'}（暂不可用）`}</span>;
  }
  return (
    <span className="tutorial-link">
      <a href={link.url} rel="noreferrer noopener" target="_blank">
        {link.label ?? link.url}
      </a>
      {link.lastVerifiedAt === null ? null : (
        <time className="tutorial-link-verified" dateTime={link.lastVerifiedAt}>
          {`（核验于 ${formatTimestamp(link.lastVerifiedAt)}）`}
        </time>
      )}
    </span>
  );
}
