#!/usr/bin/env node
/**
 * Bootstrap CLI for admin_users (Phase 1A real per-user auth foundation).
 * Every mutating command (create/disable/enable/set-role/reset-password)
 * only PRINTS the SQL it would run -- it never touches D1 itself. Review
 * the output, then apply it deliberately:
 *
 *   node scripts/admin-cli/admin-cli.mjs create --email a@x.com --name "A" --role super_admin > /tmp/admin.sql
 *   wrangler d1 execute svetikony-production --local --file=/tmp/admin.sql   # dev first
 *   wrangler d1 execute svetikony-production --remote --file=/tmp/admin.sql # production, only when ready
 *
 * `list` is the one exception -- it's read-only, so it runs directly via
 * `wrangler d1 execute` (defaults to --local; pass --remote to hit
 * production).
 *
 * The password hashing below (hashPassword) is a deliberate byte-for-byte
 * copy of lib/d1/password.ts's algorithm, not an import of it -- this repo
 * has no TS-loader (tsx/ts-node) set up for plain Node scripts, and
 * lib/d1/password.ts's sibling modules use extensionless relative imports
 * that Node's own experimental type-stripping can't resolve. Duplicating a
 * small, self-contained, well-tested function here (rather than adding a
 * new devDependency just for this one script) matches this repo's existing
 * scripts/calendar-seed convention of being fully self-contained .mjs
 * files. If lib/d1/password.ts's algorithm/format ever changes, this copy
 * must change with it -- lib/d1/password.test.ts pins the exact stored
 * format shape, which is the best available guardrail against silent
 * drift.
 *
 * Password input is always read from the ADMIN_BOOTSTRAP_PASSWORD
 * environment variable, never a CLI argument -- a CLI arg would leak into
 * shell history and the process list; an env var set in the same command
 * line generally does not.
 */
import { execFileSync } from 'node:child_process';

const ROLES = ['super_admin', 'editor', 'order_manager', 'viewer'];
const DB_NAME = 'svetikony-production';

// ---- password hashing (see file header: intentional copy of lib/d1/password.ts) ----

const CURRENT_PBKDF2_ITERATIONS = 600_000;
const ALGORITHM_TAG = 'pbkdf2-sha256';
const SALT_BYTES = 16;
const HASH_BITS = 256;

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

async function hashPassword(password, iterations = CURRENT_PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await pbkdf2(password, salt, iterations);
  return `${ALGORITHM_TAG}$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(derived)}`;
}

// ---- SQL text generation ----

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!key) continue;
    args[key] = argv[i + 1];
  }
  return args;
}

function requirePassword() {
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!password) {
    console.error('ADMIN_BOOTSTRAP_PASSWORD environment variable is required for this command.');
    process.exit(1);
  }
  return password;
}

function requireRole(role) {
  if (!ROLES.includes(role)) {
    console.error(`--role must be one of: ${ROLES.join(', ')} (got: ${role ?? '<missing>'})`);
    process.exit(1);
  }
}

async function cmdCreate(args) {
  if (!args.email || !args.name) {
    console.error('Usage: create --email <email> --name <name> --role <role>');
    process.exit(1);
  }
  requireRole(args.role);
  const passwordHash = await hashPassword(requirePassword());
  const now = nowIso();
  // Deliberately NOT idempotent-guarded (unlike calendar-seed's bulk
  // content INSERTs) -- creating an admin account is a rare, deliberate
  // action where a silent no-op on a duplicate email would be dangerous
  // (a developer could believe an account was created when it wasn't).
  // The UNIQUE(email) constraint fails loudly instead.
  console.log(
    `INSERT INTO admin_users (id, email, name, password_hash, role, active, created_at, updated_at) VALUES (${sqlString(
      crypto.randomUUID(),
    )}, ${sqlString(args.email.trim().toLowerCase())}, ${sqlString(args.name)}, ${sqlString(passwordHash)}, ${sqlString(
      args.role,
    )}, 1, ${sqlString(now)}, ${sqlString(now)});`,
  );
}

function cmdList(args) {
  const target = args.remote !== undefined || process.argv.includes('--remote') ? '--remote' : '--local';
  execFileSync(
    'wrangler',
    [
      'd1',
      'execute',
      DB_NAME,
      target,
      '--command',
      'SELECT id, email, name, role, active, created_at, updated_at, last_login_at FROM admin_users ORDER BY created_at',
    ],
    { stdio: 'inherit' },
  );
}

function cmdDisable(args) {
  if (!args.email) {
    console.error('Usage: disable --email <email>');
    process.exit(1);
  }
  console.log(
    `UPDATE admin_users SET active = 0, updated_at = ${sqlString(nowIso())} WHERE email = ${sqlString(args.email.trim().toLowerCase())};`,
  );
}

function cmdEnable(args) {
  if (!args.email) {
    console.error('Usage: enable --email <email>');
    process.exit(1);
  }
  console.log(
    `UPDATE admin_users SET active = 1, updated_at = ${sqlString(nowIso())} WHERE email = ${sqlString(args.email.trim().toLowerCase())};`,
  );
}

function cmdSetRole(args) {
  if (!args.email) {
    console.error('Usage: set-role --email <email> --role <role>');
    process.exit(1);
  }
  requireRole(args.role);
  console.log(
    `UPDATE admin_users SET role = ${sqlString(args.role)}, updated_at = ${sqlString(nowIso())} WHERE email = ${sqlString(
      args.email.trim().toLowerCase(),
    )};`,
  );
}

async function cmdResetPassword(args) {
  if (!args.email) {
    console.error('Usage: reset-password --email <email>');
    process.exit(1);
  }
  const passwordHash = await hashPassword(requirePassword());
  console.log(
    `UPDATE admin_users SET password_hash = ${sqlString(passwordHash)}, updated_at = ${sqlString(
      nowIso(),
    )} WHERE email = ${sqlString(args.email.trim().toLowerCase())};`,
  );
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  switch (command) {
    case 'create':
      return cmdCreate(args);
    case 'list':
      return cmdList(args);
    case 'disable':
      return cmdDisable(args);
    case 'enable':
      return cmdEnable(args);
    case 'set-role':
      return cmdSetRole(args);
    case 'reset-password':
      return cmdResetPassword(args);
    default:
      console.error(
        'Usage: node scripts/admin-cli/admin-cli.mjs <create|list|disable|enable|set-role|reset-password> [--email ...] [--name ...] [--role ...] [--remote]',
      );
      process.exit(1);
  }
}

main();
