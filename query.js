const u = require('./util.js');
const rl = require('readline-sync');
const fs = require('fs');
const base58check = require('base58check');
const cryptoUtils = require('./crypto.js');
const mysql = require('mysql');

let key = "";
let dbpassword = "";

while (true) {
    try {
        let decrypted = cryptoUtils.decrypt(base58check.decode(
            fs.readFileSync('./crypto.txt').toString())["data"],
            rl.question('PASSWORD: ', {hideEchoBack: true}))
            .toString('utf8');
        let decoded = JSON.parse(decrypted);
        key = decoded["key"];
        dbpassword = decoded["dbpassword"];
        decoded = undefined;
        decrypted = undefined;
        pwd = undefined;
        console.log("Correct password");
        break;
    } catch(e) {
        console.log("Incorrect password");
    }
}

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: dbpassword,
    database: 'main'
});

connection.connect(async function(err) {
    if (err) {
        throw err;
    }
    while(true) {
        try {
            const query = rl.question("query? ");
            console.log(await dbRun(query));
        } catch(e) {
            console.log(e["sqlMessage"]);
        }
    }
});

function dbRun(sql) {
    return new Promise(function(resolve, reject) {
        connection.query(sql, function(err, rows) {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}