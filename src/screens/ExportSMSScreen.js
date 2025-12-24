import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  StatusBar,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';

export default function ExportSMSScreen() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversations, setSelectedConversations] = useState(new Set());
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [dateTo, setDateTo] = useState(new Date());
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
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

  const AUDIO_MAX_SIZE = 500 * 1024 * 1024; // 500 MB

  useEffect(() => {
    requestSMSPermission();
  }, []);

  const requestSMSPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.READ_SMS,
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        ]);
        const smsGranted = results[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED;
        const contactsGranted = results[PermissionsAndroid.PERMISSIONS.READ_CONTACTS] === PermissionsAndroid.RESULTS.GRANTED;

        if (smsGranted) {
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
          const all = [...inbox, ...sent].sort((a, b) => (a?.date || 0) - (b?.date || 0));

          console.log('📱 SMS récupérés - Inbox:', inbox.length, 'Sent:', sent.length, 'Total:', all.length);

          // Regrouper par address (numéro de téléphone)
          const map = new Map();
          const seenMessageIds = new Set(); // Pour éviter les doublons
          
          for (const m of all) {
            const rawAddress = (m?.address || '').trim();
            if (!rawAddress) continue;
            
            // Créer un ID unique basé sur plusieurs critères pour éviter les doublons
            const messageId = m._id || `${m.date}-${m.address}-${m.type}-${(m.body || '').substring(0, 50)}`;
            
            // Ignorer les doublons exacts
            if (seenMessageIds.has(messageId)) {
              console.log('⚠️ Message dupliqué ignoré:', messageId);
              continue;
            }
            seenMessageIds.add(messageId);
            
            // Normaliser pour regroupement: enlever espaces, tirets, parenthèses
            const normalizedNumber = rawAddress.replace(/[\s\-\(\)]/g, '');
            
            // Utiliser le numéro normalisé comme clé unique
            const existing = map.get(normalizedNumber) || {
              id: normalizedNumber,
              address: rawAddress, // Garder le format original pour l'affichage
              name: null,
              messages: [],
              lastMessage: '',
              lastDate: 0,
              audioCount: 0,
              imageCount: 0,
            };
            
            existing.messages.push({
              id: messageId,
              body: m?.body || '',
              date: m?.date || 0,
              type: m?.type === 1 ? 'received' : 'sent',
              address: rawAddress,
            });
            
            if ((m?.date || 0) > existing.lastDate) {
              existing.lastDate = m.date;
              existing.lastMessage = m?.body || '';
            }
            map.set(normalizedNumber, existing);
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
            
            console.log(`📊 ${conv.name || conv.address}: ${conv.messages.length} messages (${conv.messages.filter(m => m.type === 'sent').length} envoyés, ${conv.messages.filter(m => m.type === 'received').length} reçus)`);
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
      
      // Demander la permission si nécessaire
      const permission = await Contacts.checkPermission();
      if (permission === 'undefined') {
        await Contacts.requestPermission();
      }

      // Récupérer tous les contacts
      const contacts = await Contacts.getAll();
      
      // Créer un mapping numéro normalisé -> contact pour éviter les doublons
      const numberToContact = new Map();
      
      for (const contact of contacts) {
        const phoneNumbers = contact.phoneNumbers || [];
        for (const p of phoneNumbers) {
          const normalized = (p.number || '').replace(/[\s\-\(\)]/g, '');
          if (normalized) {
            // Garder le contact avec le nom le plus complet
            const existingContact = numberToContact.get(normalized);
            const currentName = contact.displayName || contact.givenName || '';
            const existingName = existingContact?.displayName || existingContact?.givenName || '';
            
            if (!existingContact || currentName.length > existingName.length) {
              numberToContact.set(normalized, contact);
            }
          }
        }
      }
      
      // Résoudre les noms pour chaque conversation
      for (const conv of conversations) {
        const phoneNumber = conv.id; // Déjà normalisé
        
        // Chercher le contact correspondant dans le mapping
        const contact = numberToContact.get(phoneNumber);
        
        if (contact) {
          conv.name = contact.displayName || contact.givenName || null;
        }
      }
    } catch (err) {
      console.warn('Impossible de résoudre les noms:', err);
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

  const openConversationDetail = (conv) => {
    // Filtrer les messages selon la période sélectionnée
    const dateFromTimestamp = new Date(dateFrom).setHours(0, 0, 0, 0);
    const dateToTimestamp = new Date(dateTo).setHours(23, 59, 59, 999);
    
    const filteredMessages = conv.messages.filter(msg => {
      return msg.date >= dateFromTimestamp && msg.date <= dateToTimestamp;
    });
    
    // IMPORTANT: Trier les messages par date (ordre chronologique)
    filteredMessages.sort((a, b) => a.date - b.date);
    
    // Créer une conversation filtrée
    const filteredConv = {
      ...conv,
      messages: filteredMessages,
      allMessages: conv.messages // Garder tous les messages pour référence
    };
    
    setSelectedConversation(filteredConv);
    
    // Par défaut, tous les messages filtrés sont sélectionnés
    const allIds = new Set(filteredMessages.map(m => m.id));
    setSelectedMessagesInConv(allIds);
    
    console.log(`📅 Ouverture conversation: ${conv.messages.length} messages total, ${filteredMessages.length} dans la période`);
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
    // Sauvegarder la sélection des messages pour cette conversation
    if (selectedConversation) {
      // Mettre à jour la conversation avec les messages sélectionnés
      const updatedConversations = conversations.map(conv => {
        if (conv.id === selectedConversation.id) {
          return {
            ...conv,
            selectedMessageIds: Array.from(selectedMessagesInConv)
          };
        }
        return conv;
      });
      setConversations(updatedConversations);
      
      // Ajouter la conversation aux sélectionnées si au moins 1 message est sélectionné
      if (selectedMessagesInConv.size > 0) {
        const newSelected = new Set(selectedConversations);
        newSelected.add(selectedConversation.id);
        setSelectedConversations(newSelected);
      }
    }
    
    setSelectedConversation(null);
    setSelectedMessagesInConv(new Set());
  };

  const toggleAudioFile = (index) => {
    const newAudioFiles = [...audioFiles];
    newAudioFiles[index].selected = !newAudioFiles[index].selected;
    setAudioFiles(newAudioFiles);
    updateAudioSize(newAudioFiles);
  };

  const updateAudioSize = (files) => {
    const total = files
      .filter(f => f.selected)
      .reduce((sum, f) => sum + f.size, 0);
    setAudioTotalSize(total);
  };

  // Calculer les timestamps des dates pour les dépendances du useMemo
  const dateFromTimestampKey = dateFrom ? dateFrom.getTime() : 0;
  const dateToTimestampKey = dateTo ? dateTo.getTime() : Date.now();

  const handleExport = async () => {
    if (selectedConversations.size === 0) {
      Alert.alert('Erreur', 'Sélectionnez au moins une conversation');
      return;
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
      // Préparer les conversations sélectionnées
      const selectedConvs = conversations.filter(c => selectedConversations.has(c.id));
      
      // Importer le service d'export
      const { uploadExportData } = require('../services/mobileExportService');
      
      // Uploader vers Firebase
      const code = await uploadExportData({
        conversations: selectedConvs,
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
    
    return conversations
      .filter(conv => {
        // Filtrer par recherche
        const searchLower = searchQuery.toLowerCase();
        const name = (conv.name || conv.address).toLowerCase();
        return name.includes(searchLower);
      })
      .map(conv => {
        // Filtrer les messages par plage de dates
        const filteredMessages = conv.messages.filter(msg => {
          const inRange = msg.date >= dateFromTimestamp && msg.date <= dateToTimestamp;
          return inRange;
        });
        
        // Log pour la première conversation
        if (conv === conversations[0]) {
          console.log(`📊 Exemple: ${conv.name || conv.address}`);
          console.log(`   Total: ${conv.messages.length}, Filtrés: ${filteredMessages.length}`);
          if (conv.messages.length > 0) {
            const firstMsg = new Date(conv.messages[0].date);
            const lastMsg = new Date(conv.messages[conv.messages.length - 1].date);
            console.log(`   Messages du ${firstMsg.toLocaleDateString('fr-FR')} au ${lastMsg.toLocaleDateString('fr-FR')}`);
            console.log(`   Premier message timestamp: ${conv.messages[0].date}`);
            console.log(`   Dernier message timestamp: ${conv.messages[conv.messages.length - 1].date}`);
          }
        }
        
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
    return filteredConversations.filter(c => (typeof c.filteredCount === 'number' ? c.filteredCount : c.messages?.length || 0) > 0);
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
  if (filteredConversations.length > 0) {
    console.log('🎯 Premier item:', filteredConversations[0].name, 'filteredCount:', filteredConversations[0].filteredCount, 'totalCount:', filteredConversations[0].totalCount);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar barStyle="dark-content" backgroundColor="#e5e7eb" />

      {/* Titre */}
      <Text style={styles.title}>Exporter mes SMS</Text>

      {/* Filtrage par dates (déplacé au-dessus de la liste) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Plage de dates</Text>
        
        <View style={styles.dateRow}>
          <View style={styles.dateColumn}>
            <Text style={styles.dateLabel}>Du</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => {
                setTempDate(dateFrom);
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

      {/* Sélection des conversations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Conversations ({displayedConversations.length}) • {selectedConversations.size} sélectionnée(s)
        </Text>

        {/* Barre de recherche */}
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un contact..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {/* Liste avec hauteur fixe et scroll */}
        <View style={styles.conversationListContainer}>
          {displayedConversations.length === 0 && (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#6b7280', textAlign: 'center' }}>
                Aucun SMS trouvé.
                {'\n'}
                Vérifiez que la permission SMS est accordée dans Réglages {'>'} Applications {'>'} Chatbook Export {'>'} Permissions {'>'} SMS.
              </Text>
            </View>
          )}
          <FlatList
            data={displayedConversations}
            renderItem={({ item }) => (
              <View style={styles.conversationItem}>
                {/* Zone checkbox agrandie */}
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
                
                {/* Zone principale pour ouvrir le détail */}
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
            )}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            scrollEnabled={true}
          />
        </View>
      </View>

      {/* Choix des médias */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contenu à inclure</Text>

        <TouchableOpacity
          style={styles.mediaOption}
          onPress={() => setIncludeText(!includeText)}
        >
          <Checkbox value={includeText} onValueChange={setIncludeText} />
          <Text style={styles.mediaLabel}>Messages texte</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.mediaOption}
          onPress={() => setIncludeImages(!includeImages)}
        >
          <Checkbox value={includeImages} onValueChange={setIncludeImages} />
          <Text style={styles.mediaLabel}>Photos/Images</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.mediaOption}
          onPress={() => setIncludeAudio(!includeAudio)}
        >
          <Checkbox value={includeAudio} onValueChange={setIncludeAudio} />
          <Text style={styles.mediaLabel}>Vocapsules et audios</Text>
          {includeAudio && (
            <Text style={styles.audioLimit}>Max 500 MB</Text>
          )}
        </TouchableOpacity>

        {includeAudio && audioFiles.length > 0 && (
          <View style={styles.audioSection}>
            {/* Jauge de poids */}
            <View style={styles.audioGauge}>
              <View style={styles.gaugeLabel}>
                <Text style={styles.gaugeLabelText}>
                  {(audioTotalSize / 1024 / 1024).toFixed(1)} MB / 500 MB
                </Text>
                {audioTotalSize > AUDIO_MAX_SIZE && (
                  <Text style={styles.gaugeWarning}>⚠️ Dépassement</Text>
                )}
              </View>
              <View style={styles.gaugeBar}>
                <View
                  style={[
                    styles.gaugeFill,
                    {
                      width: `${Math.min((audioTotalSize / AUDIO_MAX_SIZE) * 100, 100)}%`,
                      backgroundColor:
                        audioTotalSize > AUDIO_MAX_SIZE ? '#ef4444' : '#34d399',
                    },
                  ]}
                />
              </View>
            </View>

            {/* Liste des audios */}
            <TouchableOpacity
              style={styles.audioListToggle}
              onPress={() => setShowAudioList(!showAudioList)}
            >
              <Text style={styles.audioListToggleText}>
                {showAudioList ? '▼' : '▶'} Détail des audios ({audioFiles.length})
              </Text>
            </TouchableOpacity>

            {showAudioList && (
              <FlatList
                data={audioFiles}
                nestedScrollEnabled={true}
                scrollEnabled={false}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={styles.audioItem}
                    onPress={() => toggleAudioFile(index)}
                  >
                    <Checkbox
                      value={item.selected}
                      onValueChange={() => toggleAudioFile(index)}
                    />
                    <View style={styles.audioInfo}>
                      <Text style={styles.audioName}>{item.name}</Text>
                      <Text style={styles.audioSize}>
                        {(item.size / 1024 / 1024).toFixed(1)} MB
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                keyExtractor={(item, index) => index.toString()}
              />
            )}
          </View>
        )}

      </View>

      {/* Bouton Exporter */}
      <TouchableOpacity
        style={[
          styles.exportButton,
          selectedConversations.size === 0 && styles.exportButtonDisabled,
        ]}
        onPress={handleExport}
        disabled={selectedConversations.size === 0}
        activeOpacity={0.8}
      >
        <Text style={styles.exportButtonText}>Exporter</Text>
      </TouchableOpacity>

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
              <Text style={styles.modalHeaderSubtitle}>
                {selectedConversation.messages.filter(m => m.type === 'sent').length} envoyés • {selectedConversation.messages.filter(m => m.type === 'received').length} reçus
              </Text>
              <Text style={[styles.modalHeaderSubtitle, { fontSize: 12, marginTop: 4 }]}>
                📅 {dateFrom.toLocaleDateString('fr-FR')} - {dateTo.toLocaleDateString('fr-FR')}
              </Text>
            </View>
            <FlatList
              data={selectedConversation.messages}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.messageItem}
                  onPress={() => toggleMessageInConv(item.id)}
                >
                  <Checkbox
                    value={selectedMessagesInConv.has(item.id)}
                    onValueChange={() => toggleMessageInConv(item.id)}
                  />
                  <View style={styles.messageContent}>
                    <Text style={styles.messageBody}>{item.body || '(vide)'}</Text>
                    <Text style={styles.messageDate}>
                      {new Date(item.date).toLocaleString('fr-FR')}
                    </Text>
                  </View>
                  <View style={[
                    styles.messageTypeBadge,
                    item.type === 'sent' ? styles.sentBadge : styles.receivedBadge
                  ]}>
                    <Text style={styles.messageTypeText}>
                      {item.type === 'sent' ? 'Envoyé' : 'Reçu'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              keyExtractor={item => item.id.toString()}
              contentContainerStyle={styles.messageList}
            />
            
            {/* Bouton Valider en bas de la modal */}
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
                  keyboardType="number-pad"
                  maxLength={2}
                  value={tempDate.getDate().toString()}
                  onChangeText={(text) => {
                    const day = parseInt(text) || 1;
                    const newDate = new Date(tempDate);
                    newDate.setDate(Math.min(Math.max(day, 1), 31));
                    setTempDate(newDate);
                  }}
                />
              </View>

              <View style={styles.datePickerRow}>
                <Text style={styles.datePickerLabel}>Mois</Text>
                <TextInput
                  style={styles.datePickerInput}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={(tempDate.getMonth() + 1).toString()}
                  onChangeText={(text) => {
                    const month = parseInt(text) || 1;
                    const newDate = new Date(tempDate);
                    newDate.setMonth(Math.min(Math.max(month - 1, 0), 11));
                    setTempDate(newDate);
                  }}
                />
              </View>

              <View style={styles.datePickerRow}>
                <Text style={styles.datePickerLabel}>Année</Text>
                <TextInput
                  style={styles.datePickerInput}
                  keyboardType="number-pad"
                  maxLength={4}
                  value={tempDate.getFullYear().toString()}
                  onChangeText={(text) => {
                    const year = parseInt(text) || 2024;
                    const newDate = new Date(tempDate);
                    newDate.setFullYear(year);
                    setTempDate(newDate);
                  }}
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
                  // Créer une nouvelle instance de Date pour forcer la mise à jour
                  const newDate = new Date(tempDate);
                  if (editingDateType === 'from') {
                    setDateFrom(newDate);
                    console.log('📅 Date début mise à jour:', newDate.toLocaleDateString('fr-FR'));
                  } else {
                    setDateTo(newDate);
                    console.log('📅 Date fin mise à jour:', newDate.toLocaleDateString('fr-FR'));
                  }
                  // Forcer le recalcul du filtrage
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e5e7eb',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
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
    height: 280,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 8,
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
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    color: '#065f46',
    fontSize: 18,
    fontWeight: '700',
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
  messageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  messageContent: {
    flex: 1,
    paddingHorizontal: 12,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  checkboxTouchArea: {
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: 6,
  },
  messageDate: {
    fontSize: 11,
    color: '#9ca3af',
  },
  messageTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sentBadge: {
    backgroundColor: '#dbeafe',
  },
  receivedBadge: {
    backgroundColor: '#d1fae5',
  },
  messageTypeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1f2937',
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
