import React, { useState, useEffect } from 'react';
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
          const all = [...inbox, ...sent];

          // Regrouper par address (numéro de téléphone normalisé)
          const map = new Map();
          for (const m of all) {
            // Normaliser le numéro (supprimer espaces, tirets, parenthèses)
            const rawAddress = (m?.address || '').trim();
            if (!rawAddress) continue;
            
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
              id: m._id || m.date,
              body: m?.body || '',
              date: m?.date || 0,
              type: m?.type === 1 ? 'received' : 'sent',
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
            conv.messages.sort((a, b) => a.date - b.date);
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
      
      for (const conv of conversations) {
        const phoneNumber = conv.address.replace(/[\s\-\(\)]/g, '');
        
        // Chercher le contact correspondant
        const contact = contacts.find(c =>
          c.phoneNumbers && c.phoneNumbers.some(p => {
            const normalized = p.number.replace(/[\s\-\(\)]/g, '');
            // Comparer les 8 derniers chiffres pour gérer les indicatifs
            return normalized.includes(phoneNumber.slice(-8)) || 
                   phoneNumber.includes(normalized.slice(-8));
          })
        );
        
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
    setSelectedConversation(conv);
    // Par défaut, tous les messages sont sélectionnés
    const allIds = new Set(conv.messages.map(m => m.id));
    setSelectedMessagesInConv(allIds);
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

  const generateExportCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

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

    // Générer le code d'export
    const code = generateExportCode();
    setExportCode(code);
    setShowExportModal(true);

    // TODO: Envoyer les données à Firebase avec ce code
    console.log('Export avec code:', code);
    console.log('Conversations sélectionnées:', selectedConversations.size);
    console.log('Période:', dateFrom.toLocaleDateString(), '-', dateTo.toLocaleDateString());
  };

  // Filtrer les conversations selon la recherche
  const filteredConversations = conversations.filter(conv => {
    const searchLower = searchQuery.toLowerCase();
    const name = (conv.name || conv.address).toLowerCase();
    return name.includes(searchLower);
  });

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar barStyle="dark-content" backgroundColor="#e5e7eb" />

      {/* Titre */}
      <Text style={styles.title}>Exporter mes SMS</Text>

      {/* Sélection des conversations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Conversations ({filteredConversations.length}) • {selectedConversations.size} sélectionnée(s)
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
          {filteredConversations.length === 0 && (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#6b7280', textAlign: 'center' }}>
                Aucun SMS trouvé.
                {'\n'}
                Vérifiez que la permission SMS est accordée dans Réglages {'>'} Applications {'>'} Chatbook Export {'>'} Permissions {'>'} SMS.
              </Text>
            </View>
          )}
          <FlatList
            data={filteredConversations}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.conversationItem}
                onPress={() => openConversationDetail(item)}
                onLongPress={() => toggleConversation(item.id)}
              >
                <Checkbox
                  value={selectedConversations.has(item.id)}
                  onValueChange={() => toggleConversation(item.id)}
                />
                <View style={styles.conversationInfo}>
                  <Text style={styles.conversationName}>
                    {item.name || item.address}
                  </Text>
                  <Text style={styles.conversationCount}>
                    {item.messages.length} messages • {item.audioCount} audios • {item.imageCount} images
                  </Text>
                </View>
                <Text style={styles.arrowIcon}>›</Text>
              </TouchableOpacity>
            )}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
          />
        </View>
      </View>

      {/* Filtrage par dates */}
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
                  if (editingDateType === 'from') {
                    setDateFrom(tempDate);
                  } else {
                    setDateTo(tempDate);
                  }
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
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  conversationInfo: {
    flex: 1,
    marginLeft: 12,
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
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  messageContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
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
