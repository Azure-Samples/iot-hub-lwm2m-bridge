'use strict';

var lwm2mServer = require('lwm2m-node-lib').server;
var async = require('async');

var Mqtt = require('azure-iot-device-mqtt').Mqtt;
var DeviceClient = require('azure-iot-device').Client;
var Message = require('azure-iot-device').Message;

var globalServerInfo;

var deviceList = [
  {
    lwm2mRegName: 'lwm2mDevice1',
    iotHubDeviceName: 'iothubDevice1',
    iotHubDeviceConnectionString: '',
    lwm2mDeviceId: null,
    deviceRegisteredLWM2M: false,
    deviceConnectedIoTHub: false,
    iothubClient: null
  },
  {
    lwm2mRegName: 'lwm2mDevice2',
    iotHubDeviceName: 'iothubDevice2',
    iotHubDeviceConnectionString: '',
    lwm2mDeviceId: null,
    deviceRegisteredLWM2M: false,
    deviceConnectedIoTHub: false,
    iothubClient: null
  }
];

var config = {};

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

function updateTwinForLWM2MOperation(deviceClient, patch, sendTelemetry, callback) {
  // Update twin.reported with payload
  deviceClient.getTwin(function(err, twin) {
    if (err) { 
      console.error('Error getting twin: '+err);
    }
    else {
      console.log("Acquired twin object");
      twin.properties.reported.update(patch, function(err) {
        if (err) {
          console.error("Error updating twin.properties.reported.");
        } else {
          console.log("Updated reported properties");
      
          if (sendTelemetry)
          {
            var dataToSend = {
              message: patch    
            };
            
            var data = JSON.stringify(dataToSend);
            var message = new Message(data);
            console.log('Sending message: ' + message.getData());
            deviceClient.sendEvent(message, function (err, result) {
              if (err) {
                console.error("Error sending message: "+err);
              } else {
                callback(null);
              }
            });
          }
          else {
            callback(null);
          }
        }              
      });
    }
  });
}

function findIoTHubClientForTwinUpdate(iotHubDeviceId, twinPatch, sendTelemetry, callback) {
    
    console.log("Getting deviceClient");
    // Finding deviceClient
    var deviceItemList = deviceList.filter(item => item.iotHubDeviceName == iotHubDeviceId);
    if (deviceItemList.length > 0)
    {
        var device = deviceItemList[0];
        
        updateTwinForLWM2MOperation(device.iothubClient, twinPatch, sendTelemetry, function(err) {
            if (err) {
                console.error("Error updating twin with GET results: "+err);
            } else {
                console.log("Updated twin reported with GET results");
            }
            callback(err);
        });
    }    
}

function updateTwinWithObserveData(iotHubDeviceId, objUri, value, sendTelemetry, callback) {
  var twinPatch = {
    'lwm2m': {
      'observes' : {
        [objUri] : {
          'setTime' : new Date().toISOString(),
        }
      }
    }
  };
  
  findIoTHubClientForTwinUpdate(iotHubDeviceId, twinPatch, sendTelemetry, function(err) {
      callback(err);
  });
}

function updateTwinWithLwm2mData(iotHubDeviceId, objUri, value, sendTelemetry, callback) {
  // Update the twin
  var twinPatch = {
    'lwm2m': {
      'objects' : {
        [objUri] : {
          'value' : value,
        }
      }
    }
  };
      
  findIoTHubClientForTwinUpdate(iotHubDeviceId, twinPatch, sendTelemetry, function(err) {
    callback(err);
  });
}

function handleError(err, request, callback) {
  if(err) {
    console.error('An error ocurred when sending a method response:\n' + err.toString());
  } else {
    console.log('Response to method \'' + request.methodName + '\' sent successfully.' );
  }
  callback(null);
}                   

function respondToLwm2mMethodSuccess(request, response, responsePayload, callback) {
  response.send(200, responsePayload, function(err) {
    handleError(err, request, function(err) {
      callback(err);
    });
  });
}

