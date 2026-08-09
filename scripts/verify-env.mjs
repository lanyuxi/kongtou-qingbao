const requiredNames = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
];

const missingNames = requiredNames.filter((name) => !process.env[name]?.trim());

if (missingNames.length > 0) {
  process.stdout.write(`${missingNames.join('\n')}\n`);
  process.exitCode = 1;
}
