/**
 * Service d'export mobile vers Firebase
 * Permet d'uploader les SMS vers Firebase et de générer un code à 6 caractères
 */

import { firebaseConfig } from './firebaseConfig';
import { NativeModules } from 'react-native';

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
 * Upload un fichier vers Firebase Storage via REST API
 * @param {string} localUri - URI locale du fichier (content:// ou file://)
 * @param {string} storagePath - Chemin de destination dans le bucket Storage
 * @returns {Promise<string>} - URL publique du fichier
 */
async function uploadToStorage(localUri, storagePath) {
  try {
    const bucket = firebaseConfig.storageBucket;
    // URL REST pour l'upload simple (media)
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodeURIComponent(storagePath)}`;

    console.log('[mobileExportService] uploadToStorage start', {
      storagePath,
      localUri,
      bucket,
    });

    const originalUri = localUri;

    // Hermes/React Native: fetch(content://...) peut échouer avec status=0 et "Failed to construct Response"
    if (typeof localUri === 'string' && localUri.startsWith('content://')) {
      const mmsReader = NativeModules?.MmsReader;
      if (!mmsReader?.copyContentUriToCache) {
        throw new Error('copyContentUriToCache non disponible (module natif MmsReader)');
      }

      console.log('[mobileExportService] uploadToStorage content:// detected, copying to cache', {
        storagePath,
        localUri,
      });

      const copied = await mmsReader.copyContentUriToCache(localUri);
      const fileUri = copied?.fileUri;
      const copiedMimeType = copied?.mimeType;
      const copiedSize = copied?.size;

      console.log('[mobileExportService] uploadToStorage copyContentUriToCache result', {
        storagePath,
        originalUri,
        fileUri,
        copiedMimeType,
        copiedSize,
      });

      if (typeof fileUri === 'string' && fileUri.length > 0) {
        localUri = fileUri;
      }
    }

    let response;
    try {
      // En React Native, on utilise fetch avec un blob pour les content:// URIs
      response = await fetch(localUri);
    } catch (e) {
      console.error('[mobileExportService] uploadToStorage fetch(localUri) threw', {
        storagePath,
        localUri,
        originalUri,
        message: e?.message,
        name: e?.name,
      });
      throw e;
    }

    console.log('[mobileExportService] uploadToStorage fetch(localUri) response', {
      storagePath,
      localUri,
      originalUri,
      ok: response?.ok,
      status: response?.status,
      statusText: response?.statusText,
      contentType: response?.headers?.get?.('content-type'),
    });

    let blob;
    try {
      blob = await response.blob();
    } catch (e) {
      console.error('[mobileExportService] uploadToStorage response.blob() threw', {
        storagePath,
        localUri,
        message: e?.message,
        name: e?.name,
      });
      throw e;
    }

    console.log('[mobileExportService] uploadToStorage blob ready', {
      storagePath,
      localUri,
      blobType: blob?.type,
      blobSize: blob?.size,
    });

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'application/octet-stream'
      },
      body: blob
    });

    console.log('[mobileExportService] uploadToStorage uploadResponse', {
      storagePath,
      ok: uploadResponse?.ok,
      status: uploadResponse?.status,
      statusText: uploadResponse?.statusText,
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      throw new Error(`Erreur Storage: ${uploadResponse.status} - ${error}`);
    }

    const data = await uploadResponse.json();
    console.log('[mobileExportService] uploadToStorage response JSON:', JSON.stringify(data));

    // Le token peut être à la racine ou dans metadata selon l'API REST
    const downloadToken = data.downloadTokens || (data.metadata && data.metadata.downloadTokens);
    
    if (!downloadToken) {
      console.warn('[mobileExportService] Aucun downloadToken trouvé dans la réponse Storage');
    }

    // URL publique formatée (nécessite le token pour lecture sans auth)
    // Note: On utilise %2F pour les dossiers dans le chemin de l'objet
    const encodedPath = encodeURIComponent(storagePath);
    const finalUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${downloadToken || ''}`;
    
    console.log('[mobileExportService] uploadToStorage final URL:', finalUrl);
    return finalUrl;
  } catch (error) {
    console.error('[mobileExportService] Échec upload Storage:', error);
    throw error;
  }
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
    console.log('[mobileExportService] Début de l\'upload...', {
      conversationCount: exportData?.conversations?.length,
      options: exportData?.options,
      dateFrom: exportData?.dateFrom?.toISOString?.(),
      dateTo: exportData?.dateTo?.toISOString?.(),
    });
    
    // Générer un code unique
    const code = await generateUniqueCode();
    console.log('[mobileExportService] Code généré:', code);

    // Préparer les messages pour l'export
    const messages = [];
    const mediaToUpload = []; // Liste des médias à uploader en parallèle
    
    for (const conv of exportData.conversations) {
      console.log('[mobileExportService] Conversation', {
        id: conv?.id,
        name: conv?.name,
        address: conv?.address,
        messagesCount: conv?.messages?.length,
        selectedMessageIdsCount: conv?.selectedMessageIds?.length,
      });

      // Les messages sélectionnés dans l'UI (ID passés dans conversations)
      // Note: On filtre par rapport à la sélection si disponible, sinon par date
      const selectedIds = conv.selectedMessageIds ? new Set(conv.selectedMessageIds) : null;

      const filteredMessages = conv.messages.filter(msg => {
        if (selectedIds) return selectedIds.has(msg.id);
        return msg.date >= exportData.dateFrom.getTime() && 
               msg.date <= exportData.dateTo.getTime();
      });

      // Formater les messages pour le web
      for (const msg of filteredMessages) {
        const messageObj = {
          id: msg.id,
          body: msg.body || '',
          content: msg.body || '',
          timestamp: msg.date,
          sender: msg.type === 'received' ? conv.name || conv.address : 'Moi',
          type: msg.isMms ? 'mms' : 'text',
          conversationName: conv.name || conv.address,
          conversationId: conv.id,
        };

        // Gérer les médias MMS
        if (msg.isMms && msg.parts) {
          messageObj.parts = [];
          for (let i = 0; i < msg.parts.length; i++) {
            const part = msg.parts[i];
            const isImage = part.type === 'image' && exportData.options.includeImages;
            const isAudio = part.type === 'audio' && exportData.options.includeAudio;

            if (isImage || isAudio) {
              const fileExt = part.type === 'image' ? 'jpg' : 'amr';
              const storagePath = `mobile-imports/${code}/${msg.id}_part${i}.${fileExt}`;

              console.log('[mobileExportService] Queue media upload', {
                storagePath,
                localUri: part?.uri,
                partType: part?.type,
                mimeType: part?.mimeType,
                msgId: msg?.id,
                convId: conv?.id,
              });
              
              // On met un placeholder en attendant l'URL Firebase
              messageObj.parts.push({
                type: part.type,
                mimeType: part.mimeType,
                fileName: `${msg.id}_part${i}.${fileExt}`
              });

              mediaToUpload.push({
                localUri: part.uri,
                storagePath,
                messageRef: messageObj,
                partIndex: messageObj.parts.length - 1,
                mimeType: part.mimeType,
                type: part.type
              });
            }
          }
        }
        messages.push(messageObj);
      }
    }

    if (messages.length === 0) {
      throw new Error('Aucun message à exporter dans la période sélectionnée');
    }

    // 1) Uploader les médias vers Storage en parallèle
    if (mediaToUpload.length > 0) {
      console.log(`[mobileExportService] Upload de ${mediaToUpload.length} médias...`);
      await Promise.all(mediaToUpload.map(async (item) => {
        try {
          const downloadUrl = await uploadToStorage(item.localUri, item.storagePath);
          // Mettre à jour la référence du message avec l'URL finale
          item.messageRef.parts[item.partIndex].url = downloadUrl;
          item.messageRef.parts[item.partIndex].firebasePath = item.storagePath;
        } catch (e) {
          console.warn(`[mobileExportService] Échec upload média ${item.storagePath}:`, e);
          item.messageRef.parts[item.partIndex].error = "Échec upload Storage";
        }
      }));
    }

    // Préparer les données complètes
    const data = {
      messages,
      platform: 'mobile-sms',
      metadata: {
        exportDate: new Date().toISOString(),
        messageCount: messages.length,
        mediaCount: mediaToUpload.length,
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
    console.log('[mobileExportService] RTDB meta write', { dbUrl });
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
    console.log('[mobileExportService] RTDB data write size', {
      approxBytes: JSON.stringify(data).length,
      messageCount: messages.length,
      mediaCount: mediaToUpload.length,
    });
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
