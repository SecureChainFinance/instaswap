const cryptoUtils = require('./crypto.js');
const base58check = require('base58check');
const crypto = require('crypto');
const u = require('./util.js');
const fs = require('fs');
const rl = require('readline-sync');

try {
    let pwd = rl.question('PASSWORD: ', {hideEchoBack: true});
    let encrypted = fs.readFileSync('./crypto.txt').toString();
    let decoded = base58check.decode(encrypted)["data"];
    let decrypted = cryptoUtils.decrypt(decoded, pwd).toString('utf8');
	console.log(decrypted);
    decrypted = JSON.parse(decrypted);
    while (true) {
        let field = rl.question("field? ");
        console.log(decrypted[field]);
    }
} catch (e) {
    console.log("Incorrect password");
}