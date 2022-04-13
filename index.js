// BNswap

// Imports
const u = require('./util.js');
const w = require('./wallet.js');
const c = require('./const.js');
const nc = require('./nano-confirmed.js');
const cg = require('./coingecko.js');
const express = require('express');
const mysql = require('mysql');
const path = require('path');
const xno = require('nanocurrency');
const xbn = require('@bananocoin/bananojs');
xbn.setBananodeApiUrl(c.ballAPI);
const cryptoUtils = require('./crypto.js');
const base58check = require('base58check');
const compression = require('compression');
const bigRat = require("big-rational");
const rl = require('readline-sync');
const fs = require('fs');
const rateLimit = require("express-rate-limit");

// This will be loaded from the encrypted file later.
let xbnmainseed = "";
let xbnmainaddress = "";
let xnomainseed = "";
let xnomainaddress = "";
let key = "";
let dbpassword = "";

// Web server
const app = express();
let server;

// Prevent processing when already processing.
const activeProcessing = {};

// Database error, we need to prevent this tx from going through and potentially causing dangerous things
const memoryBlacklist = {};
let processingBlacklist = false;

// Prevents receiving when already receiving.
let receivingBuy = false;
let receivingSell = false;

// Test variables
let firstTime = true;
let secondTime = true;

// Has sigInt been called before?
// This is used to allow force exit
let sigInt = false;

