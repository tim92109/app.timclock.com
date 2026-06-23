const bcrypt = require('bcryptjs');

async function generateHash() {
    const password = '123';
    const saltRounds = 12;
    const hash = await bcrypt.hash(password, saltRounds);
    console.log(`Password: ${password}`);
    console.log(`Hash: ${hash}`);
}

generateHash();