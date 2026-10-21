'use strict';
// Initial account seed for a fresh Debtify deployment.
// Creates the organization and the four core accounts (superadmin, admin,
// agent1, agent2). No fake/sample lead data. Safe to re-run: skips any
// record that already exists.
//
// Passwords are NOT hardcoded here — they're read from environment
// variables so real credentials never end up committed to git. Set these
// in server/.env (already gitignored) before running `npm run seed`:
//   SEED_SUPERADMIN_PASSWORD=...
//   SEED_ADMIN_PASSWORD=...
//   SEED_AGENT1_PASSWORD=...
//   SEED_AGENT2_PASSWORD=...

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const User = require('../models/User');
const Organization = require('../models/Organization');

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('MONGODB_URI not set in server/.env');
  process.exit(1);
}

const ACCOUNTS = [
  { name: 'Jitin Madan',        email: 'jitinmadan@debtify.com',        password: process.env.SEED_SUPERADMIN_PASSWORD, role: 'superadmin' },
  { name: 'Ricardo Canthopher', email: 'ricardocanthopher@debtify.com', password: process.env.SEED_ADMIN_PASSWORD,      role: 'admin' },
  { name: 'Rick',                email: 'rickag1@debtify.com',           password: process.env.SEED_AGENT1_PASSWORD,     role: 'agent1' },
  { name: 'Sam',                 email: 'samag2@gmail.com',              password: process.env.SEED_AGENT2_PASSWORD,     role: 'agent2' },
];

const missing = ACCOUNTS.filter(a => !a.password).map(a => a.role);
if (missing.length) {
  console.error(`[Seed] Missing password env var(s) for: ${missing.join(', ')}`);
  console.error('[Seed] Set SEED_SUPERADMIN_PASSWORD / SEED_ADMIN_PASSWORD / SEED_AGENT1_PASSWORD / SEED_AGENT2_PASSWORD in server/.env');
  process.exit(1);
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('[Seed] Connected to database:', mongoose.connection.name);

  // 1. Super admin (needed as createdBy for the org)
  let superadmin = await User.findOne({ email: ACCOUNTS[0].email });
  if (!superadmin) {
    superadmin = await User.create({ ...ACCOUNTS[0], isActive: true });
    console.log('[Seed] Created superadmin:', superadmin.email);
  } else {
    console.log('[Seed] Superadmin already exists:', superadmin.email);
  }

  // 2. Organization
  let org = await Organization.findOne({ name: 'Debtify' });
  if (!org) {
    org = await Organization.create({
      name: 'Debtify',
      email: 'ops@debtify.com',
      isActive: true,
      createdBy: superadmin._id,
    });
    console.log('[Seed] Created organization:', org.name);
  } else {
    console.log('[Seed] Organization already exists:', org.name);
  }

  // 3. Remaining accounts (admin, agent1, agent2) tied to the org
  for (const acc of ACCOUNTS.slice(1)) {
    let user = await User.findOne({ email: acc.email });
    if (!user) {
      user = await User.create({
        ...acc,
        isActive: true,
        organization: org._id,
        createdBy: superadmin._id,
        ...(acc.role === 'admin' ? { canDownloadLeads: true } : {}),
      });
      console.log(`[Seed] Created ${acc.role}:`, user.email);
    } else {
      console.log(`[Seed] ${acc.role} already exists:`, user.email);
    }
  }

  await mongoose.disconnect();
  console.log('[Seed] Done.');
  console.log('');
  console.log('Accounts:');
  ACCOUNTS.forEach(a => console.log(`  ${a.role.padEnd(10)} ${a.email}`));
}

seed().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
