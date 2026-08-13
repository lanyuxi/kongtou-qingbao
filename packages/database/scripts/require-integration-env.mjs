/* global console, process */

const requiredEnvironmentNames = [
  'AIRDROP_DATABASE_TEST_URL',
  'AIRDROP_ANON_SUPABASE_URL',
  'AIRDROP_ANON_SUPABASE_KEY',
  'AIRDROP_QUEUE_ADMIN_DATABASE_TEST_URL',
];

if (
  requiredEnvironmentNames.some(
    (name) => process.env[name] === undefined || process.env[name] === '',
  )
) {
  console.error(
    'Database repository integration requires AIRDROP_DATABASE_TEST_URL, AIRDROP_ANON_SUPABASE_URL, AIRDROP_ANON_SUPABASE_KEY, and AIRDROP_QUEUE_ADMIN_DATABASE_TEST_URL.',
  );
  process.exitCode = 1;
}
