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
		var field = rl.question('field? ').trim();
		var value = rl.question('value? ').trim();
		var table = rl.keyInYN('buy table? ');
		if (value.startsWith("nano")) value = "xrb" + value.substring(4);
		console.log(value);
		switch(field) {
			case "seed":
				field = table ? "xnoseed" : "xbnseed";
				break;
			case "addr":
			case "address":
				field = table ? "xnoaddr" : "xbnaddr";
				break;
			case "dest":
			case "destination":
				field = "destaddr";
				break;
		}
		var tblVal = table ? "buys" : "sells";
		if (field !== "txid" && field !== "status") {
			let sql = "SELECT * FROM " + tblVal + ";";
			console.log(sql);
			let res = await dbRun(sql);
			for (var i = 0, idx = 0; i < res.length; i++) {
				var dbRes = res[i];
				var dec = null;
				if (dbRes[field.trim()]) dec = u.decrypt(dbRes[field.trim()], key);
				if ((dec ? dec.trim() : dec) == value) {
					logIdx(idx);
					idx++;
					logInfo(u.extractInfo(dbRes, table, key, true));
					if (field !== "destaddr") break;
				}
			}
		} else {
			let separator = "'";
			if (field === "status") separator = "";
			let sql = "SELECT * FROM " + tblVal + " WHERE " + field + "=" +
				separator + value + separator + ";";
			console.log(sql);
			let res = await dbRun(sql);
			for (var j = 0; j < res.length; j++) {
				let dbRes = res[j];
				logIdx(j);
				logInfo(u.extractInfo(dbRes, table, key, true));
			}
		}
	}
});

function logInfo(info) {
	logDash("txid",info[7]);
	logDash("seed",info[0]);
	logDash("address",info[1]);
	logDash("destination",info[2]);
	logDash("status",info[3]);
	logDash("amount",info[4]);
	logDash("sentamount",info[5]);
	logDash("hash",info[6]);
}

function logIdx(idx) {
	console.log(" # " + idx);
}

function logDash(str,arg2) {
	console.log(" - " + str, arg2);
}

function dbRun(sql) {
	return new Promise(function(resolve) {
		connection.query(sql, function(err, rows) {
			if (err) {
				console.log(err.message);
				process.exit(1);
			} else {
				resolve(rows);
			}
		});
	});
}