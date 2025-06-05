
// PebbleFeel Bluetooth LE Mdule
// Manages connection and communication with the PebbleFeel device.

const PebbleFeelDeviceName = "PebbleFeel";
const ServiceUUIDs = {
  PFService: "5df89308-0b98-11eb-adc1-0242ac120002",
};
const CharacteristicUUIDs = {
  Write: "8eb21104-0b98-11eb-adc1-0242ac120002",
  // Notify: "8eb20e7a-0b98-11eb-adc1-0242ac120002", // For notifications if needed later
};

// PebbleFeel Command Byte Arrays
const Commands = {
  ON: new Uint8Array([ // Might not be strictly needed if mode commands activate the device
    0x35, 0x35, 0x61, 0x30, 0x65, 0x30, 0x38, 0x30, 0x30, 0x30, 0x30, 0x31,
    0x30, 0x30, 0x61, 0x61, 0x0d, 0x0a,
  ]),
  OFF: new Uint8Array([
    0x35, 0x35, 0x61, 0x30, 0x65, 0x30, 0x38, 0x30, 0x30, 0x30, 0x30, 0x30,
    0x30, 0x30, 0x61, 0x62, 0x0d, 0x0a,
  ]),
  CoolRapid: new Uint8Array([ // 'CoolFastHigh' from sample
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
  let connectionStatusCallback = null;

  const _log = (message, ...args) => {
    console.log('[BluetoothManager]', message, ...args);
  };

  const _error = (message, ...args) => {
    console.error('[BluetoothManager]', message, ...args);
    // Potentially, you could add a global error callback here too
  };

  const _updateConnectionStatus = (status) => {
    isDeviceConnected = status;
    if (connectionStatusCallback) {
      try {
        connectionStatusCallback(isDeviceConnected);
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
    _updateConnectionStatus(false);
  };

  const connectDevice = async () => {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      _error('Web Bluetooth API is not available in this environment.');
      // Consider how to inform the user if not in a browser context or if BT isn't supported.
      // For now, returning false and logging an error.
      // alert('Web Bluetooth is not available on this browser or device.'); // Avoid alert in a library module
      return false;
    }
    if (isDeviceConnected) {
      _log('Device already connected.');
      return true;
    }

    try {
      _log('Requesting Bluetooth device with name filter:', PebbleFeelDeviceName);
      bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [{ name: PebbleFeelDeviceName }],
        optionalServices: [ServiceUUIDs.PFService], // Crucial for iOS/macOS if service not advertised
      });

      if (!bluetoothDevice) {
        _error('No device selected by user.');
        return false; // User cancelled the prompt
      }

      _log('Attempting to connect to GATT Server on device:', bluetoothDevice.name);
      bluetoothDevice.addEventListener('gattserverdisconnected', _onGattServerDisconnected);
      gattServer = await bluetoothDevice.gatt.connect();

      _log('Connected to GATT Server. Getting Primary Service...');
      const service = await gattServer.getPrimaryService(ServiceUUIDs.PFService);

      _log('Getting Write Characteristic...');
      writeCharacteristic = await service.getCharacteristic(CharacteristicUUIDs.Write);

      _updateConnectionStatus(true);
      _log('Successfully connected to PebbleFeel device and service/characteristic ready.');
      return true;

    } catch (err) {
      _error('Error during connectDevice:', err.name, err.message);
      if (bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
        _log('Cleaning up potentially partial connection.');
        bluetoothDevice.gatt.disconnect(); // This should trigger _onGattServerDisconnected
      } else { // If disconnect doesn't trigger, ensure state is reset
         _onGattServerDisconnected({target: bluetoothDevice || {name: 'Unknown'}});
      }
      // Provide more specific feedback based on error type
      if (err.name === 'NotFoundError') {
        _error('PebbleFeel device not found. Make sure it is turned on and in range.');
      } else if (err.name === 'NotAllowedError') {
        _error('Bluetooth connection request denied by user or permission not granted.');
      }
      return false;
    }
  };

  const disconnectDevice = async () => {
    if (bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
      _log('Disconnecting from device:', bluetoothDevice.name);
      bluetoothDevice.gatt.disconnect(); // The 'gattserverdisconnected' event will handle state cleanup
    } else {
      _log('No active connection to disconnect or device already disconnected.');
      // Ensure state is clean if called when not truly connected
       if (isDeviceConnected) { // If state thinks it's connected but gatt is not
          _onGattServerDisconnected({target: bluetoothDevice || {name: 'Previously Connected Device'}});
       }
    }
  };

  const sendTemperatureCommand = async (mode, intensity, duration) => {
    // Note: 'duration' is passed for API consistency but not directly used for command sending.
    // The PebbleFeel protocol typically sets a mode, and a separate 'OFF' command is needed.
    // The calling application (MusicSync) should manage timing for turning effects off.
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
      _log(`Sending command: ${mode} - ${intensity}. Bytes: ${Array.from(commandBytes).join(', ')}`);
      // Using writeValueWithoutResponse as it's common for such devices and matches sample's implicit behavior.
      // If PebbleFeel requires response, use writeValueWithResponse.
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
    return isDeviceConnected;
  };

  const onConnectionChanged = (callback) => {
    if (typeof callback === 'function') {
      connectionStatusCallback = callback;
      // Immediately invoke with current status if already connected
      // This helps if the listener is attached after connection.
      // callback(isDeviceConnected); // Consider if this immediate call is desired or if it should only fire on *changes*.
                                  // For now, let's keep it to fire on actual changes or initial connect/disconnect.
    } else {
      _error('Provided callback for onConnectionChanged is not a function.');
    }
  };

  // Public API
  return {
    connectDevice,
    disconnectDevice,
    sendTemperatureCommand, // mode, intensity, duration (duration not used by this method)
    turnOffEffect,          // Explicitly turn off
    getConnectionStatus,
    onConnectionChanged,
  };
})();

export default BluetoothManager;
