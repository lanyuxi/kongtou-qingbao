/* global console, process */

const requiredEnvironmentNames = [
  'AIRDROP_DATABASE_TEST_URL',
  'AIRDROP_ANON_SUPABASE_URL',
  'AIRDROP_ANON_SUPABASE_KEY',
];

if (
  requiredEnvironmentNames.some(
    (name) => process.env[name] === undefined || process.env[name] === '',
  )
) {
  console.error(
    'Database repository integration requires AIRDROP_DATABASE_TEST_URL, AIRDROP_ANON_SUPABASE_URL, and AIRDROP_ANON_SUPABASE_KEY.',
  );
  process.exitCode = 1;
}
