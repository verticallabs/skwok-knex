var skwok = require('skwok');
var KnexStore = require('../index').KnexStore;
var knexConfig = {
  client: 'mysql',
  connection: {
    host     : '127.0.0.1',
    user     : 'dev',
    password : 'mysql',
    database : 'skwok_example'
  },
  //debug: true
};
var knex = require('knex')(knexConfig);

knex.schema.dropTableIfExists('users')
.then(function() {
  return knex.schema.dropTableIfExists('messages');
})
.then(function() {
  return knex.schema.createTable('users', function (table) {
    table.increments();
    table.string('address');
    table.string('channel');
  });
})
.then(function() {
  return knex.schema.createTable('messages', function (table) {
    table.increments();
    table.string('body');
    table.string('channel');
    table.string('address');
    table.string('type');
    table.string('state');
  });
})
.then(function() {
  var store = new KnexStore(knexConfig);

  //create a console receiver on debug channel
  var receiver = new skwok.ChannelReceivers.ConsoleReceiver('debug', function(message) {
    //handle messages with this chain
    return chain.handle(message);
  });

  //create a sender with debug channel
  var sender = new skwok.Sender({
    debug: new skwok.ChannelSenders.ConsoleSender()
  });

  //create the chain
  var chain = new skwok.Chain(
    skwok.Store.Actions.attachUser(store),
    new skwok.Chain(
      skwok.Message.Filters.unhandled(), 
      skwok.Message.Filters.hasBody('ping'), 
      skwok.Message.Actions.respond('pong', sender, store),
      skwok.Message.Actions.handled()
    ),
    skwok.Message.Actions.handled(),
    skwok.Store.Actions.save(store)
  );

});
