'use client';

import type {
  ReviewerSecurityCandidateDetail,
  SecurityCandidateReviewCommandV1,
  SecurityCandidateDecision,
  SecurityIncidentCategory,
  SecurityIndicatorType,
  SecuritySeverity,
  SecurityTargetType,
  ActiveSecurityPosture,
} from '@airdrop/contracts';
import { securityCandidateReviewCommandV1Schema } from '@airdrop/contracts';
import { useRef, useState, type FormEvent } from 'react';

import { createPendingActionGate, type PendingActionGate } from '../../lib/review-pending-action.js';
import type { SecurityReviewApiClient } from '../../lib/security-review-api-client.js';
import type { ReviewSessionController } from '../../lib/review-session.js';
import { formatReviewDate } from './failed-ai-run-list.js';
import { displayReviewValue } from './safe-review-text.js';

export type SecurityCandidateDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'not_found' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly candidate: ReviewerSecurityCandidateDetail };

export function SecurityCandidateDetail({ candidate }: { readonly candidate: ReviewerSecurityCandidateDetail }) {
  const target = candidate.target === null
    ? candidate.targetContext === null ? '—' : `提取上下文 · project ${candidate.targetContext.projectId} · source ${candidate.targetContext.sourceId}`
    : `${candidate.target.type} · ${candidate.target.id}`;
  return <div className="review-detail">
    <section className="review-panel" aria-labelledby="security-candidate-heading"><div className="review-panel-heading"><div><h1 id="security-candidate-heading">安全候选</h1><p>候选并非已确认安全事件；所有决定必须以 Evidence 为依据。</p></div><span className="review-badge">{candidate.state}</span></div><dl className="review-metadata"><Metadata label="候选 ID" value={candidate.candidateId} /><Metadata label="来源" value={candidate.origin} literal /><Metadata label="当前版本" value={String(candidate.stateVersion)} literal /><Metadata label="摘要" value={candidate.summary} /><Metadata label="备注" value={candidate.note ?? '—'} /><Metadata label="创建时间" value={formatReviewDate(candidate.createdAt)} literal /></dl></section>
    <section className="review-panel" aria-labelledby="security-candidate-evidence-heading"><h2 id="security-candidate-evidence-heading">Evidence 链</h2><dl className="review-metadata"><Metadata label="目标" value={target} literal /><Metadata label="Evidence ID" value={candidate.evidenceId ?? '提取候选尚未选择 Evidence'} literal /><Metadata label="指标类型" value={candidate.indicator?.type ?? '提取候选尚未选择指标'} literal /><Metadata label="指标值" value={candidate.indicator?.value ?? '提取候选尚未选择指标'} /></dl></section>
  </div>;
}

export async function loadSecurityCandidateDetail({ session, api, candidateId, redirect }: { readonly session: ReviewSessionController; readonly api: SecurityReviewApiClient; readonly candidateId: string; readonly redirect: (path: string) => void }): Promise<SecurityCandidateDetailState> {
  if (await session.getAccessToken() === null) { redirect('/review/sign-in'); return { status: 'loading' }; }
  const result = await api.getCandidate(candidateId);
  if (result.ok) return { status: 'ready', candidate: result.data };
  if (result.state === 'sign_in_required') { await session.signOut(); redirect('/review/sign-in'); return { status: 'loading' }; }
  if (result.state === 'forbidden') { await session.signOut(); return { status: 'forbidden' }; }
  if (result.state === 'not_found') return { status: 'not_found' };
  return { status: 'failed' };
}

