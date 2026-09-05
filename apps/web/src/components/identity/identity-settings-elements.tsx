import Link from 'next/link';

import type { IdentityErrorCode } from '@airdrop/contracts';

export const identitySafetyMessage =
  '本产品永远不会索取私钥、助记词、钱包密码或签名密钥，只存储公开钱包地址。';

export function IdentitySafetyNotice() {
  return (
    <aside className="identity-safety" aria-label="钱包安全说明">
      <strong>安全边界</strong>
      <span>{identitySafetyMessage}</span>
    </aside>
  );
}

export function IdentitySettingsNavigation({ current }: {
  readonly current: 'profile' | 'wallets';
}) {
  return (
    <nav className="tabs" aria-label="身份设置">
      <Link className={`tab${current === 'profile' ? ' active' : ''}`} href="/settings/profile">个人资料</Link>
      <Link className={`tab${current === 'wallets' ? ' active' : ''}`} href="/settings/wallets">钱包地址</Link>
    </nav>
  );
}

export function identityErrorMessage(code: IdentityErrorCode): string {
  switch (code) {
    case 'identity_address_invalid':
      return '钱包地址格式无效。';
    case 'identity_address_duplicate':
      return '该钱包地址已添加。';
    case 'identity_address_limit_reached':
      return '最多只能保存 5 个钱包地址。';
    case 'identity_version_conflict':
      return '记录已发生变化，请重新加载并核对后再操作。';
    case 'identity_idempotency_conflict':
      return '提交标识发生冲突，请重新加载并核对后再操作。';
    case 'identity_command_invalid':
      return '提交内容无效，未发送请求。';
    case 'identity_session_required':
      return 'sign_in_required：需要有效会话才能管理身份设置。';
    case 'identity_query_failed':
    case 'identity_profile_not_found':
      return '身份设置暂时无法加载。';
    case 'identity_persistence_failed':
      return '身份设置暂时无法保存。';
  }
}

export function IdentityErrorState({ code }: { readonly code: IdentityErrorCode }) {
  return <p className="identity-message identity-message-error" role="alert">{identityErrorMessage(code)}</p>;
}
