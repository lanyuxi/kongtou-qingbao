import Link from 'next/link';

import { createServerSupabaseClient } from '../../lib/supabase-server.js';

export const dynamic = 'force-dynamic';

interface SignalRow {
  readonly id: string;
  readonly signal_type: string;
  readonly title: string;
  readonly summary: string | null;
  readonly confidence: number | null;
  readonly verification: string | null;
  readonly lifecycle: string | null;
  readonly projects: { readonly name: string; readonly slug: string } | null;
}

const verificationLabels: Readonly<Record<string, string>> = {
  unverified: '未验证',
  corroborated: '多方印证',
  verified: '已验证',
  disputed: '存在争议',
  retracted: '已撤回',
};

export default async function IntelligencePage() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('signals')
    .select('id, signal_type, title, summary, confidence, verification, lifecycle, projects(name, slug)')
    .order('published_at', { ascending: false, nullsFirst: false });

  const signals = (data ?? []) as readonly SignalRow[];

  return (
    <div className="content">
      <div className="card">
        <h2 className="card-heading">情报</h2>
        <p className="page-subtitle">
          仅展示已通过核验并发布的信号。候选与未验证内容不会在此出现。
        </p>

        {error ? (
          <p className="empty-state">加载失败：{error.message}</p>
        ) : signals.length === 0 ? (
          <p className="empty-state">暂无已发布的情报信号。</p>
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
                  <span className="badge">{signal.signal_type}</span>
                  {signal.confidence === null ? null : (
                    <span className="badge">置信度 {signal.confidence}</span>
                  )}
                </p>
                {signal.summary ? <p>{signal.summary}</p> : null}
                {signal.projects ? (
                  <p>
                    <Link href={`/projects/${signal.projects.slug}`}>{signal.projects.name}</Link>
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
