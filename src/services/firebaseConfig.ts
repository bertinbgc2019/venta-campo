import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { FirebaseConnectionConfig, TacticalProduct, TacticalOrder, Customer } from '../types/tactical';

const FIREBASE_CONFIG_STORAGE_KEY = 'venta_campo_firebase_config';

export const getStoredFirebaseConfig = (): FirebaseConnectionConfig => {
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading firebase config from storage', e);
  }

  return {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    isConfigured: false,
    syncEnabled: false,
    lastSync: undefined
  };
};

export const saveFirebaseConfig = (config: FirebaseConnectionConfig) => {
  try {
    localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving firebase config', e);
  }
};

let appInstance: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;

export const initFirebase = (config?: FirebaseConnectionConfig): { success: boolean; error?: string } => {
  const currentConfig = config || getStoredFirebaseConfig();

  if (!currentConfig.apiKey || !currentConfig.projectId) {
    return { success: false, error: 'Credenciales incompletas (requiere apiKey y projectId)' };
  }

  try {
    if (!getApps().length) {
      appInstance = initializeApp({
        apiKey: currentConfig.apiKey,
        authDomain: currentConfig.authDomain || `${currentConfig.projectId}.firebaseapp.com`,
        projectId: currentConfig.projectId,
        storageBucket: currentConfig.storageBucket,
        messagingSenderId: currentConfig.messagingSenderId,
        appId: currentConfig.appId
      });
    } else {
      appInstance = getApp();
    }

    firestoreInstance = getFirestore(appInstance);
    return { success: true };
  } catch (err: any) {
    console.error('Error initializing Firebase:', err);
    return { success: false, error: err.message || 'Error al inicializar Firebase' };
  }
};

export const testFirebaseConnection = async (config: FirebaseConnectionConfig): Promise<{ success: boolean; message: string }> => {
  try {
    const initResult = initFirebase(config);
    if (!initResult.success) {
      return { success: false, message: initResult.error || 'Credenciales no válidas' };
    }

    if (!firestoreInstance) {
      return { success: false, message: 'No se pudo instanciar Firestore' };
    }

    // Try a ping to collection
    const colRef = collection(firestoreInstance, 'tactical_ping');
    await getDocs(colRef);
    return { success: true, message: 'Conexión a Firebase Firestore exitosa y activa' };
  } catch (error: any) {
    return {
      success: false,
      message: `Error de conexión: ${error.message || 'Verifica tus claves y reglas de Firestore'}`
    };
  }
};

export const syncDataToFirebase = async (
  products: TacticalProduct[],
  orders: TacticalOrder[],
  customers: Customer[]
): Promise<{ success: boolean; count: number; error?: string }> => {
  const config = getStoredFirebaseConfig();
  if (!config.isConfigured || !config.syncEnabled) {
    return { success: false, count: 0, error: 'Firebase no está configurado o sincronización deshabilitada' };
  }

  try {
    const initRes = initFirebase(config);
    if (!initRes.success || !firestoreInstance) {
      return { success: false, count: 0, error: initRes.error || 'Firestore no inicializado' };
    }

    let syncedCount = 0;

    // Sincronizar productos
    for (const p of products) {
      const pDoc = doc(firestoreInstance, 'tactical_products', p.id);
      await setDoc(pDoc, p, { merge: true });
      syncedCount++;
    }

    // Sincronizar pedidos
    for (const ord of orders) {
      const oDoc = doc(firestoreInstance, 'tactical_orders', ord.id);
      await setDoc(oDoc, ord, { merge: true });
      syncedCount++;
    }

    // Sincronizar clientes
    for (const c of customers) {
      const cDoc = doc(firestoreInstance, 'tactical_customers', c.id);
      await setDoc(cDoc, c, { merge: true });
      syncedCount++;
    }

    const updatedConfig = { ...config, lastSync: new Date().toISOString() };
    saveFirebaseConfig(updatedConfig);

    return { success: true, count: syncedCount };
  } catch (err: any) {
    console.error('Error syncing to Firestore:', err);
    return { success: false, count: 0, error: err.message || 'Fallo al sincronizar' };
  }
};
