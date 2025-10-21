import { Platform } from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';

/**
 * Service pour lire les SMS sur Android
 * Pour iOS, une implémentation différente sera nécessaire
 */

class SMSService {
  /**
   * Récupère toutes les conversations SMS
   * @returns {Promise<Array>} Liste des conversations
   */
  async getConversations() {
    if (Platform.OS !== 'android') {
      // Pour iOS, retourner des données de test pour l'instant
      return this.getMockConversations();
    }

    return new Promise((resolve, reject) => {
      const filter = {
        box: 'inbox', // 'inbox', 'sent', 'draft', 'outbox', 'failed', 'queued'
        indexFrom: 0,
        maxCount: 1000,
      };

      SmsAndroid.list(
        JSON.stringify(filter),
        (fail) => {
          console.error('Erreur lecture SMS:', fail);
          reject(new Error('Impossible de lire les SMS'));
        },
        (count, smsList) => {
          try {
            const messages = JSON.parse(smsList);
            const conversations = this.groupMessagesByConversation(messages);
            resolve(conversations);
          } catch (error) {
            console.error('Erreur parsing SMS:', error);
            reject(error);
          }
        }
      );
    });
  }

  /**
   * Groupe les messages par conversation (numéro de téléphone)
   * @param {Array} messages - Liste des messages
   * @returns {Array} Conversations groupées
   */
  groupMessagesByConversation(messages) {
    const conversationsMap = {};

    messages.forEach(msg => {
      const address = msg.address;
      
      if (!conversationsMap[address]) {
        conversationsMap[address] = {
          id: address,
          address: address,
          name: msg.person || null,
          messages: [],
          messageCount: 0,
          lastMessage: '',
          lastMessageDate: 0,
        };
      }

      conversationsMap[address].messages.push(msg);
      conversationsMap[address].messageCount++;
      
      if (msg.date > conversationsMap[address].lastMessageDate) {
        conversationsMap[address].lastMessageDate = msg.date;
        conversationsMap[address].lastMessage = msg.body;
      }
    });

    // Convertir en tableau et trier par date
    const conversations = Object.values(conversationsMap)
      .map(conv => {
        // Calculer la plage de dates
        const dates = conv.messages.map(m => m.date).sort((a, b) => a - b);
        const firstDate = new Date(dates[0]);
        const lastDate = new Date(dates[dates.length - 1]);
        
        conv.dateRange = this.formatDateRange(firstDate, lastDate);
        
        return conv;
      })
      .sort((a, b) => b.lastMessageDate - a.lastMessageDate);

    return conversations;
  }

  /**
   * Récupère tous les messages d'une conversation
   * @param {string} conversationId - ID de la conversation (numéro de téléphone)
   * @returns {Promise<Array>} Liste des messages
   */
  async getMessagesForConversation(conversationId) {
    if (Platform.OS !== 'android') {
      return this.getMockMessages();
    }

    return new Promise((resolve, reject) => {
      const filter = {
        box: '', // Tous les types de messages
        address: conversationId,
        indexFrom: 0,
        maxCount: 10000,
      };

      SmsAndroid.list(
        JSON.stringify(filter),
        (fail) => {
          console.error('Erreur lecture messages:', fail);
          reject(new Error('Impossible de lire les messages'));
        },
        (count, smsList) => {
          try {
            const messages = JSON.parse(smsList);
            // Trier par date
            messages.sort((a, b) => a.date - b.date);
            resolve(messages);
          } catch (error) {
            console.error('Erreur parsing messages:', error);
            reject(error);
          }
        }
      );
    });
  }

  /**
   * Formate une plage de dates
   * @param {Date} start - Date de début
   * @param {Date} end - Date de fin
   * @returns {string} Plage formatée
   */
  formatDateRange(start, end) {
    const startStr = start.toLocaleDateString('fr-FR', { 
      month: 'short', 
      year: 'numeric' 
    });
    const endStr = end.toLocaleDateString('fr-FR', { 
      month: 'short', 
      year: 'numeric' 
    });

    if (startStr === endStr) {
      return startStr;
    }

    return `${startStr} - ${endStr}`;
  }

  /**
   * Données de test pour iOS (en attendant l'implémentation)
   */
  getMockConversations() {
    return [
      {
        id: '1',
        address: '+33612345678',
        name: 'Marie',
        messageCount: 156,
        lastMessage: 'À plus tard !',
        lastMessageDate: Date.now() - 3600000,
        dateRange: 'Jan 2024 - Oct 2024',
      },
      {
        id: '2',
        address: '+33687654321',
        name: 'Thomas',
        messageCount: 89,
        lastMessage: 'Ok super !',
        lastMessageDate: Date.now() - 86400000,
        dateRange: 'Mar 2024 - Oct 2024',
      },
    ];
  }

  getMockMessages() {
    return [
      {
        id: 1,
        body: 'Salut ! Comment ça va ?',
        date: Date.now() - 3600000,
        type: 1, // received
        address: '+33612345678',
      },
      {
        id: 2,
        body: 'Ça va super ! Et toi ?',
        date: Date.now() - 3000000,
        type: 2, // sent
        address: '+33612345678',
      },
    ];
  }
}

// Singleton
let smsServiceInstance = null;

export function getSmsService() {
  if (!smsServiceInstance) {
    smsServiceInstance = new SMSService();
  }
  return smsServiceInstance;
}

export default SMSService;
