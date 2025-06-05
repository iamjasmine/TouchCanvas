
// PebbleFeel Bluetooth LE Mdule
// Manages connection and communication with the PebbleFeel device.

const PebbleFeelDeviceName = "PebbleFeel";
const ServiceUUIDs = {
  PFService: "5df89308-0b98-11eb-adc1-0242ac120002",
};
const CharacteristicUUIDs = {
  Write: "8eb21104-0b98-11eb-adc1-0242ac120002",
};

const Commands = {
  ON: new Uint8Array([
    0x35, 0x35, 0x61, 0x30, 0x65, 0x30, 0x38, 0x30, 0x30, 0x30, 0x30, 0x31,
    0x30, 0x30, 0x61, 0x61, 0x0d, 0x0a,
  ]),
  OFF: new Uint8Array([
    0x35, 0x35, 0x61, 0x30, 0x65, 0x30, 0x38, 0x30, 0x30, 0x30, 0x30, 0x30,
    0x30, 0x30, 0x61, 0x62, 0x0d, 0x0a,
  ]),
  CoolRapid: new Uint8Array([
    0x35, 0x35, 0x61, 0x30, 0x65, 0x30, 0x39, 0x30, 0x30, 0x30, 0x30, 0x35,
    0x30, 0x30, 0x39, 0x36, 0x0d, 0x0a,
  ]),
  CoolHigh: new Uint8Array([
    0x35, 0x35, 0x61, 0x30, 0x65, 0x30, 0x39, 0x30, 0x30, 0x30, 0x30, 0x34,
    0x30, 0x30, 0x39, 0x37, 0x0d, 0x0a,
  ]),
  CoolMid: new Uint8Array([
    0x35, 0x35, 0x61, 0x30, 0x65, 0x30, 0x39, 0x30, 0x30, 0x30, 0x30, 0x33,
    0x30, 0x30, 0x39, 0x38, 0x0d, 0x0a,
  ]),
  CoolLow: new Uint8Array([
    0x35, 0x35, 0x61, 0x30, 0x65, 0x30, 0x39, 0x30, 0x30, 0x30, 0x30, 0x32,
    0x30, 0x30, 0x39, 0x39, 0x0d, 0x0a,
  ]),
  HotHigh: new Uint8Array([
    0x35, 0x35, 0x61, 0x30, 0x65, 0x30, 0x39, 0x30, 0x30, 0x30, 0x30, 0x38,
    0x30, 0x30, 0x39, 0x33, 0x0d, 0x0a,
  ]),
  HotMid: new Uint8Array([
    0x35, 0x35, 0x61, 0x30, 0x65, 0x30, 0x39, 0x30, 0x30, 0x30, 0x30, 0x37,
    0x30, 0x30, 0x39, 0x34, 0x0d, 0x0a,
  ]),
  HotLow: new Uint8Array([
    0x35, 0x35, 0x61, 0x30, 0x65, 0x30, 0x39, 0x30, 0x30, 0x30, 0x30, 0x36,
    0x30, 0x30, 0x39, 0x35, 0x0d, 0x0a,
  ]),
};