function respondToLwm2mMethodError(request, response, responsePayload, callback) {
  response.send(404, responsePayload, function(err) {
    handleError(err, request, function(err) {
      callback(err);
    });
  });
}

function respondToLwm2mMethodServerError(request, response, responsePayload, callback) {
  response.send(500, responsePayload, function(err) {
    handleError(err, request, function(err) {
      callback(err);
    });
  });
}

function observeUpdate(value, objectType, objectId, resourceId, deviceId) {
  console.log('\nGot new value: %s\n', value);
  
  // Get IoT Hub DeviceId
  console.log("Getting deviceClient");
  var deviceItemList = deviceList.filter(item => item.lwm2mDeviceId == deviceId);
  if (deviceItemList.length > 0)
  {
    var iotHubDeviceId = deviceItemList[0].iotHubDeviceName;
    var objUri = '/'+objectType+'/'+objectId+'/'+resourceId;
    
    // Update the twin with the LWM2M data and send message through
    // telemetry channel
    updateTwinWithLwm2mData(iotHubDeviceId, objUri, value, true, function(err) {
      if (err) {
        console.error("Error updating twin: "+err);  
      }
      else {
        console.log("Updated twin from Observe Notify");
      }
    });
  }
}

function onLWM2MObserve(request, response) {
  console.log("onLWM2MObserve");
  console.log(request.payload);
  var responsePayload = null;
  
  // Expecting format '/x/x/x', which splits into an array of 4 items
  var resourceData = request.payload.resourceUri.split('/');
  if (resourceData.length == 4)
  {
    if (lwm2mServer.isRunning()) {       
      var objectId = resourceData[1];
      var instance = resourceData[2];
      var resource = resourceData[3];
      
      getDevicefromGatewayListUsingIoTHubDeviceId(request.payload.deviceId, function(err, device) {
        lwm2mServer.observe(device.lwm2mDeviceId, objectId, instance, resource, observeUpdate, function(err, result) {
            
            responsePayload = {
                request: 'GET OBSERVE /'+objectId+'/'+instance+'/'+resource,
                response: result, 
                error: err
            }
        
            if (err) {
                respondToLwm2mMethodError(request, response, responsePayload, function(err) {
                    
                });
            } else {
                respondToLwm2mMethodSuccess(request, response, responsePayload, function(err) {
                
                });
                
                var objUri = '/'+objectId+'/'+instance+'/'+resource;
                
                // Update twin observes, but not the objects
                updateTwinWithObserveData(request.payload.deviceId, objUri, result, false, function(err) {
                    
                });
            }
                            
        });
      });
    }
    else {
      responsePayload = {
        request: 'GET /'+objectId+'/'+instance+'/'+resource,
        response: 'LWM2M Server not running'
      }
      
      respondToLwm2mMethodServerError(request, response, responsePayload, function(err) {
        // TODO: What should happen here?
      });
    }
  }
}

function onLWM2MExecute(request, response) {
  console.log("onLWM2MExecute");
  console.log(request.payload);
  var responsePayload = null;
  
  // Expecting format '/x/x/x', which splits into an array of 4 items
  var resourceData = request.payload.resourceUri.split('/');
  var params = request.payload.executeParams;
  if (resourceData.length == 4)
  {
    if (lwm2mServer.isRunning()) {    
      var objectId = resourceData[1];
      var instance = resourceData[2];
      var resource = resourceData[3];
                        
      getDevicefromGatewayListUsingIoTHubDeviceId(request.payload.deviceId, function(err, device) {
        lwm2mServer.execute(device.lwm2mDeviceId, objectId, instance, resource, params, function(err, result) {
            
            responsePayload = {
                request: 'POST /'+objectId+'/'+instance+'/'+resource,
                response: result, 
                error: err
            }
            
            if (err) {
                respondToLwm2mMethodError(request, response, responsePayload, function(err) {
                    
                });
            } else {
                respondToLwm2mMethodSuccess(request, response, responsePayload, function(err) {
                
                });
            }
        });               
      });
    } else {
      responsePayload = {
        request: 'POST /'+objectId+'/'+instance+'/'+resource,
        response: 'LWM2M Server not running'
      }
      
      respondToLwm2mMethodServerError(request, response, responsePayload, function(err) {
        // TODO: What should happen here?
      });
    } 
  } else {
    // The resourceData was malformed (not /x/x/x)
  }
}

