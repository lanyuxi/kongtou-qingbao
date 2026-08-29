'use client';

import type { ManualSecurityCandidateCommandV1, SecurityIndicatorType, SecurityTargetType } from '@airdrop/contracts';
import { manualSecurityCandidateCommandV1Schema } from '@airdrop/contracts';
import { useRef, useState, type FormEvent } from 'react';

import { createPendingActionGate } from '../../lib/review-pending-action.js';
import type { SecurityReviewApiClient } from '../../lib/security-review-api-client.js';

export interface ManualSecurityCandidateDraft { readonly targetType: SecurityTargetType; readonly targetId: string; readonly evidenceId: string; readonly indicatorType: SecurityIndicatorType; readonly indicatorValue: string; readonly summary: string; readonly note: string; }
const initialDraft: ManualSecurityCandidateDraft = { targetType: 'project', targetId: '', evidenceId: '', indicatorType: 'domain', indicatorValue: '', summary: '', note: '' };

export function SecurityCandidateForm({ api, onComplete, onSessionExpired }: { readonly api: SecurityReviewApiClient; readonly onComplete: (candidateId: string) => Promise<void>; readonly onSessionExpired: () => void }) {
  const [draft, setDraft] = useState(initialDraft); const [message, setMessage] = useState<string | null>(null); const [pending, setPending] = useState(false); const gate = useRef(createPendingActionGate());
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!gate.current.begin()) return; setPending(true); setMessage(null); try { const command = buildManualSecurityCandidateCommand(draft); if (command === null) { setMessage('请填写完整且有效的目标、证据和候选信息。'); return; } const result = await api.submitManualCandidate(command); if (result.ok) { await onComplete(result.data.candidateId); return; } if (result.state === 'sign_in_required' || result.state === 'forbidden') { onSessionExpired(); setMessage('当前账号没有有效的审核权限。'); return; } setMessage('安全候选暂时无法提交。请刷新后重试。'); } finally { gate.current.finish(); setPending(false); } }
  return <form className="review-form" onSubmit={(event) => { void submit(event); }}>
    <p>仅可提交已核验的 Evidence 引用；目标类型和目标 ID 必须由审核者明确选择并填写。</p>
    <Field label="目标类型"><select value={draft.targetType} disabled={pending} onChange={(event) => setDraft((value) => ({ ...value, targetType: event.currentTarget.value as SecurityTargetType }))}><option value="project">项目</option><option value="source">来源</option></select></Field>
    <Text label="目标 ID" value={draft.targetId} disabled={pending} onChange={(targetId) => setDraft((value) => ({ ...value, targetId }))} />
    <Text label="证据 ID" value={draft.evidenceId} disabled={pending} onChange={(evidenceId) => setDraft((value) => ({ ...value, evidenceId }))} />
    <Field label="指标类型"><select value={draft.indicatorType} disabled={pending} onChange={(event) => setDraft((value) => ({ ...value, indicatorType: event.currentTarget.value as SecurityIndicatorType }))}>{indicatorTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
    <Text label="指标值" value={draft.indicatorValue} disabled={pending} onChange={(indicatorValue) => setDraft((value) => ({ ...value, indicatorValue }))} />
    <Text label="摘要" value={draft.summary} disabled={pending} onChange={(summary) => setDraft((value) => ({ ...value, summary }))} multiline />
    <Text label="内部备注（可选）" value={draft.note} disabled={pending} onChange={(note) => setDraft((value) => ({ ...value, note }))} multiline />
    {message === null ? null : <p className="review-message review-message-error" role="alert">{message}</p>}<button className="review-button" type="submit" disabled={pending}>{pending ? '正在提交…' : '提交人工候选'}</button>
  </form>;
}

export function buildManualSecurityCandidateCommand(draft: ManualSecurityCandidateDraft): ManualSecurityCandidateCommandV1 | null {
  const parsed = manualSecurityCandidateCommandV1Schema.safeParse({ version: 1, target: { type: draft.targetType, id: draft.targetId.trim() }, evidenceId: draft.evidenceId.trim(), indicator: { type: draft.indicatorType, value: draft.indicatorValue.trim() }, summary: draft.summary.trim(), note: emptyToNull(draft.note) });
  return parsed.success ? parsed.data : null;
}

const indicatorTypes = ['domain', 'url', 'contract_address', 'transaction_hash', 'social_account', 'observed_behavior'] as const satisfies readonly SecurityIndicatorType[];
function emptyToNull(value: string): string | null { const trimmed = value.trim(); return trimmed === '' ? null : trimmed; }
function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }) { return <div className="review-field"><label>{label}</label>{children}</div>; }
function Text({ label, value, disabled, onChange, multiline = false }: { readonly label: string; readonly value: string; readonly disabled: boolean; readonly onChange: (value: string) => void; readonly multiline?: boolean }) { return <div className="review-field"><label>{label}</label>{multiline ? <textarea value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} /> : <input value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />}</div>; }
