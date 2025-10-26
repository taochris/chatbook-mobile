import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';

export default function GuideScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />

      <Text style={styles.title}>Guide d'utilisation</Text>

      {/* Comment ça marche */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📖 Comment ça marche ?</Text>
        <Text style={styles.text}>
          1. Sélectionnez vos conversations SMS{'\n'}
          2. Choisissez les contenus à inclure (texte, images, audios){'\n'}
          3. Cliquez sur "Exporter"{'\n'}
          4. Vous recevrez un code 6 caractères{'\n'}
          5. Utilisez ce code sur l'app web pour importer vos messages
        </Text>
      </View>

      {/* Permissions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔒 Permissions requises</Text>
        <Text style={styles.text}>
          • <Text style={styles.bold}>Accès aux SMS</Text> : pour lire vos messages{'\n'}
          • <Text style={styles.bold}>Accès aux photos</Text> : pour inclure les images{'\n'}
          • <Text style={styles.bold}>Accès aux audios</Text> : pour inclure les vocapsules
        </Text>
      </View>

      {/* Limites */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚠️ Limites</Text>
        <Text style={styles.text}>
          • Les audios sont limités à <Text style={styles.bold}>500 MB</Text>{'\n'}
          • Les images n'ont pas de limite{'\n'}
          • Les codes d'export sont valables <Text style={styles.bold}>24 heures</Text>{'\n'}
          • Après 24h, les données sont automatiquement supprimées
        </Text>
      </View>

      {/* Sécurité */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🛡️ Sécurité & Confidentialité</Text>
        <Text style={styles.text}>
          • Vos données ne sont <Text style={styles.bold}>jamais stockées</Text> sur votre téléphone{'\n'}
          • Les données sont <Text style={styles.bold}>chiffrées</Text> en transit{'\n'}
          • Suppression automatique après 24 heures{'\n'}
          • Aucun suivi de vos messages
        </Text>
      </View>

      {/* FAQ */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>❓ Questions fréquentes</Text>
        
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>Puis-je exporter plusieurs conversations ?</Text>
          <Text style={styles.faqAnswer}>Oui, sélectionnez autant de conversations que vous le souhaitez.</Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>Que se passe-t-il après l'export ?</Text>
          <Text style={styles.faqAnswer}>Vous recevrez un code 6 caractères à utiliser sur l'app web pour importer vos messages.</Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>Mes messages sont-ils sécurisés ?</Text>
          <Text style={styles.faqAnswer}>Oui, vos données sont chiffrées et supprimées automatiquement après 24 heures.</Text>
        </View>
      </View>
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
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  text: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 22,
  },
  bold: {
    fontWeight: '600',
    color: '#1f2937',
  },
  faqItem: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  faqQuestion: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 6,
  },
  faqAnswer: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 20,
  },
});
