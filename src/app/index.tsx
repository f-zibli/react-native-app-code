// import {
//   useCallback,
//   useEffect,
//   useRef,
//   useState,
// } from 'react';

// import {
//   AppState,
//   Button,
//   ScrollView,
//   Text,
//   View,
// } from 'react-native';

// import {
//   getGrantedPermissions,
//   getSdkStatus,
//   initialize,
//   readRecords,
//   requestPermission,
//   SdkAvailabilityStatus,
// } from 'react-native-health-connect';

// import type {
//   Permission,
//   RecordType,
// } from 'react-native-health-connect';

// const TYPES: RecordType[] = [
//   'Steps',
//   'HeartRate',
//   'SleepSession',
//   'OxygenSaturation',
//   'ExerciseSession',
//   'TotalCaloriesBurned',
//   'ActiveCaloriesBurned',
//   'Nutrition',
//   'HeartRateVariabilityRmssd',
// ];

// const LOOKBACK_DAYS = 1;
// const POLL_MS = 30_000;

// /**
//  * Produces a rough HRV-derived stress estimate from RMSSD in milliseconds.
//  * This is an experimental proxy, not a clinically validated stress measurement.
//  * Lower RMSSD maps to a higher score.
//  */
// const calculateStressFromRmssd = (rmssdMs: number): number => {
//   if (!Number.isFinite(rmssdMs) || rmssdMs <= 0) return 0;

//   const lnHrv = Math.log(rmssdMs);
//   const minLnHrv = 2.3;
//   const maxLnHrv = 5.0;
//   const clampedLn = Math.max(minLnHrv, Math.min(maxLnHrv, lnHrv));
//   const normalized = (clampedLn - minLnHrv) / (maxLnHrv - minLnHrv);
//   return Math.round((1 - normalized) * 100);
// };

// const formatTime = (value?: string): string => {
//   if (!value) return 'Time unavailable';
//   const date = new Date(value);
//   return Number.isNaN(date.getTime())
//     ? value
//     : date.toLocaleString();
// };

// const getNutritionCalories = (record: any): number | null => {
//   const kcal = record?.energy?.inKilocalories;
//   if (typeof kcal === 'number' && Number.isFinite(kcal)) return kcal;

//   // Some library versions may expose the energy value in another unit shape.
//   const calories = record?.energy?.inCalories;
//   if (typeof calories === 'number' && Number.isFinite(calories)) {
//     return calories / 1000;
//   }

//   return null;
// };

// export default function App() {
//   const [status, setStatus] = useState('Starting...');
//   const [data, setData] = useState<Record<string, any>>({});
//   const [lastSync, setLastSync] = useState<string | null>(null);
//   const [granted, setGranted] = useState<Permission[]>([]);
//   const ready = useRef(false);
//   const busy = useRef(false);

//   const fetchAll = useCallback(async () => {
//     if (!ready.current || busy.current) return;

//     busy.current = true;
//     setStatus('Reading Health Connect...');

//     try {
//       const permissions = await getGrantedPermissions();
//       console.log(
//         'HEALTH CONNECT GRANTED PERMISSIONS:',
//         JSON.stringify(permissions, null, 2),
//       );
//       setGranted(permissions);

//       const end = new Date();
//       const start = new Date(
//         end.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
//       );

//       const results: Record<string, any> = {};

//       for (const type of TYPES) {
//         const hasReadPermission = permissions.some(
//           (permission) =>
//             permission.accessType === 'read' &&
//             permission.recordType === type,
//         );

//         if (!hasReadPermission) {
//           results[type] = { error: 'Read permission not granted' };
//           continue;
//         }

//         try {
//           // Read each record type once for the selected time range.
//           const { records } = await readRecords(type, {
//             timeRangeFilter: {
//               operator: 'between',
//               startTime: start.toISOString(),
//               endTime: end.toISOString(),
//             },
//           });

//           results[type] = records;

//           if (type === 'HeartRateVariabilityRmssd') {
//             records.forEach((record: any) => {
//               const rawRmssd = record.heartRateVariabilityMillis;
//               const stressScore =
//                 typeof rawRmssd === 'number'
//                   ? calculateStressFromRmssd(rawRmssd)
//                   : null;

