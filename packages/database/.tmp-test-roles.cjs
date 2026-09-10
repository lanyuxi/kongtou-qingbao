/* Temporary: verify the worker roles can actually connect through the pooler.
   Passwords are read from the file written by enable_worker_roles.py.
   Deleted after use. */
const fs = require('node:fs');
const postgres = require('postgres');

const REF = 'fekukndhqfbsbsyvlnkl';
const HOST = 'aws-0-ap-northeast-2.pooler.supabase.com';
const passwords = JSON.parse(fs.readFileSync('/tmp/worker_role_passwords.json', 'utf8'));

const checks = [
  ['collection_worker', 'select current_user as who'],
  ['collection_queue_worker', 'select current_user as who'],
  ['ai_stage_worker', 'select current_user as who'],
  ['collection_schedule_admin', 'select current_user as who'],
];

(async () => {
  for (const [role, sqlText] of checks) {
    const url =
      'postgresql://' +
      role +
      '.' +
      REF +
      ':' +
      encodeURIComponent(passwords[role]) +
      '@' +
      HOST +
      ':5432/postgres';
    try {
      const sql = postgres(url, { max: 1, connect_timeout: 15, prepare: false });
      const rows = await sql.unsafe(sqlText);
      console.log('OK  ', role, '->', JSON.stringify(rows[0]));
      await sql.end();
    } catch (error) {
      console.log('FAIL', role, '->', error.message.split('\n')[0].slice(0, 90));
    }
  }
})();
