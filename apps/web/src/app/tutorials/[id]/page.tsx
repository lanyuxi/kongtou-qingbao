import { notFound } from 'next/navigation';

import { createTutorialPublicRepository } from '@airdrop/database';
import { z } from 'zod';

import { PublicTutorialDetail } from '../../../components/tutorial/public-tutorial.js';
import { createServerSupabaseClient } from '../../../lib/supabase-server.js';

export const dynamic = 'force-dynamic';

export default async function TutorialDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const tutorialId = z.uuid().safeParse(id);
  if (!tutorialId.success) {
    notFound();
  }

  // The public projection only exposes published tutorials outside blocked
  // projects; anything else arrives here as an empty read and renders as 404.
  const repository = createTutorialPublicRepository(createServerSupabaseClient());
  const tutorial = await repository.getTutorial({ tutorialId: tutorialId.data }).catch(() => null);
  if (tutorial === null) {
    notFound();
  }

  return (
    <main>
      <PublicTutorialDetail tutorial={tutorial} />
      <p className="fixture-note">
        教程链接全部来自已验证的白名单引用；引用或项目安全状态变化时，教程会自动进入待审或下线状态。
      </p>
    </main>
  );
}
