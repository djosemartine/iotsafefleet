/*
* IoT Hub Raspberry Pi NodeJS - Microsoft Sample Code - Copyright (c) 2017 - Licensed MIT
*/
'use strict';


const fs = require('fs');
const path = require('path');

const wpi = require('node-wiring-pi');

const Client = require('azure-iot-device').Client;
const ConnectionString = require('azure-iot-device').ConnectionString;
const Message = require('azure-iot-device').Message;
const Protocol = require('azure-iot-device-mqtt').Mqtt;
var Transport = require('azure-iot-provisioning-device-http').Http;
var X509Security = require('azure-iot-security-x509').X509Security;
var ProvisioningDeviceClient = require('azure-iot-provisioning-device').ProvisioningDeviceClient;

const bi = require('az-iot-bi');

const MessageProcessor = require('./messageProcessor.js');
var messageId = 0;
var client, config, messageProcessor;

function sendMessage(stateLed) {
  messageId++;
  messageProcessor.getMessage(messageId, (content, temperatureAlert) => {
    var message = new Message(content);
    message.properties.add('temperatureAlert', temperatureAlert ? 'true' : 'false');
    message.properties.add('stateLed', stateLed ? 'true' : 'false');
    console.log('Sending message: ' + content);
    client.sendEvent(message, (err) => {
      if (err) {
        console.error('Failed to send message to Azure IoT Hub');
      } else {
        blinkLED();
        console.log('Message sent to Azure IoT Hub');
      }
    });
  });
}

function onStart(request, response) {
  wpi.digitalWrite(config.remoteLedPin, 1);
  sendMessage('true');
  console.log('Try to invoke method start(' + request.payload || '' + ')');

  response.send(200, 'Successully start sending message to cloud', function (err) {
    if (err) {
      console.error('[IoT hub Client] Failed sending a method response:\n' + err.message);
    }
  });
}

function onStop(request, response) {
  wpi.digitalWrite(config.remoteLedPin, 0);
  sendMessage('false');
  console.log('Try to invoke method stop(' + request.payload || '' + ')')

  response.send(200, 'Successully stop sending message to cloud', function (err) {
    if (err) {
      console.error('[IoT hub Client] Failed sending a method response:\n' + err.message);
    }
  });
}

function receiveMessageCallback(msg) {
  blinkLED();
  var message = msg.getData().toString('utf-8');
  client.complete(msg, () => {
    console.log('Receive message: ' + message);
  });
}

function blinkLED() {
  // Light up LED for 500 ms
  wpi.digitalWrite(config.LEDPin, 1);
  setTimeout(function () {
    wpi.digitalWrite(config.LEDPin, 0);
  }, 500);
}

function provisionDevice() {
  var provisioningHost = 'global.azure-devices-provisioning.net';
  var idScope = '0ne0003F9FE';
  var registrationId = 'certificate-hackathon-x509';
  var deviceCert = {
    cert: fs.readFileSync('certificate-hackathon-x509_cert.pem').toString(),
    key: fs.readFileSync('certificate-hackathon-x509_key.pem').toString()
  };

  var transport = new Transport();
  var securityClient = new X509Security(registrationId, deviceCert);
  var deviceClient = ProvisioningDeviceClient.create(provisioningHost, idScope, transport, securityClient);

  // Register the device.  Do not force a re-registration.
  deviceClient.register(function (err, result) {
    if (err) {
      console.log("error registering device: " + err);
    } else {
      console.log('registration succeeded');
      console.log('assigned hub=' + result.assignedHub);
      console.log('deviceId=' + result.deviceId);
      var connectionString = config.connectionString;

      client = initClient(connectionString, config);

      client.open((err) => {
        if (err) {
          console.error('[IoT hub Client] Connect error: ' + err.message);
          return;
        }

        // set C2D and device method callback
        client.onDeviceMethod('start', onStart);
        client.onDeviceMethod('stop', onStop);
        client.on('message', receiveMessageCallback);
      });
    }
  });
}

function initClient(connectionStringParam, credentialPath) {
  var connectionString = ConnectionString.parse(connectionStringParam);
  var deviceId = connectionString.DeviceId;

  // fromConnectionString must specify a transport constructor, coming from any transport package.
  // client = Client.fromSharedAccessSignature(connectionStringParam, Protocol);
  client = Client.fromConnectionString(connectionStringParam, Protocol);

  // Configure the client to use X509 authentication if required by the connection string.
  if (connectionString.x509) {
    // Read X.509 certificate and private key.
    // These files should be in the current folder and use the following naming convention:
    // [device name]-cert.pem and [device name]-key.pem, example: myraspberrypi-cert.pem
    var connectionOptions = {
      cert: fs.readFileSync('certificate-hackathon-x509_cert.pem').toString(),
      key: fs.readFileSync('certificate-hackathon-x509_key.pem').toString()
    };

    client.setOptions(connectionOptions);

    console.log('[Device] Using X.509 client certificate authentication');
  }
  return client;
}

(function () {
  // read in configuration in config.json
  try {
    config = require('./config.json');
  } catch (err) {
    console.error('Failed to load config.json: ' + err.message);
    return;
  }

  // set up wiring
  wpi.setup('wpi');
  wpi.pinMode(config.LEDPin, wpi.OUTPUT);
  wpi.pinMode(config.remoteLedPin, wpi.OUTPUT);
  messageProcessor = new MessageProcessor(config);
  blinkLED();

  try {
    var firstTimeSetting = false;
    if (!fs.existsSync(path.join(process.env.HOME, '.iot-hub-getting-started/biSettings.json'))) {
      firstTimeSetting = true;
    }
    bi.start();
    var deviceInfo = { device: "RaspberryPi", language: "NodeJS" };
    if (bi.isBIEnabled()) {
      bi.trackEventWithoutInternalProperties('yes', deviceInfo);
      bi.trackEvent('success', deviceInfo);
    }
    else {
      bi.disableRecordingClientIP();
      bi.trackEventWithoutInternalProperties('no', deviceInfo);
    }
    if (firstTimeSetting) {
      console.log("Telemetry setting will be remembered. If you would like to reset, please delete following file and run the sample again");
      console.log("~/.iot-hub-getting-started/biSettings.json\n");
    }
    bi.flush();
  } catch (e) {
    //ignore
  }

  // create a client
  // read out the connectionString from process environment
  provisionDevice();
})();
