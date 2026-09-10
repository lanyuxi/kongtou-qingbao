import Link from 'next/link';

import { createServerSupabaseClient } from '../../lib/supabase-server.js';

export const dynamic = 'force-dynamic';

interface ProjectRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly summary: string | null;
  readonly lifecycle: string | null;
  readonly primary_chain: string | null;
}

const lifecycleLabels: Readonly<Record<string, string>> = {
  rumored: '传闻',
  active: '进行中',
  paused: '暂停',
  ended: '已结束',
  archived: '已归档',
};

export default async function ProjectsPage() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, summary, lifecycle, primary_chain')
    .order('name');

  const projects = (data ?? []) as readonly ProjectRow[];

  return (
    <div className="content">
      <div className="card">
        <h2 className="card-heading">项目库</h2>
        <p className="page-subtitle">
          平台收录的全部项目。标注仅反映已核验的公开信息，不构成参与建议。
        </p>

        {error ? (
          <p className="empty-state">加载失败：{error.message}</p>
        ) : projects.length === 0 ? (
          <p className="empty-state">暂无项目数据。</p>
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
      </div>
    </div>
  );
}