//               console.log(
//                 `[HRV Log] Time: ${formatTime(record.time ?? record.startTime)} | ` +
//                   `RMSSD: ${rawRmssd ?? 'unavailable'} ms | ` +
//                   `Estimated stress: ${stressScore === null ? 'unavailable' : `${stressScore}/100`}`,
//               );
//             });
//           }

//           if (type === 'Nutrition') {
//             records.forEach((record: any) => {
//               const caloriesConsumed = getNutritionCalories(record);
//               console.log(
//                 `[Nutrition Log] Time: ${formatTime(record.startTime ?? record.time)} | ` +
//                   `Food: ${record.name ?? record.mealName ?? 'Unspecified'} | ` +
//                   `Meal type: ${record.mealType ?? 'Unknown'} | ` +
//                   `Calories: ${caloriesConsumed === null ? 'unavailable' : `${caloriesConsumed} kcal`}`,
//               );
//             });
//           }

//           console.log(
//             `[${type}] ${records.length} records`,
//             JSON.stringify(records.slice(0, 3), null, 2),
//           );
//         } catch (error: any) {
//           results[type] = {
//             error: error?.message ?? String(error),
//           };
//           console.error(`[${type}] read failed:`, error);
//         }
//       }

//       setData(results);
//       setLastSync(new Date().toLocaleTimeString());
//       setStatus('Read complete');
//     } catch (error: any) {
//       setStatus(`Sync failed: ${error?.message ?? String(error)}`);
//       console.error('Health Connect sync failed:', error);
//     } finally {
//       busy.current = false;
//     }
//   }, []);

//   const setup = useCallback(async () => {
//     ready.current = false;
//     setStatus('Checking Health Connect...');

//     try {
//       const sdkStatus = await getSdkStatus();

//       if (sdkStatus !== SdkAvailabilityStatus.SDK_AVAILABLE) {
//         setStatus(`Health Connect unavailable (${sdkStatus})`);
//         return;
//       }

//       const initialized = await initialize();
//       if (initialized === false) {
//         setStatus('Health Connect initialization failed');
//         return;
//       }

//       const requestedPermissions: Permission[] = TYPES.map(
//         (recordType) => ({
//           accessType: 'read',
//           recordType,
//         }),
//       );

//       await requestPermission(requestedPermissions);

//       const currentPermissions = await getGrantedPermissions();
//       setGranted(currentPermissions);

//       const missing = TYPES.filter(
//         (type) =>
//           !currentPermissions.some(
//             (permission) =>
//               permission.accessType === 'read' &&
//               permission.recordType === type,
//           ),
//       );

//       if (missing.length > 0) {
//         setStatus(`Missing permissions: ${missing.join(', ')}`);
//       } else {
//         setStatus('Permissions granted');
//       }

//       ready.current = true;
//       await fetchAll();
//     } catch (error: any) {
//       setStatus(`Setup error: ${error?.message ?? String(error)}`);
//       console.error('Health Connect setup failed:', error);
//     }
//   }, [fetchAll]);

//   useEffect(() => {
//     void setup();

//     return () => {
//       ready.current = false;
//     };
//   }, [setup]);

//   useEffect(() => {
//     const timer = setInterval(() => {
//       if (AppState.currentState === 'active') {
//         void fetchAll();
//       }
//     }, POLL_MS);

//     return () => clearInterval(timer);
//   }, [fetchAll]);

//   useEffect(() => {
//     const subscription = AppState.addEventListener('change', (nextState) => {
//       if (nextState === 'active') {
//         void fetchAll();
//       }
//     });

//     return () => subscription.remove();
//   }, [fetchAll]);

//   return (
//     <ScrollView
//       style={{ flex: 1, backgroundColor: '#FFFFFF' }}
//       contentContainerStyle={{
//         paddingTop: 60,
//         paddingHorizontal: 16,
//         paddingBottom: 40,
//       }}
//     >
//       <Text style={{ color: '#000000', fontSize: 21, fontWeight: 'bold' }}>
//         Health Connect Diagnostics
//       </Text>

//       <Text style={{ color: '#222222', marginTop: 8 }}>Status: {status}</Text>
//       <Text style={{ color: '#222222', marginTop: 4 }}>
//         Last sync: {lastSync ?? 'Not synced yet'}
//       </Text>
//       <Text style={{ color: '#222222', marginTop: 4 }}>
//         Granted read permissions:{' '}
//         {granted.filter((permission) => permission.accessType === 'read').length}
//       </Text>

