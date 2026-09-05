'use client';

import type { IdentityErrorCode, UserProfileRow } from '@airdrop/contracts';
import { useRef, useState, type FormEvent } from 'react';

import type {
  IdentityApiClient,
  IdentityProfileUpdateInput,
} from '../../lib/identity-api-client.js';
import {
  createPendingActionGate,
  type PendingActionGate,
} from '../../lib/review-pending-action.js';
import {
  IdentityErrorState,
  IdentitySafetyNotice,
  IdentitySettingsNavigation,
} from './identity-settings-elements.js';

export type ProfileSettingsState =
  | { readonly status: 'loading' }
  | { readonly status: 'sign_in_required' }
  | { readonly status: 'failed'; readonly code: 'identity_query_failed' | 'identity_profile_not_found' }
  | { readonly status: 'ready'; readonly profile: UserProfileRow };

export type IdentitySubmissionState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'saved' }
  | { readonly status: 'failed'; readonly code: IdentityErrorCode }
  | {
    readonly status: 'conflict';
    readonly code: 'identity_version_conflict' | 'identity_idempotency_conflict';
  };

export interface ProfileDraft {
  readonly displayName: string;
  readonly avatarUrl: string;
  readonly timezone: string;
}

export function ProfileSettings({ state, api, onReload, initialSubmission }: {
  readonly state: ProfileSettingsState;
  readonly api: IdentityApiClient;
  readonly onReload: () => Promise<void>;
  readonly initialSubmission?: IdentitySubmissionState;
}) {
  return (
    <main className="settings-page">
      <header className="page-header">
        <h1 className="page-title">身份设置</h1>
        <p className="page-subtitle">管理公开资料与钱包地址，不涉及任何签名或链上交互。</p>
      </header>
      <IdentitySettingsNavigation current="profile" />
      <IdentitySafetyNotice />
      {state.status === 'loading' ? <p className="identity-message">正在加载个人资料…</p> : null}
      {state.status === 'sign_in_required' ? <IdentityErrorState code="identity_session_required" /> : null}
      {state.status === 'failed' ? <IdentityErrorState code={state.code} /> : null}
      {state.status === 'ready' ? (
        <ProfileForm
          key={`${state.profile.userId}:${state.profile.version}`}
          profile={state.profile}
          api={api}
          onReload={onReload}
          {...(initialSubmission === undefined ? {} : { initialSubmission })}
        />
      ) : null}
    </main>
  );
}

function ProfileForm({ profile, api, onReload, initialSubmission }: {
  readonly profile: UserProfileRow;
  readonly api: IdentityApiClient;
  readonly onReload: () => Promise<void>;
  readonly initialSubmission?: IdentitySubmissionState;
}) {
  const [draft, setDraft] = useState<ProfileDraft>({
    displayName: profile.displayName ?? '',
    avatarUrl: profile.avatarUrl ?? '',
    timezone: profile.timezone ?? '',
  });
  const [submission, setSubmission] = useState<IdentitySubmissionState>(
    initialSubmission ?? { status: 'idle' },
  );
  const submissionGate = useRef(createPendingActionGate());
  const pending = submission.status === 'submitting';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setSubmission({ status: 'submitting' });
    setSubmission(await submitProfileUpdateOnce(submissionGate.current, { api, profile, draft, onReload }));
  }

  return (
    <section className="card identity-card" aria-labelledby="profile-settings-heading">
      <h2 id="profile-settings-heading">个人资料</h2>
      <p className="identity-version">当前版本 v{profile.version}</p>
      <form className="identity-form" onSubmit={(event) => { void submit(event); }}>
        <IdentityTextField id="identity-display-name" label="显示名称" value={draft.displayName} disabled={pending} onChange={(displayName) => setDraft((value) => ({ ...value, displayName }))} />
        <IdentityTextField id="identity-avatar-url" label="头像 HTTPS URL（可选）" value={draft.avatarUrl} disabled={pending} onChange={(avatarUrl) => setDraft((value) => ({ ...value, avatarUrl }))} />
        <IdentityTextField id="identity-timezone" label="时区（可选）" value={draft.timezone} disabled={pending} onChange={(timezone) => setDraft((value) => ({ ...value, timezone }))} />
        <SubmissionState state={submission} onReload={onReload} />
        <button className="button identity-primary-button" type="submit" disabled={pending}>
          {pending ? '正在保存…' : '保存个人资料'}
        </button>
      </form>
    </section>
  );
}

export function buildProfileUpdateInput(
  profile: UserProfileRow,
  draft: ProfileDraft,
): IdentityProfileUpdateInput {
  return {
    expectedVersion: profile.version,
    displayName: nullIfEmpty(draft.displayName),
    avatarUrl: nullIfEmpty(draft.avatarUrl),
    timezone: nullIfEmpty(draft.timezone),
  };
}

export async function submitProfileUpdate(input: {
  readonly api: IdentityApiClient;
  readonly profile: UserProfileRow;
  readonly draft: ProfileDraft;
  readonly onReload: () => Promise<void>;
}): Promise<IdentitySubmissionState> {
  const result = await input.api.updateProfile(buildProfileUpdateInput(input.profile, input.draft));
  if (result.ok) {
    await input.onReload();
    return { status: 'saved' };
  }
  return submissionFailure(result.code);
}

export async function submitProfileUpdateOnce(
  gate: PendingActionGate,
  input: Parameters<typeof submitProfileUpdate>[0],
): Promise<IdentitySubmissionState> {
  if (!gate.begin()) return { status: 'submitting' };
  try {
    return await submitProfileUpdate(input);
  } finally {
    gate.finish();
  }
}

export function submissionFailure(code: IdentityErrorCode): IdentitySubmissionState {
  return code === 'identity_version_conflict' || code === 'identity_idempotency_conflict'
    ? { status: 'conflict', code }
    : { status: 'failed', code };
}

export function SubmissionState({ state, onReload }: {
  readonly state: IdentitySubmissionState;
  readonly onReload: () => Promise<void>;
}) {
  if (state.status === 'idle' || state.status === 'submitting') return null;
  if (state.status === 'saved') {
    return <p className="identity-message identity-message-success" role="status">已保存。</p>;
  }
  return (
    <div>
      <IdentityErrorState code={state.code} />
      {state.status === 'conflict' ? (
        <button className="button" type="button" onClick={() => { void onReload(); }}>重新加载并核对</button>
      ) : null}
    </div>
  );
}

function IdentityTextField({ id, label, value, disabled, onChange }: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="identity-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />
    </div>
  );
}

function nullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