export function SecurityCandidateReviewForm({ api, candidate, onRefresh, onSessionExpired }: { readonly api: SecurityReviewApiClient; readonly candidate: ReviewerSecurityCandidateDetail; readonly onRefresh: () => Promise<void>; readonly onSessionExpired: () => void }) {
  const [draft, setDraft] = useState<SecurityCandidateReviewDraft>(initialCandidateDraft(candidate)); const [state, setState] = useState<SecuritySubmissionState>({ status: 'idle' }); const gate = useRef(createPendingActionGate());
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setState({ status: 'submitting' }); setState(await submitCandidateReviewOnce(gate.current, { api, candidate, draft, refresh: onRefresh, sessionExpired: onSessionExpired })); }
  const disabled = state.status === 'submitting'; const highImpact = draft.decision === 'accept_and_open' || draft.decision === 'accept_and_attach';
  return <form className="review-form" onSubmit={(event) => { void submit(event); }}>
    <Field label="决策"><select value={draft.decision} disabled={disabled} onChange={(event) => setDraft((value) => ({ ...value, decision: event.currentTarget.value as SecurityCandidateDecision }))}>{candidateDecisions.map((decision) => <option key={decision} value={decision}>{decision}</option>)}</select></Field>
    {highImpact ? <><Field label="目标类型"><select value={draft.targetType} disabled={disabled} onChange={(event) => setDraft((value) => ({ ...value, targetType: event.currentTarget.value as SecurityTargetType }))}><option value="project">项目</option><option value="source">来源</option></select></Field><Text label="目标 ID" value={draft.targetId} disabled={disabled} onChange={(targetId) => setDraft((value) => ({ ...value, targetId }))} /><Text label="证据 ID" value={draft.evidenceId} disabled={disabled} onChange={(evidenceId) => setDraft((value) => ({ ...value, evidenceId }))} /><Field label="指标类型"><select value={draft.indicatorType} disabled={disabled} onChange={(event) => setDraft((value) => ({ ...value, indicatorType: event.currentTarget.value as SecurityIndicatorType }))}>{indicatorTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field><Text label="指标值" value={draft.indicatorValue} disabled={disabled} onChange={(indicatorValue) => setDraft((value) => ({ ...value, indicatorValue }))} />{draft.decision === 'accept_and_open' ? <><Field label="类别"><select value={draft.category} disabled={disabled} onChange={(event) => setDraft((value) => ({ ...value, category: event.currentTarget.value as SecurityIncidentCategory }))}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field><Field label="拟议处置"><select value={draft.resultingPosture} disabled={disabled} onChange={(event) => setDraft((value) => ({ ...value, resultingPosture: event.currentTarget.value as ActiveSecurityPosture }))}><option value="caution">caution</option><option value="blocked">blocked</option></select></Field><Field label="严重性"><select value={draft.resultingSeverity} disabled={disabled} onChange={(event) => setDraft((value) => ({ ...value, resultingSeverity: event.currentTarget.value as SecuritySeverity }))}>{severities.map((severity) => <option key={severity} value={severity}>{severity}</option>)}</select></Field><Text label="公开摘要" value={draft.publicSummary} disabled={disabled} onChange={(publicSummary) => setDraft((value) => ({ ...value, publicSummary }))} multiline /></> : <><Text label="事件 ID" value={draft.incidentId} disabled={disabled} onChange={(incidentId) => setDraft((value) => ({ ...value, incidentId }))} /><Text label="事件当前版本" value={draft.expectedIncidentVersion} disabled={disabled} onChange={(expectedIncidentVersion) => setDraft((value) => ({ ...value, expectedIncidentVersion }))} /></>}</> : null}
    <Text label="内部备注（可选）" value={draft.note} disabled={disabled} onChange={(note) => setDraft((value) => ({ ...value, note }))} multiline />
    {highImpact ? <SecurityCommandConfirmation target={`${draft.targetType} · ${draft.targetId || '未填写'}`} currentPosture="无（候选尚未打开事件）" proposedPosture={draft.decision === 'accept_and_open' ? draft.resultingPosture : '附加至既有事件'} severity={draft.resultingSeverity} category={draft.category} reason="evidence_verified" evidenceId={draft.evidenceId} publicSummary={draft.publicSummary} /> : null}
    <SubmissionMessage state={state} /><button className="review-button" type="submit" disabled={disabled}>{disabled ? '正在提交…' : '提交候选决策'}</button>
  </form>;
}

export interface SecurityCandidateReviewDraft { readonly decision: SecurityCandidateDecision; readonly targetType: SecurityTargetType; readonly targetId: string; readonly evidenceId: string; readonly indicatorType: SecurityIndicatorType; readonly indicatorValue: string; readonly category: SecurityIncidentCategory; readonly resultingPosture: ActiveSecurityPosture; readonly resultingSeverity: SecuritySeverity; readonly publicSummary: string; readonly incidentId: string; readonly expectedIncidentVersion: string; readonly note: string; }
export type SecuritySubmissionState = { readonly status: 'idle' | 'submitting' | 'saved' | 'conflict' | 'forbidden' | 'failed'; readonly message?: string };

export function buildCandidateReviewCommand(candidate: ReviewerSecurityCandidateDetail, draft: SecurityCandidateReviewDraft): SecurityCandidateReviewCommandV1 | null {
  const base = { version: 1 as const, candidateId: candidate.candidateId, expectedCandidateVersion: candidate.stateVersion, note: nullIfEmpty(draft.note) };
  const command = draft.decision === 'needs_review' ? { ...base, decision: 'needs_review' as const, reasonCode: 'insufficient_context' as const } : draft.decision === 'reject' ? { ...base, decision: 'reject' as const, reasonCode: 'claim_not_supported' as const } : draft.decision === 'accept_and_open' ? { ...base, decision: 'accept_and_open' as const, reasonCode: 'evidence_verified' as const, target: { type: draft.targetType, id: draft.targetId.trim() }, evidenceId: draft.evidenceId.trim(), indicator: { type: draft.indicatorType, value: draft.indicatorValue.trim() }, category: draft.category, resultingPosture: draft.resultingPosture, resultingSeverity: draft.resultingSeverity, publicSummary: draft.publicSummary.trim() } : { ...base, decision: 'accept_and_attach' as const, reasonCode: 'evidence_verified' as const, target: { type: draft.targetType, id: draft.targetId.trim() }, incidentId: draft.incidentId.trim(), expectedIncidentVersion: Number(draft.expectedIncidentVersion), evidenceId: draft.evidenceId.trim(), indicator: { type: draft.indicatorType, value: draft.indicatorValue.trim() } };
  const parsed = securityCandidateReviewCommandV1Schema.safeParse(command); return parsed.success ? parsed.data : null;
}

