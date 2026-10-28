
import React, { useEffect, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

export default function AccuChekBluetooth() {
  const managerRef = useRef<BleManager | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState('Ready to scan.');

  useEffect(() => {
    const manager = new BleManager();
    managerRef.current = manager;

    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }

      manager.stopDeviceScan();
      manager.destroy();
      managerRef.current = null;
    };
  }, []);

  async function requestBluetoothPermissions() {
    if (Platform.OS !== 'android') return true;

    if (Number(Platform.Version) >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      return (
        result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
          PermissionsAndroid.RESULTS.GRANTED
      );
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );

    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  async function startScan() {
    const manager = managerRef.current;
    if (!manager || scanning) return;

    try {
      setDevices([]);
      setStatus('Checking Bluetooth permissions...');

      const permitted = await requestBluetoothPermissions();

      if (!permitted) {
        setStatus('Bluetooth permission was not granted.');
        return;
      }

      setStatus('Scanning for nearby Bluetooth devices...');
      setScanning(true);

      manager.startDeviceScan(
        null,
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            setStatus(`Scan error: ${error.message}`);
            setScanning(false);
            manager.stopDeviceScan();
            return;
          }

          if (!device) return;

          setDevices((previous) => {
            const existing = previous.find((item) => item.id === device.id);

            if (existing) {
              return previous.map((item) =>
                item.id === device.id ? device : item
              );
            }

            return [...previous, device];
          });
        }
      );

      scanTimeoutRef.current = setTimeout(() => {
        manager.stopDeviceScan();
        setScanning(false);
        setStatus('Scan finished. Select nothing yet; this is discovery only.');
      }, 10000);
    } catch (error) {
      setScanning(false);
      setStatus(
        error instanceof Error ? error.message : 'Unable to start Bluetooth scan.'
      );
    }
  }

  function stopScan() {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    managerRef.current?.stopDeviceScan();
    setScanning(false);
    setStatus('Scan stopped.');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Bluetooth Glucose Meter</Text>

      <Text style={styles.status}>{status}</Text>

      <Pressable
        style={styles.button}
        onPress={scanning ? stopScan : startScan}
      >
        <Text style={styles.buttonText}>
          {scanning ? 'Stop scan' : 'Scan for devices'}
        </Text>
      </Pressable>

      <Text style={styles.subheading}>
        Devices found: {devices.length}
      </Text>

      <ScrollView style={styles.deviceList}>
        {devices.map((device) => (
          <View key={device.id} style={styles.device}>
            <Text style={styles.deviceName}>
              {device.name || device.localName || 'Unnamed Bluetooth device'}
            </Text>
            <Text style={styles.deviceInfo}>ID: {device.id}</Text>
            <Text style={styles.deviceInfo}>
              Signal strength: {device.rssi ?? 'Unknown'} dBm
            </Text>
          </View>
        ))}

        {!devices.length && (
          <Text style={styles.deviceInfo}>
            No devices found yet. Try scanning near your Bluetooth devices.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#DDDDDD',
  },
  heading: {
    color: '#111111',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  status: {
    color: '#333333',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#208AEF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  subheading: {
    color: '#111111',
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  deviceList: {
    maxHeight: 240,
  },
  device: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  deviceName: {
    color: '#111111',
    fontWeight: '600',
  },
  deviceInfo: {
    color: '#444444',
    fontSize: 12,
    marginTop: 3,
  },
});
