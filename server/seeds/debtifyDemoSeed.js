'use strict';
// Demo data seed for local/client demos.
// Creates a demo organization, one user per role, and a batch of sample leads.
// Safe to re-run: skips any record that already exists.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const User = require('../models/User');
const Organization = require('../models/Organization');
const Lead = require('../models/Lead');

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('MONGODB_URI not set in server/.env');
  process.exit(1);
}

const DEMO_ACCOUNTS = [
  { name: 'Demo Super Admin', email: 'superadmin@debtify.com', password: 'Demo@1234', role: 'superadmin' },
  { name: 'Demo Admin',       email: 'admin@debtify.com',      password: 'Demo@1234', role: 'admin' },
  { name: 'Demo Agent One',   email: 'agent1@debtify.com',     password: 'Demo@1234', role: 'agent1' },
  { name: 'Demo Agent Two',   email: 'agent2@debtify.com',     password: 'Demo@1234', role: 'agent2' },
];

const FIRST_NAMES = ['James', 'Mary', 'Robert', 'Linda', 'Michael', 'Patricia', 'William', 'Jennifer', 'David', 'Elizabeth', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Karen', 'Charles', 'Nancy', 'Daniel', 'Lisa'];
const LAST_NAMES  = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
const CITIES = [
  { city: 'Dallas', state: 'TX' }, { city: 'Austin', state: 'TX' }, { city: 'Phoenix', state: 'AZ' },
  { city: 'Denver', state: 'CO' }, { city: 'Orlando', state: 'FL' }, { city: 'Charlotte', state: 'NC' },
  { city: 'Columbus', state: 'OH' }, { city: 'Atlanta', state: 'GA' }, { city: 'Seattle', state: 'WA' },
  { city: 'Las Vegas', state: 'NV' },
];
const DEBT_TYPES_UNSECURED = ['Credit Cards', 'Medical Bills', 'Instalment Loans (Unsecured)', 'Collection Accounts', 'Student Loans (private loan)'];
const DEBT_TYPES_SECURED   = ['Mortgage Loans', 'Auto Loans', 'Secured Personal Loans'];
const CREDIT_RANGES = ['300-549', '550-649', '650-699', '700-749', '750-850'];
const PROGRESS_STATUSES = ['SALE', 'Callback Needed', 'Not Interested', 'No Answer', 'Existing Client', 'Request for Loan', 'Hang-up', ''];
const QUALIFICATION_STATUSES = ['qualified', 'not-qualified', 'pending'];

function randOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randPhone() { return '+1' + Math.floor(2000000000 + Math.random() * 7999999999).toString().slice(0, 10); }
function randInt(min, max) { return Math.floor(min + Math.random() * (max - min)); }

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('[Seed] Connected to database:', mongoose.connection.name);

  // 1. Super admin (needed as createdBy for the org)
  let superadmin = await User.findOne({ email: DEMO_ACCOUNTS[0].email });
  if (!superadmin) {
    superadmin = await User.create({ ...DEMO_ACCOUNTS[0], isActive: true });
    console.log('[Seed] Created superadmin:', superadmin.email);
  } else {
    console.log('[Seed] Superadmin already exists:', superadmin.email);
  }

  // 2. Demo organization
  let org = await Organization.findOne({ name: 'Debtify Demo Org' });
  if (!org) {
    org = await Organization.create({
      name: 'Debtify Demo Org',
      description: 'Sample organization for client demo purposes',
      email: 'ops@debtify.com',
      isActive: true,
      createdBy: superadmin._id,
    });
    console.log('[Seed] Created organization:', org.name);
  } else {
    console.log('[Seed] Organization already exists:', org.name);
  }

  // 3. Remaining demo users (admin, agent1, agent2) tied to the org
  const usersByRole = { superadmin };
  for (const acc of DEMO_ACCOUNTS.slice(1)) {
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
    usersByRole[acc.role] = user;
  }

  // 4. Sample leads — only add them if the org doesn't already have a demo batch
  const existingLeadCount = await Lead.countDocuments({ organization: org._id });
  const TARGET_LEAD_COUNT = 24;
  if (existingLeadCount >= TARGET_LEAD_COUNT) {
    console.log(`[Seed] Organization already has ${existingLeadCount} leads, skipping lead generation.`);
  } else {
    const toCreate = TARGET_LEAD_COUNT - existingLeadCount;
    console.log(`[Seed] Creating ${toCreate} sample leads...`);

    for (let i = 0; i < toCreate; i++) {
      const first = randOf(FIRST_NAMES);
      const last = randOf(LAST_NAMES);
      const loc = randOf(CITIES);
      const debtCategory = Math.random() > 0.5 ? 'unsecured' : 'secured';
      const debtTypes = debtCategory === 'unsecured'
        ? [randOf(DEBT_TYPES_UNSECURED), randOf(DEBT_TYPES_UNSECURED)]
        : [randOf(DEBT_TYPES_SECURED)];

      // Vary completeness so we get a realistic hot/warm/cold mix
      const completenessRoll = Math.random();
      const includeAll = completenessRoll > 0.35; // ~65% "hot"
      const includeSome = completenessRoll > 0.1; // most of the rest "warm"

      const leadData = {
        name: `${first} ${last}`,
        email: includeAll || includeSome ? `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com` : undefined,
        phone: randPhone(),
        debtCategory,
        debtTypes,
        totalDebtAmount: includeAll ? randInt(5000, 60000) : undefined,
        numberOfCreditors: includeAll ? randInt(1, 10) : undefined,
        monthlyDebtPayment: includeAll || includeSome ? randInt(100, 2000) : undefined,
        creditScoreRange: includeAll ? randOf(CREDIT_RANGES) : undefined,
        city: loc.city,
        state: loc.state,
        qualificationStatus: randOf(QUALIFICATION_STATUSES),
        leadProgressStatus: randOf(PROGRESS_STATUSES),
        notes: 'Sample demo lead — generated for client walkthrough.',
        organization: org._id,
        createdBy: usersByRole.agent1._id,
        assignedTo: Math.random() > 0.3 ? usersByRole.agent2._id : undefined,
        assignedBy: Math.random() > 0.3 ? usersByRole.admin._id : undefined,
      };

      try {
        await Lead.create(leadData);
      } catch (err) {
        console.warn('[Seed] Skipped a lead due to validation error:', err.message);
      }
    }
    console.log('[Seed] Sample leads created.');
  }

  await mongoose.disconnect();
  console.log('[Seed] Done.');
  console.log('');
  console.log('Demo login credentials (international):');
  DEMO_ACCOUNTS.forEach(a => console.log(`  ${a.role.padEnd(10)} ${a.email} / ${a.password}`));
}

seed().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
