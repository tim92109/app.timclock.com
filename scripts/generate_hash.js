/**
 * Bcrypt hash generator.
 *
 * Usage:
 *   node generate_hash.js                       # prints hashes for the default demo passwords
 *   node generate_hash.js admin123 manager123   # prints hashes for the given passwords
 *   node generate_hash.js --rounds 10 secret    # override the bcrypt cost (default 10)
 */

const bcrypt = require('bcryptjs');

const DEFAULT_PASSWORDS = ['admin123', 'manager123', 'employee123'];
const DEFAULT_ROUNDS = 10;

const parseArgs = (argv) => {
  const passwords = [];
  let rounds = DEFAULT_ROUNDS;

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--rounds') {
      const parsed = parseInt(argv[i + 1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        rounds = parsed;
      }
      i += 1;
    } else {
      passwords.push(argv[i]);
    }
  }

  return {
    passwords: passwords.length > 0 ? passwords : DEFAULT_PASSWORDS,
    rounds,
  };
};

const generateHashes = async () => {
  const { passwords, rounds } = parseArgs(process.argv.slice(2));

  for (const password of passwords) {
    const hash = await bcrypt.hash(password, rounds);
    console.log(`Password: ${password}`);
    console.log(`Hash: ${hash}`);
    console.log('');
  }
};

generateHashes().catch((error) => {
  console.error('Failed to generate hash:', error);
  process.exit(1);
});
