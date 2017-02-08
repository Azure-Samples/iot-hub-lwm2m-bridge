'use strict';

var iothub = require('azure-iothub');
var Client = iothub.Client;
var async = require('async');

var connectionString = '';
// receive the lwm2m device name as a command line parameter
if(process.argv.length < 3) {
  console.error('Usage: node backend.js <<iothub deviceId>>');
  process.exit(1);
}

var targetDeviceId = process.argv[2];

var client = Client.fromConnectionString(connectionString);
var registry = iothub.Registry.fromConnectionString(connectionString);

function callMethodToGetResource(deviceId, resourceUri, callback) {
  console.log("callMethodToGetResource");
  
  var methodParams = {
    methodName: 'LWM2M_GET',
    payload: {
      'deviceId' : deviceId,
      'resourceUri' : resourceUri    
    },
    timeoutInSeconds: 300
  };

  client.invokeDeviceMethod(deviceId, methodParams, function (err, result) {
    console.log(methodParams.methodName + ' on ' + deviceId + ':');
    console.log(JSON.stringify(result, null, 2));
    callback(err);
  });
}

function callMethodToObserve(deviceId, resourceUri, callback) {
  var methodParams = {
    methodName: 'LWM2M_OBSERVE',
    payload: {
        'deviceId' : deviceId,
        'resourceUri' : resourceUri    
    },
    timeoutInSeconds: 300
  };

  client.invokeDeviceMethod(deviceId, methodParams, function (err, result) {
    console.log(methodParams.methodName + ' on ' + deviceId + ':');
    console.log(JSON.stringify(result, null, 2));
    callback(err);
  });
}

function callMethodToExecute(deviceId, resourceUri, executeParams, callback) {
  var methodParams = {
    methodName: 'LWM2M_EXECUTE',
    payload: {
      'deviceId' : deviceId,
      'resourceUri' : resourceUri,    
      'executeParams' : executeParams,
    },
    timeoutInSeconds: 300
  };

  client.invokeDeviceMethod(deviceId, methodParams, function (err, result) {
    console.log(methodParams.methodName + ' on ' + deviceId + ':');
    console.log(JSON.stringify(result, null, 2));
    callback(err);
  });
}

function callMethodToWrite(deviceId, resourceUri, val, callback) {
  var methodParams = {
    methodName: 'LWM2M_WRITE',
    payload: {
      'deviceId' : deviceId,
      'resourceUri' : resourceUri,    
      'newValue' : val,
    },
    timeoutInSeconds: 300
  };

  client.invokeDeviceMethod(deviceId, methodParams, function (err, result) {
    console.log(methodParams.methodName + ' on ' + deviceId + ':');
    console.log(JSON.stringify(result, null, 2));
    callback(err);
  });
}

function getTwinLwm2mData(callback)
{
  console.log("getTwinLwm2mData");
  
  registry.getTwin(targetDeviceId, function(err, twin) {
    if (err) {
      console.error('Error getting twin: '+err);
      callback(err);
    } else {
      console.log(twin.properties.reported);
      callback(null);
    }
  });
}

async.waterfall([
  async.apply(callMethodToGetResource, targetDeviceId, '/3/0/0'),
  async.apply(callMethodToGetResource, targetDeviceId, '/3/0/1'),
  async.apply(callMethodToGetResource, targetDeviceId, '/5/0/0'),
  async.apply(callMethodToGetResource, targetDeviceId, '/5/0/1'),
  async.apply(callMethodToGetResource, targetDeviceId, '/5/0/2'),
  async.apply(callMethodToGetResource, targetDeviceId, '/5/0/3'),
  async.apply(callMethodToGetResource, targetDeviceId, '/5/1/0'),
  async.apply(callMethodToObserve, targetDeviceId, '/3/0/1'),
  async.apply(callMethodToExecute, targetDeviceId, '/5/1/0', "paramsString"),
  async.apply(callMethodToWrite, targetDeviceId, '/5/0/3', "newValueFor/5/0/3"),
  getTwinLwm2mData
], function(err, done) {
  if (err) {
    console.error("Error: "+err);
  } else {
    console.log("Done!");
  } 
});