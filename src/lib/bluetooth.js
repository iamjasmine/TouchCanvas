
// PebbleFeel Bluetooth LE Mdule
// Manages connection and communication with the PebbleFeel device.

const PebbleFeelDeviceName = "PebbleFeel";
const ServiceUUIDs = {
  PFService: "5df89308-0b98-11eb-adc1-0242ac120002", // Standard PebbleFeel Service UUID
};
const CharacteristicUUIDs = {
  Write: "8eb21104-0b98-11eb-adc1-0242ac120002", // Standard PebbleFeel Write Characteristic UUID
};

const Commands = {
  ON: new Uint8Array([ // Not typically used directly by this enhanced manager, but kept for reference
    0x35, 0x35, 0x61, 0x30, 0x65, 0x30, 0x38, 0x30, 0x30, 0x30, 0x30, 0x31,
    0x30, 0x30, 0x61, 0x61, 0x0d, 0x0a,
  ]),
  OFF: new Uint8Array([
    0x35, 0x35, 0x61, 0x30, 0x65, 0x30, 0x38, 0x30, 0x30, 0x30, 0x30, 0x30,
    0x30, 0x30, 0x61, 0x62, 0x0d, 0x0a,
  ]),
  CoolRapid: new Uint8Array([ // CoolFastHigh in original context
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
  let connectedDeviceNameInternal = null;
  let connectionStatusCallback = null;

  const _log = (icon, message, ...args) => {
    if (typeof icon === 'string' && icon.length < 3) { // Basic emoji check
        console.log(`[BluetoothManager] ${icon}`, message, ...args);
    } else {
        // If no icon, or first arg isn't a short string, assume it's part of message
        console.log('[BluetoothManager]', icon, message, ...args);
    }
  };

  const _warn = (icon, message, ...args) => {
    if (typeof icon === 'string' && icon.length < 3) {
        console.warn(`[BluetoothManager] ${icon}`, message, ...args);
    } else {
        console.warn('[BluetoothManager]', icon, message, ...args);
    }
  };

  const _error = (icon, message, ...args) => {
     if (typeof icon === 'string' && icon.length < 3) {
        console.error(`[BluetoothManager] ${icon}`, message, ...args);
    } else {
        console.error('[BluetoothManager]', icon, message, ...args);
    }
  };

  const _updateConnectionStatus = (status, deviceName = null) => {
    isDeviceConnected = status;
    connectedDeviceNameInternal = status ? deviceName : null;
    _log('ℹ️', `Connection status updated: ${status ? 'Connected' : 'Disconnected'}${deviceName ? ' to ' + deviceName : ''}`);
    if (connectionStatusCallback) {
      try {
        connectionStatusCallback(isDeviceConnected, connectedDeviceNameInternal);
      } catch (e) {
        _error('❗', "Error in connectionStatusCallback:", e);
      }
    }
  };

  const _onGattServerDisconnected = (event) => {
    const deviceName = event && event.target ? event.target.name : (bluetoothDevice ? bluetoothDevice.name : 'Unknown Device');
    _log('🔌', `Device disconnected via GATT event: ${deviceName}`);
    if (bluetoothDevice && bluetoothDevice.removeEventListener) {
        bluetoothDevice.removeEventListener('gattserverdisconnected', _onGattServerDisconnected);
    }
    bluetoothDevice = null;
    gattServer = null;
    writeCharacteristic = null;
    _updateConnectionStatus(false, null);
  };

  const connectDevice = async () => {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      _error('❗', 'Web Bluetooth API is not available in this environment.');
      return { success: false, error: 'not_supported', message: 'Web Bluetooth API is not available in this browser.' };
    }
    if (isDeviceConnected) {
      _log('✅', 'Device already connected:', connectedDeviceNameInternal);
      return { success: true, deviceName: connectedDeviceNameInternal };
    }

    let localBluetoothDevice = null; // Use a local var for the try block

    try {
      _log('🔵', 'Scanning for PebbleFeel devices (name filter: "' + PebbleFeelDeviceName + '")...');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: PebbleFeelDeviceName }], // Standard PebbleFeel name
        // Or, to be more specific if multiple services are on the device:
        // filters: [{ services: [ServiceUUIDs.PFService] }],
        optionalServices: [ServiceUUIDs.PFService],
      });

      if (!device) {
        _log('🟡', 'No device selected by user (requestDevice returned null).');
        return { success: false, error: 'cancelled', message: 'Device selection cancelled or no device found.' };
      }
      localBluetoothDevice = device; // Assign to local variable
      const mockDeviceName = localBluetoothDevice.name || "PebbleFeel-ABC123 (Mock Name)";
      _log('🔵', `Device found: ${mockDeviceName} (Actual ID: ${localBluetoothDevice.id})`);

      _log('🔵', `Connecting to GATT Server on '${mockDeviceName}'...`);
      localBluetoothDevice.addEventListener('gattserverdisconnected', _onGattServerDisconnected);
      const server = await localBluetoothDevice.gatt.connect();
      gattServer = server; // Assign to module scope var
      _log('🔵', `Connected to GATT Server on '${mockDeviceName}'.`);

      _log('🔵', `Getting Primary Service (UUID: ${ServiceUUIDs.PFService})...`);
      const service = await gattServer.getPrimaryService(ServiceUUIDs.PFService);
      _log('🔵', 'Primary Service obtained.');

      _log('🔵', `Getting Write Characteristic (UUID: ${CharacteristicUUIDs.Write})...`);
      const characteristic = await service.getCharacteristic(CharacteristicUUIDs.Write);
      writeCharacteristic = characteristic; // Assign to module scope var
      _log('🔵', 'Write Characteristic obtained. PebbleFeel Service Ready!');
      
      bluetoothDevice = localBluetoothDevice; // Successfully connected, assign to module scope
      connectedDeviceNameInternal = mockDeviceName; // Use the potentially mocked name for consistency
      _updateConnectionStatus(true, connectedDeviceNameInternal);
      return { success: true, deviceName: connectedDeviceNameInternal };

    } catch (err) {
      // Clean up gattserverdisconnected listener if added
      if (localBluetoothDevice && localBluetoothDevice.removeEventListener) {
         localBluetoothDevice.removeEventListener('gattserverdisconnected', _onGattServerDisconnected);
      }
      if (localBluetoothDevice && localBluetoothDevice.gatt && localBluetoothDevice.gatt.connected) {
        _log('🟡', 'Cleaning up partially connected GATT server...');
        localBluetoothDevice.gatt.disconnect(); // This should trigger _onGattServerDisconnected
      } else {
        // If GATT wasn't connected or listener not added, ensure state is reset
         _onGattServerDisconnected({target: localBluetoothDevice || {name: 'Attempted Device'}});
      }
      
      let errorType = 'connection_failed';
      let returnMessage = err.message || 'Unknown connection error.';

      if (err.name === 'SecurityError') {
        errorType = 'security_error';
        returnMessage = 'Access to Bluetooth feature disallowed by permissions policy. This often happens in sandboxed environments like iframes. Try opening the app in a new tab or window.';
        _warn('🔒', `Connection failed due to SecurityError: ${err.message}. This is often due to iframe restrictions. Ensure the app is run in a top-level context.`);
      } else if (err.name === 'NotFoundError') {
        errorType = 'not_found'; // This can mean user cancelled or no device truly matched
        returnMessage = 'PebbleFeel device not found or selection cancelled. Ensure it is discoverable and in range.';
        _log('🟡', `NotFoundError during device request (user cancellation or no device found): ${err.message}`);
      } else if (err.name === 'NotAllowedError') {
        errorType = 'not_allowed';
        returnMessage = 'Bluetooth permission denied or feature disabled by user/browser.';
        _error('🚫', `NotAllowedError during device request: ${err.message}`);
      } else {
        _error('❗', `Unhandled error during connectDevice: ${err.name} - ${err.message}`);
      }
      
      return { success: false, error: errorType, message: returnMessage };
    }
  };

  const disconnectDevice = async () => {
    if (bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
      _log('🔵', 'Disconnecting from device:', bluetoothDevice.name);
      bluetoothDevice.gatt.disconnect(); // This will trigger the 'gattserverdisconnected' event
    } else {
      _log('🟡', 'No active connection to disconnect or device already disconnected.');
       if (isDeviceConnected) { // If internal state is connected but device isn't, force update
          _onGattServerDisconnected({target: bluetoothDevice || {name: 'Previously Connected Device'}});
       }
    }
  };

  const sendTemperatureCommand = async (mode, intensity, duration) => {
    _log('🌡️', 'Attempting sendTemperatureCommand:');
    _log('  Mode:', mode);
    _log('  Intensity:', intensity);
    _log('  Duration (for app timing):', duration + 's');

    if (!isDeviceConnected || !writeCharacteristic) {
      _error('❗', 'Cannot send command: Not connected or characteristic not available.');
      _log('  Status: Failed (Not Connected)');
      return false;
    }

    let commandBytes;
    let commandName = `${mode.toUpperCase()} ${intensity.toUpperCase()}`;

    if (mode === 'cool') {
      switch (intensity) {
        case 'rapid': commandBytes = Commands.CoolRapid; break;
        case 'high': commandBytes = Commands.CoolHigh; break;
        case 'mid': commandBytes = Commands.CoolMid; break;
        case 'low': commandBytes = Commands.CoolLow; break;
        default: _error('❗', 'Invalid cool intensity:', intensity); _log('  Status: Failed (Invalid Intensity)'); return false;
      }
    } else if (mode === 'hot') {
      switch (intensity) {
        case 'high': commandBytes = Commands.HotHigh; break;
        case 'mid': commandBytes = Commands.HotMid; break;
        case 'low': commandBytes = Commands.HotLow; break;
        default: _error('❗', 'Invalid hot intensity:', intensity); _log('  Status: Failed (Invalid Intensity)'); return false;
      }
    } else {
      _error('❗', 'Invalid temperature mode:', mode);
      _log('  Status: Failed (Invalid Mode)');
      return false;
    }

    const hexBytes = Array.from(commandBytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    _log('  Command Name:', commandName);
    _log('  Raw Bytes to Send:', hexBytes);

    try {
      _log('  Simulating: characteristic.writeValueWithoutResponse(...)');
      await writeCharacteristic.writeValueWithoutResponse(commandBytes);
      _log('  Status: Command sent successfully.');
      return true;
    } catch (err) {
      _error('❗', `Error sending temperature command (${commandName}):`, err.name, err.message);
      _log('  Status: Failed (Write Error)');
      return false;
    }
  };

  const turnOffEffect = async () => {
    _log('🌡️', 'Attempting turnOffEffect (send OFF command):');
    if (!isDeviceConnected || !writeCharacteristic) {
      _error('❗', 'Cannot send OFF command: Not connected or characteristic not available.');
      _log('  Status: Failed (Not Connected)');
      return false;
    }
    const hexBytes = Array.from(Commands.OFF).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    _log('  Command Name: OFF');
    _log('  Raw Bytes to Send:', hexBytes);
    try {
      _log('  Simulating: characteristic.writeValueWithoutResponse(OFF_COMMAND)');
      await writeCharacteristic.writeValueWithoutResponse(Commands.OFF);
      _log('  Status: OFF Command sent successfully.');
      return true;
    } catch (err) {
      _error('❗', 'Error sending OFF command:', err.name, err.message);
      _log('  Status: Failed (Write Error)');
      return false;
    }
  };

  const getConnectionStatus = () => {
    return { isConnected: isDeviceConnected, deviceName: connectedDeviceNameInternal };
  };

  const onConnectionChanged = (callback) => {
    if (typeof callback === 'function') {
      connectionStatusCallback = callback;
      _log('ℹ️', 'Connection status callback registered.');
    } else {
      _error('❗', 'Provided callback for onConnectionChanged is not a function.');
    }
  };

  // --- Error Simulation (Conceptual - for testing UI reactions) ---
  // These are not direct GATT simulations but ways to test UI's response to manager states.
  const _simulateConnectionTimeout = () => {
      _log('⚠️', 'Simulating Connection Timeout...');
      _updateConnectionStatus(false, null); // Basic simulation
      // In a real scenario, connectDevice promise would hang or reject after a browser timeout.
      // The UI would need its own timeout handling for the connectDevice promise.
  };

  const _simulateDeviceNotFound = () => {
      _log('⚠️', 'Simulating Device Not Found (after scan)...');
      // This is more like the user cancelling, or navigator.bluetooth.requestDevice truly finding nothing.
      // The `connectDevice` already handles the `NotFoundError` from `requestDevice`.
      // To explicitly test UI for "not found", the UI would react to `connectDevice` returning `{success: false, error: 'not_found'}`.
      _updateConnectionStatus(false, null);
  };

  // Expose simulation methods if needed for external testing, otherwise keep internal
  // Example:
  // if (process.env.NODE_ENV === 'development') {
  //   publicApi.simulateTimeout = _simulateConnectionTimeout;
  //   publicApi.simulateNotFound = _simulateDeviceNotFound;
  // }


  const publicApi = {
    connectDevice,
    disconnectDevice,
    sendTemperatureCommand,
    turnOffEffect,
    getConnectionStatus,
    onConnectionChanged,
  };

  return publicApi;
})();

export default BluetoothManager;
