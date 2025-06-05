import { useState, useRef, useCallback } from 'react';

const ServiceUUIDs = {
  PFService: "5df89308-0b98-11eb-adc1-0242ac120002",
};

const CharacteristicUUIDs = {
  Write: "8eb21104-0b98-11eb-adc1-0242ac120002",
  Notify: "8eb20e7a-0b98-11eb-adc1-0242ac120002", // Although not strictly used for sending, keep for reference
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
  CoolFastHigh: new Uint8Array([
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
  RequestMode: new Uint8Array([
    0x35, 0x35, 0x61, 0x31, 0x65, 0x30, 0x39, 0x30, 0x30, 0x30, 0x30, 0x30,
    0x30, 0x30, 0x39, 0x61, 0x0d, 0x0a,
  ]),
};

type TemperatureType = 'cool' | 'hot';
type TemperatureIntensity = 'low' | 'mid' | 'high';

export const useBluetoothTemperature = () => {
  const [isConnected, setIsConnected] = useState(false);
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  const onDisconnected = useCallback(() => {
    setIsConnected(false);
    deviceRef.current = null;
    characteristicRef.current = null;
    console.log('Bluetooth device disconnected');
  }, []);

  const connect = useCallback(async () => {
    if (isConnected) {
      console.log('Already connected to a device.');
      return;
    }

    try {
      console.log('Requesting Bluetooth device...');
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [ServiceUUIDs.PFService] },
        ],
        // acceptAllDevices: true, // Uncomment if you want to see all devices
      });

      console.log('Connecting to GATT Server...');
      device.addEventListener('gattserverdisconnected', onDisconnected);
      const server = await device.gatt?.connect();

      if (!server) {
        throw new Error('Could not connect to GATT server.');
      }

      console.log('Getting Service...');
      const service = await server.getPrimaryService(ServiceUUIDs.PFService);

      console.log('Getting Characteristic...');
      const characteristic = await service.getCharacteristic(CharacteristicUUIDs.Write);

      deviceRef.current = device;
      characteristicRef.current = characteristic;
      setIsConnected(true);
      console.log('Connected to', device.name);

    } catch (error) {
      console.error('Bluetooth connection error:', error);
      setIsConnected(false);
      deviceRef.current = null;
      characteristicRef.current = null;
    }
  }, [isConnected, onDisconnected]);

  const disconnect = useCallback(async () => {
    if (deviceRef.current?.gatt?.connected) {
      console.log('Disconnecting from Bluetooth device...');
      deviceRef.current.removeEventListener('gattserverdisconnected', onDisconnected);
      deviceRef.current.gatt.disconnect();
    }
    setIsConnected(false);
    deviceRef.current = null;
    characteristicRef.current = null;
    console.log('Bluetooth disconnected');
  }, [onDisconnected]);


  const sendTemperatureCommand = useCallback(async (type: TemperatureType, intensity: TemperatureIntensity) => {
    if (!isConnected || !characteristicRef.current) {
      console.log('Not connected to a Bluetooth device.');
      return;
    }

    let command: Uint8Array | undefined;
    if (type === 'cool') {
      if (intensity === 'high') command = Commands.CoolHigh; // Note: CoolFastHigh is also an option
      else if (intensity === 'mid') command = Commands.CoolMid;
      else if (intensity === 'low') command = Commands.CoolLow;
    } else if (type === 'hot') {
      if (intensity === 'high') command = Commands.HotHigh;
      else if (intensity === 'mid') command = Commands.HotMid;
      else if (intensity === 'low') command = Commands.HotLow;
    }

    if (command) {
      try {
        console.log(`Sending command: ${type} ${intensity}`);
        await characteristicRef.current.writeValue(command);
      } catch (error) {
        console.error('Error sending temperature command:', error);
      }
    } else {
      console.warn(`Unknown temperature command combination: ${type} ${intensity}`);
    }
  }, [isConnected]);

  const turnOffTemperature = useCallback(async () => {
    if (!isConnected || !characteristicRef.current) {
      console.log('Not connected to a Bluetooth device.');
      return;
    }
    try {
      console.log('Sending OFF command');
      await characteristicRef.current.writeValue(Commands.OFF);
    } catch (error) {
      console.error('Error sending OFF command:', error);
    }
  }, [isConnected]);


  // Optional: Add a way to subscribe to notifications if needed in the future
  // const subscribeToNotifications = useCallback(async () => { ... }, [isConnected]);
  // const unsubscribeFromNotifications = useCallback(async () => { ... }, [isConnected]);


  return {
    isConnected,
    connect,
    disconnect,
    sendTemperatureCommand,
    turnOffTemperature,
    // subscribeToNotifications, // Optional
    // unsubscribeFromNotifications, // Optional
  };
};