//       <View style={{ marginVertical: 12 }}>
//         <Button title="Sync now" onPress={() => void fetchAll()} />
//       </View>

//       {TYPES.map((type) => {
//         const value = data[type];
//         const isArray = Array.isArray(value);

//         return (
//           <View
//             key={type}
//             style={{
//               marginTop: 10,
//               padding: 12,
//               borderRadius: 8,
//               backgroundColor: '#F2F2F2',
//             }}
//           >
//             <Text style={{ color: '#000000', fontWeight: 'bold' }}>
//               {type}:{' '}
//               {isArray
//                 ? `${value.length} records`
//                 : value?.error ?? 'Waiting...'}
//             </Text>

//             {isArray && value.length > 0 && (
//               <View style={{ marginTop: 6 }}>
//                 {type === 'Nutrition' ? (
//                   value.slice(0, 5).map((record: any, index: number) => {
//                     const calories = getNutritionCalories(record);
//                     const mealName = record.name ?? record.mealName ?? 'Unspecified food';

//                     return (
//                       <Text
//                         key={`${record.metadata?.id ?? 'nutrition'}-${index}`}
//                         style={{ color: '#333333', fontSize: 13, marginBottom: 4 }}
//                       >
//                         • {calories === null ? 'Calories unavailable' : `${calories} kcal`}
//                         {' — '}{mealName}
//                         {' ('}{record.mealType ?? 'Meal type unknown'}{')'}
//                         {' — '}{formatTime(record.startTime ?? record.time)}
//                       </Text>
//                     );
//                   })
//                 ) : type === 'HeartRateVariabilityRmssd' ? (
//                   value.slice(0, 5).map((record: any, index: number) => {
//                     const rawRmssd = record.heartRateVariabilityMillis;
//                     const stressScore =
//                       typeof rawRmssd === 'number'
//                         ? calculateStressFromRmssd(rawRmssd)
//                         : null;

//                     return (
//                       <Text
//                         key={`${record.metadata?.id ?? 'hrv'}-${index}`}
//                         style={{ color: '#333333', fontSize: 13, marginBottom: 4 }}
//                       >
//                         • {formatTime(record.time ?? record.startTime)} → Estimated stress:{' '}
//                         <Text style={{ fontWeight: 'bold' }}>
//                           {stressScore === null ? 'Unavailable' : `${stressScore}/100`}
//                         </Text>
//                         {' ('}{rawRmssd ?? 'N/A'} ms RMSSD{')'}
//                       </Text>
//                     );
//                   })
//                 ) : (
//                   <Text
//                     selectable
//                     style={{ color: '#333333', fontSize: 12 }}
//                   >
//                     {JSON.stringify(value.slice(0, 3), null, 2)}
//                   </Text>
//                 )}
//               </View>
//             )}
//           </View>
//         );
//       })}
//     </ScrollView>
//   );
// }


import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import type { Permission, RecordType } from 'react-native-health-connect';
import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import AccuChekBluetooth from 'C:/ha/src/components/AccuCheckBluetooth';

const TYPES: RecordType[] = [
  'Steps',
  'HeartRate',
  'SleepSession',
  'OxygenSaturation',
  'ExerciseSession',
  'TotalCaloriesBurned',
  'ActiveCaloriesBurned',
  'Nutrition',
  'HeartRateVariabilityRmssd',
];
const LOOKBACK_DAYS = 14;
const POLL_MS = 30_000;

type AnyRecord = Record<string, any>;
type Dataset = Record<string, AnyRecord[] | { error: string } | undefined>;

const COLORS = {
  background: '#F5F7FB',
  card: '#FFFFFF',
  text: '#172033',
  muted: '#6B7280',
  accent: '#2563EB',
  border: '#E5EAF2',
  softBlue: '#EAF1FF',
  warning: '#92400E',
};

