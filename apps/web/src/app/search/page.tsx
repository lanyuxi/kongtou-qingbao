import Link from 'next/link';

import { createServerSupabaseClient } from '../../lib/supabase-server.js';

export const dynamic = 'force-dynamic';

const maxQueryLength = 80;
const scanLimit = 200;

interface ProjectRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly summary: string | null;
  readonly lifecycle: string | null;
  readonly primary_chain: string | null;
}

interface SignalRow {
  readonly id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly verification: string | null;
  readonly projects: { readonly name: string; readonly slug: string } | null;
}

const lifecycleLabels: Readonly<Record<string, string>> = {
  rumored: '传闻',
  active: '进行中',
  paused: '暂停',
  ended: '已结束',
  archived: '已归档',
};

const verificationLabels: Readonly<Record<string, string>> = {
  unverified: '未验证',
  corroborated: '多方印证',
  verified: '已验证',
  disputed: '存在争议',
  retracted: '已撤回',
};

/**
 * Filtering happens in memory rather than through a PostgREST `or=` filter.
 * That filter is a string expression where commas, parentheses and dots are
 * structural, so a user-supplied term would have to be escaped very carefully
 * to stay a value. The readable set is small (anon sees only active/rumored
 * projects and published signals), so scanning it is both simpler and safe.
 */
function normalizeQuery(value: string | undefined): string {
  return (value ?? '').trim().slice(0, maxQueryLength);
}

function matches(haystack: readonly (string | null)[], needle: string): boolean {
  const lowered = needle.toLowerCase();
  return haystack.some((value) => (value ?? '').toLowerCase().includes(lowered));
}

export default async function SearchPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly q?: string }>;
}) {
  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const supabase = createServerSupabaseClient();

  const projectsResult = await supabase
    .from('projects')
    .select('id, slug, name, summary, lifecycle, primary_chain')
    .order('name')
    .limit(scanLimit);
  const signalsResult = await supabase
    .from('signals')
    .select('id, title, summary, verification, projects(name, slug)')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(scanLimit);

  const projects =
    query === ''
      ? []
      : ((projectsResult.data ?? []) as readonly ProjectRow[]).filter((project) =>
          matches([project.name, project.summary, project.primary_chain], query),
        );
  const signals =
    query === ''
      ? []
      : ((signalsResult.data ?? []) as readonly SignalRow[]).filter((signal) =>
          matches([signal.title, signal.summary], query),
        );

  return (
    <main>
      <div className="page-header">
        <h1 className="page-title">搜索</h1>
        <p className="page-subtitle">
          检索项目库与已发布情报。结果只包含当前可公开的内容。
        </p>
      </div>

      {query === '' ? (
        <section className="card">
          <p className="empty-state">在上方输入关键词开始搜索。</p>
        </section>
      ) : (
        <>
          <section className="card">
            <h2 className="card-heading">项目 · {projects.length} 条</h2>
            {projects.length === 0 ? (
              <p className="empty-state">没有匹配的项目。</p>
            ) : (
              <div className="detail-grid">
                {projects.map((project) => (
                  <div key={project.id} className="card">
                    <Link href={`/projects/${project.slug}`} className="card-heading">
                      {project.name}
                    </Link>
                    <p>
                      {project.lifecycle ? (
                        <span className="badge">
                          {lifecycleLabels[project.lifecycle] ?? project.lifecycle}
                        </span>
                      ) : null}
                      {project.primary_chain ? (
                        <span className="badge">{project.primary_chain}</span>
                      ) : null}
                    </p>
                    {project.summary ? <p>{project.summary}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="card-heading">情报 · {signals.length} 条</h2>
            {signals.length === 0 ? (
              <p className="empty-state">没有匹配的情报。</p>
            ) : (
              <div className="detail-grid">
                {signals.map((signal) => (
                  <div key={signal.id} className="card">
                    <h3 className="card-heading">{signal.title}</h3>
                    <p>
                      {signal.verification ? (
                        <span className="badge">
                          {verificationLabels[signal.verification] ?? signal.verification}
                        </span>
                      ) : null}
                      {signal.projects ? (
                        <Link href={`/projects/${signal.projects.slug}`}>
                          {signal.projects.name}
                        </Link>
                      ) : null}
                    </p>
                    {signal.summary ? <p>{signal.summary}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
