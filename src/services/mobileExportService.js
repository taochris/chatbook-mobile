/**
 * Service d'export mobile vers Firebase
 * Permet d'uploader les SMS vers Firebase et de générer un code à 6 caractères
 */

import { firebaseConfig } from './firebaseConfig';

// Génère un code aléatoire à 6 caractères (lettres majuscules et chiffres)
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Vérifie si un code existe déjà dans Firebase Realtime Database
 */
async function codeExists(code) {
  try {
    const url = `${firebaseConfig.databaseURL}/mobile-imports/${code}.json`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.warn('[mobileExportService] Erreur HTTP lors de la vérification:', response.status);
      return false; // En cas d'erreur, on considère que le code n'existe pas
    }
    
    const data = await response.json();
    return data !== null;
  } catch (error) {
    console.error('[mobileExportService] Erreur vérification code:', error);
    return false; // En cas d'erreur réseau, on considère que le code n'existe pas
  }
}

/**
 * Génère un code unique (qui n'existe pas déjà)
 * En cas d'échec de vérification, génère simplement un code aléatoire
 */
async function generateUniqueCode() {
  let code = generateCode();
  let attempts = 0;
  const maxAttempts = 3; // Réduit à 3 tentatives pour éviter les timeouts
  
  // Essayer de vérifier l'unicité, mais ne pas bloquer si ça échoue
  try {
    while (attempts < maxAttempts) {
      const exists = await codeExists(code);
      if (!exists) {
        break; // Code unique trouvé
      }
      code = generateCode();
      attempts++;
    }
  } catch (error) {
    console.warn('[mobileExportService] Impossible de vérifier l\'unicité, utilisation du code généré');
  }

  return code;
}

/**
 * Upload les données d'export vers Firebase
 * @param {Object} exportData - Les données à exporter
 * @param {Array} exportData.conversations - Les conversations sélectionnées
 * @param {Date} exportData.dateFrom - Date de début
 * @param {Date} exportData.dateTo - Date de fin
 * @param {Object} exportData.options - Options d'export (includeText, includeImages, includeAudio)
 * @returns {Promise<string>} - Le code généré
 */
export async function uploadExportData(exportData) {
  try {
    console.log('[mobileExportService] Début de l\'upload...');
    
    // Générer un code unique
    const code = await generateUniqueCode();
    console.log('[mobileExportService] Code généré:', code);

    // Préparer les messages pour l'export
    const messages = [];
    
    for (const conv of exportData.conversations) {
      // Filtrer les messages selon la période
      const filteredMessages = conv.messages.filter(msg => {
        return msg.date >= exportData.dateFrom.getTime() && 
               msg.date <= exportData.dateTo.getTime();
      });

      // Formater les messages pour le web (format WhatsApp-compatible)
      for (const msg of filteredMessages) {
        const messageText = msg.body || '';
        messages.push({
          id: msg.id,
          body: messageText,
          content: messageText, // Le web cherche 'content' pour l'affichage
          text: messageText, // Fallback
          timestamp: msg.date,
          sender: msg.type === 'received' ? conv.name || conv.address : 'Moi',
          type: 'text',
          conversationName: conv.name || conv.address,
          conversationId: conv.id,
        });
      }
    }

    // Préparer les données complètes
    const data = {
      messages,
      platform: 'mobile-sms',
      metadata: {
        exportDate: new Date().toISOString(),
        messageCount: messages.length,
        conversationCount: exportData.conversations.length,
        conversationNames: exportData.conversations.map(c => c.name || c.address).join(', '),
        dateFrom: exportData.dateFrom.toISOString(),
        dateTo: exportData.dateTo.toISOString(),
        options: exportData.options
      }
    };

    console.log('[mobileExportService] Données préparées:', {
      messageCount: messages.length,
      conversationCount: exportData.conversations.length
    });

    if (messages.length === 0) {
      throw new Error('Aucun message à exporter dans la période sélectionnée');
    }

    // Préparer les URLs et timestamps
    const dataUrl = `${firebaseConfig.databaseURL}/mobile-imports-data/${code}.json`;
    const downloadURL = dataUrl; // lecture directe du JSON
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24h

    // 1) Écrire d'abord les métadonnées (nécessaire pour autoriser la lecture du JSON via les règles)
    const dbUrl = `${firebaseConfig.databaseURL}/mobile-imports/${code}.json`;
    const metaResponse = await fetch(dbUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        downloadURL,
        createdAt: Date.now(),
        expiresAt,
        platform: 'mobile-sms',
        messageCount: messages.length,
        conversationName: data.metadata.conversationNames
      })
    });
    if (!metaResponse.ok) {
      const errorText = await metaResponse.text();
      throw new Error(`Erreur enregistrement métadonnées: ${metaResponse.status} - ${errorText}`);
    }
    console.log('[mobileExportService] Métadonnées enregistrées');

    // 2) Écrire le JSON des données ensuite
    console.log('[mobileExportService] Upload vers:', dataUrl);
    const dataResponse = await fetch(dataUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!dataResponse.ok) {
      const errorText = await dataResponse.text();
      console.error('[mobileExportService] Erreur HTTP:', dataResponse.status, errorText);
      throw new Error(`Erreur stockage données: ${dataResponse.status} - ${errorText}`);
    }
    console.log('[mobileExportService] Données stockées dans Database');

    return code;
  } catch (error) {
    console.error('[mobileExportService] Erreur lors de l\'upload:', error);
    throw new Error(`Erreur lors de l'export: ${error.message}`);
  }
}

/**
 * Génère l'URL du site web avec le code pré-rempli
 */
export function generateWebURL(code) {
  // TODO: Remplacer par l'URL de production
  return `https://votre-site.com/import?code=${code}`;
}
