require('file-loader?name=../index.html!../index.html');
const Web3 = require('web3');
const Promise = require('bluebird');
const contract = require('truffle-contract');
const $ = require('jquery');
const metaCoinJson = require('../../build/contracts/MetaCoin.json');

if (typeof web3 !== 'undefined') {
  // use existing provider (mist/metamask/etc)
  window.web3 = new Web3(web3.currentProvider);
} else {
  // default fallback provider
  window.web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
}

// Promisify web3 methods for convenience
Promise.promisifyAll(web3.eth, { suffix: 'Promise' });
Promise.promisifyAll(web3.version, { suffix: 'Promise' });

// prepare truffle contract instance of MetaCoin
const MetaCoin = contract(metaCoinJson);
MetaCoin.setProvider(web3.currentProvider);

// discover what account we're connected to, and update balance displayed in the UI
window.addEventListener('load', () => {
  web3.version.getNetworkPromise().then(console.log);

  web3.eth.getAccountsPromise()
    .then(accounts => {
      if (accounts.length === 0) {
        $('#balance').html('No accounts found.');
        throw new Error('No accounts were found.');
      }
      window.account = accounts[0];
      console.log('account:', window.account);
      return web3.version.getNetworkPromise();
    })
    .then(network => MetaCoin.deployed())
    .then(deployed => deployed.getBalance.call(window.account))
    .then(balance => $('#balance').html(balance.toString(10)))
    .catch(console.error);

  // bind the send button
  $('#send').on('click', sendCoin);
});

// event handler for the send coin button
const sendCoin = () => {
  let deployed;
  return MetaCoin.deployed()
    .then(_deployed => {
      deployed = _deployed;

      const recipient = $('input[name="recipient"]').val();
      const amount = $('input[name="amount"]').val();

      // using .sendTransaction so we get the txHash immediately
      return _deployed.sendCoin.sendTransaction(recipient, amount, { from: window.account });
    })
    .then(txHash => {
      $('#status').html('transaction is on the way: ' + txHash);

      // wait for the transaction to be mined...
      const txLoop = () => {
        return web3.eth.getTransactionReceiptPromise(txHash)
          .then(receipt => {
            if (receipt !== null) {
              return receipt;
            } else {
              return Promise.delay(500).then(txLoop);
            }
          });
      };

      return txLoop();
    })
    .then(receipt => {
      if (receipt.logs.length === 0) {
        console.error('empty logs');
        console.error(receipt);
        $('#status').html('there was an error in the tx execution');
      } else {
        // log the formatted the event
        console.log(deployed.Transfer().formatter(receipt.logs[0]).args);
        $('#status').html('transfer succeeded');
      }

      // return the new balance
      return deployed.getBalance.call(window.account);
    })
    .then(balance => {
      // update the balance in the UI
      $('#balance').html(balance.toString(10));
    })
    .catch(e => {
      $('#status').html(e.toString());
      console.error(e);
    });
};
