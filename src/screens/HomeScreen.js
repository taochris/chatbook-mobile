import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  ImageBackground,
  TextInput,
  FlatList,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Contacts from 'react-native-contacts';

export default function HomeScreen({ navigation }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState([]);
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = contacts.filter(c => 
        c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phoneNumbers.some(p => p.number.includes(searchQuery))
      ).slice(0, 10);
      setFilteredContacts(filtered);
    } else {
      setFilteredContacts([]);
    }
  }, [searchQuery, contacts]);

  const loadContacts = async () => {
    if (Platform.OS !== 'android') return;
    
    try {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS
      );
      
      if (permission === PermissionsAndroid.RESULTS.GRANTED) {
        setLoading(true);
        const allContacts = await Contacts.getAll();
        const withPhone = allContacts.filter(c => c.phoneNumbers && c.phoneNumbers.length > 0);
        setContacts(withPhone);
        setLoading(false);
      }
    } catch (err) {
      console.error('Erreur chargement contacts:', err);
      setLoading(false);
    }
  };

  const handleSelectContact = (contact) => {
    const contactPhones = (contact.phoneNumbers || [])
      .map((p) => p?.number)
      .filter(Boolean);
    const phone = contactPhones[0];
    if (phone) {
      navigation.navigate('Export', { 
        contactName: contact.displayName,
        contactPhone: phone,
        contactPhones,
      });
    }
  };

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../assets/bg-illustration.png')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
          <StatusBar barStyle="dark-content" backgroundColor="#e5e7eb" />
      
      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.logo}>📖</Text>
        <Text style={styles.title}>Chatbook Export</Text>
        <Text style={styles.subtitle}>
          Transformez vos conversations en souvenirs
        </Text>
      </View>

      {/* Recherche de contact */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchLabel}>Rechercher un contact à exporter</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Nom ou numéro de téléphone..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
        
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#34d399" />
            <Text style={styles.loadingText}>Chargement des contacts...</Text>
          </View>
        )}
        
        {filteredContacts.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <FlatList
              data={filteredContacts}
              keyExtractor={(item) => item.recordID}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.suggestionItem}
                  onPress={() => handleSelectContact(item)}
                >
                  <View style={styles.suggestionIcon}>
                    <Text style={styles.suggestionIconText}>
                      {item.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.suggestionContent}>
                    <Text style={styles.suggestionName}>{item.displayName}</Text>
                    <Text style={styles.suggestionPhone}>
                      {item.phoneNumbers[0]?.number}
                    </Text>
                  </View>
                  <Text style={styles.suggestionArrow}>→</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

        </ScrollView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e5e7eb',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: 'rgba(229, 231, 235, 0.7)',
  },
  header: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 28,
  },
  logo: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#065f46',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  primaryButton: {
    backgroundColor: '#6ee7b7',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    borderWidth: 2,
    borderColor: '#34d399',
    marginHorizontal: 16,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#065f46',
    fontSize: 17,
    fontWeight: '700',
    marginRight: 8,
  },
  primaryButtonIcon: {
    color: '#065f46',
    fontSize: 18,
    fontWeight: 'bold',
  },
  searchContainer: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  searchLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#065f46',
    marginBottom: 10,
    textAlign: 'center',
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1f2937',
    borderWidth: 2,
    borderColor: '#34d399',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#6b7280',
  },
  suggestionsContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginTop: 10,
    maxHeight: 300,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  suggestionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#34d399',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  suggestionIconText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  suggestionPhone: {
    fontSize: 13,
    color: '#6b7280',
  },
  suggestionArrow: {
    fontSize: 18,
    color: '#34d399',
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#34d399',
    marginHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#065f46',
    fontSize: 15,
    fontWeight: '600',
  },
});
