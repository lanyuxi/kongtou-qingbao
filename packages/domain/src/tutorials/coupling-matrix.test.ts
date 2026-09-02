import { describe, expect, it } from 'vitest';

import { resolveTutorialStatusTransition, tutorialTriggerSeverity } from './coupling-matrix.js';

describe('tutorial trigger severity (D5)', () => {
  it('treats only project blocking as a security-level demotion', () => {
    expect(tutorialTriggerSeverity('project_blocked')).toBe('blocked');
  });

  it('treats content-level triggers as review queueing', () => {
    expect(tutorialTriggerSeverity('source_blocked')).toBe('needs_review');
    expect(tutorialTriggerSeverity('reference_unrenderable')).toBe('needs_review');
    expect(tutorialTriggerSeverity('signal_disputed')).toBe('needs_review');
    expect(tutorialTriggerSeverity('signal_retracted')).toBe('needs_review');
    expect(tutorialTriggerSeverity('lifecycle_changed')).toBe('needs_review');
  });
});

describe('tutorial status transitions', () => {
  it('demotes a published tutorial per the trigger severity', () => {
    expect(resolveTutorialStatusTransition('published', 'project_blocked')).toBe('blocked');
    expect(resolveTutorialStatusTransition('published', 'source_blocked')).toBe('needs_review');
    expect(resolveTutorialStatusTransition('published', 'reference_unrenderable')).toBe(
      'needs_review',
    );
    expect(resolveTutorialStatusTransition('published', 'signal_disputed')).toBe('needs_review');
    expect(resolveTutorialStatusTransition('published', 'signal_retracted')).toBe('needs_review');
    expect(resolveTutorialStatusTransition('published', 'lifecycle_changed')).toBe('needs_review');
  });

  it('escalates a needs_review tutorial only when security demands it', () => {
    expect(resolveTutorialStatusTransition('needs_review', 'project_blocked')).toBe('blocked');
    expect(resolveTutorialStatusTransition('needs_review', 'source_blocked')).toBeNull();
    expect(resolveTutorialStatusTransition('needs_review', 'signal_disputed')).toBeNull();
  });

  it('never demotes a blocked tutorial automatically', () => {
    expect(resolveTutorialStatusTransition('blocked', 'project_blocked')).toBeNull();
    expect(resolveTutorialStatusTransition('blocked', 'source_blocked')).toBeNull();
    expect(resolveTutorialStatusTransition('blocked', 'signal_retracted')).toBeNull();
  });

  it('leaves non-public and terminal states untouched', () => {
    expect(resolveTutorialStatusTransition('draft', 'project_blocked')).toBeNull();
    expect(resolveTutorialStatusTransition('in_review', 'project_blocked')).toBeNull();
    expect(resolveTutorialStatusTransition('retired', 'project_blocked')).toBeNull();
  });
});
