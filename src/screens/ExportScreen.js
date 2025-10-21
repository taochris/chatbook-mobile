import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import { getSmsService } from '../services/smsService';
import { uploadMobileData } from '../services/firebaseService';

export default function ExportScreen({ route, navigation }) {
  const { conversation } = route.params;
  const [loading, setLoading] = useState(false);
  const [exportCode, setExportCode] = useState(null);
  const [messages, setMessages] = useState([]);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    try {
      setProgress('Chargement des messages...');
      const smsService = getSmsService();
      const msgs = await smsService.getMessagesForConversation(conversation.id);
      setMessages(msgs);
      setProgress('');
    } catch (error) {
      console.error('Erreur chargement messages:', error);
      Alert.alert('Erreur', 'Impossible de charger les messages');
    }
  };

  const handleExport = async () => {
    if (messages.length === 0) {
      Alert.alert('Erreur', 'Aucun message à exporter');
      return;
    }

    setLoading(true);
    setProgress('Préparation de l\'export...');

    try {
      // Préparer les données
      const exportData = {
        platform: 'android',
        conversationName: conversation.name || conversation.address,
        messages: messages.map((msg, index) => ({
          id: index + 1,
          text: msg.body,
          sender: msg.type === 1 ? conversation.name || conversation.address : 'Me',
          timestamp: new Date(msg.date).toISOString(),
          type: msg.type === 1 ? 'received' : 'sent',
        })),
        metadata: {
          deviceType: 'Android',
          appVersion: '1.0.0',
          exportDate: new Date().toISOString(),
        },
      };

      setProgress('Upload vers Firebase...');
      
      // Upload vers Firebase et obtenir le code
      const code = await uploadMobileData(exportData);
      
      setExportCode(code);
      setProgress('');
      
      Alert.alert(
        'Export réussi ! 🎉',
        `Votre code : ${code}\n\nCe code est valable 24 heures.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Erreur export:', error);
      Alert.alert(
        'Erreur',
        'Impossible d\'exporter les messages. Vérifiez votre connexion internet.'
      );
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  const handleOpenBrowser = () => {
    if (!exportCode) return;
    
    const url = `https://chatbook.app?code=${exportCode}`;
    Linking.openURL(url).catch(err => {
      console.error('Erreur ouverture navigateur:', err);
      Alert.alert('Erreur', 'Impossible d\'ouvrir le navigateur');
    });
  };

  const copyCodeToClipboard = () => {
    // TODO: Implémenter avec react-native-clipboard
    Alert.alert('Code copié', exportCode);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>‹ Retour</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.conversationCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {conversation.name ? conversation.name.charAt(0).toUpperCase() : '?'}
          </Text>
        </View>
        <Text style={styles.conversationName}>
          {conversation.name || conversation.address}
        </Text>
        <Text style={styles.conversationMeta}>
          {messages.length} messages
        </Text>
      </View>

      {!exportCode ? (
        <>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>📤 Prêt à exporter</Text>
            <Text style={styles.infoText}>
              Vos messages seront uploadés de manière sécurisée vers Firebase.
              Un code unique sera généré pour importer vos messages sur chatbook.app
            </Text>
            <View style={styles.infoList}>
              <Text style={styles.infoItem}>✓ Données chiffrées</Text>
              <Text style={styles.infoItem}>✓ Code valable 24h</Text>
              <Text style={styles.infoItem}>✓ Suppression automatique</Text>
            </View>
          </View>

          {progress ? (
            <View style={styles.progressCard}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.progressText}>{progress}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.exportButton, loading && styles.exportButtonDisabled]}
            onPress={handleExport}
            disabled={loading}
          >
            <Text style={styles.exportButtonText}>
              {loading ? 'Export en cours...' : 'Exporter'}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.successCard}>
            <Text style={styles.successEmoji}>✅</Text>
            <Text style={styles.successTitle}>Export réussi !</Text>
            <Text style={styles.successText}>
              Votre code d'import est prêt
            </Text>
          </View>

          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>Votre code :</Text>
            <View style={styles.codeContainer}>
              <Text style={styles.codeText}>{exportCode}</Text>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={copyCodeToClipboard}
              >
                <Text style={styles.copyButtonText}>📋</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.codeExpiry}>
              ⏰ Valable 24 heures
            </Text>
          </View>

          <View style={styles.optionsCard}>
            <Text style={styles.optionsTitle}>Que faire maintenant ?</Text>
            
            <TouchableOpacity
              style={styles.optionButton}
              onPress={handleOpenBrowser}
            >
              <Text style={styles.optionButtonEmoji}>📱</Text>
              <View style={styles.optionButtonContent}>
                <Text style={styles.optionButtonTitle}>
                  Continuer sur mobile
                </Text>
                <Text style={styles.optionButtonText}>
                  Ouvrir chatbook.app dans le navigateur
                </Text>
              </View>
              <Text style={styles.optionButtonArrow}>›</Text>
            </TouchableOpacity>

            <View style={styles.orDivider}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>OU</Text>
              <View style={styles.orLine} />
            </View>

            <View style={styles.pcOption}>
              <Text style={styles.pcOptionEmoji}>💻</Text>
              <Text style={styles.pcOptionTitle}>Continuer sur PC</Text>
              <Text style={styles.pcOptionText}>
                1. Allez sur <Text style={styles.pcOptionLink}>chatbook.app</Text>
              </Text>
              <Text style={styles.pcOptionText}>
                2. Cliquez sur "Importer" → "Messages iPhone/Android"
              </Text>
              <Text style={styles.pcOptionText}>
                3. Entrez le code : <Text style={styles.pcOptionCode}>{exportCode}</Text>
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.newExportButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.newExportButtonText}>
              Exporter une autre conversation
            </Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 18,
    color: '#3b82f6',
    fontWeight: '600',
  },
  conversationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  conversationName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  conversationMeta: {
    fontSize: 14,
    color: '#6b7280',
  },
  infoCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
    marginBottom: 16,
  },
  infoList: {
    gap: 8,
  },
  infoItem: {
    fontSize: 14,
    color: '#1e40af',
  },
  progressCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  progressText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  exportButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  successCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  successEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#6b7280',
  },
  codeCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#86efac',
  },
  codeLabel: {
    fontSize: 14,
    color: '#166534',
    marginBottom: 12,
    fontWeight: '600',
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  codeText: {
    flex: 1,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    letterSpacing: 4,
    textAlign: 'center',
  },
  copyButton: {
    padding: 8,
  },
  copyButtonText: {
    fontSize: 24,
  },
  codeExpiry: {
    fontSize: 12,
    color: '#166534',
    textAlign: 'center',
  },
  optionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  optionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  optionButtonEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  optionButtonContent: {
    flex: 1,
  },
  optionButtonTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 4,
  },
  optionButtonText: {
    fontSize: 14,
    color: '#3b82f6',
  },
  optionButtonArrow: {
    fontSize: 24,
    color: '#3b82f6',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  orText: {
    marginHorizontal: 12,
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '600',
  },
  pcOption: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  pcOptionEmoji: {
    fontSize: 32,
    marginBottom: 12,
  },
  pcOptionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 12,
  },
  pcOptionText: {
    fontSize: 14,
    color: '#92400e',
    marginBottom: 8,
  },
  pcOptionLink: {
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  pcOptionCode: {
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  newExportButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  newExportButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
});
