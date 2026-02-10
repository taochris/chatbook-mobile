import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  NativeModules,
  Image,
} from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';
import Sound from 'react-native-sound';
import RNFS from 'react-native-fs';

export default function ExportSMSScreen({ route }) {
  const { contactName, contactPhone } = route?.params || {};
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversations, setSelectedConversations] = useState(new Set());
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [dateTo, setDateTo] = useState(new Date());
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [tempDay, setTempDay] = useState('');
  const [tempMonth, setTempMonth] = useState('');
  const [tempYear, setTempYear] = useState('');
  const [editingDateType, setEditingDateType] = useState(null); // 'from' | 'to'
  const [exportCode, setExportCode] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [includeText, setIncludeText] = useState(true);
  const [includeImages, setIncludeImages] = useState(true);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [audioFiles, setAudioFiles] = useState([]);
  const [audioTotalSize, setAudioTotalSize] = useState(0);
  const [showAudioList, setShowAudioList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [selectedMessagesInConv, setSelectedMessagesInConv] = useState(new Set());
  const [filterKey, setFilterKey] = useState(0); // Force refresh du filtrage
  const [debugStats, setDebugStats] = useState(null);

  const soundRef = useRef(null);
  const [playingAudioKey, setPlayingAudioKey] = useState(null);

  const dayInputRef = useRef(null);
  const monthInputRef = useRef(null);
  const yearInputRef = useRef(null);
  const autoOpenDone = useRef(false);

  const AUDIO_MAX_SIZE = 500 * 1024 * 1024; // 500 MB

  const normalizeTimestampMs = (value) => {
    const n = Number(value) || 0;
    if (!n) return 0;
    // If it's seconds (10 digits-ish), convert to ms
    return n < 1000000000000 ? n * 1000 : n;
  };

  const computePreviewMessages = (allMessages, fromDate, toDate, limit) => {
    const fromTs = new Date(fromDate).setHours(0, 0, 0, 0);
    const toTs = new Date(toDate).setHours(23, 59, 59, 999);
    const base = Array.isArray(allMessages) ? allMessages : [];

    const filtered = base.filter((m) => {
      const d = Number(m?.date) || 0;
      return d >= fromTs && d <= toTs;
    });

    const total = filtered.length;
    const sliceFrom = Math.max(0, total - limit);
    return {
      filtered,
      display: filtered.slice(sliceFrom),
      total,
    };
  };

  useEffect(() => {
    requestSMSPermission();
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (soundRef.current) {
          const s = soundRef.current;
          soundRef.current = null;
          try {
            s.stop(() => {
              try {
                s.release();
              } catch (_) {}
            });
          } catch (_) {
            try {
              s.release();
            } catch (_) {}
          }
        }
      } catch (_) {}
    };
  }, []);

  // Auto-ouvrir la conversation quand elle est chargée (mode contact direct)
  useEffect(() => {
    if (contactPhone && conversations.length === 1 && !autoOpenDone.current && !selectedConversation) {
      autoOpenDone.current = true;
      try {
        openConversationDetail(conversations[0]);
      } catch (e) {
        console.warn('[AutoOpen] Erreur:', e?.message || e);
      }
    }
  }, [conversations, contactPhone, selectedConversation]);

  // Recharger les messages après changement de date (mode contact direct)
  const reloadAfterDateChange = (newDateFrom, newDateTo) => {
    if (!contactPhone || conversations.length === 0) return;
    try {
      const conv = conversations[0];
      if (conv) openConversationDetail(conv, newDateFrom, newDateTo);
    } catch (e) {
      console.warn('[DateChange] Erreur rechargement:', e?.message || e);
    }
  };

  const playOrToggleAudioPart = async (messageId, part, partIndex) => {
    try {
      const audioKey = `${messageId}_part${partIndex}`;

      const stopAndReleaseCurrent = async () => {
        const current = soundRef.current;
        if (!current) return;
        soundRef.current = null;
        await new Promise((resolve) => {
          try {
            current.stop(() => {
              try {
                current.release();
              } catch (_) {}
              resolve();
            });
          } catch (_) {
            try {
              current.release();
            } catch (_) {}
            resolve();
          }
        });
      };

      if (playingAudioKey === audioKey && soundRef.current) {
        await stopAndReleaseCurrent();
        setPlayingAudioKey(null);
        return;
      }

      // Stop previous
      await stopAndReleaseCurrent();

      const mmsReader = NativeModules?.MmsReader;
      let uri = part?.uri;
      if (!uri) return;

      console.log('[audio] playOrToggleAudioPart', {
        messageId,
        partIndex,
        audioKey,
        uri,
        partType: part?.type,
      });

      // Convert content:// to file:// (cache) for Sound
      if (typeof uri === 'string' && uri.startsWith('content://')) {
        if (!mmsReader?.copyContentUriToCache) {
          Alert.alert('Audio', 'Lecture audio indisponible (copyContentUriToCache manquant)');
          return;
        }

        let copied;
        try {
          copied = await mmsReader.copyContentUriToCache(uri);
        } catch (e) {
          console.warn('[audio] copyContentUriToCache failed', e);
          Alert.alert(
            'Audio',
            `Impossible de lire ce message vocal (copie du fichier échouée).\n\n${e?.message || e}`
          );
          return;
        }

        const fileUri = copied?.fileUri;
        const copiedMimeType = copied?.mimeType;
        const copiedSize = copied?.size;

        console.log('[audio] copyContentUriToCache result', {
          fileUri,
          copiedMimeType,
          copiedSize,
        });

        if (!fileUri) {
          Alert.alert('Audio', "Impossible de lire ce message vocal (fichier introuvable après copie).");
          return;
        }

        if (typeof copiedSize === 'number' && copiedSize <= 0) {
          Alert.alert('Audio', "Impossible de lire ce message vocal (fichier vide après copie).");
          return;
        }

        // react-native-sound peut échouer si le fichier n'a pas d'extension reconnue (ex: .bin)
        // On renomme le fichier selon le mimeType si possible.
        try {
          const guessExtFromMime = (mime) => {
            const m = String(mime || '').toLowerCase();
            if (m === 'audio/amr') return 'amr';
            if (m === 'audio/3gpp' || m === 'audio/3gp') return '3gp';
            if (m === 'audio/ogg') return 'ogg';
            if (m === 'audio/opus') return 'opus';
            if (m === 'audio/mpeg' || m === 'audio/mp3') return 'mp3';
            if (m === 'audio/mp4' || m === 'audio/m4a') return 'm4a';
            return null;
          };

          const ext = guessExtFromMime(copiedMimeType);
          if (ext && typeof fileUri === 'string' && fileUri.toLowerCase().endsWith('.bin')) {
            const filePath = fileUri.startsWith('file://') ? fileUri.slice('file://'.length) : fileUri;
            const newFilePath = filePath.replace(/\.bin$/i, `.${ext}`);
            console.log('[audio] renaming cache file for Sound', { filePath, newFilePath, copiedMimeType });
            await RNFS.moveFile(filePath, newFilePath);
            uri = `file://${newFilePath}`;
          } else {
            uri = fileUri;
          }
        } catch (e) {
          console.warn('[audio] rename cache file failed, fallback to original fileUri', e);
          uri = fileUri;
        }
      }

      const path = String(uri).startsWith('file://') ? String(uri).slice('file://'.length) : String(uri);

      console.log('[audio] resolved path', { path });

      setPlayingAudioKey(audioKey);
      Sound.setCategory('Playback');
      const s = new Sound(path, null, (error) => {
        if (error) {
          console.warn('[audio] Sound load error:', error);
          Alert.alert(
            'Audio',
            `Impossible de charger ce message vocal.\n\n${error?.message || JSON.stringify(error)}`
          );
          setPlayingAudioKey(null);
          return;
        }
        soundRef.current = s;
        s.play((success) => {
          setPlayingAudioKey(null);
          try {
            s.release();
          } catch (_) {}
          if (soundRef.current === s) {
            soundRef.current = null;
          }
          if (!success) {
            console.warn('[audio] Sound playback failed');
            Alert.alert('Audio', 'La lecture a échoué sur ce téléphone (format audio non supporté ?)');
          }
        });
      });
    } catch (e) {
      console.warn('[audio] Audio play error:', e);
      Alert.alert('Audio', `Erreur lecture audio.\n\n${e?.message || e}`);
      setPlayingAudioKey(null);
    }
  };

  const loadContactMessages = async (phone, name) => {
    try {
      const { SmsReader } = NativeModules;
      if (!SmsReader) {
        Alert.alert('Erreur', 'Module natif SmsReader manquant');
        setLoading(false);
        return;
      }

      // Charger un aperçu rapidement (pour que l'UI s'affiche vite)
      const PREVIEW_FETCH_LIMIT = 3000;
      const messages = await SmsReader.getMessagesByAddress(phone, PREVIEW_FETCH_LIMIT);
      
      // Normaliser les données pour correspondre au format attendu par l'app
      const normalizedMessages = messages.map((m, idx) => {
        // Les timestamps sont déjà normalisés en ms côté Java (SMS en ms natif, MMS converti de s→ms)
        let timestamp = Number(m.date);
        
        // Log les 3 premiers messages pour debug
        if (idx < 3) {
          console.log(`[MSG ${idx}] ${m.isMms ? 'MMS' : 'SMS'} Date: ${timestamp} (${new Date(timestamp).toLocaleString('fr-FR')}) Body: "${(m.body || '').substring(0, 30)}..."`);
        }
        return {
          ...m,
          id: m._id || m.id || `temp_${Math.random()}`, // Ajout du mapping _id -> id
          date: timestamp,
          type: m.type === 1 ? 'received' : m.type === 2 ? 'sent' : 'unknown', 
          body: m.body || '',
          isMms: m.isMms || false,
        };
      });

      // Trier par date croissante
      normalizedMessages.sort((a, b) => a.date - b.date);

      // Créer la conversation avec TOUS les messages pour l'export
      const conversation = {
        id: phone,
        address: phone,
        name: name || phone,
        messages: normalizedMessages, // Aperçu (ex: 3000 derniers)
        allMessages: null, // sera rempli en arrière-plan
        messageCount: normalizedMessages.length,
        lastMessage: normalizedMessages.length > 0 ? normalizedMessages[normalizedMessages.length - 1].body : '',
        lastDate: normalizedMessages.length > 0 ? normalizedMessages[normalizedMessages.length - 1].date : Date.now(),
      };
      
      setConversations([conversation]);
      setSelectedConversations(new Set([phone]));
      
      setLoading(false);
      
      // Ne PAS ouvrir automatiquement pour laisser l'utilisateur choisir la période
      // openConversationDetailOptimized(conversation);

      // Charger TOUT en arrière-plan pour l'export (sans bloquer l'UI)
      setTimeout(async () => {
        try {
          const full = await SmsReader.getMessagesByAddress(phone, 0);
          const normalizedFull = (Array.isArray(full) ? full : []).map(m => {
            // Timestamps déjà normalisés en ms côté Java
            let timestamp = Number(m.date);
            return {
              ...m,
              id: m._id || m.id || `temp_${Math.random()}`,
              date: timestamp,
              type: m.type === 1 ? 'received' : m.type === 2 ? 'sent' : 'unknown',
              body: m.body || '',
              isMms: m.isMms || false,
            };
          });
          normalizedFull.sort((a, b) => a.date - b.date);

          setConversations(prev => prev.map(c => {
            if (c.id !== phone) return c;
            return {
              ...c,
              allMessages: normalizedFull,
              // garder l'aperçu dans messages pour l'UI, mais mettre à jour le compteur global
              messageCount: normalizedFull.length,
            };
          }));
        } catch (e) {
          console.warn('[SmsReader] Chargement complet en arrière-plan échoué:', e?.message || e);
        }
      }, 0);

    } catch (e) {
      console.error('Erreur lecture SMS contact (natif):', e);
      Alert.alert('Erreur', `Impossible de charger les messages: ${e.message}`);
      setLoading(false);
    }
  };

  const openConversationDetailOptimized = (conv) => {
    // Pour l'affichage, on prend les 500 derniers messages DANS LA PÉRIODE choisie
    // L'export utilisera bien conv.messages complet
    const limit = 500;
    const source = Array.isArray(conv?.allMessages) ? conv.allMessages : (conv.messages || []);
    let { display, total } = computePreviewMessages(source, dateFrom, dateTo, limit);
    
    const initialConv = {
      ...conv,
      messages: display, // Seulement 500 messages pour l'UI
      allMessages: source, // Tous les messages (si dispo)
      isPreview: true // Flag pour indiquer que c'est un aperçu partiel
    };
    
    setSelectedConversation(initialConv);
    
    // Sélectionner par défaut uniquement les messages affichés (max 500) pour éviter 0/0
    const initialIds = (display && display.length > 0)
      ? new Set(display.map((m, idx) => (m?.id ?? `tmp_${idx}`)).map(String))
      : new Set();
    setSelectedMessagesInConv(initialIds);
    
    if (total > limit) {
      Alert.alert(
        'Mode Performance', 
        `83 000+ messages chargés !\n\nPour ne pas bloquer votre téléphone, seuls les ${limit} derniers messages sont affichés ici.\n\nMais rassurez-vous : TOUS les messages seront bien exportés.`
      );
    }
  };

  useEffect(() => {
    // Si on est en mode aperçu (preview), recalculer la liste affichée à chaque changement de dates.
    if (!selectedConversation?.isPreview) return;
    const all = selectedConversation?.allMessages;
    if (!Array.isArray(all)) return;

    const limit = 500;
    const { display } = computePreviewMessages(all, dateFrom, dateTo, limit);
    setSelectedConversation((prev) => {
      if (!prev || !prev.isPreview) return prev;
      return {
        ...prev,
        messages: display,
      };
    });
  }, [dateFrom, dateTo]);

  const requestSMSPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const perms = [
          PermissionsAndroid.PERMISSIONS.READ_SMS,
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        ];

        // Android 13+ uses READ_MEDIA_* permissions for accessing media-related URIs
        if (Platform.Version >= 33) {
          if (PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES) {
            perms.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
          }
          if (PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO) {
            perms.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO);
          }
        } else {
          // Android <= 12 needs READ_EXTERNAL_STORAGE to read MMS part content:// URIs
          if (PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE) {
            perms.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
          }
        }

        const results = await PermissionsAndroid.requestMultiple(perms);
        const smsGranted = results[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED;
        const contactsGranted = results[PermissionsAndroid.PERMISSIONS.READ_CONTACTS] === PermissionsAndroid.RESULTS.GRANTED;

        if (smsGranted) {
          // DEBUG: Check MMS database contents
          (async () => {
            try {
              const mmsReader = NativeModules?.MmsReader;
              if (mmsReader?.debugMmsDatabase) {
                const dbInfo = await mmsReader.debugMmsDatabase();
                console.log('🔍 DEBUG MMS DATABASE:', JSON.stringify(dbInfo, null, 2));
              }
            } catch (e) {
              console.warn('Debug MMS error:', e);
            }
          })();
          loadConversations();
        } else {
          console.warn('READ_SMS refusé');
          setLoading(false);
        }
      } catch (err) {
        console.error('Erreur permission:', err);
        setLoading(false);
      }
    }
  };

  const loadConversations = () => {
    try {
      // Si un contact spécifique est sélectionné, charger uniquement ses messages
      if (contactPhone) {
        loadContactMessages(contactPhone, contactName);
        return;
      }

      const normalizeTimestampMs = (value) => {
        const n = Number(value) || 0;
        if (!n) return 0;
        // If it's seconds (10 digits-ish), convert to ms
        return n < 1000000000000 ? n * 1000 : n;
      };

      // Sinon, charger toutes les conversations (comportement par défaut)
      const fetchBox = (box) =>
        new Promise((resolve, reject) => {
          const filter = {
            box, // 'inbox' | 'sent'
            indexFrom: 0,
            maxCount: 2000,
          };
          SmsAndroid.list(
            JSON.stringify(filter),
            (fail) => reject(new Error(fail)),
            (count, smsList) => {
              try {
                const arr = JSON.parse(smsList);
                resolve(arr);
              } catch (e) {
                resolve([]);
              }
            }
          );
        });

      Promise.all([fetchBox('inbox'), fetchBox('sent')])
        .then(async ([inbox, sent]) => {
          // Fusionner et trier IMMÉDIATEMENT par date pour éviter le désordre
          const all = [...inbox, ...sent].sort((a, b) => normalizeTimestampMs(a?.date) - normalizeTimestampMs(b?.date));

          console.log('📱 SMS récupérés - Inbox:', inbox.length, 'Sent:', sent.length, 'Total:', all.length);

          // Regrouper par thread_id (plus fiable) avec fallback sur address
          const map = new Map();
          const seenMessageIds = new Set(); // Pour éviter les doublons
          
          for (const m of all) {
            const rawAddress = (m?.address || '').trim();
            const threadId = (m?.thread_id ?? m?.threadId ?? m?.thread ?? null);
            const threadKey = (threadId != null && threadId !== '') ? `thread_${threadId}` : null;

            const msgDateMs = normalizeTimestampMs(m?.date);
            
            // Créer un ID unique basé sur plusieurs critères pour éviter les doublons
            const messageId = m._id || `${msgDateMs}-${m.address}-${m.type}-${(m.body || '').substring(0, 50)}`;
            
            // Ignorer les doublons exacts
            if (seenMessageIds.has(messageId)) {
              console.log('⚠️ Message dupliqué ignoré:', messageId);
              continue;
            }
            seenMessageIds.add(messageId);
            
            // Normaliser pour regroupement: enlever espaces, tirets, parenthèses
            const normalizedNumber = rawAddress ? rawAddress.replace(/[\s\-\(\)]/g, '') : '';

            // Clé de conversation: thread_id si dispo, sinon numéro normalisé (si dispo)
            const convKey = threadKey || (normalizedNumber ? `addr_${normalizedNumber}` : null);
            if (!convKey) continue;

            const existing = map.get(convKey) || {
              id: convKey,
              threadId: threadId != null ? threadId : null,
              address: rawAddress || null, // Peut être null sur certains devices/threads
              name: null,
              messages: [],
              lastMessage: '',
              lastDate: 0,
              audioCount: 0,
              imageCount: 0,
            };

            // Si l'address n'était pas encore connue pour ce thread, tenter de la remplir
            if (!existing.address && rawAddress) {
              existing.address = rawAddress;
            }
            
            existing.messages.push({
              id: messageId,
              body: m?.body || '',
              date: msgDateMs,
              type: m?.type === 1 ? 'received' : 'sent',
              address: rawAddress || '',
            });
            
            if (msgDateMs > existing.lastDate) {
              existing.lastDate = msgDateMs;
              existing.lastMessage = m?.body || '';
            }
            map.set(convKey, existing);
          }

          // Trier les messages de chaque conversation par date
          const list = Array.from(map.values());
          for (const conv of list) {
            // Tri avec fallback : d'abord par date, puis par type si dates égales
            conv.messages.sort((a, b) => {
              const dateDiff = a.date - b.date;
              if (dateDiff !== 0) return dateDiff;
              // Si même date, mettre les 'received' avant les 'sent' pour un ordre plus naturel
              if (a.type === 'received' && b.type === 'sent') return -1;
              if (a.type === 'sent' && b.type === 'received') return 1;
              return 0;
            });
            
            // Debug: vérifier les timestamps des premiers messages
            const firstMessages = conv.messages.slice(0, 5);
            const hasInvalidDates = firstMessages.some(m => !m.date || m.date === 0);
            if (hasInvalidDates) {
              console.log(`⚠️ ${conv.name || conv.address}: Messages avec dates invalides détectés`);
              firstMessages.forEach((m, i) => {
                console.log(`  [${i}] ${m.type} - date: ${m.date} (${new Date(m.date).toLocaleString('fr-FR')})`);
              });
            }
          }

          // Résoudre les noms via contacts
          await resolveContactNames(list);

          list.sort((a, b) => b.lastDate - a.lastDate);

          setConversations(list);
          // Par défaut, pas d'audios détectés tant qu'on n'a pas d'extraction réelle
          setAudioFiles([]);
          updateAudioSize([]);
        })
        .catch((err) => {
          console.error('Erreur lecture SMS:', err);
        })
        .finally(() => setLoading(false));
    } catch (e) {
      console.error('Erreur inattendue lecture SMS:', e);
      setLoading(false);
    }
  };

  const resolveContactNames = async (conversations) => {
    if (Platform.OS !== 'android') return;

    try {
      const Contacts = require('react-native-contacts').default;

      const normalizePhoneDigits = (value) => {
        const digits = (value || '').toString().replace(/\D/g, '');
        if (!digits) return '';
        // Handle international prefix 00...
        const no00 = digits.startsWith('00') ? digits.slice(2) : digits;
        // Keep a stable suffix to match between formats (+33..., 0..., spaces, etc.)
        return no00.length > 10 ? no00.slice(-10) : no00;
      };

      const phoneKeyVariants = (value) => {
        const d = normalizePhoneDigits(value);
        if (!d) return [];
        const keys = new Set([d]);
        if (d.length >= 9) keys.add(d.slice(-9));
        if (d.length >= 8) keys.add(d.slice(-8));
        return Array.from(keys);
      };

      // Demander la permission si nécessaire
      const permission = await Contacts.checkPermission();
      console.log(`📱 Contacts permission (check): ${permission}`);
      if (permission !== 'authorized') {
        const requested = await Contacts.requestPermission();
        console.log(`📱 Contacts permission (request): ${requested}`);
        if (requested !== 'authorized') {
          console.warn('📱 Permission contacts non accordée; noms non résolus.');
          return;
        }
      }

      // Récupérer tous les contacts
      console.log('📱 Tentative de récupération des contacts...');
      const getAllFn = Contacts.getAllWithoutPhotos ? Contacts.getAllWithoutPhotos.bind(Contacts) : Contacts.getAll.bind(Contacts);
      let contacts = await getAllFn();

      // Retry léger: sur certains devices, le 1er appel peut retourner vide juste après un cold start
      if (!Array.isArray(contacts) || contacts.length === 0) {
        console.warn('📱 Contacts vides au 1er appel; retry...');
        await new Promise((r) => setTimeout(r, 350));
        contacts = await getAllFn();
      }
      console.log(`📱 Nombre de contacts récupérés: ${contacts.length}`);

      if (contacts.length > 0) {
        console.log('📱 Exemple de premier contact:', JSON.stringify({
          displayName: contacts[0].displayName,
          phoneNumbers: contacts[0].phoneNumbers
        }));
      }

      // Créer un mapping numéro normalisé -> contact pour éviter les doublons
      const numberToContact = new Map();

      for (const contact of contacts) {
        const phoneNumbers = contact.phoneNumbers || [];
        for (const p of phoneNumbers) {
          const keys = phoneKeyVariants(p.number);
          if (keys.length === 0) continue;

          // Garder le contact avec le nom le plus complet
          const currentName = contact.displayName || contact.givenName || '';
          for (const key of keys) {
            const existingContact = numberToContact.get(key);
            const existingName = existingContact?.displayName || existingContact?.givenName || '';
            if (!existingContact || currentName.length > existingName.length) {
              numberToContact.set(key, contact);
            }
          }
        }
      }
      
      console.log(`📱 Taille du mapping numéros->contacts: ${numberToContact.size}`);

      // Résoudre les noms pour chaque conversation
      let resolvedCount = 0;
      for (const conv of conversations) {
        const addressCandidate = conv.address || (Array.isArray(conv.messages) ? (conv.messages.find(m => (m?.address || '').toString().trim())?.address || '') : '');
        const convKeys = phoneKeyVariants(addressCandidate);

        // Chercher le contact correspondant dans le mapping (match par suffixe)
        const contact = convKeys.map(k => numberToContact.get(k)).find(Boolean);

        if (contact) {
          conv.name = contact.displayName || contact.givenName || null;
          resolvedCount++;
        }
      }
      console.log(`📱 Noms résolus pour ${resolvedCount}/${conversations.length} conversations`);
    } catch (err) {
      console.warn('Impossible de résoudre les noms:', err);
    }
  };

  const openConversationDetail = (conv, overrideDateFrom, overrideDateTo) => {
    // 1. Préparer les dates de filtrage (utiliser les overrides si fournis)
    const useDateFrom = overrideDateFrom || dateFrom;
    const useDateTo = overrideDateTo || dateTo;
    const dateFromTimestamp = new Date(useDateFrom).setHours(0, 0, 0, 0);
    const dateToTimestamp = new Date(useDateTo).setHours(23, 59, 59, 999);
    
    console.log(`[FILTRAGE] Période: ${new Date(dateFromTimestamp).toLocaleString('fr-FR')} → ${new Date(dateToTimestamp).toLocaleString('fr-FR')}`);
    console.log(`[FILTRAGE] Timestamps: ${dateFromTimestamp} → ${dateToTimestamp}`);
    
    // Utiliser allMessages si disponible (chargement complet), sinon messages (aperçu)
    const sourceMessages = Array.isArray(conv.allMessages) ? conv.allMessages : (conv.messages || []);
    console.log(`[FILTRAGE] Source: ${sourceMessages.length} messages (${conv.allMessages ? 'allMessages' : 'messages'})`);
    
    // Log quelques exemples de messages
    sourceMessages.slice(0, 3).forEach((m, idx) => {
      const msgDate = Number(m.date) || 0;
      const inRange = msgDate >= dateFromTimestamp && msgDate <= dateToTimestamp;
      console.log(`[MSG ${idx}] Date: ${msgDate} (${new Date(msgDate).toLocaleString('fr-FR')}) → ${inRange ? 'DANS' : 'HORS'} période`);
    });
    
    // 2. Filtrer les SMS de la conversation
    const filteredSms = sourceMessages.filter(msg => {
      // Sécurisation du timestamp (déjà normalisé au chargement)
      const msgDate = Number(msg.date) || 0;
      return msgDate >= dateFromTimestamp && msgDate <= dateToTimestamp;
    });

    // DEBUG: stats SMS (text only vs mms)
    try {
      const allMsgs = sourceMessages;
      const smsAll = allMsgs.filter(m => !m?.isMms);
      const smsInRange = smsAll.filter(m => {
        const d = Number(m?.date) || 0;
        return d >= dateFromTimestamp && d <= dateToTimestamp;
      });
      const smsTextAll = smsAll.filter(m => (m?.body || '').toString().trim().length > 0);
      const smsTextInRange = smsInRange.filter(m => (m?.body || '').toString().trim().length > 0);

      const minDate = (arr) => {
        const ds = arr.map(m => Number(m?.date) || 0).filter(Boolean);
        return ds.length ? Math.min(...ds) : 0;
      };
      const maxDate = (arr) => {
        const ds = arr.map(m => Number(m?.date) || 0).filter(Boolean);
        return ds.length ? Math.max(...ds) : 0;
      };

      const stats = {
        address: conv?.address || conv?.id,
        range: { from: dateFromTimestamp, to: dateToTimestamp },
        sms: {
          total: smsAll.length,
          inRange: smsInRange.length,
          min: minDate(smsAll),
          max: maxDate(smsAll),
        },
        smsText: {
          total: smsTextAll.length,
          inRange: smsTextInRange.length,
          min: minDate(smsTextAll),
          max: maxDate(smsTextAll),
        },
        mms: {
          loaded: false,
          items: 0,
          msgCount: 0,
          imageCount: 0,
          audioCount: 0,
          min: 0,
          max: 0,
        },
        preview: {
          displayed: 0,
        },
      };
      stats.preview.displayed = filteredSms.length;
      setDebugStats(stats);
      console.log('[DEBUG][openConversationDetail]', stats);
    } catch (e) {
      console.warn('[DEBUG] stats compute failed:', e?.message || e);
    }
    
    // 3. Initialiser l'état avec les SMS filtrés (ordre chronologique)
    const sortedSms = [...filteredSms].sort((a, b) => (Number(a.date) || 0) - (Number(b.date) || 0));
    
    const initialConv = {
      ...conv,
      messages: sortedSms,
      allMessages: conv.messages || []
    };
    
    setSelectedConversation(initialConv);
    
    // Sélectionner tous les SMS par défaut (avec ID sécurisé)
    const initialIds = new Set(sortedSms.map(m => m.id || `temp_${Math.random()}`));
    setSelectedMessagesInConv(initialIds);
    
    console.log(`📅 Ouverture conversation: ${sortedSms.length} SMS trouvés pour la période.`);

    // 4. Charger les MMS en arrière-plan (Android)
    (async () => {
      try {
        if (Platform.OS !== 'android') return;
        const mmsReader = NativeModules?.MmsReader;
        if (!mmsReader?.getMmsMedia) return;

        const addr = (conv.address || '').toString();
        if (!addr) return;

        const mmsItems = await mmsReader.getMmsMedia(addr, dateFromTimestamp, dateToTimestamp);
        const items = Array.isArray(mmsItems) ? mmsItems : [];

        let needsDefault = false;
        if (items.length === 0 && mmsReader?.isDefaultSmsApp) {
          const isDefault = await mmsReader.isDefaultSmsApp();
          if (!isDefault) needsDefault = true;
        }

        let imageCount = 0;
        let audioCount = 0;
        const mmsMessages = [];

        const minDate = (arr) => {
          const ds = arr.map(m => Number(m?.date) || 0).filter(Boolean);
          return ds.length ? Math.min(...ds) : 0;
        };
        const maxDate = (arr) => {
          const ds = arr.map(m => Number(m?.date) || 0).filter(Boolean);
          return ds.length ? Math.max(...ds) : 0;
        };

        for (const it of items) {
          const parts = Array.isArray(it?.parts) ? it.parts : [];
          const messageParts = [];

          for (const p of parts) {
            const mt = (p?.mimeType || '').toString().toLowerCase();
            const data = (p?.data || '').toString().toLowerCase();
            
            let type = 'image';
            if (mt.startsWith('audio/') || data.endsWith('.amr') || data.endsWith('.3gp') || data.endsWith('.m4a')) {
              type = 'audio';
              audioCount++;
            } else {
              imageCount++;
            }
            messageParts.push({ ...p, type });
          }

          if (messageParts.length > 0) {
            // Normalisation timestamp MMS (parfois en secondes sur Android)
            let mmsDate = it.timestamp;
            if (mmsDate > 0 && mmsDate < 1000000000000) {
              mmsDate = mmsDate * 1000;
            }

            const hasAudio = messageParts.some(p => p.type === 'audio');
            const body = hasAudio
              ? (it.direction === 'sent' ? '🔊 Message vocal envoyé' : '🔊 Message vocal reçu')
              : (it.direction === 'sent' ? '🖼️ Photo envoyée' : '🖼️ Photo reçue');

            mmsMessages.push({
              id: `mms_${it.mmsId}`,
              mmsId: it.mmsId,
              body,
              date: mmsDate,
              type: it.direction,
              isMms: true,
              parts: messageParts
            });
          }
        }

        // 5. Fusionner MMS et SMS puis retrier (avec dédoublonnage)
        setSelectedConversation(prev => {
          if (!prev || prev.id !== initialConv.id) return prev;
          
          // Fusion et dédoublonnage par ID (important si on rouvre la conversation)
          const allMsgs = [...(prev.messages || []), ...mmsMessages];
          const uniqueMsgs = Array.from(new Map(allMsgs.map(m => [m.id, m])).values());
          uniqueMsgs.sort((a, b) => a.date - b.date);
          
          console.log(`[MmsReader] ${mmsMessages.length} MMS fusionnés chronologiquement.`);
          console.log(`Total conversation: ${uniqueMsgs.length} messages.`);

          // DEBUG: compléter stats MMS
          setDebugStats((prevStats) => {
            const base = prevStats || {};
            return {
              ...base,
              mms: {
                loaded: true,
                items: items.length,
                msgCount: mmsMessages.length,
                imageCount,
                audioCount,
                min: minDate(mmsMessages),
                max: maxDate(mmsMessages),
              },
              preview: {
                ...(base.preview || {}),
                displayed: uniqueMsgs.length,
              },
            };
          });

          // Auto-sélection des MMS
          setSelectedMessagesInConv(current => {
            const newSelected = new Set(current);
            mmsMessages.forEach(m => newSelected.add(m.id));
            return newSelected;
          });

          return {
            ...prev,
            messages: uniqueMsgs,
            needsDefaultSmsApp: needsDefault,
            mmsMediaSummary: {
              imageCount,
              audioCount,
              mmsMessageCount: items.length,
            }
          };
        });
      } catch (e) {
        console.warn('Erreur lecture MMS:', e?.message || e);
      }
    })();
  };

  const toggleMessageInConv = (msgId) => {
    const newSelected = new Set(selectedMessagesInConv);
    if (newSelected.has(msgId)) {
      newSelected.delete(msgId);
    } else {
      newSelected.add(msgId);
    }
    setSelectedMessagesInConv(newSelected);
  };

  const closeConversationDetail = () => {
    if (selectedConversation) {
      setConversations(prevConvs => {
        return prevConvs.map(c => {
          if (c.id === selectedConversation.id) {
            // Fusionner les messages actuels (SMS) avec ceux de la vue détail (SMS + MMS)
            // On utilise une Map pour dédoublonner par ID
            const allMsgs = [...(c.messages || []), ...selectedConversation.messages];
            const uniqueMsgs = Array.from(new Map(allMsgs.map(m => [m.id, m])).values());
            uniqueMsgs.sort((a, b) => a.date - b.date);

            return {
              ...c,
              messages: uniqueMsgs,
              selectedMessageIds: Array.from(selectedMessagesInConv)
            };
          }
          return c;
        });
      });
      
      if (selectedMessagesInConv.size > 0) {
        setSelectedConversations(prevSelected => {
          const newSelected = new Set(prevSelected);
          newSelected.add(selectedConversation.id);
          return newSelected;
        });
      }
    }
    
    setSelectedConversation(null);
    setSelectedMessagesInConv(new Set());
    setDebugStats(null);
  };

  const updateAudioSize = (files) => {
    const total = (files || [])
      .filter(f => f.selected)
      .reduce((sum, f) => sum + (f.size || 0), 0);
    setAudioTotalSize(total);
  };

  const toggleAudioFile = (index) => {
    const newFiles = [...audioFiles];
    if (newFiles[index]) {
      newFiles[index].selected = !newFiles[index].selected;
      setAudioFiles(newFiles);
      updateAudioSize(newFiles);
    }
  };

  const toggleConversation = (id) => {
    const newSelected = new Set(selectedConversations);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedConversations(newSelected);
  };

  const handleExport = async () => {
    // Mode contact direct : vérifier les messages sélectionnés
    const isDirectMode = !!contactPhone;
    
    if (isDirectMode) {
      if (selectedMessagesInConv.size === 0) {
        Alert.alert('Erreur', 'Sélectionnez au moins un message à exporter');
        return;
      }
    } else {
      if (selectedConversations.size === 0) {
        Alert.alert('Erreur', 'Sélectionnez au moins une conversation');
        return;
      }
    }

    if (includeAudio && audioTotalSize > AUDIO_MAX_SIZE) {
      Alert.alert(
        'Erreur',
        `Les audios dépassent 500 MB (${(audioTotalSize / 1024 / 1024).toFixed(1)} MB)`
      );
      return;
    }

    setLoading(true);
    
    try {
      let selectedConvs;
      
      if (isDirectMode && selectedConversation) {
        // Mode contact direct : ne garder que les messages cochés
        const allMsgs = selectedConversation.messages || [];
        const filteredMsgs = allMsgs.filter(m => selectedMessagesInConv.has(m.id));
        selectedConvs = [{
          ...selectedConversation,
          messages: filteredMsgs,
        }];
        console.log(`[Export Direct] ${filteredMsgs.length}/${allMsgs.length} messages sélectionnés`);
      } else {
        // Mode générique : préparer les conversations sélectionnées
        selectedConvs = conversations
          .filter(c => selectedConversations.has(c.id))
          .map(c => {
            const all = Array.isArray(c?.allMessages) ? c.allMessages : c.messages;
            return {
              ...c,
              messages: Array.isArray(all) ? all : [],
            };
          });
      }

      // Charger et fusionner les MMS directement ici (sinon l'export peut ne contenir que les SMS)
      // En mode direct, les MMS sont déjà inclus dans selectedConversation.messages
      let selectedConvsWithMms = selectedConvs;
      try {
        if (Platform.OS === 'android' && !isDirectMode) {
          const mmsReader = NativeModules?.MmsReader;
          if (mmsReader?.getMmsMedia && (includeImages || includeAudio)) {
            const fromTs = new Date(dateFrom).setHours(0, 0, 0, 0);
            const toTs = new Date(dateTo).setHours(23, 59, 59, 999);

            const isAudioPart = (mimeType, data) => {
              const mt = (mimeType || '').toString().toLowerCase();
              const d = (data || '').toString().toLowerCase();
              return (
                mt.startsWith('audio/') ||
                mt === 'video/3gpp' ||
                d.endsWith('.amr') ||
                d.endsWith('.3gp') ||
                d.endsWith('.m4a') ||
                d.endsWith('.ogg') ||
                d.endsWith('.wav') ||
                d.endsWith('.mp3') ||
                d.endsWith('.aac')
              );
            };

            selectedConvsWithMms = await Promise.all(selectedConvs.map(async (conv) => {
              try {
                const addr = (conv?.address || '').toString();
                if (!addr) return conv;

                const mmsItems = await mmsReader.getMmsMedia(addr, fromTs, toTs);
                const items = Array.isArray(mmsItems) ? mmsItems : [];
                if (items.length === 0) return conv;

                const mmsMessages = [];
                for (const it of items) {
                  const parts = Array.isArray(it?.parts) ? it.parts : [];
                  const messageParts = [];

                  for (const p of parts) {
                    const mime = (p?.mimeType || '').toString();
                    const data = (p?.data || '').toString();
                    const isImg = mime.toLowerCase().startsWith('image/');
                    const isAud = isAudioPart(mime, data);

                    if ((isImg && !includeImages) || (isAud && !includeAudio)) continue;
                    if (!isImg && !isAud) continue;

                    messageParts.push({
                      partId: p?.partId,
                      mimeType: p?.mimeType,
                      uri: p?.uri,
                      data: p?.data,
                      type: isImg ? 'image' : 'audio',
                    });
                  }

                  if (messageParts.length > 0) {
                    let mmsDate = it.timestamp;
                    if (mmsDate > 0 && mmsDate < 1000000000000) {
                      mmsDate = mmsDate * 1000;
                    }

                    mmsMessages.push({
                      id: `mms_${it.mmsId}`,
                      mmsId: it.mmsId,
                      body: it.direction === 'sent' ? '🖼️ Photo envoyée' : '🖼️ Photo reçue',
                      date: mmsDate,
                      type: it.direction,
                      isMms: true,
                      parts: messageParts,
                    });
                  }
                }

                if (mmsMessages.length === 0) return conv;

                const allMsgs = [...(conv.messages || []), ...mmsMessages];
                const uniqueMsgs = Array.from(new Map(allMsgs.map(m => [m.id, m])).values());
                uniqueMsgs.sort((a, b) => a.date - b.date);

                return {
                  ...conv,
                  messages: uniqueMsgs,
                };
              } catch (e) {
                console.warn('[ExportSMSScreen] Échec chargement MMS pour export:', e?.message || e);
                return conv;
              }
            }));
          }
        }
      } catch (e) {
        console.warn('[ExportSMSScreen] Chargement MMS global ignoré:', e?.message || e);
      }
      
      // Importer le service d'export
      const { uploadExportData } = require('../services/mobileExportService');
      
      // Uploader vers Firebase
      const code = await uploadExportData({
        conversations: selectedConvsWithMms,
        dateFrom,
        dateTo,
        options: {
          includeText,
          includeImages,
          includeAudio
        }
      });
      
      console.log('✅ Export réussi avec code:', code);
      setExportCode(code);
      setShowExportModal(true);
      
    } catch (error) {
      console.error('❌ Erreur export:', error);
      Alert.alert(
        'Erreur d\'export',
        `Impossible d'exporter les données: ${error.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  // Calculer les timestamps des dates pour les dépendances du useMemo
  const dateFromTimestampKey = dateFrom ? dateFrom.getTime() : 0;
  const dateToTimestampKey = dateTo ? dateTo.getTime() : Date.now();

  // Filtrer les conversations selon la recherche et les dates (avec useMemo pour mise à jour auto)
  const filteredConversations = useMemo(() => {
    console.log('🔄 Recalcul du filtrage...');
    console.log('📅 Période:', dateFrom.toLocaleDateString('fr-FR'), '-', dateTo.toLocaleDateString('fr-FR'));
    
    // Calculer les timestamps une seule fois
    const dateFromCopy = new Date(dateFrom);
    const dateToCopy = new Date(dateTo);
    const dateFromTimestamp = dateFromCopy.setHours(0, 0, 0, 0);
    const dateToTimestamp = dateToCopy.setHours(23, 59, 59, 999);
    
    console.log('🕐 Timestamps:', dateFromTimestamp, '-', dateToTimestamp);
    
    const normalizeDigits = (value) => (value || '').toString().replace(/\D/g, '');
    const queryLower = (searchQuery || '').toLowerCase().trim();
    const queryDigits = normalizeDigits(searchQuery);

    return conversations
      .filter(conv => {
        // Filtrer par recherche (nom + numéro)
        if (!queryLower) return true;

        const label = (conv.name || '').toString().toLowerCase();
        const address = (conv.address || conv.id || '').toString();
        const addressLower = address.toLowerCase();
        const addressDigits = normalizeDigits(address);

        const matchesText = label.includes(queryLower) || addressLower.includes(queryLower);
        const matchesDigits = queryDigits ? addressDigits.includes(queryDigits) : false;
        return matchesText || matchesDigits;
      })
      .map(conv => {
        // Filtrer les messages par plage de dates
        const filteredMessages = conv.messages.filter(msg => {
          const msgDate = Number(msg?.date) || 0;
          const inRange = msgDate >= dateFromTimestamp && msgDate <= dateToTimestamp;
          return inRange;
        });
        
        // Retourner la conversation avec info sur les messages filtrés
        return {
          ...conv,
          filteredCount: filteredMessages.length,
          totalCount: conv.messages.length
        };
      });
  }, [conversations, searchQuery, dateFromTimestampKey, dateToTimestampKey, filterKey]);

  // Conversations effectivement affichées: uniquement celles avec des messages dans la période
  const displayedConversations = useMemo(() => {
    // IMPORTANT: on affiche toutes les conversations; la période sert à afficher un compteur,
    // pas à masquer des conversations (sinon on ne voit que les threads récents type pubs).
    return filteredConversations;
  }, [filteredConversations]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
        <ActivityIndicator size="large" color="#34d399" />
        <Text style={styles.loadingText}>Chargement des SMS...</Text>
      </View>
    );
  }

  // Custom JS checkbox (avoids native module issues)
  const Checkbox = ({ value, onValueChange }) => (
    <TouchableOpacity
      onPress={() => onValueChange(!value)}
      style={[styles.checkbox, value && styles.checkboxChecked]}
      activeOpacity={0.7}
    >
      {value && <Text style={styles.checkboxMark}>✓</Text>}
    </TouchableOpacity>
  );


  console.log('🎯 RENDU ExportSMSScreen - Conversations filtrées:', filteredConversations.length);

  const renderConversationItem = ({ item }) => (
    <View style={styles.conversationItem}>
      <TouchableOpacity
        style={styles.checkboxTouchArea}
        onPress={() => toggleConversation(item.id)}
        activeOpacity={0.6}
      >
        <Checkbox
          value={selectedConversations.has(item.id)}
          onValueChange={() => toggleConversation(item.id)}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.conversationTouchArea}
        onPress={() => openConversationDetail(item)}
        activeOpacity={0.7}
      >
        <View style={styles.conversationInfo}>
          <Text style={styles.conversationName}>
            {item.name || item.address}
          </Text>
          <Text style={styles.conversationCount}>
            {item.filteredCount !== undefined ? item.filteredCount : item.messages.length} messages dans la période (total: {item.totalCount || item.messages.length})
          </Text>
        </View>
        <Text style={styles.arrowIcon}>›</Text>
      </TouchableOpacity>
    </View>
  );

  // Rendu d'un message (partagé entre mode inline et modal)
  const renderMessageItem = ({ item }) => {
    if (!item || !item.id) return null;
    return (
      <TouchableOpacity
        style={styles.messageItem}
        onPress={() => toggleMessageInConv(item.id)}
        activeOpacity={0.85}
      >
        <View style={styles.messageRow}>
          <Checkbox
            value={selectedMessagesInConv.has(item.id)}
            onValueChange={() => toggleMessageInConv(item.id)}
          />
          <View
            style={[
              styles.messageContent,
              item.type === 'sent' ? styles.bubbleSent : styles.bubbleReceived,
              item.isMms && styles.mmsMessageHighlight,
            ]}
          >
          {item.isMms && (
            <Text style={styles.mmsLabel}>
              {item.parts?.some(p => p.type === 'audio') ? '🔊 AUDIO' : '🖼️ PHOTO'} ({new Date(Number(item.date) || 0).toLocaleDateString('fr-FR')})
            </Text>
          )}
          {item.isMms && item.parts && item.parts.map((part, pIdx) => (
            <View key={pIdx} style={styles.mmsPartContainer}>
              {part.type === 'image' && (
                <Image 
                  source={{ uri: part.uri }} 
                  style={styles.mmsImagePreview} 
                  resizeMode="cover"
                />
              )}
              {part.type === 'audio' && (
                <TouchableOpacity
                  style={styles.mmsAudioPlaceholder}
                  activeOpacity={0.7}
                  onPressIn={(e) => { try { e?.stopPropagation?.(); } catch (_) {} }}
                  onPress={(e) => {
                    try { e?.stopPropagation?.(); } catch (_) {}
                    playOrToggleAudioPart(item.id, part, pIdx);
                  }}
                >
                  <Text style={styles.mmsAudioText}>
                    {playingAudioKey === `${item.id}_part${pIdx}` ? '⏸️ Pause' : '▶️ Lire'} · 🔊 Message vocal
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          <Text style={styles.messageBody}>{item.body || '(vide)'}</Text>
          <Text style={styles.messageDate}>
            {new Date(Number(item.date) || 0).toLocaleString('fr-FR')}
          </Text>
          </View>
        </View>
        <View
          style={[
            styles.messageTypeBadge,
            item.type === 'sent' ? styles.sentBadge : styles.receivedBadge,
            item.type === 'sent' ? styles.badgeRight : styles.badgeLeft,
          ]}
        >
          <Text style={styles.messageTypeText}>{item.type === 'sent' ? 'Envoyé' : 'Reçu'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ============================================================
  // MODE CONTACT DIRECT (depuis HomeScreen avec contactPhone)
  // Flux linéaire : Contact → Période → Messages → Export
  // ============================================================
  if (contactPhone) {
    const inlineMessages = selectedConversation?.messages || [];
    return (
      <View style={styles.container}>
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          data={inlineMessages}
          renderItem={renderMessageItem}
          keyExtractor={item => (item && item.id) ? item.id.toString() : `fallback_${Math.random()}`}
          extraData={selectedMessagesInConv}
          showsVerticalScrollIndicator={true}
          ListHeaderComponent={
            <>
              <StatusBar barStyle="dark-content" backgroundColor="#e5e7eb" />

              {/* 1. En-tête contact */}
              <View style={styles.contactHeader}>
                <Text style={styles.contactHeaderIcon}>💬</Text>
                <Text style={styles.contactHeaderName}>{contactName || contactPhone}</Text>
                {contactName && <Text style={styles.contactHeaderPhone}>{contactPhone}</Text>}
              </View>

              {/* 2. Plage de dates */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Période</Text>
                <View style={styles.dateRow}>
                  <View style={styles.dateColumn}>
                    <Text style={styles.dateLabel}>Du</Text>
                    <TouchableOpacity
                      style={styles.dateButton}
                      onPress={() => {
                        setTempDate(dateFrom);
                        setTempDay(String(dateFrom.getDate()).padStart(2, '0'));
                        setTempMonth(String(dateFrom.getMonth() + 1).padStart(2, '0'));
                        setTempYear(String(dateFrom.getFullYear()));
                        setEditingDateType('from');
                        setShowDateFromPicker(true);
                      }}
                    >
                      <Text style={styles.dateButtonText}>
                        {dateFrom.toLocaleDateString('fr-FR')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.dateColumn}>
                    <Text style={styles.dateLabel}>Au</Text>
                    <TouchableOpacity
                      style={styles.dateButton}
                      onPress={() => {
                        setTempDate(dateTo);
                        setTempDay(String(dateTo.getDate()).padStart(2, '0'));
                        setTempMonth(String(dateTo.getMonth() + 1).padStart(2, '0'));
                        setTempYear(String(dateTo.getFullYear()));
                        setEditingDateType('to');
                        setShowDateToPicker(true);
                      }}
                    >
                      <Text style={styles.dateButtonText}>
                        {dateTo.toLocaleDateString('fr-FR')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* 3. Résumé messages */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Messages ({inlineMessages.length}) • {selectedMessagesInConv.size} sélectionné(s)
                </Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                  {inlineMessages.filter(m => m.type === 'sent').length} envoyés • {inlineMessages.filter(m => m.type === 'received').length} reçus
                </Text>
                <View style={styles.exportHintBox}>
                  <Text style={styles.exportHintText}>
                    Les messages cochés seront exportés vers l'application de génération de livre. Décochez ceux que vous souhaitez exclure.
                  </Text>
                </View>
                <TouchableOpacity
                  style={{ alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 10 }}
                  onPress={() => {
                    if (selectedMessagesInConv.size === inlineMessages.length) {
                      setSelectedMessagesInConv(new Set());
                    } else {
                      setSelectedMessagesInConv(new Set(inlineMessages.map(m => m.id || `tmp_${Math.random()}`)));
                    }
                  }}
                >
                  <Text style={{ fontSize: 13, color: '#3b82f6', fontWeight: '600' }}>
                    {selectedMessagesInConv.size === inlineMessages.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          }
          ListFooterComponent={
            <>
              {/* 4. Contenu à inclure */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Contenu à inclure</Text>
                <TouchableOpacity style={styles.mediaOption} onPress={() => setIncludeText(!includeText)}>
                  <Checkbox value={includeText} onValueChange={setIncludeText} />
                  <Text style={styles.mediaLabel}>Messages texte</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mediaOption} onPress={() => setIncludeImages(!includeImages)}>
                  <Checkbox value={includeImages} onValueChange={setIncludeImages} />
                  <Text style={styles.mediaLabel}>Photos/Images</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.mediaOption} onPress={() => setIncludeAudio(!includeAudio)}>
                  <Checkbox value={includeAudio} onValueChange={setIncludeAudio} />
                  <Text style={styles.mediaLabel}>Messages vocaux</Text>
                  {includeAudio && <Text style={styles.audioLimit}>Max 500 MB</Text>}
                </TouchableOpacity>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Text style={{ color: '#6b7280', textAlign: 'center' }}>
                {loading ? 'Chargement des messages...' : 'Aucun message trouvé pour cette période.'}
              </Text>
            </View>
          }
        />

        {/* Barre d'export fixe en bas */}
        <View style={styles.exportBar}>
          <View style={styles.exportBarSummary}>
            <Text style={styles.exportBarSummaryText}>
              {selectedMessagesInConv.size} message{selectedMessagesInConv.size > 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.exportButton,
              styles.exportButtonFixed,
              selectedMessagesInConv.size === 0 && styles.exportButtonDisabled,
            ]}
            onPress={handleExport}
            disabled={selectedMessagesInConv.size === 0}
            activeOpacity={0.8}
          >
            <Text style={styles.exportButtonText}>Exporter</Text>
          </TouchableOpacity>
        </View>

        {/* Modal sélecteur de date */}
        <Modal
          visible={showDateFromPicker || showDateToPicker}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            setShowDateFromPicker(false);
            setShowDateToPicker(false);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.datePickerModal}>
              <Text style={styles.datePickerTitle}>
                {editingDateType === 'from' ? 'Date de début' : 'Date de fin'}
              </Text>
              
              <View style={styles.datePickerContent}>
                <View style={styles.datePickerRow}>
                  <Text style={styles.datePickerLabel}>Jour</Text>
                  <TextInput
                    style={styles.datePickerInput}
                    ref={dayInputRef}
                    autoFocus={true}
                    keyboardType="numeric"
                    maxLength={2}
                    value={tempDay}
                    onChangeText={(text) => {
                      const clean = (text || '').replace(/[^0-9]/g, '');
                      setTempDay(clean);
                    }}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => monthInputRef.current?.focus?.()}
                  />
                </View>

                <View style={styles.datePickerRow}>
                  <Text style={styles.datePickerLabel}>Mois</Text>
                  <TextInput
                    style={styles.datePickerInput}
                    ref={monthInputRef}
                    keyboardType="numeric"
                    maxLength={2}
                    value={tempMonth}
                    onChangeText={(text) => {
                      const clean = (text || '').replace(/[^0-9]/g, '');
                      setTempMonth(clean);
                    }}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => yearInputRef.current?.focus?.()}
                  />
                </View>

                <View style={styles.datePickerRow}>
                  <Text style={styles.datePickerLabel}>Année</Text>
                  <TextInput
                    style={styles.datePickerInput}
                    ref={yearInputRef}
                    keyboardType="numeric"
                    maxLength={4}
                    value={tempYear}
                    onChangeText={(text) => {
                      const clean = (text || '').replace(/[^0-9]/g, '');
                      setTempYear(clean);
                    }}
                    returnKeyType="done"
                  />
                </View>
              </View>

              <View style={styles.datePickerButtons}>
                <TouchableOpacity
                  style={[styles.datePickerButton, styles.datePickerCancelButton]}
                  onPress={() => {
                    setShowDateFromPicker(false);
                    setShowDateToPicker(false);
                  }}
                >
                  <Text style={styles.datePickerCancelText}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.datePickerButton, styles.datePickerConfirmButton]}
                  onPress={() => {
                    const parsedYear = parseInt(tempYear, 10);
                    const parsedMonth = parseInt(tempMonth, 10);
                    const parsedDay = parseInt(tempDay, 10);

                    const year = Number.isFinite(parsedYear) ? parsedYear : new Date(tempDate).getFullYear();
                    const month = Number.isFinite(parsedMonth) ? parsedMonth : new Date(tempDate).getMonth() + 1;

                    const safeMonth = Math.min(Math.max(month, 1), 12);
                    const maxDay = new Date(year, safeMonth, 0).getDate();
                    const day = Number.isFinite(parsedDay) ? Math.min(Math.max(parsedDay, 1), maxDay) : Math.min(new Date(tempDate).getDate(), maxDay);

                    const newDate = new Date(tempDate);
                    newDate.setFullYear(year);
                    newDate.setMonth(safeMonth - 1);
                    newDate.setDate(day);

                    const newFrom = editingDateType === 'from' ? newDate : dateFrom;
                    const newTo = editingDateType === 'to' ? newDate : dateTo;
                    if (editingDateType === 'from') {
                      setDateFrom(newDate);
                      console.log('📅 Date début mise à jour:', newDate.toLocaleDateString('fr-FR'));
                    } else {
                      setDateTo(newDate);
                      console.log('📅 Date fin mise à jour:', newDate.toLocaleDateString('fr-FR'));
                    }
                    setFilterKey(prev => prev + 1);
                    setShowDateFromPicker(false);
                    setShowDateToPicker(false);
                    // Recharger avec les nouvelles dates explicites (pas les stale du state)
                    reloadAfterDateChange(newFrom, newTo);
                  }}
                >
                  <Text style={styles.datePickerConfirmText}>Valider</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal code d'export */}
        <Modal
          visible={showExportModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowExportModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>✅ Export réussi !</Text>
              <Text style={styles.modalSubtitle}>Votre code d'export :</Text>
              
              <View style={styles.codeContainer}>
                <Text style={styles.codeText}>{exportCode}</Text>
              </View>

              <Text style={styles.modalInfo}>
                Utilisez ce code sur l'application web pour importer vos messages.
                {"\n\n"}
                ⏱️ Valable 24 heures
              </Text>

              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowExportModal(false)}
              >
                <Text style={styles.modalButtonText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ============================================================
  // MODE GÉNÉRIQUE (sans contactPhone - onglet Export direct)
  // ============================================================
  return (
    <View style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        data={displayedConversations}
        renderItem={renderConversationItem}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={true}
        ListHeaderComponent={
          <>
            <StatusBar barStyle="dark-content" backgroundColor="#e5e7eb" />
            <Text style={styles.title}>Exporter mes SMS</Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Plage de dates</Text>
              <View style={styles.dateRow}>
                <View style={styles.dateColumn}>
                  <Text style={styles.dateLabel}>Du</Text>
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => {
                      setTempDate(dateFrom);
                      setTempDay(String(dateFrom.getDate()).padStart(2, '0'));
                      setTempMonth(String(dateFrom.getMonth() + 1).padStart(2, '0'));
                      setTempYear(String(dateFrom.getFullYear()));
                      setEditingDateType('from');
                      setShowDateFromPicker(true);
                    }}
                  >
                    <Text style={styles.dateButtonText}>
                      {dateFrom.toLocaleDateString('fr-FR')}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.dateColumn}>
                  <Text style={styles.dateLabel}>Au</Text>
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => {
                      setTempDate(dateTo);
                      setTempDay(String(dateTo.getDate()).padStart(2, '0'));
                      setTempMonth(String(dateTo.getMonth() + 1).padStart(2, '0'));
                      setTempYear(String(dateTo.getFullYear()));
                      setEditingDateType('to');
                      setShowDateToPicker(true);
                    }}
                  >
                    <Text style={styles.dateButtonText}>
                      {dateTo.toLocaleDateString('fr-FR')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Conversations ({displayedConversations.length}) • {selectedConversations.size} sélectionnée(s)
              </Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher un contact..."
                placeholderTextColor="#9ca3af"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {displayedConversations.length === 0 && (
                <View style={{ paddingVertical: 20, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: '#6b7280', textAlign: 'center' }}>
                    Aucun SMS trouvé.{'\n'}
                    Vérifiez que la permission SMS est accordée dans Réglages {'>'} Applications {'>'} Chatbook Export {'>'} Permissions {'>'} SMS.
                  </Text>
                </View>
              )}
            </View>
          </>
        }
        ListFooterComponent={
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Contenu à inclure</Text>
              <TouchableOpacity style={styles.mediaOption} onPress={() => setIncludeText(!includeText)}>
                <Checkbox value={includeText} onValueChange={setIncludeText} />
                <Text style={styles.mediaLabel}>Messages texte</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mediaOption} onPress={() => setIncludeImages(!includeImages)}>
                <Checkbox value={includeImages} onValueChange={setIncludeImages} />
                <Text style={styles.mediaLabel}>Photos/Images</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mediaOption} onPress={() => setIncludeAudio(!includeAudio)}>
                <Checkbox value={includeAudio} onValueChange={setIncludeAudio} />
                <Text style={styles.mediaLabel}>Messages vocaux</Text>
                {includeAudio && <Text style={styles.audioLimit}>Max 500 MB</Text>}
              </TouchableOpacity>
            </View>
          </>
        }
      />

      <View style={styles.exportBar}>
        <View style={styles.exportBarSummary}>
          <Text style={styles.exportBarSummaryText}>
            {selectedConversations.size} conversation{selectedConversations.size > 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.exportButton,
            styles.exportButtonFixed,
            selectedConversations.size === 0 && styles.exportButtonDisabled,
          ]}
          onPress={handleExport}
          disabled={selectedConversations.size === 0}
          activeOpacity={0.8}
        >
          <Text style={styles.exportButtonText}>Exporter</Text>
        </TouchableOpacity>
      </View>

      {/* Modal détail conversation */}
      <Modal
        visible={!!selectedConversation}
        animationType="slide"
        onRequestClose={closeConversationDetail}
      >
        {selectedConversation && (
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closeConversationDetail}>
                <Text style={styles.backButton}>‹ Retour</Text>
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>
                {selectedConversation.name || selectedConversation.address}
              </Text>
              <Text style={styles.modalHeaderSubtitle}>
                {selectedMessagesInConv.size} / {selectedConversation.messages.length} sélectionnés
              </Text>
            </View>
            <FlatList
              data={selectedConversation.messages}
              extraData={selectedMessagesInConv}
              renderItem={renderMessageItem}
              keyExtractor={item => (item && item.id) ? item.id.toString() : `fallback_${Math.random()}`}
              contentContainerStyle={styles.messageList}
            />
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.validateButton}
                onPress={closeConversationDetail}
                activeOpacity={0.8}
              >
                <Text style={styles.validateButtonText}>
                  Valider ({selectedMessagesInConv.size} message{selectedMessagesInConv.size > 1 ? 's' : ''})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>

      {/* Modal sélecteur de date */}
      <Modal
        visible={showDateFromPicker || showDateToPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowDateFromPicker(false);
          setShowDateToPicker(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.datePickerModal}>
            <Text style={styles.datePickerTitle}>
              {editingDateType === 'from' ? 'Date de début' : 'Date de fin'}
            </Text>
            
            <View style={styles.datePickerContent}>
              <View style={styles.datePickerRow}>
                <Text style={styles.datePickerLabel}>Jour</Text>
                <TextInput
                  style={styles.datePickerInput}
                  ref={dayInputRef}
                  autoFocus={true}
                  keyboardType="numeric"
                  maxLength={2}
                  value={tempDay}
                  onChangeText={(text) => {
                    const clean = (text || '').replace(/[^0-9]/g, '');
                    setTempDay(clean);
                  }}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => monthInputRef.current?.focus?.()}
                />
              </View>

              <View style={styles.datePickerRow}>
                <Text style={styles.datePickerLabel}>Mois</Text>
                <TextInput
                  style={styles.datePickerInput}
                  ref={monthInputRef}
                  keyboardType="numeric"
                  maxLength={2}
                  value={tempMonth}
                  onChangeText={(text) => {
                    const clean = (text || '').replace(/[^0-9]/g, '');
                    setTempMonth(clean);
                  }}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => yearInputRef.current?.focus?.()}
                />
              </View>

              <View style={styles.datePickerRow}>
                <Text style={styles.datePickerLabel}>Année</Text>
                <TextInput
                  style={styles.datePickerInput}
                  ref={yearInputRef}
                  keyboardType="numeric"
                  maxLength={4}
                  value={tempYear}
                  onChangeText={(text) => {
                    const clean = (text || '').replace(/[^0-9]/g, '');
                    setTempYear(clean);
                  }}
                  returnKeyType="done"
                />
              </View>
            </View>

            <View style={styles.datePickerButtons}>
              <TouchableOpacity
                style={[styles.datePickerButton, styles.datePickerCancelButton]}
                onPress={() => {
                  setShowDateFromPicker(false);
                  setShowDateToPicker(false);
                }}
              >
                <Text style={styles.datePickerCancelText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.datePickerButton, styles.datePickerConfirmButton]}
                onPress={() => {
                  const parsedYear = parseInt(tempYear, 10);
                  const parsedMonth = parseInt(tempMonth, 10);
                  const parsedDay = parseInt(tempDay, 10);

                  const year = Number.isFinite(parsedYear) ? parsedYear : new Date(tempDate).getFullYear();
                  const month = Number.isFinite(parsedMonth) ? parsedMonth : new Date(tempDate).getMonth() + 1;

                  const safeMonth = Math.min(Math.max(month, 1), 12);
                  const maxDay = new Date(year, safeMonth, 0).getDate();
                  const day = Number.isFinite(parsedDay) ? Math.min(Math.max(parsedDay, 1), maxDay) : Math.min(new Date(tempDate).getDate(), maxDay);

                  const newDate = new Date(tempDate);
                  newDate.setFullYear(year);
                  newDate.setMonth(safeMonth - 1);
                  newDate.setDate(day);

                  if (editingDateType === 'from') {
                    setDateFrom(newDate);
                  } else {
                    setDateTo(newDate);
                  }
                  setFilterKey(prev => prev + 1);
                  setShowDateFromPicker(false);
                  setShowDateToPicker(false);
                }}
              >
                <Text style={styles.datePickerConfirmText}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal code d'export */}
      <Modal
        visible={showExportModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowExportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✅ Export réussi !</Text>
            <Text style={styles.modalSubtitle}>Votre code d'export :</Text>
            
            <View style={styles.codeContainer}>
              <Text style={styles.codeText}>{exportCode}</Text>
            </View>

            <Text style={styles.modalInfo}>
              Utilisez ce code sur l'application web pour importer vos messages.
              {"\n\n"}
              ⏱️ Valable 24 heures
            </Text>

            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowExportModal(false)}
            >
              <Text style={styles.modalButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e5e7eb',
  },
  content: {
    padding: 20,
    paddingBottom: 140,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  contactHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#34d399',
  },
  contactHeaderIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  contactHeaderName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#065f46',
  },
  contactHeaderPhone: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  exportHintBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  exportHintText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 18,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginBottom: 12,
  },
  conversationListContainer: {
    height: 200,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginBottom: 12,
  },
  hint: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  conversationName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  checkboxTouchArea: {
    padding: 12,
  },
  conversationTouchArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 12,
  },
  conversationInfo: {
    flex: 1,
  },
  messageBody: {
    fontSize: 14,
    color: '#1f2937',
    lineHeight: 20,
  },
  messageDate: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4,
  },
  conversationCount: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  mediaOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  mediaLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
    marginLeft: 12,
  },
  audioLimit: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
  },
  audioSection: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  audioGauge: {
    marginBottom: 12,
  },
  gaugeLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gaugeLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
  gaugeWarning: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ef4444',
  },
  gaugeBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 4,
  },
  audioListToggle: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  audioListToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400e',
  },
  audioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  audioInfo: {
    flex: 1,
    marginLeft: 8,
  },
  audioName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1f2937',
  },
  audioSize: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  exportButton: {
    backgroundColor: '#6ee7b7',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 2,
    borderColor: '#34d399',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  exportButtonFixed: {
    marginTop: 0,
    flex: 1,
    marginLeft: 12,
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    color: '#065f46',
    fontSize: 18,
    fontWeight: '700',
  },
  exportBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#e5e7eb',
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    flexDirection: 'row',
    alignItems: 'center',
  },
  exportBarSummary: {
    minWidth: 120,
  },
  exportBarSummaryText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateColumn: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  dateButton: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  dateButtonText: {
    fontSize: 14,
    color: '#1f2937',
    textAlign: 'center',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#065f46',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 16,
  },
  codeContainer: {
    backgroundColor: '#d1fae5',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#6ee7b7',
  },
  codeText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#065f46',
    letterSpacing: 4,
  },
  modalInfo: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: '#6ee7b7',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderWidth: 2,
    borderColor: '#34d399',
  },
  modalButtonText: {
    color: '#065f46',
    fontSize: 16,
    fontWeight: '700',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#34d399',
    borderColor: '#34d399',
  },
  checkboxMark: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  arrowIcon: {
    fontSize: 24,
    color: '#9ca3af',
    marginLeft: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  modalHeader: {
    backgroundColor: '#ffffff',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    fontSize: 18,
    color: '#3b82f6',
    fontWeight: '600',
    marginBottom: 8,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  modalHeaderSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  messageList: {
    padding: 16,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  messageItem: {
    marginBottom: 12,
    flexDirection: 'column',
    width: '100%',
  },
  messageContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 4,
  },
  messageTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  sentBadge: {
    backgroundColor: '#d1fae5',
    alignSelf: 'flex-end',
  },
  receivedBadge: {
    backgroundColor: '#f3f4f6',
    alignSelf: 'flex-start',
  },
  badgeLeft: {
    alignSelf: 'flex-start',
    marginLeft: 32,
  },
  badgeRight: {
    alignSelf: 'flex-end',
    marginRight: 0,
  },
  messageTypeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#065f46',
  },
  messageWrapperReceived: {
    alignItems: 'flex-start',
  },
  messageWrapperSent: {
    alignItems: 'flex-end',
  },
  bubbleReceived: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 4,
    marginLeft: 0,
    alignSelf: 'flex-start',
  },
  bubbleSent: {
    backgroundColor: '#d1fae5',
    borderTopRightRadius: 4,
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: '#34d399',
  },
  mmsMessageHighlight: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
    borderLeftColor: '#ef4444', // Rouge pour bien mettre en évidence (préférence utilisateur jaune/rouge)
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  mmsLabel: {
    fontWeight: 'bold',
    color: '#b45309', // Marron/Ambre foncé
    marginBottom: 4,
    fontSize: 12,
  },
  mmsPartContainer: {
    marginVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  mmsImagePreview: {
    width: '100%',
    height: 200,
    backgroundColor: '#000',
  },
  mmsAudioPlaceholder: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1fae5',
  },
  mmsAudioText: {
    fontSize: 14,
    color: '#065f46',
    fontWeight: '500',
  },
  modalFooter: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  validateButton: {
    backgroundColor: '#34d399',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  validateButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  datePickerModal: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  datePickerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 20,
    textAlign: 'center',
  },
  datePickerContent: {
    marginBottom: 24,
  },
  datePickerRow: {
    marginBottom: 16,
  },
  datePickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  datePickerInput: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: '#d1d5db',
    textAlign: 'center',
    fontWeight: '600',
  },
  datePickerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  datePickerButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  datePickerCancelButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  datePickerConfirmButton: {
    backgroundColor: '#34d399',
  },
  datePickerCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  datePickerConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
