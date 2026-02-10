import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  StatusBar,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
} from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';
import { buildNumberToNameMap } from '../utils/contacts';
import { normalizePhoneE164, formatForDisplay } from '../utils/phone';

export default function SMSListScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const [numberToName, setNumberToName] = useState(new Map());
  const [debugInfo, setDebugInfo] = useState(null);

  useEffect(() => {
    requestSMSPermission();
  }, []);

  const requestSMSPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_SMS,
          {
            title: 'Permission SMS',
            message: 'Chatbook Export a besoin d\'accéder à vos SMS pour les exporter',
            buttonNeutral: 'Plus tard',
            buttonNegative: 'Refuser',
            buttonPositive: 'Autoriser',
          }
        );
        
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          setHasPermission(true);
          try {
            const contactsGranted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
              {
                title: 'Permission Contacts',
                message: 'Chatbook Export peut afficher le nom de vos contacts au lieu des numéros',
                buttonNeutral: 'Plus tard',
                buttonNegative: 'Refuser',
                buttonPositive: 'Autoriser',
              }
            );
            if (contactsGranted === PermissionsAndroid.RESULTS.GRANTED) {
              const map = await buildNumberToNameMap('FR');
              setNumberToName(map);
            } else {
              setNumberToName(new Map());
            }
          } catch (e) {
            console.warn('Impossible de charger les contacts:', e);
            setNumberToName(new Map());
          }

          loadConversations();
        } else {
          setHasPermission(false);
          setLoading(false);
        }
      } catch (err) {
        console.error('Erreur permission:', err);
        setLoading(false);
      }
    }
  };

  const loadConversations = () => {
    // Charger inbox et sent séparément car box:'all' ne récupère pas tout sur certains devices
    const allMessages = [];
    let loadedCount = 0;
    const totalLoads = 2; // inbox + sent

    const processMessages = () => {
      loadedCount++;
      if (loadedCount < totalLoads) return;

      // Une fois tous les messages chargés, les grouper
      const sms = allMessages;
      
      // Grouper par numéro de téléphone
      const grouped = {};
        sms.forEach(message => {
          const rawAddress = message.address;
          const normalized = normalizePhoneE164(rawAddress, 'FR') || String(rawAddress || '').trim();
          const display = formatForDisplay(normalized) || String(rawAddress || '').trim();
          const resolvedName = numberToName?.get(normalized) || null;

          // Sur Android, thread_id est souvent l'identifiant le plus fiable pour une conversation
          // (certaines entrées peuvent avoir address vide/incohérent).
          const threadKey = message.thread_id != null && String(message.thread_id).trim()
            ? `thread-${String(message.thread_id).trim()}`
            : normalized;

          // Récupérer le texte du message (SMS ou MMS)
          let messageText = message.body;
          if (!messageText && message.parts && Array.isArray(message.parts)) {
            // Pour les MMS, le texte peut être dans parts[].text ou parts[].data si ct_t == 'text/plain'
            const textPart = message.parts.find(p => p.text || (p.ct_t === 'text/plain' && p.data));
            messageText = textPart?.text || textPart?.data || null;
          }
          if (!messageText && message.text) {
            messageText = message.text;
          }
          // Si toujours null, on garde null (ne pas afficher de placeholder)

          if (!grouped[threadKey]) {
            grouped[threadKey] = {
              id: threadKey,
              address: normalized,
              displayAddress: display,
              name: resolvedName || message.person || null,
              messages: [],
              lastMessage: messageText,
              lastDate: message.date,
            };
          }
          grouped[threadKey].messages.push(message);

          // Garantir que lastDate/lastMessage correspondent au message le plus récent
          const currentLastDate = Number(grouped[threadKey].lastDate) || 0;
          const msgDate = Number(message.date) || 0;
          if (msgDate >= currentLastDate) {
            grouped[threadKey].lastDate = message.date;
            grouped[threadKey].lastMessage = messageText;
            // Si le nom n'était pas résolu au départ, tenter de le remplir au fil de l'eau
            if (!grouped[threadKey].name) {
              grouped[threadKey].name = resolvedName || message.person || null;
            }
          }
        });

        // Convertir en tableau et trier par date
        const conversationsList = Object.values(grouped).sort(
          (a, b) => b.lastDate - a.lastDate
        );

        // Debug léger : loguer les 20 premiers threads pour comparaison avec adb
        console.log('📋 DEBUG — 20 premiers threads (thread_id/address/name):');
        Object.values(grouped).slice(0, 20).forEach((conv, i) => {
          console.log(`${i + 1}. id=${conv.id} | address=${conv.address} | name=${conv.name || 'null'} | lastDate=${conv.lastDate}`);
        });

        // Debug types de messages pour comprendre pourquoi on ne voit que des audios
        console.log('🔍 DEBUG — Types de messages par thread (premiers 5 threads):');
        Object.values(grouped).slice(0, 5).forEach((conv, i) => {
          const types = conv.messages.map(m => `${m.type || 'unknown'}: ${m.body ? (m.body.length > 30 ? m.body.slice(0,30)+'...' : m.body) : 'null'}`).slice(0, 3);
          console.log(`Thread ${i+1} (${conv.address}): ${types.join(' | ')}`);
        });

        // Debug spécifique aux favoris : chercher les threads qui pourraient être des favoris par nom ou par address
        console.log('⭐ DEBUG — Recherche des threads qui pourraient être des favoris (nom ou address contenant des mots-clés favoris):');
        const favorisKeywords = ['papa', 'maman', 'maison', 'urgent', 'travail', 'ami', 'amour', 'favori'];
        Object.values(grouped).forEach((conv, i) => {
          const nameMatch = favorisKeywords.some(k => conv.name && conv.name.toLowerCase().includes(k));
          const addressMatch = favorisKeywords.some(k => conv.address && conv.address.toLowerCase().includes(k));
          if (nameMatch || addressMatch) {
            console.log(`⭐ Thread potentiel favori ${i+1}: name=${conv.name} | address=${conv.address} | lastMessage=${conv.lastMessage} | lastDate=${conv.lastDate}`);
          }
        });

        // Préparer les infos de debug pour l'UI
        const totalThreads = conversationsList.length;
        const totalMessages = sms.length;
        const threadsWithText = conversationsList.filter(c => c.lastMessage && c.lastMessage.trim()).length;
        const threadsWithoutText = conversationsList.filter(c => !c.lastMessage || !c.lastMessage.trim()).length;
        
        // Compter les SMS vs MMS
        const smsCount = sms.filter(m => !m.type || m.type === 1 || m.type === 2).length;
        const mmsCount = sms.filter(m => m.type && m.type !== 1 && m.type !== 2).length;
        
        const sample3 = conversationsList.slice(0, 3).map(c => ({
          name: c.name || 'null',
          lastMsg: c.lastMessage ? (c.lastMessage.length > 20 ? c.lastMessage.slice(0,20)+'...' : c.lastMessage) : 'null',
          msgCount: c.messages.length
        }));

        setDebugInfo({
          totalThreads,
          totalMessages,
          smsCount,
          mmsCount,
          threadsWithText,
          threadsWithoutText,
          sample3
        });

      setConversations(conversationsList);
      setLoading(false);
    };

    // Charger inbox (augmenter maxCount pour récupérer tous les messages)
    const filterInbox = { box: 'inbox', indexFrom: 0, maxCount: 200000 };
    SmsAndroid.list(
      JSON.stringify(filterInbox),
      (fail) => {
        console.error('Erreur lecture inbox:', fail);
        setLoading(false);
      },
      (count, smsList) => {
        const messages = JSON.parse(smsList);
        console.log(`📥 INBOX: ${messages.length} messages chargés`);
        allMessages.push(...messages);
        processMessages();
      }
    );

    // Charger sent (augmenter maxCount pour récupérer tous les messages)
    const filterSent = { box: 'sent', indexFrom: 0, maxCount: 200000 };
    SmsAndroid.list(
      JSON.stringify(filterSent),
      (fail) => {
        console.error('Erreur lecture sent:', fail);
        processMessages(); // Continuer même si sent échoue
      },
      (count, smsList) => {
        const messages = JSON.parse(smsList);
        console.log(`📤 SENT: ${messages.length} messages chargés`);
        allMessages.push(...messages);
        processMessages();
      }
    );
  };

  const formatDate = (timestamp) => {
    const date = new Date(parseInt(timestamp));
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Aujourd\'hui';
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays} jours`;
    
    return date.toLocaleDateString('fr-FR', { 
      day: 'numeric', 
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const renderConversation = ({ item }) => (
    <TouchableOpacity
      style={styles.conversationCard}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('Export', { conversation: item })}
    >
      <View style={styles.conversationIcon}>
        <Text style={styles.conversationIconText}>
          {(item.name || item.displayAddress || item.address || '?').toString().charAt(0).toUpperCase()}
        </Text>
      </View>
      
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={styles.conversationName} numberOfLines={1}>
            {item.name || item.displayAddress || item.address}
          </Text>
          <Text style={styles.conversationDate}>
            {formatDate(item.lastDate)}
          </Text>
        </View>
        
        <Text style={styles.conversationPreview} numberOfLines={2}>
          {item.lastMessage}
        </Text>
        
        <View style={styles.conversationFooter}>
          <Text style={styles.conversationCount}>
            {item.messages.length} message{item.messages.length > 1 ? 's' : ''}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Chargement des conversations...</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.centerContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
        <Text style={styles.errorIcon}>🔒</Text>
        <Text style={styles.errorTitle}>Permission requise</Text>
        <Text style={styles.errorText}>
          Chatbook Export a besoin d'accéder à vos SMS pour les exporter
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={requestSMSPermission}
        >
          <Text style={styles.primaryButtonText}>Autoriser l'accès</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.secondaryButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes conversations</Text>
        <View style={styles.backButton} />
      </View>

      {/* Debug Info */}
      {debugInfo && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugTitle}>🔍 Debug Info</Text>
          <Text style={styles.debugText}>Messages chargés: {debugInfo.totalMessages} ({debugInfo.smsCount} SMS, {debugInfo.mmsCount} MMS)</Text>
          <Text style={styles.debugText}>Threads: {debugInfo.totalThreads} | Avec texte: {debugInfo.threadsWithText} | Sans: {debugInfo.threadsWithoutText}</Text>
          <Text style={styles.debugText}>Exemples (3 premiers):</Text>
          {debugInfo.sample3.map((s, i) => (
            <Text key={i} style={styles.debugTextSmall}>
              {i+1}. {s.name} ({s.msgCount}msg): {s.lastMsg}
            </Text>
          ))}
        </View>
      )}

      {/* Liste des conversations */}
      {conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyText}>Aucune conversation trouvée</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.address}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: '#1f2937',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  listContent: {
    padding: 16,
  },
  conversationCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  conversationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  conversationIconText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  conversationDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 8,
  },
  conversationPreview: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
    lineHeight: 20,
  },
  conversationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  conversationCount: {
    fontSize: 12,
    color: '#9ca3af',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
    lineHeight: 24,
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginBottom: 12,
    minWidth: 200,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    minWidth: 200,
  },
  secondaryButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  debugContainer: {
    backgroundColor: '#fff3cd',
    padding: 10,
    margin: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 5,
  },
  debugText: {
    fontSize: 11,
    color: '#856404',
    marginBottom: 2,
  },
  debugTextSmall: {
    fontSize: 10,
    color: '#856404',
    marginLeft: 10,
  },
});