function onLWM2MWrite(request, response) {
  console.log("onLWM2MWrite");
  console.log(request.payload);
  var responsePayload = null;
  
  // Expecting format '/x/x/x', which splits into an array of 4 items
  var resourceData = request.payload.resourceUri.split('/');
  var newValue = request.payload.newValue;
  if (resourceData.length == 4) {
    if (lwm2mServer.isRunning()) {    
      var objectId = resourceData[1];
      var instance = resourceData[2];
      var resource = resourceData[3];

      getDevicefromGatewayListUsingIoTHubDeviceId(request.payload.deviceId, function(err, device) {
        lwm2mServer.write(device.lwm2mDeviceId, objectId, instance, resource, newValue, function(err, result) {
            
          responsePayload = {
              request: 'PUT /'+objectId+'/'+instance+'/'+resource,
              response: result, 
              error: err
          }
          
          if (err) {
            respondToLwm2mMethodError(request, response, responsePayload, function(err) {
              // TODO: What should happen here?
            });
          } else {
            respondToLwm2mMethodSuccess(request, response, responsePayload, function(err) {
              // TODO: What should happen here
            });
          }
        });                
      });                             
    } else {
      responsePayload = {
        request: 'POST /'+objectId+'/'+instance+'/'+resource,
        response: 'LWM2M Server not running'
      }
      
      respondToLwm2mMethodServerError(request, response, responsePayload, function(err) {
        // TODO: What should happen here?                
      });
    } 
  } else {
    // The resourceData was malformed (not /x/x/x)
  }
}

function onLWM2MGet(request, response) {
  console.log("onLWM2MGet");
  console.log(request.payload);
  var responsePayload = null;
  
  // Expecting format '/x/x/x', which splits into an array of 4 items
  var resourceData = request.payload.resourceUri.split('/');
  if (resourceData.length == 4) {
    if (lwm2mServer.isRunning()) {       
      var objectId = resourceData[1];
      var instance = resourceData[2];
      var resource = resourceData[3];
                      
      getDevicefromGatewayListUsingIoTHubDeviceId(request.payload.deviceId, function(err, device) {
        lwm2mServer.read(device.lwm2mDeviceId, objectId, instance, resource, function(err, result) {
          responsePayload = {
            request: 'GET /'+objectId+'/'+instance+'/'+resource,
            response: result,
            error: err
          }

          if (err) {
            respondToLwm2mMethodError(request, response, responsePayload, function(err) {
                // TODO: What should happen here?
            });
          } else {
            respondToLwm2mMethodSuccess(request, response, responsePayload, function(err) {
                // TODO: What should happen here?
            });
            var objUri = '/'+objectId+'/'+instance+'/'+resource;
            updateTwinWithLwm2mData(request.payload.deviceId, objUri, result, false, function(err) {
              // TODO: What should happen here? 
            });
          }
        });    
      });
    }
    else {
      responsePayload = {
        request: 'GET /'+objectId+'/'+instance+'/'+resource,
        response: 'LWM2M Server not running'
      }
      
      respondToLwm2mMethodServerError(request, response, responsePayload, function(err) {
        // TODO: What should happen here?    
      });
    }
  } else {
    // The resourceData was malformed (not /x/x/x)
  }
}