const BluetoothManager = (function() {
  let bluetoothDevice = null;
  let gattServer = null;
  let writeCharacteristic = null;
  let isDeviceConnected = false;
  let connectedDeviceNameInternal = null; // Store device name
  let connectionStatusCallback = null;

  const _log = (message, ...args) => {
    console.log('[BluetoothManager]', message, ...args);
  };

  const _error = (message, ...args) => {
    console.error('[BluetoothManager]', message, ...args);
  };

  const _updateConnectionStatus = (status, deviceName = null) => {
    isDeviceConnected = status;
    connectedDeviceNameInternal = status ? deviceName : null;
    if (connectionStatusCallback) {
      try {
        // Pass both status and deviceName to the callback
        connectionStatusCallback(isDeviceConnected, connectedDeviceNameInternal);
      } catch (e) {
        _error("Error in connectionStatusCallback:", e);
      }
    }
  };

  const _onGattServerDisconnected = (event) => {
    _log('Device disconnected via GATT event:', event.target.name);
    if (bluetoothDevice && bluetoothDevice.removeEventListener) {
        bluetoothDevice.removeEventListener('gattserverdisconnected', _onGattServerDisconnected);
    }
    bluetoothDevice = null;
    gattServer = null;
    writeCharacteristic = null;
    _updateConnectionStatus(false, null); // Ensure deviceName is nulled on disconnect
  };

  const connectDevice = async () => {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      _error('Web Bluetooth API is not available in this environment.');
      return { success: false, error: 'not_supported' };
    }
    if (isDeviceConnected) {
      _log('Device already connected.');
      return { success: true, deviceName: connectedDeviceNameInternal };
    }

    try {
      _log('Requesting Bluetooth device with name filter:', PebbleFeelDeviceName);
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: PebbleFeelDeviceName }],
        optionalServices: [ServiceUUIDs.PFService],
      });

      if (!device) {
        _error('No device selected by user.');
        return { success: false, error: 'cancelled' }; // User cancelled
      }
      bluetoothDevice = device; // Store device temporarily

      _log('Attempting to connect to GATT Server on device:', bluetoothDevice.name);
      bluetoothDevice.addEventListener('gattserverdisconnected', _onGattServerDisconnected);
      gattServer = await bluetoothDevice.gatt.connect();

      _log('Connected to GATT Server. Getting Primary Service...');
      const service = await gattServer.getPrimaryService(ServiceUUIDs.PFService);

      _log('Getting Write Characteristic...');
      writeCharacteristic = await service.getCharacteristic(CharacteristicUUIDs.Write);
      
      const name = bluetoothDevice.name || 'PebbleFeel';
      _updateConnectionStatus(true, name);
      _log('Successfully connected to PebbleFeel device:', name);
      return { success: true, deviceName: name };

    } catch (err) {
      _error('Error during connectDevice:', err.name, err.message);
      if (bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
        _log('Cleaning up potentially partial connection.');
        bluetoothDevice.gatt.disconnect();
      } else {
         _onGattServerDisconnected({target: bluetoothDevice || {name: 'Unknown'}});
      }
      let errorType = 'connection_failed';
      if (err.name === 'NotFoundError') errorType = 'not_found';
      if (err.name === 'NotAllowedError') errorType = 'not_allowed';
      return { success: false, error: errorType, message: err.message };
    }
  };

  const disconnectDevice = async () => {
    if (bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
      _log('Disconnecting from device:', bluetoothDevice.name);
      bluetoothDevice.gatt.disconnect(); 
    } else {
      _log('No active connection to disconnect or device already disconnected.');
       if (isDeviceConnected) {
          _onGattServerDisconnected({target: bluetoothDevice || {name: 'Previously Connected Device'}});
       }
    }
  };

  const sendTemperatureCommand = async (mode, intensity, duration) => {
    if (!isDeviceConnected || !writeCharacteristic) {
      _error('Cannot send command: Not connected or characteristic not available.');
      return false;
    }

    let commandBytes;
    if (mode === 'cool') {
      switch (intensity) {
        case 'rapid': commandBytes = Commands.CoolRapid; break;
        case 'high': commandBytes = Commands.CoolHigh; break;
        case 'mid': commandBytes = Commands.CoolMid; break;
        case 'low': commandBytes = Commands.CoolLow; break;
        default: _error('Invalid cool intensity:', intensity); return false;
      }
    } else if (mode === 'hot') {
      switch (intensity) {
        case 'high': commandBytes = Commands.HotHigh; break;
        case 'mid': commandBytes = Commands.HotMid; break;
        case 'low': commandBytes = Commands.HotLow; break;
        default: _error('Invalid hot intensity:', intensity); return false;
      }
    } else {
      _error('Invalid temperature mode:', mode);
      return false;
    }

    try {
      _log(`Sending command: ${mode} - ${intensity}. Duration (unused by send): ${duration}s. Bytes: ${Array.from(commandBytes).join(', ')}`);
      await writeCharacteristic.writeValueWithoutResponse(commandBytes);
      _log('Command sent successfully.');
      return true;
    } catch (err) {
      _error('Error sending temperature command:', err.name, err.message);
      return false;
    }
  };

  const turnOffEffect = async () => {
    if (!isDeviceConnected || !writeCharacteristic) {
      _error('Cannot send OFF command: Not connected or characteristic not available.');
      return false;
    }
    try {
      _log('Sending OFF command. Bytes:', Array.from(Commands.OFF).join(', '));
      await writeCharacteristic.writeValueWithoutResponse(Commands.OFF);
      _log('OFF command sent successfully.');
      return true;
    } catch (err) {
      _error('Error sending OFF command:', err.name, err.message);
      return false;
    }
  };

  const getConnectionStatus = () => {
    return { isConnected: isDeviceConnected, deviceName: connectedDeviceNameInternal };
  };

  const onConnectionChanged = (callback) => {
    if (typeof callback === 'function') {
      connectionStatusCallback = callback;
    } else {
      _error('Provided callback for onConnectionChanged is not a function.');
    }
  };

  return {
    connectDevice,
    disconnectDevice,
    sendTemperatureCommand,
    turnOffEffect,
    getConnectionStatus,
    onConnectionChanged,
  };
})();

export default BluetoothManager;
