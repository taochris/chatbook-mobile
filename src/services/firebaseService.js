/**
 * Service Firebase pour l'app mobile
 * Réutilise la même logique que l'app web
 */

// TODO: Importer Firebase React Native
// import database from '@react-native-firebase/database';
// import storage from '@react-native-firebase/storage';

/**
 * Génère un code aléatoire à 6 caractères
 */
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Vérifie si un code existe déjà
 * @param {string} code - Le code à vérifier
 * @returns {Promise<boolean>}
 */
async function codeExists(code) {
  try {
    // TODO: Implémenter avec Firebase
    // const snapshot = await database().ref(`mobile-imports/${code}`).once('value');
    // return snapshot.exists();
    
    // Pour l'instant, retourner false (simulation)
    return false;
  } catch (error) {
    console.error('[firebaseService] Erreur vérification code:', error);
    return false;
  }
}

/**
 * Génère un code unique
 * @returns {Promise<string>}
 */
async function generateUniqueCode() {
  let code;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    code = generateCode();
    attempts++;
    
    if (attempts >= maxAttempts) {
      throw new Error('Impossible de générer un code unique');
    }
  } while (await codeExists(code));

  return code;
}

/**
 * Upload des données vers Firebase
 * @param {Object} data - Les données à uploader
 * @returns {Promise<string>} - Le code généré
 */
export async function uploadMobileData(data) {
  try {
    console.log('[firebaseService] Début upload...');
    
    // Générer un code unique
    const code = await generateUniqueCode();
    console.log('[firebaseService] Code généré:', code);

    // Préparer les données
    const exportData = {
      messages: data.messages || [],
      platform: data.platform || 'mobile',
      metadata: {
        exportDate: new Date().toISOString(),
        messageCount: data.messages?.length || 0,
        conversationName: data.conversationName || 'Conversation',
        ...data.metadata,
      },
    };

    // TODO: Upload vers Firebase Storage
    /*
    const dataString = JSON.stringify(exportData);
    const storageRef = storage().ref(`mobile-imports/${code}/data.json`);
    await storageRef.putString(dataString);
    const downloadURL = await storageRef.getDownloadURL();
    
    // Enregistrer dans Realtime Database
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 heures
    await database().ref(`mobile-imports/${code}`).set({
      downloadURL,
      createdAt: Date.now(),
      expiresAt,
      platform: data.platform || 'mobile',
      messageCount: exportData.metadata.messageCount,
      conversationName: exportData.metadata.conversationName,
    });
    */

    console.log('[firebaseService] Upload terminé');
    
    // Pour l'instant, retourner le code simulé
    // En production, décommenter le code ci-dessus
    return code;
  } catch (error) {
    console.error('[firebaseService] Erreur upload:', error);
    throw new Error(`Erreur lors de l'upload: ${error.message}`);
  }
}

/**
 * Configuration Firebase (à appeler au démarrage de l'app)
 */
export function initializeFirebase() {
  console.log('[firebaseService] Initialisation Firebase...');
  
  // TODO: Configuration Firebase
  /*
  const firebaseConfig = {
    apiKey: "...",
    authDomain: "...",
    databaseURL: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  };
  
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  */
  
  console.log('[firebaseService] Firebase initialisé');
}
