const w = require('./wallet.js');
const rl = require('readline-sync');
const c = require('./const.js');

main();

async function main() {
    console.log("sweep unconfirmed nano wallet");
    const seed = rl.question("seed? ");
    const wallet = new w.writeWallet(c.NANO, seed);
    console.log("getting pending");
    const pending = await wallet.unconfirmedPending();
    if (!pending) {
        console.log("no pending");
        return;
    }
    console.log(pending);
    const receiveResult = await wallet.receivePending(pending);
    if (!receiveResult["success"]) {
        console.log("receive fail");
        return;
    }
    console.log(receiveResult);
    const dest = rl.question("dest? ");
    const sendResult = await wallet.sendRaw(0, dest, true);
    console.log(sendResult);
    if (!sendResult["success"]) {
        console.log("send fail");
    }
    console.log("done");
}