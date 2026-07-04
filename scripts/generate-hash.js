#!/usr/bin/env node
const bcrypt = require('bcryptjs');

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('Usage: node scripts/generate-hash.js <password>');
  process.exit(1);
}
const password = argv[0];
const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
const hash = bcrypt.hashSync(password, rounds);
console.log(hash);