export async function submitCandidateReviewOnce(gate: PendingActionGate, input: { readonly api: SecurityReviewApiClient; readonly candidate: ReviewerSecurityCandidateDetail; readonly draft: SecurityCandidateReviewDraft; readonly refresh: () => Promise<void>; readonly sessionExpired: () => void }): Promise<SecuritySubmissionState> {
  if (!gate.begin()) return { status: 'submitting' }; try { const command = buildCandidateReviewCommand(input.candidate, input.draft); if (command === null) return { status: 'failed', message: '请填写完整且有效的候选决策。' }; const result = await input.api.reviewCandidate(input.candidate.candidateId, command); if (result.ok) { await input.refresh(); return { status: 'saved', message: '候选决策已保存，详情已刷新。' }; } if (result.state === 'sign_in_required') { input.sessionExpired(); return { status: 'forbidden', message: '当前账号没有有效的审核权限。' }; } if (result.state === 'forbidden') { input.sessionExpired(); return { status: 'forbidden', message: '当前账号没有有效的审核权限。' }; } if (result.state === 'conflict' && result.code === 'security_version_conflict') { await input.refresh(); return { status: 'conflict', message: '安全记录已更新，请检查最新版本后重新提交。' }; } return { status: 'failed', message: '安全候选决策暂时无法提交。请刷新后重试。' }; } finally { gate.finish(); }
}

export function SecurityCommandConfirmation({ target, currentPosture, proposedPosture, severity, category, reason, evidenceId, publicSummary }: { readonly target: string; readonly currentPosture: string; readonly proposedPosture: string; readonly severity: string; readonly category: string; readonly reason: string; readonly evidenceId: string; readonly publicSummary: string }) { return <section className="review-panel" aria-label="高影响命令确认"><h2>提交前确认</h2><dl className="review-metadata"><Metadata label="目标" value={target} /><Metadata label="当前处置" value={currentPosture} /><Metadata label="拟议处置" value={proposedPosture} /><Metadata label="严重性" value={severity} literal /><Metadata label="类别" value={category} literal /><Metadata label="原因" value={reason} literal /><Metadata label="证据 ID" value={evidenceId} literal /><Metadata label="公开摘要" value={publicSummary} /></dl></section>; }

function initialCandidateDraft(candidate: ReviewerSecurityCandidateDetail): SecurityCandidateReviewDraft { return { decision: 'reject', targetType: candidate.target?.type ?? 'project', targetId: candidate.target?.id ?? '', evidenceId: candidate.evidenceId ?? '', indicatorType: candidate.indicator?.type ?? 'domain', indicatorValue: candidate.indicator?.value ?? '', category: 'phishing', resultingPosture: 'blocked', resultingSeverity: 'high', publicSummary: '', incidentId: '', expectedIncidentVersion: '', note: '' }; }
function Metadata({ label, value, literal = false }: { readonly label: string; readonly value: string; readonly literal?: boolean }) { return <div><dt>{label}</dt><dd>{literal ? value : displayReviewValue(value)}</dd></div>; }
function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }) { return <div className="review-field"><label>{label}</label>{children}</div>; }
function Text({ label, value, disabled, onChange, multiline = false }: { readonly label: string; readonly value: string; readonly disabled: boolean; readonly onChange: (value: string) => void; readonly multiline?: boolean }) { return <div className="review-field"><label>{label}</label>{multiline ? <textarea value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} /> : <input value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />}</div>; }
function SubmissionMessage({ state }: { readonly state: SecuritySubmissionState }) { return state.message === undefined ? null : <p className={`review-message${state.status === 'saved' ? '' : ' review-message-error'}`} role={state.status === 'saved' ? 'status' : 'alert'}>{state.message}</p>; }
function nullIfEmpty(value: string): string | null { const trimmed = value.trim(); return trimmed === '' ? null : trimmed; }
const candidateDecisions = ['needs_review', 'reject', 'accept_and_open', 'accept_and_attach'] as const satisfies readonly SecurityCandidateDecision[];
const indicatorTypes = ['domain', 'url', 'contract_address', 'transaction_hash', 'social_account', 'observed_behavior'] as const satisfies readonly SecurityIndicatorType[];
const categories = ['phishing', 'impersonation', 'malicious_contract', 'source_compromise', 'fraudulent_claim', 'fund_loss', 'other_security_risk'] as const satisfies readonly SecurityIncidentCategory[];
const severities = ['low', 'medium', 'high', 'critical'] as const satisfies readonly SecuritySeverity[];