function openOrGetIoTHubConnection(endpoint, callback) {
  var iothubConnString = null;
  var deviceClient = null;
  var deviceItem = null;
  
  var deviceItemList = deviceList.filter(item => item.lwm2mRegName == endpoint);
  if (deviceItemList.length > 0)
  {
    deviceItem = deviceItemList[0];
    iothubConnString = deviceItem.iotHubDeviceConnectionString;
    deviceClient = deviceItem.iothubClient;   
    
    if (deviceClient == null) {
      // Open the connection 
      console.log('Opening new connection for device');
      deviceClient = DeviceClient.fromConnectionString(iothubConnString, Mqtt);
      deviceClient.open(function(err, result) {
        if (err)
        {
          console.error("Error connecting to IoTHub : "+err);
        }
        else 
        {
          console.log("Setting LWM2M callbacks through IoT Hub direct methods, which will be called by back-end application");
          deviceClient.onDeviceMethod('LWM2M_GET', onLWM2MGet); 
          deviceClient.onDeviceMethod('LWM2M_OBSERVE', onLWM2MObserve);
          deviceClient.onDeviceMethod('LWM2M_EXECUTE', onLWM2MExecute);
          deviceClient.onDeviceMethod('LWM2M_WRITE', onLWM2MWrite);
          
          // Saving the deviceClient
          console.log('Saving the deviceClient in the deviceList');
          deviceItem.iothubClient = deviceClient;
          callback(null, deviceClient);
        }
      });
    } else {
      // Grab the connection and pass it back to the caller
      console.log('Reusing existing connection for device');
      callback(null, deviceClient);
    } 
  }            
}

function gatewayRegister(endpoint, payload, callback) {
  // Connect to IoT Hub (as a device)
  openOrGetIoTHubConnection(endpoint, function(err, deviceClient) {
    if (err) {
      console.error('Could not get deviceClient');
    } else {
      var twinPatch = {
        'lwm2m': {
          'regPayload' : payload,
          'registerTime' : new Date().toISOString(),
        }
      };
      
      updateTwinForLWM2MOperation(deviceClient, twinPatch, false, function(err) {
        console.log("Updated Twin");
        callback(err);
      })
    }
  });
}

function getDevicefromGatewayListUsingIoTHubDeviceId(iothubDeviceId, callback) {
  var deviceItemList = deviceList.filter(item => item.iotHubDeviceName == iothubDeviceId);
  if (deviceItemList.length > 0) {
    var device = deviceItemList[0];
    callback(null, device);
  }
}

function getDeviceFromGatewayList(lwm2mDeviceId, callback) {
  var deviceItemList = deviceList.filter(item => item.lwm2mRegName == lwm2mDeviceId);
  if (deviceItemList.length > 0) {
    var device = deviceItemList[0];
    callback(null, device);
  }
}

function registrationHandler(endpoint, lifetime, version, binding, payload, callback) {
  // Get the deviceId for the LWM2M server
  lwm2mServer.getDevice(endpoint, function(err, result) {
    if (err) {
      console.error('Error: getDevice: '+err);
    } else {
      // store the deviceId in the deviceList
      var lwm2mDeviceId = result.id;
      getDeviceFromGatewayList(endpoint, function(err, device) {
        if (err) {
          console.error("Didn't find device in gateway list: "+err);
        } else {
          // Save the lwm2mDeviceId in the gatewayDeviceList
          device.lwm2mDeviceId = lwm2mDeviceId; 
          gatewayRegister(endpoint, payload, function(err) {                    
            console.log('\nDevice registration:\n----------------------------\n');
            console.log('Endpoint name: %s\nLifetime: %s\nBinding: %s', endpoint, lifetime, binding);
            callback(err);
          });
        }
      });
    }
  });
}

function unregistrationHandler(device, callback) {
  console.log('\nDevice unregistration:\n----------------------------\n');
  console.log('Device location: %s', device);
  callback();
}

function setHandlers(serverInfo, callback) {
  console.log('setHandlers: setting registration and unregistration handlers');
  globalServerInfo = serverInfo;
  lwm2mServer.setHandler(serverInfo, 'registration', registrationHandler);
  lwm2mServer.setHandler(serverInfo, 'unregistration', unregistrationHandler);
  callback();
}

async.waterfall([
  async.apply(lwm2mServer.start, config.server),
  setHandlers,
], function(err, done) {
  if (err) {
    console.error("Error: "+err);
  } else {
    console.log("LWM2M Server Started");
  } 
});