// Database class
class db {
    constructor(pwd) {
        this.connection = mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: pwd,
            database: 'main'
        });
    }
    async init() {
        const self = this;
        this.connection.connect(async function(err) {
            if (err) {
                throw err;
            }
            await self.query(c.DB_BUY_CREATE);
            await self.query(c.DB_SELL_CREATE);
        });
    }
    end() {
        const self = this;
        return new Promise(function(resolve, reject) {
            self.connection.end((err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }
    query(sql, type, txid, blacklist) {
        const self = this;
        return new Promise(function(resolve) {
            self.connection.query(sql, function(err) {
                if (err) {
                    if (blacklist) {
                        resolve(true);
                    } else if (type) {
                        memoryBlacklist[txid] = true;
                        console.log(err.message);
                        type.json(c.DATABASE_ERROR);
                        if (txid) delete activeProcessing[txid];
                        resolve(true);
                    } else {
                        console.log(err.message);
                        process.exit(1);
                    }
                } else {
                    resolve(false);
                }
            });
        });
    }
    innerQuery(opt1, opt2) {
        this.connection.query(opt1, opt2);
    }
}

/* Begin main */

// Decrypt and decode; set the main values
authenticate();

// Connect to the database.
const database = new db(dbpassword);
database.init().then(() => {
    console.log("Connected to database");
    server = app.listen(c.port, () => {
        console.log("Listening on port " + c.port);
    });
});

// Disable powered-by message
app.disable('x-powered-by');

// Use compression to optimize website
app.use(compression());

// Set the view engine
app.set('view engine', 'ejs');

/*
// Cookie for testing
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// Testing
app.use(function(req, res, next) {
    if (req.url.startsWith("/WR8DLqCphJbFJ45G")) {
        res.cookie("WR8DLqCphJbFJ45G","true");
        res.redirect('/');
    } else {
        next();
    }
});*/

// Check for the main wallet being confirmed before continuing
const nchecker = new nc.nanoWalletConfirmed(xnomainaddress);
app.use(nanoWalletConfirmationCheck);

// Initialize the static webpage requests + rate-limiting
initStatic();

// Initialize the dynamic webpage requests + rate-limiting
initDynamic();

// Initialize the rates API (caches CoinGecko) + rate-limiting
const cgAPI = new cg.coinGeckoAPI();
initRatesAPI();

// API: User requests creation of new TXID logic + rate-limiting
const newTXRateLimiter = getRateLimiter(60 * 60 * 1000, 30);
newTXRateLimiter.skipFailedRequests = true;
app.get('/api/sell/new/*', newTXRateLimiter, buySellNew(false));
app.get('/api/buy/new/*', newTXRateLimiter, buySellNew(true));

// API: User requests checking of the status of their transaction + rate-limiting
const checkTXRateLimiter = getRateLimiter(60 * 1000, 15);
app.get("/api/sell/check/*", checkTXRateLimiter, buySellCheck(false));
app.get("/api/buy/check/*", checkTXRateLimiter, buySellCheck(true));

// We need to handle when (1) the user sends a bad request
// and (2) the program is stopped with CTRL-C.
registerBadRequest();
registerInterrupt();

/* End main */

function initStatic() {
    const staticRouteRateLimiter = getRateLimiter(60 * 1000, 60, true);
    for (const route in c.staticRoutes) {
        const dest = c.staticRoutes[route];
        app.get(route, staticRouteRateLimiter, (req, res) => {
            res.render(dest);
        });
    }
}

async function nanoWalletConfirmationCheck(req, res, next) {
    const nCheckResult = await nchecker.get();
    if (nCheckResult.hasOwnProperty("confirmed")) {
        if (!nCheckResult["confirmed"]) {
            if (req.url.startsWith("/api")) {
                res.json(c.MAIN_UNCONFIRMED);
            } else if (req.url.startsWith("/unconfirmed") || req.url.startsWith("/web")) {
                next();
            } else {
                res.redirect("/unconfirmed?prev=" + req.url);
            }
        } else if (nCheckResult["confirmed"] && req.url.startsWith("/unconfirmed")) {
            if (req.url.startsWith("/unconfirmed?prev=")) {
                res.redirect(decodeURIComponent(req.url.substring(18)));
            } else {
                res.redirect("/");
            }
        } else {
            next();
        }
    } else {
        next();
    }
}

function registerInterrupt() {
    process.on('SIGINT', async() => {
        if (sigInt) {
            console.log("Force exiting");
            process.exit();
        }
        sigInt = true;
        if (typeof database !== 'undefined') {
            console.log("Waiting for transactions to complete");
            while(true) {
                if (Object.keys(activeProcessing).length > 0) {
                    await u.sleep(10);
                } else {
                    break;
                }
            }
            console.log("Terminating web server");
            await server.close();
            console.log("Terminating connection to database");
            database.end().then(function() {
                console.log("Shutdown complete");
               process.exit();
            }).catch(function(err) {
                throw err;
            });
        } else {
            process.exit();
        }
    });
}

function registerBadRequest() {
    app.use((err, req, res, next) => {
        if (!err) return next();
        return res.status(400).json({
            status: 400,
            error: 'Bad request',
        });
    });
}

function buySellNew(buy) {
    return async function(req, res, next) {
        // Get the user address
        let userAddress = getAddress(req.url, buy);
        if (!userAddress) {
            await res.status(400).json(c.INVALID_ADDRESS);
            return;
        }
        // Generate encrypted wallet for user
        let wallet = await generateEncryptedWallet(buy);
        let seed = wallet[0];
        let address = wallet[1];
        // Generate transaction ID
        let txid = u.randomString(16);
        // Save wallet and txid information in database
        let sql = newTxSQL(buy, txid, address, strEnc(userAddress), seed);
        if (await database.query(sql, res)) return;
        // Alert user
        await res.json({
            success: true,
            id: txid
        });
        // Pass successful request onto rate limiter
        next();
    }
}

function buySellCheck(buy) {
    return async function(req, res) {
        // Process the blacklist if not already processing
        if (!processingBlacklist) processBlacklist();
        // Our database
        const dbCheck = dbName(buy);
        // Get user TXID and check validity
        let txid = getTxid(buy, req.url);
        if (!txid[0]) {
            await res.json(txid[1]);
            return;
        } else txid = txid[0];
        // Make the query to the database for the transaction ID.
        let sql = getCheckSql(dbCheck, txid);
        database.innerQuery(sql, async(err, rows) => {
            // DB error in query
            if (err) {
               console.log(err.message);
               await res.json(c.DATABASE_ERROR);
               return;
            }
            // Transaction ID not found
            if (rows.length < 1) {
                await res.json(c.INVALID_ID);
                return;
            }
            // Initialize variables from query result for later use
            const row = rows[0];
            const [seed, userAddress, dest, txstatus, amountDB, sentAmount, hash] =
                u.extractInfo(row, buy, key);
            // Check transaction initial values including whether it is already processing
            if (!checkTxInitialValues(res, txstatus, hash, amountDB, txid)) return;
            try {
                const wallet = new w.writeWallet(buy, seed);
                const sqlErrorTemplate = "UPDATE " + dbCheck + " SET error='ERRORHERE', status=4 WHERE txid='"
                    + txid + "';";
                const sqlNoSevereTemplate = sqlErrorTemplate.replace(", status=4", " ");
                const sqlStatusUpdateTemplate = "UPDATE " + dbCheck + " SET status=1 WHERE txid='" + txid + "';";
                if (shouldRetryFromBeginning(txstatus)) {
                    // Get whether the transaction is pending
                    // This is also where testing variables need to be set
                    const getPendingResult = await getPending(wallet, res,
                        txid, sqlNoSevereTemplate, userAddress, txstatus);
                    if (!getPendingResult) return;
                    var [isPending, pendingList] = getPendingResult;
                }
                // We are now actively processing the transaction
                activeProcessing[txid] = true;

                // Assists in error handling
                let errorSweep = false;
                let sweepErrorCode = c.UNRECEIVED;

                if (shouldReceive(txstatus, isPending)) {
                    const receiveResult = await wallet.receivePending(pendingList);
                    if (!receiveResult["success"]) {
                        errorSweep = receiveResult;
                        sweepErrorCode = c.FAILED_RECEIVING;
                    }
                }

                if (shouldGetBalance(txstatus, errorSweep, amountDB)) {
                    const balancePre = await wallet.getBalance();
                    if (!balancePre["success"]) {
                        errorSweep = balancePre;
                        sweepErrorCode = 5;
                    } else {
                        const getIntBalanceRes =
                            await getIntermediateBalance(balancePre, res, txid, buy);
                        if (!getIntBalanceRes) return;
                        var amount = getIntBalanceRes;
                    }
                }

                // Error in receiving from intermediate wallet
                if (errorSweep) {
                    await handleSweepError(errorSweep, sweepErrorCode, sqlErrorTemplate, res, txid);
                    return;
                }

                // Receiving was successful
                let receiveSuccessSql = sqlStatusUpdateTemplate.replace("status=1","status=2");
                if (await database.query(receiveSuccessSql, res, txid)) return;

                // Get price from CoinGecko
                const getPriceResult = await getPrice(dbCheck, txid, res, txstatus, amount);
                if (!getPriceResult) return;
                const [nanoPrice, banPrice] = getPriceResult;

                // Perform math to get other price-related constants
                const [banPerNano, nanoPerBan, buyPrice, sellPrice, multGiven] = mathPrice(nanoPrice, banPrice);

                let successfulTradeSql =
                    sqlStatusUpdateTemplate.replace("status=1","status=3");

                // If we previously failed to send, we want to check if that is truly the case.
                if (previouslyFailedToSendTarget(txstatus) && hash) {
                    const checkResult = await checkIfActuallySucceeded(hash, res, successfulTradeSql, buy, txid);
                    // If either we have actually succeeded, or there was an error in checking,
                    // we want to stop the operation.
                    if (!checkResult) return;
                }
                // Get amount to send to the user, as well as the amount that the user sent
                const [amountForCalculations, amountToSend] = getAmountToSend(txstatus, amount, sentAmount,
                    banPerNano, nanoPerBan, amountDB, multGiven, buy);
					
				console.log(amountToSend);
                // Main wallet instance
                const mainWallet = new w.writeWallet(buy ? c.BANANO : c.NANO,
                    buy ? xbnmainseed : xnomainseed);

                // Make sure we have enough to send to the user.
                const balCheckResult = await checkBalance(mainWallet, amountToSend,
                    txstatus, dbCheck, res, txid, buy);
                // If we don't, it has been handled.
                if (!balCheckResult) return;

                // Finally, send.
                const sendResult = await mainWallet.send(amountToSend, dest);
                if (!sendResult["success"]) {
                    firstTime = false;
                    await handleSendFailure(sendResult, sqlErrorTemplate, res, txid, dbCheck, txstatus, amountToSend);
                    return;
                }

                // Put in database
                if (await database.query(successfulTradeSql, res, txid)) return;

                // Put in the hash as well (if we have one, which *should* always be the case)
                if (sendResult["hash"]) {
                    if (await database.query(getHashSql(txid, dbCheck, sendResult))) return;
                }

                // Do we have data about the amount
                if (amount) {
                    // Construct data to provide user with information
                    await res.json({
                        "success": true,
                        "transfer": [
                            amountForCalculations.valueOf(),
                            amountToSend.valueOf(),
                            (buy ? buyPrice : sellPrice),
                            sendResult["hash"] ? sendResult["hash"] : 0
                        ]
                    });
                } else {
                    await res.json(c.SUCCESS_NOINFO);
                }
                sweepAsynchronously(buy, wallet, txid);
                delete activeProcessing[txid];
            } catch (e) {
                console.log(e);
                delete activeProcessing[txid];
                memoryBlacklist[txid] = true;
                try {
                    await res.json(c.NETWORK_ERROR);
                } catch (e) {}
            }
        });
    }
}

function getHashSql(txid, dbCheck, sendResult) {
    return "UPDATE " + dbCheck + " SET hash='" + strEnc(sendResult["hash"])
        + "' WHERE txid='" + txid + "';";
}

async function sweepAsynchronously(buy, wallet, txid) {
    let success = true;
    for (let i = 0; i < 3; i++) {
        const sendResult = await wallet.sendRaw(0, (buy ? xnomainaddress : xbnmainaddress), true);
        if (!sendResult["success"]) {
            success = false;
        } else {
            break;
        }
    }
    if (!success) console.log("error sending",txid);
    if (success) setTimeout(function() {
            receiveIfNotAlready(buy);
        }, 6000);
}

async function receiveIfNotAlready(buy) {
    if (buy) {
        if (receivingBuy) return;
        receivingBuy = true;
    } else {
        if (receivingSell) return;
        receivingSell = true;
    }
    try {
        const mainWallet = new w.writeWallet(buy ? c.NANO : c.BANANO, buy ? xnomainseed : xbnmainseed);
        const pendingListPre = await mainWallet.arePending();
        const pendingList = pendingListPre["list"];
        if (pendingList) {
            await mainWallet.receivePending(pendingList);
        }
    } catch (e) {}
    if (buy) {
        receivingBuy = false;
    } else {
        receivingSell = false;
    }
}

async function handleSendFailure(sendResult, sqlErrorTemplate, res, txid, dbCheck, txstatus, amountToSend) {
    let sql = sqlErrorTemplate.replace("ERRORHERE", u.formatError(sendResult["dump"]));
    sql = sql.replace("status=4","status=" + c.FAILED_SENDING_TARGET);
    if (await database.query(sql, res, txid)) return;
    if (sendResult["hash"]) {
        // If we failed to send before, the amount should already be registered in the database.
        // In addition, we want to make sure we actually have the amount before using it.
        let sqlSetHashAmount = "UPDATE " + dbCheck + " SET hash='HASHHERE'" +
            ((txstatus !== c.FAILED_SENDING_TARGET && amountToSend) ? ", amount=AMOUNTHERE " : " ")
            + "WHERE txid='" + txid + "';";
        sqlSetHashAmount = sqlSetHashAmount.replace("HASHHERE", strEnc(sendResult["hash"]));
        if (txstatus !== c.FAILED_SENDING_TARGET && amountToSend) sqlSetHashAmount =
            sqlSetHashAmount.replace("AMOUNTHERE", amountToSend.toDecimal(7));

        // Query.
        if (await database.query(sqlSetHashAmount, res, txid)) return;
    }
    // No hash, fine, let's store the amount.
    else if (amountToSend) {
        let sqlSetAmount = "UPDATE " + dbCheck + " SET amount=" + amountToSend.toDecimal(7) +
            " WHERE txid='" + txid + "';";
        // Query
        if (await database.query(sqlSetAmount, res, txid)) return;
    }
    await res.json(c.NETWORK_ERROR);
    delete activeProcessing[txid];
}

async function checkBalance(mainWallet, amountToSend, txstatus, dbCheck, res, txid, buy) {
    const mainBalancePre = await mainWallet.getBalance();

    let sql = "UPDATE " + dbCheck + " SET status=6, amount=AMOUNTHERE WHERE txid='" + txid + "';";
    // Amount already registered in DB if we failed to send.
    sql = (txstatus !== c.FAILED_SENDING_TARGET) ? sql.replace("AMOUNTHERE", amountToSend.toDecimal(7))
        : sql.replace(", amount=AMOUNTHERE", "");

    if (!mainBalancePre["success"]) {
        await res.json(c.NETWORK_ERROR);
        if (await database.query(sql, res, txid)) return false;
        delete activeProcessing[txid];
        return false;
    }

    const mainBalance = mainBalancePre["result"];
    const mainAmount = u.toDec(mainBalance, !buy);

    if (mainAmount.lesser(bigRat(amountToSend))) {
        await res.json(c.INSUFFICIENT_BALANCE);
        if (await database.query(sql, res, txid)) return false;
        delete activeProcessing[txid];
        return false;
    }
    return true;
}

function getAmountToSend(txstatus, amount, sentAmount, banPerNano, nanoPerBan, amountDB, multGiven, buy) {
	console.log(txstatus, amount, sentAmount, banPerNano, nanoPerBan, amountDB, multGiven, buy);
    const amountForCalculations = ((txstatus !== c.COINGECKO_ERROR) ? amount : bigRat(sentAmount));
    const given = (txstatus !== c.FAILED_SENDING_TARGET || (!amountDB || amountDB == 0 || amountDB == "0")) ? amountForCalculations
        .multiply(buy ? banPerNano : nanoPerBan).multiply(multGiven) : amountDB;
    return [amountForCalculations, given];
}

async function checkIfActuallySucceeded(hash, res, successfulTradeSql, buy, txid) {
    const exists = await u.blockExists(!buy, hash);
    if (exists === true) {
        if (await database.query(successfulTradeSql, res, txid)) return false;
        await res.json(c.SUCCESS_NOINFO);
        delete activeProcessing[txid];
        return false;
    }
    if (exists == null || (exists !== true && exists != null && exists !== false)) {
        await res.json(c.NETWORK_ERROR);
        delete activeProcessing[txid];
        return false;
    }
    return true;
}

function previouslyFailedToSendTarget(txstatus) {
    return (txstatus === c.FAILED_SENDING_TARGET);
}

function mathPrice(nanoPrice, banPrice) {
    const banPerNano = nanoPrice.divide(banPrice);
    const nanoPerBan = banPrice.divide(nanoPrice);
    const buyPrice = banPerNano*(1-c.fee);
    const sellPrice = banPerNano/(1-c.fee);
    const multGiven = bigRat(1-c.fee);
    return [banPerNano, nanoPerBan, buyPrice, sellPrice, multGiven];
}

async function getPrice(dbCheck, txid, res, txstatus, amount) {
    const priceResult = await cgAPI.get();
    const nanoPrice = bigRat(priceResult["nano"]["usd"]);
    const banPrice = bigRat(priceResult["banano"]["usd"]);

    if (!(nanoPrice && banPrice)) {
        let sql = "UPDATE " + dbCheck
            + " SET error='ERRORHERE', sentamount=AMOUNTHERE, status=9 WHERE txid='" + txid + "';";
        sql = sql.replace("ERRORHERE", u.formatError(priceResult));
        if (txstatus !== c.COINGECKO_ERROR) sql = sql.replace("AMOUNTHERE", amount.toDecimal(7));
        if (txstatus === c.COINGECKO_ERROR) sql = sql.replace(" sentamount=AMOUNTHERE,", "");
        if (await database.query(sql, res, txid)) return;
        await res.json(c.NETWORK_ERROR);
        delete activeProcessing[txid];
        return false;
    }
    return [nanoPrice, banPrice];
}

async function handleSweepError(errorSweep, sweepCode, sqlErrorTemplate, res, txid) {
    let sql;
    if (errorSweep["dump"]) {
        sql = sqlErrorTemplate.replace("ERRORHERE", u.formatError(errorSweep["dump"]));
    } else {
        sql = sqlErrorTemplate.replace(" error='ERRORHERE',", "");
    }
    sql = sql.replace("status=4","status=" + sweepCode);
    if (await database.query(sql, res, txid)) return;
    await res.json(c.NETWORK_ERROR);
    delete activeProcessing[txid];
}

async function getIntermediateBalance(balancePre, res, txid, buy) {
    const balance = balancePre["result"];
    const amount = u.toDec(balance, buy);

    if (amount === 0) {
        await res.json(c.NETWORK_ERROR);
        delete activeProcessing[txid];
        return false;
    }
    return amount;
}

function shouldGetBalance(txstatus, errorSweep, amountDB) {
	console.log(txstatus, errorSweep, amountDB);
    return ((txstatus !== c.FAILED_SENDING_TARGET || (!amountDB || amountDB == 0 || amountDB == "0")) && txstatus !== c.COINGECKO_ERROR && !errorSweep);
}

function shouldReceive(txstatus, isPending) {
    return (flagSet(txstatus) && isPending);
}

async function getPending(wallet, res, txid, sqlNoSevereTemplate, userAddress, txstatus) {
    const isPendingPre = await wallet.arePending();
    if (!isPendingPre["success"]) {
        let sql = sqlNoSevereTemplate.replace("ERRORHERE", u.formatError(isPendingPre["dump"]));
        if (await database.query(sql, res, txid)) return false;
        await res.json(c.NETWORK_ERROR);
        delete activeProcessing[txid];
        return false;
    }

    const isPending = isPendingPre["pending"];
    const pendingList = isPendingPre["list"];

    if (txstatus === c.UNRECEIVED && (!isPending || !pendingList)) {
        await res.json({
            success: true,
            transfer: false,
            address: userAddress
        });
        delete activeProcessing[txid];
        return false;
    }

    return [isPending, pendingList];
}

function shouldRetryFromBeginning(txstatus) {
    return (txstatus === c.UNRECEIVED || flagSet(txstatus));
}

function flagSet(txstatus) {
    return txstatus !== c.RECEIVED_INTERMEDIATE &&
        txstatus !== c.FAILED_SENDING &&
        txstatus !== c.FAILED_SENDING_TARGET &&
        txstatus !== c.COINGECKO_ERROR;
}

function checkTxInitialValues(res, txstatus, hash, amountDB, txid) {
    if (txstatus === c.FAILED_UNRECOVERABLE) {
        res.json(c.DATABASE_ERROR);
        return false;
    }
    // No process while transaction is already processing
    else if (activeProcessing[txid]) {
        res.json(c.TX_PROCESSING);
        return false;
    }
    // Already found to be successful
    // This prevents data leaks
    else if (txstatus === c.TRADE_COMPLETE) {
        res.json(c.SUCCESS_NOINFO);
        return false;
    }
    else if (txstatus === c.SENT_MAIN) {
        res.json(c.UNRECOVERABLE_ERROR);
        return false;
    }
    return true;
}

function strEnc(str) {
    return u.encrypt(str, key);
}

function getCheckSql(dbCheck, txid) {
    return "SELECT * FROM " + dbCheck + " WHERE txid='" + txid + "';";
}

async function processBlacklist() {
    processingBlacklist = true;
    for (const blacklisted in memoryBlacklist) {
        let dbs = ["buys", "sells"];
        for (var i = 0; i < dbs.length; i++) {
            let sql = "UPDATE " + dbs[i] + " SET status=7 WHERE txid='" + blacklisted + "';";
            if (!(await database.query(sql, null, null, true))) {
                delete memoryBlacklist[blacklisted];
            }
        }
    }
    processingBlacklist = false;
}

function getTxid(buy, url) {
    let txid = url.substring(buy ? 15 : 16);
    if (!u.isAlphaNumeric(txid) || txid.length !== 16) {
        return [false, c.INVALID_ID];
    }
    if (txid in memoryBlacklist) {
        return [false, c.DATABASE_ERROR];
    }
    return [txid];
}

function newTxSQL(buy, txid, address, userAddress, seed) {
    return "INSERT INTO " + dbName(buy) + " VALUES ('" + txid + "', '" + address + "', '"
        + seed + "', '" + userAddress + "', NULL, NULL, NULL, 0, NULL);";
}

async function generateEncryptedWallet(buy) {
    // Make wallet
    let seed = await xno.generateSeed();
    let secretKey = xno.deriveSecretKey(seed, 0);
    let publicKey = xno.derivePublicKey(secretKey);
    let address = buy ? xno.deriveAddress(publicKey) : xbn.getBananoAccount(publicKey);
    // Encrypt wallet
    let seedE = strEnc(seed);
    let addressE = strEnc(address);
    // Return
    return [seedE, addressE];
}

function dbName(buy) {
    return (buy ? "buys" : "sells");
}

function getAddress(url, buy) {
    let userAddress = url.substring(buy ? 13 : 14).toLowerCase();
    if (!buy && userAddress.startsWith("nano")) userAddress = "xrb" + userAddress.substring(4);
    if (buy ? bInvalid(userAddress) : nInvalid(userAddress)) {
        return false;
    }
    return userAddress;
}

function nInvalid(userAddress) {
    return !userAddress.startsWith("xrb") || !xno.checkAddress(userAddress);
}

function bInvalid(userAddress) {
    return !userAddress.startsWith("ban") || !xno.checkAddress("xrb" + userAddress.substring(3));
}

function getRateLimiter(windowMil, maxRequests, gui) {
    const msg = gui ? c.GUI_RATE_LIMITED: c.API_RATE_LIMITED;
    return rateLimit({
        windowMs: windowMil,
        max: maxRequests,
        message: msg
    });
}

function initRatesAPI() {
    const priceRateLimiter = getRateLimiter(60 * 1000, 15);
    app.get('/api/rates', priceRateLimiter, async(req, res) => {
        let cg = await cgAPI.get();
        if (!cg) {
            await res.json(c.BASIC_FAILURE);
            return;
        }
        let nanoPrice = cg["nano"]["usd"];
        let banPrice = cg["banano"]["usd"];
        if (!(nanoPrice && banPrice)) {
            await res.json(c.BASIC_FAILURE);
            return;
        }
        res.json({
            "success": true,
            "nanoPrice": nanoPrice,
            "banPrice": banPrice
        });
    });
}

function initDynamic() {
    const dynamicRouteRateLimiter = getRateLimiter(60 * 1000, 60, true);
    for (const route in c.dynamicRoutes) {
        const dest = c.dynamicRoutes[route];
        app.get(route, dynamicRouteRateLimiter, (req, res) => {
            res.render(dest[0], {buy: dest[1]});
        });
    }
    app.use('/web', express.static(path.join(__dirname, 'web')));
}

function authenticate() {
    while(true) try {
        let pwd = rl.question('PASSWORD: ', {hideEchoBack: true});
        let encrypted = fs.readFileSync('./crypto.txt').toString();
        let decoded = base58check.decode(encrypted)["data"];
        let decrypted = cryptoUtils.decrypt(decoded, pwd).toString('utf8');
        decrypted = JSON.parse(decrypted);
        xnomainseed = decrypted["xnoseed"];
        xnomainaddress = decrypted["xnoaddress"];
        xbnmainseed = decrypted["xbnseed"];
        xbnmainaddress = decrypted["xbnaddress"];
        key = decrypted["key"];
        dbpassword = decrypted["dbpassword"];
        console.log("Correct password");
        break;
    } catch (e) {
        console.log("Incorrect password");
    }
}