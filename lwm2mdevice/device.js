var lwm2mClient = require('lwm2m-node-lib').client;
var async = require('async');

var config = {};

// receive the lwm2m device name as a command line parameter
if(process.argv.length < 3) {
  console.error('Usage: node device.js <<lwm2m device name>>');
  process.exit(1);
}

var lwm2mDeviceName = process.argv[2];

// Configuration of the LWTM2M Server
//--------------------------------------------------
config.server = {
  port: 5683,                         // Port where the server will be listening
  lifetimeCheckInterval: 10000,        // Minimum interval between lifetime checks in ms
  udpWindow: 100,
  defaultType: 'Device',
  logLevel: 'FATAL',
  ipProtocol: 'udp4',
  serverProtocol: 'udp4',
  formats: [
    {
      name: 'application-vnd-oma-lwm2m/text',
      value: 1541
    },
    {
      name: 'application-vnd-oma-lwm2m/tlv',
      value: 1542
    },
    {
      name: 'application-vnd-oma-lwm2m/json',
      value: 1543
    },
    {
      name: 'application-vnd-oma-lwm2m/opaque',
      value: 1544
    }
  ],
  writeFormat: 'application-vnd-oma-lwm2m/text'
};

// Configuration of the LWTM2M Client
//--------------------------------------------------
config.client = {
  lifetime: '85671',
  version: '1.0',
  logLevel: 'DEBUG',
  observe: {
    period: 3000
  },
  ipProtocol: 'udp4',
  serverProtocol: 'udp4',
  formats: [
    {
      name: 'lightweightm2m/text',
      value: 1541
    }
  ],
  writeFormat: 'lightweightm2m/text'
};

function handleRead(objectType, objectId, resourceId, value, callback) {
  console.log('\nValue read:\n--------------------------------\n');
  console.log('-> ObjectType: %s', objectType);
  console.log('-> ObjectId: %s', objectId);
  console.log('-> ResourceId: %s', resourceId);
  console.log('-> Read Value: %s', value);

  callback(null);
}

function handleExecute(objectType, objectId, resourceId, value, callback) {
  console.log('\nCommand executed:\n--------------------------------\n');
  console.log('-> ObjectType: %s', objectType);
  console.log('-> ObjectId: %s', objectId);
  console.log('-> ResourceId: %s', resourceId);
  console.log('-> Command arguments: %s', value);

  callback(null);
}

function handleWrite(objectType, objectId, resourceId, value, callback) {
  console.log('\nValue written:\n--------------------------------\n');
  console.log('-> ObjectType: %s', objectType);
  console.log('-> ObjectId: %s', objectId);
  console.log('-> ResourceId: %s', resourceId);
  console.log('-> Written value: %s', value);

  callback(null);
}

lwm2mClient.init(config);

function registerDevice(callback)
{
  lwm2mClient.register('localhost', 5683, '/', lwm2mDeviceName, function(err, deviceInfo) {
    if (!err) {
      lwm2mClient.setHandler(deviceInfo.serverInfo, 'read', handleRead);
      lwm2mClient.setHandler(deviceInfo.serverInfo, 'execute', handleExecute);
      lwm2mClient.setHandler(deviceInfo.serverInfo, 'write', handleWrite);
      console.log("registered");
    }
    callback(err);
  });
}

function createResource(objUri, callback)
{
  var err = null;
  lwm2mClient.registry.create(objUri, function(err, parsedObject) { 
    console.log('Created resource: '+objUri);
    callback(err);
  })
}

function setResource(objUri, resource, val, callback)
{
  var err = null;
  lwm2mClient.registry.setResource(objUri, resource, val, function(err, retrievedObject) { 
    console.log('Set resource: '+objUri+' resource: '+resource+'-- value: '+val);
    callback(err);
  })
}

function waitAndUpdateResources(millisecs, objUri, resource, val, callback)
{
  setTimeout(function() {
    setResource(objUri, resource, val, function(err) {
      if (err) {
        console.error("Error setting resource: "+err);
      } else {
        
      }
      callback(err);    
    });
  }, millisecs);
}

async.waterfall([
  async.apply(createResource, '/3/0'),
  async.apply(setResource, '/3/0','0', 'valueOf/3/0/0'),
  async.apply(setResource, '/3/0','1', 'valueOf/3/0/1'),
  async.apply(createResource, '/5/0'),
  async.apply(setResource, '/5/0','0', 'valueOf/5/0/0'),
  async.apply(setResource, '/5/0','1', 'valueOf/5/0/1'),
  async.apply(setResource, '/5/0','2', 'valueOf/5/0/2'),
  async.apply(setResource, '/5/0','3', 'valueOf/5/0/3'),
  async.apply(createResource, '/5/1'),
  async.apply(setResource, '/5/1','0', 'valueOf/5/1/0'),
  registerDevice,
  async.apply(waitAndUpdateResources, 8000, '/3/0', '1', 'NewValue1'),
  async.apply(waitAndUpdateResources, 8000, '/3/0', '1', 'NewValue2'),
  async.apply(waitAndUpdateResources, 8000, '/3/0', '1', 'NewValue3'),
  async.apply(waitAndUpdateResources, 8000, '/3/0', '1', 'NewValue4'),
  async.apply(waitAndUpdateResources, 8000, '/3/0', '1', 'NewValue5'),   
], function(err, result) {
  if (err) {
    console.error("Error on initialization: "+err);
  } else {
    console.log("Initialization complete");
  }
});