const TITLES: Record<string, string> = {
  Steps: 'Steps',
  HeartRate: 'Heart rate',
  SleepSession: 'Sleep',
  OxygenSaturation: 'Blood oxygen',
  ExerciseSession: 'Exercise',
  TotalCaloriesBurned: 'Total calories burned',
  ActiveCaloriesBurned: 'Active calories burned',
  Nutrition: 'Food calories',
  HeartRateVariabilityRmssd: 'Heart rate variability',
};
const ICONS: Record<string, string> = {
  Steps: '👣',
  HeartRate: '❤️',
  SleepSession: '🌙',
  OxygenSaturation: '🫁',
  ExerciseSession: '🏃',
  TotalCaloriesBurned: '🔥',
  ActiveCaloriesBurned: '⚡',
  Nutrition: '🍽️',
  HeartRateVariabilityRmssd: '〰️',
};

const calculateStressFromRmssd = (rmssdMs: number): number => {
  if (!Number.isFinite(rmssdMs) || rmssdMs <= 0) return 0;
  const lnHrv = Math.log(rmssdMs);
  const normalized = (Math.max(2.3, Math.min(5.0, lnHrv)) - 2.3) / (5.0 - 2.3);
  return Math.round((1 - normalized) * 100);
};

const formatTime = (value?: string): string => {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const getNutritionCalories = (record: AnyRecord): number | null => {
  const kcal = record?.energy?.inKilocalories;
  if (typeof kcal === 'number' && Number.isFinite(kcal)) return kcal;
  const calories = record?.energy?.inCalories;
  if (typeof calories === 'number' && Number.isFinite(calories)) return calories / 1000;
  return null;
};

const getRecordTime = (record: AnyRecord): number => {
  const candidates = [
    record?.time,
    record?.startTime,
    record?.endTime,
    record?.startDateTime,
    record?.metadata?.lastModifiedTime,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const parsed = new Date(candidate).getTime();
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  // HeartRate records can contain individual samples with their own timestamps.
  const samples = Array.isArray(record?.samples) ? record.samples : [];
  const lastSample = samples.reduce((latest: number, sample: AnyRecord) => {
    const parsed = new Date(sample?.time ?? '').getTime();
    return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
  }, 0);
  return lastSample;
};

const sortedRecords = (value: Dataset[string]): AnyRecord[] =>
  Array.isArray(value)
    ? [...value].sort((a, b) => getRecordTime(b) - getRecordTime(a))
    : [];

const latestHeartRate = (record: AnyRecord): number | null => {
  if (typeof record?.beatsPerMinute === 'number') return record.beatsPerMinute;
  const samples = Array.isArray(record?.samples) ? record.samples : [];
  const latest = [...samples].sort(
    (a, b) => new Date(b?.time ?? 0).getTime() - new Date(a?.time ?? 0).getTime(),
  )[0];
  return typeof latest?.beatsPerMinute === 'number' ? latest.beatsPerMinute : null;
};

const summaryFor = (type: RecordType, record?: AnyRecord): { value: string; detail: string } => {
  if (!record) return { value: 'No recent data', detail: 'No record found in the selected time range' };
  switch (type) {
    case 'Steps': {
      const count = record.count ?? record.steps ?? record.value;
      return { value: typeof count === 'number' ? Math.round(count).toLocaleString() : 'Recorded', detail: 'steps' };
    }
    case 'HeartRate': {
      const bpm = latestHeartRate(record);
      return { value: bpm === null ? 'Recorded' : String(Math.round(bpm)), detail: bpm === null ? 'Heart-rate record' : 'beats per minute (bpm)' };
    }
    case 'OxygenSaturation': {
      const raw = record.percentage?.value ?? record.percentage ?? record.oxygenSaturation;
      const percent = typeof raw === 'number' ? (raw <= 1 ? raw * 100 : raw) : null;
      return { value: percent === null ? 'Recorded' : `${percent.toFixed(1)}%`, detail: 'SpO₂' };
    }
    case 'HeartRateVariabilityRmssd': {
      const hrv = record.heartRateVariabilityMillis;
      const stress = typeof hrv === 'number' && hrv > 0 ? calculateStressFromRmssd(hrv) : null;
      return { value: typeof hrv === 'number' ? `${hrv.toFixed(1)} ms` : 'Recorded', detail: stress === null ? 'RMSSD · stress estimate unavailable' : `RMSSD · experimental stress estimate ${stress}/100` };
    }
    case 'Nutrition': {
      const kcal = getNutritionCalories(record);
      const food = record.name ?? record.mealName ?? 'Food entry';
      return { value: kcal === null ? String(food) : `${Math.round(kcal)} kcal`, detail: String(food) };
    }
    case 'ActiveCaloriesBurned':
    case 'TotalCaloriesBurned': {
      const kcal = getNutritionCalories(record) ?? record.energy?.inKilocalories;
      return { value: typeof kcal === 'number' ? `${Math.round(kcal)} kcal` : 'Recorded', detail: type === 'ActiveCaloriesBurned' ? 'active energy' : 'total energy' };
    }
    case 'SleepSession': {
      const start = new Date(record.startTime ?? '').getTime();
      const end = new Date(record.endTime ?? '').getTime();
      const duration = start && end && end >= start ? Math.round((end - start) / 60000) : null;
      return { value: duration === null ? 'Sleep recorded' : `${Math.floor(duration / 60)}h ${duration % 60}m`, detail: 'session duration' };
    }
    case 'ExerciseSession':
      return { value: String(record.title ?? record.exerciseType ?? 'Exercise recorded'), detail: record.startTime ? formatTime(record.startTime) : 'Exercise session' };
    default:
      return { value: 'Recorded', detail: 'Health Connect record' };
  }
};

const recordDetails = (type: RecordType, record: AnyRecord): string[] => {
  const time = formatTime(record.time ?? record.startTime ?? record.startDateTime ?? record.endTime);
  const details = [`Time: ${time}`];
  const summary = summaryFor(type, record);
  details.push(`${summary.value}${summary.detail ? ` · ${summary.detail}` : ''}`);
  if (type === 'HeartRateVariabilityRmssd' && typeof record.heartRateVariabilityMillis === 'number') {
    details.push(`Experimental HRV-derived stress estimate: ${calculateStressFromRmssd(record.heartRateVariabilityMillis)}/100 (not a clinical measurement)`);
  }
  if (type === 'Nutrition') {
    if (record.mealType !== undefined) details.push(`Meal type: ${String(record.mealType)}`);
    if (record.name || record.mealName) details.push(`Food: ${record.name ?? record.mealName}`);
  }
  if (type === 'HeartRate' && Array.isArray(record.samples)) details.push(`Samples in this record: ${record.samples.length}`);
  if (record.startTime && record.endTime) details.push(`Duration: ${formatTime(record.startTime)} – ${formatTime(record.endTime)}`);
  return details;
};

export default function App() {
  const [status, setStatus] = useState('Starting…');
  const [data, setData] = useState<Dataset>({});
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [granted, setGranted] = useState<Permission[]>([]);
  const [selectedType, setSelectedType] = useState<RecordType | null>(null);
  const ready = useRef(false);
  const busy = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!ready.current || busy.current) return;
    busy.current = true;
    setStatus('Refreshing health data…');
    try {
      const permissions = await getGrantedPermissions();
      setGranted(permissions);
      const end = new Date();
      const start = new Date(end.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const results: Dataset = {};

      for (const type of TYPES) {
        const hasReadPermission = permissions.some(
          (permission) => permission.accessType === 'read' && permission.recordType === type,
        );
        if (!hasReadPermission) {
          results[type] = { error: 'Read permission not granted' };
          continue;
        }
        try {
          const { records } = await readRecords(type, {
            timeRangeFilter: {
              operator: 'between',
              startTime: start.toISOString(),
              endTime: end.toISOString(),
            },
          });
          results[type] = records as AnyRecord[];
          console.log(`[${type}] ${records.length} records`);
        } catch (error: any) {
          results[type] = { error: error?.message ?? String(error) };
          console.error(`[${type}] read failed:`, error);
        }
      }
      setData(results);
      setLastSync(new Date().toLocaleTimeString());
      setStatus('Up to date');
    } catch (error: any) {
      setStatus(`Refresh failed: ${error?.message ?? String(error)}`);
      console.error('Health Connect refresh failed:', error);
    } finally {
      busy.current = false;
    }
  }, []);

  const setup = useCallback(async () => {
    ready.current = false;
    setStatus('Connecting to Health Connect…');
    try {
      const sdkStatus = await getSdkStatus();
      if (sdkStatus !== SdkAvailabilityStatus.SDK_AVAILABLE) {
        setStatus(`Health Connect unavailable (${sdkStatus})`);
        return;
      }
      const initialized = await initialize();
      if (initialized === false) {
        setStatus('Health Connect initialization failed');
        return;
      }
      const requestedPermissions: Permission[] = TYPES.map((recordType) => ({ accessType: 'read', recordType }));
      await requestPermission(requestedPermissions);
      const currentPermissions = await getGrantedPermissions();
      setGranted(currentPermissions);
      const missing = TYPES.filter((type) => !currentPermissions.some(
        (permission) => permission.accessType === 'read' && permission.recordType === type,
      ));
      ready.current = true;
      setStatus(missing.length ? `Missing permissions: ${missing.join(', ')}` : 'Permissions granted');
      await fetchAll();
    } catch (error: any) {
      setStatus(`Setup error: ${error?.message ?? String(error)}`);
      console.error('Health Connect setup failed:', error);
    }
  }, [fetchAll]);

  useEffect(() => {
    void setup();
    return () => { ready.current = false; };
  }, [setup]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void fetchAll();
    }, POLL_MS);
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void fetchAll();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [fetchAll]);

  const selectedRecords = selectedType ? sortedRecords(data[selectedType]) : [];
  const selectedValue = selectedType ? data[selectedType] : undefined;
  const selectedError = selectedValue && !Array.isArray(selectedValue) ? selectedValue.error : null;

  return (
    <View style={{ flex:  1, backgroundColor: COLORS.background }}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      {selectedType ? (
        <>
          <View style={styles.detailHeader}>
            <Pressable onPress={() => setSelectedType(null)} style={styles.backButton}>
              <Text style={styles.backText}>‹  All metrics</Text>
            </Pressable>
            <Text style={styles.detailTitle}>{ICONS[selectedType]}  {TITLES[selectedType]}</Text>
            <Text style={styles.muted}>Recent records · last {LOOKBACK_DAYS} day(s)</Text>
          </View>
          <ScrollView contentContainerStyle={styles.detailContent}>
            {selectedError ? (
              <View style={styles.emptyCard}><Text style={styles.bodyText}>{selectedError}</Text></View>
            ) : selectedRecords.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No recent records</Text>
                <Text style={styles.muted}>When Health Connect has data for this metric, it will appear here.</Text>
              </View>
            ) : selectedRecords.map((record, index) => {
              const summary = summaryFor(selectedType, record);
              return (
                <View key={`${record.metadata?.id ?? selectedType}-${index}`} style={styles.historyCard}>
                  <View style={styles.historyTop}>
                    <Text style={styles.historyValue}>{summary.value}</Text>
                    <Text style={styles.historyIndex}>#{index + 1}</Text>
                  </View>
                  {!!summary.detail && <Text style={styles.muted}>{summary.detail}</Text>}
                  {recordDetails(selectedType, record).map((line, lineIndex) => (
                    <Text key={lineIndex} style={styles.historyDetail}>{line}</Text>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.homeContent}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>YOUR WELLNESS DATA</Text>
            <Text style={styles.heading}>Health overview</Text>
            <Text style={styles.heroDescription}>Recent measurements collected through Health Connect.</Text>
            <View style={styles.syncRow}>
              <View style={styles.statusDot} />
              <Text style={styles.syncStatus}>{status}</Text>
            </View>
            <Text style={styles.lastSync}>Last refresh: {lastSync ?? 'Waiting for first sync'}</Text>
            <Pressable onPress={() => void fetchAll()} style={({ pressed }) => [styles.syncButton, pressed && styles.pressed]}>
              <Text style={styles.syncButtonText}>↻  Refresh now</Text>
            </Pressable>
          </View>

          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionTitle}>Latest measurements</Text>
            <Text style={styles.sectionCaption}>Tap a card for history</Text>
          </View>

          <AccuChekBluetooth />

          <View style={styles.grid}>
            {TYPES.map((type) => {
              const value = data[type];
              const records = sortedRecords(value);
              const isError = !!value && !Array.isArray(value);
              const latest = records[0];
              const summary = summaryFor(type, latest);
              const noData = !isError && !latest;
              return (
                <Pressable
                  key={type}
                  onPress={() => setSelectedType(type)}
                  style={({ pressed }) => [styles.metricCard, pressed && styles.pressed]}
                >
                  <View style={styles.metricTop}>
                    <View style={styles.metricIcon}><Text style={styles.metricEmoji}>{ICONS[type]}</Text></View>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                  <Text style={styles.metricTitle}>{TITLES[type]}</Text>
                  <Text numberOfLines={2} style={[styles.metricValue, noData && styles.noDataValue]}>
                    {isError ? 'Unavailable' : summary.value}
                  </Text>
                  <Text numberOfLines={2} style={styles.metricDetail}>
                    {isError ? (value as { error: string }).error : summary.detail}
                  </Text>
                  <View style={styles.metricFooter}>
                    <Text style={styles.recordCount}>{isError ? 'Check access' : `${records.length} record${records.length === 1 ? '' : 's'}`}</Text>
                    {latest ? <Text style={styles.latestTime}>{formatTime(latest.time ?? latest.startTime ?? latest.startDateTime)}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.footerNote}>HRV-derived stress is an experimental estimate, not a medical measurement. Data refreshes while the app is open.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = {
  homeContent: { padding: 18, paddingTop: 54, paddingBottom: 36 } as const,
  hero: { backgroundColor: '#172554', borderRadius: 24, padding: 22, marginBottom: 24 } as const,
  eyebrow: { color: '#BBD0FF', fontSize: 11, fontWeight: '800' as const, letterSpacing: 1.5, marginBottom: 8 },
  heading: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.5 },
  heroDescription: { color: '#D9E4FF', fontSize: 14, lineHeight: 20, marginTop: 8 },
  syncRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6EE7B7', marginRight: 8 },
  syncStatus: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' as const, flex: 1 },
  lastSync: { color: '#C4D2F4', fontSize: 12, marginTop: 6 },
  syncButton: { alignSelf: 'flex-start' as const, backgroundColor: '#FFFFFF', paddingVertical: 11, paddingHorizontal: 15, borderRadius: 12, marginTop: 16 },
  syncButtonText: { color: '#172554', fontSize: 13, fontWeight: '800' as const },
  sectionHeadingRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const, marginBottom: 13 },
  sectionTitle: { color: COLORS.text, fontSize: 19, fontWeight: '800' as const },
  sectionCaption: { color: COLORS.muted, fontSize: 11 },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, justifyContent: 'space-between' as const },
  metricCard: { width: '48.3%' as const, minHeight: 174, backgroundColor: COLORS.card, borderRadius: 18, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  metricTop: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 12 },
  metricIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.softBlue, alignItems: 'center' as const, justifyContent: 'center' as const },
  metricEmoji: { fontSize: 19 },
  chevron: { color: '#9CA3AF', fontSize: 28, lineHeight: 28 },
  metricTitle: { color: COLORS.muted, fontSize: 12, fontWeight: '700' as const, minHeight: 30 },
  metricValue: { color: COLORS.text, fontSize: 21, fontWeight: '800' as const, marginTop: 4 },
  noDataValue: { color: '#9CA3AF', fontSize: 16 },
  metricDetail: { color: COLORS.muted, fontSize: 11, marginTop: 4, minHeight: 28 },
  metricFooter: { borderTopWidth: 1, borderTopColor: '#F0F2F6', paddingTop: 8, marginTop: 10 },
  recordCount: { color: COLORS.accent, fontSize: 11, fontWeight: '700' as const },
  latestTime: { color: '#9CA3AF', fontSize: 10, marginTop: 3 },
  footerNote: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  detailHeader: { backgroundColor: COLORS.card, paddingTop: 54, paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { alignSelf: 'flex-start' as const, paddingVertical: 8, paddingRight: 12, marginBottom: 10 },
  backText: { color: COLORS.accent, fontSize: 15, fontWeight: '700' as const },
  detailTitle: { color: COLORS.text, fontSize: 25, fontWeight: '800' as const },
  muted: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  detailContent: { padding: 18, paddingBottom: 36 },
  historyCard: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 12 },
  historyTop: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
  historyValue: { color: COLORS.text, fontSize: 20, fontWeight: '800' as const, flex: 1 },
  historyIndex: { color: '#9CA3AF', fontSize: 11, fontWeight: '700' as const },
  historyDetail: { color: '#4B5563', fontSize: 12, lineHeight: 18, marginTop: 7 },
  emptyCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  emptyTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' as const, marginBottom: 6 },
  bodyText: { color: COLORS.text, fontSize: 13 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
};
